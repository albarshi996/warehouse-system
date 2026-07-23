/**
 * اختبارات سلسلة الشراء والمطابقة الثلاثية (F2).
 *
 * تتحقّق من: الاشتقاق ينقل البنود ويملأ المراجع ويورّث الروابط ولا يشتقّ من
 * مسودّة · المطابقة تكشف النقص والزيادة والرفض و**الصنف خارج أمر الشراء** ·
 * التسامح يبتلع فروق التقريب ولا يبتلع النقص الحقيقي · والمخطّطات الثلاثة
 * الجديدة مسجّلة وتحسب إجمالياتها.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PURCHASE_CHAIN,
  nextInChain,
  previousInChain,
  deriveDocument,
  lineKey,
  threeWayMatch,
  chainOf,
  DEFAULT_TOLERANCE,
} from './chain.js';
import { getSchema, GOVERNED_FORMS, readyTypes } from './schemas/index.js';
import { estimatedTotal, lineEstimate, budgetWarnings } from './schemas/pr.js';
import { subtotal, netTotal, lineTotal, poWarnings } from './schemas/po.js';
import { rejectionRate, qcWarnings } from './schemas/qc.js';

/** طلب شراء معتمَد ببندين. */
function approvedPR() {
  return {
    id: 'pr1',
    type: 'PR',
    number: 'PR-2026-0001',
    state: 'approved',
    header: { department: 'المستودعات', warehouse: 'الرحبة', availableBudget: 10000 },
    lines: [
      { sku: 'A1', barcode: '111', description: 'صنف أول', uom: 'قطعة', qty: 100, estPrice: 5 },
      { sku: 'B2', barcode: '222', description: 'صنف ثانٍ', uom: 'كرتون', qty: 50, estPrice: 20 },
      { sku: '', barcode: '', description: '' }, // صفّ فارغ لا يُورَّث
    ],
    links: {},
  };
}

// ═══════════ السلسلة والاشتقاق ═══════════

test('سلسلة الشراء: الترتيب والتالي والسابق', () => {
  assert.deepEqual(PURCHASE_CHAIN, ['PR', 'PO', 'GRN', 'QC']);
  assert.equal(nextInChain('PR'), 'PO');
  assert.equal(nextInChain('GRN'), 'QC');
  assert.equal(nextInChain('QC'), null, 'QC نهاية السلسلة');
  assert.equal(previousInChain('GRN'), 'PO');
  assert.equal(previousInChain('PR'), null);
});

test('الاشتقاق PR ← PO ينقل البنود ويحوّل السعر التقديري إلى سعر وحدة', () => {
  const po = deriveDocument(approvedPR());
  assert.equal(po.type, 'PO');
  assert.equal(po.lines.length, 2, 'الصفّ الفارغ لا يُورَّث');
  assert.deepEqual(po.lines[0], {
    sku: 'A1', barcode: '111', description: 'صنف أول', uom: 'قطعة', qty: 100, unitPrice: 5,
  });
  assert.equal(po.header.prRef, 'PR-2026-0001', 'المرجع يُشتقّ لا يُكتب');
  assert.equal(po.header.warehouse, 'الرحبة');
  assert.deepEqual(po.links.PR, { id: 'pr1', number: 'PR-2026-0001' });
});

test('الاشتقاق لا يقع من مسودّة — الاعتماد أولًا', () => {
  const draft = { ...approvedPR(), state: 'draft' };
  assert.throws(() => deriveDocument(draft), /معتمَد/);
  const submitted = { ...approvedPR(), state: 'submitted' };
  assert.throws(() => deriveDocument(submitted), /معتمَد/);
});

test('الاشتقاق PO ← GRN يضع الكمية المطلوبة في خانتها ويورّث المورّد', () => {
  const po = {
    id: 'po1', type: 'PO', number: 'PO-2026-0007', state: 'done',
    header: { supplier: 'مورّد الشمال', prRef: 'PR-2026-0001' },
    lines: [{ sku: 'A1', barcode: '111', description: 'صنف أول', qty: 100, unitPrice: 5 }],
    links: { PR: { id: 'pr1', number: 'PR-2026-0001' } },
  };
  const grn = deriveDocument(po);
  assert.equal(grn.type, 'GRN');
  assert.equal(grn.lines[0].qtyOrdered, 100, 'كمية الأمر تصير «المطلوبة» في الاستلام');
  assert.equal(grn.lines[0].qtyReceived, undefined, 'المستلَم يُعدّ في الرصيف لا يُفترض');
  assert.equal(grn.header.poRef, 'PO-2026-0007');
  assert.equal(grn.header.supplier, 'مورّد الشمال');
  assert.deepEqual(Object.keys(grn.links).sort(), ['PO', 'PR'], 'الروابط تُورَّث وتُراكم');
});

test('الاشتقاق GRN ← QC ينقل المستلَم إلى المفحوص ويحمل مرجعي GRN و PO', () => {
  const grn = {
    id: 'g1', type: 'GRN', number: 'GRN-2026-0003', state: 'approved',
    header: { supplier: 'مورّد الشمال', poRef: 'PO-2026-0007' },
    lines: [{ sku: 'A1', description: 'صنف أول', qtyOrdered: 100, qtyReceived: 98 }],
    links: { PR: { id: 'pr1', number: 'PR-2026-0001' }, PO: { id: 'po1', number: 'PO-2026-0007' } },
  };
  const qc = deriveDocument(grn);
  assert.equal(qc.type, 'QC');
  assert.equal(qc.lines[0].qtyInspected, 98);
  assert.equal(qc.header.grnRef, 'GRN-2026-0003');
  assert.equal(qc.header.poRef, 'PO-2026-0007', 'الورق يطلب مرجع أمر الشراء في تقرير الفحص');
  assert.deepEqual(Object.keys(qc.links).sort(), ['GRN', 'PO', 'PR'], 'السلسلة كاملة تصل QC');
});

// ═══════════ المطابقة الثلاثية ═══════════

const PO_DOC = {
  type: 'PO', number: 'PO-1', lines: [
    { sku: 'A1', description: 'صنف أول', qty: 100 },
    { sku: 'B2', description: 'صنف ثانٍ', qty: 50 },
  ],
};

test('المطابقة التامّة: الثلاثة متساوية ⇒ ok', () => {
  const m = threeWayMatch({
    po: PO_DOC,
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 100 }, { sku: 'B2', qtyReceived: 50 }] },
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 100 }, { sku: 'B2', qtyAccepted: 50 }] },
  });
  assert.equal(m.ok, true);
  assert.equal(m.problems.length, 0);
  assert.equal(m.summary.matched, 2);
  assert.equal(m.summary.totalOrdered, 150);
});

test('النقص يُكشف ولا يمرّ صامتًا', () => {
  const m = threeWayMatch({
    po: PO_DOC,
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 80 }, { sku: 'B2', qtyReceived: 50 }] },
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 80 }, { sku: 'B2', qtyAccepted: 50 }] },
  });
  assert.equal(m.ok, false);
  const row = m.rows.find((r) => r.key === 'A1');
  assert.equal(row.status, 'short');
  assert.equal(row.varianceReceived, -20);
  assert.match(row.note, /نقص 20/);
});

test('الزيادة تُكشف أيضًا — التسليم الزائد قرارٌ لا هديّة', () => {
  const m = threeWayMatch({
    po: PO_DOC,
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 130 }, { sku: 'B2', qtyReceived: 50 }] },
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 130 }, { sku: 'B2', qtyAccepted: 50 }] },
  });
  assert.equal(m.rows.find((r) => r.key === 'A1').status, 'over');
  assert.equal(m.summary.over, 1);
});

test('رفض الجودة يظهر ولو طابقت كمية الاستلام', () => {
  const m = threeWayMatch({
    po: PO_DOC,
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 100 }, { sku: 'B2', qtyReceived: 50 }] },
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 90, qtyRejected: 10 }, { sku: 'B2', qtyAccepted: 50 }] },
  });
  assert.equal(m.ok, false);
  const row = m.rows.find((r) => r.key === 'A1');
  assert.equal(row.status, 'rejected');
  assert.match(row.note, /رُفض 10/);
});

test('🚨 الصنف المستلَم خارج أمر الشراء يُكشف — أخطر حالة', () => {
  const m = threeWayMatch({
    po: PO_DOC,
    grn: { type: 'GRN', lines: [
      { sku: 'A1', qtyReceived: 100 }, { sku: 'B2', qtyReceived: 50 },
      { sku: 'Z9', description: 'صنف لم يُطلب', qtyReceived: 25 },
    ] },
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 100 }, { sku: 'B2', qtyAccepted: 50 }, { sku: 'Z9', qtyAccepted: 25 }] },
  });
  assert.equal(m.ok, false);
  const row = m.rows.find((r) => r.key === 'Z9');
  assert.equal(row.status, 'missing-po');
  assert.equal(row.qtyOrdered, 0);
  assert.equal(m.summary.missingPo, 1);
});

test('بلا تقرير جودة: الحالة «بانتظار الفحص» لا «مطابق»', () => {
  const m = threeWayMatch({
    po: PO_DOC,
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 100 }, { sku: 'B2', qtyReceived: 50 }] },
    qc: null,
  });
  assert.equal(m.ok, false, 'لا تُغلق مطابقة بلا فحص');
  assert.deepEqual(m.missingDocs, ['تقرير الجودة']);
  assert.equal(m.summary.pendingQc, 2);
});

test('التسامح يبتلع فرق التقريب ولا يبتلع النقص الحقيقي', () => {
  const near = threeWayMatch({
    po: { type: 'PO', lines: [{ sku: 'A1', qty: 1000 }] },
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 990 }] }, // 1% ضمن 2%
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 990 }] },
  });
  assert.equal(near.rows[0].status, 'match');

  const far = threeWayMatch({
    po: { type: 'PO', lines: [{ sku: 'A1', qty: 1000 }] },
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 900 }] }, // 10%
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 900 }] },
  });
  assert.equal(far.rows[0].status, 'short');
  assert.equal(DEFAULT_TOLERANCE.pct, 2);
});

test('مفتاح المطابقة يقع على SKU ثم الباركود ثم الوصف', () => {
  assert.equal(lineKey({ sku: 'a1', barcode: '111' }), 'A1');
  assert.equal(lineKey({ barcode: '111', description: 'س' }), '111');
  assert.equal(lineKey({ description: 'صنف' }), 'صنف');
  assert.equal(lineKey({}), '');
});

test('المطابقة تجمع بنودًا مكرّرة لنفس الصنف', () => {
  const m = threeWayMatch({
    po: { type: 'PO', lines: [{ sku: 'A1', qty: 60 }, { sku: 'A1', qty: 40 }] },
    grn: { type: 'GRN', lines: [{ sku: 'A1', qtyReceived: 100 }] },
    qc: { type: 'QC', lines: [{ sku: 'A1', qtyAccepted: 100 }] },
  });
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].qtyOrdered, 100);
  assert.equal(m.ok, true);
});

test('سلسلة المستند: ما قبله وما بعده', () => {
  const grn = { id: 'g1', type: 'GRN', number: 'GRN-1', state: 'approved', links: { PR: { id: 'pr1', number: 'PR-1' }, PO: { id: 'po1', number: 'PO-1' } } };
  const related = [
    { id: 'po1', type: 'PO', number: 'PO-1', state: 'done' },
    { id: 'qc1', type: 'QC', number: 'QC-1', state: 'draft', links: { GRN: { id: 'g1' } } },
  ];
  const c = chainOf(grn, related);
  assert.deepEqual(c.before.map((b) => b.type), ['PR', 'PO']);
  assert.equal(c.before[1].state, 'done', 'حالة السابق تُقرأ من المستند الحقيقي');
  assert.equal(c.current.type, 'GRN');
  assert.deepEqual(c.after.map((a) => a.type), ['QC']);
});

// ═══════════ المخطّطات الثلاثة الجديدة ═══════════

test('المخطّطات الأربعة مسجّلة وخارطة الـ12 تعكس الواقع', () => {
  for (const t of ['PR', 'PO', 'GRN', 'QC']) {
    assert.ok(getSchema(t), `مخطّط ${t} غير مسجّل`);
    assert.equal(getSchema(t).type, t);
  }
  assert.deepEqual(readyTypes().sort(), ['GRN', 'PO', 'PR', 'QC']);
  const ready = GOVERNED_FORMS.filter((f) => f.ready).map((f) => f.type).sort();
  assert.deepEqual(ready, ['GRN', 'PO', 'PR', 'QC'], 'خارطة الـ12 تنحرف عن السجلّ');
});

test('كل مخطّط جديد يحمل أدواره وأقسامه وتوقيعاته', () => {
  for (const t of ['PR', 'PO', 'QC']) {
    const s = getSchema(t);
    assert.ok(s.roles.create.length && s.roles.approve.length, `${t}: أدوار ناقصة`);
    assert.ok(s.sections.some((sec) => sec.kind === 'table'), `${t}: بلا جدول بنود`);
    assert.equal(s.signatures.length, 3, `${t}: خانات التوقيع ثلاث كما في الورق`);
    assert.ok(typeof s.warnings === 'function', `${t}: بلا تحذيرات`);
  }
});

test('PR: الإجماليات محسوبة وتحذير الميزانية يعمل', () => {
  const lines = [{ qty: 10, estPrice: 5 }, { qty: 4, estPrice: 25 }];
  assert.equal(lineEstimate(lines[0]), 50);
  assert.equal(estimatedTotal(lines), 150);
  assert.equal(budgetWarnings({ lines, header: { availableBudget: 1000 } }).length, 0);
  assert.match(budgetWarnings({ lines, header: { availableBudget: 100 } })[0], /يتجاوز الميزانية/);
});

test('PO: الصافي بعد الخصم لا يقلّ عن صفر، وتحذير البند بلا سعر', () => {
  const lines = [{ qty: 10, unitPrice: 5 }, { qty: 2, unitPrice: 100 }];
  assert.equal(lineTotal(lines[0]), 50);
  assert.equal(subtotal(lines), 250);
  assert.equal(netTotal({ lines, header: { discount: 50 } }), 200);
  assert.equal(netTotal({ lines, header: { discount: 9999 } }), 0, 'الصافي لا يصير سالبًا');
  assert.match(poWarnings({ lines, header: { discount: 9999 } })[0], /يتجاوز إجمالي الأمر/);
  assert.ok(poWarnings({ lines: [{ qty: 5, unitPrice: 0 }], header: {} }).some((w) => /بلا سعر/.test(w)));
});

test('QC: نسبة الرفض وتحذيرات العدّ والقرار', () => {
  assert.equal(rejectionRate([{ qtyInspected: 200, qtyRejected: 10 }]), 5);
  assert.equal(rejectionRate([]), 0, 'لا قسمة على صفر');

  const noReason = qcWarnings({ lines: [{ qtyInspected: 10, qtyAccepted: 8, qtyRejected: 2 }], header: {} });
  assert.ok(noReason.some((w) => /بلا سبب/.test(w)));

  const badMath = qcWarnings({ lines: [{ qtyInspected: 10, qtyAccepted: 5, qtyRejected: 2, reason: 'كسر' }], header: {} });
  assert.ok(badMath.some((w) => /لا يساوي المفحوص/.test(w)));

  const noNcr = qcWarnings({ lines: [], header: { finalDecision: 'رفض' } });
  assert.ok(noNcr.some((w) => /NCR/.test(w)));
  assert.equal(qcWarnings({ lines: [], header: { finalDecision: 'قبول' } }).length, 0);
});
