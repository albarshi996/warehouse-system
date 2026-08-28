/**
 * اختبارات دورة التعبئة — الدخيلُ والزائد وإعادةُ الفتح بسبب، ولوحةُ مناطق التجهيز.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORDER_STATES,
  cancelParcel,
  closePacking,
  closeParcel,
  closeParcelProblem,
  markParcelPrinted,
  orderTransitionProblem,
  packLine,
  packLineVerdict,
  packingCloseProblem,
  packingCounters,
  parcelCard,
  parcelScanVerdict,
  openPacking,
  remainingLines,
  reopenParcel,
  setParcelCount,
  stagingBoard,
} from './packingFlow.js';

const SHP = 'SHP-RH-20260827-000125';
const ORDER = {
  orderRef: 'SO-2026-0044',
  orderType: 'SO',
  customerName: 'سوق المدينة',
  branch: 'RH',
  route: 'R2',
  warehouse: 'W01',
  state: 'PICKED',
  lines: [
    { sku: 'WNW-001', description: 'ماء ٠٫٥', uom: 'كرتون', qty: 10 },
    { sku: 'WNW-002', description: 'ماء ١٫٥', uom: 'كرتون', qty: 4 },
  ],
};
const CTX = { actor: 'u-1', actorName: 'علي', at: '2026-08-27T09:00:00.000Z', stagingBin: 'W01-STG-Z01' };

function ready() {
  const { session } = openPacking(ORDER, CTX);
  return setParcelCount(session, 2, { shipment: SHP }).session;
}

test('الفتح يشترط طلبًا محضَّرًا ومعبِّئًا ووقتًا', () => {
  assert.equal(openPacking(ORDER, CTX).session.state, 'PACKING');
  assert.match(openPacking({ ...ORDER, orderRef: '' }, CTX).problem, /لا مرجعَ للطلب/);
  assert.match(openPacking(ORDER, { ...CTX, actor: '' }).problem, /بلا معبِّئ/);
  assert.match(openPacking({ ...ORDER, lines: [] }, CTX).problem, /بلا بنودٍ محضَّرة/);
  assert.match(openPacking({ ...ORDER, state: 'LOADED' }, CTX).problem, /ختاميّة/);
});

test('حالات الطلب الخمس التي عدّدها النصّ — ومعها منطقة التجهيز', () => {
  assert.equal(ORDER_STATES.PICKING, 'قيد التحضير');
  assert.equal(ORDER_STATES.READY, 'جاهز للتحميل');
  assert.equal(ORDER_STATES.STAGED, 'في منطقة التجهيز');
  assert.equal(orderTransitionProblem('PACKING', 'READY'), '');
  assert.match(orderTransitionProblem('PICKING', 'READY'), /لا انتقال/);
});

test('عدد الطرود يولّد أكوادها من الشحنة', () => {
  const out = setParcelCount(openPacking(ORDER, CTX).session, 3, { shipment: SHP });
  assert.equal(out.session.parcels.length, 3);
  assert.equal(out.session.parcels[0].code, `${SHP}-01`);
  assert.match(setParcelCount(openPacking(ORDER, CTX).session, 0, { shipment: SHP }).problem, /يبدأ من ١/);
  assert.match(setParcelCount(openPacking(ORDER, CTX).session, 2, { shipment: 'W01-A01' }).problem, /ليس رقم شحنة/);
});

test('★★ لا يقلّ العدد عن الطرود المغلقة — ملصقاتُها في الميدان', () => {
  let session = ready();
  session = packLine(session, 1, { sku: 'WNW-001', qty: 10 }).session;
  session = closeParcel(session, 1, { actor: 'u-1', at: 'الآن' }).session;
  assert.match(setParcelCount(session, 0, { shipment: SHP }).problem, /يبدأ من ١/);
  const shrink = setParcelCount({ ...session, parcelTotal: 3 }, 1, { shipment: SHP });
  assert.equal(shrink.problem, undefined, 'واحدٌ يساوي المغلق فيمرّ');
});

test('★★ الدخيل يُردّ — صنفٌ ليس من الطلب يصل العميل ولا يعرف أحدٌ من أين', () => {
  const session = ready();
  const out = packLineVerdict(session, 1, { sku: 'XXX-999', qty: 1 });
  assert.equal(out.ok, false);
  assert.match(out.message, /صنفٌ دخيل/);
});

test('★★ والزائد يُردّ — وتُقال الكمّيّة المتبقّية بالوحدة', () => {
  const session = ready();
  const out = packLineVerdict(session, 1, { sku: 'WNW-001', qty: 11 });
  assert.equal(out.ok, false);
  assert.match(out.message, /المتبقّي من «WNW-001» 10 كرتون/);
});

test('التعبئة تنقص المتبقّي — والمحسوب لا يُخزَّن', () => {
  let session = ready();
  session = packLine(session, 1, { sku: 'WNW-001', qty: 6 }).session;
  session = packLine(session, 1, { sku: 'WNW-001', qty: 4 }).session;
  const rows = remainingLines(session);
  assert.equal(rows.find((r) => r.sku === 'WNW-001').packed, 10, 'والمكرّر يُجمع في بندٍ واحد');
  assert.equal(rows.find((r) => r.sku === 'WNW-001').remaining, 0);
  assert.equal(rows.find((r) => r.sku === 'WNW-002').remaining, 4);
  assert.equal(session.parcels[0].lines.length, 1);
});

test('طردٌ فارغٌ لا يُغلق — ملصقٌ بلا حمولة', () => {
  const session = ready();
  assert.match(closeParcelProblem(session, 1), /فارغ/);
  assert.match(closeParcelProblem(session, 9), /لا طردَ برقم 9/);
});

test('★★ إعادة فتح طردٍ مكتمل: سببٌ وفاعلٌ ووقت — وملصقُه السابق يُبطَل', () => {
  let session = ready();
  session = packLine(session, 1, { sku: 'WNW-001', qty: 10 }).session;
  session = closeParcel(session, 1, { actor: 'u-1', at: 't1' }).session;
  session = markParcelPrinted(session, 1).session;

  assert.match(reopenParcel(session, 1, { actor: 'u-1', at: 't2' }).problem, /سببًا مكتوبًا/);

  const out = reopenParcel(session, 1, { reason: 'صنفٌ ناقص', actor: 'u-2', at: 't2' });
  assert.equal(out.voidLabel, `${SHP}-01`, 'المستدعي يُبطل قيد الملصق في سجلّ الباركود');
  assert.equal(out.session.parcels[0].state, 'REOPENED');
  assert.equal(out.session.parcels[0].reopens[0].reason, 'صنفٌ ناقص');
  assert.equal(out.session.parcels[0].reopens[0].previousLabelCopies, 1);
  assert.match(reopenParcel(out.session, 1, { reason: 'x', actor: 'u', at: 't' }).problem, /لا يُعاد فتحُ ما لم يُغلق/);
});

test('★ الإلغاء حالةٌ لا حذف — وسببُه إلزاميّ', () => {
  let session = ready();
  session = packLine(session, 2, { sku: 'WNW-002', qty: 4 }).session;
  assert.match(cancelParcel(session, 2, { actor: 'u', at: 't' }).problem, /سببًا مكتوبًا/);
  const out = cancelParcel(session, 2, { reason: 'تلف الكرتون', actor: 'u', at: 't' });
  assert.equal(out.session.parcels[1].state, 'CANCELLED');
  assert.equal(out.voidLabel, `${SHP}-02`);
  assert.equal(remainingLines(out.session).find((r) => r.sku === 'WNW-002').remaining, 4, 'والملغى لا يُحسب معبَّأً');
});

test('★★ لا يُتمّ على بندٍ متبقٍّ ولا طردٍ مفتوح — والرسالة تعدّهما', () => {
  let session = ready();
  session = packLine(session, 1, { sku: 'WNW-001', qty: 10 }).session;
  const problem = packingCloseProblem(session);
  assert.match(problem, /طردًا مفتوحًا/);
  assert.match(problem, /لم يُعبَّأ كاملًا/);

  session = closeParcel(session, 1, { actor: 'u', at: 't' }).session;
  session = packLine(session, 2, { sku: 'WNW-002', qty: 4 }).session;
  session = closeParcel(session, 2, { actor: 'u', at: 't' }).session;
  assert.equal(packingCloseProblem(session), '');

  const done = closePacking(session, { actor: 'u', at: 't3' });
  assert.equal(done.session.state, 'READY');
  assert.equal(done.session.closedBy, 'u');
});

test('★ التجاوز يمرّ بسببٍ مكتوبٍ وحده', () => {
  let session = ready();
  session = packLine(session, 1, { sku: 'WNW-001', qty: 1 }).session;
  assert.match(packingCloseProblem(session, { override: true }), /سببًا مكتوبًا/);
  assert.equal(packingCloseProblem(session, { override: true, overrideNote: 'الباقي تالف' }), '');
});

test('مسح الطرد: من شحنةٍ أخرى أو خارج العدد يُردّ برسالةٍ تقول الصواب', () => {
  const session = ready();
  assert.equal(parcelScanVerdict(session, `${SHP}-01`).ok, true);
  assert.match(parcelScanVerdict(session, `${SHP}-03`).message, /الطرد رقم 3 والشحنة 2 طرودًا/);
  assert.match(parcelScanVerdict(session, 'SHP-RH-20260827-000999-01').message, /من شحنة/);
  assert.match(parcelScanVerdict(session, 'W01-A01').message, /ليس رقم طرد|لا يطابق/);
});

test('البطاقة تحمل «١ من ٤» — والعدّادات تصف الجلسة', () => {
  let session = ready();
  session = packLine(session, 1, { sku: 'WNW-001', qty: 10 }).session;
  session = closeParcel(session, 1, { actor: 'u', at: 't' }).session;
  session = markParcelPrinted(session, 1).session;

  const card = parcelCard(session, 1);
  assert.equal(card.ofTotal, '1 من 2');
  assert.equal(card.qty, 10);
  assert.equal(card.stateLabel, 'مغلق');
  assert.equal(parcelCard(session, 9), null);

  const c = packingCounters(session);
  assert.equal(c.closed, 1);
  assert.equal(c.open, 1);
  assert.equal(c.printed, 1);
  assert.equal(c.qtyLeft, 4);
});

test('★ لوحة مناطق التجهيز تجيب أسئلة النصّ الخمسة', () => {
  const a = ready();
  const b = setParcelCount(openPacking({ ...ORDER, orderRef: 'SO-45' }, { ...CTX, stagingBin: 'W01-STG-Z02' }).session, 1, {
    shipment: SHP,
  }).session;

  const board = stagingBoard([a, b]);
  assert.equal(board.length, 2);
  assert.equal(board[0].bin, 'W01-STG-Z01');
  assert.equal(board[0].orders[0].orderRef, 'SO-2026-0044');
  assert.equal(board[0].orders[0].owner, 'علي', 'من يحضّرها');
  assert.equal(board[0].orders[0].startedAt, CTX.at, 'ومتى بدأ');
  assert.equal(board[0].orders[0].stateLabel, 'قيد التعبئة');
  assert.equal(board[0].orders[0].qtyLeft, 14, 'وما بقي');
});
