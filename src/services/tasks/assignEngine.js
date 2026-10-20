/**
 * محرّكُ الإسناد — **المهمّةُ المناسبةُ للعامل المناسب، بسببٍ مكتوب.**
 * منطقٌ خالصٌ بلا Firebase وبلا DOM وبلا ساعة.
 *
 * ‹WMS-501› · الفجوة و-٦: `priority.js` **يرتّب المهامّ** بخمسة عواملَ — وهو
 * ترتيبُ طابورٍ لا إسنادٌ لعامل. والقائمُ اليوم `reassignVerdict(task,{toUid})`:
 * **نقلٌ بأمرٍ بلا اقتراح.** فالمشرفُ يختار من رأسه، ويختار في الغالب من
 * يتذكّره — فيُحمَّل المجتهدُ ويُنسى الفارغ، ويُرسَل عاملٌ من ممرٍّ إلى ممرٍّ
 * ومعه من يقف في الممرّ المقصود.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★★★ ستُّ قواعدَ — وأوّلها دَينٌ مكتوبٌ بثمنه
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ① **الصلاحيّةُ مانعٌ لا وزن.** من لا يملك العمليّة **يُستبعد** لا يُخفَّض:
 *    عاملٌ بدرجةٍ عاليةٍ لا يملك `PICK` يُسنَد إليه سحبٌ فيرتدّ على الخادم،
 *    فيظنّ النظامَ معطوبًا ويظنّ المشرفُ المهمّةَ مُسنَدة.
 *
 * ② ★★★ **ومنعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم** — وهو
 *    دَرسُ `uiGate` في طبقة الطبالي بثمنه. فدورٌ **لا تعرفه المصفوفة** يمرّ
 *    مرشَّحًا **بعلامةِ `roleKnown:false`**: لا يُقصى بجهلٍ، ولا يُقال عنه
 *    «مأذون». والشاشةُ تُظهر العلامةَ فيعلم المشرفُ أنّ الحكمَ ناقصٌ هنا.
 *
 * ③ **لا يُخترع مرشَّح.** بلا عمّالٍ متاحين تُعاد قائمةٌ فارغةٌ **بسببٍ معلَن**
 *    — لا عاملٌ عشوائيٌّ يبدو ذكيًّا (قاعدةُ `putawaySuggest` ①).
 *
 * ④ **المستبعَدُ يُعرض بسببه لا يُخفى** — مشرفٌ لا يرى عاملَه في القائمة يظنّ
 *    النظامَ معطَّلًا، فيلتمس طريقًا حوله (قاعدةُ `putawaySuggest` ②).
 *
 * ⑤ **الاقتراحُ لا يُسنِد.** قرارُ المالك في التسكين (2026-08-16) يسري حرفًا:
 *    المحرّكُ يُرتّب ويُعلّل، **والإسنادُ فعلُ المدير**. و`reassignVerdict`
 *    القائمُ لا يتغيّر حرفًا.
 *
 * ⑥ **لا ساعةَ تُقرأ** — `nowMs` يُمرَّر، ومنه وحده يُحكَم على المهلة.
 */

import { zoneOf } from './taskFactory.js';
import { uiGate } from '../lpn/lpnRoles.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();
const txt = (v) => String(v ?? '').trim();
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const DAY = 86400000;

/**
 * أوزانُ العوامل الثمانية — **مجموعُها مئةٌ** كي تُقرأ الدرجةُ نسبةً لا رقمًا
 * مجرَّدًا (نفسُ عقد `priority.WEIGHTS` حرفًا، فلا عقدان في بيتٍ واحد).
 *
 * ★ والصلاحيّةُ **ليست فيها**: هي مانعٌ (القاعدة ①) لا وزن.
 */
export const WEIGHTS = Object.freeze({
  zone: 26, //        في منطقة المهمّة الآن — أقوى عامل: المشيُ هو الكلفة
  skill: 18, //       مهارةٌ معلَنةٌ لنوع العمل
  load: 16, //        قلّةُ ما بيده الآن — فلا يُحمَّل المجتهدُ ويُنسى الفارغ
  productivity: 14, // إنتاجيّةٌ مقيسةٌ من عمله لا من رأي
  equipment: 12, //   المعدّةُ التي تحتاجها المهمّةُ متاحةٌ له
  deadline: 8, //     مهلةٌ ضيّقةٌ ⟹ يُقدَّم الأسرع
  congestion: 4, //   ازدحامُ المنطقة — الأقلُّ ازدحامًا أسرع
  idle: 2, //         طولُ فراغه — كي لا يُنسى من لا يُطلب
});

/** سقفُ ما بيد العامل من مهامٍّ قبل أن يُعدّ محمَّلًا تمامًا. */
export const FULL_LOAD = 3;

/** سقفُ مهامِّ المنطقة قبل أن تُعدّ مزدحمةً تمامًا. */
export const ZONE_CROWD = 6;

/** أقصى فراغٍ يُحتسب بالدقائق — فوقه لا يزيد أثرُه. */
export const MAX_IDLE_MIN = 120;

/**
 * مهارةُ العامل لنوع العمل — **مُعلَنةٌ لا مشتقّة**.
 *
 * ★ وتُقرأ من `skills` إن وُجدت، وإلّا من دوره الميدانيّ: من دورُه `PICKER`
 * ماهرٌ بالسحب بحكم تعيينه. وغيابُ الطرفين «لا أعرف» فيمرّ بنصف النصيب —
 * **الجهلُ لا يُرقّي ولا يُسقِط** (نفسُ عقد `dueShare` في `priority.js`).
 *
 * @returns {{share:number, note:string}}
 */
export function skillShare(worker, workType) {
  const want = up(workType);
  if (!want) return { share: 0.5, note: 'نوعُ العملِ غيرُ معلَن' };

  const declared = (worker?.skills || []).map(up);
  if (declared.length) {
    return declared.includes(want)
      ? { share: 1, note: `مهارةٌ معلَنة: ${workType}` }
      : { share: 0.15, note: `لا مهارةَ معلَنةٌ لـ${workType}` };
  }
  const roles = (worker?.fieldRoles || []).map(up);
  if (roles.length) {
    const byRole = ROLE_SKILL[want] || [];
    return roles.some((r) => byRole.includes(r))
      ? { share: 0.85, note: 'مشتقّةٌ من دوره الميدانيّ' }
      : { share: 0.25, note: 'دورُه الميدانيُّ لغير هذا العمل' };
  }
  return { share: 0.5, note: 'لا مهارةَ معلَنةٌ ولا دورَ ميدانيّ' };
}

/** نوعُ العمل ⟶ الأدوارُ الميدانيّةُ التي تُجيده بحكم التعيين. */
const ROLE_SKILL = Object.freeze({
  PICK: ['PICKER', 'ADMIN'],
  PUTAWAY: ['PUTAWAY', 'ADMIN'],
  RECEIVE: ['RECEIVER', 'ADMIN'],
  STAGE: ['PICKER', 'LOADER', 'ADMIN'],
  LOAD: ['LOADER', 'ADMIN'],
  COUNT: ['COUNTER', 'ADMIN'],
});

/**
 * نصيبُ المنطقة — **أقربُ ما يُقاس بلا إحداثيّات**.
 *
 * ★★ ولا تُقرأ منه شبكةُ المشي (`travelGrid`) عمدًا: تلك تقيس المسافةَ **بين
 * رفّين**، والعاملُ موضعُه منطقةٌ لا رفّ. ومنطقةٌ واحدةٌ تعني «في الممرّ
 * نفسِه» وهو كلُّ ما يلزم للترجيح.
 */
export function zoneShare(worker, taskZone) {
  const want = up(taskZone);
  const at = up(worker?.zone);
  if (!want) return { share: 0.5, note: 'منطقةُ المهمّةِ غيرُ معلومة' };
  if (!at) return { share: 0.5, note: 'موضعُ العاملِ غيرُ معلوم' };
  if (at === want) return { share: 1, note: `في منطقة المهمّة (${taskZone})` };
  // نفسُ المستودعِ أقربُ من مستودعٍ آخر — والفاصلُ أوّلُ مقطع.
  const sameWarehouse = at.split('-')[0] === want.split('-')[0];
  return sameWarehouse
    ? { share: 0.45, note: `في ${worker.zone} — نفسُ المستودع` }
    : { share: 0.05, note: `في ${worker.zone} — مستودعٌ آخر` };
}

/**
 * يُرشّح عمّالًا لمهمّةٍ واحدة.
 *
 * @param {object} task المهمّة `{bin|zone, workType, op, dueAt, lines, equipment}`
 * @param {Array} workers العمّال `{uid, name, portalRole, fieldRoles, skills, zone,
 *        openTasks, unitsPerHour, idleSinceMs, equipment, available}`
 * @param {object} [ctx] `{nowMs, zoneLoad, limit}`
 *        `zoneLoad` فهرسُ «المنطقة ← عددُ مهامِّها المفتوحة» — وغيابُه «لا أعرف».
 * @returns {{candidates:Array, excluded:Array, problem:string, unknownRoles:number}}
 */
export function suggestAssignees(task, workers, ctx = {}) {
  const { nowMs, zoneLoad = null, limit = 5, weights } = ctx;
  const pool = workers || [];

  if (!pool.length) {
    return { candidates: [], excluded: [], unknownRoles: 0, problem: 'لا عمّالَ في القائمة — عرِّف الفرقةَ أو الوردية أوّلًا.' };
  }

  const taskZone = up(task?.zone) || zoneOf(task?.bin);
  const op = txt(task?.op) || txt(task?.workType).toUpperCase();
  const workType = txt(task?.workType) || op;
  const needEquipment = up(task?.equipment);
  const due = Number(task?.dueAt);

  const scored = pool.map((worker) => scoreWorker(worker, { taskZone, op, workType, needEquipment, due, nowMs, zoneLoad, weights }));
  const candidates = scored.filter((s) => s.ok).sort((a, b) => b.score - a.score || (a.uid < b.uid ? -1 : 1)).slice(0, limit);
  const excluded = scored.filter((s) => !s.ok).map(({ uid, name, reason }) => ({ uid, name, reason }));

  return {
    candidates,
    excluded,
    unknownRoles: candidates.filter((c) => !c.roleKnown).length,
    problem: candidates.length
      ? ''
      : excluded.length
        ? 'كلُّ العمّال مستبعَدون — راجع الأسباب أدناه.'
        : 'لا مرشَّح.',
  };
}

/**
 * يُقيّم عاملًا واحدًا — ويُعيد سببًا مكتوبًا لكلّ عامل (القاعدة ④).
 *
 * @returns {{ok:boolean, uid:string, name:string, score:number, roleKnown:boolean,
 *            factors:Array, reasons:string[], reason:string}}
 */
export function scoreWorker(worker, { taskZone, op, workType, needEquipment, due, nowMs, zoneLoad, weights } = {}) {
  // ‹WMS-601› أوزانٌ مُهيَّأةٌ — والغيابُ يُعيد الثابتَ المعلَنَ حرفًا بحرف.
  const W = weights ? { ...WEIGHTS, ...weights } : WEIGHTS;
  const uid = txt(worker?.uid || worker?.id);
  const name = txt(worker?.name) || uid || '—';
  const reject = (reason) => ({ ok: false, uid, name, score: -1, roleKnown: true, factors: [], reasons: [], reason });

  if (!uid) return reject('عاملٌ بلا معرّف — لا يُسنَد إليه شيء.');

  // ── المنعُ أوّلًا ──────────────────────────────────────────────
  if (worker?.available === false) {
    return reject(txt(worker?.unavailableReason) || 'غيرُ متاحٍ الآن (إجازةٌ أو ورديّةٌ أخرى).');
  }

  // ① و② الصلاحيّةُ مانعٌ — **والمجهولُ يمرّ بعلامته لا يُقصى بجهل.**
  const gate = op ? uiGate(txt(worker?.portalRole), op) : { allowed: true, known: true, message: '' };
  if (!gate.allowed) return reject(gate.message || `لا يملك صلاحيّةَ «${op}».`);
  const roleKnown = gate.known;

  // ── الترجيح ──────────────────────────────────────────────────
  const factors = [];
  const reasons = [];
  let score = 0;
  const add = (id, label, weight, share, note) => {
    const points = Math.round(weight * clamp01(share));
    factors.push({ id, label, weight, points, note });
    score += points;
    if (note) reasons.push(`${label}: ${note}`);
  };

  const zone = zoneShare(worker, taskZone);
  add('zone', 'الموضع', W.zone, zone.share, zone.note);

  const skill = skillShare(worker, workType);
  add('skill', 'المهارة', W.skill, skill.share, skill.note);

  // ★ الحملُ **معكوس**: الفارغُ يتقدّم. ومن بيده ثلاثٌ فنصيبُه صفرٌ لا منعٌ —
  // فالمنعُ يُفرغ الطابورَ على رؤوسٍ قليلةٍ في يومِ ذروة.
  const open = Math.max(0, num(worker?.openTasks));
  add('load', 'الحمل الحاليّ', W.load, 1 - Math.min(1, open / FULL_LOAD), `بيده ${open} مهمّة`);

  // ★★ الإنتاجيّةُ **تُنسَب لا تُقاس مطلقةً**: «ستّون وحدةً في الساعة» لا
  // تقول شيئًا وحدَها. فتُقاس بوسيط `peerRate` حين يُمرَّر، وإلّا بنصف النصيب.
  const rate = num(worker?.unitsPerHour);
  const peer = num(worker?.peerRate);
  if (rate > 0 && peer > 0) {
    add('productivity', 'الإنتاجيّة', W.productivity, rate / (peer * 1.5), `${rate} وحدة/ساعة مقابل ${peer} للمتوسّط`);
  } else {
    add('productivity', 'الإنتاجيّة', W.productivity, 0.5, 'لا إنتاجيّةَ مقيسة');
  }

  if (needEquipment) {
    const has = (worker?.equipment || []).map(up).includes(needEquipment);
    add('equipment', 'المعدّة', W.equipment, has ? 1 : 0, has ? `يملك ${task_(needEquipment)}` : `لا يملك ${task_(needEquipment)}`);
  } else {
    add('equipment', 'المعدّة', W.equipment, 0.5, 'المهمّةُ لا تُسمّي معدّة');
  }

  // ★ المهلةُ الضيّقةُ تُرقّي **الأسرع**: ومن لا إنتاجيّةَ له لا يُرقّى ولا
  // يُسقَط. وبلا مهلةٍ نصفُ النصيب — نفسُ عقد `priority.dueShare` حرفًا.
  const tight = Number.isFinite(due) && Number.isFinite(nowMs) ? clamp01(1 - (due - nowMs) / DAY) : 0;
  if (tight > 0 && rate > 0 && peer > 0) {
    add('deadline', 'المهلة', W.deadline, tight * clamp01(rate / (peer * 1.5)), 'مهلةٌ ضيّقةٌ والأسرعُ يُقدَّم');
  } else {
    add('deadline', 'المهلة', W.deadline, 0.5, Number.isFinite(due) ? 'المهلةُ واسعة' : 'بلا موعدٍ معلن');
  }

  // ★ الازدحامُ يُقرأ من فهرسٍ يُمرَّر، وغيابُه «لا أعرف» فنصفُ النصيب.
  const crowd = zoneLoad && typeof zoneLoad.get === 'function' ? zoneLoad.get(up(worker?.zone)) : null;
  if (Number.isFinite(crowd)) {
    add('congestion', 'الازدحام', W.congestion, 1 - Math.min(1, crowd / ZONE_CROWD), `${crowd} مهمّةً في منطقته`);
  } else {
    add('congestion', 'الازدحام', W.congestion, 0.5, 'ازدحامُ المنطقةِ غيرُ معلوم');
  }

  const idleMs = Number.isFinite(worker?.idleSinceMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - worker.idleSinceMs) : null;
  if (idleMs === null) {
    add('idle', 'الفراغ', W.idle, 0.5, 'مدّةُ فراغه غيرُ معلومة');
  } else {
    const minutes = Math.round(idleMs / 60000);
    add('idle', 'الفراغ', W.idle, minutes / MAX_IDLE_MIN, `فارغٌ منذ ${minutes} دقيقة`);
  }

  // ② العلامةُ تُقال لا تُكتم.
  if (!roleKnown) {
    reasons.push(`⚠ دورُه «${txt(worker?.portalRole) || 'غيرُ محدَّد'}» لا تعرفه مصفوفةُ الصلاحيّات — الحكمُ ناقصٌ هنا، والخادمُ هو الحارس.`);
  }

  return {
    ok: true,
    uid,
    name,
    score: Math.max(0, Math.min(100, score)),
    roleKnown,
    zone: txt(worker?.zone),
    openTasks: open,
    factors,
    reasons,
    reason: '',
  };
}

/** تسميةُ المعدّة للعرض — والمجهولُ يُعرض كما كُتب لا كـ«غير معروف». */
function task_(kind) {
  const labels = { FORKLIFT: 'رافعة', PALLET_JACK: 'عربة طبالي', SCANNER: 'ماسح', LADDER: 'سلّم' };
  return labels[kind] || kind;
}

/**
 * أفضلُ ثلاثةِ أسبابٍ لمرشَّح — للعرض في سطرٍ واحد.
 * (نفسُ عقد `priority.explain` حرفًا، فلا شكلان في بيتٍ واحد.)
 */
export function explain(candidate, limit = 3) {
  return (candidate?.factors || [])
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((f) => `${f.label}: ${f.note}`);
}

/**
 * سطرٌ يُقرأ بجانب الاسم.
 */
export function candidateSummary(candidate) {
  if (!candidate?.uid) return '';
  const top = explain(candidate, 2).join(' · ');
  const flag = candidate.roleKnown ? '' : ' ⚠ دورٌ غيرُ معروفٍ للمصفوفة';
  return `${candidate.name} — ${candidate.score}٪${top ? ` (${top})` : ''}${flag}`;
}

/**
 * فهرسُ «المنطقة ← عددُ مهامِّها المفتوحة» — يُبنى مرّةً ويُمرَّر.
 * (نفسُ نمطِ `palletsByBin` و`loadIndexOf`: الطبقةُ الجديدة تقرأ القائم.)
 */
export function zoneLoadIndex(tasks) {
  const index = new Map();
  for (const t of tasks || []) {
    const zone = up(t?.zone) || zoneOf(t?.bin);
    if (!zone) continue;
    index.set(zone, (index.get(zone) || 0) + 1);
  }
  return index;
}
