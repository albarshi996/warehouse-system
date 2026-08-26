/**
 * اختبارات جلسة الاستلام — «كم بقي مفتوحًا؟» سؤالُ الواقف عند الشاحنة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATES,
  abandonSession,
  applyAccepted,
  attachPallet,
  closeSession,
  findSessionLine,
  openOrderCard,
  openSession,
  remainingOf,
  sessionCloseProblem,
  sessionLines,
  sessionOpenProblem,
  sessionTotals,
} from './receivingSession.js';

const PO = {
  id: 'po-1',
  type: 'PO',
  number: 'PO-2026-0015',
  state: 'approved',
  supplier: 'شركة نوفا',
  warehouse: 'main',
  issueDate: '2026-08-20',
  requiredDelivery: '2026-08-27',
  lines: [
    { sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', qty: 100 },
    { sku: 'WNW-002', barcode: '6222', description: 'ماء صغير', uom: 'CTN', qty: 50 },
  ],
};

/** تقدّمٌ مصنوعٌ يدويًّا — الجلسة تستهلكه ولا تحسبه. */
const progressOf = (open1, open2) => ({
  documentId: PO.id,
  documentType: 'PO',
  lines: [
    { lineId: 'L1', lineNumber: 1, sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', requested: 100, open: open1 },
    { lineId: 'L2', lineNumber: 2, sku: 'WNW-002', barcode: '6222', description: 'ماء صغير', uom: 'CTN', requested: 50, open: open2 },
  ],
  totals: { requested: 150, executed: 150 - open1 - open2, open: open1 + open2 },
});

const CTX = { actor: 'محمد', at: '2026-08-26T08:00:00Z', warehouse: 'MAIN' };

test('★★ الجلسة تُفتح على أمرٍ معتمدٍ له رصيدٌ مفتوح — وتحمل الرصيد للميدان', () => {
  const r = openSession(PO, progressOf(100, 50), CTX);
  assert.equal(r.problem, undefined);
  assert.equal(r.session.state, 'OPEN');
  assert.equal(r.session.order.number, 'PO-2026-0015');
  assert.equal(r.session.warehouse, 'MAIN');
  assert.equal(r.session.lines.length, 2);
  assert.equal(r.session.lines[0].open, 100);
  assert.equal(r.session.lines[0].received, 0, 'المقروء يبدأ صفرًا — والمستلَم سابقًا داخلٌ في المفتوح');
});

test('★★ الرصيد المفتوح من تقدّم البنود القائم — والاستلام الجزئيّ السابق محسوبٌ فيه', () => {
  // استُلم ٤٠ من المئة سابقًا ⇒ المفتوح ٦٠. الجلسة لا تحسب هذا بنفسها.
  const lines = sessionLines(PO, progressOf(60, 50));
  assert.equal(lines[0].ordered, 100, 'المطلوب الأصليّ يظهر');
  assert.equal(lines[0].open, 60, 'والمفتوح ما بقي — لا عمودَ موازٍ');
});

test('لا استلام دون مستندٍ معتمد — والرسالة تسمّي العلّة والقاعدة', () => {
  assert.match(sessionOpenProblem(null, progressOf(100, 50)), /لا مستند/);
  assert.match(sessionOpenProblem({ ...PO, type: 'SO' }, progressOf(100, 50)), /أمر شراءٍ أو أمر نقل/);
  assert.match(sessionOpenProblem({ ...PO, state: 'draft' }, progressOf(100, 50)), /حتى يُعتمد/);
  assert.match(sessionOpenProblem({ ...PO, state: 'canceled' }, progressOf(100, 50)), /حتى يُعتمد/);
  assert.equal(sessionOpenProblem({ ...PO, state: 'done' }, progressOf(100, 50)), '', 'المنجَز يُستلم عليه ما دام مفتوحًا');
});

test('★ أمرٌ استُلم كاملًا لا تُفتح عليه جلسة — والزائد قرارٌ لا جلسة', () => {
  const p = sessionOpenProblem(PO, progressOf(0, 0));
  assert.match(p, /استُلم كاملًا/);
  assert.match(p, /يحتاج قرارًا/, 'تقول الصواب: أين يذهب الزائد');
});

test('الجلسة بلا فاعلٍ أو وقتٍ لا تُفتح', () => {
  assert.match(openSession(PO, progressOf(100, 50), { at: CTX.at }).problem, /بلا فاعل/);
  assert.match(openSession(PO, progressOf(100, 50), { actor: 'محمد' }).problem, /بلا وقت/);
});

test('مستودع الجلسة: اختيار الموظّف وإلّا مستودع الأمر — ولا حمولةَ بلا مستودع', () => {
  assert.equal(openSession(PO, progressOf(100, 50), { ...CTX, warehouse: 'TRP' }).session.warehouse, 'TRP');
  assert.equal(openSession(PO, progressOf(100, 50), { ...CTX, warehouse: '' }).session.warehouse, 'MAIN', 'من الأمر ومُطبَّعًا');
});

test('السطر يُوجد بالكود أوّلًا ثمّ بالباركود توافقًا — والمجهول null', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  assert.equal(findSessionLine(s, { sku: 'wnw-001' }).lineId, 'L1', 'التطبيع قبل المقارنة');
  assert.equal(findSessionLine(s, { barcode: '6222' }).lineId, 'L2');
  assert.equal(findSessionLine(s, { sku: 'XX-9' }), null);
});

test('★★ المتبقّي يُشتقّ لحظيًّا: المفتوح ناقص ما قُرئ — ولا يهبط تحت الصفر', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  const after = applyAccepted(s, { lineId: 'L1', qty: 30 });
  assert.equal(after.lines[0].received, 30);
  assert.equal(remainingOf(after.lines[0]), 70);

  const over = applyAccepted(after, { lineId: 'L1', qty: 999 });
  assert.equal(remainingOf(over.lines[0]), 0, 'المتبقّي لا يُسالَب — والتجاوز يُحكم عليه في المسح');
  assert.equal(s.lines[0].received, 0, 'الأصل لا يُعدَّل — نسخٌ لا طفرة');
});

test('الخلاصة لحظيّة: المطلوب والمفتوح والمقروء والمتبقّي وعدد الطبالي', () => {
  let s = openSession(PO, progressOf(100, 50), CTX).session;
  s = applyAccepted(s, { lineId: 'L1', qty: 30, rejectedQty: 5 });
  s = attachPallet(s, 'LPN-MAIN-20260826-000001');
  const t = sessionTotals(s);
  assert.deepEqual(
    { ordered: t.ordered, open: t.open, received: t.received, rejected: t.rejected, remaining: t.remaining, palletCount: t.palletCount },
    { ordered: 150, open: 150, received: 30, rejected: 5, remaining: 120, palletCount: 1 }
  );
});

test('الجلسة الواحدة تكوّن طبليةً أو أكثر — والمكرّرة لا تُضاف مرّتين', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  const one = attachPallet(s, 'LPN-MAIN-20260826-000001');
  const twice = attachPallet(one, 'LPN-MAIN-20260826-000001');
  assert.equal(twice.pallets.length, 1);
  assert.equal(attachPallet(one, 'LPN-MAIN-20260826-000002').pallets.length, 2);
});

test('★★ الجلسة تُغلق ولو بقي مفتوحٌ — الاستلام الجزئيّ واقعُ مستودعٍ لا خطأ', () => {
  let s = openSession(PO, progressOf(100, 50), CTX).session;
  s = applyAccepted(s, { lineId: 'L1', qty: 30 });
  s = attachPallet(s, 'LPN-MAIN-20260826-000001');
  const closed = closeSession(s, { actor: 'محمد', at: CTX.at });
  assert.equal(closed.problem, undefined, 'المتبقّي ١٢٠ ولا يمنع الإغلاق');
  assert.equal(closed.session.state, 'CLOSED');
  assert.match(closeSession(closed.session, { actor: 'محمد' }).problem, /لا تُغلق مرّتين/);
});

test('★ جلسةٌ بلا طبليةٍ تُترك بسببٍ لا تُغلق إغلاقَ فراغ', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  assert.match(sessionCloseProblem(s), /لم تُنتج شيئًا/);
  assert.match(abandonSession(s, { actor: 'محمد' }).problem, /سببًا مكتوبًا/);
  const left = abandonSession(s, { reason: 'الشاحنة تأخّرت — يُستأنف غدًا', actor: 'محمد', at: CTX.at });
  assert.equal(left.session.state, 'ABANDONED');
  assert.equal(left.session.abandonReason, 'الشاحنة تأخّرت — يُستأنف غدًا');
  assert.equal(SESSION_STATES.ABANDONED, 'متروكة');
});

test('★★ بطاقةُ الأمر للهاتف: حقول خطة ٧ — وما تَعِد به القائمة تقيس عليه الجلسة', () => {
  const card = openOrderCard(PO, [], []);
  assert.equal(card.number, 'PO-2026-0015');
  assert.equal(card.supplier, 'شركة نوفا');
  assert.equal(card.warehouse, 'MAIN');
  assert.equal(card.lineCount, 2);
  assert.equal(card.ordered, 150);
  assert.equal(card.open, 150, 'بلا علاقاتٍ: لم يُستلم شيء فالمفتوح كلّه');
  assert.ok(card.canReceive);
  assert.equal(card.blockedBecause, '');

  const draft = openOrderCard({ ...PO, state: 'draft' }, [], []);
  assert.ok(!draft.canReceive);
  assert.match(draft.blockedBecause, /حتى يُعتمد/, 'القائمة تقول لماذا لا يُستلم — لا تُخفي الأمر');
});
