import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logisticsSummary } from './logisticsModel.js';

/* بيانات عيّنة صغيرة قابلة للتنبّؤ */
const items = [
  { sku: 'A', nameAr: 'صنف أ', category: 'تغليف', balance: 5, minStock: 10, unitPrice: 100 }, // إعادة طلب (نقص 5) · قيمة 500
  { sku: 'B', nameAr: 'صنف ب', category: 'تغليف', balance: 20, minStock: 5, unitPrice: 50 }, // سليم · قيمة 1000
  { sku: 'C', nameAr: 'صنف ج', category: 'خام', balance: 0, minStock: 3, unitPrice: 0 }, // إعادة طلب · بلا سعر
];
const operations = [
  { id: 'o1', status: 'open', createdAt: { seconds: 1000 }, itemCount: 10, scannedCount: 4 },
  { id: 'o2', status: 'open', createdAt: { seconds: 900 }, itemCount: 5, scannedCount: 5 },
  { id: 'o3', status: 'closed', createdAt: { seconds: 800 }, itemCount: 8, scannedCount: 8 },
];
const suppliers = [{ code: 'S1' }, { code: 'S2' }];
const customers = [{ code: 'C1' }, { code: 'C2' }, { code: 'C3' }];
const trips = [{ id: 't1' }];
const workOrders = [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }];
const custodies = [];

const NOW = 1_700_000_000_000;

test('المؤشّرات: قيمة المخزون وعدد الأصناف وغير المسعّر', () => {
  const s = logisticsSummary({ items, operations, suppliers, customers, trips, workOrders, custodies }, NOW);
  assert.equal(s.kpis.totalValue, 1500); // 500 + 1000 + 0
  assert.equal(s.kpis.itemsTotal, 3);
  assert.equal(s.kpis.itemsUnpriced, 1); // C بلا سعر
});

test('إعادة الطلب: تُحصى الأصناف تحت الحدّ (A و C)', () => {
  const s = logisticsSummary({ items }, NOW);
  assert.equal(s.kpis.reorderCount, 2);
  assert.equal(s.reorderTop.length, 2);
  assert.ok(s.reorderTop.every((r) => r.balance <= r.minStock));
});

test('العمليات: المفتوحة تُحصى بحالتها والإجماليّ يشمل المقفلة', () => {
  const s = logisticsSummary({ operations }, NOW);
  assert.equal(s.kpis.openOperations, 2);
  assert.equal(s.kpis.operationsTotal, 3);
  assert.equal(s.recentOperations.length, 3); // top=8، متاح 3
});

test('العدّاد: الشركاء والسلاسل = أطوال المصفوفات', () => {
  const s = logisticsSummary({ suppliers, customers, trips, workOrders, custodies }, NOW);
  assert.equal(s.kpis.suppliersCount, 2);
  assert.equal(s.kpis.customersCount, 3);
  assert.equal(s.kpis.tripsTotal, 1);
  assert.equal(s.kpis.workOrdersTotal, 4);
  assert.equal(s.kpis.custodiesTotal, 0);
});

test('القصّ إلى top: أكثر من 8 أصناف نقص → القائمة 8 فقط', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    sku: `X${i}`, nameAr: `صنف ${i}`, balance: 0, minStock: 10, unitPrice: 10 + i,
  }));
  const s = logisticsSummary({ items: many }, NOW);
  assert.equal(s.kpis.reorderCount, 12);
  assert.equal(s.reorderTop.length, 8); // مقصوصة
});

test('الفئات: مصفوفة تقييمٍ بالفئة موجودة', () => {
  const s = logisticsSummary({ items }, NOW);
  assert.ok(Array.isArray(s.categories));
  assert.ok(s.categories.length >= 1);
  assert.ok(s.categories[0].value >= s.categories[s.categories.length - 1].value); // تنازليّ
});

test('حصانة الفراغ: بيانات فارغة → أصفار بلا استثناء', () => {
  const s = logisticsSummary({}, 0);
  assert.equal(s.kpis.totalValue, 0);
  assert.equal(s.kpis.itemsTotal, 0);
  assert.equal(s.kpis.reorderCount, 0);
  assert.equal(s.kpis.openOperations, 0);
  assert.equal(s.kpis.stagnantShare, null); // لا مخزون → النسبة غير معرّفة
  assert.deepEqual(s.reorderTop, []);
  assert.deepEqual(s.recentMoves, []);
});

test('حصانة المدخلات غير المصفوفيّة: لا تنكسر', () => {
  const s = logisticsSummary({ items: null, operations: undefined, suppliers: 'x' }, NOW);
  assert.equal(s.kpis.itemsTotal, 0);
  assert.equal(s.kpis.suppliersCount, 0);
});
