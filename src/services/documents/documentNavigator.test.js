import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  documentNavigator,
  documentScreenUrl,
  documentTimestamp,
  documentsOfType,
} from './documentNavigator.js';

const documents = [
  { id: 'po-10', type: 'PO', number: 'PO-10', createdAt: { seconds: 300 }, header: { supplier: 'المورد ج' } },
  { id: 'grn-1', type: 'GRN', number: 'GRN-1', createdAt: { seconds: 50 } },
  { id: 'po-2', type: 'PO', number: 'PO-2', createdAt: { seconds: 200 }, header: { supplier: 'المورد ب' } },
  { id: 'po-1', type: 'PO', number: 'PO-1', createdAt: { seconds: 100 }, header: { supplier: 'المورد أ' } },
];

test('الأول والسابق والتالي والأخير تبقى داخل النوع وبترتيب حتمي', () => {
  const nav = documentNavigator(documents, { type: 'PO', currentId: 'po-2' });
  assert.equal(nav.total, 3);
  assert.equal(nav.position, 2);
  assert.equal(nav.first.id, 'po-1');
  assert.equal(nav.previous.id, 'po-1');
  assert.equal(nav.current.id, 'po-2');
  assert.equal(nav.next.id, 'po-10');
  assert.equal(nav.last.id, 'po-10');
  assert.ok(nav.ordered.every((document) => document.type === 'PO'));
});

test('الحدود لا تلتف: الأول بلا سابق والأخير بلا تالٍ', () => {
  const first = documentNavigator(documents, { type: 'PO', currentId: 'po-1' });
  const last = documentNavigator(documents, { type: 'PO', currentId: 'po-10' });
  assert.equal(first.previous, null);
  assert.equal(last.next, null);
});

test('حالة الفراغ والمعرف غير الموجود واضحة بلا رمي', () => {
  const empty = documentNavigator([], { type: 'PO', currentId: 'missing' });
  assert.equal(empty.total, 0);
  assert.equal(empty.position, 0);
  assert.equal(empty.first, null);
  assert.equal(empty.last, null);

  const missing = documentNavigator(documents, { type: 'PO', currentId: 'missing' });
  assert.equal(missing.total, 3);
  assert.equal(missing.current, null);
  assert.equal(missing.previous, null);
  assert.equal(missing.next, null);
});

test('حارس الصلاحية يزيل غير المقروء من المواضع والبحث', () => {
  const nav = documentNavigator(documents, {
    type: 'PO',
    currentId: 'po-2',
    canRead: (document) => document.id !== 'po-2',
  });
  assert.equal(nav.total, 2);
  assert.equal(nav.current, null);
  assert.deepEqual(nav.ordered.map((document) => document.id), ['po-1', 'po-10']);
});

test('حارس صلاحية يرمي يعامل المستند كممنوع لا كمسموح', () => {
  assert.deepEqual(documentsOfType(documents, 'PO', { canRead: () => { throw new Error('bad policy'); } }), []);
});

test('البحث يطابق الرقم والمعرف وحقول الرأس ولا يخرج من النوع', () => {
  assert.deepEqual(
    documentNavigator(documents, { type: 'PO', query: 'PO-2' }).searchResults.map((document) => document.id),
    ['po-2'],
  );
  assert.deepEqual(
    documentNavigator(documents, { type: 'PO', query: 'المورد ج' }).searchResults.map((document) => document.id),
    ['po-10'],
  );
  assert.equal(documentNavigator(documents, { type: 'PO', query: 'GRN' }).searchResults.length, 0);
});

test('تعادل الوقت يُحسم بالرقم الطبيعي ثم المعرف', () => {
  const tied = [
    { id: 'b', type: 'PO', number: 'PO-10' },
    { id: 'c', type: 'PO', number: 'PO-2' },
    { id: 'a', type: 'PO', number: 'PO-2' },
  ];
  assert.deepEqual(documentsOfType(tied, 'PO').map((document) => document.id), ['a', 'c', 'b']);
});

test('Timestamp وDate وISO تتحول إلى وقت قابل للترتيب', () => {
  assert.equal(documentTimestamp({ seconds: 2, nanoseconds: 500_000_000 }), 2500);
  assert.equal(documentTimestamp({ toMillis: () => 3000 }), 3000);
  assert.equal(documentTimestamp(new Date('2026-01-01T00:00:00Z')), Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(documentTimestamp('invalid'), 0);
});

test('رابط المستند يحافظ على المسار القائم ويميز الجديد من القائم', () => {
  assert.equal(documentScreenUrl({ type: 'GRN' }), '/dashboard/document?type=GRN');
  assert.equal(documentScreenUrl({ type: 'GRN', id: 'id/with space' }), '/dashboard/document?type=GRN&id=id%2Fwith+space');
  assert.equal(documentScreenUrl({ type: '' }), null);
});

