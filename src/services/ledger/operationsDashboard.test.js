/**
 * اختبارات عقل لوحة القيادة — المؤشرات واللقطة والاستثناءات. منطق خالص.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeKpis, operationsSnapshot, operationExceptions } from './operationsDashboard.js';

const NOW = Date.parse('2026-07-27T00:00:00Z');
const ms = (iso) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

/* ───────────────── المؤشرات ───────────────── */

test('نسبة التنفيذ = المخصَّص ÷ المطلوب', () => {
  const docs = [
    { id: '1', type: 'SO', state: 'approved', soReserved: true, lines: [{ qty: 10 }], soAllocation: [{ qty: 6 }] },
    { id: '2', type: 'SO', state: 'approved', soReserved: true, lines: [{ qty: 10 }], soAllocation: [{ qty: 10 }] },
  ];
  const k = computeKpis(docs);
  assert.equal(k.fillRate, 0.8, '16 من 20');
  assert.equal(k.basis.requested, 20);
});

test('زمن دورة الطلب = متوسط الأيام من الأمر للتسليم', () => {
  const docs = [
    { id: 's1', type: 'SO', state: 'done', createdAt: ms('2026-07-10T00:00:00Z') },
    { id: 'd1', type: 'DN', state: 'done', links: { SO: { id: 's1' } }, postedAt: ms('2026-07-14T00:00:00Z') },
  ];
  const k = computeKpis(docs);
  assert.equal(k.cycleTimeDays, 4, 'أربعة أيام');
});

test('دقّة المخزون من محاضر الجرد المصادَقة', () => {
  const docs = [
    { id: 'c1', type: 'CC', state: 'done', lines: [{ bookQty: 100, count2: 98 }, { bookQty: 100, count2: 100 }] },
  ];
  const k = computeKpis(docs);
  // فرقٌ مطلق 2 من دفتريّ 200 ⇒ 99%
  assert.equal(k.inventoryAccuracy, 0.99);
});

test('دقّة التسليم = المستلَم ÷ المشحون عبر استلامات النقل', () => {
  const docs = [
    { id: 't1', type: 'TRC', state: 'done', lines: [{ qtyShipped: 50, qtyReceived: 48 }] },
  ];
  const k = computeKpis(docs);
  assert.equal(k.deliveryAccuracy, 0.96);
});

test('المؤشرات بلا بيانات ⇒ null لا صفرٌ مزيّف', () => {
  const k = computeKpis([]);
  assert.equal(k.fillRate, null);
  assert.equal(k.cycleTimeDays, null);
  assert.equal(k.inventoryAccuracy, null);
  assert.equal(k.deliveryAccuracy, null);
});

/* ───────────────── اللقطة ───────────────── */

test('اللقطة تعدّ المفتوح وتحسب تحت الحدّ الأدنى', () => {
  const docs = [
    { id: 'so1', type: 'SO', state: 'approved', soReserved: true, lines: [{ sku: 'A', qty: 5 }], soAllocation: [{ qty: 5 }] },
    { id: 'pk1', type: 'PICK', state: 'approved' },
    { id: 'pk2', type: 'PICK', state: 'done' }, // مُنجَز ⇒ ليس مفتوحًا
  ];
  const balances = [{ sku: 'A', warehouse: 'E5', qty: 2, qtyReserved: 0 }];
  const items = [{ sku: 'A', minStock: 10 }];
  const snap = operationsSnapshot(docs, balances, items);
  assert.equal(snap.warehouse.picking, 1, 'قائمة سحبٍ واحدة مفتوحة');
  assert.equal(snap.inventory.belowMin, 1, 'المتاح 2 < الحدّ 10');
  assert.equal(snap.sales.orders, 1);
});

/* ───────────────── الاستثناءات ───────────────── */

test('الاستثناءات تكشف الاعتماد المتأخّر وترتّب بالخطورة', () => {
  const docs = [
    { id: 'a1', type: 'GRN', number: 'GRN-1', state: 'submitted', updatedAt: ms('2026-07-20T00:00:00Z') }, // 7 أيام > مهلة يومين
  ];
  const ex = operationExceptions(docs, [], NOW, []);
  assert.ok(ex.some((e) => e.category === 'approval'), 'اعتمادٌ متأخّر يُكشف');
  assert.equal(ex[0].severity, 'high');
});

test('استثناء الرصيد المنتهي على رصيدٍ موجب', () => {
  const balances = [{ sku: 'A', warehouse: 'E5', qty: 5, expiry: '2026-07-01' }];
  const ex = operationExceptions([], balances, NOW, []);
  assert.ok(ex.some((e) => e.category === 'inventory' && e.title.includes('منتهي')), 'المنتهي يُكشف');
});

test('لا استثناءات من لا شيء', () => {
  assert.equal(operationExceptions([], [], NOW, []).length, 0);
});
