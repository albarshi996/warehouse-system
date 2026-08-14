/**
 * المرتجعات والنقل العكسيّ (SAP-10 · يسدّ ف‑٢٣ وف‑٢٤ وف‑٢٥ وف‑٤٨).
 *
 * ═══ الشروط الستّة (§15.5 ‹420-425›) ═══
 * لا يُنشأ مرتجعٌ إلّا بها مجتمعةً: مستندٌ أصليٌّ مؤهّل · سببٌ موثّق · كمّيّةٌ
 * لا تتجاوز المؤهَّل للإرجاع · التشغيلة والمستودع والموقع عند انطباقها ·
 * أثرٌ عكسيٌّ واضح · علاقةٌ ظاهرة في الخريطة والسجلّ.
 *
 * ═══ الكمّيّة المؤهلة (ف‑٢٥) ═══
 * كانت غير معرَّفة في النظام لأنّ خريطة الاشتقاق الكمّيّ لم تحوِ زوجًا
 * للإرجاع. تُحسب هنا: **ما نُفِّذ فعلًا ناقص ما أُرجع سابقًا** — فلا يُرجع
 * ما لم يُستلم، ولا يُرجع مرّتين.
 *
 * ═══ مسار الفحص ثلاثيّ الوجهة (ف‑٢٤ · المرجع ‹3636-3648›) ═══
 * مرتجع العميل يهبط في `RETURNS` (منطقة فحص المرتجعات) لا في المخزون
 * الصالح، ثمّ يُفرز: **صالح → المستودع · يحتاج إصلاحًا → الصيانة · تالف →
 * الإتلاف**. والقرار مأخوذٌ من حقلَي البند القائمين (`condition` و`action`)
 * — لا حقلَ جديدًا يُخترع لما هو مكتوبٌ أصلًا.
 *
 * ═══ وما لا يُبنى (§15 ‹416› · ف‑٢٣) ═══
 * أربعة صفوفٍ من مصفوفة §15.3 ماليّةٌ بحتة (تصحيحٌ ماليّ للمورّد أو
 * للعميل · إرجاعٌ بعد الفاتورة قيمةً). **لا يُلفَّق لها أثرٌ ماليّ** —
 * تُوصف هنا فجوةً معلَنة، والقيمة لأودو بالحدّ الفاصل الحاكم.
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import { SYSTEM_LOCATIONS } from '../ledger/locations.js';
import { normalizeItemCode } from '../items/itemIdentity.js';

const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const text = (v) => String(v ?? '').trim();

/* ═══════════════ ١ — الكمّيّة المؤهلة للإرجاع (ف‑٢٥ · ف‑٤٨) ═══════════════ */

/**
 * أزواج الإرجاع الكمّيّ التي كانت غائبة عن الخريطة (ف‑٤٨): من الاستلام
 * يُرجَع للمورّد، ومن التسليم يُرجِع العميل.
 */
export const RETURN_DERIVATIONS = Object.freeze({
  'GRN>VRT': { source: 'qtyReceived', target: 'qty', label: 'إرجاع للمورّد من استلام' },
  'DN>RET': { source: 'qty', target: 'qty', label: 'مرتجع عميل من تسليم' },
});

/**
 * الكمّيّة المؤهلة للإرجاع من سطرٍ في مستندٍ أصليّ:
 *   **المنفَّذ فعلًا − ما أُرجع سابقًا** (ولا تقلّ عن صفر).
 *
 * @param {{executed:number}} line سطرٌ من مخرج documentLineProgress
 * @param {number} alreadyReturned مجموع ما أُرجع من هذا السطر في مرتجعاتٍ سابقة
 */
export function returnableQuantity(line, alreadyReturned = 0) {
  const executed = Number(line?.executed ?? line?.qty) || 0;
  return Math.max(0, round6(executed - (Number(alreadyReturned) || 0)));
}

/** مجموع ما أُرجع من سطرٍ عبر مرتجعاتٍ قائمة — بمطابقة هويّة الصنف. */
export function returnedSoFar(returnDocs, { sku, barcode } = {}) {
  const keys = new Set([normalizeItemCode(sku), normalizeItemCode(barcode)].filter(Boolean));
  if (!keys.size) return 0;
  let sum = 0;
  for (const doc of returnDocs || []) {
    for (const line of doc?.lines || []) {
      const lineKeys = [normalizeItemCode(line?.sku), normalizeItemCode(line?.barcode)].filter(Boolean);
      if (!lineKeys.some((k) => keys.has(k))) continue;
      sum += Number(line?.qty) || 0;
    }
  }
  return round6(sum);
}

/* ═══════════════ ٢ — الشروط الستّة (§15.5 ‹420-425›) ═══════════════ */

/** الحالات التي يصحّ الإرجاع من مستندٍ فيها — المسودّة لا يُرجَع منها. */
const ELIGIBLE_SOURCE_STATES = new Set(['approved', 'done', 'closed']);

/**
 * حكم إنشاء مرتجع: الشروط الستّة مجتمعةً، وكلّ ناقصٍ يُقال باسمه.
 *
 * @param {object} input
 * @param {object} input.source المستند الأصليّ ({type,id,number,state})
 * @param {string} input.reason سبب الإرجاع الموثّق
 * @param {number} input.qty الكمّيّة المطلوب إرجاعها
 * @param {number} input.returnable الكمّيّة المؤهلة (من returnableQuantity)
 * @param {object} [input.line] سطر المرتجع (للتشغيلة والموقع عند انطباقهما)
 * @param {boolean} [input.batchTracked] هل الصنف متتبَّعٌ بالتشغيلة؟
 * @returns {{ok:boolean, problems:string[], conditions:object}}
 */
export function returnEligibility({ source, reason, qty, returnable, line = {}, batchTracked = false } = {}) {
  const problems = [];
  const conditions = {};

  // ١ — مستندٌ أصليٌّ مؤهّل
  conditions.eligibleSource = Boolean(source?.id && source?.type && ELIGIBLE_SOURCE_STATES.has(text(source?.state)));
  if (!source?.id || !source?.type) problems.push('لا مستند أصليّ — المرتجع يرجع من شيءٍ وقع فعلًا.');
  else if (!ELIGIBLE_SOURCE_STATES.has(text(source.state))) {
    problems.push(`المستند الأصليّ بحالة «${text(source.state) || '—'}» — لا يُرجَع إلّا من معتمَدٍ أو منجَزٍ أو مغلق.`);
  }

  // ٢ — سببٌ موثّق
  conditions.documentedReason = text(reason).length > 0;
  if (!conditions.documentedReason) problems.push('سبب الإرجاع مطلوب — مرتجعٌ بلا سببٍ لا يُحقَّق ولا يُمنع تكراره.');

  // ٣ — كمّيّةٌ مؤهلة لا تتجاوز المتاح للإرجاع
  const wanted = Number(qty) || 0;
  const cap = Number(returnable) || 0;
  conditions.quantityWithinCap = wanted > 0 && wanted <= cap;
  if (wanted <= 0) problems.push('الكمّيّة المرتجعة رقمٌ أكبر من صفر.');
  else if (wanted > cap) problems.push(`الكمّيّة ${wanted} تتجاوز المؤهَّل للإرجاع ${cap} — لا يُرجع ما لم يُنفَّذ أو أُرجع سابقًا.`);

  // ٤ — التشغيلة والمستودع والموقع عند انطباقها
  const hasBatch = text(line?.batch).length > 0;
  const hasWarehouse = text(line?.warehouse || line?.toWarehouse).length > 0;
  conditions.identityKept = batchTracked ? hasBatch : true;
  if (batchTracked && !hasBatch) problems.push('الصنف متتبَّعٌ بالتشغيلة — التشغيلة مطلوبة في سطر المرتجع.');
  conditions.warehouseKnown = hasWarehouse;

  // ٥ — أثرٌ عكسيّ واضح: وجهةٌ معلومة للمرتجع
  const route = inspectionRoute(line);
  conditions.clearReversal = Boolean(route.location);
  if (!route.location) problems.push(route.problem || 'وجهة المرتجع غير محدَّدة — حدِّد حالة الصنف أو إجراءه.');

  // ٦ — علاقةٌ ظاهرة: تُنشأ حتمًا عند الحفظ (RETURN/REVERSAL) — تُعلَن هنا عقدًا.
  conditions.relationRecorded = true;

  return { ok: problems.length === 0, problems, conditions };
}

/* ═══════════════ ٣ — مسار الفحص ثلاثيّ الوجهة (ف‑٢٤) ═══════════════ */

/**
 * وجهات فرز المرتجع الثلاث — من حقلَي البند القائمين (`action` ثمّ
 * `condition`)، فلا يُخترع حقلٌ لما هو مكتوب. و«تحت الفحص» يبقى في منطقة
 * الفحص: قرارٌ لم يُتَّخذ بعد، لا وجهةٌ ثالثة مخترعة.
 */
export const INSPECTION_ROUTES = Object.freeze({
  stock: { key: 'stock', label: 'صالح — إلى المخزون', location: null }, // المستودع الحقيقيّ من الرأس
  maintenance: { key: 'maintenance', label: 'يحتاج إصلاحًا — إلى الصيانة', location: SYSTEM_LOCATIONS.MAINTENANCE.code },
  scrap: { key: 'scrap', label: 'تالف — إلى الإتلاف', location: SYSTEM_LOCATIONS.SCRAP.code },
  vendor: { key: 'vendor', label: 'إرجاع للمورّد — حجرٌ حتى الشحن', location: SYSTEM_LOCATIONS.QUARANTINE.code },
  hold: { key: 'hold', label: 'تحت الفحص — يبقى في منطقة الفحص', location: SYSTEM_LOCATIONS.RETURNS.code },
});

const ACTION_ROUTES = Object.freeze({
  'إعادة للمخزون': 'stock',
  'إتلاف': 'scrap',
  'إرجاع للمورّد': 'vendor',
  'تحت الفحص': 'hold',
  'صيانة': 'maintenance',
});

const CONDITION_ROUTES = Object.freeze({
  'سليم': 'stock',
  'تالف': 'scrap',
  'منتهي': 'scrap',
  'ناقص': 'hold',
});

/**
 * وجهة سطر مرتجعٍ بعد الفحص.
 * @returns {{key:string, label:string, location:string|null, fromField:string, problem:string}}
 */
export function inspectionRoute(line) {
  const action = text(line?.action);
  const condition = text(line?.condition);
  const key = ACTION_ROUTES[action] || CONDITION_ROUTES[condition] || '';
  if (!key) {
    return { key: '', label: '', location: null, fromField: '', problem: 'لا حالةَ ولا إجراءَ للبند — لا تُعرف وجهته بعد الفحص.' };
  }
  const route = INSPECTION_ROUTES[key];
  return {
    key,
    label: route.label,
    // «صالح» وجهته المستودع الحقيقيّ من رأس المستند — لا موقع نظام.
    location: key === 'stock' ? 'WAREHOUSE' : route.location,
    fromField: ACTION_ROUTES[action] ? 'action' : 'condition',
    problem: '',
  };
}

/** فرزُ مستند مرتجعٍ كاملًا: كم بندًا إلى كلّ وجهة، وما لم يُفرز. */
export function inspectionPlan(doc) {
  const buckets = { stock: [], maintenance: [], scrap: [], vendor: [], hold: [], unrouted: [] };
  (doc?.lines || []).forEach((line, index) => {
    const route = inspectionRoute(line);
    const entry = { index, sku: text(line?.sku), qty: Number(line?.qty) || 0, route };
    if (!route.key) buckets.unrouted.push(entry);
    else buckets[route.key].push(entry);
  });
  return buckets;
}

/* ═══════════════ ٤ — النقل العكسيّ (SR-62 · SR-63 · §21-٨) ═══════════════ */

/** الحقول التسعة التي يحدّدها النقل العكسيّ (SR-63 ‹3753-3765›). */
export const REVERSAL_FIELDS = Object.freeze([
  'sku', 'qty', 'batch', 'fromWarehouse', 'toWarehouse', 'fromBin', 'toBin', 'reason', 'sourceDocument',
]);

/**
 * عقد النقل العكسيّ: **المستودعان يُعكسان** (المصدر الجديد هو الهدف
 * القديم)، والأصل **لا يُعدَّل ولا يُحذف** (§15 ‹429›) — العلاقة `REVERSAL`
 * تسمّي أصلها: «عكس TR-2026-0010».
 *
 * @returns {{ok:boolean, problems:string[], contract:object|null}}
 */
export function reversalContract({ original, line, qty, reason } = {}) {
  const problems = [];

  // SR-62 ‹3710›: لا «إرجاع من طلب نقلٍ لم يُنفَّذ» — الصحيح إغلاقه أو إلغاؤه.
  if (!original?.posted && !['done', 'closed'].includes(text(original?.state))) {
    problems.push('طلب النقل لم يُنفَّذ — لا يُعكس ما لم يقع؛ أغلقه أو ألغِه أو عدّل كمّيّته المفتوحة.');
  }
  const wanted = Number(qty) || 0;
  if (wanted <= 0) problems.push('كمّيّة العكس رقمٌ أكبر من صفر.');
  if (!text(reason)) problems.push('سبب العكس مطلوب.');

  const from = text(original?.header?.toWarehouse).toUpperCase();
  const to = text(original?.header?.fromWarehouse).toUpperCase();
  if (!from || !to) problems.push('مستودعا الأصل غير معلومين — لا يُبنى عكسٌ على مجهول.');

  if (problems.length) return { ok: false, problems, contract: null };

  return {
    ok: true,
    problems: [],
    contract: {
      sku: text(line?.sku),
      qty: round6(wanted),
      batch: text(line?.batch), // التشغيلة نفسها — لا تُخترع أخرى
      fromWarehouse: from, // المصدر الجديد = هدف الأصل
      toWarehouse: to, // والهدف الجديد = مصدر الأصل
      fromBin: text(line?.toBin || line?.bin),
      toBin: text(line?.fromBin),
      reason: text(reason),
      sourceDocument: { id: original.id, type: original.type, number: original.number || null },
      relationLabel: `عكس ${original.number || original.id}`,
      linkType: 'REVERSAL',
    },
  };
}

/* ═══════════════ ٥ — الصفوف الماليّة البحتة (ف‑٢٣ · §15 ‹416›) ═══════════════ */

/**
 * الصفوف التي **لا تُبنى** من مصفوفة §15.3 — تُعلَن فجوةً موصوفة ولا
 * يُلفَّق لها أثرٌ ماليّ. القيمة لأودو (الحدّ الفاصل الحاكم)، والبوابة
 * تعرض أثرها المستورَد لا تُنشئه.
 */
export const FINANCIAL_ONLY_CASES = Object.freeze([
  { id: 'vendor-credit-only', label: 'تصحيح ماليّ فقط للمورّد', note: 'لا حركة كمّيّة — إشعارٌ دائن في أودو، والبوابة تعرضه مستورَدًا (SAP-16/17).' },
  { id: 'customer-credit-only', label: 'تصحيح ماليّ فقط للعميل', note: 'كسابقه — ولا يحرّك الكمّيّة (§15 ‹430›).' },
  { id: 'vendor-return-after-invoice', label: 'إرجاع مورّد بعد الفاتورة', note: 'الشقّ الكمّيّ يُنفَّذ هنا (VRT)، والشقّ الماليّ إشعارٌ دائن في أودو.' },
  { id: 'customer-return-after-invoice', label: 'مرتجع عميل بعد الفاتورة', note: 'الشقّ الكمّيّ هنا (RET)، والإشعار الدائن في أودو.' },
]);

/** هل هذه الحالة ماليّةٌ بحتة؟ (فلا يُنتظر منها أثرٌ مخزنيّ ولا يُلفَّق). */
export function isFinancialOnly(caseId) {
  return FINANCIAL_ONLY_CASES.some((c) => c.id === caseId && c.id.endsWith('credit-only'));
}
