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
  declaredHandling,
  handlingLabel,
  mixingProblem,
  occupancyOf,
} from './locationsModel.js';
import { normalizeLocationCode, shortLabelOf } from './locationCode.js';
import { normalizeUom } from '../items/uomModel.js';

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
  handlingMatch: 25, //     نوع المناولة يطابق ما يحتاجه البند (بُعدٌ آخرُ بوزنٍ مثله)
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
 * وحداتُ العدّ ⟶ نوعُ المناولة الذي تعنيه.
 *
 * وما سوى العدّ (وزنٌ وحجمٌ وطول) غائبٌ عن الجدول عمدًا: «عشرون كيلوغرامًا»
 * لا تقول شيئًا عن المناولة — تأتي في كيسٍ وعلى طبليّةٍ سواء. فتُعاد فراغًا،
 * والفراغُ يمرّ.
 */
const UOM_HANDLING = Object.freeze({
  pallet: 'pallet',
  carton: 'carton',
  box: 'carton',
  pack: 'carton',
  piece: 'piece',
  dozen: 'piece', // الدستة قطعٌ معدودة، ومناولتُها مناولةُ القطعة
});

/**
 * حاجةُ البند من المناولة — **مشتقّةٌ لا مُدخَلة.**
 *
 * ★★★ ولماذا اشتقاقًا؟ لأنّ حقلًا جديدًا على بطاقة الصنف يعني ألفًا وأربعين
 * خانةً تُملأ باليد **قبل** أن تنفع الميزةُ مرّةً واحدة؛ فتبقى فارغةً ويبقى
 * التمييزُ حبرًا على شاشة. والوحدةُ مكتوبةٌ في البند أصلًا، ومعاملاتُ الصنف
 * معرَّفةٌ لمن عرّفها — فمنهما يُقرأ الجواب بلا سؤالٍ جديدٍ على أحد.
 *
 * ① وحدةُ القيد أوّلًا، فهي أدقُّ ما في الموقف: بندٌ كُتب بالطبالي يُخزَّن
 *    بالطبالي مهما قال تعريفُ الصنف.
 * ② فإن خلا البند من وحدة، فمعاملُ **الطبليّة** المعرَّفُ صراحةً للصنف: من
 *    عرّف لصنفه معاملَ طبليّةٍ فقد أعلن أنّه يتحرّك بها.
 *    ⚠️ ولا يُقرأ هنا معاملُ الصندوق ولا الكرتون وإن وُجد: هما على جُلّ
 *    الأصناف المعرَّفة، فقراءتُهما تُلصق بكلّ بندٍ بلا وحدةٍ حاجةَ «صندوق»
 *    فتُغلق في وجهه كلُّ واجهات الالتقاط دفعةً واحدة — منعٌ بُني على شيوعٍ
 *    لا على قياس.
 *    ⚠️ و`item.unit` النصُّ القديم لا يُقرأ أصلًا: هو على كلّ صنفٍ منذ الأزل
 *    (وعليه بُني `hasUomDefinition`)، فقراءتُه تقلب الميزة على الأصناف كلّها
 *    في لحظة.
 * ③ وإلّا فراغٌ = «لا قيد» — ولا يُخترع للبند متطلَّبٌ لم يُعلَن.
 *
 * @returns {''|'pallet'|'carton'|'piece'}
 */
export function handlingNeedOf(line, item) {
  const written = normalizeUom(line?.uom);
  if (written) return UOM_HANDLING[written] || '';

  for (const [uom, value] of Object.entries(item?.uomFactors || {})) {
    if (normalizeUom(uom) === 'pallet' && Number(value) > 0) return 'pallet';
  }
  return '';
}

/**
 * يُقيّم موقعًا واحدًا لبندٍ واحد.
 *
 * @param {object} location
 * @param {object} p
 * @param {Map}    [p.pallets] فهرس «الموقع ← طباليه» (`palletsByBin`) — غيابُه
 *                 يعني «لا علمَ بالطبالي» فلا تُحاسَب سعتُها، والحكمُ كما كان.
 * @returns {{ok:boolean, code:string, score:number, reasons:string[], reason:string,
 *            capacityBefore:object, capacityAfter:object}}
 */
export function scoreLocation(location, { line, balances, item, pallets } = {}) {
  const code = normalizeLocationCode(location?.code);
  const qty = num(line?.qty);
  const occ = occupancyOf(location, balances, pallets);

  // ── الرفض أوّلًا: حالةٌ لا تقبل ───────────────────────────────────
  const receive = canReceive(location, occ.usedQty, occ.usedPallets);
  if (!receive.ok) return reject(code, receive.reason, occ);

  // ── نوع التخزين ────────────────────────────────────────────────
  const need = requiredStorageType(line, item);
  const has = String(location?.storageType || '').toLowerCase();
  if (need && has && need !== has) {
    return reject(code, `الصنف يحتاج تخزينًا «${need}» وهذا الرفّ «${has}».`, occ);
  }

  // ── نوع المناولة ───────────────────────────────────────────────
  // بُعدٌ متعامدٌ على الذي قبله لا امتدادٌ له: ذاك «أيّ حرارةٍ تصلح» وهذا
  // «كيف تُناوَل». ويُقلَّد شكلُه حرفًا — رفضٌ عند تعارض **معلَنين**، والفارغُ
  // على أيّ طرفٍ يمرّ (و«مختلط» فراغٌ بحكم `declaredHandling`).
  const needHandling = handlingNeedOf(line, item);
  const hasHandling = declaredHandling(location);
  if (needHandling && hasHandling && needHandling !== hasHandling) {
    return reject(
      code,
      `البند يُناوَل ${handlingLabel(needHandling)} وهذا الرفّ ${handlingLabel(hasHandling)} وحدَه.`,
      occ
    );
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

  if (needHandling && hasHandling && needHandling === hasHandling) {
    score += WEIGHTS.handlingMatch;
    reasons.push(`نوع المناولة مطابق («${handlingLabel(hasHandling)}»).`);
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

  // ★ `capacityBefore`/`capacityAfter` تبقيان بحقولهما الثلاثة كما هي: الشاشةُ
  // تعرضهما، ومقياسُ الطبالي يُقرأ من `occupancyOf` لمن يريده. وحشوُ حقلٍ رابعٍ
  // هنا يُبدّل شكلًا يقرؤه غيري بلا حاجة.
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
 * @param {Map}    [p.pallets]  فهرس «الموقع ← طباليه» — اختياريّ، وغيابُه
 *                 يُبقي الحكم على ما كان: لا سعةَ طبالٍ تُحاسَب.
 * @returns {{candidates:Array, rejected:Array, problem:string}}
 */
export function suggestLocations({ line, locations, balances, item, warehouse, pallets, limit = 5 } = {}) {
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

  const scored = pool.map((l) => scoreLocation(l, { line, balances, item, pallets }));
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
export function chooseVerdict(code, { line, locations, balances, item, pallets } = {}) {
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

  const verdict = scoreLocation(location, { line, balances, item, pallets });
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
