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
import { normalizeUom } from '../items/uomModel.js';

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
 * ★★★ هويّةُ مهمّة التحضير — معرّفٌ حتميٌّ يُشتقّ من المستند الآمر.
 *
 * ═══ العطب الذي تسدّه ═══
 * كانت المهمّة تُكتب بمعرّفٍ عشوائيّ ولا مفتاحَ تفرّدٍ لها. فضغطتان على الزرّ
 * — أو ضغطةٌ فشبكةٌ بطيئةٌ فضغطةٌ ثانية — تكتبان **مهمّتين على أمرٍ واحد**:
 * مُحضّران يمشيان إلى الرفّ نفسِه للبضاعة نفسِها، ويسحب كلٌّ منهما ما سحبه
 * الآخر. والفارقُ لا يظهر إلّا في جرد الشهر القادم، حين لا يبقى من يتذكّر.
 *
 * والمعرّفُ الحتميّ يجعل التفرّد **هويّةً في قاعدة البيانات لا فحصًا يسبقها**
 * — وهو مقصدُ `taskFactory.taskKey` نفسُه، ومقصدُ `barcodes/{value}` حيث
 * المعرّفُ هو القيمة.
 *
 * ★★ ولا يُرفع الحرفُ إلى الكبير هنا (بخلاف مفاتيح الأرصدة): معرّفات Firestore
 * حسّاسةٌ للحالة، ورفعُها كان سيجعل مستندَي `aBc` و`abc` مهمّةً واحدة.
 *
 * @returns {string} `PICK__{docId}` — و`''` لمستندٍ بلا معرّف، كي لا تجتمع
 *   مهامُّ المستندات المجهولة كلُّها في مستندٍ واحدٍ اسمُه `PICK__`.
 */
export function pickTaskId(doc) {
  // ما يكسر معرّف مستند Firestore يُبدَّل — تطبيعُ `eventId` نفسُه في الخدمة.
  const id = String(doc?.id ?? '').trim().replace(/[/.#$[\]\s]/g, '_');
  return id ? `PICK__${id}` : '';
}

/**
 * ★★★ سببُ رفض مهمّةٍ ثانيةٍ على أمرٍ له مهمّة — أو `''` إن لم يكن له.
 *
 * ولماذا يُرفض حتّى المنفَّذُ والملغى؟ لأنّ قاعدة أمان `picking_tasks` تُجيز
 * التحديث ما دام المصدرُ والمستودعُ والفاتحُ بلا تغيير — فكتابةٌ ثانيةٌ على
 * المعرّف الحتميّ نفسِه **تمرّ وتمحو `steps`**: أي تقدُّمَ مُحضّرٍ يعمل الآن،
 * أو سجلَّ سحبٍ وقع فعلًا وبُنيت عليه طبليةُ صرفٍ وشحنةٌ خرجت. فحتميّةُ
 * المعرّف وحدَها لا تكفي — يلزم فحصُ وجودٍ **داخل معاملة** يردّ بهذا السبب.
 *
 * والسببُ **يسمّي القائمة ومن بيده**: «مهمّةٌ مفتوحة» بلا اسمٍ تجعل المشرف
 * يفتح ثانيةً ظنًّا أنّ الأولى ضاعت.
 *
 * ⚠️ وثمنُه معلَنٌ لا مخفيّ: أمرٌ أُلغيت مهمّتُه أو أُقفلت لا تُفتح له ثانيةٌ
 * من هذا الباب. إعادةُ الفتح قرارٌ له بابُه (استئنافُ القائمة، أو معرّفٌ
 * بمحاولةٍ ثانية) — ولا تُشتقّ صمتًا من دهسِ سجلٍّ قائم.
 */
export function pickTaskDuplicateProblem(existing, doc) {
  if (!existing) return '';
  const number = String(
    existing?.source?.number || existing?.source?.id || doc?.number || doc?.id || '؟'
  ).trim();
  if (['OPEN', 'IN_PROGRESS'].includes(existing?.state)) {
    const who = String(existing?.assignee ?? '').trim();
    const hand = who ? ` وهي بيد «${who}»` : '';
    return `على الأمر ${number} مهمّةُ تحضيرٍ مفتوحةٌ سلفًا${hand} — افتحها ولا تفتح ثانية؛ فمهمّتان على أمرٍ واحدٍ تعنيان محضّرَين يمشيان إلى الرفّ نفسِه.`;
  }
  return `على الأمر ${number} مهمّةُ تحضيرٍ «${PICK_TASK_STATES[existing?.state] ?? '؟'}» سلفًا — لا تُفتح ثانيةٌ فوقها، فكتابتُها تمحو ما سُحب.`;
}

/**
 * ★★★ وحدةُ الخطوة ومعاملُها — «الكمّيّة بلا وحدةٍ رقمٌ بلا معنى».
 *
 * ═══ العطب الذي تسدّه ═══
 * كانت الخطوة تحمل رقمًا عاريًا: `required` وحدَه بلا ما يقول **ماذا يُعدّ**.
 * فمن وقف أمام الرفّ وسحب كرتونًا وكتب «١» خصم النظامُ قطعةً واحدة، والفارقُ
 * اثنا عشر ضعفًا **لا يظهر إلّا في جرد الشهر القادم** — حين لا يبقى من يتذكّر
 * أيّ سحبةٍ كذبت. فالخطوة تحمل وحدتَها ومعاملَها معها، ومنهما تُحسب الكمّيّة
 * الأساس **حسابًا** لا افتراضًا.
 *
 * ═══ ثلاثةُ مصادرَ بترتيب الأخصّ فالأعمّ ═══
 *   ① خطوةُ المسار نفسُها (`pickPlan.path`) — أخصُّها: تعرف الرفَّ والتشغيلة.
 *   ② صفُّ الرصيد الذي خُصّص منه — يعرف ما على هذا الرفّ بعينه.
 *   ③ سطرُ المستند الآمر — ووحدتُه هي التي كُتب بها `required` أصلًا، إذ
 *      `pickPlan` يوزّع `qtyRequested` على الأرفف ولا يبدّل وحدتَه.
 *
 * ⚠️ **والكاتبُ اليوم ثالثُها وحدَه، ويُقال ولا يُخفى**: `pickPathOrder` لا
 * ينقل وحدةً بعد، وشيتُ الأرصدة بلا عمود وحدة أصلًا. فالأوّلان يُقرآن استعدادًا
 * ليومٍ يكتبهما كاتب — لا ادّعاءً بأنّهما يعملان اليوم. (ودرسُ «حارسٍ يقرأ حقلًا
 * لا يُكتب أبدًا» هو سببُ هذه الفقرة: القارئ الصامت يُوهم بميزةٍ لا وجودَ لها.)
 *
 * ★ والمعاملُ يُقرأ من مصدر الوحدة نفسِه لا من أيٍّ كان: معاملُ سطرٍ بالكرتون
 * لا يصف خطوةً بالقطعة، ولذلك يُفحص `uomFactorFor` كما يفحصه `refreshLineBase`.
 *
 * @returns {{uom:string, factor:number|null, baseUom:string}|null} و`null` تعني
 *   «لا وحدةَ معلنة» — فتبقى الخطوة بحقولها كما كانت حرفًا.
 */
export function stepUnitOf(pathStep, balanceRow, docLine) {
  return unitOfSource(pathStep) ?? unitOfSource(balanceRow) ?? unitOfSource(docLine);
}

/** وحدةُ مصدرٍ واحد — أو `null` إن لم يُعلن وحدةً أصلًا. */
function unitOfSource(src) {
  const uom = String(src?.uom ?? '').trim();
  if (!uom) return null;
  return { uom, factor: factorOfSource(src, uom), baseUom: String(src?.baseUom ?? '').trim() };
}

/**
 * معاملُ مصدرٍ إلى وحدة الأساس — و`null` تعني **لا أعرف** لا «صفر».
 *
 * ⚠️ صفرٌ أو سالبٌ يُردّ إلى `null` عمدًا: الصفر يُنتج مجموعًا صفريًّا صامتًا،
 * وهو أخطر من الامتناع المعلَن (نفس حكم `factorProblems` في محرّك الوحدات).
 */
function factorOfSource(src, uom) {
  const raw = Number(src?.factor ?? src?.uomFactor);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  // معاملٌ مختومٌ لوحدةٍ أخرى لا يصف هذه: «كرتون المورّد» لا يلتصق بـ«قطعة»
  // حين تُبدَّل الوحدة — شرطُ `refreshLineBase` نفسُه، وإلّا افترق الحكمان.
  const stampedFor = String(src?.uomFactorFor ?? '').trim();
  if (stampedFor && (normalizeUom(stampedFor) || stampedFor) !== (normalizeUom(uom) || uom)) return null;
  return raw;
}

/**
 * صفُّ الرصيد الذي خُصّصت منه هذه الخطوة — بمفتاحه الميدانيّ لا بمعرّفه، لأنّ
 * `pickPathOrder` لا ينقل `balanceId` إلى المسار.
 */
function balanceRowFor(pathStep, balances, warehouse) {
  const item = up(pathStep?.sku) || up(pathStep?.barcode);
  if (!item) return null;
  const bin = normalizeLocationCode(pathStep?.bin);
  const batch = up(pathStep?.batch);
  return (balances ?? []).find(
    (b) =>
      (up(b?.sku) === item || up(b?.barcode) === item)
      && (!warehouse || up(b?.warehouse) === warehouse)
      && normalizeLocationCode(b?.bin) === bin
      && up(b?.batch) === batch
  ) ?? null;
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
  const steps = (plan.path ?? []).map((s, i) => {
    const step = {
      seq: i + 1,
      bin: normalizeLocationCode(s.bin),
      sku: up(s.sku),
      barcode: String(s.barcode ?? '').trim(),
      batch: up(s.batch),
      expiry: String(s.expiry ?? '').trim(),
      required: Number(s.qty) || 0,
      picked: 0,
      state: 'PENDING',
    };
    /*
     * ★★ الوحدةُ تُلحق **حين تُعرف وحدها** — وهو عينُ ترحيل `balanceId`:
     * خطوةٌ لصنفٍ بلا وحدةٍ تخرج بحقولها التسعة كما كانت حرفًا، فلا يفترق
     * شكلُ مهمّةٍ قديمةٍ عن شكل مهمّةٍ جديدةٍ لصنفٍ لم يُعرَّف. والحقولُ
     * الثلاثة لا تُكتب فارغةً لتُقرأ فارغة — تُكتب حين تقول شيئًا.
     */
    const unit = stepUnitOf(s, balanceRowFor(s, balances, plan.warehouse), doc?.lines?.[s.lineIndex]);
    return unit ? { ...step, ...unit } : step;
  });

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
