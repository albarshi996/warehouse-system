/**
 * اختبارات التقارير الرقابية للمبيعات — تصنيف الطلبات المعلّقة وتجميع العجز.
 * منطق خالص في Node.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingOrders, outOfStockItems, classifyOrder, ORDER_STATUS } from './salesReports.js';

/** أمر بيعٍ مبسَّط. */
function so(id, over = {}) {
  return {
    id, type: 'SO', number: `SO-2026-${id}`, state: 'approved',
    header: { customer: 'عميل', warehouse: 'E5', orderDate: '2026-07-10' },
    lines: [{ sku: 'A', description: 'صنف أ', qty: 10, unitPrice: 5 }],
    soReserved: true, soAllocation: [{ balanceId: 'x', qty: 10 }], soShortfall: [],
    ...over,
  };
}

/* ───────────────── تصنيف الطلب ───────────────── */

test('طلبٌ معتمَد بلا سحب ⇒ يوجد رصيد · لم تتم التعبئة', () => {
  const c = classifyOrder(so('1'), [so('1')]);
  assert.equal(c.status, 'awaiting-pick');
  assert.equal(c.pending, true);
  assert.equal(ORDER_STATUS[c.status].hasStock, true);
});

test('طلبٌ غير معتمَد ⇒ لم يُعتمد بعد', () => {
  const c = classifyOrder(so('2', { state: 'submitted' }), []);
  assert.equal(c.status, 'not-approved');
});

test('طلبٌ معتمَد بلا رصيد محجوز ⇒ لا يوجد رصيد', () => {
  const s = so('3', { soAllocation: [], soShortfall: [{ sku: 'A', shortfall: 10 }] });
  const c = classifyOrder(s, [s]);
  assert.equal(c.status, 'no-stock');
  assert.equal(ORDER_STATUS[c.status].hasStock, false);
});

test('طلبٌ له سحبٌ مشتقّ ⇒ قيد التجهيز', () => {
  const s = so('4');
  const pick = { id: 'p1', type: 'PICK', state: 'draft', links: { SO: { id: '4' } } };
  const c = classifyOrder(s, [s, pick]);
  assert.equal(c.status, 'in-fulfillment');
});

test('طلبٌ له تسليمٌ منجَز ⇒ سُلّم (غير معلّق)', () => {
  const s = so('5');
  const dn = { id: 'd1', type: 'DN', state: 'done', links: { SO: { id: '5' } } };
  const c = classifyOrder(s, [s, dn]);
  assert.equal(c.status, 'delivered');
  assert.equal(c.pending, false);
});

test('طلبٌ موقوفٌ بسببٍ يدويّ ⇒ موقوف', () => {
  const s = so('6', { header: { customer: 'ع', warehouse: 'E5', orderDate: '2026-07-10', holdReason: 'إيقاف من العميل' } });
  const c = classifyOrder(s, [s]);
  assert.equal(c.status, 'on-hold');
  assert.equal(c.holdReason, 'إيقاف من العميل');
});

/* ───────────────── تقرير الطلبات المعلّقة ───────────────── */

test('تقرير الطلبات المعلّقة يصنّف ويعدّ بالرصيد', () => {
  const docs = [
    so('1'), // awaiting-pick (رصيد)
    so('2', { state: 'submitted' }), // not-approved
    so('3', { soAllocation: [], soShortfall: [{ sku: 'A', shortfall: 10 }] }), // no-stock
    so('9'), { id: 'd', type: 'DN', state: 'done', links: { SO: { id: '9' } } }, // 9 مُسلَّم ⇒ لا يظهر
  ];
  const r = pendingOrders(docs);
  assert.equal(r.pending, 3, 'ثلاثة معلّقة (المُسلَّم خرج)');
  assert.equal(r.withStock, 1, 'واحدٌ بيوجد رصيد');
  assert.equal(r.noStock, 1, 'واحدٌ بلا رصيد');
  assert.equal(r.byReason['no-stock'], 1);
  assert.equal(r.rows[0].status, 'no-stock', 'انعدام الرصيد يتصدّر');
});

/* ───────────────── تقرير الأصناف غير المتوفّرة ───────────────── */

test('تقرير الأصناف غير المتوفّرة يجمع العجز والقيمة والمتوسط', () => {
  const docs = [
    so('1', {
      header: { orderDate: '2026-06-05', warehouse: 'E5' },
      lines: [{ sku: 'A', description: 'صنف أ', qty: 10, unitPrice: 5 }],
      soAllocation: [{ qty: 4 }], soShortfall: [{ sku: 'A', nameAr: 'صنف أ', requested: 10, allocated: 4, shortfall: 6 }],
    }),
    so('2', {
      header: { orderDate: '2026-07-08', warehouse: 'E5' },
      lines: [{ sku: 'A', description: 'صنف أ', qty: 8, unitPrice: 5 }],
      soAllocation: [], soShortfall: [{ sku: 'A', nameAr: 'صنف أ', requested: 8, allocated: 0, shortfall: 8 }],
    }),
  ];
  const r = outOfStockItems(docs);
  assert.equal(r.itemCount, 1, 'صنفٌ واحد عاجز');
  const a = r.rows[0];
  assert.equal(a.times, 2, 'طُلب في أمرين بعجز');
  assert.equal(a.shortQty, 14, '6 + 8');
  assert.equal(a.lostValue, 70, '14 × 5');
  assert.equal(a.demand, 18, 'إجمالي الطلب 10 + 8');
  assert.equal(r.monthsSpanned, 2, 'شهران (يونيو ويوليو)');
  assert.equal(a.avgMonthly, 9, '18 ÷ 2');
  assert.equal(a.lastStockout, '2026-07-08', 'آخر نفاد');
});

test('صنفٌ طُلب وتوفّر كاملًا لا يظهر في تقرير العجز', () => {
  const r = outOfStockItems([so('1')]); // بلا عجز
  assert.equal(r.itemCount, 0);
});
