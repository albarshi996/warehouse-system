/**
 * مهمّة التحضير — من أمرٍ معتمدٍ محجوز إلى مهمّةٍ تُسنَد لمحضّر. منطق خالص.
 *
 * المشكلة التي تحلّها: `pickPlan.js` يرتّب مسار السحب منذ خطة LOC، ويعرف
 * أيّ رفٍّ لأيّ بند وبأيّ ترتيبٍ يُمشى. **ولا مهمّةَ تحمل ذلك إلى محضّر**:
 * الخطّة تُطبع ورقةً أو تُقرأ على شاشةٍ إداريّة، والمحضّر يمشي بذاكرته.
 *
 * والمهمّة تُغلق الحلقة: تُشتقّ من الخطّة القائمة، وتُسنَد باسم، وتُنفَّذ
 * بالمسح، وتُقفل بحمولةٍ لها هويّة.
 *
 * ═══ القاعدة الحاكمة (خطة ٧ · القاعدة ١) ═══
 * **لا تحضير دون مستندٍ معتمد.** فالمهمّة تُشتقّ من مستند سحبٍ (PICK) أو
 * أمر بيعٍ أو نقلٍ معتمد — ولا تُفتح «مهمّة حرّة» يسحب بها من شاء ما شاء.
 *
 * والترتيب من `pickPlan` استدعاءً لا نسخًا: مسارٌ ثانٍ يُحسب هنا كان
 * سيفترق عن مسار الشاشة الإداريّة يومًا، فيمشي المحضّر غير ما خُطّط له.
 */

import { normalizeLocationCode } from '../locations/locationCode.js';
import { pickPlan } from '../locations/pickPlan.js';
import { canDeriveFrom } from '../documents/states.js';

/** حالات مهمّة التحضير. */
export const PICK_TASK_STATES = Object.freeze({
  OPEN: 'مفتوحة',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'منفَّذة',
  CANCELLED: 'ملغاة',
});

/** أنواع المستندات التي يُشتقّ منها تحضير — والنقل منها عمدًا (م٤). */
export const PICKABLE_TYPES = Object.freeze(['PICK', 'SO', 'TR']);

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * سبب رفض فتح مهمّة تحضير — أو '' إن جازت.
 *
 * الترتيب هو الحارس: المستند قبل حالته، وحالته قبل محتواه — فأوّل ما
 * يُقال للمشرف أوّلُ ما يُصلحه.
 */
export function taskOpenProblem(doc, plan) {
  if (!doc?.id) return 'لا مستند — لا تحضير بلا أمرٍ معتمد (القاعدة ١).';
  if (!PICKABLE_TYPES.includes(doc.type)) {
    return `التحضير من ${PICKABLE_TYPES.join(' أو ')} — والممرَّر «${doc.type ?? '؟'}».`;
  }
  if (!canDeriveFrom(doc.state)) {
    return `المستند «${doc.number ?? doc.id}» حالته «${doc.state ?? '؟'}» — لا يُحضَّر عليه حتى يُعتمد.`;
  }
  if (!plan || (plan.lines ?? []).length === 0) return 'المستند بلا بنودٍ قابلةٍ للسحب.';
  return '';
}

/**
 * فتح مهمّة تحضير من مستندٍ معتمد.
 *
 * ★ النقص **لا يمنع** فتح المهمّة: المستودع يسحب ما عنده ويُعلن ما نقص.
 * ومنعُ المهمّة كلّها لأجل بندٍ ناقص يوقف تسعةً صالحة — وهو ما تفعله
 * الأنظمة التي يتحايل عليها الناس بالورق.
 *
 * @returns {{task:object}|{problem:string}}
 */
export function openPickTask(doc, balances, { actor, at, assignee = '', nowMs, grid = null } = {}) {
  const plan = pickPlan(doc, balances, { nowMs, grid });
  const problem = taskOpenProblem(doc, plan);
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'مهمّةٌ بلا فاعلٍ لا تُفتح — من أسندها؟' };

  // خطوةٌ لكلّ (موقع × بند) من المسار القائم — بترتيبه لا بترتيبٍ ثانٍ.
  const steps = (plan.path ?? []).map((s, i) => ({
    seq: i + 1,
    bin: normalizeLocationCode(s.bin),
    sku: up(s.sku),
    barcode: String(s.barcode ?? '').trim(),
    batch: up(s.batch),
    expiry: String(s.expiry ?? '').trim(),
    required: Number(s.qty) || 0,
    picked: 0,
    state: 'PENDING',
  }));

  return {
    task: {
      state: 'OPEN',
      source: { type: doc.type, id: doc.id, number: doc.number ?? '' },
      warehouse: plan.warehouse ?? up(doc?.header?.warehouse),
      assignee: String(assignee ?? '').trim(),
      steps,
      // النقص يُعلَن مع المهمّة — يمشي المحضّر عالمًا لا مفاجَأً عند الرفّ.
      shortages: (plan.shortages ?? []).map((s) => ({ sku: up(s.sku), requested: s.requested, shortfall: s.shortfall })),
      pathBasis: plan.pathBasis ?? '',
      route: plan.route ?? null,
      issuePallets: [],
      openedBy: String(actor).trim(),
      openedAt: at ?? null,
    },
  };
}

/** الخطوة الجارية — أوّل ما لم يكتمل، بترتيب المسار. */
export function currentStep(task) {
  return (task?.steps ?? []).find((s) => s.state !== 'DONE' && s.state !== 'SKIPPED') ?? null;
}

/** المتبقّي على خطوة. */
export function stepRemaining(step) {
  return Math.max(0, (Number(step?.required) || 0) - (Number(step?.picked) || 0));
}

/** خلاصة المهمّة للشاشة — تُشتقّ لحظيًّا ولا تُخزَّن. */
export function taskTotals(task) {
  const steps = task?.steps ?? [];
  const required = steps.reduce((s, x) => s + (Number(x.required) || 0), 0);
  const picked = steps.reduce((s, x) => s + (Number(x.picked) || 0), 0);
  return {
    required,
    picked,
    remaining: steps.reduce((s, x) => s + stepRemaining(x), 0),
    stepCount: steps.length,
    doneSteps: steps.filter((s) => s.state === 'DONE').length,
    skipped: steps.filter((s) => s.state === 'SKIPPED').length,
    percent: required > 0 ? Math.round((picked / required) * 100) : 0,
  };
}

/** إسنادُ المهمّة لمحضّر — والمسندة لغيره لا تُنتزع بلا قرار. */
export function assignTask(task, { assignee, actor, force = false } = {}) {
  if (!String(assignee ?? '').trim()) return { problem: 'إسنادٌ بلا محضّر لا معنى له.' };
  if (!String(actor ?? '').trim()) return { problem: 'الإسناد بلا فاعلٍ لا يُسجَّل.' };
  if (task?.assignee && task.assignee !== assignee && !force) {
    return { problem: `المهمّة مسندةٌ إلى «${task.assignee}» — نزعُها منه قرارُ مشرفٍ صريح لا إسنادٌ عابر.` };
  }
  return { task: { ...task, assignee: String(assignee).trim(), assignedBy: String(actor).trim() } };
}

/**
 * تخطّي خطوة — بسببٍ إلزاميّ.
 *
 * الرفُّ فارغٌ فعلًا، أو البضاعة تالفةٌ في مكانها. والتخطّي **يُعلَن ولا
 * يُبتلع**: يظهر في خلاصة المهمّة وفي فرق التنفيذ، فيُعرف أنّ الأمر خرج
 * ناقصًا ولماذا.
 */
export function skipStep(task, seq, { reason, actor } = {}) {
  const step = (task?.steps ?? []).find((s) => s.seq === seq);
  if (!step) return { problem: `الخطوة ${seq} ليست في هذه المهمّة.` };
  if (step.state === 'DONE') return { problem: 'خطوةٌ منفَّذة لا تُتخطّى — صحّحها بحركةٍ عكسيةٍ إن لزم.' };
  if (!String(reason ?? '').trim()) {
    return { problem: 'التخطّي يحتاج سببًا مكتوبًا — الأمر سيخرج ناقصًا، ومن يقرأ التقرير يسأل لماذا.' };
  }
  if (!String(actor ?? '').trim()) return { problem: 'التخطّي بلا فاعلٍ لا يُسجَّل.' };
  return {
    task: {
      ...task,
      steps: task.steps.map((s) => (s.seq === seq ? { ...s, state: 'SKIPPED', skipReason: String(reason).trim(), skippedBy: String(actor).trim() } : s)),
    },
  };
}

/** سبب رفض إقفال المهمّة — أو '' إن جاز. */
export function taskCloseProblem(task) {
  if (!['OPEN', 'IN_PROGRESS'].includes(task?.state)) {
    return `المهمّة «${PICK_TASK_STATES[task?.state] ?? '؟'}» — لا تُقفل مرّتين.`;
  }
  const pending = (task?.steps ?? []).filter((s) => s.state === 'PENDING');
  if (pending.length > 0) {
    return `${pending.length} خطوةً لم تُنفَّذ ولم تُتخطَّ — نفّذها أو تخطَّها بسبب. الإقفال على خطوةٍ منسيّةٍ يجعل النقص مجهول السبب.`;
  }
  return '';
}

/** إقفال المهمّة. */
export function closePickTask(task, { actor, at } = {}) {
  const problem = taskCloseProblem(task);
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'الإقفال بلا فاعلٍ لا يُسجَّل.' };
  return { task: { ...task, state: 'DONE', closedBy: String(actor).trim(), closedAt: at ?? null } };
}

/**
 * فرقُ التنفيذ: المطلوب مقابل المسحوب لكلّ صنف — ومنه يُبنى التنفيذ الجزئيّ
 * وقرارُ الـBack Order (خطة ٧ ثانيًا).
 */
export function fulfillmentGap(task) {
  const by = new Map();
  for (const s of task?.steps ?? []) {
    const e = by.get(s.sku) ?? { sku: s.sku, required: 0, picked: 0, skipped: 0, reasons: [] };
    e.required += Number(s.required) || 0;
    e.picked += Number(s.picked) || 0;
    if (s.state === 'SKIPPED') {
      e.skipped += stepRemaining(s);
      if (s.skipReason && !e.reasons.includes(s.skipReason)) e.reasons.push(s.skipReason);
    }
    by.set(s.sku, e);
  }
  return [...by.values()]
    .map((e) => ({ ...e, gap: Math.max(0, e.required - e.picked) }))
    .filter((e) => e.gap > 0)
    .sort((a, b) => b.gap - a.gap);
}
