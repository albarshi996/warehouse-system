/**
 * الزمن المعياريّ ‹EXE-701› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ العطب (ف ت‑٨) ═══
 * `laborModel.js` يقيس **الفعليّ** بدقّة: مدّة المهمّة بأختام الخادم،
 * والإنتاجيّة وحدةً لكلّ عاملٍ لكلّ ساعة. ولا شيء يقارنه به. فالرقم **يصف
 * ولا يكشف**: «أنجز الفريق ٤٠ وحدة في ساعة» — أهذا جيّد أم رديء؟ لا جواب.
 * ومشرفٌ لا يعرف المتوقَّع لا يعرف أين المشكلة، فيحكم بانطباعه أو لا يحكم.
 *
 * ═══ ★★ والمعياريّ **مجموعُ عناصر** لا رقمٌ يُفترض ═══
 * أسهلُ ما يُفعل أن يُكتب «المعياريّ: ٣٠ دقيقة للمهمّة» — ورقمٌ كهذا لا
 * يُدافَع عنه ولا يُصحَّح: لا يُعرف ممّ تكوّن، فإن خالف الواقع لم يُعرف أيّ
 * جزءٍ منه غلط. فيُبنى من **عناصرَ معلنة** يراها المشرف واحدًا واحدًا:
 *
 *   استلام المهمّة · انتقال · مسح · مناولة · ثمّ سماحٌ نسبةً على مجموعها
 *
 * فمن رأى «الانتقال ١٢ دقيقة من أصل ٢٠» عرف أنّ العلاج **ترتيب المواقع**
 * لا حثّ العامل. وهذا كلّه نصّ `تطوير.md`: المعيار أداةُ اكتشافِ مشكلة.
 *
 * ═══ وعنصر الانتقال **تقديريٌّ ويُعلن أنّه كذلك** ═══
 * المسافة الحقيقيّة تحتاج إحداثيّات الموقع وشبكة الممرّات — وهي ت٨ ولم تُبنَ
 * بعد. فيُقدَّر الانتقال بثوانٍ ثابتةٍ لكلّ سطر، **ويحمل `basis:'estimated'`
 * وسببَه**. ومتى جاءت ت٨ بمسافةٍ مقيسة مُرّرت في `distanceMeters` فانقلب
 * الأساس إلى `measured` بلا تغيير شكل المخرج ولا الشاشة. ورقمٌ تقديريٌّ
 * يُعرض كأنّه مقيس أسوأ من غيابه (نفس قاعدة ت-O07).
 *
 * ═══ ★★ والإعداد **إصداراتٌ لا قيمةٌ تُدهس** ═══
 * لو عُدّل المعياريّ في مكانه لتغيّر حكمُ **كلّ قراءةٍ ماضية** بأثرٍ رجعيّ:
 * فريقٌ كان منضبطًا أمسِ يصير متجاوزًا اليوم بلا أن يفعل شيئًا. فكلّ تعديلٍ
 * **إصدارٌ جديد بتاريخ سريان**، والقراءة تُحاسَب بالإصدار الذي كان ساريًا
 * **لحظةَ وقوعها**. وهو نفس مبدأ الدفتر الملحق-فقط: التصحيح قيدٌ جديد لا
 * محوٌ لما مضى.
 *
 * والزمن يُمرَّر (`atMs`) ولا يُقرأ.
 */

import { toMillis } from '../documents/inbox.js';
import { taskProgress } from './laborModel.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v) => String(v ?? '').trim();

/**
 * العناصر الخمسة — **قائمةٌ واحدة** يقرؤها الحساب والشاشة والحارس.
 *
 * `per` يقول بأيّ شيءٍ يُضرب العنصر:
 *   task    — مرّةً واحدة لكلّ مهمّة
 *   line    — لكلّ سطرٍ (موقعٍ يُزار)
 *   unit    — لكلّ وحدةٍ تُناوَل
 *   percent — نسبةٌ على مجموع ما سبق (لا ثوانٍ تُضاف)
 */
export const STANDARD_ELEMENTS = Object.freeze([
  { id: 'setup', label: 'استلام المهمّة', per: 'task', hint: 'قراءة المهمّة وتجهيز المعدّة — مرّةً لكلّ مهمّة' },
  { id: 'travel', label: 'انتقال', per: 'line', hint: 'المشي بين المواقع — يُقاس بالمسافة حين تأتي ت٨' },
  { id: 'scan', label: 'مسح', per: 'line', hint: 'مسح الموقع والصنف تأكيدًا للتنفيذ' },
  { id: 'handle', label: 'مناولة', per: 'unit', hint: 'الرفع والوضع — لكلّ وحدة' },
  { id: 'allowance', label: 'سماح', per: 'percent', hint: 'راحةٌ وتعبٌ وتأخّرٌ لا مفرّ منه (PF&D)' },
]);

/** أساس العنصر: مقيسٌ من بياناتٍ حقيقيّة، أم مقدَّرٌ بثابتٍ معلَن. */
export const BASIS = Object.freeze({
  measured: { id: 'measured', label: 'مقيس' },
  estimated: { id: 'estimated', label: 'تقديريّ' },
});

/**
 * الإصدار المبدئيّ — **معلَنٌ في مصدرٍ واحد ويُضبط بالتجربة** (نمط `WEIGHTS`
 * في محرّك الأولويّة وأنصبة المراحل). `effectiveFrom: 0` تجعله الأرضيّة التي
 * تُحاسَب بها كلّ قراءةٍ سبقت أوّل تعديل.
 */
export const BASE_STANDARD = Object.freeze({
  version: 1,
  effectiveFrom: 0,
  label: 'المبدئيّ — يُضبط بالتجربة',
  seconds: Object.freeze({ setup: 120, travel: 45, scan: 8, handle: 12 }),
  allowancePct: 15,
  /** سرعة المشي بالمتر/الثانية — تُستعمل حين تتوفّر مسافةٌ مقيسة (ت٨). */
  walkSpeedMps: 1.1,
  by: 'مبدئيّ',
  note: 'لم يُقس بعد — أرقامٌ معلنة تُصحَّح بأوّل مقارنةٍ بالواقع.',
});

/** العناصر ذات الثواني (ما عدا السماح — نسبةٌ لا ثوانٍ). */
export const TIMED_ELEMENTS = Object.freeze(STANDARD_ELEMENTS.filter((e) => e.per !== 'percent').map((e) => e.id));

/** يُسوّي إصدارًا: ما نقص يرثه من الأرضيّة، ولا حقلَ يُخترع. */
export function shapeStandard(input, previous = BASE_STANDARD) {
  const seconds = {};
  for (const id of TIMED_ELEMENTS) {
    const given = input?.seconds?.[id];
    seconds[id] = given === undefined || given === null || given === '' ? num(previous?.seconds?.[id]) : Math.max(0, num(given));
  }
  return {
    version: Math.max(1, Math.floor(num(input?.version)) || num(previous?.version) + 1),
    effectiveFrom: num(input?.effectiveFrom),
    label: s(input?.label) || 'إصدار',
    seconds,
    allowancePct: input?.allowancePct === undefined ? num(previous?.allowancePct) : Math.max(0, num(input.allowancePct)),
    walkSpeedMps: input?.walkSpeedMps === undefined ? num(previous?.walkSpeedMps) : Math.max(0, num(input.walkSpeedMps)),
    by: s(input?.by),
    note: s(input?.note),
  };
}

/** ما يمنع حفظ إصدار — والفراغ يعني صالحًا. */
export function standardProblems(input, previous = BASE_STANDARD) {
  const v = shapeStandard(input, previous);
  const out = [];
  for (const id of TIMED_ELEMENTS) {
    if (!Number.isFinite(v.seconds[id]) || v.seconds[id] < 0) out.push(`عنصر «${elementLabel(id)}» بثوانٍ غير صالحة.`);
  }
  if (v.allowancePct < 0 || v.allowancePct > 100) out.push('نسبة السماح خارج المدى ٠–١٠٠٪.');
  if (v.walkSpeedMps <= 0) out.push('سرعة المشي يجب أن تكون موجبة.');
  // ★★ الحارس الحاكم: لا تُدهس القراءات القديمة.
  if (previous && v.effectiveFrom <= num(previous.effectiveFrom)) {
    out.push('تاريخ السريان يجب أن يكون بعد الإصدار السابق — وإلّا أُعيد حكمُ قراءاتٍ ماضية بأثرٍ رجعيّ.');
  }
  if (!v.by) out.push('اسم من غيّر المعياريّ مطلوب — الإعداد قرارٌ لا حقلٌ مجهول.');
  return out;
}

export function elementLabel(id) {
  return STANDARD_ELEMENTS.find((e) => e.id === id)?.label || id;
}

/**
 * الإصدار الساري **لحظةَ وقوع القراءة** — لا الأحدث دائمًا.
 *
 * وهذا هو الفرق كلّه: مهمّةٌ نُفّذت الشهر الماضي تُحاسَب بمعيار الشهر الماضي،
 * فلا يتحرّك حكمُها لأنّ الإدارة عدّلت الإعداد اليوم.
 */
export function resolveStandard(versions, atMs) {
  const at = Number.isFinite(atMs) ? atMs : Infinity;
  const all = [BASE_STANDARD, ...(versions || []).map((v) => shapeStandard(v, BASE_STANDARD))]
    .filter((v) => Number.isFinite(v.effectiveFrom))
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
  let chosen = all[0];
  for (const v of all) if (v.effectiveFrom <= at) chosen = v;
  return chosen;
}

/**
 * يُنشئ إصدارًا تاليًا من السابق — والتعديل **إضافةٌ لا كتابةٌ فوق**.
 * يرمي بأوّل مانع، فالمستهلك لا يحفظ إصدارًا يُفسد التاريخ.
 */
export function nextStandard(previous, patch) {
  const base = previous || BASE_STANDARD;
  const draft = shapeStandard({ ...patch, version: num(base.version) + 1 }, base);
  const problems = standardProblems(draft, base);
  if (problems.length) throw new Error(problems.join(' · '));
  return draft;
}

/**
 * الزمن المعياريّ لمهمّةٍ — بعناصره.
 *
 * @param {object} task مهمّة المناولة (بنودها تُقرأ بـ`taskProgress` لا بعدٍّ ثانٍ)
 * @param {object} [ctx]
 * @param {Array}  [ctx.versions] إصدارات الإعداد (الأرضيّة مضمّنةٌ دائمًا)
 * @param {number} [ctx.atMs] لحظة القراءة — بها يُختار الإصدار الساري
 * @param {number} [ctx.distanceMeters] مسافةٌ **مقيسة** (ت٨) — تقلب الانتقال إلى `measured`
 * @returns {{seconds:number, minutes:number, elements:Array, version:number, estimated:boolean, notes:string[]}}
 */
export function standardFor(task, ctx = {}) {
  const atMs = Number.isFinite(ctx.atMs) ? ctx.atMs : toMillis(task?.startedAt) ?? toMillis(task?.createdAt);
  const std = resolveStandard(ctx.versions, atMs);

  // ★ العدّ بالإحالة: `taskProgress` هو من يعرف كم سطرًا وكم وحدة — ولا يُعاد
  //   عدُّها هنا، وإلّا صار للمهمّة حجمان يفترقان.
  const progress = taskProgress(task?.lines);
  const lines = progress.lines;
  const units = progress.totalRequired;
  const counts = { task: 1, line: lines, unit: units };

  const distance = Number(ctx.distanceMeters);
  const measuredTravel = Number.isFinite(distance) && distance >= 0 && std.walkSpeedMps > 0;

  const elements = [];
  let subtotal = 0;

  for (const el of STANDARD_ELEMENTS) {
    if (el.per === 'percent') continue;
    const unitSeconds = num(std.seconds[el.id]);
    let seconds = unitSeconds * (counts[el.per] ?? 0);
    let basis = BASIS.measured.id;
    let note = '';

    if (el.id === 'travel') {
      if (measuredTravel) {
        seconds = Math.round(distance / std.walkSpeedMps);
        note = `${Math.round(distance)} م ÷ ${std.walkSpeedMps} م/ث`;
      } else {
        basis = BASIS.estimated.id;
        note = 'لا مسافةَ محسوبة بعد — عنصرٌ تقديريّ حتى تُبنى شبكة الممرّات (ت٨).';
      }
    }

    subtotal += seconds;
    elements.push({
      id: el.id,
      label: el.label,
      hint: el.hint,
      per: el.per,
      count: counts[el.per] ?? 0,
      unitSeconds,
      seconds: Math.round(seconds),
      basis,
      note,
    });
  }

  const allowanceSeconds = Math.round((subtotal * num(std.allowancePct)) / 100);
  elements.push({
    id: 'allowance',
    label: 'سماح',
    hint: STANDARD_ELEMENTS[STANDARD_ELEMENTS.length - 1].hint,
    per: 'percent',
    count: num(std.allowancePct),
    unitSeconds: 0,
    seconds: allowanceSeconds,
    basis: BASIS.estimated.id,
    note: `${num(std.allowancePct)}٪ على مجموع العناصر`,
  });

  const total = Math.round(subtotal + allowanceSeconds);
  const estimated = elements.some((e) => e.basis === BASIS.estimated.id && e.seconds > 0);

  return {
    seconds: total,
    minutes: Math.round(total / 60),
    elements,
    lines,
    units,
    version: std.version,
    versionLabel: std.label,
    effectiveFrom: std.effectiveFrom,
    /** يحمل تقديرًا مؤثّرًا — فلا يُعرض كأنّه مقيسٌ كلّه. */
    estimated,
    notes: elements.filter((e) => e.basis === BASIS.estimated.id && e.note).map((e) => `${e.label}: ${e.note}`),
  };
}

/**
 * شرحٌ للمشرف: العناصر الأكبر أثرًا أوّلًا — فيُرى **أين يذهب الوقت** لا كم هو.
 * والصفر لا يُعرض: عنصرٌ بلا أثرٍ ضجيجٌ في سطرٍ ضيّق.
 */
export function explainStandard(result, limit = 3) {
  const top = (result?.elements || [])
    .filter((e) => e.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map((e) => `${e.label} ${Math.round(e.seconds / 60)}د${e.basis === BASIS.estimated.id ? ' (تقديريّ)' : ''}`);
  return top.join(' · ') || 'لا عنصر مؤثّر';
}
