/**
 * محرّك اقتراح مواقع التخزين — منطق خالص بلا Firebase وبلا DOM.
 *
 * قرار المالك (2026-08-16): **العامل يختار الرفّ بنفسه**. فدور هذا المحرّك
 * ليس أن يقرّر بل أن **يُرتّب ويُعلّل**: يضع أمام العامل مرشّحين مرتّبين، لكلٍّ
 * سببٌ مكتوب وسعةٌ قبل وبعد، ويُظهر المرفوضين بأسبابهم.
 *
 * ═══ ثلاث قواعد تحكم هذا الملفّ ═══
 *
 * ① **لا يُخترع اقتراح.** بلا سيّد مواقع، أو بلا بياناتٍ كافية، تُعاد قائمةٌ
 *    فارغة **بسببٍ معلَن** — لا رفٌّ عشوائيّ يبدو ذكيًّا.
 *
 * ② **المرفوض يُعرض بسببه لا يُخفى.** عاملٌ يقف أمام رفٍّ لا يراه في القائمة
 *    يظنّ النظام معطَّلًا. أن يقرأ «ممتلئ» أو «مبرَّد ولا يقبل العاديّ» أنفع
 *    من قائمةٍ قصيرةٍ صامتة.
 *
 * ③ **الرفض ليس منعًا.** التجاوز مسموحٌ بسببٍ إلزاميّ يُقيَّد في التدقيق
 *    (قرار المالك) — فالعمل لا يتوقّف، والأثر محفوظ، والمدير يرى التقرير.
 */

import {
  LOCATION_STATUSES,
  allowsItem,
  balanceLocationCode,
  canReceive,
  mixingProblem,
  occupancyOf,
} from './locationsModel.js';
import { normalizeLocationCode, shortLabelOf } from './locationCode.js';

/**
 * أوزان الترتيب. مكتوبةٌ صراحةً لا مبعثرةً في الشيفرة، كي يُراجعها المالك
 * ويُعدّلها بلا قراءة منطق.
 */
export const WEIGHTS = Object.freeze({
  sameItemAndBatch: 100, // تجميعٌ تامّ: نفس الصنف ونفس الدفعة هنا
  sameItem: 55, //          نفس الصنف هنا بدفعةٍ أخرى
  fitsWhole: 30, //         السعة تكفي الكمّيّة كاملةً
  fitsPartial: 10, //       تكفي بعضها
  emptyLocation: 18, //     فارغٌ تمامًا — لا خلط ولا التباس
  storageTypeMatch: 25, //  نوع التخزين يطابق ما يحتاجه الصنف
  priority: 1, //           لكلّ درجة أولويّة
  distance: -0.5, //        لكلّ وحدة بُعد عن ساحة الاستلام
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * أيحتاج هذا الصنف نوع تخزينٍ بعينه؟
 * الغياب يعني «لا قيد» — ولا يُخترع للصنف متطلَّبٌ لم يُعرَّف.
 */
function requiredStorageType(line, item) {
  return String(line?.storageType || item?.storageType || '').trim().toLowerCase();
}

/**
 * يُقيّم موقعًا واحدًا لبندٍ واحد.
 *
 * @returns {{ok:boolean, code:string, score:number, reasons:string[], reason:string,
 *            capacityBefore:object, capacityAfter:object}}
 */
export function scoreLocation(location, { line, balances, item } = {}) {
  const code = normalizeLocationCode(location?.code);
  const qty = num(line?.qty);
  const occ = occupancyOf(location, balances);

  // ── الرفض أوّلًا: حالةٌ لا تقبل ───────────────────────────────────
  const receive = canReceive(location, occ.usedQty);
  if (!receive.ok) return reject(code, receive.reason, occ);

  // ── نوع التخزين ────────────────────────────────────────────────
  const need = requiredStorageType(line, item);
  const has = String(location?.storageType || '').toLowerCase();
  if (need && has && need !== has) {
    return reject(code, `الصنف يحتاج تخزينًا «${need}» وهذا الرفّ «${has}».`, occ);
  }

  // ── الأصناف والفئات المسموحة ───────────────────────────────────
  const allowed = allowsItem(location, { sku: line?.sku, family: item?.family });
  if (!allowed.ok) return reject(code, allowed.reason, occ);

  // ── سياسة الخلط ────────────────────────────────────────────────
  const mixing = mixingProblem(location, balances, { sku: line?.sku, batch: line?.batch });
  if (mixing) return reject(code, mixing, occ);

  // ── الترتيب ────────────────────────────────────────────────────
  const reasons = [];
  let score = 0;

  const here = (balances || []).filter((b) => balanceLocationCode(b) === code && num(b.qty) > 0);
  const sameItem = here.filter((b) => up(b.sku) === up(line?.sku) || (up(b.barcode) && up(b.barcode) === up(line?.barcode)));
  const sameBatch = sameItem.filter((b) => (up(b.batch) || 'NOBATCH') === (up(line?.batch) || 'NOBATCH'));

  if (sameBatch.length) {
    score += WEIGHTS.sameItemAndBatch;
    reasons.push('الصنف والدفعة نفسهما مخزَّنان هنا — تجميعٌ يُقصّر السحب لاحقًا.');
  } else if (sameItem.length) {
    score += WEIGHTS.sameItem;
    reasons.push('الصنف نفسه مخزَّنٌ هنا بدفعةٍ أخرى.');
  } else if (!here.length) {
    score += WEIGHTS.emptyLocation;
    reasons.push('الرفّ فارغ — لا خلط ولا التباس.');
  }

  if (occ.remainingQty === null) {
    score += WEIGHTS.fitsWhole;
    reasons.push('سعة غير محدودة.');
  } else if (occ.remainingQty >= qty) {
    score += WEIGHTS.fitsWhole;
    reasons.push(`السعة تكفي الكمّيّة كاملةً (المتبقّي ${occ.remainingQty}).`);
  } else if (occ.remainingQty > 0) {
    score += WEIGHTS.fitsPartial;
    reasons.push(`السعة تكفي ${occ.remainingQty} من ${qty} — يحتاج الباقي رفًّا آخر.`);
  }

  if (need && has && need === has) {
    score += WEIGHTS.storageTypeMatch;
    reasons.push(`نوع التخزين مطابق («${has}»).`);
  }

  const priority = num(location?.priority);
  if (priority) {
    score += priority * WEIGHTS.priority;
    reasons.push(`أولويّة الرفّ ${priority}.`);
  }
  const distance = num(location?.distance);
  if (distance) {
    score += distance * WEIGHTS.distance;
    reasons.push(`البُعد عن ساحة الاستلام ${distance}.`);
  }

  const after = occ.capacityQty === null ? null : Math.max(0, occ.remainingQty - qty);
  return {
    ok: true,
    code,
    shortLabel: shortLabelOf(code),
    score: Math.round(score * 100) / 100,
    reasons,
    reason: '',
    capacityBefore: { used: occ.usedQty, remaining: occ.remainingQty, capacity: occ.capacityQty },
    capacityAfter: { used: occ.usedQty + qty, remaining: after, capacity: occ.capacityQty },
  };
}

function reject(code, reason, occ) {
  return {
    ok: false,
    code,
    shortLabel: shortLabelOf(code),
    score: -1,
    reasons: [],
    reason,
    capacityBefore: { used: occ.usedQty, remaining: occ.remainingQty, capacity: occ.capacityQty },
    capacityAfter: null,
  };
}

/**
 * يقترح مواقع لبندٍ واحد.
 *
 * @param {object} p
 * @param {object} p.line       بند التخزين (sku · barcode · batch · qty · expiry)
 * @param {Array}  p.locations  سيّد المواقع
 * @param {Array}  p.balances   الأرصدة الحيّة
 * @param {object} [p.item]     تعريف الصنف (للفئة ونوع التخزين المطلوب)
 * @param {string} [p.warehouse] حصرُ الاقتراح بمستودع البند
 * @param {number} [p.limit]    عدد المرشّحين المعروضين
 * @returns {{candidates:Array, rejected:Array, problem:string}}
 */
export function suggestLocations({ line, locations, balances, item, warehouse, limit = 5 } = {}) {
  const wh = up(warehouse || line?.warehouse);
  const pool = (locations || []).filter((l) => l?.status !== 'archived').filter((l) => !wh || up(l?.warehouse) === wh);

  // ① لا يُخترع اقتراح — والسبب يُقال.
  if (!(locations || []).length) {
    return { candidates: [], rejected: [], problem: 'سيّد المواقع فارغ — عرِّف مواقع المستودع أوّلًا من شاشة المستودعات.' };
  }
  if (!pool.length) {
    return { candidates: [], rejected: [], problem: `لا مواقع معرَّفة للمستودع «${wh || '—'}».` };
  }
  if (!num(line?.qty)) {
    return { candidates: [], rejected: [], problem: 'كمّيّة البند صفر — لا شيء يُخزَّن.' };
  }

  const scored = pool.map((l) => scoreLocation(l, { line, balances, item }));
  const candidates = scored.filter((s) => s.ok).sort((a, b) => b.score - a.score).slice(0, limit);
  // ② المرفوض يُعرض بسببه لا يُخفى.
  const rejected = scored.filter((s) => !s.ok).map(({ code, shortLabel, reason }) => ({ code, shortLabel, reason }));

  return {
    candidates,
    rejected,
    problem: candidates.length ? '' : 'كلّ مواقع هذا المستودع مرفوضة — راجع الأسباب أدناه أو خزّن بتجاوزٍ مُعلَّل.',
  };
}

/**
 * حكم اختيار العامل لموقع.
 *
 * ③ الرفض **ليس منعًا**: يُعاد `override:true` ومعه السبب، فتطلب الشاشة سببًا
 * إلزاميًّا ويُقيَّد في التدقيق. وحارسٌ يمنع العامل من العمل أسوأ من الفجوة.
 *
 * @returns {{ok:boolean, override:boolean, reason:string, needsReason:boolean}}
 */
export function chooseVerdict(code, { line, locations, balances, item } = {}) {
  const wanted = normalizeLocationCode(code);
  if (!wanted) return { ok: false, override: false, reason: 'لم يُحدَّد موقع.', needsReason: false };

  const location = (locations || []).find((l) => normalizeLocationCode(l?.code) === wanted);
  if (!location) {
    return {
      ok: false,
      override: true,
      reason: `«${wanted}» غير مسجَّل في سيّد المواقع.`,
      needsReason: true,
    };
  }

  const verdict = scoreLocation(location, { line, balances, item });
  if (verdict.ok) return { ok: true, override: false, reason: '', needsReason: false };
  return { ok: false, override: true, reason: verdict.reason, needsReason: true };
}

/**
 * سجلّ التجاوز — ما يُقيَّد في `audit` عند تخزينٍ خالف الحكم.
 * السبب الفارغ **يُرفض**: تجاوزٌ بلا سببٍ لا يُقرأ بعد شهر.
 */
export function overrideEntry({ code, line, verdict, note, profile }) {
  const reason = String(note ?? '').trim();
  if (!reason) return { ok: false, problem: 'سبب التجاوز إلزاميّ — تجاوزٌ بلا سببٍ لا يُقرأ بعد شهر.', entry: null };
  return {
    ok: true,
    problem: '',
    entry: {
      action: 'putaway-location-override',
      locationCode: normalizeLocationCode(code),
      sku: String(line?.sku ?? ''),
      batch: String(line?.batch ?? ''),
      qty: num(line?.qty),
      systemVerdict: String(verdict?.reason ?? ''),
      note: reason,
      byName: profile?.name || '',
      byRole: profile?.role || '',
    },
  };
}

/** تسمية الحالة للعرض بجانب المرفوضين. */
export function statusLabel(location) {
  return LOCATION_STATUSES[location?.status]?.labelAr || '';
}
