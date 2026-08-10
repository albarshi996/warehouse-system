/**
 * حساب الإنجاز — المستهدف مقابل المحقّق، وإيقاع الوصول إليه.
 *
 * ═══ لماذا من المستندات لا من دفتر الحركات؟ ═══
 * لأنّ الدفتر **لا يحمل أبعاد الإسناد** عمدًا: الحركة تعرف الصنف والموقع
 * والكميّة، ولا تعرف العميل ولا المركبة ولا خطّ السير (تحمل `postedByUid` وحده).
 * وهذا صوابٌ في تصميمه — الدفتر يوثّق ما تحرّك لا لمن يُنسب. فالأبعاد تعيش في
 * رؤوس المستندات، ومنها يُحسب الإنجاز.
 *
 * والمستند المنجَز (`done`) هو المُقيَّد نفسه — الإنجاز والقيد فعلٌ ذرّيّ واحد
 * (BZ-SCN-001)، فلا فجوة بين ما نحسبه وما وقع.
 *
 * ═══ الإيقاع لا النسبة وحدها ═══
 * «حقّقتَ ٤٠٪» جملةٌ ناقصة. أفي اليوم الثالث أم في الثامن والعشرين؟ الأولى
 * تفوّقٌ والثانية كارثة. فنحسب **الإيقاع**: كم كان يجب أن يُنجَز حتى اليوم،
 * وكم يلزم يوميًّا لبلوغ الهدف. وهذا ما يُحوّل المستهدف من محضر إدانةٍ في آخر
 * الشهر إلى أداةٍ تُعدّل المسار وهو يُسار.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import {
  DIMENSIONS,
  METRICS,
  SALES_DOC_TYPES,
  isWithinPeriod,
  inclusiveDays,
  lineInScope,
  docMatchesDimension,
  visitMatchesDimension,
  parseDay,
} from './targetModel.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** يوم المستند: أوّل حقل تاريخٍ معتبَر في رأسه، فالطابع الزمنيّ للإنجاز. */
export function docDay(doc) {
  const h = doc?.header || {};
  for (const k of ['saleDate', 'deliveryDate', 'depositDate', 'returnDate', 'date', 'docDate']) {
    const v = String(h[k] || '').slice(0, 10);
    if (parseDay(v)) return v;
  }
  const ms = doc?.completedAt?.seconds ? doc.completedAt.seconds * 1000 : null;
  return ms ? new Date(ms).toISOString().slice(0, 10) : '';
}

/** قيمة بندٍ بعد خصمه — لا تنزل تحت الصفر. */
export function lineValue(line) {
  const gross = (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
  return Math.max(0, gross - (Number(line?.discount) || 0));
}

/**
 * يجمع مقاييس المبيعات من المستندات المنجَزة داخل مدّة المستهدف.
 *
 * **المجّانيّ يُحتسب كميّةً لا قيمة** — لأنّه بضاعةٌ خرجت فعلًا (سعرها صفر).
 * وإخفاؤه من الكميّة يُظهر المندوب أقلّ إنتاجًا ممّا هو، وحسابُه في القيمة
 * يُظهر إيرادًا لم يُحصَّل. فيُعدّ في الأولى ويُستثنى من الثانية، ويُعرَض على
 * حدة كي يُرى أثر الترويج لا أن يختفي فيه.
 */
export function salesRollup(target, documents) {
  const dim = DIMENSIONS[target?.dimension];
  const lineDimension = dim && !dim.docField && dim.id !== 'all' ? dim.lineField : null;

  let value = 0;
  let qty = 0;
  let freeQty = 0;
  let freeCount = 0;
  const outlets = new Set();
  const docs = [];

  for (const doc of documents || []) {
    if (!SALES_DOC_TYPES.includes(doc?.type)) continue;
    if (doc?.state !== 'done') continue;
    if (!isWithinPeriod(target, docDay(doc))) continue;
    if (!docMatchesDimension(target, doc)) continue;

    let docQty = 0;
    let docValue = 0;
    for (const line of doc.lines || []) {
      const q = Number(line?.qty) || 0;
      if (q <= 0) continue;
      if (lineDimension && up(line?.[lineDimension]) !== up(target?.dimensionValue)) continue;
      if (!lineInScope(target, line)) continue;

      docQty += q;
      const isFree = Number(line?.unitPrice) === 0;
      if (isFree) {
        freeQty += q;
        freeCount += 1;
      } else {
        docValue += lineValue(line);
      }
    }

    if (docQty <= 0 && docValue <= 0) continue;
    qty += docQty;
    value += docValue;
    const outlet = up(doc?.header?.customerCode);
    if (outlet) outlets.add(outlet);
    docs.push({ id: doc.id, number: doc.number, type: doc.type, day: docDay(doc), qty: docQty, value: round(docValue) });
  }

  return { value: round(value), qty: round(qty), freeQty: round(freeQty), freeCount, outlets: outlets.size, docs };
}

/** يجمع مقاييس الزيارات داخل المدّة. */
export function visitsRollup(target, visits) {
  let done = 0;
  let productive = 0;
  for (const v of visits || []) {
    if (v?.state !== 'checked_out') continue;
    if (!isWithinPeriod(target, String(v?.day || '').slice(0, 10))) continue;
    if (!visitMatchesDimension(target, v)) continue;
    done += 1;
    if (['sale', 'collection'].includes(v?.outcome)) productive += 1;
  }
  return {
    visits: done,
    productive_visits: productive,
    strike_rate: done ? Math.round((productive / done) * 100) : 0,
  };
}

/**
 * إيقاع المدّة: كم مضى منها، وكم كان يجب أن يُنجَز حتى الآن.
 * قبل بدايتها الإيقاع صفر، وبعد نهايتها واحد — فلا تُحسب مطالبةٌ بما لم يحن.
 */
export function periodPace(target, asOf) {
  const total = inclusiveDays(target?.from, target?.to);
  if (!total) return { totalDays: null, elapsedDays: null, ratio: 1, remainingDays: 0 };
  const elapsedRaw = inclusiveDays(target.from, asOf);
  const elapsed = elapsedRaw === null ? 0 : Math.min(total, Math.max(0, elapsedRaw));
  return {
    totalDays: total,
    elapsedDays: elapsed,
    remainingDays: Math.max(0, total - elapsed),
    ratio: total ? elapsed / total : 1,
  };
}

/**
 * حساب إنجاز مستهدفٍ واحد.
 *
 * @returns {{achieved, amount, pct, expected, pacePct, onPace, status,
 *            remainingDays, requiredPerDay, projection, breakdown}}
 */
export function computeAchievement({ target, documents = [], visits = [], asOf } = {}) {
  const metric = METRICS[target?.metric];
  const amount = Number(target?.amount) || 0;

  const sales = metric?.source === 'documents' ? salesRollup(target, documents) : null;
  const vis = metric?.source === 'visits' ? visitsRollup(target, visits) : null;

  let achieved = 0;
  if (metric?.source === 'documents') achieved = Number(sales?.[metric.id]) || 0;
  else if (metric?.source === 'visits') achieved = Number(vis?.[metric.id]) || 0;

  const pace = periodPace(target, asOf);
  const pct = amount > 0 ? Math.round((achieved / amount) * 100) : 0;

  // النسبة المئويّة مقياسٌ لا يتراكم: «نسبة نجاح ٦٠٪» لا تُقاس بإيقاعٍ زمنيّ،
  // فهي حالةٌ لحظيّة لا رصيدٌ يُجمَّع. ولذلك تُستثنى من حساب الإيقاع.
  const cumulative = metric?.id !== 'strike_rate';
  const expected = cumulative ? round(amount * pace.ratio) : amount;
  const pacePct = expected > 0 ? Math.round((achieved / expected) * 100) : achieved > 0 ? 100 : 0;

  const remaining = Math.max(0, amount - achieved);
  const requiredPerDay = cumulative && pace.remainingDays > 0 ? round(remaining / pace.remainingDays) : 0;
  const projection = cumulative && pace.ratio > 0 ? round(achieved / pace.ratio) : achieved;

  let status = 'on_track';
  if (pct >= 100) status = 'achieved';
  else if (pace.remainingDays === 0) status = 'missed';
  else if (pacePct < 80) status = 'behind';
  else if (pacePct < 100) status = 'at_risk';

  return {
    targetId: target?.id || '',
    name: target?.name || '',
    metric: metric?.id || '',
    metricLabel: metric?.labelAr || '',
    unit: metric?.unit || '',
    dimensionLabel: DIMENSIONS[target?.dimension]?.labelAr || '',
    dimensionValue: target?.dimensionValue || '',
    achieved: round(achieved),
    amount,
    pct,
    expected,
    pacePct,
    onPace: pacePct >= 100,
    status,
    remaining: round(remaining),
    requiredPerDay,
    projection,
    ...pace,
    breakdown: sales ? { freeQty: sales.freeQty, freeCount: sales.freeCount, outlets: sales.outlets, docs: sales.docs.length } : vis,
  };
}

/** حالات الإنجاز بتسمياتها — مصدرٌ واحد للواجهة. */
export const STATUS_LABELS = {
  achieved: { id: 'achieved', labelAr: 'مُنجَز', tone: 'good' },
  on_track: { id: 'on_track', labelAr: 'على الإيقاع', tone: 'good' },
  at_risk: { id: 'at_risk', labelAr: 'تحت الإيقاع', tone: 'warn' },
  behind: { id: 'behind', labelAr: 'متأخّر', tone: 'bad' },
  missed: { id: 'missed', labelAr: 'انتهت المدّة دون بلوغه', tone: 'bad' },
};

/** يحسب كلّ المستهدفات ويرتّبها: الأسوأ إيقاعًا أوّلًا — فهو ما يستدعي التدخّل. */
export function computeAll({ targets = [], documents = [], visits = [], asOf } = {}) {
  return (targets || [])
    .filter((t) => t?.active !== false)
    .map((target) => computeAchievement({ target, documents, visits, asOf }))
    .sort((a, b) => a.pacePct - b.pacePct);
}

/** ملخّصٌ لبطاقات اللوحة. */
export function summarize(rows) {
  const list = rows || [];
  return {
    total: list.length,
    achieved: list.filter((r) => r.status === 'achieved').length,
    behind: list.filter((r) => r.status === 'behind' || r.status === 'missed').length,
    atRisk: list.filter((r) => r.status === 'at_risk').length,
    avgPct: list.length ? Math.round(list.reduce((s, r) => s + r.pct, 0) / list.length) : 0,
  };
}

/**
 * لوحة ترتيب لبُعدٍ واحد: نفس المقياس لعدّة أشخاصٍ أو خطوط.
 * تُبنى بتكرار المستهدف على كلّ قيمة — فالمقارنة تكون بين متساوين.
 */
export function leaderboard({ baseTarget, values = [], documents = [], visits = [], asOf } = {}) {
  return values
    .map((v) =>
      computeAchievement({
        target: { ...baseTarget, dimensionValue: v.value, name: v.label || v.value },
        documents,
        visits,
        asOf,
      })
    )
    .sort((a, b) => b.pct - a.pct);
}
