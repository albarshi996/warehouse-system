/**
 * حارس التتبّع وتقارير 360° (SAP-14 · ف‑٣١ ف‑٣٢ ف‑٣٣) — قبل الواجهة.
 *
 * البوّابات: SR-66 ‹3885-3894› الأسئلة الثمانية · SR-67 ‹3899-3903›
 * الاتّجاهان · SR-64 الصنف 360° · SR-65 مؤشّرات المورّد الثلاثة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  traceMoves,
  traceAnswers,
  forwardTrace,
  reverseTrace,
  item360,
  supplier360,
} from './traceReports.js';

/** رحلةُ دفعةٍ كاملة: استلامٌ ← تخزين ← تسليمٌ لعميل ← مرتجعٌ جزئيّ. */
const MOVES = [
  { id: 'm1', docId: 'g1', docType: 'GRN', docNumber: 'GRN-1', sku: 'ITM-1', batch: 'B1', qty: 100, unitCost: 10, to: 'RECEIVING', supplier: 'أكمي', postedAtDay: '2026-08-01' },
  { id: 'm2', docId: 'p1', docType: 'PUTAWAY', docNumber: 'PW-1', sku: 'ITM-1', batch: 'B1', qty: 100, from: 'RECEIVING', to: 'E5', postedAtDay: '2026-08-02' },
  { id: 'm3', docId: 'd1', docType: 'DN', docNumber: 'DN-1', sku: 'ITM-1', batch: 'B1', qty: 30, unitCost: 15, from: 'E5', customer: 'بقالة ليبيا', postedAtDay: '2026-08-05' },
  { id: 'm4', docId: 'r1', docType: 'RET', docNumber: 'RET-1', sku: 'ITM-1', batch: 'B1', qty: 5, to: 'RETURNS', customer: 'بقالة ليبيا', postedAtDay: '2026-08-07' },
  { id: 'm5', docType: 'GRN', docNumber: 'GRN-9', sku: 'OTHER', batch: 'X', qty: 1, postedAtDay: '2026-08-01' },
];

test('★ التتبّع يفلتر بالصنف والدفعة ويرتّب زمنيًّا', () => {
  const rows = traceMoves(MOVES, { sku: 'itm-1', batch: 'b1' });
  assert.equal(rows.length, 4, 'حركات الدفعة وحدها');
  assert.deepEqual(rows.map((r) => r.docNumber), ['GRN-1', 'PW-1', 'DN-1', 'RET-1']);
});

test('★★ SR-66: الأسئلة الثمانية مُجابةٌ كلّها من الدفتر — بلا مجموعةٍ تُخترع', () => {
  const t = traceAnswers(MOVES, { sku: 'ITM-1', batch: 'B1' });
  assert.equal(t.answers.fromVendor, 'أكمي'); // ١ من أيّ مورّد
  assert.equal(t.answers.byReceipt, 'GRN-1'); // ٢-٣ بأيّ أمرٍ واستلام
  assert.equal(t.answers.byBatch, 'B1'); // ٤ بأيّ دفعة
  assert.match(t.answers.storedAt, /E5/); // ٥ في أيّ موقع
  assert.match(t.answers.toCustomer, /بقالة ليبيا/); // ٦ إلى أيّ عميل
  assert.equal(t.answers.cameBack, true); // ٧ هل عاد
  assert.equal(t.answers.returnedToVendor, false); // ٨ هل أُرجع للمورّد
});

test('★★ SR-67: الاتّجاهان رحلةٌ واحدة بقراءتين — لا بياناتٍ ثانية ولا منطقٍ ثانٍ', () => {
  const key = { sku: 'ITM-1', batch: 'B1' };
  const fwd = forwardTrace(MOVES, key);
  const rev = reverseTrace(MOVES, key);

  assert.equal(fwd.direction, 'forward');
  assert.equal(fwd.steps[0].docNumber, 'GRN-1', 'أمامًا يبدأ من الاستلام');
  assert.equal(fwd.steps[fwd.steps.length - 1].docNumber, 'RET-1', 'وينتهي بآخر ما جرى');
  // والخطوات كلّها لا المنشأ والمصير وحدهما — التخزين خطوةٌ في الرحلة.
  assert.deepEqual(fwd.steps.map((s) => s.docNumber), ['GRN-1', 'PW-1', 'DN-1', 'RET-1']);

  assert.equal(rev.direction, 'reverse');
  assert.deepEqual(rev.steps.map((s) => s.docNumber), ['RET-1', 'DN-1', 'PW-1', 'GRN-1']);
  assert.equal(rev.steps[rev.steps.length - 1].docNumber, 'GRN-1', 'خلفًا ينتهي عند المنشأ');
});

test('«لا يُعرف» صادقٌ ولا يُخترع جواب', () => {
  const t = traceAnswers([], { sku: 'GHOST' });
  assert.equal(t.answers.fromVendor, 'لا يُعرف');
  assert.equal(t.answers.toCustomer, 'لم يخرج بعد');
  assert.equal(t.answers.cameBack, false);
});

test('★★ SR-64: الصنف 360° بأقسامه — مخزونٌ بمستودعه وموقعه ودفعته', () => {
  const view = item360('ITM-1', {
    items: [{ sku: 'ITM-1', nameAr: 'كريم' }],
    balances: [
      { sku: 'ITM-1', warehouse: 'E5', bin: 'A-01', batch: 'B1', qty: 65, qtyReserved: 10 },
      { sku: 'ITM-1', warehouse: 'E2', bin: '', batch: 'B1', qty: 20, qtyReserved: 0 },
    ],
    moves: MOVES,
    catalog: [{ partnerType: 'supplier', partnerCode: 'ACME' }, { partnerType: 'customer', partnerCode: 'C1' }],
    openRows: { ordered: 40, rows: [{ docNumber: 'PO-2' }] },
  });
  assert.equal(view.item.nameAr, 'كريم');
  assert.equal(view.byWarehouse.length, 2);
  assert.equal(view.byWarehouse.find((r) => r.key === 'E5').qty, 65);
  assert.equal(view.byBatch[0].key, 'B1');
  assert.equal(view.reserved, 10);
  assert.equal(view.ordered, 40);
  assert.equal(view.suppliers.length, 1);
  assert.equal(view.customers.length, 1);
  assert.equal(view.lastPurchasePrices[0].price, 10);
  assert.equal(view.lastSalePrices[0].price, 15);
  assert.equal(view.returns.length, 1, 'المرتجع يظهر قسمًا');
});

test('★★ SR-65: مؤشّرات المورّد الثلاثة محسوبةٌ من المستندات لا مقدَّرة', () => {
  const documents = [
    { id: 'po1', type: 'PO', number: 'PO-1', state: 'approved', header: { supplierCode: 'ACME', issueDate: '2026-08-01' }, lines: [] },
    { id: 'po2', type: 'PO', number: 'PO-2', state: 'approved', header: { supplierCode: 'ACME', issueDate: '2026-08-01' }, lines: [] },
    { id: 'g1', type: 'GRN', number: 'GRN-1', state: 'done', header: { supplierCode: 'ACME', poRef: 'PO-1', issueDate: '2026-08-08' }, lines: [{ qtyReceived: 100, qtyRejected: 5 }] },
  ];
  const s = supplier360('acme', { documents });
  assert.equal(s.metrics.avgLeadDays, 7, 'من أمر الشراء إلى استلامه');
  assert.equal(s.metrics.rejectionRate, 5, '٥ من ١٠٠ = ٥٪');
  assert.equal(s.metrics.fulfilmentRate, 50, 'أمرٌ من اثنين استُلم');
  assert.equal(s.metrics.orderCount, 2);
});

test('مورّدٌ بلا مستندات: مؤشّراتٌ null لا أصفارٌ كاذبة', () => {
  const s = supplier360('GHOST', { documents: [] });
  assert.equal(s.metrics.avgLeadDays, null);
  assert.equal(s.metrics.rejectionRate, null);
  assert.equal(s.metrics.fulfilmentRate, null);
});
