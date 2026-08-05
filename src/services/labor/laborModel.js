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
};

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
