/**
 * اختبارات نموذج الساحة والأبواب ‹EXE-601›.
 *
 * الحارس الحاكم هنا: **لا تخرج مركبةٌ بلا تصريح** — وهو قاعدةٌ تُفحص لا
 * تعليمةٌ تُكتب. ومعه قرار المالك (ت-O04): **الأبواب بيانات** — ولذلك أبوابُ
 * هذا الملفّ ↓ **بذرةُ اختبارٍ لا أبوابَ موقع 155**، ولا مثيلَ لها في الكود.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLES } from '../auth/roles.js';
import {
  AT_DOOR_STAGES,
  DOOR_FLOWS,
  EXIT_STAGE,
  PERMIT_STAGE,
  YARD_CANCELED,
  YARD_CYCLE,
  YARD_LIMITS,
  assignDoorVerdict,
  canTransitionVisit,
  doorAccepts,
  doorOccupancy,
  doorProblems,
  exitVerdict,
  shapeDoor,
  shapeVisit,
  stageIndex,
  visitAlerts,
  visitGaps,
  visitProblems,
  visitTimers,
  yardSnapshot,
  yardStage,
} from './yardModel.js';

const MIN = 60000;
const T = Date.parse('2026-08-17T08:00:00Z');
const NOW = T + 200 * MIN;

/** ⚠️ بذرة اختبارٍ معلَّمة — ليست أبواب موقع 155 ولا افتراضًا للنظام. */
const TEST_DOORS = [
  { code: 'D1', label: 'باب تجريبيّ ١', flow: 'inbound' },
  { code: 'D2', label: 'باب تجريبيّ ٢', flow: 'outbound' },
  { code: 'D3', label: 'باب تجريبيّ ٣', flow: 'both', active: false },
];

/** زيارةٌ ببصمةٍ زمنيّة حتى مرحلةٍ ما — الأختام تُبنى بالترتيب. */
function visitUpTo(stageId, extra = {}) {
  const stamps = {};
  const stop = stageIndex(stageId);
  for (let i = 0; i <= stop; i += 1) {
    stamps[YARD_CYCLE[i].stamp] = T + i * 20 * MIN;
  }
  return shapeVisit({ plate: 'BN-1234', purpose: 'inbound', stage: stageId, stamps, ...extra });
}

/* ── الدورة العشر ───────────────────────────────────────────── */

test('★★ الدورة عشر مراحل بأسمائها — والإلغاء خارجها', () => {
  assert.equal(YARD_CYCLE.length, 10);
  assert.deepEqual(
    YARD_CYCLE.map((st) => st.label),
    ['حجز', 'وصول', 'تسجيل بوابة', 'تحقّق', 'موقف', 'باب', 'تنزيل/تحميل', 'إخلاء', 'تصريح', 'خروج']
  );
  assert.equal(stageIndex(YARD_CANCELED.id), -1, 'الإلغاء إنهاءٌ إداريّ لا مرحلةٌ في الطريق');
  assert.equal(EXIT_STAGE, 'exited');
  assert.equal(PERMIT_STAGE, 'permitted');
});

test('★★ لكلّ مرحلةٍ ختمُها — فلا مؤقّتَ بلا بداية', () => {
  const stamps = new Set();
  for (const st of YARD_CYCLE) {
    assert.ok(st.stamp, `${st.id} بلا ختم`);
    assert.equal(stamps.has(st.stamp), false, `${st.stamp} مكرَّر`);
    stamps.add(st.stamp);
  }
});

test('★★ كلّ مسؤولٍ دورٌ قائم — لا دورَ جديد للساحة', () => {
  for (const st of YARD_CYCLE) assert.ok(ROLES[st.owner], `${st.id}: دور «${st.owner}» غير معروف`);
  assert.equal(YARD_CYCLE[2].owner, 'gate_officer', 'تسجيل البوابة لضابطها — الدور القائم بلا نظام');
});

test('★★ أمامًا خطوةً خطوة — لا قفزَ ولا رجوع', () => {
  assert.equal(canTransitionVisit('checkedIn', 'verified'), true);
  assert.equal(canTransitionVisit('checkedIn', 'atDoor'), false, 'القفز يُنتج مؤقّتًا بلا بداية');
  assert.equal(canTransitionVisit('verified', 'checkedIn'), false, 'ولا رجوع');
  assert.equal(canTransitionVisit('permitted', 'exited'), true);
  assert.equal(canTransitionVisit('cleared', 'exited'), false, '★ ولا خروجَ يتخطّى التصريح');
});

test('الإلغاء متاحٌ قبل الباب وممنوعٌ بعده — بعده التصحيح بمستند', () => {
  assert.equal(canTransitionVisit('arrived', YARD_CANCELED.id), true);
  assert.equal(canTransitionVisit('parked', YARD_CANCELED.id), true);
  assert.equal(canTransitionVisit('atDoor', YARD_CANCELED.id), false);
  assert.equal(canTransitionVisit(YARD_CANCELED.id, 'arrived'), false, 'والملغاة لا تُحيا');
  assert.equal(yardStage(YARD_CANCELED.id).label, 'ملغاة', 'وتبقى معروفةً لا محذوفة');
});

/* ── الأبواب بيانات (ت-O04) ─────────────────────────────────── */

test('★★ لا بابَ مرسومٌ في الكود — النموذج لا يُصدّر قائمةً ولا بذرة', async () => {
  const mod = await import('./yardModel.js');
  const suspects = Object.entries(mod).filter(
    ([name, value]) =>
      Array.isArray(value) && /door/i.test(name) && value.some((x) => x && typeof x === 'object' && 'code' in x)
  );
  assert.deepEqual(suspects.map(([n]) => n), [], 'الأبواب يضيفها المدير بياناتٍ — قرار المالك ت-O04');
});

test('الباب هويّته رمزُه، والرمز لا يتكرّر', () => {
  assert.deepEqual(doorProblems({ code: 'D9' }), []);
  assert.match(doorProblems({ code: '' })[0], /رمز الباب مطلوب/);
  assert.match(doorProblems({ code: 'd1' }, TEST_DOORS)[0], /مستعمَل/, 'والمقارنة بلا حساسيّة حالة');
});

test('الإخراج من الخدمة حالةٌ لا حذف · والتدفّق الافتراضيّ أوسعُه', () => {
  assert.equal(shapeDoor({ code: 'D9' }).flow, DOOR_FLOWS.both.id);
  assert.equal(shapeDoor({ code: 'D9' }).active, true);
  assert.equal(shapeDoor({ code: 'D3', active: false }).active, false);
  assert.equal(shapeDoor({ code: 'D9', flow: 'زحلقة' }).flow, DOOR_FLOWS.both.id, 'وتدفّقٌ مجهول يُردّ للافتراض');
});

test('★ الموقف مرقّمٌ أو ساحةٌ مفتوحة — الشكل بالإدخال لا بالكود', () => {
  assert.equal(shapeVisit({ plate: 'A1', spot: 'P-12' }).spot, 'P-12');
  assert.equal(shapeVisit({ plate: 'A1' }).spot, '', 'وفراغُه ساحةٌ مفتوحة لا خطأ');
});

test('بابٌ لتدفّقٍ لا يقبل غيره — والمزدوج يقبل الاثنين', () => {
  assert.equal(doorAccepts(TEST_DOORS[0], 'inbound'), true);
  assert.equal(doorAccepts(TEST_DOORS[0], 'outbound'), false);
  assert.equal(doorAccepts(TEST_DOORS[2], 'outbound'), true);
});

/* ── الزيارة ────────────────────────────────────────────────── */

test('★★ الميدان لا يحتمل نموذجًا طويلًا — اللوحة وحدها تمنع', () => {
  assert.match(visitProblems({})[0], /لوحة المركبة مطلوبة/);
  assert.deepEqual(visitProblems({ plate: 'BN-1234' }), [], 'ولا شيء غيرها');
});

test('★★ المستند المرجعيّ يُعلَن نقصه ولا يمنع — الشاحنة لا تُردّ لأجل رقم', () => {
  const gaps = visitGaps({ plate: 'BN-1234' });
  assert.match(gaps.join(' · '), /لا مستندَ مرجعيّ/);
  assert.equal(visitProblems({ plate: 'BN-1234' }).length, 0, 'والنقص لا يمنع الفتح');
  assert.deepEqual(
    visitGaps({ plate: 'BN-1234', driverName: 'سالم', driverId: '99', docRef: { number: 'PO-1' } }),
    []
  );
});

/* ── المؤقّتان ──────────────────────────────────────────────── */

test('★★ المفتوح يُقاس بالآن والمغلق بختمه — ورقمٌ واحد لا يميّزهما', () => {
  const closed = visitTimers(visitUpTo('exited'), NOW);
  assert.equal(closed.wait.open, false);
  assert.equal(closed.wait.minutes, 60, 'من تسجيل البوابة إلى الباب: ثلاث خطواتٍ × ٢٠ دقيقة');
  assert.equal(closed.handling.minutes, 20);
  assert.equal(closed.turnaround.minutes, 160);

  const open = visitTimers(visitUpTo('checkedIn'), NOW);
  assert.equal(open.wait.open, true, 'تنتظر الآن');
  assert.equal(open.wait.minutes, 160, 'ويُقاس انتظارها حتى اللحظة');
  assert.match(open.wait.label, /جاريًا/);
});

test('الانتظار يُقاس من تسجيل البوابة لا من الوصول — ما قبله ليس مسؤوليّة الساحة', () => {
  const t = visitTimers(visitUpTo('atDoor'), NOW);
  assert.equal(t.wait.minutes, 60);
  assert.equal(t.turnaround.open, true, 'والبقاء الكامل ما زال مفتوحًا');
});

test('مؤقّتٌ لم يبدأ يُقال «لم يبدأ» ولا يُعرض صفرًا', () => {
  const t = visitTimers(visitUpTo('arrived'), NOW);
  assert.equal(t.wait.started, false);
  assert.equal(t.wait.minutes, null);
  assert.equal(t.wait.label, 'لم يبدأ');
});

test('التزام الموعد: السبق ليس تأخّرًا فيُعلَن سالبًا', () => {
  const late = visitTimers(shapeVisit({ plate: 'A1', stamps: { bookedAt: T, arrivedAt: T + 30 * MIN } }), NOW);
  assert.equal(late.appointment.late, true);
  assert.match(late.appointment.label, /تأخّر 30/);
  const early = visitTimers(shapeVisit({ plate: 'A1', stamps: { bookedAt: T, arrivedAt: T - 15 * MIN } }), NOW);
  assert.equal(early.appointment.late, false);
  assert.match(early.appointment.label, /سبق الموعد 15/);
  const none = visitTimers(shapeVisit({ plate: 'A1' }), NOW);
  assert.match(none.appointment.label, /بلا موعد/);
});

test('التجاوز يُقال بحدّه المعلَن — والحدود في مصدرٍ واحد', () => {
  const stuck = shapeVisit({ plate: 'A1', stage: 'parked', stamps: { checkedInAt: NOW - (YARD_LIMITS.waitMinutes + 30) * MIN } });
  const alerts = visitAlerts(stuck, NOW);
  assert.match(alerts.join(' '), new RegExp(`وحدّه ${YARD_LIMITS.waitMinutes}`));
  assert.deepEqual(visitAlerts(visitUpTo('checkedIn'), T + 10 * MIN), [], 'والجارية حديثًا بلا تنبيه');
});

test('الموقوفة تُعلن سبب وقفها', () => {
  assert.match(visitAlerts(shapeVisit({ plate: 'A1', holdReason: 'وثائق ناقصة' }), NOW).join(' '), /وثائق ناقصة/);
});

/* ── ★★ الحارس: لا خروج بلا تصريح ─────────────────────────── */

test('★★ لا تخرج مركبةٌ بلا تصريح — ثلاثة أقفالٍ بأسبابها', () => {
  const ok = exitVerdict(visitUpTo('permitted', { permitRef: 'GP-2026-0007' }));
  assert.equal(ok.ok, true, 'مصرَّحةٌ ومُخلاةٌ فتخرج');

  const noPermit = exitVerdict(visitUpTo('permitted'));
  assert.equal(noPermit.ok, false);
  assert.match(noPermit.problems.join(' '), /لا خروج بلا تصريح/);

  const early = exitVerdict(visitUpTo('working', { permitRef: 'GP-1', doorCode: 'D1' }));
  assert.equal(early.ok, false);
  assert.match(early.problems.join(' '), /التصريح أوّلًا/);
});

test('★★ ولا تخرج وهي تشغل بابًا — وإلّا بقي محجوبًا عن غيرها للأبد', () => {
  const occupying = shapeVisit({
    plate: 'BN-1',
    stage: PERMIT_STAGE,
    permitRef: 'GP-1',
    doorCode: 'D1',
    stamps: { atDoorAt: T, permittedAt: T + 30 * MIN },
  });
  const v = exitVerdict(occupying);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /لم يُخلَ بعد/);
});

test('الموقوفة لا تخرج ولو صُرِّح لها', () => {
  const held = visitUpTo('permitted', { permitRef: 'GP-1', holdReason: 'قرار الأمن' });
  assert.match(exitVerdict(held).problems.join(' '), /قرار الأمن/);
});

/* ── إسناد الباب ────────────────────────────────────────────── */

test('★★ بابٌ مشغولٌ لا يُسنَد لاثنتين', () => {
  const busy = [shapeVisit({ plate: 'BN-9', doorCode: 'D1', stage: 'working' })];
  const v = assignDoorVerdict(visitUpTo('parked'), TEST_DOORS[0], busy);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /تشغله BN-9/);
});

test('الباب خارج الخدمة أو مخالف التدفّق يُمنع بسببه', () => {
  assert.match(assignDoorVerdict(visitUpTo('parked'), TEST_DOORS[2], []).problems.join(' '), /خارج الخدمة/);
  assert.match(assignDoorVerdict(visitUpTo('parked'), TEST_DOORS[1], []).problems.join(' '), /تحميل/);
});

test('★ ما قبل التحقّق يُعلَن ولا يمنع — والمشرف يقرّر عالِمًا', () => {
  const v = assignDoorVerdict(visitUpTo('arrived'), TEST_DOORS[0], []);
  assert.equal(v.ok, true);
  assert.match(v.warnings.join(' '), /لم يُستكمَل التحقّق/);
});

/* ── الأبواب حالةً ──────────────────────────────────────────── */

test('★★ حالة الباب نصٌّ لا لونٌ وحده', () => {
  const visits = [shapeVisit({ plate: 'BN-7', doorCode: 'D1', stage: 'working', stamps: { atDoorAt: NOW - 45 * MIN } })];
  const rows = doorOccupancy(TEST_DOORS, visits, NOW);
  assert.equal(rows[0].occupied, true);
  assert.match(rows[0].status, /تشغله BN-7/);
  assert.match(rows[0].status, /45 دقيقة/);
  assert.equal(rows[1].status, 'فارغ');
  assert.equal(rows[2].status, 'خارج الخدمة');
});

test('الباب لا يُحسب مشغولًا إلّا بمن يقف عليه فعلًا', () => {
  const gone = [shapeVisit({ plate: 'BN-7', doorCode: 'D1', stage: 'exited' })];
  assert.equal(doorOccupancy(TEST_DOORS, gone, NOW)[0].occupied, false);
  for (const stage of AT_DOOR_STAGES) {
    const at = [shapeVisit({ plate: 'BN-7', doorCode: 'D1', stage })];
    assert.equal(doorOccupancy(TEST_DOORS, at, NOW)[0].occupied, true, stage);
  }
});

test('لقطة الساحة تقول أين الاختناق', () => {
  const visits = [
    visitUpTo('parked'),
    shapeVisit({ plate: 'BN-2', doorCode: 'D1', stage: 'working', stamps: { atDoorAt: NOW - 30 * MIN, workingAt: NOW - 25 * MIN } }),
    visitUpTo('exited', { plate: 'BN-3', permitRef: 'GP-3' }),
  ];
  const snap = yardSnapshot(TEST_DOORS, visits, NOW);
  assert.equal(snap.doors.total, 3);
  assert.equal(snap.doors.occupied, 1);
  assert.equal(snap.doors.offline, 1);
  assert.equal(snap.onSite, 2);
  assert.equal(snap.waiting, 1);
  assert.equal(snap.atDoor, 1);
  assert.equal(snap.exited, 1);
  assert.equal(snap.avgTurnaroundMinutes, 160);
});
