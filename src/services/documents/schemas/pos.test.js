/**
 * ‹POS م٧› مخطّطُ البيع النقديّ — المنطقُ الخالص (إجماليُّ البند · التحذيرات).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pos, { lineTotal, posWarnings } from './pos.js';

test('‹POS schema› إجماليُّ البند = كمّيّة×سعر−خصم، لا يقلّ عن صفر', () => {
  assert.equal(lineTotal({ qty: 4, unitPrice: 2.5, discount: 2 }), 8);
  assert.equal(lineTotal({ qty: 1, unitPrice: 3, discount: 9 }), 0);
  assert.equal(lineTotal({}), 0);
});

test('‹POS schema› التحذيرات: سلّةٌ فارغة · بلا مخزن · بلا طريقة · بندٌ بلا سعر', () => {
  assert.ok(posWarnings({ header: {}, lines: [] }).some((w) => /فارغة|مباع/.test(w)));
  assert.ok(posWarnings({ header: { warehouse: '' }, lines: [{ qty: 1, unitPrice: 5 }] }).some((w) => /المخزن/.test(w)));
  assert.ok(posWarnings({ header: { warehouse: 'E5', paymentMethod: '' }, lines: [{ qty: 1, unitPrice: 5 }] }).some((w) => /الدفع/.test(w)));
  assert.ok(posWarnings({ header: { warehouse: 'E5', paymentMethod: 'نقدًا' }, lines: [{ qty: 1, unitPrice: 0 }] }).some((w) => /سعر/.test(w)));
  // الصحيحُ بلا تحذيرات.
  assert.deepEqual(posWarnings({ header: { warehouse: 'E5', paymentMethod: 'نقدًا' }, lines: [{ qty: 1, unitPrice: 5 }] }), []);
});

test('‹POS schema› الهويّةُ: نوعٌ POS، طباعةٌ محايدة، أدوارٌ كاملة', () => {
  assert.equal(pos.type, 'POS');
  assert.equal(pos.plainPrint, true);
  assert.equal(pos.stage, 7);
  for (const gate of ['create', 'approve', 'complete']) {
    assert.ok(Array.isArray(pos.roles[gate]) && pos.roles[gate].length > 0, gate);
  }
});
