import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  approvalAuditCount,
  documentActionItems,
  navigatorButtons,
} from './DocumentNavigatorModel.js';

test('الأول والسابق معطّلان عند أول سجل والتالي والأخير يفتحان هدفيهما', () => {
  const current = { id: 'one' };
  const next = { id: 'two' };
  const buttons = navigatorButtons({ current, first: current, previous: null, next, last: next });
  assert.deepEqual(buttons.map((button) => [button.key, button.disabled]), [
    ['first', true], ['previous', true], ['next', false], ['last', false],
  ]);
  assert.equal(buttons.find((button) => button.key === 'next').target.id, 'two');
});

test('كل أزرار الإجراءات مستقلة وتتعطل قبل حفظ المستند', () => {
  const unsaved = documentActionItems({ saved: false });
  assert.deepEqual(unsaved.map((item) => item.key), [
    'relations', 'attachments', 'audit', 'approvals', 'stock', 'financial',
  ]);
  assert.ok(unsaved.every((item) => item.disabled));

  const saved = documentActionItems({ saved: true, attachmentCount: 3, stockMoveCount: 2 });
  assert.ok(saved.every((item) => !item.disabled));
  assert.equal(saved.find((item) => item.key === 'attachments').count, 3);
  assert.match(saved.find((item) => item.key === 'stock').summary, /2 أثر مخزني/);
});

test('التسميات بلا إيموجي والأحمر ليس جزءًا من نموذج الشريط', () => {
  const labels = [
    ...navigatorButtons({}).map((item) => item.label),
    ...documentActionItems({ saved: true }).flatMap((item) => [item.label, item.summary]),
  ];
  assert.ok(labels.every((label) => !/\p{Extended_Pictographic}/u.test(label)));
  assert.ok(labels.every((label) => !/أحمر|red/i.test(label)));
});

test('عدد الموافقات لا يخلط الحفظ والقيد والتعليقات بقرارات الحالة', () => {
  assert.equal(approvalAuditCount([
    { action: 'create' },
    { action: 'submitted' },
    { action: 'approved' },
    { action: 'ledger' },
    { action: 'done' },
  ]), 3);
});
