/**
 * ‹KSH ع› مخطّطُ بيع الكشيت — المنطقُ الخالص (إجماليُّ البند · إجماليُّ الكشف · التحذيرات).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ksh, { lineTotal, totalSale, kshWarnings } from './ksh.js';

test('‹KSH schema› إجماليُّ البند = كمّيّة×سعر−خصم، لا يقلّ عن صفر', () => {
  assert.equal(lineTotal({ qty: 10, unitPrice: 2.5, discount: 5 }), 20);
  assert.equal(lineTotal({ qty: 1, unitPrice: 3, discount: 9 }), 0);
  assert.equal(lineTotal({}), 0);
});

test('‹KSH schema› إجماليُّ الكشف = مجموعُ إجماليّات البنود', () => {
  assert.equal(totalSale([{ qty: 10, unitPrice: 2 }, { qty: 5, unitPrice: 4, discount: 5 }]), 35);
  assert.equal(totalSale([]), 0);
  assert.equal(totalSale(undefined), 0);
});

test('‹KSH schema› التحذيرات: كشفٌ فارغ · بلا عميل · بلا مخزن · بندٌ بلا سعر', () => {
  assert.ok(kshWarnings({ header: {}, lines: [] }).some((w) => /فارغ|مباع/.test(w)));
  assert.ok(kshWarnings({ header: {}, lines: [{ qty: 1, unitPrice: 5 }] }).some((w) => /العميل/.test(w)));
  assert.ok(kshWarnings({ header: { customerCode: 'C1', warehouse: '' }, lines: [{ qty: 1, unitPrice: 5 }] }).some((w) => /المخزن/.test(w)));
  assert.ok(kshWarnings({ header: { customerCode: 'C1', warehouse: 'E5' }, lines: [{ qty: 1, unitPrice: 0 }] }).some((w) => /سعر/.test(w)));
  // الصحيحُ بلا تحذيرات.
  assert.deepEqual(kshWarnings({ header: { customerCode: 'C1', customer: 'عميل', warehouse: 'E5' }, lines: [{ qty: 1, unitPrice: 5 }] }), []);
});

test('‹KSH schema› التحذير يعدّ البنودَ المباعة فقط (qty>0)', () => {
  // بندٌ بكمّيّةٍ صفر لا يُحسب مباعًا، فالكشفُ يُعدّ فارغًا.
  assert.ok(kshWarnings({ header: { customerCode: 'C1', warehouse: 'E5' }, lines: [{ qty: 0, unitPrice: 5 }] }).some((w) => /فارغ|مباع/.test(w)));
});

test('‹KSH schema› الهويّةُ: نوعٌ KSH، طباعةٌ محايدة، أفقيّة، أدوارٌ كاملة وفصلُ الاعتماد', () => {
  assert.equal(ksh.type, 'KSH');
  assert.equal(ksh.plainPrint, true);
  assert.equal(ksh.stage, 7);
  assert.equal(ksh.orientation, 'landscape');
  for (const gate of ['create', 'approve', 'complete']) {
    assert.ok(Array.isArray(ksh.roles[gate]) && ksh.roles[gate].length > 0, gate);
  }
  // فصلُ من يبيع عمّن يعتمد: المعتمِدون غيرُ أمين المخزن العاديّ والبائع.
  assert.ok(!ksh.roles.approve.includes('storekeeper'), 'أمينُ المخزن لا يعتمد كشفَه');
  assert.ok(!ksh.roles.approve.includes('sales_rep'), 'البائعُ لا يعتمد كشفَه');
});
