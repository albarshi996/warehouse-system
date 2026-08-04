/**
 * آلية معدّل الاستجابة — حساباتٌ نقيّة من قائمة المهام (بلا Firestore، قابلة للاختبار).
 *
 * المدخل: مصفوفة مهامٍ مُطبّعة، لكل مهمّة:
 *   { assigneeUid, assigneeName, status, priority, dueDate, dueTime,
 *     createdAtMs, acknowledgedAtMs, doneAtMs }   (الأوقات ميلي-ثانية أو null)
 *
 * المخرَج: ملخّص عامّ + صفٌّ لكل مُسنَدٍ إليه، فيها:
 *   - معدّل الاستجابة  = (تفاعل معها: اطّلع أو أنجز) ÷ (المُسنَدة غير الملغاة)
 *   - معدّل الإنجاز     = المنجَزة ÷ (المُسنَدة غير الملغاة)
 *   - الالتزام بالموعد  = المنجَزة في وقتها ÷ المنجَزة
 *   - متوسّط زمن الاطّلاع/الإنجاز بالساعات
 */
import { TASK_STATUS, dueMillis } from './taskShape.js';

const HOUR_MS = 3600 * 1000;

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** نسبة مئويّة صحيحة (0 حين لا مقام). */
function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** متوسّط بالساعات لقيَمٍ بالميلي-ثانية (مُقرّب لخانة، أو null إن فارغة). */
function avgHours(list) {
  if (!list.length) return null;
  const sum = list.reduce((a, b) => a + b, 0);
  return round1(sum / list.length / HOUR_MS);
}

/** هل المهمّة متأخّرة الآن؟ (غير منجَزة ولا ملغاة وتجاوزت استحقاقها) */
export function isOverdue(task, nowMs) {
  if (task.status === TASK_STATUS.DONE || task.status === TASK_STATUS.CANCELED) return false;
  const due = dueMillis(task.dueDate, task.dueTime);
  return due != null && due < nowMs;
}

/** يجمع مقاييس مهامّ مُسنَدٍ إليه واحد. */
function summarize(tasks, nowMs) {
  const counted = tasks.filter((t) => t.status !== TASK_STATUS.CANCELED);
  const canceled = tasks.length - counted.length;
  const done = counted.filter((t) => t.status === TASK_STATUS.DONE);
  // «تفاعل معها» = خرجت من حالة «مُسندة» (اطّلع/نفّذ/أنجز) — أي استجاب لها.
  const responded = counted.filter((t) => t.status !== TASK_STATUS.ASSIGNED);
  const overdue = counted.filter((t) => isOverdue(t, nowMs));

  const ackDurations = counted
    .filter((t) => t.acknowledgedAtMs && t.createdAtMs)
    .map((t) => Math.max(0, t.acknowledgedAtMs - t.createdAtMs));
  const doneDurations = done
    .filter((t) => t.doneAtMs && t.createdAtMs)
    .map((t) => Math.max(0, t.doneAtMs - t.createdAtMs));
  const onTime = done.filter((t) => {
    const due = dueMillis(t.dueDate, t.dueTime);
    return due != null && t.doneAtMs != null && t.doneAtMs <= due;
  });

  return {
    total: tasks.length,
    active: counted.length,
    canceled,
    done: done.length,
    open: counted.length - done.length,
    overdue: overdue.length,
    responded: responded.length,
    responseRate: pct(responded.length, counted.length),
    completionRate: pct(done.length, counted.length),
    onTimeRate: pct(onTime.length, done.length),
    avgAckHours: avgHours(ackDurations),
    avgDoneHours: avgHours(doneDurations),
  };
}

/**
 * يحسب المقاييس لكل مُسنَدٍ إليه + ملخّصًا عامًّا.
 * `nowMs` مُمرَّرٌ ليكون الحساب حتميًّا في الاختبار (افتراضه الآن).
 */
export function computeResponseMetrics(tasks, nowMs = Date.now()) {
  const list = Array.isArray(tasks) ? tasks : [];

  const byUser = new Map();
  for (const t of list) {
    const uid = t.assigneeUid || '—';
    if (!byUser.has(uid)) {
      byUser.set(uid, { assigneeUid: uid, assigneeName: t.assigneeName || 'غير معروف', tasks: [] });
    }
    byUser.get(uid).tasks.push(t);
  }

  const perUser = Array.from(byUser.values())
    .map((u) => ({ assigneeUid: u.assigneeUid, assigneeName: u.assigneeName, ...summarize(u.tasks, nowMs) }))
    // الأكثر مهامًّا أولًا، ثم الأدنى استجابةً (لِيَظهر المتعثّرون للمدير).
    .sort((a, b) => b.total - a.total || a.responseRate - b.responseRate);

  return { overall: summarize(list, nowMs), perUser };
}
