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
  OUTBOUND_CHAIN,
  RETURN_CHAIN,
  COUNT_CHAIN,
  chainFor,
  fefoViolations,
  gateVerdict,
  adjustmentVerdict,
  creditNoteVerdict,
} from './chain.js';
import { getSchema, GOVERNED_FORMS, readyTypes } from './schemas/index.js';
import { estimatedTotal, lineEstimate, budgetWarnings } from './schemas/pr.js';
import { subtotal, netTotal, lineTotal, poWarnings } from './schemas/po.js';
import { rejectionRate, qcWarnings } from './schemas/qc.js';
import { putawayWarnings } from './schemas/putaway.js';
import { lineShortage, lineValue, orderValue, pickWarnings } from './schemas/pick.js';
import { cartonCount, packWarnings } from './schemas/pack.js';
import { dnWarnings } from './schemas/dn.js';
import { gateWarnings } from './schemas/gp.js';
import { lineReturnValue, returnWarnings } from './schemas/ret.js';
import { damageValue, totalDamage, damageWarnings } from './schemas/dmg.js';
import { lineVariance, inventoryAccuracy, matchedCount, cycleWarnings } from './schemas/cc.js';
import { adjVariance, totalIncrease, totalDecrease, netImpact, adjustmentWarnings } from './schemas/adj.js';
import { creditTotal, creditWarnings } from './schemas/cn.js';

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
  // امتدّت في F3 بأمر التخزين — التفاصيل في اختبار السلسلتين أدناه.
  assert.equal(nextInChain('PR'), 'PO');
  assert.equal(nextInChain('GRN'), 'QC');
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

test('مخطّطات F1+F2 مسجّلة وخارطة الـ12 لا تنحرف عن السجلّ', () => {
  for (const t of ['PR', 'PO', 'GRN', 'QC']) {
    assert.ok(getSchema(t), `مخطّط ${t} غير مسجّل`);
    assert.equal(getSchema(t).type, t);
  }
  // الخارطة تُشتقّ `ready` من السجلّ، فتساويهما هو الحارس ضدّ الانحراف.
  const ready = GOVERNED_FORMS.filter((f) => f.ready).map((f) => f.type).sort();
  assert.deepEqual(ready, readyTypes().sort(), 'خارطة الـ12 تنحرف عن السجلّ');
  for (const t of ['PR', 'PO', 'GRN', 'QC']) assert.ok(ready.includes(t));
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

// ═══════════ F3: سلسلة الصرف وحارسا FEFO والبوابة ═══════════

test('السلسلتان: الوارد ينتهي بالتخزين، والصادر مستقلّ ينتهي بالتصريح', () => {
  assert.deepEqual(PURCHASE_CHAIN, ['PR', 'PO', 'GRN', 'QC', 'PUTAWAY']);
  assert.deepEqual(OUTBOUND_CHAIN, ['PICK', 'PACK', 'DN', 'GP']);
  assert.equal(nextInChain('QC'), 'PUTAWAY');
  assert.equal(nextInChain('PUTAWAY'), null, 'التخزين ينهي الوارد');
  assert.equal(nextInChain('PICK'), 'PACK');
  assert.equal(nextInChain('GP'), null, 'التصريح ينهي الصادر');
  assert.equal(previousInChain('PICK'), null, 'السحب يبدأ رحلةً جديدة لا يرث الوارد');
  assert.equal(previousInChain('GP'), 'DN');
  assert.equal(chainFor('GRN'), PURCHASE_CHAIN);
  assert.equal(chainFor('DN'), OUTBOUND_CHAIN);
});

test('الاشتقاق QC ← PUTAWAY ينقل المقبول جودةً وحده لا المستلَم كلّه', () => {
  const qcDoc = {
    id: 'qc1', type: 'QC', number: 'QC-2026-0005', state: 'approved',
    header: { supplier: 'مورّد الشمال', grnRef: 'GRN-2026-0003' },
    lines: [{ sku: 'A1', description: 'صنف أول', qtyInspected: 100, qtyAccepted: 90, qtyRejected: 10 }],
    links: { GRN: { id: 'g1', number: 'GRN-2026-0003' } },
  };
  const put = deriveDocument(qcDoc);
  assert.equal(put.type, 'PUTAWAY');
  assert.equal(put.lines[0].qty, 90, 'المرفوض لا يُخزَّن');
  assert.equal(put.header.grnRef, 'GRN-2026-0003', 'الورق يطلب رقم الاستلام لا رقم الفحص');
  assert.equal(put.header.supplier, 'مورّد الشمال');
});

test('سلسلة الصرف كاملة: سحب ← تعبئة ← إذن ← تصريح', () => {
  const pickDoc = {
    id: 'pk1', type: 'PICK', number: 'PICK-2026-0001', state: 'approved',
    header: { destination: 'فرع بنغازي' },
    lines: [{ sku: 'A1', description: 'صنف أول', qtyRequested: 50, qtyPicked: 48, uom: 'قطعة' }],
    links: {},
  };
  const packDraft = deriveDocument(pickDoc);
  assert.equal(packDraft.type, 'PACK');
  assert.equal(packDraft.lines[0].qty, 48, 'المسحوب فعلًا هو ما يُعبَّأ');
  assert.equal(packDraft.header.pickRef, 'PICK-2026-0001');
  assert.equal(packDraft.header.destination, 'فرع بنغازي');

  const packDoc = { ...packDraft, id: 'pc1', number: 'PACK-2026-0001', state: 'approved', header: { ...packDraft.header, customer: 'عميل الجنوب' } };
  const dnDraft = deriveDocument(packDoc);
  assert.equal(dnDraft.type, 'DN');
  assert.equal(dnDraft.header.packRef, 'PACK-2026-0001');
  assert.equal(dnDraft.header.customer, 'عميل الجنوب');

  const dnDoc = {
    ...dnDraft, id: 'dn1', number: 'DN-2026-0001', state: 'approved',
    header: { ...dnDraft.header, driverName: 'سائق', vehiclePlate: '12-3456' },
  };
  const gpDraft = deriveDocument(dnDoc);
  assert.equal(gpDraft.type, 'GP');
  assert.equal(gpDraft.header.dnRef, 'DN-2026-0001');
  assert.equal(gpDraft.header.driverName, 'سائق', 'بيانات النقل تُورَّث فلا تُعاد كتابتها على البوابة');
  assert.equal(gpDraft.header.vehiclePlate, '12-3456');
  assert.deepEqual(Object.keys(gpDraft.links).sort(), ['DN', 'PACK', 'PICK']);
});

// ── 🥇 حارس FEFO ──

const STOCK = [
  { sku: 'A1', batch: 'L1', expiry: '2026-09-01', qty: 40 },
  { sku: 'A1', batch: 'L2', expiry: '2027-03-01', qty: 60 },
  { sku: 'B2', batch: 'M1', expiry: '2026-10-01', qty: 20 },
];

test('FEFO: السحب من الأقرب انتهاءً مطابق', () => {
  assert.deepEqual(fefoViolations({ lines: [{ sku: 'A1', qtyPicked: 10, expiry: '2026-09-01' }] }, STOCK), []);
});

test('🥇 FEFO: السحب من الأبعد انتهاءً مخالفة تُكشف بتفاصيلها', () => {
  const v = fefoViolations({ lines: [{ sku: 'A1', description: 'صنف أول', qtyPicked: 10, expiry: '2027-03-01' }] }, STOCK);
  assert.equal(v.length, 1);
  assert.equal(v[0].key, 'A1');
  assert.equal(v[0].earliestExpiry, '2026-09-01');
  assert.equal(v[0].earliestBatch, 'L1');
  assert.equal(v[0].earliestQty, 40);
  assert.match(v[0].message, /2026-09-01/);
});

test('FEFO: تشغيلة نفدت كميتها لا تُحسب معيارًا', () => {
  const stock = [
    { sku: 'A1', batch: 'L1', expiry: '2026-09-01', qty: 0 },
    { sku: 'A1', batch: 'L2', expiry: '2027-03-01', qty: 60 },
  ];
  assert.deepEqual(fefoViolations({ lines: [{ sku: 'A1', qtyPicked: 5, expiry: '2027-03-01' }] }, stock), []);
});

test('FEFO: بند بلا سحب فعلي لا يُفحص، وصنف بلا رصيد لا يُفحص', () => {
  assert.deepEqual(fefoViolations({ lines: [{ sku: 'A1', qtyPicked: 0, expiry: '2027-03-01' }] }, STOCK), []);
  assert.deepEqual(fefoViolations({ lines: [{ sku: 'ZZ', qtyPicked: 9, expiry: '2030-01-01' }] }, STOCK), []);
  assert.deepEqual(fefoViolations({ lines: [{ sku: 'A1', qtyPicked: 5 }] }, []), [], 'بلا أرصدة لا حكم');
});

test('FEFO: بندٌ مسحوب بلا تاريخ يُعدّ الأبعد فيُكشف', () => {
  const v = fefoViolations({ lines: [{ sku: 'A1', qtyPicked: 5, expiry: '' }] }, STOCK);
  assert.equal(v.length, 1, 'الفارغ = ما لا نهاية ⇒ أبعد من الأقرب');
  assert.equal(v[0].pickedExpiry, 'بلا تاريخ');
});

// ── 🏅 حارس البوابة ──

const DN_APPROVED = {
  id: 'dn1', type: 'DN', number: 'DN-2026-0001', state: 'approved',
  lines: [{ sku: 'A1', description: 'صنف أول', qty: 50 }, { sku: 'B2', description: 'صنف ثانٍ', qty: 20 }],
};

test('🏅 البوابة: تصريح مطابق لإذن معتمَد يمرّ', () => {
  const v = gateVerdict(
    { header: { driverId: '123456' }, lines: [{ sku: 'A1', qty: 50 }, { sku: 'B2', qty: 20 }] },
    DN_APPROVED
  );
  assert.equal(v.ok, true);
  assert.deepEqual(v.problems, []);
});

test('🏅 البوابة: لا خروج بلا إذن', () => {
  const v = gateVerdict({ lines: [{ sku: 'A1', qty: 5 }] }, null);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /لا خروج بلا سند/);
});

test('🏅 البوابة: لا خروج على إذن لم يُعتمد', () => {
  const v = gateVerdict({ lines: [{ sku: 'A1', qty: 50 }] }, { ...DN_APPROVED, state: 'submitted' });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /لم يُعتمد/.test(p)));
});

test('🏅 البوابة: كمية تتجاوز المأذون به تُمنع', () => {
  const v = gateVerdict({ lines: [{ sku: 'A1', description: 'صنف أول', qty: 80 }] }, DN_APPROVED);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /يخرج 80 والمأذون به 50/.test(p)));
});

test('🏅 البوابة: صنف خارج الإذن يُمنع — أخطر تسريب', () => {
  const v = gateVerdict({ lines: [{ sku: 'Z9', description: 'صنف مهرَّب', qty: 5 }] }, DN_APPROVED);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /لا وجود له في إذن التسليم/.test(p)));
});

test('🏅 البوابة: الخروج الجزئي يُنبَّه ولا يُمنع', () => {
  const v = gateVerdict(
    { header: { driverId: '1' }, lines: [{ sku: 'A1', description: 'صنف أول', qty: 30 }] },
    DN_APPROVED
  );
  assert.equal(v.ok, true, 'الجزئي مشروع — قد تُشحن على دفعتين');
  assert.ok(v.warnings.some((w) => /خروج جزئي/.test(w)));
});

test('🏅 البوابة: بلا بطاقة سائق تنبيه لا منع', () => {
  const v = gateVerdict({ header: {}, lines: [{ sku: 'A1', qty: 50 }] }, DN_APPROVED);
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => /بطاقة السائق/.test(w)));
});

// ── مخطّطات F3 ──

test('مخطّطات F3 الخمسة مسجّلة بأدوارها وتوقيعاتها', () => {
  for (const t of ['PUTAWAY', 'PICK', 'PACK', 'DN', 'GP']) {
    const s = getSchema(t);
    assert.ok(s, `مخطّط ${t} غير مسجّل`);
    assert.equal(s.type, t);
    assert.ok(s.roles.create.length && s.roles.approve.length && s.roles.complete.length);
    assert.ok(s.sections.some((sec) => sec.kind === 'table'));
    assert.equal(s.signatures.length, 3, `${t}: خانات التوقيع ثلاث كما في الورق`);
    assert.ok(typeof s.warnings === 'function');
  }
  // الخارطة تُشتقّ ready من السجلّ، فتساويهما هو حارس الانحراف.
  assert.equal(GOVERNED_FORMS.filter((f) => f.ready).length, readyTypes().length);
});

test('🏅 اعتماد تصريح البوابة لضابط البوابة والمدير — لا لأمين المخزن', () => {
  const gp = getSchema('GP');
  assert.ok(gp.roles.approve.includes('gate_officer'));
  assert.ok(!gp.roles.approve.includes('storekeeper'), 'من جهّز الشحنة لا يُصرّح لها');
  assert.ok(gp.roles.create.includes('storekeeper'), 'لكنه يُعدّها');
});

test('PICK: الفرق والقيمة محسوبان، والتحذيرات مسبَّبة', () => {
  assert.equal(lineShortage({ qtyRequested: 50, qtyPicked: 48 }), -2);
  assert.equal(lineValue({ qtyPicked: 10, unitPrice: 5 }), 50);
  assert.equal(orderValue([{ qtyPicked: 10, unitPrice: 5 }, { qtyPicked: 2, unitPrice: 25 }]), 100);
  assert.ok(pickWarnings({ lines: [{ qtyRequested: 50, qtyPicked: 48, expiry: '2026-09-01' }] }).some((x) => /أقلّ من المطلوب/.test(x)));
  assert.ok(pickWarnings({ lines: [{ qtyRequested: 10, qtyPicked: 10 }] }).some((x) => /بلا تاريخ صلاحية/.test(x)));
});

test('PACK: عدد الطرود يعدّ المميّز لا الأسطر', () => {
  assert.equal(cartonCount([{ cartonNo: 'C1' }, { cartonNo: 'C1' }, { cartonNo: 'C2' }]), 2);
  assert.equal(cartonCount([{ cartonNo: '' }, {}]), 0);
  const w = packWarnings({ lines: [{ qty: 5, cartonNo: '', weight: 0 }] });
  assert.ok(w.some((x) => /بلا رقم طرد/.test(x)));
  assert.ok(w.some((x) => /بلا وزن/.test(x)));
});

test('PUTAWAY و DN و GP: تحذيرات الموقع والتتبّع والسند', () => {
  assert.ok(putawayWarnings({ lines: [{ qty: 5, bin: '', expiry: '' }] }).some((x) => /بلا موقع/.test(x)));
  assert.ok(putawayWarnings({ lines: [{ qty: 5, bin: 'A-01', expiry: '' }] }).some((x) => /FEFO/.test(x)));
  assert.ok(dnWarnings({ header: {}, lines: [{ qty: 5 }] }).some((x) => /السائق ولوحة المركبة/.test(x)));
  assert.ok(gateWarnings({ header: {}, lines: [] }).some((x) => /لا مستند مرجعي/.test(x)));
  assert.ok(gateWarnings({ header: { dnRef: 'DN-1' }, lines: [] }).some((x) => /بطاقة السائق/.test(x)));
});

// ═══════════ F4: المرتجعات والجرد والمالية ═══════════

test('السلاسل الأربع: المرتجعات والتسوية قصيرتان مستقلّتان', () => {
  assert.deepEqual(RETURN_CHAIN, ['RET', 'CN']);
  assert.deepEqual(COUNT_CHAIN, ['CC', 'ADJ']);
  assert.equal(nextInChain('RET'), 'CN');
  assert.equal(nextInChain('CN'), null);
  assert.equal(nextInChain('CC'), 'ADJ');
  assert.equal(nextInChain('ADJ'), null);
  assert.equal(chainFor('CN'), RETURN_CHAIN);
  assert.equal(chainFor('ADJ'), COUNT_CHAIN);
  assert.equal(chainFor('DMG'), null, 'التالف مستندٌ مفردٌ بلا سلسلة');
});

test('الاشتقاق RET ← CN ينقل الكمية والسعر للخصم ويملأ مرجع المرتجع', () => {
  const ret = {
    id: 'r1', type: 'RET', number: 'RET-2026-0001', state: 'approved',
    header: { returningBranch: 'فرع بنغازي' },
    lines: [{ sku: 'A1', description: 'صنف أول', qty: 5, unitPrice: 10, reason: 'تالف' }],
    links: {},
  };
  const cn = deriveDocument(ret);
  assert.equal(cn.type, 'CN');
  assert.equal(cn.lines[0].qty, 5);
  assert.equal(cn.lines[0].unitPrice, 10);
  assert.equal(cn.header.returnRef, 'RET-2026-0001');
  assert.equal(cn.header.beneficiary, 'فرع بنغازي');
});

test('الاشتقاق CC ← ADJ: العدّ الثاني يصير الفعلي والدفتري يبقى', () => {
  const cc = {
    id: 'c1', type: 'CC', number: 'CC-2026-0001', state: 'approved',
    header: { zone: 'A-رف3' },
    lines: [{ sku: 'A1', description: 'صنف أول', bookQty: 100, count1: 95, count2: 96, unitPrice: 5 }],
    links: {},
  };
  const adj = deriveDocument(cc);
  assert.equal(adj.type, 'ADJ');
  assert.equal(adj.lines[0].bookQty, 100);
  assert.equal(adj.lines[0].actualQty, 96, 'العدّ الثاني المؤكَّد هو الفعلي');
  assert.equal(adj.header.cycleCountRef, 'CC-2026-0001');
});

// ── 🔒 حارس التسوية ──

const CC_APPROVED = {
  id: 'c1', type: 'CC', number: 'CC-2026-0001', state: 'approved',
  lines: [{ sku: 'A1', bookQty: 100, count2: 96 }],
};

test('🔒 التسوية: سند مطابق لجردٍ مصادَق يمرّ', () => {
  const v = adjustmentVerdict(
    { lines: [{ sku: 'A1', description: 'صنف', bookQty: 100, actualQty: 96, notes: 'عجز جرد' }] },
    CC_APPROVED
  );
  assert.equal(v.ok, true);
  assert.deepEqual(v.problems, []);
});

test('🔒 التسوية: لا تسوية بلا محضر جرد', () => {
  const v = adjustmentVerdict({ lines: [{ sku: 'A1', bookQty: 100, actualQty: 96, notes: 'x' }] }, null);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /عدٍّ موثَّق/);
});

test('🔒 التسوية: لا تسوية على جردٍ لم يُصادَق', () => {
  const v = adjustmentVerdict(
    { lines: [{ sku: 'A1', bookQty: 100, actualQty: 96, notes: 'x' }] },
    { ...CC_APPROVED, state: 'submitted' }
  );
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /لم يُصادَق/.test(p)));
});

test('🔒 التسوية: فرقٌ بلا سبب يُمنع، وبلا فرق يُنبَّه', () => {
  const noReason = adjustmentVerdict({ lines: [{ sku: 'A1', description: 'صنف', bookQty: 100, actualQty: 90 }] }, CC_APPROVED);
  assert.equal(noReason.ok, false);
  assert.ok(noReason.problems.some((p) => /بلا سبب مكتوب/.test(p)));

  const zeroVar = adjustmentVerdict({ lines: [{ sku: 'A1', description: 'صنف', bookQty: 100, actualQty: 100 }] }, CC_APPROVED);
  assert.equal(zeroVar.ok, true, 'لا فرق ⇒ تنبيه لا منع');
  assert.ok(zeroVar.warnings.some((w) => /لا شيء يُسوّى/.test(w)));
});

// ── ⚖️ حارس الإشعار الدائن ──

const RET_APPROVED = {
  id: 'r1', type: 'RET', number: 'RET-2026-0001', state: 'approved',
  lines: [{ sku: 'A1', description: 'صنف أول', qty: 5 }, { sku: 'B2', description: 'صنف ثانٍ', qty: 3 }],
};

test('⚖️ الإشعار الدائن: مطابق لمرتجعٍ معتمَد يمرّ', () => {
  const v = creditNoteVerdict({ lines: [{ sku: 'A1', qty: 5 }, { sku: 'B2', qty: 3 }] }, RET_APPROVED);
  assert.equal(v.ok, true);
});

test('⚖️ الإشعار الدائن: لا خصم بلا مرتجع', () => {
  const v = creditNoteVerdict({ lines: [{ sku: 'A1', qty: 5 }] }, null);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /مرتجعٍ معتمَد/);
});

test('⚖️ الإشعار الدائن: خصمٌ يتجاوز المُرجَع يُمنع', () => {
  const v = creditNoteVerdict({ lines: [{ sku: 'A1', description: 'صنف أول', qty: 9 }] }, RET_APPROVED);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /يُخصَم 9 والمُرجَع 5/.test(p)));
});

test('⚖️ الإشعار الدائن: خصمُ صنفٍ خارج المرتجع يُمنع', () => {
  const v = creditNoteVerdict({ lines: [{ sku: 'Z9', description: 'صنف غريب', qty: 1 }] }, RET_APPROVED);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /لا وجود له في المرتجع/.test(p)));
});

// ── مخطّطات F4 ──

test('مخطّطات F4 الخمسة مسجّلة — والمجموعة صارت 14', () => {
  for (const t of ['RET', 'DMG', 'CC', 'ADJ', 'CN']) {
    const s = getSchema(t);
    assert.ok(s, `مخطّط ${t} غير مسجّل`);
    assert.equal(s.type, t);
    assert.ok(s.roles.create.length && s.roles.approve.length && s.roles.complete.length);
    assert.ok(s.sections.some((sec) => sec.kind === 'table'));
    assert.equal(s.signatures.length, 3);
    assert.ok(typeof s.warnings === 'function');
  }
  assert.equal(readyTypes().length, 14, 'أربعة عشر نموذجًا جاهزًا');
  assert.equal(GOVERNED_FORMS.filter((f) => f.ready).length, 14);
});

test('🔒 اعتماد سند التسوية للمالية والمدير — لا لمن أدخله', () => {
  const adj = getSchema('ADJ');
  assert.ok(adj.roles.approve.includes('finance_manager'));
  assert.ok(!adj.roles.approve.includes('inventory_auditor'), 'من أدخل التسوية لا يعتمدها');
  assert.ok(adj.roles.create.includes('inventory_auditor'));
});

test('RET و DMG: القيم محسوبة والتحذيرات مسبَّبة', () => {
  assert.equal(lineReturnValue({ qty: 5, unitPrice: 10 }), 50);
  assert.ok(returnWarnings({ header: {}, lines: [{ qty: 5 }] }).some((x) => /بلا سبب/.test(x)));
  assert.ok(returnWarnings({ header: {}, lines: [{ qty: 5, reason: 'ت' }] }).some((x) => /بلا إجراء/.test(x)));

  assert.equal(damageValue({ qty: 3, unitPrice: 20 }), 60);
  assert.equal(totalDamage([{ qty: 2, unitPrice: 10 }, { qty: 1, unitPrice: 5 }]), 25);
  assert.ok(damageWarnings({ header: {}, lines: [{ qty: 1, disposal: 'إتلاف' }] }).some((x) => /محضر إتلاف/.test(x)));
});

test('CC: الفرق من العدّ الثاني، والدقّة تُقاس من المعدود', () => {
  assert.equal(lineVariance({ bookQty: 100, count1: 95, count2: 96 }), -4, 'الفرق من الثاني المؤكَّد');
  assert.equal(lineVariance({ bookQty: 100, count1: 98 }), -2, 'بلا ثانٍ يقع على الأول');
  assert.equal(matchedCount([{ bookQty: 10, count2: 10 }, { bookQty: 5, count2: 4 }]), 1);
  // بندان معدودان أحدهما مطابق = 50%؛ وبندٌ لم يُعدّ لا يُحسب
  assert.equal(inventoryAccuracy([{ bookQty: 10, count2: 10 }, { bookQty: 5, count2: 4 }, { bookQty: 3 }]), 50);
  assert.equal(inventoryAccuracy([]), 0);
  assert.ok(cycleWarnings({ lines: [{ sku: 'A', bookQty: 10, count2: 8 }] }).some((x) => /بلا سبب/.test(x)));
});

test('ADJ: الأثر الصافي يفصل الزيادة عن النقصان', () => {
  const lines = [
    { sku: 'A', bookQty: 100, actualQty: 110, unitPrice: 5 }, // فائض +50
    { sku: 'B', bookQty: 50, actualQty: 30, unitPrice: 10 },  // عجز -200
  ];
  assert.equal(adjVariance(lines[0]), 10);
  assert.equal(totalIncrease(lines), 50);
  assert.equal(totalDecrease(lines), 200, 'النقصان قيمة موجبة');
  assert.equal(netImpact(lines), -150, 'الصافي = زيادة − نقصان');
  assert.ok(adjustmentWarnings({ header: {}, lines }).some((x) => /مرجع جرد/.test(x)));
});

test('CN: إجمالي الخصم محسوب والتحذيرات مسبَّبة', () => {
  assert.equal(creditTotal([{ qty: 5, unitPrice: 10 }, { qty: 2, unitPrice: 25 }]), 100);
  const w = creditWarnings({ header: {}, lines: [{ qty: 5, unitPrice: 0 }] });
  assert.ok(w.some((x) => /مرجع إشعار إرجاع/.test(x)));
  assert.ok(w.some((x) => /المستفيد/.test(x)));
  assert.ok(w.some((x) => /بلا سعر/.test(x)));
});
