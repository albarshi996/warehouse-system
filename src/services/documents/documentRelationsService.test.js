import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocumentRelation,
  mergeRelationResults,
  relationStorageRecord,
} from './documentRelations.js';

function relation() {
  return createDocumentRelation({
    source: { documentId: 'po-1', documentType: 'PO', documentNumber: 'PO-2026-1' },
    target: { documentId: 'grn-1', documentType: 'GRN', documentNumber: null },
    linkType: 'BASE',
    operationId: 'derive-1',
    createdBy: 'مزور-من-المدخل',
    createdAt: 'وقت-المتصفح',
  });
}

test('سجل التخزين يأخذ هوية الفاعل ووقت الخادم من طبقة الخدمة فقط', () => {
  const serverClock = { sentinel: 'serverTimestamp' };
  const stored = relationStorageRecord(
    relation(),
    { uid: 'user-1', name: 'محمد', role: 'storekeeper' },
    serverClock,
  );

  assert.equal(stored.byUid, 'user-1');
  assert.equal(stored.byName, 'محمد');
  assert.equal(stored.byRole, 'storekeeper');
  assert.equal(stored.createdAt, serverClock);
  assert.equal('createdBy' in stored, false);
  assert.equal(stored.id, relation().id);
});

test('سجل التخزين يرفض فاعلًا بلا uid', () => {
  assert.throws(() => relationStorageRecord(relation(), {}, null), /هوية كاتب العلاقة مطلوبة/);
});

test('دمج الاتجاهين يزيل التكرار ويرتّب بالهوية', () => {
  assert.deepEqual(
    mergeRelationResults([{ id: 'b', value: 1 }], [{ id: 'a' }, { id: 'b', value: 2 }]),
    [{ id: 'a' }, { id: 'b', value: 2 }],
  );
});
