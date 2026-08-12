import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RELATION_PRESENTATION,
  buildDocumentRelationshipGraph,
  relationshipMetric,
} from '../services/documents/documentRelationshipGraph.js';
import {
  compatibleRelationshipNeighborhood,
  createDocumentRelation,
} from '../services/documents/documentRelations.js';

const po = { id: 'po-1', type: 'PO', number: 'PO-1', state: 'approved' };
const pr = { id: 'pr-1', type: 'PR', number: 'PR-1', state: 'done' };
const grn1 = { id: 'grn-1', type: 'GRN', number: 'GRN-1', state: 'approved' };
const grn2 = { id: 'grn-2', type: 'GRN', number: 'GRN-2', state: 'draft' };

function link(source, target, linkType, linkedQuantity = null, extra = {}) {
  return createDocumentRelation({ source, target, linkType, linkedQuantity, ...extra });
}

test('الخريطة تحفظ مصدرين ونتيجتين من النوع نفسه ولا تختزلهما إلى مفتاح النوع', () => {
  const otherPr = { id: 'pr-2', type: 'PR', number: 'PR-2', state: 'approved' };
  const relations = [
    link({ document: pr }, { document: po }, 'BASE'),
    link({ document: otherPr }, { document: po }, 'REFERENCE'),
    link({ document: po }, { document: grn1 }, 'TARGET'),
    link({ document: po }, { document: grn2 }, 'TARGET'),
  ];
  const graph = buildDocumentRelationshipGraph({ current: po, relations, documents: [pr, otherPr, grn1, grn2] });
  assert.equal(graph.incoming.length, 2);
  assert.equal(graph.outgoing.length, 2);
  assert.deepEqual(graph.outgoing.map((edge) => edge.node.id), ['grn-1', 'grn-2']);
  assert.equal(graph.nodeCount, 5);
});

test('عدة روابط سطرية بين المستندين تتجمع كميةً مع بقاء تفاصيلها قابلة للحفر', () => {
  const relations = [
    link(
      { document: po, lineId: 'po-line-1' },
      { document: grn1, lineId: 'grn-line-1' },
      'BASE',
      60,
      { uom: 'قطعة' },
    ),
    link(
      { document: po, lineId: 'po-line-2' },
      { document: grn1, lineId: 'grn-line-2' },
      'BASE',
      40,
      { uom: 'قطعة' },
    ),
  ];
  const graph = buildDocumentRelationshipGraph({ current: po, relations, documents: [grn1] });
  assert.equal(graph.outgoing.length, 1);
  assert.equal(graph.outgoing[0].linkedQuantity, 100);
  assert.equal(graph.outgoing[0].relationCount, 2);
  assert.equal(graph.outgoing[0].relations.length, 2);
  assert.equal(relationshipMetric(graph.outgoing[0]), '100 قطعة · 2 سطر');
});

test('الأنواع الستة لها تسمية وخط مرئي والمرجع متقطع لا يُعامل كأساس', () => {
  assert.deepEqual(Object.keys(RELATION_PRESENTATION), [
    'BASE', 'TARGET', 'REFERENCE', 'RETURN', 'REVERSAL', 'CORRECTION',
  ]);
  assert.equal(RELATION_PRESENTATION.BASE.lineStyle, 'solid');
  assert.equal(RELATION_PRESENTATION.REFERENCE.lineStyle, 'dashed');
  assert.notEqual(RELATION_PRESENTATION.REFERENCE.label, RELATION_PRESENTATION.BASE.label);
});

test('كل عقدة غير الحالية تفتح URL الشاشة القائم بالحروف المرمزة', () => {
  const relation = link({ document: po }, { document: grn1 }, 'TARGET');
  const graph = buildDocumentRelationshipGraph({
    current: po,
    relations: [relation],
    documents: [grn1],
    basePath: '/warehouse-system/dashboard/document',
  });
  assert.equal(graph.current.href, null);
  assert.equal(graph.outgoing[0].node.href, '/warehouse-system/dashboard/document?type=GRN&id=grn-1');
});

test('العلاقة الجديدة بين المستندين تلغي fallback الرأس القديم دون حذف الأصل', () => {
  const oldChild = {
    ...grn1,
    links: { PO: { id: po.id, number: po.number } },
  };
  const stored = link({ document: po, lineId: 'po-line-1' }, { document: grn1, lineId: 'grn-line-1' }, 'BASE', 5);
  const neighborhood = compatibleRelationshipNeighborhood(
    po,
    [stored],
    [oldChild],
    { baseTypeFor: (type) => (type === 'GRN' ? 'PO' : null) },
  );
  assert.equal(neighborhood.length, 1);
  assert.equal(neighborhood[0].linkedQuantity, 5);
  assert.deepEqual(oldChild.links.PO, { id: 'po-1', number: 'PO-1' });
});

test('المدخل الفارغ آمن ولا يخترع عقدًا أو علاقات', () => {
  assert.deepEqual(buildDocumentRelationshipGraph(), {
    current: null, incoming: [], outgoing: [], relationCount: 0, nodeCount: 0,
  });
});
