import test from 'node:test';
import assert from 'node:assert/strict';
import { indexRecipes } from './recipe.js';
import {
  linkedProduction,
  issuedBySku,
  producedBySku,
  producedBatches,
  qcVerdictFor,
  yieldRows,
} from './productionReading.js';

/* ═══ عالمٌ صغير: برجرٌ من خبزةٍ وقطعة لحم ═══ */
const items = new Map([
  ['BURGER', { sku: 'BURGER', nameAr: 'برجر كلاسيك', baseUom: 'piece' }],
  ['BUN', { sku: 'BUN', nameAr: 'خبزة', baseUom: 'piece' }],
  ['PATTY', { sku: 'PATTY', nameAr: 'قطعة لحم', baseUom: 'piece' }],
  ['FRIES', { sku: 'FRIES', nameAr: 'بطاطس', baseUom: 'kg' }],
  ['POTATO', { sku: 'POTATO', nameAr: 'بطاطا خام', baseUom: 'kg' }],
]);
const index = indexRecipes([
  { outputSku: 'BURGER', nameAr: 'برجر', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1, lines: [{ sku: 'BUN', qty: 1, uom: 'piece' }, { sku: 'PATTY', qty: 1, uom: 'piece' }] },
  { outputSku: 'FRIES', nameAr: 'بطاطس', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1, lines: [{ sku: 'POTATO', qty: 2, uom: 'kg' }] },
]);

const order = (over = {}) => ({
  id: 'pro1', type: 'PRO', number: 'PRO-2026-0001',
  header: { productionDate: '2026-08-25', warehouse: 'KITCHEN' },
  lines: [{ sku: 'BURGER', description: 'برجر', qtyPlanned: 100 }],
  ...over,
});
const mis = (over = {}) => ({ id: 'mis1', type: 'MIS', number: 'MIS-2026-0001', header: { productionRef: 'PRO-2026-0001' }, lines: [{ sku: 'BUN', qtyIssued: 100 }, { sku: 'PATTY', qtyIssued: 100 }], ...over });
const prc = (over = {}) => ({ id: 'prc1', type: 'PRC', number: 'PRC-2026-0001', header: { productionRef: 'PRO-2026-0001', warehouse: 'KITCHEN', qcRef: 'QC-9' }, lines: [{ sku: 'BURGER', qtyProduced: 92, batch: 'PB-2026-0001', expiry: '2026-09-01' }], ...over });

/* ═══ ① النسبة بالمرجع لا بالحدس ═══ */

test('المستند يُنسب للأمر برقمه المكتوب', () => {
  const linked = linkedProduction(order(), [mis(), prc()]);
  assert.equal(linked.issues.length, 1);
  assert.equal(linked.receipts.length, 1);
});

test('★ مستندٌ في اليوم نفسه بلا مرجعٍ لا يُنسب — والحدس يخلط دفعتَي مطبخٍ واحد', () => {
  const stray = mis({ id: 'mis2', number: 'MIS-2026-0002', header: {} });
  const linked = linkedProduction(order(), [stray]);
  assert.equal(linked.issues.length, 0);
});

test('الاشتقاق يكفي حين لا رقمَ بعد — المولود من الأمر ينتسب إليه', () => {
  const derived = mis({ id: 'mis3', header: {}, links: { sourceId: 'pro1' } });
  assert.equal(linkedProduction(order(), [derived]).issues.length, 1);
});

test('أمرٌ بلا رقمٍ لا يجرّ كلّ مستندٍ بلا مرجع', () => {
  const draft = order({ number: null });
  const stray = mis({ header: { productionRef: '' } });
  assert.equal(linkedProduction(draft, [stray]).issues.length, 0);
});

/* ═══ التجميع ═══ */

test('المصروف يُجمع بالصنف عبر مستنداتٍ عدّة', () => {
  const map = issuedBySku([mis(), mis({ id: 'mis9', lines: [{ sku: 'BUN', qtyIssued: 20 }] })]);
  assert.equal(map.get('BUN'), 120);
  assert.equal(map.get('PATTY'), 100);
});

test('المنتَج يُجمع بالصنف، والصفرُ لا يُسجَّل صنفًا', () => {
  const map = producedBySku([prc(), prc({ id: 'prc2', lines: [{ sku: 'BURGER', qtyProduced: 0 }] })]);
  assert.equal(map.get('BURGER'), 92);
});

/* ═══ ② الحكم الحاكم: أكثرُ من مخرَجٍ لا يُنسب له متوقَّع ═══ */

test('بمخرَجٍ واحد يُحسب المتوقَّع من الموادّ المصروفة', () => {
  const rows = yieldRows(order(), [mis(), prc()], index, items);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attributable, true);
  assert.equal(rows[0].result.expected, 100); // خبزةٌ وقطعةٌ لكلّ برجر
  assert.equal(rows[0].result.produced, 92);
  assert.equal(rows[0].result.vsExpected, 92);
});

test('★★ أمرٌ بمخرَجَين: المتوقَّع يُسكَت عنه — ولا يُضخَّم بنسبة الصرف كلِّه لكلٍّ منهما', () => {
  const two = order({
    lines: [
      { sku: 'BURGER', qtyPlanned: 100 },
      { sku: 'FRIES', qtyPlanned: 50 },
    ],
  });
  const issue = mis({ lines: [{ sku: 'BUN', qtyIssued: 100 }, { sku: 'PATTY', qtyIssued: 100 }, { sku: 'POTATO', qtyIssued: 100 }] });
  const receipt = prc({ lines: [{ sku: 'BURGER', qtyProduced: 92 }, { sku: 'FRIES', qtyProduced: 48 }] });
  const rows = yieldRows(two, [issue, receipt], index, items);

  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.attributable, false);
    assert.equal(r.result.expected, 0, 'المتوقَّع ساكتٌ لا مخترَع');
    assert.equal(r.result.vsExpected, null);
  }
  // والقياس بالمخطَّط يبقى قائمًا — السكوت عن أحد الرقمين لا يُلغي الآخر.
  assert.equal(rows[0].result.vsPlanned, 92);
  assert.equal(rows[1].result.vsPlanned, 96);
});

test('صرفٌ ناقصٌ يُعلَن سببًا فلا يُحمَّل النقصُ على التحضير', () => {
  const short = mis({ lines: [{ sku: 'BUN', qtyIssued: 80 }, { sku: 'PATTY', qtyIssued: 80 }] });
  const rows = yieldRows(order(), [short, prc({ lines: [{ sku: 'BURGER', qtyProduced: 78 }] })], index, items);
  assert.equal(rows[0].result.expected, 80);
  assert.equal(rows[0].result.shortIssue, true, 'الموادّ أقلّ من الخطّة');
  assert.match(rows[0].result.why, /الصرف/);
});

test('Yield دون العتبة يفتح استثناءً بسببه المكتوب', () => {
  const rows = yieldRows(order(), [mis(), prc({ lines: [{ sku: 'BURGER', qtyProduced: 70 }] })], index, items);
  assert.ok(rows[0].exception, 'استثناءٌ يُفتح عند ٪70');
  assert.equal(rows[0].exception.type, 'low_yield');
  assert.equal(rows[0].exception.location, 'KITCHEN');
});

/* ═══ الدفعات تُقرأ من المستند ═══ */

test('الدفعات تُقرأ من استلام الإنتاج بكمّيّتها وصلاحيّتها ومخزنها', () => {
  const list = producedBatches([prc(), order(), mis()], items);
  assert.equal(list.length, 1);
  assert.deepEqual(
    { sku: list[0].sku, qty: list[0].qty, batch: list[0].batch, expiry: list[0].expiry, warehouse: list[0].warehouse },
    { sku: 'BURGER', qty: 92, batch: 'PB-2026-0001', expiry: '2026-09-01', warehouse: 'KITCHEN' }
  );
  assert.equal(list[0].description, 'برجر كلاسيك');
});

test('بندٌ بلا كمّيّةٍ منتَجة ليس دفعةً — ولا يُعرض للتخصيص', () => {
  assert.equal(producedBatches([prc({ lines: [{ sku: 'BURGER', qtyProduced: 0, batch: 'X' }] })], items).length, 0);
});

test('مفتاح الدفعة يفصل بندَي مستندٍ واحد', () => {
  const list = producedBatches([prc({ lines: [{ sku: 'BURGER', qtyProduced: 10 }, { sku: 'FRIES', qtyProduced: 5 }] })], items);
  assert.equal(new Set(list.map((b) => b.key)).size, 2);
});

/* ═══ ③ الجودة تُبحث ولا تُفترض ═══ */

const qc = (decision, batch = 'PB-2026-0001') => ({ id: 'qc1', type: 'QC', number: 'QC-2026-0007', header: { finalDecision: decision }, lines: [{ batch }] });

test('«قبول» وحدها تُنتج مقبولةً', () => {
  assert.equal(qcVerdictFor('PB-2026-0001', [qc('قبول')]).status, 'passed');
});

test('«رفض» تُنتج مرفوضةً بمرجعها', () => {
  const v = qcVerdictFor('PB-2026-0001', [qc('رفض')]);
  assert.equal(v.status, 'rejected');
  assert.equal(v.number, 'QC-2026-0007');
});

test('★ فحصٌ بلا قرارٍ نهائيّ ليس قبولًا — والضمنيّ يُخرج الدفعة من يد الجودة', () => {
  assert.equal(qcVerdictFor('PB-2026-0001', [qc('')]).status, 'pending');
});

test('★ لا مستندَ يحمل الدفعة ⇒ غيابٌ يُعلَن (null) لا حكمٌ ضمنيّ', () => {
  assert.equal(qcVerdictFor('PB-2026-0099', [qc('قبول')]), null);
  assert.equal(qcVerdictFor('', [qc('قبول')]), null, 'دفعةٌ بلا رقمٍ لا تلتقط حكمَ غيرها');
});

test('المطابقة بالدفعة لا تبالي بحالة الحروف', () => {
  assert.equal(qcVerdictFor('pb-2026-0001', [qc('قبول', 'PB-2026-0001')]).status, 'passed');
});
