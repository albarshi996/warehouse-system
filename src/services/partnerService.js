import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config/firebase.js';
import { shapeImportedPartner } from './partners/partnerShape.js';
import { normalizeStatus } from './items/itemStatus.js';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Partner Master — ماستر شركاء الأعمال: الموردون والعملاء (§15.2/15.3).
 * ═══════════════════════════════════════════════════════════════════
 *
 * **المفهوم:** الموردون والعملاء **توأمان** — نفس البنية والحقول والمنطق —
 * فخدمةٌ واحدة تخدمهما، يفرّق بينهما `kind` ('supplier' | 'customer') الذي
 * يختار المجموعة. لا نسختان تتباعدان (نفس درس مصدر الهيكل الواحد).
 *
 * **الهوية:** رمز الشريك (BP Code) = معرّف المستند، uppercase — ويطابق مرجع
 * `res.partner` في أودو لاحقًا (Odoo-Ready).
 *
 * **الأرصدة (قرار المالك §19#3):** `accountBalance`/`openOrders`/`openDeliveries`
 * **افتتاحيّة للعرض** — لقطةٌ من الاستيراد لا محرّك تسوية.
 *
 * **لا حذف:** الأرشفة (`archived`) لا المحو — فمورّدٌ أو عميلٌ استُعمل في مستندٍ
 * يبقى أثره. القاعدة تمنع الحذف بنيويًّا (`allow delete: if false`).
 */

const COLLECTIONS = { supplier: 'Suppliers_Master', customer: 'Customers_Master' };

/** اسم مجموعة الشريك، أو خطأ إن كان النوع مجهولًا. */
export function partnerCollection(kind) {
  const name = COLLECTIONS[kind];
  if (!name) throw new Error(`نوع شريك غير معروف: «${kind}» — المتوقّع supplier أو customer`);
  return name;
}

/** يُطبّع رمز الشريك إلى الصيغة القياسية المستعملة معرّفًا للمستند. */
export const normalizePartnerCode = (raw) => String(raw ?? '').trim().toUpperCase();

/**
 * اشتراك لحظيّ بمجموعة شركاء. يُعيد دالّة إلغاء الاشتراك.
 * @param {'supplier'|'customer'} kind
 */
export const subscribePartners = (kind, onChange, onError, { includeArchived = false } = {}) => {
  const q = query(collection(db, partnerCollection(kind)), orderBy('code'));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data());
      onChange(includeArchived ? rows : rows.filter((r) => !r.archived));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
};

/** يقرأ شريكًا واحدًا برمزه. يُعيد null إن لم يوجد. */
export const getPartner = async (kind, code) => {
  const id = normalizePartnerCode(code);
  if (!id) return null;
  const snap = await getDoc(doc(db, partnerCollection(kind), id));
  return snap.exists() ? snap.data() : null;
};

/** يُنشئ شريكًا جديدًا. يرفض الرمز الفارغ أو المستخدَم (لا دهس صامت). */
export const createPartner = async (kind, { code, nameAr, ...rest }) => {
  const id = normalizePartnerCode(code);
  if (!id) throw new Error('رمز الشريك (BP Code) مطلوب');
  if (!nameAr || !String(nameAr).trim()) throw new Error('اسم الشريك مطلوب');

  const ref = doc(db, partnerCollection(kind), id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`الرمز «${id}» مستخدم بالفعل للاسم «${existing.data().nameAr}».`);
  }

  await setDoc(ref, {
    code: id,
    nameAr: String(nameAr).trim(),
    ...shapeImportedPartner(rest),
    archived: rest?.status !== undefined && rest.status !== '' ? normalizeStatus(rest.status) : false,
    odooM2oId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/** حجم دفعة Firestore الأقصى. */
const BATCH_LIMIT = 500;

/**
 * كتابة دفعية للشركاء المستوردين من الشيت. `merge: true` عمدًا — إعادة استيراد
 * شيتٍ محدَّث تُحدّث القائم ولا تُنشئ نسخًا ولا تمحو حقولًا لم يذكرها الشيت.
 * الصفّ بلا رمز لا يُكتب (الرمز معرّف المستند) — يُعدّ ويُعاد للمستدعي.
 *
 * @param {'supplier'|'customer'} kind
 * @param {object[]} rows صفوف مطابقة لمخطّط الشركاء (من excelImport)
 * @param {{ existingByCode?: Map<string,object> }} [opts]
 * @returns {Promise<{ created:number, updated:number, skipped:number }>}
 */
export const upsertPartners = async (kind, rows, { existingByCode = new Map() } = {}) => {
  const col = partnerCollection(kind);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const raw of rows.slice(i, i + BATCH_LIMIT)) {
      const id = normalizePartnerCode(raw.code);
      if (!id) {
        skipped++;
        continue;
      }
      const prior = existingByCode.get(id);
      const payload = {
        code: id,
        nameAr: String(raw.nameAr ?? '').trim(),
        ...shapeImportedPartner(raw),
        updatedAt: serverTimestamp(),
      };
      // «الحالة» في الشيت تُترجَم إلى `archived` (اسمان لمعنى واحد).
      if (raw.status !== undefined && raw.status !== '') {
        payload.archived = normalizeStatus(raw.status);
      }
      if (!prior) {
        if (payload.archived === undefined) payload.archived = false;
        payload.odooM2oId = null;
        payload.createdAt = serverTimestamp();
        created++;
      } else {
        updated++;
      }
      batch.set(doc(db, col, id), payload, { merge: true });
    }
    await batch.commit();
  }
  return { created, updated, skipped };
};

/** يعدّل شريكًا قائمًا. الرمز لا يتغيّر (لإعادة تسميته: أرشِف القديم وأنشئ جديدًا). */
export const updatePartner = async (kind, code, patch) => {
  const id = normalizePartnerCode(code);
  if (!id) throw new Error('رمز الشريك مطلوب');

  const next = { ...patch };
  delete next.code;
  delete next.createdAt;

  const shaped = shapeImportedPartner(next);
  if ('nameAr' in next) shaped.nameAr = String(next.nameAr).trim();
  if ('status' in next && next.status !== '') shaped.archived = normalizeStatus(next.status);

  await updateDoc(doc(db, partnerCollection(kind), id), { ...shaped, updatedAt: serverTimestamp() });
};

/** أرشفة ناعمة: يُخفى الشريك من القوائم الافتراضية ولا يُمحى. */
export const archivePartner = async (kind, code) =>
  updateDoc(doc(db, partnerCollection(kind), normalizePartnerCode(code)), { archived: true, updatedAt: serverTimestamp() });

/** عكس الأرشفة. */
export const unarchivePartner = async (kind, code) =>
  updateDoc(doc(db, partnerCollection(kind), normalizePartnerCode(code)), { archived: false, updatedAt: serverTimestamp() });
