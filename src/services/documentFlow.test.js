import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  combinedLinePairs,
  combinePartialSources,
  derivePartialDocument,
  flowAllocationDecision,
  flowAllocationId,
  multiSourceAllowed,
  partialLinePairs,
  partialDerivationPlan,
} from './documentFlow.js';

const po = {
  id: 'po-1', type: 'PO', number: 'PO-1', state: 'approved',
  header: { supplier: 'S' },
  lines: [
    { lineId: 'po-a', sku: 'A', description: 'A', qty: 100, uom: 'EA' },
    { lineId: 'po-b', sku: 'B', description: 'B', qty: 20, uom: 'EA' },
  ],
};

function link(id, sourceId, targetId, quantity, targetType = 'GRN') {
  return {
    id, linkType: 'BASE', linkedQuantity: quantity,
    source: { documentId: sourceId, documentType: 'PO', lineId: 'po-a' },
    target: { documentId: targetId, documentType: targetType, lineId: `${targetId}-a` },
  };
}

test('100 ثم 60 يترك 40 ويسمح بطفل ثانٍ من النوع نفسه', () => {
  const plan = partialDerivationPlan(po, 'GRN', [link('r-60', 'po-1', 'grn-1', 60)]);
  assert.equal(plan.lines[0].executed, 60);
  assert.equal(plan.lines[0].open, 40);
  assert.equal(plan.totalOpen, 60);
});

test('60 ثم 40 يغلق السطر عند الصفر فقط', () => {
  const plan = partialDerivationPlan(po, 'GRN', [
    link('r-60', 'po-1', 'grn-1', 60),
    link('r-40', 'po-1', 'grn-2', 40),
  ]);
  assert.equal(plan.lines[0].open, 0);
  assert.equal(plan.lines[1].open, 20);
});

test('يرفض تجاوز المتبقي ولا يقبل اختيارًا صفريًا', () => {
  const rels = [link('r-60', 'po-1', 'grn-1', 60)];
  assert.throws(() => partialDerivationPlan(po, 'GRN', rels, [], { 'po-a': 41 }), /تتجاوز المتبقي/);
  assert.throws(() => partialDerivationPlan(po, 'GRN', rels, [], { 'po-a': 0, 'po-b': 0 }), /كمية موجبة/);
});

test('الاشتقاق الجزئي ينقل السطور المختارة والكميات المحددة فقط', () => {
  const plan = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 60, 'po-b': 0 });
  const draft = derivePartialDocument(po, 'GRN', plan);
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].qtyOrdered, 60);
  assert.equal(po.lines[0].qty, 100, 'المصدر لا يُعدّل');
});

test('الفروع مستقلة: علاقة SRN لا تستهلك رصيد PUTAWAY', () => {
  const qc = {
    id: 'qc-1', type: 'QC', state: 'approved', lines: [
      { lineId: 'q-a', sku: 'A', qtyInspected: 100, qtyAccepted: 90, qtyRejected: 10 },
    ],
  };
  const srn = {
    id: 'srn-rel', linkType: 'TARGET', linkedQuantity: 10,
    source: { documentId: 'qc-1', documentType: 'QC', lineId: 'q-a' },
    target: { documentId: 'srn-1', documentType: 'SRN', lineId: 's-a' },
  };
  assert.equal(partialDerivationPlan(qc, 'PUTAWAY', [srn]).totalOpen, 90);
  assert.equal(partialDerivationPlan(qc, 'SRN', [srn]).totalOpen, 0);
});

test('المستندات القديمة تحسب من أطفال links دون إعادة كتابة', () => {
  const child = {
    id: 'grn-old', type: 'GRN', links: { PO: { id: 'po-1' } },
    lines: [{ sku: 'A', qtyReceived: 60 }, { sku: 'B', qtyReceived: 5 }],
  };
  const snapshot = structuredClone({ po, child });
  const plan = partialDerivationPlan(po, 'GRN', [], [child]);
  assert.equal(plan.lines[0].open, 40);
  assert.equal(plan.lines[1].open, 15);
  assert.deepEqual({ po, child }, snapshot);
});

test('مصدران من النوع نفسه يندمجان في طفل واحد بلا ضياع خطوطهما', () => {
  const po2 = { ...po, id: 'po-2', number: 'PO-2', lines: [{ lineId: 'po2-c', sku: 'C', qty: 7 }] };
  const p1 = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 10, 'po-b': 0 });
  const p2 = partialDerivationPlan(po2, 'GRN');
  const draft = combinePartialSources([{ source: po, plan: p1 }, { source: po2, plan: p2 }], 'GRN');
  assert.equal(draft.sourceCount, 2);
  assert.deepEqual(draft.lines.map((line) => line.sku), ['A', 'C']);
  assert.equal(draft.links.PO.id, 'po-1', 'التوافق القديم يحتفظ بالأول، والتعدد تحفظه العلاقات الجديدة');
});

test('هوية قفل التدفق حتمية لكل مصدر وهدف', () => {
  assert.equal(flowAllocationId('po 1', 'GRN'), flowAllocationId('po 1', 'GRN'));
  assert.notEqual(flowAllocationId('po 1', 'GRN'), flowAllocationId('po 1', 'QC'));
});

test('قفل التدفق يمنع طلبين متزامنين من حجز الرصيد نفسه', () => {
  const plan = partialDerivationPlan(po, 'GRN');
  const first = flowAllocationDecision(plan, {}, { 'po-a': 60, 'po-b': 20 });
  const second = flowAllocationDecision(plan, first.allocatedByLine, { 'po-a': 40 });
  assert.equal(second.allocatedByLine['po-a'], 100);
  assert.throws(
    () => flowAllocationDecision(plan, second.allocatedByLine, { 'po-a': 1 }),
    /تتجاوز المتبقي/,
  );
});

test('الدمج يجمع أرقام المصادر في حقل المرجع ولا يطمس بقيّتها بأوّلها', () => {
  const po2 = { ...po, id: 'po-2', number: 'PO-2', lines: [{ lineId: 'po2-c', sku: 'C', qty: 7 }] };
  const draft = combinePartialSources([
    { source: po, plan: partialDerivationPlan(po, 'GRN') },
    { source: po2, plan: partialDerivationPlan(po2, 'GRN') },
  ], 'GRN');
  assert.equal(draft.header.poRef, 'PO-1 + PO-2');
  assert.equal(draft.header.supplier, 'S');
});

test('أزواج المسودة المدموجة تنسب كلّ سطرٍ لمصدره وبموضعه في الابن', () => {
  const po2 = { ...po, id: 'po-2', number: 'PO-2', lines: [{ lineId: 'po2-c', sku: 'C', qty: 7 }] };
  const plans = [
    { source: po, plan: partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 10, 'po-b': 4 }) },
    { source: po2, plan: partialDerivationPlan(po2, 'GRN') },
  ];
  const draft = combinePartialSources(plans, 'GRN');
  const pairs = combinedLinePairs(plans, draft);
  assert.equal(pairs.length, 3, 'سطران من الأوّل وسطر من الثاني');
  assert.deepEqual(
    pairs.map((pair) => [pair.sourceDocument.id, pair.sourceLineId, pair.targetLineIndex, pair.quantity]),
    [['po-1', 'po-a', 0, 10], ['po-1', 'po-b', 1, 4], ['po-2', 'po2-c', 2, 7]],
  );
  // هوية سطر الابن تُحسب من موضعه في المسودة النهائية لا في مسودة مصدره وحده.
  assert.equal(new Set(pairs.map((pair) => pair.targetLineId)).size, 3);
});

test('لمصدرٍ واحد تطابق أزواجُ الدمج أزواجَ المسار المفرد حرفًا بحرف', () => {
  const plan = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 60, 'po-b': 5 });
  const draft = derivePartialDocument(po, 'GRN', plan);
  const single = partialLinePairs(po, draft, plan);
  const combined = combinedLinePairs([{ source: po, plan }], draft);
  assert.deepEqual(
    combined.map((pair) => [pair.sourceLineId, pair.targetLineId, pair.quantity]),
    single.map((pair) => [pair.sourceLineId, pair.targetLineId, pair.quantity]),
  );
});

test('السياسة تمنع الدمج حيث يكون الابن مرآةً لمستندٍ واحد', () => {
  assert.equal(multiSourceAllowed('PO', 'GRN'), true);
  assert.equal(multiSourceAllowed('DN', 'INV'), false);
  const dn = {
    id: 'dn-1', type: 'DN', number: 'DN-1', state: 'approved',
    header: { customer: 'C' }, lines: [{ lineId: 'dn-a', sku: 'A', qty: 5 }],
  };
  const dn2 = { ...dn, id: 'dn-2', number: 'DN-2' };
  assert.throws(() => combinePartialSources([
    { source: dn, plan: partialDerivationPlan(dn, 'INV') },
    { source: dn2, plan: partialDerivationPlan(dn2, 'INV') },
  ], 'INV'), /السياسة لا تسمح/);
});

test('لا يُدمج مصدران يختلف مورّدهما ولا المصدر نفسه مرّتين', () => {
  const other = { ...po, id: 'po-9', number: 'PO-9', header: { supplier: 'X' } };
  assert.throws(() => combinePartialSources([
    { source: po, plan: partialDerivationPlan(po, 'GRN') },
    { source: other, plan: partialDerivationPlan(other, 'GRN') },
  ], 'GRN'), /تختلف رؤوسها/);
  assert.throws(() => combinePartialSources([
    { source: po, plan: partialDerivationPlan(po, 'GRN') },
    { source: po, plan: partialDerivationPlan(po, 'GRN') },
  ], 'GRN'), /المصدر نفسه مرّتين/);
});

test('أزواج الأسطر تحفظ المصدر والهدف والكمية لكتابة علاقات سطرية', () => {
  const plan = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 60, 'po-b': 5 });
  const draft = derivePartialDocument(po, 'GRN', plan);
  const pairs = partialLinePairs(po, draft, plan);
  assert.deepEqual(pairs.map((pair) => [pair.sourceLineId, pair.targetLineId, pair.quantity]), [
    ['po-a', 'legacy-line-0001', 60],
    ['po-b', 'legacy-line-0002', 5],
  ]);
});
