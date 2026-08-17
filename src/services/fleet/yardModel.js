/**
 * نموذج الساحة والأبواب ‹EXE-601› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ العطب (ف ت‑٦) ═══
 * دور `gate_officer` قائمٌ في [`auth/roles.js`](../auth/roles.js) **منذ البداية
 * بلا نظامٍ يخدمه**: لا موعد ولا تسجيل بوابة ولا تخصيص باب ولا مؤقّت انتظار
 * ولا تصريح خروج. و`fleetModel` يعرف الرحلة **خارج** الموقع (تحضير ← تصريح ←
 * في الطريق ← تسليم) ولا يعرف ما يجري **داخل** بوّابته. فالمنطقة بين النقل
 * والمخزن غائبةٌ كلّها: شاحنةٌ تنتظر ثلاث ساعاتٍ على الرصيف لا يعرف أحدٌ أنّها
 * انتظرت، ولا كم بابًا كان فارغًا وهي واقفة.
 *
 * ═══ وهذا امتدادٌ لدورة المركبة لا كيانٌ منفصل ═══
 * الملفّ داخل `fleet/` القائم، والباب **مورد** يقرؤه `resourcesResolver`
 * (EXE-401) بنفس منطقه: حالتُه محسوبةٌ من زياراته وأوامر شغله لا مخزَّنةً
 * فيه. ولا مُحلِّلَ ثانٍ ولا سجلَّ حالةٍ رابع.
 *
 * ═══ ★★ الأبواب **بيانات** — قرار المالك 2026-08-17 (ت-O04) ═══
 * لا بابَ مرسومٌ في هذا الكود ولا قائمةَ أبوابٍ لموقع 155: **المدير يضيفها
 * ويعدّلها ويُخرجها من الخدمة** بلا لمس سطر. ولذلك لا يُصدّر هذا الملفّ بذرةً
 * ولا قائمةً افتراضيّة — أبوابُ الاختبار في ملفّ الاختبار وحده، معلَّمةً
 * بوضوح. والانتظار كذلك: **مواقفُ مرقّمة أو ساحةٌ مفتوحة** يقرّرها الإدخال
 * (`spot` نصٌّ حرّ يجوز فراغه) لا شكلٌ مفروض.
 *
 * ═══ والزمن يُمرَّر ولا يُقرأ ═══
 * الأختام تُكتب في طبقة الخدمة بـ`serverTimestamp` كنمط `labor_tasks`، وهذا
 * الملفّ **يقرؤها ويحسب** — فلا ساعةَ متصفّحٍ تقرّر أنّ شاحنةً انتظرت ساعتين.
 */

import { toMillis } from '../documents/inbox.js';

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();

/**
 * الدورة العشر — بالترتيب، ولكلّ مرحلةٍ **ختمُها** الذي يُثبت وقوعها.
 *
 * `owner` من الأدوار القائمة: البوابة لضابطها، والساحة والباب لمشرف المناولة،
 * والتصريح للبوابة مرّةً أخرى (هو من يفتح الحاجز). ولا دورَ جديد.
 */
export const YARD_CYCLE = Object.freeze([
  { id: 'booked', label: 'حجز', stamp: 'bookedAt', owner: 'gate_officer' },
  { id: 'arrived', label: 'وصول', stamp: 'arrivedAt', owner: 'gate_officer' },
  { id: 'checkedIn', label: 'تسجيل بوابة', stamp: 'checkedInAt', owner: 'gate_officer' },
  { id: 'verified', label: 'تحقّق', stamp: 'verifiedAt', owner: 'gate_officer' },
  { id: 'parked', label: 'موقف', stamp: 'parkedAt', owner: 'labor_supervisor' },
  { id: 'atDoor', label: 'باب', stamp: 'atDoorAt', owner: 'labor_supervisor' },
  { id: 'working', label: 'تنزيل/تحميل', stamp: 'workingAt', owner: 'labor_supervisor' },
  { id: 'cleared', label: 'إخلاء', stamp: 'clearedAt', owner: 'labor_supervisor' },
  { id: 'permitted', label: 'تصريح', stamp: 'permittedAt', owner: 'gate_officer' },
  { id: 'exited', label: 'خروج', stamp: 'exitedAt', owner: 'gate_officer' },
]);

/** المرحلة الأخيرة — الخروج. يُقرأ من الدورة لا يُكتب اسمه ثانيةً. */
export const EXIT_STAGE = YARD_CYCLE[YARD_CYCLE.length - 1].id;
/** المرحلة التي تُجيز الخروج — التي قبله. */
export const PERMIT_STAGE = YARD_CYCLE[YARD_CYCLE.length - 2].id;

/** المراحل التي تشغل بابًا فعلًا — وهي وحدها ما يجعل الباب مشغولًا. */
export const AT_DOOR_STAGES = Object.freeze(['atDoor', 'working']);

/**
 * ⚠️ الإلغاء **خارج الدورة العشر** عمدًا: هو إنهاءٌ إداريّ لا مرحلةٌ في
 * الطريق (نمط `canceled` في `documents/states.js`). ومركبةٌ رُدّت من البوابة
 * تُلغى بسببٍ مكتوب **ولا تُحذف** — فيبقى أثر أنّها جاءت ورُدّت.
 */
export const YARD_CANCELED = Object.freeze({ id: 'canceled', label: 'ملغاة', stamp: 'canceledAt' });

const STAGE_BY_ID = new Map([...YARD_CYCLE.map((st) => [st.id, st]), [YARD_CANCELED.id, YARD_CANCELED]]);

export function yardStage(id) {
  return STAGE_BY_ID.get(s(id)) || null;
}

export function stageIndex(id) {
  return YARD_CYCLE.findIndex((st) => st.id === s(id));
}

/**
 * الانتقالات: **أمامًا خطوةً خطوة** — ولا قفزَ ولا رجوع.
 *
 * ولماذا لا قفز؟ لأنّ كلّ مرحلةٍ ختمُها، والقفز يُنتج مؤقّتًا بلا بداية:
 * شاحنةٌ تُوسَم «تنزيل» بلا ختم بابٍ يجعل زمن انتظارها صفرًا للأبد. والقفز في
 * البوابة تحديدًا يعني خروجًا بلا تصريح.
 *
 * والإلغاء متاحٌ حتى بلوغ الباب: بعده صارت البضاعة تُناقَل، فالتصحيح بمستندٍ
 * لا بإلغاء زيارة.
 */
export function canTransitionVisit(from, to) {
  const target = s(to);
  if (target === YARD_CANCELED.id) {
    const i = stageIndex(from);
    return i >= 0 && i < stageIndex('atDoor');
  }
  if (s(from) === YARD_CANCELED.id) return false;
  const i = stageIndex(from);
  const j = stageIndex(target);
  return i >= 0 && j === i + 1;
}

/* ═══════════════ الأبواب — بياناتٌ لا كود ═══════════════ */

/** ما يقبله الباب: داخلٌ · خارجٌ · كلاهما. والافتراض «كلاهما» أوسعُ وأقلّ إعاقة. */
export const DOOR_FLOWS = Object.freeze({
  inbound: { id: 'inbound', label: 'استلام' },
  outbound: { id: 'outbound', label: 'تحميل' },
  both: { id: 'both', label: 'استلام وتحميل' },
});

/** غرض الزيارة — يطابق تدفّق الباب. */
export const VISIT_PURPOSE = Object.freeze({
  inbound: { id: 'inbound', label: 'توريد (تنزيل)' },
  outbound: { id: 'outbound', label: 'شحن (تحميل)' },
});

/** بابٌ مسوّى. `code` هويّته، و`active:false` تُخرجه من الخدمة ولا تحذفه. */
export function shapeDoor(input) {
  return {
    code: up(input?.code),
    label: s(input?.label) || up(input?.code),
    flow: DOOR_FLOWS[input?.flow] ? input.flow : DOOR_FLOWS.both.id,
    warehouse: up(input?.warehouse),
    active: input?.active !== false,
    notes: s(input?.notes),
  };
}

/** ما يمنع حفظ باب — والفراغ يعني صالحًا. */
export function doorProblems(input, existing = []) {
  const d = shapeDoor(input);
  const out = [];
  if (!d.code) out.push('رمز الباب مطلوب — لا بابَ بلا هويّة يُسنَد إليها عمل.');
  if (d.code && (existing || []).some((x) => up(x?.code) === d.code)) {
    out.push(`الرمز «${d.code}» مستعمَلٌ لبابٍ آخر — الرمز هو الهويّة فلا يتكرّر.`);
  }
  return out;
}

/** أيقبل هذا الباب هذا الغرض؟ */
export function doorAccepts(door, purpose) {
  const flow = shapeDoor(door).flow;
  return flow === DOOR_FLOWS.both.id || flow === s(purpose);
}

/* ═══════════════ الزيارة ═══════════════ */

/**
 * زيارةٌ مسوّاة. المستند المرجعيّ **يُعلَن نقصه ولا يمنع**: شاحنةٌ على الرصيف
 * لا تُردّ لأنّ رقم الأمر لم يُكتب بعد — تُسجَّل ويُقال ما ينقصها (نمط
 * `lineGaps` في `taskShape`).
 */
export function shapeVisit(input) {
  const stage = yardStage(input?.stage) ? s(input.stage) : YARD_CYCLE[0].id;
  return {
    plate: up(input?.plate),
    carrier: s(input?.carrier),
    driverName: s(input?.driverName),
    driverId: s(input?.driverId),
    purpose: VISIT_PURPOSE[input?.purpose] ? input.purpose : VISIT_PURPOSE.inbound.id,
    docRef: {
      type: up(input?.docRef?.type),
      number: s(input?.docRef?.number),
      id: s(input?.docRef?.id),
    },
    /** تصريح الخروج: رقم مستند GP القائم — لا ترقيمٌ ثانٍ للساحة. */
    permitRef: s(input?.permitRef),
    doorCode: up(input?.doorCode),
    /** موقفٌ مرقّم أو فراغٌ لساحةٍ مفتوحة — الشكل بالإدخال لا بالكود (ت-O04). */
    spot: up(input?.spot),
    stage,
    stamps: { ...(input?.stamps || {}) },
    holdReason: s(input?.holdReason),
  };
}

/** ما يمنع فتح الزيارة. */
export function visitProblems(input) {
  const v = shapeVisit(input);
  const out = [];
  if (!v.plate) out.push('لوحة المركبة مطلوبة — الساحة تُدار باللوحة.');
  return out;
}

/**
 * ما ينقص الزيارة **ولا يمنعها** — يُعلَن ليُستكمَل.
 * والميدان لا يحتمل نموذجًا طويلًا: الحقول الملزِمة واحدةٌ، وما عداها يُقال.
 */
export function visitGaps(visit) {
  const v = shapeVisit(visit);
  const out = [];
  if (!v.docRef.number) out.push('لا مستندَ مرجعيّ — سُجّلت باللوحة ويبقى الربط ناقصًا.');
  if (!v.driverName) out.push('اسم السائق غير مُدخل.');
  if (!v.driverId) out.push('رقم بطاقة السائق غير مُدخل.');
  return out;
}

/** لحظة ختمٍ لمرحلةٍ بعينها. */
export function stampAt(visit, stageId) {
  const st = yardStage(stageId);
  return st ? toMillis(visit?.stamps?.[st.stamp]) : null;
}

/* ═══════════════ المؤقّتان ═══════════════ */

/**
 * حدودٌ **مبدئيّة معلَنة** في مصدرٍ واحد (نمط `WEIGHTS` في محرّك الأولويّة) —
 * تُضبط بالتجربة، ولا تُنسخ في شاشة.
 */
export const YARD_LIMITS = Object.freeze({
  /** انتظارٌ من تسجيل البوابة إلى الباب. */
  waitMinutes: 60,
  /** مناولةٌ من بدء التنزيل إلى الإخلاء. */
  handlingMinutes: 120,
  /** بقاءٌ كامل داخل الموقع من الوصول إلى الخروج. */
  turnaroundMinutes: 240,
});

function minutesBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return Math.round((toMs - fromMs) / 60000);
}

/**
 * مؤقّتات الزيارة — **مفتوحةٌ تُقاس بالآن ومغلقةٌ تُقاس بختمها**.
 *
 * ولماذا يُميَّز المفتوح؟ لأنّ رقمًا واحدًا لا يقول أيَّهما: شاحنةٌ انتظرت
 * ساعتين وانتهت، وشاحنةٌ تنتظر ساعتين **الآن** — الثانية تحتاج قرارًا والأولى
 * تحتاج تقريرًا. فيُعاد `open: true` مع الرقم.
 *
 * @returns {{wait:object, handling:object, turnaround:object, appointment:object}}
 */
export function visitTimers(visit, nowMs) {
  const v = shapeVisit(visit);
  const at = (id) => stampAt(v, id);
  const now = Number.isFinite(nowMs) ? nowMs : null;

  const span = (fromId, toId, limit) => {
    const from = at(fromId);
    const to = at(toId);
    const open = from !== null && to === null;
    const minutes = to !== null ? minutesBetween(from, to) : open && now !== null ? minutesBetween(from, now) : null;
    return {
      minutes,
      open,
      started: from !== null,
      limit,
      breached: minutes !== null && minutes > limit,
      label: minutes === null ? (from === null ? 'لم يبدأ' : 'بلا وقتٍ محسوب') : `${minutes} دقيقة${open ? ' (جاريًا)' : ''}`,
    };
  };

  // الانتظار من **تسجيل البوابة** لا من الوصول: ما قبل التسجيل ليس مسؤوليّة
  // الساحة بعد — والمركبة قد تكون واقفةً على الطريق العامّ.
  const wait = span('checkedIn', 'atDoor', YARD_LIMITS.waitMinutes);
  const handling = span('working', 'cleared', YARD_LIMITS.handlingMinutes);
  const turnaround = span('arrived', EXIT_STAGE, YARD_LIMITS.turnaroundMinutes);

  // التزام الموعد: الوصول مقابل الحجز. والسبق ليس تأخّرًا فيُعلَن سالبًا.
  const booked = at('booked');
  const arrived = at('arrived');
  const drift = Number.isFinite(booked) && Number.isFinite(arrived) ? Math.round((arrived - booked) / 60000) : null;
  const appointment = {
    minutes: drift,
    late: drift !== null && drift > 0,
    label: drift === null ? 'بلا موعدٍ محجوز' : drift > 0 ? `تأخّر ${drift} دقيقة` : drift < 0 ? `سبق الموعد ${Math.abs(drift)} دقيقة` : 'في موعده',
  };

  return { wait, handling, turnaround, appointment };
}

/** تجاوزاتٌ تستحقّ قرارًا الآن — نصوصٌ جاهزةٌ للعرض، وفراغُها هو السلامة. */
export function visitAlerts(visit, nowMs) {
  const t = visitTimers(visit, nowMs);
  const out = [];
  if (t.wait.breached) out.push(`انتظارٌ ${t.wait.minutes} دقيقة وحدّه ${t.wait.limit} — خصّص بابًا أو أعلن السبب.`);
  if (t.handling.breached) out.push(`مناولةٌ ${t.handling.minutes} دقيقة وحدّها ${t.handling.limit} — الباب محجوزٌ عن غيره.`);
  if (t.turnaround.breached) out.push(`بقاءٌ داخل الموقع ${t.turnaround.minutes} دقيقة وحدّه ${t.turnaround.limit}.`);
  const held = s(shapeVisit(visit).holdReason);
  if (held) out.push(`موقوفة: ${held}`);
  return out;
}

/* ═══════════════ الحرّاس ═══════════════ */

/**
 * ★★ **لا تخرج مركبةٌ بلا تصريح** — حارسٌ مختبَر لا تعليمة.
 *
 * ثلاثة أقفال، كلٌّ بسببه:
 *   ١ المرحلة: الخروج من «تصريح» وحدها — والانتقال نفسه يمنع القفز.
 *   ٢ الرقم: تصريحٌ بلا رقم مستندٍ ورقةٌ بيضاء (`gateVerdict` في `chain.js`
 *     يفحص محتواه؛ وهذا يفحص **وجوده** على الزيارة).
 *   ٣ الباب: لا تخرج وهي تشغل بابًا — إخلاءٌ أوّلًا، وإلّا بقي الباب مشغولًا
 *     بمركبةٍ غادرت فيُحجب عن غيرها إلى الأبد.
 */
export function exitVerdict(visit) {
  const v = shapeVisit(visit);
  const problems = [];

  if (v.stage !== PERMIT_STAGE) {
    const st = yardStage(v.stage);
    problems.push(`لا خروج من مرحلة «${st?.label || v.stage}» — التصريح أوّلًا.`);
  }
  if (!v.permitRef) problems.push('لا خروج بلا تصريح — سجّل رقم تصريح الخروج (GP).');
  if (AT_DOOR_STAGES.includes(v.stage) || (v.doorCode && stampAt(v, 'cleared') === null && stampAt(v, 'atDoor') !== null)) {
    problems.push(`الباب ${v.doorCode} لم يُخلَ بعد — إخلاؤه قبل الخروج.`);
  }
  if (v.holdReason) problems.push(`موقوفة بقرار: ${v.holdReason}`);

  return { ok: problems.length === 0, problems };
}

/**
 * حكم إسناد بابٍ لزيارة — يمنع ما يُفسد الساحة فعلًا.
 *
 * @param {object} visit   الزيارة
 * @param {object} door    الباب المرشَّح
 * @param {Array}  visits  الزيارات الأخرى (لكشف بابٍ مشغول)
 */
export function assignDoorVerdict(visit, door, visits = []) {
  const v = shapeVisit(visit);
  const d = shapeDoor(door);
  const problems = [];
  const warnings = [];

  if (!d.code) problems.push('اختر بابًا.');
  if (d.code && !d.active) problems.push(`الباب ${d.code} خارج الخدمة.`);
  if (d.code && !doorAccepts(d, v.purpose)) {
    problems.push(`الباب ${d.code} لـ${DOOR_FLOWS[d.flow].label} والزيارة ${VISIT_PURPOSE[v.purpose].label}.`);
  }
  const occupant = (visits || []).find(
    (x) => up(x?.doorCode) === d.code && AT_DOOR_STAGES.includes(s(x?.stage)) && up(x?.plate) !== v.plate
  );
  if (occupant) problems.push(`الباب ${d.code} تشغله ${up(occupant.plate)} الآن.`);

  // ★ يُعلَن ولا يمنع: التحقّق قبل الباب هو الأصل، لكنّ منعَه يوقف الساحة على
  // إجراءٍ ورقيّ — والمشرف يقرّر عالِمًا.
  if (stageIndex(v.stage) < stageIndex('verified')) {
    warnings.push('لم يُستكمَل التحقّق بعد — تُسنَد وأنت تعلم.');
  }
  return { ok: problems.length === 0, problems, warnings };
}

/* ═══════════════ الأبواب حالةً — مصدرُ مورد `door` ═══════════════ */

/**
 * إشغال كلّ باب: من يشغله ومنذ متى.
 *
 * وهذا **المصدر الذي يقرؤه `resourcesResolver`** لنوع `door` — فلا حالةَ
 * مخزَّنةٌ على الباب تتقادم، ولا مُحلِّلَ ثانٍ يوازي الأوّل.
 */
export function doorOccupancy(doors, visits, nowMs) {
  const byDoor = new Map();
  for (const x of visits || []) {
    const code = up(x?.doorCode);
    if (!code || !AT_DOOR_STAGES.includes(s(x?.stage))) continue;
    if (!byDoor.has(code)) byDoor.set(code, x);
  }

  return (doors || []).map((raw) => {
    const door = shapeDoor(raw);
    const visit = byDoor.get(door.code) || null;
    const since = visit ? stampAt(visit, 'atDoor') : null;
    const minutes = visit && Number.isFinite(since) && Number.isFinite(nowMs) ? minutesBetween(since, nowMs) : null;
    return {
      ...door,
      occupied: Boolean(visit),
      plate: visit ? up(visit.plate) : '',
      stage: visit ? s(visit.stage) : '',
      since,
      minutes,
      /** نصٌّ لا يعتمد على اللون وحده (قاعدة الهويّة). */
      status: !door.active ? 'خارج الخدمة' : visit ? `تشغله ${up(visit.plate)}${minutes !== null ? ` · ${minutes} دقيقة` : ''}` : 'فارغ',
    };
  });
}

/** لقطة الساحة للوحة: الأبواب والانتظار والتجاوزات. */
export function yardSnapshot(doors, visits, nowMs) {
  const occupancy = doorOccupancy(doors, visits, nowMs);
  const live = (visits || []).filter((v) => s(v?.stage) !== EXIT_STAGE && s(v?.stage) !== YARD_CANCELED.id);
  const waiting = live.filter((v) => stageIndex(v?.stage) < stageIndex('atDoor'));
  const breaches = live.filter((v) => visitAlerts(v, nowMs).length > 0);
  const closed = (visits || []).filter((v) => stampAt(v, EXIT_STAGE) !== null);
  const durations = closed.map((v) => visitTimers(v, nowMs).turnaround.minutes).filter((m) => Number.isFinite(m));

  return {
    doors: { total: occupancy.length, occupied: occupancy.filter((d) => d.occupied).length, offline: occupancy.filter((d) => !d.active).length },
    onSite: live.length,
    waiting: waiting.length,
    atDoor: live.filter((v) => AT_DOOR_STAGES.includes(s(v?.stage))).length,
    breaches: breaches.length,
    exited: closed.length,
    avgTurnaroundMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    occupancy,
  };
}
