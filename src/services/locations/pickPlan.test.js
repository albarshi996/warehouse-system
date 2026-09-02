/**
 * اختبارات السحب الموجّه — «أين أجده»، وFEFO بالموقع، وحدود الحارس المانع.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fefoLocationViolations,
  pickPathOrder,
  pickPlan,
  pickPostingProblems,
  planLine,
  sellableStock,
} from './pickPlan.js';

const NOW = Date.parse('2026-08-16');
const bal = (over = {}) => ({
  id: `X__E5__${over.batch || 'B1'}`,
  sku: 'A', barcode: '629', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30', qty: 50, qtyReserved: 0, bin: 'E5-A01-R01',
  ...over,
});
const LINE = { sku: 'A', barcode: '629', description: 'زيت', qtyRequested: 30 };

test('★★ الخطّة تجيب سؤال العامل: أين أجده وكم آخذ من كلّ رفّ', () => {
  const r = planLine({
    line: LINE,
    warehouse: 'E5',
    balances: [
      bal({ batch: 'B2', expiry: '2027-11-30', qty: 40, bin: 'E5-A02-R09' }),
      bal({ batch: 'B1', expiry: '2027-06-30', qty: 20, bin: 'E5-A01-R01' }),
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.allocated, 30);
  assert.deepEqual(
    r.picks.map((p) => [p.bin, p.qty, p.expiry]),
    [['E5-A01-R01', 20, '2027-06-30'], ['E5-A02-R09', 10, '2027-11-30']],
    'الأقرب صلاحيةً أوّلًا، ثمّ التالي — بمواقعهما'
  );
  assert.equal(r.picks[0].shortLabel, 'E5-A01-R01', 'ويُعرض للعامل الكودُ كاملًا كما على الملصق');
});

test('★★ FEFO يختار أقرب صلاحيةٍ صحيحة', () => {
  const r = planLine({
    line: { ...LINE, qtyRequested: 10 },
    warehouse: 'E5',
    balances: [bal({ batch: 'LATE', expiry: '2028-01-01' }), bal({ batch: 'EARLY', expiry: '2026-12-01' })],
  });
  assert.equal(r.picks[0].batch, 'EARLY');
});

test('🔒 ★★ المنتهية لا تُخصَّص للصرف العاديّ', () => {
  const stock = [bal({ batch: 'DEAD', expiry: '2026-01-01', qty: 999 }), bal({ batch: 'GOOD', expiry: '2027-06-30', qty: 40 })];
  assert.equal(sellableStock(stock, NOW).length, 1, 'المنتهية تُستبعد من المتاح');
  const r = planLine({ line: LINE, warehouse: 'E5', balances: stock, nowMs: NOW });
  assert.deepEqual(r.picks.map((p) => p.batch), ['GOOD']);
});

test('★★ بلا تاريخٍ مُمرَّر لا استبعاد — من لم يُمرّر تاريخًا لا يريد الحكم', () => {
  const stock = [bal({ batch: 'DEAD', expiry: '2026-01-01' })];
  assert.equal(sellableStock(stock, null).length, 1);
});

test('النقص يُعلَن بالرقم لا يُبتلع', () => {
  const r = planLine({ line: LINE, warehouse: 'E5', balances: [bal({ qty: 12 })] });
  assert.equal(r.ok, false);
  assert.equal(r.allocated, 12);
  assert.equal(r.shortfall, 18);
  assert.match(r.problem, /أقلّ من المطلوب بـ18/);
});

test('★★ التصفية بالمستودع: رصيدُ مخزنٍ آخر لا يُقترح — العامل لا يصله', () => {
  const r = planLine({ line: LINE, warehouse: 'E5', balances: [bal({ warehouse: 'E2', qty: 999 })] });
  assert.equal(r.allocated, 0);
  assert.equal(r.shortfall, 30);
});

test('المحجوز لا يُخصَّص مرّتين', () => {
  const r = planLine({ line: LINE, warehouse: 'E5', balances: [bal({ qty: 50, qtyReserved: 45 })] });
  assert.equal(r.allocated, 5, 'المتاح = الموجود ناقص المحجوز');
});

test('★★ مسار السحب مرتَّبٌ بالموقع — العامل يمشي الممرّ مرّةً لا مرّتين', () => {
  const doc = {
    header: { warehouse: 'E5' },
    lines: [
      { sku: 'A', barcode: '629', qtyRequested: 10 },
      { sku: 'B', barcode: '777', qtyRequested: 10 },
    ],
  };
  const plan = pickPlan(doc, [
    bal({ sku: 'A', barcode: '629', bin: 'E5-C09-R01', qty: 10, batch: 'B1' }),
    bal({ sku: 'B', barcode: '777', bin: 'E5-A01-R01', qty: 10, batch: 'B2', id: 'B__E5__B2' }),
  ]);
  assert.deepEqual(plan.path.map((s) => s.bin), ['E5-A01-R01', 'E5-C09-R01'], 'الترتيب بالكود الهرميّ لا بترتيب البنود');
  assert.equal(plan.ok, true);
});

test('النواقص تُجمع في الخطّة', () => {
  const doc = { header: { warehouse: 'E5' }, lines: [{ sku: 'A', barcode: '629', qtyRequested: 100 }] };
  const plan = pickPlan(doc, [bal({ qty: 10 })]);
  assert.equal(plan.ok, false);
  assert.equal(plan.shortages.length, 1);
  assert.equal(plan.shortages[0].shortfall, 90);
});

// ── المخالفات والحارس المانع ───────────────────────────────────────
const pickedDoc = (over = {}) => ({
  header: { warehouse: 'E5', ...over.header },
  lines: [{ sku: 'A', barcode: '629', description: 'زيت', qtyPicked: 5, expiry: '2027-11-30', batch: 'LATE', bin: 'E5-A02-R09' }],
});

test('★★ المخالفة تقول **أين الأقدم** لا «خالفتَ» فقط', () => {
  const v = fefoLocationViolations(pickedDoc(), [
    bal({ batch: 'EARLY', expiry: '2027-06-30', qty: 40, bin: 'E5-A01-R01' }),
    bal({ batch: 'LATE', expiry: '2027-11-30', qty: 10, bin: 'E5-A02-R09' }),
  ]);
  assert.equal(v.length, 1);
  assert.equal(v[0].earliestBin, 'E5-A01-R01');
  assert.match(v[0].message, /الرفّ E5-A01-R01/, 'الرسالةُ تدلّ على الرفّ بكوده كاملًا');
  assert.match(v[0].message, /اسحب منها أوّلًا/);
});

test('🔒 ★★ التصفية بالمستودع تمنع **مخالفةً كاذبة** عبر مخزنين', () => {
  // تشغيلةٌ أقدم في مخزنٍ آخر لا يستطيع العامل الوصول إليها أصلًا.
  const v = fefoLocationViolations(pickedDoc(), [bal({ warehouse: 'E2', batch: 'EARLY', expiry: '2026-12-01' })]);
  assert.deepEqual(v, [], 'لا مخالفة — الأقدم خارج مستودعه');
});

test('★★ حدود الحارس: بندٌ بلا صلاحية أو مخزونٌ بلا صلاحية ⇒ يمرّ', () => {
  const noLineExpiry = { header: { warehouse: 'E5' }, lines: [{ sku: 'A', qtyPicked: 5, expiry: '' }] };
  assert.deepEqual(fefoLocationViolations(noLineExpiry, [bal({ expiry: '2026-12-01' })]), []);

  const noStockExpiry = fefoLocationViolations(pickedDoc(), [bal({ expiry: '', batch: 'X' })]);
  assert.deepEqual(noStockExpiry, [], 'بلا صلاحيةٍ في المخزون لا معيار للمقارنة');
});

test('★★ بلا أرصدةٍ محمَّلة يمرّ — لا نمنع لأنّنا لا نعرف', () => {
  assert.deepEqual(fefoLocationViolations(pickedDoc(), []), []);
  assert.deepEqual(pickPostingProblems(pickedDoc(), []).problems, []);
});

test('🔒 ★★ الحارس صار **مانعًا** بعد أن كان تحذيرًا', () => {
  const r = pickPostingProblems(pickedDoc(), [
    bal({ batch: 'EARLY', expiry: '2027-06-30', qty: 40, bin: 'E5-A01-R01' }),
  ]);
  assert.equal(r.problems.length > 0, true, 'يمنع الإنجاز');
  assert.equal(r.warnings.length, 0);
  assert.match(r.problems.join(' '), /اكتب سبب المخالفة/, 'ويقول كيف يُتجاوَز');
});

test('★★ سببٌ مكتوب يحوّل المنع إلى تحذيرٍ مقيَّد — نفس عقد التجاوز المعتمَد', () => {
  const doc = pickedDoc({ header: { fefoOverrideReason: 'العميل طلب هذه الدفعة بعينها' } });
  const r = pickPostingProblems(doc, [bal({ batch: 'EARLY', expiry: '2027-06-30', qty: 40, bin: 'E5-A01-R01' })]);
  assert.deepEqual(r.problems, [], 'لا يوقف العمل');
  assert.ok(r.warnings.length >= 2);
  assert.match(r.warnings.join(' '), /أُجيزت المخالفة بسبب: العميل طلب/);
  assert.equal(r.violations.length, 1, 'والمخالفة تبقى مسجَّلة لا تُمحى');
});

test('السحب المطابق لا يُنتج مخالفةً ولا يمنع', () => {
  const doc = { header: { warehouse: 'E5' }, lines: [{ sku: 'A', qtyPicked: 5, expiry: '2027-06-30', bin: 'E5-A01-R01' }] };
  const r = pickPostingProblems(doc, [bal({ batch: 'EARLY', expiry: '2027-06-30', qty: 40 })]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.violations, []);
});

test('بندٌ لم يُسحب منه شيء لا يُفحص', () => {
  const doc = { header: { warehouse: 'E5' }, lines: [{ sku: 'A', qtyPicked: 0, expiry: '2027-11-30' }] };
  assert.deepEqual(fefoLocationViolations(doc, [bal({ expiry: '2026-12-01' })]), []);
});

test('مسار السحب الفارغ لا ينهار', () => {
  assert.deepEqual(pickPathOrder(null), []);
  assert.deepEqual(pickPathOrder([{ picks: [] }]), []);
});
