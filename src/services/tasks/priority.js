/**
 * محرّك الأولويّة ‹EXE-302› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ المشكلة ═══
 * الأولويّة اليوم **تُكتب بيدٍ وتجمد**: ثلاث درجات يختارها المدير عند
 * الإنشاء (`PRIORITY_LABELS`) ولا تتغيّر بتغيّر الواقع؛ ومهامّ المناولة بلا
 * حقل أولويّةٍ أصلًا، فترتيبها بتاريخ الإنشاء. فالطلب العاجل خلف الطلب
 * الكبير لأنّه كُتب بعده.
 *
 * ونصّ `تطوير.md`: **«الأولويّة ليست رقمًا ثابتًا بل قرارًا يتغيّر مع الوضع
 * التشغيليّ»** — ولا حاجة لذكاءٍ اصطناعيّ في البداية: عواملُ معلنة بأوزان.
 *
 * ═══ ثلاث قواعد ═══
 *
 * ١. **الدرجة تُعيد عواملها لا رقمها وحده.** «الرقم بلا مرجعٍ لا يُعرض» —
 *    والمشرف الذي يرى «٧٣» ولا يعرف لماذا يتجاهل المحرّك في الأسبوع الثاني.
 *
 * ٢. **قابليّة التنفيذ الآن عاملٌ حاكم لا وزنٌ بين أوزان.** مهمّةٌ بلا رصيدٍ
 *    لا تتصدّر مهما قرب موعدها: إرسالُ عاملٍ إلى رفٍّ فارغ ليس أولويّة، بل
 *    إهدارُ رحلةٍ وإخفاءُ سببِ التعثّر. فتُخفَض وتُعلَن، ولا تُدفَن.
 *
 * ٣. **اليدويّة تبقى وتظهر تجاوزًا معلَنًا.** المدير الذي يرفع مهمّةً لسببٍ
 *    يعرفه ولا يعرفه النظام يجب أن يُطاع — لكن **باسمه ظاهرًا**، فلا يُدهس
 *    قراره ولا يُخلط بحساب المحرّك.
 *
 * والأوزان في مصدرٍ واحدٍ قابلٍ للتعديل (ت-O03) — ومبدئيّةٌ حتى تُضبط بالتجربة.
 */

import { remainingFrom, toMillis } from './dueTime.js';

/**
 * أوزان العوامل — **مبدئيّة ومعلَنة** (ت-O03).
 * مجموعها 100 كي تُقرأ الدرجة نسبةً لا رقمًا مجرّدًا.
 */
export const WEIGHTS = Object.freeze({
  due: 40, // قرب المهلة — أقوى عامل: الموعد الفائت لا يُعوَّض
  age: 15, // عمر المهمّة — كي لا يُنسى القديم تحت زحام الجديد
  customer: 20, // أهمّيّة العميل أو الطلب
  size: 10, // حجم العمل — الصغير يُنجَز فيُفرَّغ الطابور
  resumed: 15, // ما بدأ ولم ينتهِ — تركُه يضاعف المشي
});

/** أهمّيّات الطلب المعتمَدة، ونسبتها من عامل العميل. */
export const IMPORTANCE = Object.freeze({ high: 1, med: 0.5, low: 0.15 });

/** حدّ «الكبير» في عدد البنود — فوقه لا يزيد أثر الحجم. */
export const BIG_TASK_LINES = 40;

/** أقصى عمرٍ يُحتسب بالأيّام — فوقه لا يزيد أثر العمر. */
export const MAX_AGE_DAYS = 7;

const DAY = 86400000;
const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * نصيب المهلة: يقترب من ١ كلّما قرب الموعد، ويبلغه عند التأخّر.
 * وبلا موعدٍ **نصفُ النصيب** لا صفرٌ ولا واحد — الجهل لا يُرقّي ولا يُسقِط.
 */
function dueShare(dueMs, nowMs) {
  const r = remainingFrom(dueMs, nowMs);
  if (r.level === 'none') return { share: 0.5, note: 'بلا موعدٍ معلن' };
  if (r.overdue) return { share: 1, note: r.label };
  // 48 ساعة نافذةُ التدرّج: ما بعدها بعيدٌ سواء.
  return { share: clamp01(1 - r.hours / 48), note: r.label };
}

/**
 * درجة الأولويّة وعواملها.
 *
 * @param {object} task   المهمّة (مباشرةً أو بحمولتها)
 * @param {object} ctx    `{ nowMs, executable, importance, lines, resumed, manualPriority, manualBy }`
 * @returns {{score:number, factors:Array, blocked:boolean, reason:string, manual:object|null}}
 */
export function priorityOf(task, ctx = {}) {
  const nowMs = Number(ctx.nowMs);
  const factors = [];
  const add = (id, label, weight, share, note) => {
    const points = Math.round(weight * clamp01(share));
    factors.push({ id, label, weight, points, note });
    return points;
  };

  let score = 0;

  const due = dueShare(toMillis(ctx.dueAt ?? task?.dueAt ?? task?.mustShipBy), nowMs);
  score += add('due', 'قرب المهلة', WEIGHTS.due, due.share, due.note);

  const createdMs = toMillis(ctx.createdAt ?? task?.createdAt);
  const ageDays = Number.isFinite(createdMs) && Number.isFinite(nowMs) ? Math.max(0, (nowMs - createdMs) / DAY) : 0;
  score += add('age', 'عمر المهمّة', WEIGHTS.age, ageDays / MAX_AGE_DAYS, `${Math.floor(ageDays)} يومًا`);

  const importance = IMPORTANCE[ctx.importance] ?? IMPORTANCE.med;
  score += add('customer', 'أهمّيّة الطلب', WEIGHTS.customer, importance, ctx.importance || 'med');

  const lines = Math.max(0, Number(ctx.lines) || 0);
  // الصغير يتقدّم: نصيبُه يكبر كلّما قلّت بنوده.
  score += add('size', 'حجم العمل', WEIGHTS.size, 1 - Math.min(1, lines / BIG_TASK_LINES), `${lines} بندًا`);

  const resumed = Boolean(ctx.resumed);
  score += add('resumed', 'بدأت ولم تنتهِ', WEIGHTS.resumed, resumed ? 1 : 0, resumed ? 'قيد التنفيذ' : '—');

  // ★ القاعدة ٢: قابليّة التنفيذ حاكمة — تُخفض وتُعلَن ولا تُدفَن.
  const blocked = ctx.executable === false;
  const reason = blocked ? String(ctx.blockReason || 'غير قابلة للتنفيذ الآن — لا رصيد أو لا مورد.') : '';

  // ★ القاعدة ٣: اليدويّة تجاوزٌ معلَن باسم صاحبه.
  const manual = ctx.manualPriority
    ? { level: ctx.manualPriority, by: String(ctx.manualBy || 'المدير'), score: manualScore(ctx.manualPriority) }
    : null;

  return {
    score: Math.max(0, Math.min(100, score)),
    factors,
    blocked,
    reason,
    manual,
  };
}

/** درجةُ التجاوز اليدويّ — فوق كلّ محسوب كي يُطاع، ومتدرّجةٌ بينها. */
export function manualScore(level) {
  return { high: 300, med: 200, low: 100 }[level] ?? 0;
}

/**
 * الدرجة النهائيّة للترتيب.
 *
 * الترتيب ثلاث طبقات لا رقمٌ واحد:
 *   ١ المحجوب دائمًا في الأسفل — مهما علت درجته.
 *   ٢ ثمّ التجاوز اليدويّ فوق المحسوب.
 *   ٣ ثمّ الدرجة المحسوبة.
 */
export function rankValue(verdict) {
  if (verdict?.blocked) return -1;
  return (verdict?.manual?.score || 0) + (verdict?.score || 0);
}

/**
 * يرتّب مهامّ ويُرفق بكلٍّ حكمَها — فالشاشة تعرض السبب ولا تعيد الحساب.
 * @param {Array} items `{ task, ctx }`
 */
export function rankTasks(items, nowMs) {
  return (items || [])
    .map(({ task, ctx }) => ({ task, verdict: priorityOf(task, { ...ctx, nowMs }) }))
    .sort((a, b) => rankValue(b.verdict) - rankValue(a.verdict));
}

/* ═══════════════ الإطلاق وإعادة التعيين ‹EXE-303› ═══════════════ */

/**
 * حالات العمل قبل الميدان: **مقترحة ← مُطلقة**.
 *
 * ولماذا مرحلتان؟ لأنّ المحرّك يرتّب ولا يأمر (ت-O01: النظام يقترح والمشرف
 * يُطلق). ومهمّةٌ تصل جهاز العامل بمجرّد حسابها تجعل المحرّك حاكمًا قبل أن
 * يُجرَّب — وأوّلُ ترتيبٍ خاطئ يُفقده الثقة كلّها.
 */
export const RELEASE_STATE = Object.freeze({ SUGGESTED: 'suggested', RELEASED: 'released' });

/**
 * حكم إطلاق مهمّة إلى الميدان.
 *
 * @returns {{ok:boolean, problem:string, warning:string}}
 *          `problem` يمنع · و`warning` يُعلَن ويُترك للمشرف.
 */
export function releaseVerdict(task, verdict, ctx = {}) {
  if (task?.releaseState === RELEASE_STATE.RELEASED) {
    return { ok: false, problem: 'مُطلقةٌ سلفًا — لا تُطلق مرّتين فتصير مهمّتين.', warning: '' };
  }
  if (!ctx.crewId && !ctx.assigneeUid) {
    return { ok: false, problem: 'اختر المنفّذ أوّلًا — مهمّةٌ بلا منفّذٍ لا تصل أحدًا.', warning: '' };
  }
  if (verdict?.blocked) {
    // ★ لا تُمنع: المشرف قد يعلم أنّ الرصيد في الطريق. لكنّه يُطلقها **عالِمًا**.
    return { ok: true, problem: '', warning: `تُطلَق وهي مؤجَّلة: ${verdict.reason}` };
  }
  return { ok: true, problem: '', warning: '' };
}

/**
 * حكم إعادة التعيين — والسبب **مطلوب**.
 *
 * نقلُ عملٍ من عاملٍ إلى آخر بلا سبب يجعل تقرير الإنتاجيّة يظلم الأوّل: يظهر
 * أنّه بدأ ولم يُنهِ، ولا يُعرف أنّ المشرف سحبها منه لأمرٍ أعجل.
 */
export function reassignVerdict(task, { toUid, reason } = {}) {
  if (!toUid) return { ok: false, problem: 'اختر المُسنَد إليه الجديد.' };
  if (toUid === (task?.assigneeUid || task?.crewId)) return { ok: false, problem: 'هو المنفّذ نفسه — لا تغيير.' };
  if (!String(reason || '').trim()) {
    return { ok: false, problem: 'سبب إعادة التعيين مطلوب — بلاه يظلم التقريرُ من سُحبت منه.' };
  }
  return { ok: true, problem: '' };
}

/** شرحٌ للمشرف — العوامل الأكبر أثرًا أوّلًا، والصفرُ لا يُعرض. */
export function explain(verdict, limit = 3) {
  const top = (verdict?.factors || [])
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((f) => `${f.label} (${f.points})${f.note && f.note !== '—' ? ` — ${f.note}` : ''}`);

  if (verdict?.blocked) return `مؤجَّلة: ${verdict.reason}`;
  if (verdict?.manual) return `تجاوزٌ يدويّ من ${verdict.manual.by} · ${top.join(' · ')}`;
  return top.join(' · ') || 'لا عامل مؤثّر';
}
