/**
 * حارس طلب الفرع المقترَح ‹FNB-302›.
 *
 * أخطر ما يحرسه: **لا صفحةَ فارغة** (الطلب يُفتح مملوءًا بكمّيّاتٍ محسوبة)،
 * و**كلّ سطرٍ يحمل مرجعه** (المقترح والمخزون والمعدّل وبالطريق والأيّام)،
 * و**المقترح مختومٌ على السطر** فيبقى الانحراف قابلًا للقياس بعد الحفظ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBranchOrder, toTransferRequest, lineDeviation, orderDeviations, eligibleForReplenishment,
  deviationVerdict, deviationException, policyReviewSignals, DEVIATION_EXCEPTION_PCT,
} from './branchOrder.js';
import { shapeBranchProfile } from '../org/branchProfile.js';
import { getSchema } from '../documents/schemas/index.js';
import { EXCEPTION_TYPES, shapeException } from '../ledger/exceptions.js';
import { reasonsFor } from '../documents/reasonCodes.js';

/** حركات خروجٍ من فرعٍ بعينه، مختومةٌ ببُعده. */
const branchMoves = (sku, perDay, days, branch, from = '2026-07-12') =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    return { sku, qty: perDay, from: branch, to: null, orgBranch: branch, date: d };
  });

const OPERATING = (extra = {}) => ({
  code: 'BR01',
  level: 'branch',
  profile: shapeBranchProfile({ state: 'operating', openingDate: '2026-01-01', concept: 'qsr', ...extra }),
});

const CTX = {
  items: [{ sku: 'A', nameAr: 'دجاج' }, { sku: 'B', nameAr: 'أرزّ' }],
  moves: [...branchMoves('A', 20, 30, 'BR01'), ...branchMoves('B', 2, 30, 'BR01')],
  balances: [{ sku: 'A', warehouse: 'BR01', qty: 10 }, { sku: 'B', warehouse: 'BR01', qty: 500 }],
  today: '2026-08-11',
};

test('★★ لا صفحةَ فارغة: الطلب يُفتح مملوءًا بكمّيّاتٍ محسوبة', () => {
  const order = buildBranchOrder(OPERATING(), CTX);
  assert.equal(order.ok, true);
  assert.ok(order.lines.length > 0, 'الطلب مملوءٌ لا فارغ');
  const a = order.lines.find((l) => l.sku === 'A');
  assert.ok(a.suggestQty > 0);
  assert.equal(a.qty, a.suggestQty, 'الكمّيّة تبدأ مساويةً للمقترح');
});

test('★★ كلّ سطرٍ يحمل مرجعه — المقترح والمخزون والمعدّل والأيّام والسبب', () => {
  const order = buildBranchOrder(OPERATING(), { ...CTX, inTransitBySku: new Map([['A', 25]]) });
  const a = order.lines.find((l) => l.sku === 'A');
  for (const key of ['suggestQty', 'onHand', 'inTransit', 'rate', 'daysLeft', 'urgency', 'why']) {
    assert.ok(a[key] !== undefined, `المرجع ينقصه «${key}»`);
  }
  assert.equal(a.onHand, 10);
  assert.equal(a.inTransit, 25);
  assert.match(a.why, /تبيع/);
});

test('★ فرعٌ لم يفتتح يُخدَم بشدّة الافتتاح لا بالمقترح', () => {
  const opening = { code: 'BR02', level: 'branch', profile: shapeBranchProfile({ state: 'opening' }) };
  const order = buildBranchOrder(opening, CTX);
  assert.equal(order.ok, false);
  assert.equal(order.servedBy, 'opening');
  assert.deepEqual(order.lines, []);
  assert.ok(order.notes.some((n) => n.includes('شدّة الافتتاح')));
  assert.equal(eligibleForReplenishment(opening), false);
  assert.equal(eligibleForReplenishment(OPERATING()), true);
});

test('الأصناف المعتمَدة وحدها تدخل المقترح — والفارغة تعني الكلّ', () => {
  const restricted = OPERATING({ allowedSkus: ['B'] });
  const order = buildBranchOrder(restricted, CTX);
  assert.ok(order.lines.every((l) => l.sku === 'B'), 'غير المعتمَد لا يُقترح');
  // وبلا قائمةٍ يدخل الكلّ.
  assert.ok(buildBranchOrder(OPERATING(), CTX).lines.some((l) => l.sku === 'A'));
});

test('يومٌ لا تصله شاحنة يُعلَن — ولا يُمنع الطلب', () => {
  const order = buildBranchOrder(OPERATING({ supplyDays: ['sun'] }), { ...CTX, today: '2026-08-11' }); // ثلاثاء
  assert.equal(order.ok, true, 'يُعلَن ولا يُمنع');
  assert.ok(order.notes.some((n) => n.includes('ليس من أيّام توريد')));
});

test('لا صنفَ تحت نقطة الطلب ⇒ لا طلبَ اليوم، ويُقال ذلك صراحةً', () => {
  const flush = { ...CTX, balances: [{ sku: 'A', warehouse: 'BR01', qty: 99999 }, { sku: 'B', warehouse: 'BR01', qty: 99999 }] };
  const order = buildBranchOrder(OPERATING(), flush);
  assert.equal(order.ok, true);
  assert.deepEqual(order.lines, []);
  assert.ok(order.notes.some((n) => n.includes('لا حاجة لطلبٍ اليوم')));
});

test('★ التحويل إلى طلب نقلٍ قائم — بمركز تكلفة الفرع والمقترح مختومًا', () => {
  const order = buildBranchOrder(OPERATING(), CTX);
  const tr = toTransferRequest(order, { fromWarehouse: 'MAIN', requestDate: '2026-08-11' });
  assert.equal(tr.type, 'TR');
  assert.ok(getSchema('TR'), 'المستند مبنيٌّ لا مخترَع');
  assert.equal(tr.header.toWarehouse, 'BR01');
  assert.equal(tr.header.costCenter, 'BR01'); // الصرف على المستفيد (FNB-103).
  assert.ok(tr.lines.every((l) => l.suggestedQty > 0), 'المقترح مختومٌ على كلّ سطر');
  assert.ok(tr.lines.every((l) => l.notes), 'ومرجعُه معه');
});

test('★ الانحراف يُقاس من المقترح المختوم: ٣٠ مقابل ٢٠ = ‎+٪٥٠', () => {
  const d = lineDeviation({ sku: 'A', suggestedQty: 20, qty: 30 });
  assert.equal(d.delta, 10);
  assert.equal(d.pct, 50);
  // وصنفٌ أُضيف يدويًّا (بلا مقترح) انحرافٌ كامل.
  assert.equal(lineDeviation({ sku: 'X', suggestedQty: 0, qty: 5 }).pct, 100);
  // والمطابق لا انحراف له.
  assert.deepEqual(orderDeviations([{ sku: 'A', suggestedQty: 20, qty: 20 }]), []);
});

test('انحرافات الطلب تُرتَّب بالأشدّ، وتُرشَّح بالعتبة', () => {
  const lines = [
    { sku: 'A', suggestedQty: 20, qty: 30 },  // ‎+٪٥٠
    { sku: 'B', suggestedQty: 100, qty: 105 }, // ‎+٪٥
    { sku: 'C', suggestedQty: 10, qty: 0 },    // ‎−٪١٠٠ (حُذف)
  ];
  const all = orderDeviations(lines);
  assert.equal(all.length, 3);
  assert.equal(all[0].sku, 'C', 'الأشدّ أوّلًا');
  const above = orderDeviations(lines, { thresholdPct: 20 });
  assert.deepEqual(above.map((d) => d.sku), ['C', 'A']);
});

/* ═══════════ ‹FNB-303› الانحراف يُسجَّل بسببه ═══════════ */

test('★ كلّ انحرافٍ يُسأل عن سببه من قائمةٍ مقيَّدة — و«أخرى» تُلزم بنصّ', () => {
  // بلا سببٍ: يُطلب.
  const bare = deviationVerdict({ sku: 'A', suggestedQty: 20, qty: 30 });
  assert.equal(bare.deviated, true);
  assert.equal(bare.requiresReason, true);
  assert.ok(bare.problem, 'الانحراف بلا سببٍ يُعلَن نقصُه');

  // بسببٍ من القائمة: يمرّ.
  const withReason = deviationVerdict({ sku: 'A', suggestedQty: 20, qty: 30, reason: 'campaign' });
  assert.equal(withReason.problem, '');

  // و«أخرى» بلا نصٍّ تُرفض — فلا يُهرَب إليها بلا بيان.
  assert.ok(deviationVerdict({ sku: 'A', suggestedQty: 20, qty: 30, reason: 'other' }).problem);
  assert.equal(deviationVerdict({ sku: 'A', suggestedQty: 20, qty: 30, reason: 'other', reasonNote: 'طلب المالك' }).problem, '');

  // والمطابق لا يُسأل أصلًا.
  const same = deviationVerdict({ sku: 'A', suggestedQty: 20, qty: 20 });
  assert.equal(same.deviated, false);
  assert.equal(same.requiresReason, false);
});

test('أسباب الانحراف من واقع مطعم — والسياسة سببٌ فيها لا يلوم الفرع', () => {
  const reasons = reasonsFor('order_deviation');
  const ids = reasons.map((r) => r.id);
  for (const id of ['campaign', 'event', 'holiday', 'opening', 'substitute', 'forecast_error', 'other']) {
    assert.ok(ids.includes(id), `السبب «${id}» غائب`);
  }
  assert.ok(reasons.every((r) => r.blamesWorker !== true), 'لا سببَ يلوم الفرع — الانحراف تعلُّم');
});

test('★ تجاوزٌ فوق العتبة يفتح استثناءً في السجلّ القائم — لا سجلَّ ثالث', () => {
  assert.ok(EXCEPTION_TYPES.order_deviation, 'النوع في سجلّ الاستثناءات القائم');
  // ٣٠ مقابل ٢٠ = ‎+٪٥٠ ⇒ فوق العتبة.
  const exc = deviationException('BR01', { sku: 'A', suggestedQty: 20, qty: 30, reason: 'campaign' });
  assert.ok(exc);
  assert.equal(exc.type, 'order_deviation');
  assert.equal(exc.location, 'BR01');
  assert.equal(exc.qty, 10);
  assert.match(exc.reason, /طُلب 30 والمقترح 20/);
  assert.match(exc.reason, /السبب: campaign/);
  // ويصبّ في السجلّ بالحقول الثلاثة عشر وإجرائه منه.
  const shaped = shapeException(exc);
  assert.equal(shaped.action, EXCEPTION_TYPES.order_deviation.action);
});

test('تجاوزٌ دون العتبة يُسجَّل ويمرّ صامتًا — التنبيه للاستثناء لا للروتين', () => {
  // ١٠٥ مقابل ١٠٠ = ‎+٪٥ ⇒ دون العتبة.
  assert.equal(deviationException('BR01', { sku: 'B', suggestedQty: 100, qty: 105 }), null);
  assert.equal(deviationVerdict({ sku: 'B', suggestedQty: 100, qty: 105 }).opensException, false);
  assert.equal(DEVIATION_EXCEPTION_PCT, 25);
});

test('★★ الانحراف تعلُّمٌ لا لومٌ فقط: التكرار باتّجاهٍ واحد يقترح ضبط Par Level', () => {
  const history = [
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 30 },
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 28 },
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 32 },
  ];
  const signals = policyReviewSignals(history);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].count, 3);
  assert.ok(signals[0].avgPct > 20);
  assert.match(signals[0].suggestion, /ارفع Par Level/);
  assert.match(signals[0].suggestion, /BR01/);
});

test('والمتذبذب ليس إشارةَ سياسة — مرّةً فوق ومرّةً تحت لا يعني خطأ المقترح', () => {
  const mixed = [
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 30 },
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 10 },
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 31 },
  ];
  assert.deepEqual(policyReviewSignals(mixed), []);
  // ومرّتان لا تكفيان — التكرار ثلاثٌ فأكثر.
  assert.deepEqual(policyReviewSignals([
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 30 },
    { branch: 'BR01', sku: 'A', suggestedQty: 20, qty: 30 },
  ]), []);
  // والنقص المتكرّر يقترح الخفض.
  const down = policyReviewSignals([
    { branch: 'BR02', sku: 'C', suggestedQty: 100, qty: 60 },
    { branch: 'BR02', sku: 'C', suggestedQty: 100, qty: 55 },
    { branch: 'BR02', sku: 'C', suggestedQty: 100, qty: 65 },
  ]);
  assert.match(down[0].suggestion, /اخفض Par Level/);
});
