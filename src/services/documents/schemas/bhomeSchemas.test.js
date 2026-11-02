/**
 * اختبارات مخطّطات المحاسبة المستقلّة (ذ): التحذيراتُ تمنع المجهولَ والصفر،
 * والقيمةُ تُحسب من البنود، والأدوارُ تفصل من يُنشئ عمّن يعتمد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import sinv, { sinvWarnings } from './sinv.js';
import sinvi, { lineValue, invoiceTotal, sinviWarnings } from './sinvi.js';
import sal, { salWarnings } from './sal.js';
import adv, { advWarnings } from './adv.js';
import advr, { advrWarnings } from './advr.js';
import exp, { expWarnings, EXP_CATEGORY_LABELS } from './exp.js';

test('★ فاتورةُ القيمة: لا مورّدَ مجهولٌ ولا قيمةٌ صفرٌ ولا استحقاقٌ قبل الفاتورة', () => {
  assert.ok(sinvWarnings({ header: {} }).some((w) => /المورّد/.test(w)));
  assert.ok(sinvWarnings({ header: { supplier: 'م', amount: 0 } }).some((w) => /صفر/.test(w)));
  assert.ok(sinvWarnings({ header: { supplier: 'م', amount: 5, invoiceDate: '2026-10-21', dueDate: '2026-10-01' } }).some((w) => /الاستحقاق قبل/.test(w)));
  assert.deepEqual(sinvWarnings({ header: { supplier: 'م', amount: 5, invoiceDate: '2026-10-21', dueDate: '2026-11-01' } }), []);
});

test('★ فاتورةُ الأصناف: القيمةُ كمّيّةٌ × كلفة، والسالبُ يُمنع', () => {
  assert.equal(lineValue({ qty: 2, unitCost: 100 }), 200);
  assert.equal(invoiceTotal([{ qty: 2, unitCost: 100 }, { qty: 1, unitCost: 50 }]), 250);
  assert.ok(sinviWarnings({ header: { supplier: 'م' }, lines: [] }).some((w) => /لا قيمة/.test(w)));
  assert.ok(sinviWarnings({ header: { supplier: 'م' }, lines: [{ qty: -1, unitCost: 5 }] }).some((w) => /سالبة/.test(w)));
});

test('★ الراتبُ والسلفةُ والسداد: لا عاملَ مجهولٌ ولا قيمةٌ صفر', () => {
  for (const warn of [salWarnings, advWarnings, advrWarnings]) {
    assert.ok(warn({ header: {} }).some((w) => /العامل/.test(w)));
    assert.ok(warn({ header: { worker: 'سالم', amount: 0 } }).some((w) => /صفر/.test(w)));
    assert.deepEqual(warn({ header: { worker: 'سالم', amount: 100 } }), []);
  }
});

test('★ المصروفُ المبوّب: لا فئةَ فارغةٌ ولا قيمةٌ صفر', () => {
  assert.ok(expWarnings({ header: { amount: 5 } }).some((w) => /الفئة/.test(w)));
  assert.ok(expWarnings({ header: { category: 'إيجار', amount: 0 } }).some((w) => /صفر/.test(w)));
  assert.deepEqual(expWarnings({ header: { category: 'إيجار', amount: 5 } }), []);
  assert.equal(EXP_CATEGORY_LABELS.length, 9);
});

test('★★ الأدوارُ تفصل: المالية تعتمد، والخزينةُ تُنفّذ الصرف ولا تعتمده', () => {
  for (const s of [sinv, sinvi, sal, adv, advr, exp]) {
    assert.ok(s.roles.create.length && s.roles.approve.length && s.roles.complete.length, `${s.type}: أدوارٌ ناقصة`);
    assert.ok(s.roles.approve.includes('finance_manager'), `${s.type}: المالية تعتمد`);
    assert.ok(typeof s.warnings === 'function', `${s.type}: تحذيراتٌ غائبة`);
    assert.equal(s.signatures.length, 3, `${s.type}: ثلاثُ خاناتِ توقيع`);
  }
  // من صرف لا يعتمد صرفه: الخزينةُ تُنجز الراتب والسلفة ولا تعتمدهما.
  for (const s of [sal, adv, advr, exp]) {
    assert.ok(s.roles.complete.includes('treasury'), `${s.type}: الخزينةُ تُنفّذ`);
    assert.ok(!s.roles.approve.includes('treasury'), `${s.type}: الخزينةُ لا تعتمد صرفها`);
  }
});
