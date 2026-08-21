/**
 * خدمة كتالوج الطرف‑الصنف (SAP-2 · ف‑٦) — الكتابة والقراءة على Firestore.
 * كلّ الحكم في `itemPartnerCatalog.js` الخالص المُختبَر؛ هنا الجلب والحفظ.
 *
 * ⚠️ قاعدة المجموعة مكتوبة في `firestore.rules` وغير منشورة (§3-١٠ ‹49›)
 * — النشر قرار المالك (قرار‑٥). قبل النشر: كلّ كتابةٍ حيّة سترفضها القاعدة.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  query,
  where,
  limit as fsLimit,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import {
  CATALOG_COLLECTION,
  catalogEntryId,
  catalogEntryVerdict,
} from './itemPartnerCatalog.js';
import { connectedPartnerPlan, CONNECTED_FIELD } from './connectedPartner.js';
import { getPartner, partnerCollection, normalizePartnerCode } from './partnerService.js';
import { getItem } from '../items/itemService.js';
import { normalizeItemCode } from '../items/itemIdentity.js';

/** من يكتب الكتالوج؟ المديران — تطابق `isManager` في firestore.rules. */
export const CATALOG_EDIT_ROLES = ['admin', 'warehouse_manager'];
export function canEditCatalog(role) {
  return CATALOG_EDIT_ROLES.includes(role);
}

/**
 * حفظ سجلّ كتالوج (إنشاءً أو تحديثًا — المعرّف حتميّ فالإعادة تحديث).
 *
 * يتحقّق قبل الكتابة أنّ الطرف والصنف **موجودان فعلًا** في الماسترَين —
 * فسجلُّ علاقةٍ إلى طرفٍ أو صنفٍ لا وجود له كذبةٌ تنتظر من يصدّقها
 * (§21-٤: البحث يعيد الصنف الداخليّ الصحيح — فليكن صحيحًا يوم يُكتب).
 */
export async function upsertCatalogEntry(raw) {
  const verdict = catalogEntryVerdict(raw);
  if (!verdict.ok) {
    const err = new Error('لا يُحفظ:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const entry = verdict.entry;

  const [partner, item] = await Promise.all([
    getPartner(entry.partnerType, entry.partnerCode),
    getItem(entry.sku),
  ]);
  if (!partner) throw new Error(`لا ${entry.partnerType === 'supplier' ? 'مورّد' : 'عميل'} بالرمز «${entry.partnerCode}» — سجّل البطاقة أولًا.`);
  if (!item) throw new Error(`لا صنف بالكود «${entry.sku}» — الكتالوج يربط ولا يُنشئ (SR-50).`);

  const id = catalogEntryId(entry);
  await setDoc(
    doc(db, CATALOG_COLLECTION, id),
    { ...entry, partnerName: partner.nameAr || '', updatedAt: serverTimestamp() },
    { merge: true }
  );
  return id;
}

/** اشتراك لحظيّ بسجلّات صنفٍ واحد — لبطاقة الصنف. */
export function subscribeCatalogForItem(sku, onChange, onError) {
  const want = normalizeItemCode(sku);
  if (!want) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, CATALOG_COLLECTION), where('sku', '==', want));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/**
 * ★ §21-٤: البحث بكود الطرف يعيد الصنف الداخليّ الصحيح — ولا يُنشئ شيئًا.
 * @returns {Promise<{item:object, entry:object}|null>}
 */
export async function lookupItemByPartnerCode({ partnerType, partnerCode, code }) {
  const type = String(partnerType ?? '').trim().toLowerCase();
  const partner = normalizePartnerCode(partnerCode);
  const wanted = String(code ?? '').trim().toUpperCase();
  if (!type || !partner || !wanted) return null;

  const snap = await getDocs(query(
    collection(db, CATALOG_COLLECTION),
    where('partnerType', '==', type),
    where('partnerCode', '==', partner),
    where('partnerItemCode', '==', wanted),
    fsLimit(1)
  ));
  if (snap.empty) return null;
  const entry = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const item = await getItem(entry.sku);
  return item ? { item, entry } : null;
}

/**
 * الربط المتبادل بين بطاقتَي المورد والعميل (ف‑٧): الخطّة من المنطق الخالص،
 * والكتابة دفعةً واحدة — فلا تشير بطاقةٌ لمن لا يشير إليها.
 * يرفض ربط بطاقةٍ لا وجود لها.
 */
export async function setConnectedPartner(kind, code, nextOther) {
  const self = await getPartner(kind, code);
  if (!self) throw new Error(`لا بطاقة بالرمز «${code}»`);
  const next = normalizePartnerCode(nextOther);
  if (next) {
    const otherKind = kind === 'supplier' ? 'customer' : 'supplier';
    const target = await getPartner(otherKind, next);
    if (!target) {
      throw new Error(`لا ${otherKind === 'customer' ? 'عميل' : 'مورّد'} بالرمز «${next}» — الربط لبطاقةٍ قائمة لا يُنشئها.`);
    }
  }

  const { writes } = connectedPartnerPlan(kind, self.code, self[CONNECTED_FIELD] || '', next);
  if (!writes.length) return { changed: false };

  const batch = writeBatch(db);
  for (const w of writes) {
    // المرآة القديمة قد تكون حُذف رمزها من قبل — نتخطّى الممحوّ بهدوء.
    if (w.value === '' && w.code !== self.code) {
      const exists = await getDoc(doc(db, partnerCollection(w.kind), w.code));
      if (!exists.exists()) continue;
    }
    batch.update(doc(db, partnerCollection(w.kind), w.code), {
      [CONNECTED_FIELD]: w.value,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { changed: true, writes };
}
