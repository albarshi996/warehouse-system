/**
 * منطق عمالة الشحن والتفريغ الخالص — حالات المهمّة، المدّة، الإنتاجيّة،
 * وتخطيط الموارد. بلا Firestore/DOM كي يُختبَر في Node ويُستدعى من الواجهة.
 *
 * المحور الثاني من خطة تطوير البوابة: توثيق وقياس كلّ حركة مناولةٍ ميدانيّة
 * (تنزيل/صرف البضائع)، وربطها بالأوامر التشغيليّة، واستنباط الإنتاجيّة.
 */

/** ورديات العمل («التوكة»). */
export const LABOR_SHIFTS = ['صباحية', 'مسائية', 'ليلية'];

/** أنواع الأوامر التشغيليّة التي تُربط بها مهمّة المناولة (بأنواع مستنداتها). */
export const ORDER_TYPES = {
  receipt: { id: 'receipt', label: 'أمر استلام', docType: 'GRN' },
  transfer: { id: 'transfer', label: 'أمر نقل', docType: 'TRN' },
  delivery: { id: 'delivery', label: 'أمر تسليم', docType: 'DN' },
  container: { id: 'container', label: 'مناولة حاوية', docType: 'CTR' },
  // ‹LOC-401› مهمّتان تُنفَّذان **على مستوى السطر** لا الشحنة كلّها: العامل
  // يخزّن بندًا بندًا ويمسح موقعه، أو يسحب بندًا بندًا من موقعه. وتحملان
  // `lineLevel` كي تعرف الشاشة أنّها تعرض بنودًا لا عدّادَ وحداتٍ واحدًا.
  putaway: { id: 'putaway', label: 'تخزين على الرفوف', docType: 'PUTAWAY', lineLevel: true },
  pick: { id: 'pick', label: 'سحب من الرفوف', docType: 'PICK', lineLevel: true },
};

/** أمهمّةٌ تُنفَّذ بنودًا بندًا بند؟ */
export function isLineLevel(orderTypeId) {
  return Boolean(ORDER_TYPES[orderTypeId]?.lineLevel);
}

export function orderType(id) {
  return ORDER_TYPES[id] || null;
}

/** حالات مهمّة المناولة — آلة حالةٍ صريحة لا نصّ حرّ. */
export const TASK_STATES = {
  pending: { id: 'pending', label: 'بانتظار البدء', color: '#f59e0b' },
  in_progress: { id: 'in_progress', label: 'جارية', color: '#3b82f6' },
  paused: { id: 'paused', label: 'متوقّفة مؤقّتًا', color: '#8b5cf6' },
  done: { id: 'done', label: 'منجزة', color: '#10b981' },
  cancelled: { id: 'cancelled', label: 'ملغاة', color: '#6b7280' },
};

const TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'done'],
  paused: ['in_progress', 'done'],
  done: [],
  cancelled: [],
};

/** هل الانتقال بين حالتين مسموح؟ (يمنع القفز الصامت للمراحل). */
export function canTransitionTask(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function taskState(id) {
  return TASK_STATES[id] || TASK_STATES.pending;
}

/** ميلي-ثانية من طابع Firestore/رقم/نصّ (للحساب الزمنيّ فقط). */
function ms(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const n = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * المدّة الصافية للمهمّة بالدقائق (من البدء للانتهاء ناقص زمن التوقّف).
 * `pausedMs` = إجماليّ ملّي-ثانية التوقّف المتراكم (عدّادٌ تراكميّ، لأن
 * `serverTimestamp` لا يُخزَّن داخل مصفوفات Firestore).
 */
export function taskDurationMinutes(startedAt, finishedAt, pausedMs = 0) {
  const start = ms(startedAt);
  const end = ms(finishedAt);
  if (!start || !end || end < start) return 0;
  const paused = Number(pausedMs) || 0;
  return Math.max(0, Math.round((end - start - paused) / 60000));
}

/**
 * ═══ تقدّم البنود (LOC-401) ═══
 *
 * المهمّة القديمة كانت عدّادَ وحداتٍ واحدًا (`unitsHandled`). ومهمّة التخزين
 * والسحب تُنفَّذ **بندًا بندًا**: صنفٌ يُخزَّن ثمّ آخر، وقد ينتهي الدوام في
 * المنتصف. فالتقدّم يُقاس على السطر.
 */

/**
 * حال بندٍ واحد: المطلوب والمنجَز والمتبقّي.
 * `over` تعني تخزينًا/سحبًا يتجاوز المطلوب — يُعلَن ولا يُبتلع.
 */
export function lineProgress(line) {
  const required = Math.max(0, Number(line?.qtyRequired) || 0);
  const done = Math.max(0, Number(line?.qtyDone) || 0);
  const remaining = Math.max(0, required - done);
  let state = 'pending';
  if (done > required) state = 'over';
  else if (remaining === 0 && required > 0) state = 'done';
  else if (done > 0) state = 'partial';
  return { required, done, remaining, state };
}

/**
 * تقدّم المهمّة كلّها.
 *
 * ★★ **الإنجاز الجزئيّ لا يُغلق المهمّة** (معيار المالك): `complete` لا تصير
 * صحيحة إلّا حين لا يبقى بندٌ ناقص. فمن انتهى دوامه وقد خزّن نصف الشحنة
 * يحفظ ما أنجز، وتبقى المهمّة مفتوحةً بمتبقّيها ظاهرًا لمن يُكملها.
 */
export function taskProgress(lines) {
  const rows = (lines || []).map(lineProgress);
  const totalRequired = rows.reduce((s, r) => s + r.required, 0);
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const doneLines = rows.filter((r) => r.state === 'done' || r.state === 'over').length;
  const remaining = rows.reduce((s, r) => s + r.remaining, 0);
  return {
    lines: rows.length,
    doneLines,
    openLines: rows.length - doneLines,
    totalRequired,
    totalDone,
    remaining,
    pct: totalRequired ? Math.min(100, Math.round((totalDone / totalRequired) * 100)) : 0,
    complete: rows.length > 0 && remaining === 0,
    hasOver: rows.some((r) => r.state === 'over'),
  };
}

/**
 * حكم إنهاء المهمّة.
 *
 * الإنهاء **مسموحٌ ولو بقي متبقٍّ** — العامل قد ينتهي دوامه — لكنّ الشاشة
 * تُعلن ما يبقى صراحةً، والمهمّة تُحفظ بحالة `paused` لا `done` كي لا يظنّ
 * أحدٌ أنّ الشحنة خُزّنت كاملة.
 */
export function finishVerdict(lines) {
  const p = taskProgress(lines);
  if (p.complete) return { nextState: 'done', partial: false, message: '' };
  if (p.totalDone === 0) {
    return { nextState: 'paused', partial: true, message: 'لم يُنجَز شيءٌ بعد — تبقى المهمّة معلّقة كما هي.' };
  }
  return {
    nextState: 'paused',
    partial: true,
    message: `أُنجز ${p.totalDone} من ${p.totalRequired}. يبقى ${p.remaining} في ${p.openLines} بندًا — المهمّة تبقى مفتوحة.`,
  };
}

/** حجم الفريق الفعّال (الأعضاء + سائق الفرك إن وُجد). */
export function crewSize(crew) {
  if (!crew) return 0;
  return (crew.members?.length || 0) + (crew.forkliftDriver?.name ? 1 : 0);
}

/** إنتاجيّة: وحدةٌ لكلّ عاملٍ لكلّ ساعة. يُعيد 0 عند مدخلٍ غير صالح. */
export function throughputPerWorkerHour(unitsHandled, size, durationMinutes) {
  const u = Number(unitsHandled) || 0;
  const c = Number(size) || 0;
  const h = (Number(durationMinutes) || 0) / 60;
  if (u <= 0 || c <= 0 || h <= 0) return 0;
  return Math.round((u / (c * h)) * 100) / 100;
}

/**
 * تخطيط الموارد: كم فريقًا (بحجمٍ معلوم) يلزم لمناولة حجمٍ متوقَّع خلال
 * ساعات الوردية، بناءً على متوسّط الإنتاجيّة التاريخيّة.
 */
export function crewsNeeded(expectedVolume, avgThroughput, size, shiftHours) {
  const v = Number(expectedVolume) || 0;
  const t = Number(avgThroughput) || 0;
  const c = Number(size) || 0;
  const h = Number(shiftHours) || 0;
  if (v <= 0 || t <= 0 || c <= 0 || h <= 0) return 0;
  const capacityPerCrew = t * c * h; // وحدات لكل فريق في الوردية
  return Math.ceil(v / capacityPerCrew);
}

/**
 * ملخّص المهام للوحة: العدد حسب الحالة · متوسّط زمن المهمّة المنجزة ·
 * متوسّط الإنتاجيّة · تجميعٌ حسب الوردية. `crewsById` لاستنتاج حجم الفريق.
 */
export function summarizeTasks(tasks, crewsById = {}) {
  const byState = {};
  let doneCount = 0;
  let totalMinutes = 0;
  let totalThroughput = 0;
  let thrCount = 0;
  const byShift = {};
  for (const t of tasks || []) {
    byState[t.state] = (byState[t.state] || 0) + 1;
    if (t.state !== 'done') continue;
    doneCount += 1;
    const dur = taskDurationMinutes(t.startedAt, t.finishedAt, t.pausedMs);
    totalMinutes += dur;
    const crew = crewsById[t.crewId];
    const size = crewSize(crew);
    const thr = throughputPerWorkerHour(t.unitsHandled, size, dur);
    if (thr > 0) {
      totalThroughput += thr;
      thrCount += 1;
    }
    const shift = crew?.shift || '—';
    byShift[shift] = byShift[shift] || { tasks: 0, units: 0 };
    byShift[shift].tasks += 1;
    byShift[shift].units += Number(t.unitsHandled) || 0;
  }
  return {
    byState,
    doneCount,
    avgDurationMinutes: doneCount ? Math.round(totalMinutes / doneCount) : 0,
    avgThroughput: thrCount ? Math.round((totalThroughput / thrCount) * 100) / 100 : 0,
    byShift,
  };
}
