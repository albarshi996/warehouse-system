/**
 * اختبارات التحميل عند الباب — المسح الرباعيّ الذي كتبه النصّ في أربع خطوات.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOCK_STEPS,
  applyGateScan,
  applyItemExtra,
  applyItemScan,
  beginLoading,
  closeDock,
  dockCard,
  dockCloseProblem,
  dockCounters,
  dockStep,
  gateGaps,
  gateScanVerdict,
  itemScanVerdict,
  openDockSession,
} from './dockLoading.js';

const AT = '2026-08-27T10:00:00.000Z';
const A = 'LPN-W01-20260827-000001';
const B = 'LPN-W01-20260827-000002';
const PARCEL = 'SHP-RH-20260827-000125-01';
const UNIT = { code: A, state: 'STAGED', flags: [] };
const DOORS = [
  { code: 'W01-DOCK-OUT-01', warehouse: 'W01', active: true },
  { code: 'W01-DOCK-OUT-09', warehouse: 'W01', active: false },
  { code: 'W02-DOCK-OUT-01', warehouse: 'W02', active: true },
];

function gated(ctx = {}) {
  let session = openDockSession({ warehouse: 'W01', actor: 'u-1', actorName: 'سالم', at: AT }).session;
  session = applyGateScan(session, 'DOOR', 'W01-DOCK-OUT-01', { actor: 'u-1', at: AT, ctx: { doors: DOORS, ...ctx } }).session;
  session = applyGateScan(session, 'VEHICLE', 'VEH-RH-TRK-001', { actor: 'u-1', at: AT, ctx }).session;
  session = applyGateScan(session, 'TRIP', 'TRIP-2026-0001', { actor: 'u-1', at: AT, ctx }).session;
  return session;
}

test('الخطوات الأربع بالترتيب الذي كتبه النصّ', () => {
  assert.deepEqual(DOCK_STEPS.map((s) => s.id), ['DOOR', 'VEHICLE', 'TRIP', 'ITEMS']);
  assert.equal(dockStep('DOOR').labelAr, 'باب التحميل');
  assert.equal(dockStep('لا شيء'), null);
});

test('الجلسة تُفتح فارغةً — الخطوات بيّناتٌ تُمسح لا إعداداتٌ تُختار', () => {
  const out = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT });
  assert.equal(out.session.state, 'GATE');
  assert.deepEqual(out.session.proofs, []);
  assert.match(openDockSession({ actor: '', at: AT }).problem, /بلا فاعل/);
  assert.match(openDockSession({ actor: 'u', at: '' }).problem, /بلا وقت/);
});

test('★★ بابُ استلامٍ لا يُقبل للتحميل — الفرق الذي أصرّ عليه النصّ', () => {
  const session = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT }).session;
  const wrong = gateScanVerdict(session, 'DOOR', 'W01-DOCK-IN-01', { doors: DOORS });
  assert.equal(wrong.ok, false);
  assert.match(wrong.message, /باب استلام/);
});

test('★ بابٌ خارج الخدمة أو من مستودعٍ آخر يُردّ برسالةٍ تسمّي السبب', () => {
  const session = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT }).session;
  assert.match(gateScanVerdict(session, 'DOOR', 'W01-DOCK-OUT-09', { doors: DOORS }).message, /خارج الخدمة/);
  assert.match(gateScanVerdict(session, 'DOOR', 'W02-DOCK-OUT-01', { doors: DOORS }).message, /تابعٌ لمستودع W02/);
  assert.equal(gateScanVerdict(session, 'DOOR', 'W01-DOCK-OUT-01', { doors: DOORS }).ok, true);
});

test('★★ الملصق بالصورة الكاملة يُقبل — ويعود إلى المعرّف', () => {
  const session = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT }).session;
  const out = applyGateScan(session, 'DOOR', 'BR-RH-W01-DOCK-OUT-01', {
    actor: 'u-1',
    at: AT,
    ctx: { doors: DOORS, qualifier: { company: 'BR', branch: 'RH' } },
  });
  assert.equal(out.session.door, 'W01-DOCK-OUT-01');
});

test('★★ مركبةٌ غير مركبة الرحلة تُردّ قبل أن يُحمَّل شيء', () => {
  const session = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT }).session;
  const out = gateScanVerdict(session, 'VEHICLE', 'VEH-RH-TRK-002', { expectedVehicle: 'VEH-RH-TRK-001', expectedPlate: '12-3456' });
  assert.equal(out.ok, false);
  assert.match(out.message, /المطلوبة «VEH-RH-TRK-001»/);
});

test('★ أمرُ تحميلٍ غير المتوقَّع يُردّ', () => {
  const session = openDockSession({ actor: 'u-1', at: AT }).session;
  assert.match(gateScanVerdict(session, 'TRIP', 'TRIP-2026-0009', { expectedTrip: 'TRIP-2026-0001' }).message, /المتوقَّع/);
  assert.equal(gateScanVerdict(session, 'TRIP', 'TRIP-2026-0001', { expectedTrip: 'TRIP-2026-0001' }).ok, true);
  assert.match(gateScanVerdict(session, 'TRIP', 'W01-A01', {}).message, /المطلوب مستند/);
});

test('★★★ لا تحميلَ قبل اكتمال المسح الثلاثيّ — القاعدة تصير حارسًا لا وعدًا', () => {
  let session = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT }).session;
  const gaps = gateGaps(session);
  assert.equal(gaps.ok, false);
  assert.deepEqual(gaps.missing, ['باب التحميل', 'المركبة', 'الرحلة أو أمر التحميل']);

  assert.match(beginLoading(session, { expected: [A], actor: 'u-1', at: AT }).problem, /ينقص مسحُ/);
  assert.match(itemScanVerdict(session, A, UNIT).message, /أكمل مسح الباب والمركبة والرحلة/);

  session = gated();
  assert.equal(gateGaps(session).ok, true);
  const started = beginLoading(session, { expected: [A, B], actor: 'u-1', at: AT });
  assert.equal(started.problem, undefined);
  assert.equal(started.session.state, 'LOADING');
});

test('الحمولة طبليةٌ أو طرد — والقاعدتان القديمتان تعملان كما هما', () => {
  let session = beginLoading(gated(), { expected: [A, PARCEL], actor: 'u-1', at: AT }).session;

  const first = applyItemScan(session, A, { actor: 'u-1', at: AT, unit: UNIT });
  assert.equal(first.problem, undefined);
  session = first.session;

  const again = applyItemScan(session, A, { actor: 'u-1', at: AT, unit: UNIT });
  assert.match(again.problem, /محمَّلةٌ في هذه الرحلة أصلًا/, 'لا تُحمَّل مرّتين — القاعدة القديمة تعمل');

  const parcel = applyItemScan(session, PARCEL, { actor: 'u-1', at: AT });
  assert.equal(parcel.problem, undefined, 'والطرد يُحمَّل كالطبلية بعد التوسعة');
  assert.equal(parcel.session.itemProofs.length, 2);

  const alien = applyItemScan(session, B, { actor: 'u-1', at: AT, unit: { code: B, state: 'STAGED', flags: [] } });
  assert.match(alien.problem, /ليست في هذه الرحلة/);
});

test('★ الزائدة تُسجَّل بسببٍ ولا تُبتلع', () => {
  const session = beginLoading(gated(), { expected: [A], actor: 'u-1', at: AT }).session;
  assert.match(applyItemExtra(session, B, { actor: 'u-1', at: AT }).problem, /سببًا مكتوبًا/);
  const out = applyItemExtra(session, B, { reason: 'قرار المشرف', actor: 'u-1', at: AT });
  assert.equal(out.session.loading.extras.length, 1);
  assert.equal(out.session.itemProofs.length, 1);
});

test('★★ الاختيار اليدويّ يمرّ بسببٍ ويُوسم — فتنقص الثقة ويظهر في التقرير', () => {
  let session = openDockSession({ warehouse: 'W01', actor: 'u-1', at: AT }).session;
  session = applyGateScan(session, 'DOOR', 'W01-DOCK-OUT-01', { actor: 'u-1', at: AT, ctx: { doors: DOORS } }).session;
  const manual = applyGateScan(session, 'VEHICLE', 'VEH-RH-TRK-001', {
    actor: 'u-1',
    at: AT,
    manual: true,
    reason: 'ملصق السيارة تالف',
  });
  assert.equal(manual.problem, undefined);
  session = applyGateScan(manual.session, 'TRIP', 'TRIP-2026-0001', { actor: 'u-1', at: AT }).session;

  const c = dockCounters(session);
  assert.equal(c.gateReady, true, 'البيّنة اليدويّة بيّنةٌ — لا توقف العمل');
  assert.equal(c.proof.manual, 1);
  assert.ok(c.proof.trust < 100, 'لكنّها تنقص الثقة فتُسأل');

  const noReason = applyGateScan(session, 'DOOR', 'W01-DOCK-OUT-02', { actor: 'u-1', at: AT, manual: true });
  assert.match(noReason.problem, /سببًا مكتوبًا/);
});

test('الإغلاق يرثُ حارس النقص والزيادة من الجلسة القائمة', () => {
  let session = beginLoading(gated(), { expected: [A, B], actor: 'u-1', at: AT }).session;
  session = applyItemScan(session, A, { actor: 'u-1', at: AT, unit: UNIT }).session;

  assert.match(dockCloseProblem(session), /لم تُحمَّل/);
  assert.match(dockCloseProblem(session, { override: true }), /سببًا مكتوبًا/);

  const closed = closeDock(session, { actor: 'u-1', at: AT, override: true, overrideNote: 'الباقي تالف' });
  assert.equal(closed.session.state, 'CLOSED');
  assert.equal(closed.session.loading.state, 'CLOSED');
  assert.match(dockCloseProblem(closed.session), /لا تُغلق إلّا وهي قيد التحميل/);
});

test('★ البطاقة تُقرأ بعد سنةٍ: أيُّ بابٍ وسيارةٍ ورحلةٍ وكم حمولةً وبأيّ بيّنة', () => {
  let session = beginLoading(gated(), { expected: [A], actor: 'u-1', at: AT }).session;
  session = applyItemScan(session, A, { actor: 'u-1', at: AT, unit: UNIT }).session;
  const card = dockCard(session);
  assert.equal(card.door, 'W01-DOCK-OUT-01');
  assert.equal(card.vehicle, 'VEH-RH-TRK-001');
  assert.equal(card.tripRef, 'TRIP-2026-0001');
  assert.equal(card.loaded, 1);
  assert.equal(card.complete, true);
  assert.equal(card.trust, 100);
  assert.equal(card.openedBy, 'سالم');
});
