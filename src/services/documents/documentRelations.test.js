import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOCUMENT_LINK_TYPES,
  compatibleDocumentRelations,
  createDocumentRelation,
  documentRelationId,
  idempotentRelationDecision,
  legacyRelationsFromDocument,
  relationsTouchingDocument,
  stableLineId,
  withStableLineIds,
} from './documentRelations.js';

const po = { id: 'po-1', type: 'PO', number: 'PO-2026-0009' };
const grn1 = { id: 'grn-1', type: 'GRN', number: 'GRN-2026-0001' };

function relation(overrides = {}) {
  return createDocumentRelation({
    source: { document: po, lineId: 'po-line-1', lineNumber: 1 },
    target: { document: grn1, lineId: 'grn-line-1', lineNumber: 1 },
    linkType: 'BASE',
    linkedQuantity: 60,
    uom: 'قطعة',
    operationId: 'receive-1',
    correlationId: 'trip-1',
    createdBy: 'user-1',
    createdAt: '2026-08-12T12:00:00Z',
    ...overrides,
  });
}

test('أنواع العلاقة الستة ثابتة ولا تعتمد على نوع المستند', () => {
  assert.deepEqual(DOCUMENT_LINK_TYPES, ['BASE', 'TARGET', 'REFERENCE', 'RETURN', 'REVERSAL', 'CORRECTION']);
});

test('المعرّف حتمي ولا يتغير مع رقم العرض أو وقت إعادة المحاولة', () => {
  const first = relation();
  const replay = relation({
    source: { document: { ...po, number: 'PO-RENAMED' }, lineId: 'po-line-1' },
    target: { document: { ...grn1, number: 'GRN-RENAMED' }, lineId: 'grn-line-1' },
    createdAt: '2026-08-12T12:01:00Z',
    operationId: 'receive-retry',
  });
  assert.equal(first.id, replay.id);
  assert.equal(first.id, documentRelationId(first));
  assert.ok(!first.id.includes('/'), 'صالح كمعرف مستند Firestore');
});

test('أمر واحد يقبل طفلين من النوع نفسه ولا يضيع أحدهما في مفتاح النوع', () => {
  const first = relation();
  const second = relation({
    target: { document: { id: 'grn-2', type: 'GRN', number: 'GRN-2026-0002' }, lineId: 'grn2-line-1' },
    linkedQuantity: 40,
    operationId: 'receive-2',
  });
  assert.notEqual(first.id, second.id);
  assert.equal(first.target.documentType, second.target.documentType);
});

test('سطر هدف واحد يستطيع التصريح بمصدرين مختلفين', () => {
  const fromPo1 = relation();
  const fromPo2 = relation({
    source: { document: { id: 'po-2', type: 'PO', number: 'PO-2026-0010' }, lineId: 'po2-line-3' },
    linkedQuantity: 10,
  });
  assert.notEqual(fromPo1.id, fromPo2.id);
  assert.equal(fromPo1.target.lineId, fromPo2.target.lineId);
});

test('هوية السطر القديم مشتقة من الفهرس ولا تعدّل المستند المنشور', () => {
  const old = { id: 'po-old', type: 'PO', lines: [{ sku: 'A' }, { sku: 'A', lineId: 'kept' }] };
  const readable = withStableLineIds(old);
  assert.equal(stableLineId(old.lines[0], 0), 'legacy-line-0001');
  assert.equal(readable.lines[0].lineId, 'legacy-line-0001');
  assert.equal(readable.lines[1].lineId, 'kept');
  assert.equal(old.lines[0].lineId, undefined, 'لا ترحيل ولا mutation للمستند القديم');
  assert.notEqual(readable.lines[0], old.lines[0]);
});

test('replay مطابق يصبح noop، وتغيير الكمية تحت الهوية نفسها تعارض', () => {
  const first = relation();
  const replay = relation({ createdAt: '2026-08-12T13:00:00Z', operationId: 'retry' });
  assert.equal(idempotentRelationDecision(null, first).action, 'create');
  assert.equal(idempotentRelationDecision(first, replay).action, 'noop');

  const conflicting = relation({ linkedQuantity: 59 });
  assert.throws(() => idempotentRelationDecision(first, conflicting), /تعارض إعادة العلاقة/);
});

test('التحقق يرفض النوع المجهول والكمية غير الموجبة وربط المستند بنفسه', () => {
  assert.throws(() => relation({ linkType: 'OTHER' }), /غير مدعوم/);
  assert.throws(() => relation({ linkedQuantity: 0 }), /موجبًا/);
  assert.throws(() => relation({ target: { document: po } }), /بنفسه/);
  assert.throws(() => createDocumentRelation({
    source: { document: po },
    target: { document: grn1 },
    linkType: 'BASE',
    linkedQuantity: 10,
  }), /سطر مصدر وسطر هدف/);
});

test('links القديمة تُقرأ دون كتابة: الأب المباشر BASE والجد الموروث REFERENCE', () => {
  const oldGrn = {
    id: 'grn-old',
    type: 'GRN',
    number: 'GRN-2025-0010',
    links: {
      PR: { id: 'pr-old', number: 'PR-2025-0004' },
      PO: { id: 'po-old', number: 'PO-2025-0007' },
    },
  };
  const links = legacyRelationsFromDocument(oldGrn, { baseType: 'PO' });
  assert.equal(links.length, 2);
  assert.equal(links.find((link) => link.source.documentType === 'PO').linkType, 'BASE');
  assert.equal(links.find((link) => link.source.documentType === 'PR').linkType, 'REFERENCE');
  assert.ok(links.every((link) => link.legacy));
  assert.deepEqual(oldGrn.links.PO, { id: 'po-old', number: 'PO-2025-0007' });
});

test('العلاقة المخزنة تفوز على fallback القديم فلا تظهر حافتان', () => {
  const oldGrn = {
    id: 'grn-old', type: 'GRN', number: 'GRN-OLD',
    links: { PO: { id: 'po-old', number: 'PO-OLD' } },
  };
  const stored = createDocumentRelation({
    source: { documentId: 'po-old', documentType: 'PO', documentNumber: 'PO-OLD' },
    target: { document: oldGrn },
    linkType: 'BASE',
    operationId: 'migrated-by-new-write',
  });
  const combined = compatibleDocumentRelations(oldGrn, [stored], { baseType: 'PO' });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].legacy, undefined);
  assert.equal(combined[0].operationId, 'migrated-by-new-write');
});

test('relationsTouchingDocument يعيد الاتجاهين ولا يحد الأطفال بنوع أو عدد', () => {
  const r1 = relation();
  const r2 = relation({
    target: { document: { id: 'grn-2', type: 'GRN' }, lineId: 'line-1' },
    linkedQuantity: 40,
  });
  const returnLink = createDocumentRelation({
    source: { document: grn1, lineId: 'grn-line-1' },
    target: { documentId: 'ret-1', documentType: 'RET', lineId: 'ret-line-1' },
    linkType: 'RETURN',
    linkedQuantity: 3,
  });
  assert.deepEqual(relationsTouchingDocument([r1, r2, returnLink], po), [r1, r2]);
  assert.deepEqual(relationsTouchingDocument([r1, r2, returnLink], grn1), [r1, returnLink]);
});
