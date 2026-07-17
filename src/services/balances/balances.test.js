/**
 * اختبارات منطق الأرصدة الخالص — المفتاح المركّب وترتيب FEFO والتقييم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { balanceId, fefoSort, expiryStatus, totalQty, stockValue } from './balanceKey.js';

// ── المفتاح المركّب ────────────────────────────────────────────────
test('المعرّف مركّب: صنف × مخزن × تشغيلة — فإعادة الاستيراد تُحدّث لا تُكرّر', () => {
  const a = balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' });
  const b = balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' });
  assert.equal(a, b, 'نفس المدخلات ⇒ نفس المعرّف (تحديث لا تكرار)');
  assert.equal(a, 'WNW-001__E5__LOT-1');
});

test('اختلاف المخزن أو التشغيلة ⇒ رصيد مستقلّ', () => {
  const base = { sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' };
  assert.notEqual(balanceId(base), balanceId({ ...base, warehouse: 'E2' }));
  assert.notEqual(balanceId(base), balanceId({ ...base, batch: 'LOT-2' }));
});

test('الباركود يصلح هوية حين يغيب الكود (حاوية أودو)', () => {
  const id = balanceId({ barcode: '8059692040599', warehouse: 'E5' });
  assert.equal(id, '8059692040599__E5__NOBATCH');
});

test('التشغيلة الفارغة تصير NOBATCH لا «--»', () => {
  assert.ok(balanceId({ sku: 'A', warehouse: 'E5' }).endsWith('__NOBATCH'));
  assert.ok(balanceId({ sku: 'A', warehouse: 'E5', batch: '' }).endsWith('__NOBATCH'));
});

test('بلا مخزن أو بلا هوية ⇒ null (رصيد لا صاحب له)', () => {
  assert.equal(balanceId({ sku: 'A' }), null, 'بلا مخزن');
  assert.equal(balanceId({ warehouse: 'E5' }), null, 'بلا هوية صنف');
});

test('«/» و«.» في التشغيلة لا تكسر معرّف المستند', () => {
  const id = balanceId({ sku: 'A', warehouse: 'E5', batch: 'LOT/2026.11' });
  assert.ok(!id.includes('/') && id.split('__')[2] !== undefined);
});

// ── FEFO ───────────────────────────────────────────────────────────
test('🥉 FEFO: الأقرب انتهاءً أولًا', () => {
  const rows = [
    { batch: 'C', expiry: '2027-06-01' },
    { batch: 'A', expiry: '2026-09-01' },
    { batch: 'B', expiry: '2027-01-01' },
  ];
  assert.deepEqual(fefoSort(rows).map((r) => r.batch), ['A', 'B', 'C']);
});

test('الرصيد بلا صلاحية يُدفع لآخر FEFO (لا نُقدّم مجهولًا)', () => {
  const rows = [
    { batch: 'NoExp', expiry: '' },
    { batch: 'Soon', expiry: '2026-08-01' },
  ];
  assert.deepEqual(fefoSort(rows).map((r) => r.batch), ['Soon', 'NoExp']);
});

test('fefoSort لا يعدّل الأصل', () => {
  const rows = [{ expiry: '2027-01-01' }, { expiry: '2026-01-01' }];
  const copy = [...rows];
  fefoSort(rows);
  assert.deepEqual(rows, copy);
});

// ── حالة الصلاحية ──────────────────────────────────────────────────
test('حالة الصلاحية: منتهٍ · قريب · سليم · غير محدَّد', () => {
  const now = Date.parse('2026-07-17');
  assert.equal(expiryStatus('2026-07-01', now), 'expired');
  assert.equal(expiryStatus('2026-08-01', now), 'near'); // خلال 30 يومًا
  assert.equal(expiryStatus('2027-01-01', now), 'ok');
  assert.equal(expiryStatus('', now), 'unknown');
  assert.equal(expiryStatus('نص غير تاريخ', now), 'unknown');
});

// ── التقييم (أساس S12) ─────────────────────────────────────────────
test('إجمالي الكمية عبر التشغيلات', () => {
  assert.equal(totalQty([{ qty: 10 }, { qty: 5 }, { qty: '3' }]), 18);
  assert.equal(totalQty([]), 0);
});

test('قيمة المخزون = Σ(كمية × تكلفة التشغيلة)', () => {
  const rows = [
    { qty: 10, unitCost: 12.5 },
    { qty: 4, unitCost: 20 },
  ];
  assert.equal(stockValue(rows), 205); // 125 + 80
});

test('التكلفة الغائبة لا تُفسد القيمة (تُحسب صفرًا)', () => {
  assert.equal(stockValue([{ qty: 10 }, { qty: 5, unitCost: 2 }]), 10);
});
