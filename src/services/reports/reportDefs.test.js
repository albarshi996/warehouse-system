/**
 * حارس تعريفات التقارير (ر‑١ · ر‑٢).
 *
 * الحارس الجوهريّ: **كلّ تعريفٍ في السجلّ سليمٌ ويعمل على بياناتٍ فارغة.**
 * فتقريرٌ يرمي أمام المستخدم أسوأ من تقريرٍ لا يوجد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { REPORTS, getReport, reportIds, STOCK_REPORTS, ACCOUNT_REPORTS } from './index.js';
import { definitionProblems, runReport, canOpen } from './reportEngine.js';
import { AGING_BUCKETS } from '../ledger/partnerLedger.js';

const EMPTY = { moves: [], balances: [], documents: [], items: [], ledger: [], today: '2026-08-11' };

/* ═══════════ ١. سلامة السجلّ ═══════════ */

test('★★ كلّ تعريفٍ في السجلّ سليم', () => {
  for (const def of Object.values(REPORTS)) {
    assert.deepEqual(definitionProblems(def), [], `${def.id} معطوب`);
  }
});

test('★★ وكلٌّ منها يعمل على بياناتٍ فارغة ولا يرمي', () => {
  // تقريرٌ يرمي أمام المستخدم أسوأ من تقريرٍ لا يوجد.
  for (const def of Object.values(REPORTS)) {
    const r = runReport(def, EMPTY, {}, { role: 'admin' });
    assert.equal(r.ok, true, `${def.id}: ${r.message}`);
    assert.equal(r.empty, true);
    assert.equal(r.message, 'لا بيانات.');
  }
});

test('★ الدفعتان ستٌّ وستٌّ كما في الخطة', () => {
  assert.equal(STOCK_REPORTS.length, 6, 'ر‑١: تقارير المخزون الستّة');
  assert.equal(ACCOUNT_REPORTS.length, 6, 'ر‑٢: تقارير الحسابات الستّة');
  assert.equal(reportIds().length, 12);
});

test('★ وأوّل تقارير المخزون كشف حركة الصنف (نصّ الخطة)', () => {
  assert.equal(STOCK_REPORTS[0].id, 'item-movement');
});

test('getReport: المعروف يُعاد والمجهول null', () => {
  assert.ok(getReport('item-movement'));
  assert.equal(getReport('لا يوجد'), null);
});

/* ═══════════ ٢. الحصر بالأدوار ═══════════ */

test('★★ لا تقرير مباحٌ للمشاهد — والرقم بلا صاحبٍ لا يُعرض', () => {
  for (const def of Object.values(REPORTS)) {
    assert.equal(canOpen(def, 'viewer'), false, `${def.id} مباحٌ للمشاهد`);
    assert.equal(canOpen(def, 'admin'), true);
  }
});

test('★ تقارير الحسابات محصورةٌ بالمالي والمديرَين — لا بأمين المخزن', () => {
  const finance = ['supplier-statement', 'aging'];
  for (const id of finance) {
    assert.equal(canOpen(getReport(id), 'finance_manager'), true);
    assert.equal(canOpen(getReport(id), 'storekeeper'), false, `${id} يفتحه أمين المخزن`);
  }
});

/* ═══════════ ٣. كشف حركة الصنف — الرصيد المتراكم ═══════════ */

const MOVES = [
  { id: 'm1', sku: 'A', qty: 100, from: null, to: 'MAIN', date: '2026-08-01', docNumber: 'GRN-1', value: 1000 },
  { id: 'm2', sku: 'A', qty: 30, from: 'MAIN', to: null, date: '2026-08-05', docNumber: 'DN-1', value: 300 },
  { id: 'm3', sku: 'A', qty: 20, from: 'MAIN', to: 'B2', date: '2026-08-07', docNumber: 'TRN-1', value: 200 },
];

test('★★ الرصيد المتراكم يُحسب على المعروض بترتيبه الزمنيّ', () => {
  const r = runReport(getReport('item-movement'), { moves: MOVES }, { warehouse: 'MAIN' }, { role: 'admin' });
  assert.deepEqual(r.rows.map((x) => x.running), [100, 70, 50]);
  assert.equal(r.totals.inQty, 100);
  assert.equal(r.totals.outQty, 50);
});

test('★ ومن فلتر موقعًا آخر رأى رصيده فيه لا رصيد غيره', () => {
  const r = runReport(getReport('item-movement'), { moves: MOVES }, { warehouse: 'B2' }, { role: 'admin' });
  assert.equal(r.rows.length, 1, 'حركةٌ واحدة تخصّ B2');
  assert.equal(r.rows[0].running, 20);
});

test('★ الحركات تُرتَّب زمنيًّا مهما ورد ترتيبها', () => {
  const shuffled = [MOVES[2], MOVES[0], MOVES[1]];
  const r = runReport(getReport('item-movement'), { moves: shuffled }, { warehouse: 'MAIN' }, { role: 'admin' });
  assert.deepEqual(r.rows.map((x) => x.date), ['2026-08-01', '2026-08-05', '2026-08-07']);
});

/* ═══════════ ٤. أرصدة المواقع ═══════════ */

test('★ المتاح = الكمّيّة − المحجوز، والصفريّ لا يُعرض', () => {
  const balances = [
    { sku: 'A', warehouse: 'MAIN', batch: 'B1', qty: 100, reserved: 30, unitCost: 10 },
    { sku: 'B', warehouse: 'MAIN', batch: '', qty: 0, reserved: 0, unitCost: 5 },
  ];
  const r = runReport(getReport('location-balances'), { balances }, {}, { role: 'admin' });
  assert.equal(r.rows.length, 1, 'الصفريّ لا يشغل سطرًا');
  assert.equal(r.rows[0].available, 70);
  assert.equal(r.totals.value, 1000);
});

/* ═══════════ ٥. الصلاحيات ═══════════ */

test('★★ الأقرب انتهاءً أوّلًا، والمنتهي يُعرض بأيّامٍ سالبة', () => {
  const balances = [
    { sku: 'A', warehouse: 'MAIN', batch: 'B1', expiry: '2026-09-01', qty: 10, unitCost: 1 },
    { sku: 'B', warehouse: 'MAIN', batch: 'B2', expiry: '2026-08-01', qty: 5, unitCost: 2 },
  ];
  const r = runReport(getReport('expiry-batches'), { balances, today: '2026-08-11' }, {}, { role: 'admin' });
  assert.equal(r.rows[0].batch, 'B2', 'المنتهي أوّلًا');
  assert.equal(r.rows[0].daysLeft, -10, 'دفعةٌ انتهت وما زالت على الرفّ');
  assert.equal(r.rows[1].daysLeft, 21);
});

/* ═══════════ ٦. الحسابات ═══════════ */

const LEDGER = [
  { id: 'e1', party: 'customer', partyCode: 'C-1', partyName: 'بقالة', docNumber: 'INV-1', labelAr: 'فاتورة بيع', date: '2026-08-01', dueDate: '2026-08-01', direction: 'debit', amount: 1000, delta: 1000 },
  { id: 'e2', party: 'customer', partyCode: 'C-1', partyName: 'بقالة', docNumber: 'RCP-1', labelAr: 'سند قبض', date: '2026-08-05', direction: 'credit', amount: 400, delta: -400 },
  { id: 'e3', party: 'supplier', partyCode: 'S-1', partyName: 'مورّد', docNumber: 'GRN-1', labelAr: 'استلام', date: '2026-08-02', direction: 'debit', amount: 700, delta: 700 },
];

test('★★ كشف الحساب يفصل المدين عن الدائن ويحمل الرصيد المتراكم', () => {
  const r = runReport(getReport('customer-statement'), { ledger: LEDGER }, {}, { role: 'admin' });
  assert.equal(r.rows.length, 2, 'وسطر المورّد لا يظهر في كشف العملاء');
  assert.equal(r.rows[0].debit, 1000);
  assert.equal(r.rows[0].credit, 0);
  assert.equal(r.rows[1].credit, 400);
  assert.equal(r.rows[1].balance, 600);
  assert.equal(r.totals.debit, 1000);
  assert.equal(r.totals.credit, 400);
});

test('★ وكشف المورّد يفصل طرفه', () => {
  const r = runReport(getReport('supplier-statement'), { ledger: LEDGER }, {}, { role: 'admin' });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].partyName, 'مورّد');
});

test('★★ أعمار الديون بخمس شرائح، والمقاصّة بالأقدم أوّلًا', () => {
  const r = runReport(getReport('aging'), { ledger: LEDGER, today: '2026-08-11' }, { party: 'customer' }, { role: 'admin' });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].total, 600, '١٠٠٠ ناقص ٤٠٠ قبض');
  for (const b of AGING_BUCKETS) {
    assert.ok(b.key in r.rows[0], `شريحة ${b.key} مفقودة من الأعمدة`);
  }
});

test('★ وسم السعر اليدويّ (م٣-ج) يظهر في تقرير المبيعات', () => {
  const documents = [
    {
      type: 'INV', number: 'INV-1', state: 'done', createdByName: 'أحمد',
      header: { customer: 'بقالة', invoiceDate: '2026-08-01' },
      lines: [
        { sku: 'A', qty: 10, unitPrice: 8, pricing: { manualPrice: true } },
        { sku: 'B', qty: 5, unitPrice: 10 },
      ],
    },
  ];
  const r = runReport(getReport('sales-by-customer'), { documents }, {}, { role: 'admin' });
  assert.equal(r.rows[0].manualPrice, 'نعم');
  assert.equal(r.rows[1].manualPrice, '');
  assert.equal(r.totals.net, 130);
});

test('★★ المشتريات من الاستلامات المنجَزة لا من أوامر الشراء — الأمر نيّةٌ والاستلام واقعة', () => {
  const documents = [
    { type: 'PO', number: 'PO-1', state: 'done', header: { supplier: 'م' }, lines: [{ sku: 'A', qty: 100, unitPrice: 10 }] },
    { type: 'GRN', number: 'GRN-1', state: 'done', header: { supplier: 'م', receivedAt: '2026-08-02' }, lines: [{ sku: 'A', qtyReceived: 100, qtyAccepted: 90, unitCost: 10 }] },
    { type: 'GRN', number: 'GRN-2', state: 'approved', header: { supplier: 'م', receivedAt: '2026-08-03' }, lines: [{ sku: 'A', qtyAccepted: 50, unitCost: 10 }] },
  ];
  const r = runReport(getReport('purchases-by-supplier'), { documents }, {}, { role: 'admin' });
  assert.equal(r.rows.length, 1, 'أمر الشراء لا يُحسب، والاستلام غير المنجَز لا يُحسب');
  assert.equal(r.rows[0].qty, 90, 'والمرفوض لا يُشترى');
  assert.equal(r.totals.value, 900);
});
