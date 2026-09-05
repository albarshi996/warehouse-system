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
import { db } from '../../config/firebase.js';
import { normalizeBarcode, barcodeLookupVariants } from '../excel/excelSchema.js';
import { normalizeStatus } from './itemStatus.js';
import { shapeImportedItem, normalizeUnit } from './itemShape.js';
import { assertNewItemIdentity, normalizeSubstitutes } from './itemIdentity.js';
import { CACHE_KEY, packCache, unpackCache, isFresh, selectItems } from './itemCache.js';

export { normalizeStatus, normalizeUnit };

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
 *   substitutes: string[]  // SAP-1 (ف‑٣) — أكواد أصنافٍ بديلة مطبَّعة
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

/* ═══════════════════════════════════════════════════════════════════════════
 *  ذاكرةُ الكتالوج — قراءةٌ واحدةٌ بدل ١١٧٣ في كلّ شاشة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══ العطبُ الذي وُجدت لأجله (لوحة Firebase 2026-09-05) ═══
 * `subscribeItems` كان يفتح مستمعًا حيًّا على **١١٧٣ صنفًا** في كلّ استدعاء،
 * ويُستدعى من **١٦ شاشة**. والبوّابةُ صفحاتٌ منفصلة، فكلُّ انتقالٍ إعادةُ
 * تحميلٍ كاملة ⇒ إعادةُ قراءةِ الكتالوج كلِّه.
 *   ١١٧٣ × ٥٢ فتحةً = **٦١٠٠٠ قراءة** — والحدُّ المجّانيّ ٥٠٠٠٠.
 * فنفدت الحصّةُ عصرًا وتوقّفت القراءات، وفي الغد جرد.
 *
 * ★★★ والدليلُ أنّ العلّةَ قراءةٌ لا كتابة: **٦١ ألفَ قراءةٍ مقابل ٣٦ كتابة**.
 *
 * ═══ والعلاج ═══
 * الكتالوجُ يتغيّر نادرًا، فيُقرأ **مرّةً** ويُخدَم من الذاكرة والقرص.
 * والقراءةُ من القرص لا تُحسب في الحصّة.
 *   · ذاكرةٌ واحدةٌ مشتركةٌ للصفحة كلِّها — ١٦ مشتركًا بقراءةٍ واحدة.
 *   · و`localStorage` يعبر بها إعادةَ التحميل — فالانتقالُ بين الشاشات مجّانيّ.
 *   · وكلُّ كتابةٍ تُبطلها فورًا، فلا يرى أحدٌ كتالوجًا قديمًا بعد تعديله.
 *
 * ⚠️ والتغييرُ في السلوك مقصودٌ ومحدود: لا تصل تعديلاتُ **مستخدمٍ آخر** حيّةً
 *    إلى شاشةٍ مفتوحة. ومن يحتاج ذلك فعلًا يطلبه بـ`{ live: true }` —
 *    وشاشةُ إدارة الأصناف وحدَها تفعل.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** كلُّ الأصناف بما فيها المؤرشفة — والترشيحُ عند التسليم. */
let allItems = null;
let loadedAt = 0;
let inflight = null;

/** المشتركون: `{ cb, includeArchived }`. */
const listeners = new Set();

/** `localStorage` غائبٌ في بناء Astro على الخادم، ومحظورٌ في التصفّح الخاصّ. */
function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored() {
  const s = storage();
  if (!s) return null;
  try {
    return unpackCache(s.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeStored(items) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(CACHE_KEY, packCache(items, Date.now()));
  } catch {
    // ممتلئٌ أو محظور — الذاكرةُ في الصفحة تكفي، ولا يُسقط هذا شيئًا.
  }
}

function emitAll() {
  for (const l of listeners) {
    try {
      l.cb(selectItems(allItems, l.includeArchived));
    } catch {
      // مشتركٌ يرمي لا يُسقط البقيّة.
    }
  }
}

async function fetchAll() {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('sku')));
  return snap.docs.map((d) => d.data());
}

/** يضمن وجودَ كتالوجٍ طازج. الطلباتُ المتزامنةُ تشترك في قراءةٍ واحدة. */
function ensureLoaded(force = false) {
  const now = Date.now();

  if (!force) {
    if (allItems && isFresh({ at: loadedAt }, now)) return Promise.resolve(allItems);
    if (!allItems) {
      const stored = readStored();
      if (stored && isFresh(stored, now)) {
        allItems = stored.items;
        loadedAt = stored.at;
        return Promise.resolve(allItems);
      }
    }
  }

  if (inflight) return inflight;
  inflight = fetchAll()
    .then((items) => {
      allItems = items;
      loadedAt = Date.now();
      writeStored(items);
      return items;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * يُبطل الذاكرةَ ويُحدّث المشتركين — يُستدعى بعد كلّ كتابةٍ في هذا الملفّ.
 * فمن عدّل صنفًا يراه معدَّلًا في الشاشة التالية بلا انتظار.
 */
export function invalidateItemsCache() {
  allItems = null;
  loadedAt = 0;
  const s = storage();
  if (s) {
    try {
      s.removeItem(CACHE_KEY);
    } catch {
      /* لا يضرّ */
    }
  }
  if (listeners.size) ensureLoaded(true).then(emitAll).catch(() => {});
}

/**
 * Subscribe to the items catalogue. Returns the `unsubscribe` function —
 * caller is responsible for invoking it on cleanup.
 *
 * @param {(items: object[]) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @param {{ includeArchived?: boolean, live?: boolean }} [opts]
 *        `live` يفتح مستمعًا حيًّا (السلوك القديم) — لمن يحتاجه فعلًا وحدَه.
 */
export const subscribeItems = (onChange, onError, { includeArchived = false, live = false } = {}) => {
  if (live) {
    const q = query(collection(db, COLLECTION), orderBy('sku'));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data());
        // المستمعُ الحيُّ يُغذّي الذاكرةَ أيضًا — فتستفيد الشاشاتُ التالية.
        allItems = items;
        loadedAt = Date.now();
        writeStored(items);
        onChange(selectItems(items, includeArchived));
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  const entry = { cb: onChange, includeArchived };
  listeners.add(entry);
  let cancelled = false;

  // ★★ التسليمُ مؤجَّلٌ دائمًا ولو كانت الذاكرةُ حاضرة.
  //    `itemsImportService.fetchExistingOnce` يكتب:
  //      const unsub = subscribeItems((items) => { unsub(); … });
  //    فلو سُلّم متزامنًا لكان `unsub` في منطقة الموت المؤقّت وانهار.
  //    و`onSnapshot` يؤجّل كذلك — فالتأجيلُ حفظٌ للعقد لا زيادةٌ عليه.
  ensureLoaded()
    .then(() => {
      if (!cancelled) onChange(selectItems(allItems, includeArchived));
    })
    .catch((err) => {
      if (!cancelled && onError) onError(err);
    });

  return () => {
    cancelled = true;
    listeners.delete(entry);
  };
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
  // صيغتان: القياسية (بلا أصفار بادئة — طلب المالك: `00251` ≡ `251`)
  // والأساسية كما كُتبت، لالتقاط أصناف خُزّنت قبل اعتماد الإسقاط.
  const variants = barcodeLookupVariants(code);
  if (!variants.length) return null;

  const snap = await getDocs(
    query(collection(db, COLLECTION), where('barcodes', 'array-contains-any', variants), fsLimit(1))
  );
  if (!snap.empty) return snap.docs[0].data();

  // مهرب: الباركود المكتوب قد يكون كود الصنف نفسه.
  for (const v of variants) {
    const hit = await getItem(v);
    if (hit) return hit;
  }
  return null;
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
  itemType = 'sale', // م٣-أ — الافتراض هو سلوك اليوم: بضاعةٌ مخزنيّة تُباع
  substitutes = [], // SAP-1 (ف‑٣) — أكواد أصنافٍ بديلة، تُطبَّع في itemIdentity
  // SAP-3 (وصل محرّك الوحدات): كلّها اختياريّة — الفارغ = سلوك اليوم حرفيًّا.
  baseUom = '', // وحدة الأساس (م٣-ب) — وجودها يُفعّل التحويل لهذا الصنف وحده
  buyUom = '', // وحدة الشراء الافتراضيّة (ف‑٩)
  sellUom = '', // وحدة البيع الافتراضيّة (ف‑٩)
  uomFactors = {}, // معاملات الوحدات المشتقّة { carton: 24 } (ف‑٤٢)
  uomBarcodes = {}, // باركود ⇐ وحدة { '8059…': 'carton' } (ف‑١٠)
}) => {
  // حارس الهويّة (SAP-1 · ف‑١): الكود هو الهويّة — لا صنفَ جديدًا بلا كود.
  const id = assertNewItemIdentity({ sku });
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
    itemType,
    substitutes: normalizeSubstitutes(substitutes, id),
    baseUom: String(baseUom ?? '').trim(),
    buyUom: String(buyUom ?? '').trim(),
    sellUom: String(sellUom ?? '').trim(),
    uomFactors: uomFactors && typeof uomFactors === 'object' ? uomFactors : {},
    uomBarcodes: uomBarcodes && typeof uomBarcodes === 'object' ? uomBarcodes : {},
    archived: false,
    odooId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  invalidateItemsCache();
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
  // الصفوف بلا كود لا يمكن كتابتها (SKU هو معرّف المستند) — تُعدّ وتُعاد
  // للمستدعي بدل إسقاطها صامتةً بينما المعاينة وعدت بأنها «جديدة».
  let skipped = 0;

  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const raw of items.slice(i, i + BATCH_LIMIT)) {
      const id = normalizeSku(raw.sku);
      if (!id) {
        skipped++;
        continue;
      }
      const prior = existingBySku.get(id);
      const payload = {
        sku: id,
        barcodes: normalizeBarcodes([...(prior?.barcodes || []), ...(raw.barcodes || [])]),
        nameAr: String(raw.nameAr ?? '').trim(),
        updatedAt: serverTimestamp(),
      };
      // الحقول الاختيارية تُكتب فقط إن ذكرها الشيت — فلا يمحو عمودٌ غائب بياناتٍ
      // قائمة. التشكيل في وحدة خالصة (itemShape.js) يحرسها اختبارٌ يقارنها
      // بمخطّط الشيت عمودًا عمودًا — بعد أن ضاعت الأعمدة الجديدة صامتةً هنا.
      Object.assign(payload, shapeImportedItem(raw));
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
  invalidateItemsCache();
  return { created, updated, skipped };
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
  if ('substitutes' in next) next.substitutes = normalizeSubstitutes(next.substitutes, id);

  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...next, updatedAt: serverTimestamp() });
  invalidateItemsCache();
};

/** Soft-delete: flip `archived` to true. Item is hidden from default lists. */
export const archiveItem = async (sku) => {
  const ref = doc(db, COLLECTION, normalizeSku(sku));
  await updateDoc(ref, { archived: true, updatedAt: serverTimestamp() });
  invalidateItemsCache();
};

/** Reverse `archiveItem`. */
export const unarchiveItem = async (sku) => {
  const ref = doc(db, COLLECTION, normalizeSku(sku));
  await updateDoc(ref, { archived: false, updatedAt: serverTimestamp() });
  invalidateItemsCache();
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

/** الاسم العربي للوحدة (للعرض والطباعة). */
export function unitLabel(value) {
  return UNIT_OPTIONS.find((u) => u.value === value)?.labelAr || value || '';
}

