import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLineExtras,
  combinedLinePairs,
  combinePartialSources,
  derivePartialDocument,
  flowAllocationDecision,
  flowAllocationId,
  multiSourceAllowed,
  partialLinePairs,
  partialDerivationPlan,
} from './documentFlow.js';
// ‹JR-201ب› الوراثةُ عبر `LINE_MAP` هي ما يبلغ الرصيد — فتُختبر بمحرّكها لا بمحاكاة.
import { deriveDocument } from './chain.js';
import { stableLineId } from './documentRelations.js';

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

/* ═══════════════ ‹JR-201ب› تمريرُ الصلاحية في سلسلة المستندات ═══════════════ */

/** ما تقوله الطبالي لسطر أمر الشراء — بصيغة `grnLineExtras` حرفًا. */
const palletExtras = { 'po-1': { 'po-a': { batch: 'B7', expiryDate: '2027-03-01' } } };

test('‹JR-201ب› غيابُ الوسيط دالّةُ هويّة — المسوّدةُ نفسُها مرجعًا لا نسخةً', () => {
  const plan = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 10, 'po-b': 4 });
  const draft = derivePartialDocument(po, 'GRN', plan);
  const plans = [{ source: po, plan }];
  // ثلاثةُ أشكالٍ للغياب — والمرجعُ نفسُه يُعاد، فخمسةٌ وعشرون اشتقاقًا في
  // `LINE_MAP` لا يمرّرها أحدٌ منها تبقى بايتًا ببايت.
  assert.equal(applyLineExtras(draft, plans, null), draft);
  assert.equal(applyLineExtras(draft, plans, undefined), draft);
  assert.equal(applyLineExtras(draft, plans, {}), draft);
  // ومصدرٌ لا ترقيعَ لبنوده لا يُنشئ نسخةً عبثًا
  assert.equal(applyLineExtras(draft, plans, { 'po-9': { 'x': { batch: 'Z' } } }), draft);
});

test('‹JR-201ب› الترقيعُ يضيف حقولًا ولا يحرّك عددًا ولا ترتيبًا ولا هويّة', () => {
  const plan = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 10, 'po-b': 4 });
  const draft = derivePartialDocument(po, 'GRN', plan);
  const before = structuredClone(draft);
  const plans = [{ source: po, plan }];
  const patched = applyLineExtras(draft, plans, palletExtras);

  assert.deepEqual(draft, before, 'المسوّدةُ المدخلة لا تُعدَّل — الدالّة خالصة');
  assert.equal(patched.lines.length, draft.lines.length, 'الطولُ ثابت — فحسابُ مؤشّر الأزواج لا يُمسّ');
  assert.deepEqual(patched.lines.map((line) => line.sku), ['A', 'B'], 'والترتيبُ ثابت');
  assert.deepEqual(patched.lines.map((line) => line.qtyOrdered), [10, 4], 'والكمّيّاتُ ثابتة');
  assert.equal(patched.lines[0].expiryDate, '2027-03-01');
  assert.equal(patched.lines[0].batch, 'B7');
  assert.equal(patched.lines[1].expiryDate, undefined, 'بندٌ بلا ترقيعٍ يبقى كما اشتقّه المحرّك');

  // ★★★ الهويّة **موضعيّةٌ لا محتوائيّة** — وهي عين ما يجعل هذا آمنًا.
  assert.deepEqual(
    patched.lines.map((line, index) => stableLineId(line, index)),
    draft.lines.map((line, index) => stableLineId(line, index)),
  );
  assert.deepEqual(
    combinedLinePairs(plans, patched).map((pair) => [pair.sourceLineId, pair.targetLineId, pair.quantity]),
    combinedLinePairs(plans, draft).map((pair) => [pair.sourceLineId, pair.targetLineId, pair.quantity]),
    'أزواجُ البنود قبل الترقيع وبعده سواء',
  );
});

test('‹JR-201ب› الترقيعُ يتبع مشيةَ الأزواج فيصيب بندَ مصدره في المسوّدة المدموجة', () => {
  const po2 = { ...po, id: 'po-2', number: 'PO-2', lines: [{ lineId: 'po2-c', sku: 'C', qty: 7 }] };
  const plans = [
    { source: po, plan: partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 10, 'po-b': 4 }) },
    { source: po2, plan: partialDerivationPlan(po2, 'GRN') },
  ];
  const draft = combinePartialSources(plans, 'GRN');
  const patched = applyLineExtras(draft, plans, {
    'po-1': { 'po-b': { expiryDate: '2027-01-31' } },
    'po-2': { 'po2-c': { expiryDate: '2028-12-01' } },
  });
  // مشيةٌ مغلوطةٌ بمقدار بندٍ واحد تُلصق صلاحيةَ «B» على «A» — بلا خطأٍ يُرفع.
  assert.deepEqual(
    patched.lines.map((line) => [line.sku, line.expiryDate ?? '']),
    [['A', ''], ['B', '2027-01-31'], ['C', '2028-12-01']],
  );
  assert.equal(combinedLinePairs(plans, patched).length, 3, 'والدمجُ ما زال يطابق أسطره');
});

test('‹JR-201ب› ما ورّثه المحرّك لا يُطمَس — الترقيعُ يملأ الفارغ وحده', () => {
  const grn = {
    id: 'grn-9', type: 'GRN', number: 'GRN-9', state: 'approved', header: {},
    lines: [{ lineId: 'g-a', sku: 'A', qtyReceived: 10, batch: 'FROM-DOC', expiryDate: '2027-03-01' }],
  };
  const plan = partialDerivationPlan(grn, 'QC', [], [], { 'g-a': 10 });
  const draft = derivePartialDocument(grn, 'QC', plan);
  const patched = applyLineExtras(draft, [{ source: grn, plan }], {
    'grn-9': { 'g-a': { batch: 'FROM-PALLET', supplierBatch: 'SB-1' } },
  });
  assert.equal(patched.lines[0].batch, 'FROM-DOC', 'مصدرُ الدفعة المستندُ لا ذاكرةُ الطبلية');
  assert.equal(patched.lines[0].supplierBatch, 'SB-1', 'والفارغُ وحده يُملأ');
});

test('★★ ‹JR-201ب› صلاحيةُ الطبلية تبلغ التخزين عبر السلسلة كاملةً', () => {
  // ① العطب: `LINE_MAP['PO>GRN']` لا ينقل صلاحيةً — وأمرُ الشراء لا يعرفها أصلًا.
  const plan = partialDerivationPlan(po, 'GRN', [], [], { 'po-a': 10, 'po-b': 0 });
  const bare = derivePartialDocument(po, 'GRN', plan);
  assert.equal(bare.lines[0].expiryDate, undefined, 'قبل الترقيع: خانةٌ فارغة تعمي FEFO');

  // ② الترقيع بما كتبه موظّف الاستلام على الطبلية.
  const grnDraft = applyLineExtras(bare, [{ source: po, plan }], palletExtras);
  assert.equal(grnDraft.lines[0].expiryDate, '2027-03-01');

  // ③ الاستلام يُعتمد بكمّيّةٍ مستلَمة، ثمّ يُشتقّ الفحص — `GRN>QC` يقرأ
  //    `expiryDate` ويكتب `expiry`. **والحرفُ هنا هو كلُّ الفرق**: من كتب
  //    `expiry` على بند GRN رأى الفحص يولد فارغًا بلا رسالةِ خطأٍ واحدة.
  const grn = {
    id: 'grn-1', type: 'GRN', number: 'GRN-1', state: 'approved',
    header: grnDraft.header, links: grnDraft.links,
    lines: grnDraft.lines.map((line) => ({ ...line, qtyReceived: line.qtyOrdered })),
  };
  const qcDraft = deriveDocument(grn, 'QC');
  assert.equal(qcDraft.lines[0].expiry, '2027-03-01', 'الفحصُ ورث الصلاحية');
  assert.equal(qcDraft.lines[0].batch, 'B7', 'ومعها التشغيلة');

  // ④ والمقبولُ جودةً وحده يُخزَّن — بصلاحيته الموروثة. وهذه الحلقةُ الأخيرة
  //    هي ما يبلغ `balances.expiry`، فمن اختبر حتّى الفحص اختبر نصفَ الطريق.
  const qc = {
    id: 'qc-1', type: 'QC', number: 'QC-1', state: 'approved',
    header: qcDraft.header, links: qcDraft.links,
    lines: qcDraft.lines.map((line) => ({ ...line, qtyAccepted: line.qtyInspected })),
  };
  const putaway = deriveDocument(qc, 'PUTAWAY');
  assert.equal(putaway.lines[0].expiry, '2027-03-01', 'والتخزينُ ورثها — فأبصرت FEFO');
  assert.equal(putaway.lines[0].batch, 'B7');
  assert.equal(putaway.lines[0].qty, 10, 'والكمّيّةُ هي المقبولة لا المستلَمة');
});
