import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vanSettlement,
  settlementVerdict,
  classifyVanMove,
  settlementKey,
  vanRemaining,
  VAN_FLOWS,
} from './settlement.js';

const VAN = 'VAN:12-3456';
const move = (over = {}) => ({
  sku: 'SKU1',
  barcode: '',
  nameAr: 'صنف',
  batch: 'B1',
  expiry: '2027-01-01',
  from: 'MAIN',
  to: VAN,
  qty: 10,
  reason: 'van-load',
  ...over,
});

test('مفتاح السطر: الكود أولًا فالباركود، والتشغيلة جزءٌ منه', () => {
  assert.equal(settlementKey({ sku: 'a1', batch: 'b1' }), 'A1__B1');
  assert.equal(settlementKey({ barcode: '600', batch: '' }), '600__');
  assert.equal(settlementKey({}), '');
});

test('التبويب بالاتّجاه: ما دخل المركبة زيادةٌ وما خرج نقصان', () => {
  assert.deepEqual(classifyVanMove(move(), VAN), { flow: 'load', dir: 'in', qty: 10 });
  assert.deepEqual(
    classifyVanMove(move({ from: VAN, to: null, reason: 'van-sale' }), VAN),
    { flow: 'sale', dir: 'out', qty: 10 }
  );
});

test('حركةٌ لا تمسّ المركبة تُهمَل', () => {
  assert.equal(classifyVanMove(move({ from: 'MAIN', to: 'STAGING' }), VAN), null);
});

test('مستندا DN وPOD القائمان يدخلان التسوية بلا تعديل', () => {
  assert.equal(classifyVanMove(move({ reason: 'load-van' }), VAN).flow, 'load');
  assert.equal(classifyVanMove(move({ from: VAN, to: null, reason: 'delivery' }), VAN).flow, 'sale');
});

test('سببٌ مجهول يُحسب في الميزان ولا يُهمَل', () => {
  const c = classifyVanMove(move({ reason: 'سبب-لم-يوجد-بعد' }), VAN);
  assert.equal(c.flow, 'otherIn');
  assert.equal(c.dir, 'in');
  assert.equal(VAN_FLOWS.otherIn.dir, 'in');
});

test('سببٌ اسمُه يخالف اتّجاهه: الاتّجاه هو الحكم لا الاسم', () => {
  // «van-sale» صادرٌ بطبعه، لكنّ هذه الحركة داخلةٌ إلى المركبة.
  const c = classifyVanMove(move({ to: VAN, from: 'MAIN', reason: 'van-sale' }), VAN);
  assert.equal(c.dir, 'in');
  assert.equal(c.flow, 'otherIn');
});

test('المعادلة: بداية + تحميل + مرتجع − مبيعات − إرجاع = المتوقّع', () => {
  const s = vanSettlement({
    plate: '12-3456',
    opening: [{ sku: 'SKU1', batch: 'B1', qty: 5 }],
    moves: [
      move({ qty: 100, reason: 'van-load' }),
      move({ from: VAN, to: null, qty: 60, reason: 'van-sale' }),
      move({ from: null, to: VAN, qty: 4, reason: 'van-return-in' }),
      move({ from: VAN, to: 'MAIN', qty: 49, reason: 'van-return-out' }),
    ],
  });
  const row = s.rows[0];
  assert.equal(row.opening, 5);
  assert.equal(row.load, 100);
  assert.equal(row.returnIn, 4);
  assert.equal(row.sale, 60);
  assert.equal(row.returnOut, 49);
  assert.equal(row.expected, 0); // 5 + 100 + 4 − 60 − 49
});

test('الانحراف يكشف حركةً خارج نافذة الرحلة', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 })],
    balances: [{ sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 7 }],
  });
  assert.equal(s.rows[0].expected, 10);
  assert.equal(s.rows[0].ledgerQty, 7);
  assert.equal(s.rows[0].drift, -3);
  assert.equal(s.hasDrift, true);
});

test('الفرق المعدود غير الانحراف: دفترٌ ↔ يدٌ لا متوقّعٌ ↔ دفتر', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 })],
    balances: [{ sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 10 }],
    counted: [{ sku: 'SKU1', batch: 'B1', qty: 8 }],
  });
  assert.equal(s.rows[0].drift, 0);
  assert.equal(s.rows[0].variance, -2);
  assert.equal(s.hasVariance, true);
  assert.equal(s.hasDrift, false);
});

test('أرصدة مركبةٍ أخرى لا تدخل تسوية هذه', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 })],
    balances: [
      { sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 10 },
      { sku: 'SKU1', batch: 'B1', warehouse: 'VAN:99-9999', qty: 500 },
    ],
  });
  assert.equal(s.totals.ledgerQty, 10);
});

test('التشغيلتان صفّان مستقلّان — لا تُجمعان', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ batch: 'B1', qty: 10 }), move({ batch: 'B2', qty: 4 })],
  });
  assert.equal(s.rows.length, 2);
  assert.equal(s.totals.load, 14);
});

test('الحارس يمنع إقفال رحلةٍ ومركبتُها تحمل رصيدًا', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 })],
    balances: [{ sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 10 }],
  });
  const v = settlementVerdict({ settlement: s });
  assert.equal(v.ok, false);
  assert.match(v.blockers[0], /تحمل/);
});

test('الحارس يأذن بالإقفال حين تصفّر المركبة', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 }), move({ from: VAN, to: 'MAIN', qty: 10, reason: 'van-return-out' })],
    balances: [{ sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 0 }],
  });
  assert.equal(s.isClear, true);
  assert.equal(settlementVerdict({ settlement: s }).ok, true);
});

test('الفرق المعدود يمنع الإقفال حتى يعتمده المشرف — ولا يُمنع تسجيله', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 }), move({ from: VAN, to: 'MAIN', qty: 10, reason: 'van-return-out' })],
    balances: [{ sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 0 }],
    counted: [{ sku: 'SKU1', batch: 'B1', qty: 2 }],
  });
  assert.equal(settlementVerdict({ settlement: s }).ok, false);
  assert.equal(settlementVerdict({ settlement: s, supervisorApproved: true }).ok, true);
});

test('الانحراف تحذيرٌ لا مانع — يُراجَع ولا يُجمَّد', () => {
  const s = vanSettlement({
    plate: '12-3456',
    moves: [move({ qty: 10 }), move({ from: VAN, to: 'MAIN', qty: 8, reason: 'van-return-out' })],
    balances: [{ sku: 'SKU1', batch: 'B1', warehouse: VAN, qty: 0 }],
  });
  const v = settlementVerdict({ settlement: s });
  assert.equal(v.ok, true);
  assert.equal(v.warnings.length, 1);
});

test('لا تسوية محسوبة = لا إقفال', () => {
  assert.equal(settlementVerdict({}).ok, false);
});

test('المتبقّي على المركبة يُقرأ من الأرصدة وحدها', () => {
  const rows = vanRemaining(
    [
      { sku: 'A', warehouse: VAN, qty: 3 },
      { sku: 'B', warehouse: VAN, qty: 0 },
      { sku: 'C', warehouse: 'MAIN', qty: 9 },
    ],
    '12-3456'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, 'A');
});
