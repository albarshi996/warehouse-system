/**
 * ‹EXP-INV› تقريرُ المصروفات بالفاتورة — منطقٌ خالص.
 * البيّنةُ تبدأ بالنقض: المصروفُ غيرُ المنجَز وغيرُ EXP لا يدخل، والمحلُّ يعزل.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseReport, expenseReportAoa } from './expenseReport.js';

const exp = (over = {}) => ({
  id: over.id || 'd1',
  type: 'EXP',
  state: 'done',
  number: over.number || 'BFP-EXP-0001',
  shop: 'shopA',
  header: {
    expenseDate: '2026-11-05',
    invoiceNo: 'INV-1',
    category: 'إيجار',
    beneficiary: 'مالك العقار',
    paymentMethod: 'نقدًا',
    amount: 100,
    note: 'إيجار نوفمبر',
    ...over.header,
  },
  ...('shop' in over ? { shop: over.shop } : {}),
  ...(over.state ? { state: over.state } : {}),
});

test('‹EXP-INV› يُدرج EXP المنجَز فقط، ويحسب الإجماليّ والتجميع بالفئة', () => {
  const docs = [
    exp({ id: 'a', header: { amount: 100, category: 'إيجار' } }),
    exp({ id: 'b', number: 'BFP-EXP-0002', header: { amount: 50, category: 'نظافة', invoiceNo: 'INV-2' } }),
    exp({ id: 'c', number: 'BFP-EXP-0003', header: { amount: 25, category: 'إيجار', invoiceNo: 'INV-3' } }),
  ];
  const r = expenseReport(docs, { shop: 'shopA' });
  assert.equal(r.count, 3);
  assert.equal(r.grandTotal, 175);
  // التجميعُ بالفئة مرتّبٌ تنازليًّا: إيجار 125 (مستندان) ثمّ نظافة 50.
  assert.equal(r.byCategory[0].key, 'rent');
  assert.equal(r.byCategory[0].total, 125);
  assert.equal(r.byCategory[0].count, 2);
  assert.equal(r.byCategory[1].key, 'cleaning');
  assert.equal(r.byCategory[1].total, 50);
});

test('‹EXP-INV› غيرُ المنجَز وغيرُ EXP والمغلقُ لا تدخل التقرير', () => {
  const docs = [
    exp({ id: 'ok' }),
    exp({ id: 'draft', state: 'submitted', header: { amount: 999 } }),
    // «مغلق» مبهمةٌ (قد يكون approved→closed لم يُقيَّد) — لا تُحتسب افتراضًا.
    exp({ id: 'closed', state: 'closed', header: { amount: 777 } }),
    { id: 'sal', type: 'SAL', state: 'done', header: { amount: 500, payDate: '2026-11-01' } },
  ];
  const r = expenseReport(docs, { shop: 'shopA' });
  assert.equal(r.count, 1);
  assert.equal(r.grandTotal, 100);
});

test('‹EXP-INV› المحلُّ يعزل: مصروفُ محلٍّ آخر لا يظهر', () => {
  const docs = [exp({ id: 'a' }), { ...exp({ id: 'b', header: { amount: 70 } }), shop: 'shopB' }];
  assert.equal(expenseReport(docs, { shop: 'shopA' }).grandTotal, 100);
  assert.equal(expenseReport(docs, { shop: 'shopB' }).grandTotal, 70);
  // بلا محلٍّ = كلُّ المحلّات.
  assert.equal(expenseReport(docs, {}).grandTotal, 170);
});

test('‹EXP-INV› المدى والفئة يُرشّحان', () => {
  const docs = [
    exp({ id: 'old', header: { amount: 10, expenseDate: '2026-10-01', category: 'إيجار' } }),
    exp({ id: 'mid', header: { amount: 20, expenseDate: '2026-11-05', category: 'نظافة', invoiceNo: 'x' } }),
    exp({ id: 'new', header: { amount: 30, expenseDate: '2026-11-20', category: 'إيجار', invoiceNo: 'y' } }),
  ];
  assert.equal(expenseReport(docs, { from: '2026-11-01', to: '2026-11-10' }).grandTotal, 20);
  assert.equal(expenseReport(docs, { category: 'rent' }).grandTotal, 40);
  assert.equal(expenseReport(docs, { category: 'rent', from: '2026-11-01' }).grandTotal, 30);
});

test('‹EXP-INV› الأحدثُ أوّلًا في الأسطر', () => {
  const docs = [
    exp({ id: 'a', header: { expenseDate: '2026-11-01', invoiceNo: 'A' } }),
    exp({ id: 'b', header: { expenseDate: '2026-11-09', invoiceNo: 'B' } }),
  ];
  const r = expenseReport(docs, { shop: 'shopA' });
  assert.equal(r.lines[0].invoiceNo, 'B');
  assert.equal(r.lines[1].invoiceNo, 'A');
});

test('‹EXP-INV› صفوفُ إكسل: عناوين + صفوف + ذيلُ إجماليّ', () => {
  const r = expenseReport([exp()], { shop: 'shopA' });
  const aoa = expenseReportAoa(r);
  assert.equal(aoa[0][0], 'التاريخ');
  assert.equal(aoa.length, 3); // عنوان + سطر + ذيل
  assert.equal(aoa[1][1], 'INV-1'); // رقم الفاتورة
  assert.equal(aoa[2][0], 'الإجمالي');
  assert.equal(aoa[2][5], 100); // الإجماليّ في عمود المبلغ
});

test('‹EXP-INV› تقريرٌ فارغٌ لا يسقط', () => {
  const r = expenseReport([], {});
  assert.deepEqual(r, { lines: [], byCategory: [], grandTotal: 0, count: 0 });
  assert.equal(expenseReportAoa(r).length, 2); // عنوان + ذيل
});
