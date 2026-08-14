/**
 * الطلب المفتوح — «المطلوب Ordered» بمصدرٍ حقيقيّ (SAP-7 · يسدّ ف‑١٧).
 *
 * ═══ المعادلة (§14 ‹356›) ═══
 *   Available = In Stock − Committed + Ordered
 * «الموجود» و«المحجوز» قائمان منذ دفتر الحركات؛ والغائب كان «المطلوب» —
 * ومصدره الحقيقيّ موجودٌ أصلًا: **الرصيد المفتوح لأوامر الشراء** في
 * documentFlow/openBox، لكنه لم يكن موصولًا بالأرصدة. هذه الوحدة الوصل.
 *
 * ═══ وطلب النقل المفتوح (§14 ‹368› · §21-٧) ═══
 * «يؤثّر على المحجوز والمطلوب، لكنه لا يغيّر In Stock قبل النقل الفعليّ»:
 *   · في مستودع **المصدر**: الكمّيّة المفتوحة تُحسب **محجوزًا** (ستخرج).
 *   · في مستودع **الوجهة**: تُحسب **مطلوبًا** (ستصل).
 *   · «الموجود» لا يمسّه إلا التنفيذ الفعليّ (TRN/TRC تُقيّد الحركات).
 * وعلى مستوى الصنف الإجماليّ يتوازنان (+40 مطلوبًا −40 محجوزًا) — فالنقل
 * الداخليّ لا يخلق بضاعةً ولا يفنيها، والفرق يظهر لكلّ مستودعٍ على حدة.
 *
 * المدخل صفوف `measureDocument` (openBox) — نفس مصدر صندوق العمل المفتوح،
 * فلا حساب رصيدٍ مفتوحٍ ثانٍ يفترق عن الأوّل يومًا.
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { barcodeLookupVariants } from '../excel/excelSchema.js';

const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

const wh = (v) => String(v ?? '').trim().toUpperCase();

/**
 * مفاتيح سطرٍ للمطابقة: الكود والباركود معًا (كقاعدة الهويّة — الكود أولًا)،
 * والباركود بصيغتَيه (بأصفاره البادئة وبلاها) كقاعدة الماستر.
 */
function lineKeys(line) {
  return [normalizeItemCode(line?.sku), ...barcodeLookupVariants(line?.barcode)].filter(Boolean);
}

/**
 * «المطلوب» من أوامر الشراء المفتوحة: لكلّ سطرٍ مفتوحٍ قيدُ
 * (مفاتيح الصنف × مستودع رأس الأمر × الكمّيّة المفتوحة).
 * @param {Array} poRows صفوف measureDocument المفتوحة لأوامر الشراء
 * @returns {Array<{keys:string[], warehouse:string, qty:number}>}
 */
export function poOrderedEntries(poRows) {
  const out = [];
  for (const row of poRows || []) {
    const warehouse = wh(row?.document?.header?.warehouse);
    for (const line of row?.lines || []) {
      const qty = Number(line?.open) || 0;
      const keys = lineKeys(line);
      if (qty <= 0 || !keys.length) continue;
      out.push({ keys, warehouse, qty: round6(qty) });
    }
  }
  return out;
}

/**
 * أثر طلبات النقل المفتوحة (§14 ‹368›): محجوزٌ في المصدر ومطلوبٌ في الوجهة —
 * **ولا قيدَ على الموجود إطلاقًا** (لا يُخرج هذا الملفّ دلتا In Stock بحال).
 * @param {Array} trRows صفوف measureDocument المفتوحة لطلبات النقل
 * @returns {{ordered:Array, committed:Array}}
 */
export function transferImpactEntries(trRows) {
  const ordered = [];
  const committed = [];
  for (const row of trRows || []) {
    const header = row?.document?.header || {};
    const from = wh(header.fromWarehouse);
    const to = wh(header.toWarehouse);
    for (const line of row?.lines || []) {
      const qty = Number(line?.open) || 0;
      const keys = lineKeys(line);
      if (qty <= 0 || !keys.length) continue;
      if (from) committed.push({ keys, warehouse: from, qty: round6(qty) });
      if (to) ordered.push({ keys, warehouse: to, qty: round6(qty) });
    }
  }
  return { ordered, committed };
}

/** هل يعني هذا القيدُ الصنفَ؟ (أيّ مفتاحٍ من مفاتيح الصنف يطابق مفاتيح القيد). */
function entryMatches(entry, keySet) {
  return entry.keys.some((k) => keySet.has(k));
}

/**
 * إجمالي الطلب المفتوح لصنفٍ (اختياريًّا في مستودعٍ واحد):
 * `ordered` من أوامر الشراء + وجهات النقل، و`committedInTransit` من مصادر النقل.
 *
 * @param {string[]|Set<string>} itemKeys مفاتيح الصنف (كود + باركودات)
 * @param {{poRows?:Array, trRows?:Array, warehouse?:string}} src
 * @returns {{ordered:number, committedInTransit:number}}
 */
export function itemOpenDemand(itemKeys, { poRows = [], trRows = [], warehouse = '' } = {}) {
  const keySet = itemKeys instanceof Set ? itemKeys : new Set(itemKeys || []);
  const wanted = wh(warehouse);
  const inWh = (entry) => (wanted ? entry.warehouse === wanted : true);

  const po = poOrderedEntries(poRows);
  const tr = transferImpactEntries(trRows);

  const sum = (entries) => round6(
    entries.filter((e) => entryMatches(e, keySet) && inWh(e)).reduce((s, e) => s + e.qty, 0)
  );

  return {
    ordered: round6(sum(po) + sum(tr.ordered)),
    committedInTransit: sum(tr.committed),
  };
}

/**
 * المعادلة الحاكمة §14 ‹356› حرفيًّا: المتاح = الموجود − المحجوز + المطلوب.
 * لا قصّ عند الصفر — متاحٌ سالب إنذارُ التزامٍ فوق الطاقة، وإخفاؤه كذب.
 */
export function availableEquation({ inStock = 0, committed = 0, ordered = 0 } = {}) {
  return round6((Number(inStock) || 0) - (Number(committed) || 0) + (Number(ordered) || 0));
}
