/**
 * اختبارات بوّابة الخروج — الفرق بين البابِ والبوّابة، والخروج بمسحتين.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXIT_STEPS,
  applyExitScan,
  blockAtGate,
  exitCard,
  exitCloseProblem,
  exitGaps,
  exitReadiness,
  exitScanVerdict,
  exitStep,
  openExit,
  stampExit,
} from './exitGate.js';

const AT = '2026-08-27T13:00:00.000Z';
const A = 'LPN-W01-20260827-000001';
const B = 'LPN-W01-20260827-000002';

const fullLoad = { state: 'CLOSED', expected: [A], loaded: [A], extras: [] };
const shortLoad = { state: 'CLOSED', expected: [A, B], loaded: [A], extras: [] };

function scanned() {
  let session = openExit({ warehouse: 'W01', actor: 'g-1', actorName: 'ضابط البوّابة', at: AT }).session;
  session = applyExitScan(session, 'GATE', 'GATE-OUT-01', { actor: 'g-1', at: AT }).session;
  session = applyExitScan(session, 'VEHICLE', 'VEH-RH-TRK-001', { actor: 'g-1', at: AT }).session;
  return session;
}

test('خطوتان لا أربع — البوّابة ثمّ المركبة أو الرحلة', () => {
  assert.deepEqual(EXIT_STEPS.map((s) => s.id), ['GATE', 'VEHICLE']);
  assert.equal(exitStep('GATE').labelAr, 'بوّابة الخروج');
  assert.equal(exitStep('DOOR'), null, 'وليس فيها بابُ تحميل');
});

test('★★★ باب التحميل يُردّ عند البوّابة — والرسالة تشرح الفرق للعامل', () => {
  const session = openExit({ actor: 'g-1', at: AT }).session;
  const out = exitScanVerdict(session, 'GATE', 'W01-DOCK-OUT-01', {});
  assert.equal(out.ok, false);
  assert.match(out.message, /باب تحميل/);
  assert.match(out.message, /البابُ حيث دخلت الطلبات السيارة، والبوّابة حيث غادرت/);
});

test('البوّابة الصحيحة تمرّ — والخارجة عن الخدمة تُردّ', () => {
  const session = openExit({ actor: 'g-1', at: AT }).session;
  assert.equal(exitScanVerdict(session, 'GATE', 'GATE-OUT-01', {}).ok, true);
  assert.match(
    exitScanVerdict(session, 'GATE', 'GATE-OUT-02', { gates: [{ code: 'GATE-OUT-02', active: false }] }).message,
    /خارج الخدمة/
  );
  assert.match(exitScanVerdict(session, 'GATE', 'W01-A01', {}).message, /المطلوب بوّابة خروج/);
});

test('المركبة أو الرحلة — أحدهما يكفي، والخطأ يُسمّى', () => {
  const session = openExit({ actor: 'g-1', at: AT }).session;
  assert.equal(exitScanVerdict(session, 'VEHICLE', 'VEH-RH-TRK-001', {}).ok, true);
  assert.equal(exitScanVerdict(session, 'VEHICLE', 'TRIP-2026-0001', {}).ok, true, 'والرحلة تقوم مقامها');
  assert.match(
    exitScanVerdict(session, 'VEHICLE', 'TRIP-2026-0009', { expectedTrip: 'TRIP-2026-0001' }).message,
    /الرحلة المتوقَّعة/
  );
  assert.match(exitScanVerdict(session, 'VEHICLE', 'W01-A01', {}).message, /المطلوب مركبةٌ أو رحلة/);
});

test('★★ لا خروج بمسحةٍ واحدة — والرسالة تسمّي الناقص', () => {
  let session = openExit({ actor: 'g-1', at: AT }).session;
  assert.equal(exitGaps(session).ok, false);
  session = applyExitScan(session, 'GATE', 'GATE-OUT-01', { actor: 'g-1', at: AT }).session;
  const gaps = exitGaps(session);
  assert.equal(gaps.ok, false);
  assert.deepEqual(gaps.missing, ['المركبة أو الرحلة']);
  assert.equal(exitGaps(scanned()).ok, true);
});

test('★★ لا تخرج ناقصةً ولا زائدة — وكلُّ سببٍ يُعدَّد', () => {
  const short = exitReadiness(scanned(), { dock: shortLoad });
  assert.equal(short.ok, false);
  assert.match(short.problems.join(' '), /لم تُحمَّل/);

  const extra = exitReadiness(scanned(), { dock: { ...fullLoad, extras: [{ lpn: B }] } });
  assert.equal(extra.ok, false);
  assert.match(extra.problems.join(' '), /زائدةً على الرحلة/);

  assert.equal(exitReadiness(scanned(), { dock: fullLoad }).ok, true);
});

test('★ بلا جلسة تحميلٍ يُعلَن ولا يُمنع — والفتوحة تُنبَّه', () => {
  const none = exitReadiness(scanned(), {});
  assert.equal(none.ok, true);
  assert.match(none.warnings.join(' '), /بلا مطابقةِ حمولة/);

  const open = exitReadiness(scanned(), { dock: { ...fullLoad, state: 'OPEN' } });
  assert.equal(open.ok, true);
  assert.match(open.warnings.join(' '), /لم تُغلق بعد/);
});

test('حكمُ الساحة القائم يُستدعى كما هو — تصريحٌ وإخلاءُ باب', () => {
  const visit = { stage: 'working', doorCode: 'W01-DOCK-OUT-01', permitRef: '' };
  const out = exitReadiness(scanned(), { dock: fullLoad, visit });
  assert.equal(out.ok, false);
  assert.match(out.problems.join(' '), /لا خروج بلا تصريح/);
});

test('★★ ختمُ الخروج يقع مرّةً — والمسحة الثانية تُعلن ولا تُخطئ', () => {
  const out = stampExit(scanned(), { dock: fullLoad }, { actor: 'g-1', at: AT });
  assert.equal(out.session.state, 'EXITED');
  assert.equal(out.session.exitedAt, AT, 'وهو وقتُ الخروج الفعليّ');
  assert.equal(out.tripState, 'خرجت للتسليم');

  const again = stampExit(out.session, { dock: fullLoad }, { actor: 'g-1', at: '2026-08-27T14:00:00.000Z' });
  assert.equal(again.already, true);
  assert.equal(again.problem, undefined, 'العامل الذي يمسح مرّتين لا يُعاقَب برسالة خطأ');
  assert.equal(again.session.exitedAt, AT, 'ولا يُزاح الختم الأوّل');

  const rescan = exitScanVerdict(out.session, 'GATE', 'GATE-OUT-01', {});
  assert.equal(rescan.kind, 'ALREADY');
});

test('★★ التجاوز يرفع النقص بسببٍ — ولا يرفع بيّنةَ المسح أبدًا', () => {
  assert.match(exitCloseProblem(scanned(), { dock: shortLoad }), /لم تُحمَّل/);
  assert.match(exitCloseProblem(scanned(), { dock: shortLoad }, { override: true }), /سببًا مكتوبًا/);
  assert.equal(exitCloseProblem(scanned(), { dock: shortLoad }, { override: true, overrideNote: 'قرار المدير' }), '');

  // بابٌ لم يُمسح لا يُعوَّض بسبب — البيّنة لا تُشترى.
  const half = openExit({ actor: 'g-1', at: AT }).session;
  assert.match(
    exitCloseProblem(half, { dock: fullLoad }, { override: true, overrideNote: 'مستعجل' }),
    /ينقص مسحُ/
  );
});

test('الإيقاف عند البوّابة حالةٌ بسبب', () => {
  assert.match(blockAtGate(scanned(), { actor: 'g', at: AT }).problem, /سببًا مكتوبًا/);
  const out = blockAtGate(scanned(), { reason: 'بلا تصريح خروج', actor: 'g', at: AT });
  assert.equal(out.session.state, 'BLOCKED');
  assert.equal(out.session.blockReason, 'بلا تصريح خروج');
});

test('البطاقة تجمع الحال والأسباب والثقة', () => {
  const card = exitCard(scanned(), { dock: shortLoad });
  assert.equal(card.gate, 'GATE-OUT-01');
  assert.equal(card.vehicle, 'VEH-RH-TRK-001');
  assert.equal(card.ready, false);
  assert.ok(card.problems.length >= 1);
  assert.equal(card.trust, 100);
  assert.equal(card.stateLabel, 'بانتظار المسح');
});

test('★ الاختيار اليدويّ عند البوّابة يمرّ بسببٍ ويُوسم', () => {
  let session = openExit({ actor: 'g-1', at: AT }).session;
  const manual = applyExitScan(session, 'GATE', 'GATE-OUT-01', {
    actor: 'g-1',
    at: AT,
    manual: true,
    reason: 'ملصق البوّابة ممزَّق',
  });
  assert.equal(manual.problem, undefined);
  session = applyExitScan(manual.session, 'VEHICLE', 'VEH-RH-TRK-001', { actor: 'g-1', at: AT }).session;
  const card = exitCard(session, { dock: fullLoad });
  assert.equal(card.ready, true);
  assert.equal(card.manualProofs, 1);
  assert.equal(card.trust, 50);
});
