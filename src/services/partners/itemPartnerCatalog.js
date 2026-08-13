/**
 * كتالوج الطرف‑الصنف — «الفجوة الأكبر في الوثيقة» (SAP-2 · يسدّ ف‑٦ ويخدم ف‑٧ وف‑٤٤).
 *
 * ═══ ما هو؟ (SR-48 ‹3077-3081›) ═══
 * علاقة الطرف بالصنف «لا توضع داخل بطاقة المورد فقط ولا داخل بطاقة الصنف
 * فقط، بل في جدول علاقةٍ مستقلّ». مجموعةٌ واحدة للمورد والعميل معًا
 * (`partnerType`) — لأنّ المرجع ‹3085-3110› يطلب كود العميل أيضًا.
 *
 * ═══ القاعدة الصارمة (§10.6 ‹251›) ═══
 * **الإلزاميّ ثلاثة فقط: الطرف · الصنف · كوده للصنف.** والباقي اختياريّ
 * يُكتب حين يوجد مصدره — لا يخترع Claude قيمًا ولا يجعل المقترح شرطًا.
 *
 * ═══ والعائد الحقيقيّ (SR-50 ‹3161›) ═══
 * «هذا يمنع إنشاء صنف جديد لكل كود مورد.» البحث بكود الطرف يعيد الصنف
 * الداخليّ الصحيح — **ولا ينشئ شيئًا أبدًا**. التخزين يبقى على الهويّة
 * الداخليّة، وكود الطرف عرضٌ في مستنده (§10 ‹257›).
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import { normalizeItemCode } from '../items/itemIdentity.js';

export const CATALOG_COLLECTION = 'item_partner_catalog';

export const PARTNER_TYPES = Object.freeze({
  supplier: 'مورّد',
  customer: 'عميل',
});

/** يُنظّف جزء مفتاح (نفس قاعدة balanceKey): لا «/.#$[]» ولا فراغات. */
function safe(part) {
  return String(part ?? '')
    .trim()
    .replace(/[/.#$[\]]/g, '-')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

/**
 * معرّف السجلّ حتميّ — (نوع الطرف × رمزه × الصنف) — فإعادة الإدخال
 * **تحديثٌ لا تكرار**، وللطرف الواحد كودٌ واحد للصنف الواحد.
 */
export function catalogEntryId({ partnerType, partnerCode, sku } = {}) {
  const type = String(partnerType ?? '').trim().toLowerCase();
  const code = safe(partnerCode);
  const item = safe(sku);
  if (!PARTNER_TYPES[type] || !code || !item) return null;
  return `${type.toUpperCase()}__${code}__${item}`;
}

/** الحقول الاختياريّة المقبولة — تُنسخ حين تَرِد ولا تُخترع (§10.6 ‹251›). */
const OPTIONAL_FIELDS = Object.freeze({
  partnerItemName: (v) => String(v).trim(),
  uom: (v) => String(v).trim(),
  conversionFactor: (v) => Number(v),
  preferred: (v) => Boolean(v),
  currency: (v) => String(v).trim(),
  price: (v) => Number(v),
  minQty: (v) => Number(v),
  leadDays: (v) => Number(v),
  notes: (v) => String(v).trim(),
});

/**
 * حكم الإدخال: يفحص الإلزاميّ الثلاثة ويطبّع، ويُعيد المشاكل مكتوبةً
 * لا استثناءً غامضًا — نمط `approvalVerdict` نفسه.
 *
 * @returns {{ok:boolean, problems:string[], entry:object|null}}
 */
export function catalogEntryVerdict(raw = {}) {
  const problems = [];
  const type = String(raw.partnerType ?? '').trim().toLowerCase();
  const partnerCode = String(raw.partnerCode ?? '').trim().toUpperCase();
  const sku = normalizeItemCode(raw.sku);
  const partnerItemCode = String(raw.partnerItemCode ?? '').trim().toUpperCase();

  if (!PARTNER_TYPES[type]) problems.push('نوع الطرف مطلوب: مورّد أو عميل');
  if (!partnerCode) problems.push('رمز الطرف (BP Code) مطلوب');
  if (!sku) problems.push('كود الصنف الداخليّ مطلوب — الكود هو الهويّة');
  if (!partnerItemCode) problems.push('كود الطرف للصنف مطلوب — هو سبب السجلّ كلّه');
  if (problems.length) return { ok: false, problems, entry: null };

  const entry = { partnerType: type, partnerCode, sku, partnerItemCode };
  for (const [key, cast] of Object.entries(OPTIONAL_FIELDS)) {
    const v = raw[key];
    if (v === undefined || v === null || v === '') continue;
    const value = cast(v);
    if (typeof value === 'number' && !Number.isFinite(value)) {
      problems.push(`الحقل «${key}» ليس رقمًا صالحًا`);
      continue;
    }
    entry[key] = value;
  }
  if (problems.length) return { ok: false, problems, entry: null };
  return { ok: true, problems: [], entry };
}

/** سجلّات صنفٍ واحد من مجموعة سجلّات. */
export function entriesForItem(entries, sku) {
  const want = normalizeItemCode(sku);
  if (!want) return [];
  return (entries || []).filter((e) => normalizeItemCode(e?.sku) === want);
}

/** سجلّات طرفٍ واحد. */
export function entriesForPartner(entries, partnerType, partnerCode) {
  const type = String(partnerType ?? '').trim().toLowerCase();
  const code = String(partnerCode ?? '').trim().toUpperCase();
  if (!type || !code) return [];
  return (entries || []).filter(
    (e) => String(e?.partnerType ?? '').toLowerCase() === type
      && String(e?.partnerCode ?? '').toUpperCase() === code
  );
}

/** باركود مطبَّع للمقارنة: قصّ وترفيع، وصيغة بلا أصفارٍ بادئة للرقميّ. */
function barcodeVariants(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return [];
  const stripped = /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
  return [...new Set([s, stripped])];
}

/**
 * ترتيب البحث الخماسيّ (SR-49 ‹3130-3138›) — حرفيًّا وبالترتيب:
 *   ١. هل هو كود داخليّ؟
 *   ٢. هل هو باركود؟
 *   ٣. هل هو كود صنفٍ مسجَّل **لهذا الطرف**؟ (الكتالوج — لا يتسرّب كود طرفٍ آخر)
 *   ٤. هل هو رقم كتالوج مصنع؟ (يُقرأ حقل `mfrCatalogNo` إن وُجد — ولا يُخترع)
 *   ٥. هل هو اسم أو جزء من اسم؟
 *
 * **لا يُنشئ صنفًا بحال** (SR-50) — المجهول يعود null والقرار للإنسان.
 *
 * @param {string} term المكتوب أو الممسوح
 * @param {{items:object[], entries?:object[], partnerType?:string, partnerCode?:string}} ctx
 * @returns {{item:object, via:string, entry?:object}|null}
 */
export function fiveStepItemSearch(term, { items = [], entries = [], partnerType, partnerCode } = {}) {
  const wanted = String(term ?? '').trim();
  if (!wanted) return null;
  const upper = wanted.toUpperCase();

  // ١ — الكود الداخليّ (الهويّة).
  const bySku = items.find((it) => normalizeItemCode(it?.sku) === upper);
  if (bySku) return { item: bySku, via: 'sku' };

  // ٢ — الباركود (وسيلة بحث لا هويّة).
  const wantedBar = barcodeVariants(wanted);
  const byBarcode = items.find((it) =>
    (it?.barcodes || []).some((b) => barcodeVariants(b).some((v) => wantedBar.includes(v)))
  );
  if (byBarcode) return { item: byBarcode, via: 'barcode' };

  // ٣ — كود الطرف للصنف: مقيَّدٌ بالطرف الحاضر — كود مورّدٍ آخر لا يُجيب هنا.
  if (partnerType && partnerCode) {
    const mine = entriesForPartner(entries, partnerType, partnerCode);
    const hit = mine.find((e) => String(e?.partnerItemCode ?? '').toUpperCase() === upper);
    if (hit) {
      const item = items.find((it) => normalizeItemCode(it?.sku) === normalizeItemCode(hit.sku));
      if (item) return { item, via: 'partner-code', entry: hit };
    }
  }

  // ٤ — رقم كتالوج المصنع — إن كان الحقل موجودًا في بيانات الصنف أصلًا.
  const byMfr = items.find((it) => String(it?.mfrCatalogNo ?? '').trim().toUpperCase() === upper);
  if (byMfr) return { item: byMfr, via: 'mfr-catalog' };

  // ٥ — الاسم أو جزؤه (عربيًّا أو إنجليزيًّا).
  const needle = wanted.toLowerCase();
  const byName = items.find((it) =>
    [it?.nameAr, it?.nameEn].filter(Boolean).some((n) => String(n).toLowerCase().includes(needle))
  );
  if (byName) return { item: byName, via: 'name' };

  return null; // SR-50: لا صنفَ جديدًا لكودٍ مجهول — القرار للإنسان.
}
