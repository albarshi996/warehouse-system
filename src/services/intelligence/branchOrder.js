/**
 * طلب الفرع المقترَح ‹FNB-302› — «الفرع يراجع لا يُنشئ» — منطق خالص.
 *
 * ═══ المبدأ الحاكم ═══
 * «ويستطيع الفرع **مراجعة الكمية المقترحة**، وليس إنشاء الطلب من صفحة فارغة
 * في كل مرة» (سطر 126). وهذا **مبدأ واجهةٍ حاكم** لا ميزةٌ اختياريّة: صفحةٌ
 * فارغة تُنتج طلبًا من الذاكرة — يُنسى فيه ما لا يُرى نقصُه، ويُطلب فيه ما
 * طُلب أمسِ وهو في الطريق.
 *
 * ═══ وكلّ سطرٍ يحمل مرجعه ═══
 * المقترح · المخزون · المعدّل · بالطريق · الأيّام المتبقّية. فالمراجع يرى
 * **لماذا** هذا الرقم قبل أن يقبله أو يعدّله — واقتراحٌ بلا مرجعٍ يُقبل
 * بالثقة أو يُرفض بالتخمين، وكلاهما يُفسد الرقم.
 *
 * ═══ والاقتراح اقتراحٌ لا إلزام ═══
 * يعدّل الفرع ويحذف ويضيف. والانحراف عن المقترح يُسجَّل بسببه في FNB-303 —
 * وهنا يُقاس ويُعلَن فقط.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { replenishmentPlan } from './operationalIntelligence.js';
import { servedBy } from '../org/openingRequirement.js';
import { suppliesOn, replenishes } from '../org/branchProfile.js';
import { isItemAllowed } from '../items/supplyRoute.js';
import { reasonProblem, OTHER } from '../documents/reasonCodes.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;

/**
 * يبني **مسوّدة طلبِ فرعٍ مملوءة** — لا صفحةً فارغة.
 *
 * @param {object} branch صفّ الفرع (وفيه `profile`)
 * @param {object} ctx
 *   `items` · `moves` · `balances` · `policies` · `dims` · `inTransitBySku` ·
 *   `today` · `fromWarehouse`
 * @returns {{ok, branch, lines, notes, problems, servedBy}}
 *   كلّ سطر: `{sku, suggestQty, qty, onHand, inTransit, rate, daysLeft, urgency, why}`
 *   — و`qty` تبدأ مساويةً للمقترح ثمّ يعدّلها الفرع.
 */
export function buildBranchOrder(branch, ctx = {}) {
  const code = up(branch?.code);
  const profile = branch?.profile || null;
  const problems = [];
  const notes = [];

  if (!code) problems.push('لا رمز فرع.');
  if (branch && branch.level !== 'branch') problems.push('طلب التزويد للفروع وحدها.');
  if (problems.length) return { ok: false, branch: code, lines: [], notes, problems, servedBy: 'opening' };

  // فرعٌ لم يدخل التشغيل المستمرّ يُخدَم بشدّة الافتتاح لا بالمقترح (FNB-204).
  const served = servedBy(branch);
  if (served !== 'replenishment') {
    notes.push(
      `الفرع في حالة «${profile?.state || 'قيد التجهيز'}» — يُخدَم بشدّة الافتتاح لا بالمقترح الدوريّ.`
    );
    return { ok: false, branch: code, lines: [], notes, problems, servedBy: served };
  }

  // ويومٌ لا تصله شاحنة لا يُولَّد له طلب — التقويم من ملفّه (FNB-201).
  if (ctx.today && !suppliesOn(profile, ctx.today)) {
    notes.push(`${ctx.today} ليس من أيّام توريد هذا الفرع — الطلب يُولَّد ليوم توريدٍ قادم.`);
  }

  // الأصناف المعتمَدة للفرع وحدها تدخل المقترح (FNB-203). والقائمة الفارغة
  // تعني «الكلّ مسموح»، فلا يتعطّل فرعٌ لم تُضبط أصنافه.
  const candidates = (ctx.items || []).filter((it) => isItemAllowed(profile, it?.sku));

  const plan = replenishmentPlan({
    items: candidates,
    moves: ctx.moves || [],
    balances: ctx.balances || [],
    today: ctx.today,
    branch: code,
    policies: ctx.policies || null,
    dims: ctx.dims || { branch: code },
    inTransitBySku: ctx.inTransitBySku || null,
    leadDays: ctx.leadDays,
    safetyDays: ctx.safetyDays,
  });

  const lines = plan.map((r) => ({
    sku: r.sku,
    nameAr: r.nameAr,
    suggestQty: r.suggestQty,
    // الكمّيّة تبدأ مساويةً للمقترح — والفرع يعدّلها.
    qty: r.suggestQty,
    uom: str(r.uom),
    // مرجع السطر كاملًا: يراه المراجع قبل أن يقبل.
    onHand: r.onHand,
    inTransit: r.inTransit,
    rate: r.rate,
    daysLeft: r.daysLeft,
    urgency: r.urgency,
    why: r.why,
  }));

  if (!lines.length) {
    notes.push('لا صنف تحت نقطة إعادة الطلب — لا حاجة لطلبٍ اليوم.');
  }

  return { ok: true, branch: code, lines, notes, problems, servedBy: served };
}

/**
 * يحوّل المسوّدة إلى **طلب نقلٍ (TR)** — نفس مستند الطلب القائم لا مستندٌ
 * جديد؛ ويحمل كلّ سطرٍ مقترحَه الأصليّ (`suggestedQty`) فيبقى الانحراف
 * قابلًا للقياس بعد الحفظ لا وقت العرض فقط.
 */
export function toTransferRequest(order, { fromWarehouse = '', requestDate = '' } = {}) {
  return {
    type: 'TR',
    header: {
      requestDate: str(requestDate),
      fromWarehouse: up(fromWarehouse),
      toWarehouse: up(order?.branch),
      costCenter: up(order?.branch),
      purpose: 'تزويد دوريّ',
    },
    lines: (order?.lines || [])
      .filter((l) => num(l.qty) > 0)
      .map((l) => ({
        sku: l.sku,
        description: str(l.nameAr),
        qty: num(l.qty),
        uom: str(l.uom),
        // ‹FNB-303› المقترح مختومٌ على السطر — والانحراف يُقاس منه لا من الذاكرة.
        suggestedQty: num(l.suggestQty),
        notes: str(l.why),
      })),
  };
}

/**
 * انحراف سطرٍ عن مقترحه — يُقاس بالكمّيّة وبالنسبة معًا.
 * النسبة إلى المقترح؛ ومقترحٌ صفريّ مع طلبٍ موجب انحرافٌ كامل (صنفٌ أُضيف يدويًّا).
 */
export function lineDeviation(line) {
  const suggested = num(line?.suggestedQty ?? line?.suggestQty);
  const asked = num(line?.qty);
  const delta = round3(asked - suggested);
  const pct = suggested > 0 ? Math.round((delta / suggested) * 1000) / 10 : asked > 0 ? 100 : 0;
  return { sku: normalizeItemCode(line?.sku), suggested, asked, delta, pct };
}

/**
 * انحرافات الطلب كلّه فوق عتبةٍ — مادّةُ التسجيل في FNB-303.
 * @param {object[]} lines بنود الطلب (بعد تعديل الفرع)
 * @param {{thresholdPct?:number}} [opts]
 */
export function orderDeviations(lines = [], { thresholdPct = 0 } = {}) {
  return (Array.isArray(lines) ? lines : [])
    .map(lineDeviation)
    .filter((d) => d.sku && d.delta !== 0 && Math.abs(d.pct) >= num(thresholdPct))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/** أهذا الفرع مؤهَّلٌ للمقترح الدوريّ أصلًا؟ — للعرض وترتيب ما يُولَّد. */
export function eligibleForReplenishment(branch) {
  return branch?.level === 'branch' && replenishes(branch?.profile?.state);
}

/* ═══════════════ ‹FNB-303› الانحراف يُسجَّل بسببه ═══════════════ */

/** عتبة فتح الاستثناء — تجاوزٌ دونها يُسجَّل ويمرّ صامتًا. */
export const DEVIATION_EXCEPTION_PCT = 25;

/**
 * حكم سطرٍ منحرف: أيلزمه سبب؟ وهل يفتح استثناءً؟ ‹FNB-303›
 *
 * **السلوك المعلَن لق-O04** (حتّى يحسم المالك): يمرّ ويُسجَّل بسببٍ مقيَّد،
 * ويفتح استثناءً عند تجاوز العتبة. ولا يُمنع: مطعمٌ ينتظر إذنًا ليطلب ما
 * يحتاجه يتوقّف عن العمل، والمنعُ يُنتج طلباتٍ خارج النظام لا انضباطًا.
 *
 * @param {object} line سطر الطلب (يحمل `suggestedQty` و`qty` و`reason`)
 * @param {{thresholdPct?:number}} [opts]
 * @returns {{deviated, requiresReason, problem, opensException, deviation}}
 */
export function deviationVerdict(line, { thresholdPct = DEVIATION_EXCEPTION_PCT } = {}) {
  const deviation = lineDeviation(line);
  const deviated = deviation.delta !== 0;
  if (!deviated) {
    return { deviated: false, requiresReason: false, problem: '', opensException: false, deviation };
  }

  // كلّ انحرافٍ يُسأل عن سببه — والسبب من القائمة المقيَّدة، و«أخرى» تُلزم بنصّ.
  // `reasonProblem` تُعيد حكمًا `{ok, problem}` لا نصًّا — يُقرأ كما هو.
  const verdict = reasonProblem('order_deviation', { id: line?.reason, note: line?.reasonNote });
  return {
    deviated: true,
    requiresReason: true,
    problem: verdict.ok ? '' : verdict.problem,
    opensException: Math.abs(deviation.pct) >= num(thresholdPct),
    deviation,
  };
}

/**
 * يبني استثناءً من سطرٍ منحرفٍ فوق العتبة — بمدخلٍ جاهزٍ لـ`shapeException`
 * في السجلّ القائم، لا سجلَّ انحرافاتٍ ثالث.
 */
export function deviationException(branch, line, { thresholdPct = DEVIATION_EXCEPTION_PCT } = {}) {
  const verdict = deviationVerdict(line, { thresholdPct });
  if (!verdict.opensException) return null;
  const d = verdict.deviation;
  return {
    type: 'order_deviation',
    sku: d.sku,
    qty: Math.abs(d.delta),
    location: up(branch),
    reason:
      `طُلب ${d.asked} والمقترح ${d.suggested} (${d.delta > 0 ? '+' : '−'}٪${Math.abs(d.pct)})` +
      `${str(line?.reason) ? ` — السبب: ${str(line.reason)}${str(line?.reasonNote) ? ` (${str(line.reasonNote)})` : ''}` : ' — بلا سببٍ مسجَّل'}`,
  };
}

/**
 * **الانحراف تعلُّمٌ لا لومٌ فقط** ‹FNB-303›: صنفٌ ينحرف في فرعٍ مرارًا في
 * اتّجاهٍ واحد يعني أنّ **المقترح خاطئ** لا أنّ الفرع مخطئ — فيُقترح ضبط
 * Par Level بدل تكرار الاستثناء إلى الأبد.
 *
 * @param {object[]} history سطورٌ تاريخيّة `{branch, sku, suggestedQty, qty}`
 * @param {{minCount?:number, minPct?:number}} [opts]
 * @returns {object[]} `{branch, sku, count, avgPct, suggestion}`
 */
export function policyReviewSignals(history = [], { minCount = 3, minPct = 20 } = {}) {
  const groups = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    const d = lineDeviation(row);
    if (!d.sku || d.delta === 0) continue;
    const key = `${up(row?.branch)}|${d.sku}`;
    const at = groups.get(key) || { branch: up(row?.branch), sku: d.sku, pcts: [] };
    at.pcts.push(d.pct);
    groups.set(key, at);
  }

  const out = [];
  for (const g of groups.values()) {
    if (g.pcts.length < num(minCount)) continue;
    // اتّجاهٌ واحد: كلّها فوق المقترح أو كلّها دونه — والمتذبذب ليس إشارةَ سياسة.
    const allUp = g.pcts.every((p) => p > 0);
    const allDown = g.pcts.every((p) => p < 0);
    if (!allUp && !allDown) continue;
    const avgPct = Math.round((g.pcts.reduce((s2, p) => s2 + p, 0) / g.pcts.length) * 10) / 10;
    if (Math.abs(avgPct) < num(minPct)) continue;
    out.push({
      branch: g.branch,
      sku: g.sku,
      count: g.pcts.length,
      avgPct,
      suggestion: allUp
        ? `ارفع Par Level للصنف «${g.sku}» في «${g.branch}» — تجاوزه المقترح ${g.pcts.length} مرّاتٍ بمعدّل ٪${Math.abs(avgPct)}.`
        : `اخفض Par Level للصنف «${g.sku}» في «${g.branch}» — طُلب دونه ${g.pcts.length} مرّاتٍ بمعدّل ٪${Math.abs(avgPct)}.`,
    });
  }
  return out.sort((a, b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));
}

export { OTHER as DEVIATION_OTHER_REASON };
