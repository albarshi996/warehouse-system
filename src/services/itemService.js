import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit as fsLimit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { normalizeBarcode } from './excel/excelSchema.js';
import { normalizeStatus } from './items/itemStatus.js';

export { normalizeStatus };

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Item Master — مصدر الحقيقة الواحد للأصناف في البوابة كلّها.
 * ═══════════════════════════════════════════════════════════════════
 *
 * **المفهوم:** الصنف يُعرَّف مرّة واحدة هنا، ويُستدعى بالباركود من كل مكان:
 * الجرد · بنود الاستلام · وكل مستند مخزني قادم. لا شاشة تعرّف صنفًا لنفسها.
 *
 * **الهوية (قرار المالك 2026-07-15):**
 *   المعرّف = **كود الصنف (SKU)** — ويطابق `default_code` في أودو، فلا يُعاد
 *   بناء شيء عند الربط (S8). أمّا **الباركود فهو فهرس استدعاء لا هوية**:
 *   `barcodes[]` قائمة، لأن الصنف الواحد قد يحمل أكثر من باركود (عبوة قديمة
 *   وجديدة، أو مورّدان مختلفان) — وهو شائع في مواد التجميل.
 *
 * **الرصيد (قرار المالك 2026-07-15):** مصدره **الشيت** — الاستيراد يضبط
 * «الكمية الدفترية» والجرد يقارن بها. لا يحرّكه أي مستند اليوم؛ تحريكه
 * بالمستندات خطوة لاحقة مستقلّة. سابقًا كانت الواجهة تعد الموظّف بأن الرصيد
 * «يتحدث تلقائياً عبر سندات الاستلام/الصرف» — ولم يكن أي كود يفعل ذلك.
 *
 * شكل المستند:
 * {
 *   sku:         string    // = معرّف المستند، uppercase (= default_code)
 *   barcodes:    string[]  // مطبَّعة؛ فهرس الاستدعاء (= barcode في أودو)
 *   nameAr:      string    // إلزامي
 *   nameEn:      string
 *   shade:       string    // الظل/اللون
 *   category:    string
 *   subcategory: string
 *   unit:        string    // 'piece' | 'box' | …
 *   unitPrice:   number
 *   balance:     number    // الكمية الدفترية — مصدرها الشيت
 *   minStock:    number
 *   notes:       string
 *   archived:    boolean
 *   odooId:      number|null
 *   createdAt / updatedAt: Timestamp
 * }
 */

const COLLECTION = 'Items_Master';

/** Normalize a user-entered SKU into the canonical form used as the doc id. */
export const normalizeSku = (raw) =>
  String(raw ?? '')
    .trim()
    .toUpperCase();

export { normalizeBarcode };

/**
 * يُطبّع قائمة باركودات: يزيل الفراغ والتكرار.
 * التطبيع حاسم — الماسح يقرأ `8059692040599` والشيت قد يحمل `8059-692-040599`.
 */
export const normalizeBarcodes = (list) => [
  ...new Set((Array.isArray(list) ? list : [list]).map(normalizeBarcode).filter(Boolean)),
];

/**
 * Subscribe to the items collection in real time. Returns the `unsubscribe`
 * function — caller is responsible for invoking it on cleanup.
 *
 * @param {(items: object[]) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @param {{ includeArchived?: boolean }} [opts]
 */
export const subscribeItems = (onChange, onError, { includeArchived = false } = {}) => {
  const q = query(collection(db, COLLECTION), orderBy('sku'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data());
      onChange(includeArchived ? items : items.filter((it) => !it.archived));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
};

/** يقرأ صنفًا واحدًا بكوده. يُعيد null إن لم يوجد. */
export const getItem = async (sku) => {
  const id = normalizeSku(sku);
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? snap.data() : null;
};

/**
 * ★ **نقطة الاستدعاء الواحدة: باركود ← صنف.**
 *
 * هذه هي الدالة التي تجعل الماستر «مصدرًا يُعمل به في كافة البوابة»: تستدعيها
 * شاشة الجرد وبنود الاستلام وكل مستند مخزني — فلا تُعيد أي شاشة اختراع البحث.
 * قبل اليوم كان البحث الوحيد يجري على مصفوفة في ذاكرة المتصفّح تموت بإغلاقه.
 *
 * تبحث في `barcodes` (array-contains — يُفهرسه Firestore تلقائيًّا)، وإن أخفقت
 * تُجرّب الكود نفسه كـSKU، لأن الموظّف قد يكتب كود الصنف بدل مسح الباركود.
 *
 * @returns {Promise<object|null>} الصنف، أو null إن كان الباركود مجهولًا.
 */
export const lookupByBarcode = async (code) => {
  const needle = normalizeBarcode(code);
  if (!needle) return null;

  const snap = await getDocs(
    query(collection(db, COLLECTION), where('barcodes', 'array-contains', needle), fsLimit(1))
  );
  if (!snap.empty) return snap.docs[0].data();

  // مهرب: الباركود المكتوب قد يكون كود الصنف نفسه.
  return getItem(needle);
};

/**
 * Create a brand-new item. Throws if `sku` is empty or already exists.
 *
 * ⚠️ أُصلح 2026-07-15: كان التعليق يزعم أنه «يفشل إن كان SKU مستخدمًا»، بينما
 * `setDoc` بلا merge **يدهس الصنف الموجود صامتًا ويُصفّر رصيده**. الآن يفحص
 * الوجود فعلًا ويرفض — كما وُعد دائمًا.
 */
export const createItem = async ({
  sku,
  nameAr,
  nameEn = '',
  shade = '',
  category = '',
  subcategory = '',
  unit = 'piece',
  unitPrice = 0,
  balance = 0,
  minStock = 0,
  notes = '',
  barcodes = [],
}) => {
  const id = normalizeSku(sku);
  if (!id) throw new Error('SKU is required');
  if (!nameAr || !nameAr.trim()) throw new Error('Arabic name is required');

  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`الكود «${id}» مستخدم بالفعل للصنف «${existing.data().nameAr}».`);
  }

  await setDoc(ref, {
    sku: id,
    barcodes: normalizeBarcodes(barcodes),
    nameAr: nameAr.trim(),
    nameEn: nameEn.trim(),
    shade: String(shade).trim(),
    category: category.trim(),
    subcategory: String(subcategory).trim(),
    unit,
    unitPrice: Number(unitPrice) || 0,
    balance: Number(balance) || 0,
    minStock: Number(minStock) || 0,
    notes: String(notes).trim(),
    archived: false,
    odooId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/** حجم دفعة Firestore الأقصى. */
const BATCH_LIMIT = 500;

/**
 * كتابة دفعية للأصناف المستوردة من الشيت.
 *
 * `merge: true` عمدًا: إعادة استيراد شيت محدَّث **تُحدّث** الأصناف القائمة ولا
 * تُنشئ نسخًا ولا تمسح حقولًا لم يذكرها الشيت. والباركودات **تُضمّ** لا
 * تُستبدل — فشيتٌ يحمل باركودًا واحدًا لا يمحو باركودًا ثانيًا عُرف سابقًا.
 *
 * @param {object[]} items صفوف مطابقة لمخطّط الأصناف (من excelImport)
 * @param {{ existingBySku?: Map<string,object> }} [opts] الأصناف الحالية لضمّ الباركودات
 * @returns {Promise<{ created:number, updated:number }>}
 */
export const upsertItems = async (items, { existingBySku = new Map() } = {}) => {
  let created = 0;
  let updated = 0;

  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const raw of items.slice(i, i + BATCH_LIMIT)) {
      const id = normalizeSku(raw.sku);
      if (!id) continue;
      const prior = existingBySku.get(id);
      const payload = {
        sku: id,
        barcodes: normalizeBarcodes([...(prior?.barcodes || []), ...(raw.barcodes || [])]),
        nameAr: String(raw.nameAr ?? '').trim(),
        updatedAt: serverTimestamp(),
      };
      // الحقول الاختيارية تُكتب فقط إن ذكرها الشيت — فلا يمحو عمودٌ غائب بياناتٍ قائمة.
      for (const [key, cast] of Object.entries(OPTIONAL_CASTS)) {
        if (raw[key] !== undefined && raw[key] !== '') payload[key] = cast(raw[key]);
      }
      // «الحالة» في الشيت تُكتب في `archived` — اسمان مختلفان لمعنى واحد.
      if (raw.status !== undefined && raw.status !== '') {
        payload.archived = normalizeStatus(raw.status);
      }
      if (!prior) {
        if (payload.archived === undefined) payload.archived = false;
        payload.odooId = null;
        payload.createdAt = serverTimestamp();
        created++;
      } else {
        updated++;
      }
      batch.set(doc(db, COLLECTION, id), payload, { merge: true });
    }
    await batch.commit();
  }
  return { created, updated };
};

/** كيف يُحوَّل كل حقل اختياري قادم من الشيت. */
const OPTIONAL_CASTS = {
  nameEn: (v) => String(v).trim(),
  shade: (v) => String(v).trim(),
  category: (v) => String(v).trim(),
  subcategory: (v) => String(v).trim(),
  unit: (v) => normalizeUnit(v),
  unitPrice: (v) => Number(v) || 0,
  balance: (v) => Number(v) || 0,
  minStock: (v) => Number(v) || 0,
  notes: (v) => String(v).trim(),
};

/**
 * Patch an existing item. SKU cannot be changed — to rename, archive the old
 * one and create a new one.
 *
 * @param {string} sku
 * @param {object} patch
 */
export const updateItem = async (sku, patch) => {
  const id = normalizeSku(sku);
  if (!id) throw new Error('SKU is required');

  const next = { ...patch };
  delete next.sku;
  delete next.createdAt;
  if ('balance' in next) next.balance = Number(next.balance) || 0;
  if ('minStock' in next) next.minStock = Number(next.minStock) || 0;
  if ('unitPrice' in next) next.unitPrice = Number(next.unitPrice) || 0;
  if ('nameAr' in next) next.nameAr = String(next.nameAr).trim();
  if ('nameEn' in next) next.nameEn = String(next.nameEn).trim();
  if ('category' in next) next.category = String(next.category).trim();
  if ('subcategory' in next) next.subcategory = String(next.subcategory).trim();
  if ('shade' in next) next.shade = String(next.shade).trim();
  if ('notes' in next) next.notes = String(next.notes).trim();
  if ('unit' in next) next.unit = normalizeUnit(next.unit);
  if ('barcodes' in next) next.barcodes = normalizeBarcodes(next.barcodes);

  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...next, updatedAt: serverTimestamp() });
};

/** Soft-delete: flip `archived` to true. Item is hidden from default lists. */
export const archiveItem = async (sku) => {
  const ref = doc(db, COLLECTION, normalizeSku(sku));
  await updateDoc(ref, { archived: true, updatedAt: serverTimestamp() });
};

/** Reverse `archiveItem`. */
export const unarchiveItem = async (sku) => {
  const ref = doc(db, COLLECTION, normalizeSku(sku));
  await updateDoc(ref, { archived: false, updatedAt: serverTimestamp() });
};

/** Common units used in the Brandzo catalogue. Extend as needed. */
export const UNIT_OPTIONS = [
  { value: 'piece', labelAr: 'قطعة' },
  { value: 'box', labelAr: 'كرتون' },
  { value: 'pack', labelAr: 'علبة' },
  { value: 'kg', labelAr: 'كيلوجرام' },
  { value: 'litre', labelAr: 'لتر' },
  { value: 'metre', labelAr: 'متر' },
];

/** مرادفات الوحدات كما تُكتب فعلًا في الشيتات العربية. */
const UNIT_ALIASES = {
  piece: ['piece', 'pcs', 'pc', 'unit', 'each', 'ea', 'قطعة', 'قطع', 'حبة', 'حبات', 'وحدة'],
  box: ['box', 'carton', 'ctn', 'كرتون', 'كرتونة', 'صندوق', 'كارتون'],
  pack: ['pack', 'pk', 'packet', 'علبة', 'عبوة', 'باكيت', 'طقم'],
  kg: ['kg', 'kgs', 'kilo', 'kilogram', 'كيلو', 'كجم', 'كيلوجرام', 'كيلوغرام'],
  litre: ['litre', 'liter', 'l', 'ltr', 'لتر', 'لتره'],
  metre: ['metre', 'meter', 'm', 'mtr', 'متر', 'أمتار'],
};

/**
 * يحوّل وحدةً مكتوبة بأي صيغة إلى القيمة القياسية.
 *
 * ضروري لأن الشيت يكتب «قطعة» بينما التخزين والواجهة وأودو يتعاملون بـ`piece`.
 * بلا هذا التحويل تدخل الوحدات نصًّا عربيًّا حرًّا فتنهار القوائم والمقارنات.
 * ما لا يُعرف يبقى كما هو (خير من طمسه) — والافتراضي `piece` للفارغ.
 */
export function normalizeUnit(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'piece';
  for (const [value, aliases] of Object.entries(UNIT_ALIASES)) {
    if (value === s || aliases.includes(s)) return value;
  }
  return String(raw).trim();
}

/** الاسم العربي للوحدة (للعرض والطباعة). */
export function unitLabel(value) {
  return UNIT_OPTIONS.find((u) => u.value === value)?.labelAr || value || '';
}

