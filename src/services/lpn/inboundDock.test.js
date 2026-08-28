/**
 * اختبارات باب الاستلام — الحالات الخمس، والمرسَل مقابل المستلَم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INBOUND_PURPOSES,
  INBOUND_STEPS,
  applyInboundScan,
  applyUnload,
  applyUnloadExtra,
  beginUnloading,
  closeInbound,
  inboundCard,
  inboundCloseProblem,
  inboundGaps,
  inboundPurpose,
  inboundScanVerdict,
  inboundVariance,
  openInbound,
  unloadScanVerdict,
} from './inboundDock.js';

const AT = '2026-08-27T08:00:00.000Z';
const A = 'LPN-W02-20260827-000001';
const B = 'LPN-W02-20260827-000002';
const C = 'LPN-W02-20260827-000003';
const DOORS = [
  { code: 'W01-DOCK-IN-01', warehouse: 'W01', active: true },
  { code: 'W01-DOCK-IN-09', warehouse: 'W01', active: false },
];

function gated(overrides = {}) {
  const opened = openInbound({
    purpose: 'TRANSFER_IN',
    warehouse: 'W01',
    expected: [A, B],
    actor: 'u-1',
    actorName: 'سالم',
    at: AT,
    ...overrides,
  });
  let session = opened.session;
  session = applyInboundScan(session, 'DOOR', 'W01-DOCK-IN-01', { actor: 'u-1', at: AT, ctx: { doors: DOORS } }).session;
  session = applyInboundScan(session, 'VEHICLE', 'VEH-RH-TRK-001', { actor: 'u-1', at: AT }).session;
  return beginUnloading(session).session;
}

test('★ الأغراض الخمسة التي عدّدها النصّ — ولكلٍّ وجهتُه التالية', () => {
  assert.equal(Object.keys(INBOUND_PURPOSES).length, 5);
  assert.equal(INBOUND_PURPOSES.SUPPLY.labelAr, 'توريدٌ جديد');
  assert.equal(INBOUND_PURPOSES.RETURNS.nextStop, 'RETURNS', 'المرتجع لا يدخل المخزون الصالح للبيع بلا فرز');
  assert.equal(INBOUND_PURPOSES.TRANSFER_IN.nextStop, 'RECEIVING');
  assert.equal(inboundPurpose('supply').id, 'SUPPLY');
  assert.equal(inboundPurpose('شيء'), null);
  assert.deepEqual(INBOUND_STEPS.map((s) => s.id), ['DOOR', 'VEHICLE', 'ITEMS']);
});

test('★ التحويل يحتاج قائمةَ ما أُرسل — والتوريد الجديد لا', () => {
  assert.match(openInbound({ purpose: 'TRANSFER_IN', actor: 'u', at: AT }).problem, /يحتاج قائمةَ ما أُرسل/);
  assert.equal(openInbound({ purpose: 'SUPPLY', actor: 'u', at: AT }).problem, undefined, 'المورّد لا يرسل طبالينا');
  assert.match(openInbound({ purpose: 'شيء', actor: 'u', at: AT }).problem, /غرضٌ غير معروف/);
  assert.match(openInbound({ purpose: 'SUPPLY', actor: '', at: AT }).problem, /بلا فاعل/);
});

test('★★ باب التحميل يُردّ عند الاستلام — كما تُردّ البوّابة عند التحميل', () => {
  const session = openInbound({ purpose: 'SUPPLY', warehouse: 'W01', actor: 'u', at: AT }).session;
  const out = inboundScanVerdict(session, 'DOOR', 'W01-DOCK-OUT-01', { doors: DOORS });
  assert.equal(out.ok, false);
  assert.match(out.message, /باب تحميل/);
  assert.match(out.message, /لا يقع إلّا في باب استلام/);

  assert.match(inboundScanVerdict(session, 'DOOR', 'W01-DOCK-IN-09', { doors: DOORS }).message, /خارج الخدمة/);
  assert.equal(inboundScanVerdict(session, 'DOOR', 'W01-DOCK-IN-01', { doors: DOORS }).ok, true);
});

test('★★ لا تنزيلَ قبل مسح الباب والمركبة', () => {
  const session = openInbound({ purpose: 'SUPPLY', warehouse: 'W01', actor: 'u', at: AT }).session;
  assert.equal(inboundGaps(session).ok, false);
  assert.deepEqual(inboundGaps(session).missing, ['باب الاستلام', 'المركبة أو الرحلة']);
  assert.match(beginUnloading(session).problem, /ينقص مسحُ/);
  assert.match(unloadScanVerdict(session, A).message, /امسح باب الاستلام والمركبة/);
});

test('لا تُستلم مرّتين — وما ليس في القائمة يُسجَّل زائدًا بقرار', () => {
  let session = gated();
  session = applyUnload(session, A, { actor: 'u', at: AT }).session;
  assert.match(unloadScanVerdict(session, A).message, /مستلَمةٌ في هذه الجلسة أصلًا/);

  const alien = unloadScanVerdict(session, C);
  assert.equal(alien.kind, 'NOT_EXPECTED');
  assert.match(alien.message, /سجّلها زائدةً بسببٍ/);

  assert.match(unloadScanVerdict(session, 'W01-A01').message, /ليس ملصق طبلية ولا طرد/);
});

test('التوريد الجديد يقبل كلّ ما يُمسح — فلا قائمةَ تُقارن', () => {
  let session = openInbound({ purpose: 'SUPPLY', warehouse: 'W01', actor: 'u', at: AT }).session;
  session = applyInboundScan(session, 'DOOR', 'W01-DOCK-IN-01', { actor: 'u', at: AT, ctx: { doors: DOORS } }).session;
  session = applyInboundScan(session, 'VEHICLE', 'VEH-RH-TRK-001', { actor: 'u', at: AT }).session;
  session = beginUnloading(session).session;
  assert.equal(unloadScanVerdict(session, C).ok, true);
});

test('★★ التالف يُسجَّل بوصف الضرر — يُطالَب به المصدر', () => {
  const session = gated();
  assert.match(applyUnload(session, A, { condition: 'DAMAGED', actor: 'u', at: AT }).problem, /وصفَ الضرر/);
  const out = applyUnload(session, A, { condition: 'DAMAGED', reason: 'الكرتون مبلَّل', actor: 'u', at: AT });
  assert.equal(out.session.damaged.length, 1);
  assert.equal(out.session.damaged[0].reason, 'الكرتون مبلَّل');
  assert.equal(out.session.received.length, 1, 'والتالف مستلَمٌ أيضًا — وصل فعلًا');
});

test('★★ الفرق يُحسب: ناقصٌ وزائدٌ وتالف', () => {
  let session = gated();
  session = applyUnload(session, A, { actor: 'u', at: AT }).session;
  session = applyUnloadExtra(session, C, { reason: 'نزلت مع الشحنة', actor: 'u', at: AT }).session;

  const v = inboundVariance(session);
  assert.equal(v.expected, 2);
  assert.equal(v.received, 2);
  assert.equal(v.missing, 1);
  assert.deepEqual(v.missingList, [B]);
  assert.equal(v.extras, 1);
  assert.equal(v.clean, false);

  assert.match(applyUnloadExtra(session, B, { actor: 'u', at: AT }).problem, /سببًا مكتوبًا/);
});

test('★★ لا يُغلق الباب على فرقٍ بلا قرار — والتجاوز بسببٍ يُقيَّد', () => {
  let session = gated();
  session = applyUnload(session, A, { actor: 'u', at: AT }).session;

  assert.match(inboundCloseProblem(session), /لم تصل/);
  assert.match(inboundCloseProblem(session, { override: true }), /سببًا مكتوبًا/);
  assert.equal(inboundCloseProblem(session, { override: true, overrideNote: 'محضر فرقٍ رقم ٤' }), '');

  session = applyUnload(session, B, { actor: 'u', at: AT }).session;
  assert.equal(inboundCloseProblem(session), '', 'واكتملت فلا مانع');
});

test('★★ الإغلاق يقول الوجهة التالية — مشتقّةً من الغرض لا مختارةً بيد', () => {
  let session = gated();
  session = applyUnload(session, A, { actor: 'u', at: AT }).session;
  session = applyUnload(session, B, { actor: 'u', at: AT }).session;

  const done = closeInbound(session, { actor: 'u', at: AT });
  assert.equal(done.session.state, 'CLOSED');
  assert.equal(done.nextStop, 'RECEIVING');
  assert.match(done.nextLabel, /ساحة الاستلام/);
  assert.equal(done.variance.clean, true);

  const returns = closeInbound(
    { ...session, purpose: 'RETURNS' },
    { actor: 'u', at: AT }
  );
  assert.equal(returns.nextStop, 'RETURNS', 'والمرتجع إلى منطقة فحص المرتجعات');
});

test('البطاقة تجمع ما يُقرأ في محضر الفرق', () => {
  let session = gated();
  session = applyUnload(session, A, { condition: 'DAMAGED', reason: 'مبلَّل', actor: 'u', at: AT }).session;
  const card = inboundCard(session);
  assert.equal(card.purposeLabel, 'تحويلٌ من مستودعٍ آخر');
  assert.equal(card.door, 'W01-DOCK-IN-01');
  assert.equal(card.vehicle, 'VEH-RH-TRK-001');
  assert.equal(card.damaged, 1);
  assert.equal(card.missing, 1);
  assert.equal(card.arrivedAt, AT);
  assert.equal(card.trust, 100);
});
