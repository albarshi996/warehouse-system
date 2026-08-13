/**
 * هويّة الصنف — العقد الحاكم (SAP-1 · يسدّ ف‑١ ويخدم ف‑٢ وف‑٣ وف‑٤٣).
 *
 * ═══ القاعدة (§9.1 ‹182›) ═══
 * **الكود هو الهويّة، والباركود وسيلة بحث.** الاسم العربيّ والإنجليزيّ
 * والباركود وكود الطرف كلّها وسائل عرضٍ واستدعاء — لا هويّة. ولذلك:
 *   · صنفٌ **جديد** بلا كود يُرفض هنا رفضًا واحدًا في مكانٍ واحد.
 *   · تغيير الاسم لا يمسّ الهويّة — فلا يقطع تاريخ الصنف (§9 ‹220›).
 *   · الباركود يبقى بوّابة بحثٍ في كلّ شاشة، ولا يصير مفتاحًا لسجلٍّ جديد.
 *
 * ═══ والتوافق الرجعيّ ═══
 * أرصدةٌ قديمة كُتبت بمفتاح باركود قبل هذا العقد (`balanceKey.js` يقبل
 * الباركود احتياطًا). لا نكسرها: `identityOf` يميّز الهويّة الشرعيّة
 * (`via:'sku'`) عن الموروثة (`via:'barcode-legacy'`) — فيعمل القديم ويُمنع
 * الجديد. الحلّ حارسٌ لا هدم، بنصّ الفهم الحرفيّ SB-9.1.
 *
 * منطق خالص: بلا Firestore وبلا DOM — يُختبر وحده (§22 ‹995›).
 */
import { totalQty } from '../balances/balanceKey.js';
import { totalReserved, totalAvailable } from '../ledger/reservations.js';

/** تطبيع كود الصنف — الصيغة القانونيّة الواحدة (نفس قاعدة معرّف الماستر). */
export function normalizeItemCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * حارس الصنف الجديد: **لا كودَ فلا صنف.**
 * يُستدعى من كلّ مسار إنشاء (النموذج اليدويّ · اعتماد المعلّق · الاستيراد
 * يتخطّى الصفوف بلا كود ويُصرّح بعددها). يرمي برسالةٍ عربيّة مقروءة.
 */
export function assertNewItemIdentity({ sku } = {}) {
  const code = normalizeItemCode(sku);
  if (!code) {
    throw new Error('كود الصنف هو هويّته — لا يُنشأ صنفٌ جديد بلا كود. الباركود وسيلة بحثٍ لا هويّة.');
  }
  return code;
}

/**
 * هويّة سجلٍّ قائم: الكود إن وُجد، وإلا الباركود **موروثًا** لا شرعًا.
 * `via` يُخبر المستهلك أهي هويّة صحيحة أم توافقٌ مع سجلٍّ قديم يجب ألّا
 * يتكاثر. لا يدخل الاسم في الهويّة بحال.
 */
export function identityOf({ sku, barcode } = {}) {
  const code = normalizeItemCode(sku);
  if (code) return { key: code, via: 'sku' };
  const legacy = normalizeItemCode(barcode);
  if (legacy) return { key: legacy, via: 'barcode-legacy' };
  return { key: null, via: null };
}

/**
 * مفاتيح البحث عن الصنف في الأرصدة والبنود: الكود + كلّ باركوداته.
 * (كانت مبنيّة داخل شاشة الأصناف — انتُزعت هنا لتُقرأ من البطاقة والقائمة معًا.)
 */
export function itemSearchKeys(item) {
  return [item?.sku, ...(item?.barcodes || [])]
    .map(normalizeItemCode)
    .filter(Boolean);
}

/** أرصدة هذا الصنف من مجموعة أرصدة — مطابقة بالكود أو الباركود، بلا تكرار صفّ. */
export function balancesForItem(item, balances) {
  const keys = new Set(itemSearchKeys(item));
  if (!keys.size) return [];
  const seen = new Set();
  const out = [];
  for (const b of balances || []) {
    const bySku = normalizeItemCode(b?.sku);
    const byBar = normalizeItemCode(b?.barcode);
    if (!keys.has(bySku) && !keys.has(byBar)) continue;
    const id = b?.id ?? `${bySku}|${byBar}|${b?.warehouse}|${b?.batch}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(b);
  }
  return out;
}

/**
 * الصيغة القانونيّة لكود السطر بعد استدعاء الماستر (يخدم ف‑٤٣).
 *
 * القاعدة: ما كتبه الموظّف لا يُدهس — إلا إذا كان **الهويّة نفسها** بصيغةٍ
 * أخرى (itm-001 ≡ ITM-001) فيُثبَّت على صيغة الماستر القانونيّة. سطرٌ كتب
 * كودًا مختلفًا عمّا وجده الباركود يبقى كما كُتب — الاختلاف قرارُ إنسانٍ
 * لا يحسمه كود.
 */
export function canonicalLineSku(line, item) {
  const typed = String(line?.sku ?? '').trim();
  const master = normalizeItemCode(item?.sku);
  if (!master) return typed;
  if (!typed) return master;
  return normalizeItemCode(typed) === master ? master : typed;
}

/** هل يخصّ هذا السطرُ الصنفَ؟ (بالكود أو الباركود — مفاتيح `itemSearchKeys`). */
export function lineMatchesItem(line, keys) {
  const set = keys instanceof Set ? keys : new Set(keys || []);
  if (!set.size) return false;
  return set.has(normalizeItemCode(line?.sku)) || set.has(normalizeItemCode(line?.barcode));
}

/**
 * «المطلوب Ordered» للصنف (يسدّ ف‑٢ عرضًا): مجموع المتبقّي المفتوح من أسطر
 * أوامر الشراء المفتوحة التي تخصّه.
 *
 * المدخل صفوف `measureDocument` (صندوق العمل المفتوح — SAP-12): كلّ صفٍّ
 * يحمل أسطره المفتوحة بكمّيّاتها. والرقم **تقريبٌ معلَن** بنفس عقد الصندوق:
 * يُحسب من الروابط المعروفة للمستند، والدقيق يُقرأ عند فتح المستند.
 */
export function orderedForItem(item, openRows) {
  const keys = new Set(itemSearchKeys(item));
  if (!keys.size) return 0;
  let sum = 0;
  for (const row of openRows || []) {
    for (const line of row?.lines || []) {
      if (!lineMatchesItem(line, keys)) continue;
      sum += Number(line.open) || 0;
    }
  }
  return round(sum);
}

/**
 * الكمّيّات الأربع لبطاقة الصنف (§9.2 ‹191›): الموجود · المحجوز · المطلوب · المتاح.
 *
 * **المتاح هنا = الموجود − المحجوز** (معادلة النظام القائمة في
 * `reservations.js`). ضمّ «المطلوب» إلى المعادلة (§14 ‹356›) عملُ دفتر
 * المخزون في SAP-7 (ف‑١٧) — فلا يُستبق هنا برقمٍ لا مصدرَ دفتريّ له،
 * ويُعرض «المطلوب» رقمًا رابعًا مستقلًّا بمصدره.
 */
export function itemQuantities({ balances = [], ordered = 0 } = {}) {
  return {
    inStock: round(totalQty(balances)),
    committed: round(totalReserved(balances)),
    ordered: round(Number(ordered) || 0),
    available: round(totalAvailable(balances)),
  };
}

/**
 * الأصناف البديلة (يسدّ ف‑٣): قائمة أكواد مطبَّعة — بلا تكرار، وبلا الصنف
 * نفسه بديلًا لنفسه، وبلا فراغات. لا يُخترع اسمٌ ولا رصيد — الكود وحده،
 * والعرض يستبينه من الماستر.
 */
export function normalizeSubstitutes(list, selfSku) {
  const self = normalizeItemCode(selfSku);
  const out = [];
  for (const raw of Array.isArray(list) ? list : [list]) {
    const code = normalizeItemCode(raw);
    if (!code || code === self || out.includes(code)) continue;
    out.push(code);
  }
  return out;
}

/** يستبين البدائل من الماستر: الموجود ببطاقته، والمفقود يُصرَّح بفقده لا يُخفى. */
export function resolveSubstitutes(substitutes, itemsBySku) {
  const map = itemsBySku instanceof Map ? itemsBySku : new Map();
  return (substitutes || []).map((sku) => {
    const code = normalizeItemCode(sku);
    return { sku: code, item: map.get(code) || null };
  });
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;
}
