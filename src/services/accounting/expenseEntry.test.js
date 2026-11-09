/**
 * ‹EXP-INV› الإدخالُ السريع للمصروف — المنطقُ الخالص (تحقّق · صياغةُ رأس · أدوار).
 * `recordExpense` غلافٌ على بابِ المستندات فلا يُختبر هنا (يُغطّيه مسارُ المستندات).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expenseEntryProblems,
  shapeExpenseHeader,
  canRecordExpense,
  EXPENSE_RECORD_ROLES,
  EXPENSE_METHODS,
} from './expenseEntry.js';

const ok = {
  expenseDate: '2026-11-09',
  invoiceNo: 'INV-77',
  category: 'إيجار',
  beneficiary: 'مالك العقار',
  paymentMethod: 'نقدًا',
  amount: 150,
  note: '',
};

test('‹EXP-INV› المدخلُ الصحيحُ بلا مشكلات', () => {
  assert.deepEqual(expenseEntryProblems(ok), []);
});

test('‹EXP-INV› رقمُ الفاتورة إلزاميّ (النظامُ وفق الفاتورة)', () => {
  assert.ok(expenseEntryProblems({ ...ok, invoiceNo: '  ' }).some((p) => /الفاتورة/.test(p)));
});

test('‹EXP-INV› الفئةُ والمبلغُ والطريقةُ والتاريخُ تُفحص', () => {
  assert.ok(expenseEntryProblems({ ...ok, category: '' }).some((p) => /الفئة/.test(p)));
  assert.ok(expenseEntryProblems({ ...ok, category: '  ' }).some((p) => /الفئة/.test(p)));
  assert.ok(expenseEntryProblems({ ...ok, amount: 0 }).some((p) => /صفر/.test(p)));
  assert.ok(expenseEntryProblems({ ...ok, amount: -5 }).some((p) => /صفر/.test(p)));
  assert.ok(expenseEntryProblems({ ...ok, paymentMethod: 'شيك' }).some((p) => /طريقة/.test(p)));
  assert.ok(expenseEntryProblems({ ...ok, expenseDate: '' }).some((p) => /تاريخ/.test(p)));
});

test('‹EXP-INV› الفئةُ تُقبل بمفتاحها اللاتينيّ أيضًا', () => {
  assert.deepEqual(expenseEntryProblems({ ...ok, category: 'rent' }), []);
});

test('‹EXP-INV› صياغةُ الرأس: الفئةُ باسمها العربيّ، والمبلغُ رقمٌ، بلا shop', () => {
  const h = shapeExpenseHeader({ ...ok, category: 'rent', amount: '150' });
  assert.equal(h.category, 'إيجار');
  assert.equal(h.amount, 150);
  assert.equal(h.invoiceNo, 'INV-77');
  assert.ok(!('shop' in h), 'لا يختم المحلّ — createDraft يفعل');
});

test('‹EXP-INV› الأدوارُ: من يُتمّ الثلاث نقلات وحدَه', () => {
  assert.ok(canRecordExpense('admin'));
  assert.ok(canRecordExpense('finance_manager'));
  assert.ok(canRecordExpense('warehouse_manager'));
  // الخزينةُ تُنشئ ولا تعتمد — فلا تُتمّ الخطوةَ الواحدة.
  assert.equal(canRecordExpense('treasury'), false);
  assert.equal(canRecordExpense('storekeeper'), false);
  assert.deepEqual([...EXPENSE_RECORD_ROLES].sort(), ['admin', 'finance_manager', 'warehouse_manager']);
});

test('‹EXP-INV› طرائقُ الصرف ثابتتان', () => {
  assert.deepEqual([...EXPENSE_METHODS], ['نقدًا', 'تحويل مصرفي']);
});
