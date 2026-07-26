/**
 * اختبارات دفتر الحركات — المنطق الخالص وحده (بلا Firestore).
 *
 * تُثبت الضمانات التي يقوم عليها المبدأ الحاكم: التوازن (مواقع النظام تُفرَّغ)،
 * والاتجاه (الكمية موجبة أبدًا)، ومنع الازدواج (معرّف حتميّ)، والحجز (المتاح =
 * الموجود ناقص المحجوز)، وتخصيص FEFO (الأقرب انتهاءً أولًا).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSystemLocation,
  isReservedCode,
  locationLabel,
  zeroingLocations,
  stuckBalances,
  EXTERNAL_LABEL,
} from './locations.js';
import {
  movesStock,
  needsWarehouse,
  warehouseRequiringTypes,
  POSTING_STATE,
} from './postingRules.js';
import { buildMoves, balanceDeltas, canPost, moveId, previewImpact } from './movements.js';
import {
  availableQty,
  totalAvailable,
  allocateFefo,
  allocateDocument,
  reservationDeltas,
  fillRate,
} from './reservations.js';
import { buildLedgerCard, summarizeMovement } from './ledgerCard.js';

/* ───────────────── المواقع ───────────────── */

test('مواقع النظام معروفة والرموز محجوزة', () => {
  assert.equal(isSystemLocation('RECEIVING'), true);
  assert.equal(isSystemLocation('receiving'), true, 'غير حسّاس لحالة الأحرف');
  assert.equal(isSystemLocation('E5'), false, 'مستودع حقيقي ليس موقع نظام');
  assert.equal(isReservedCode('TRANSIT'), true);
  assert.equal(isReservedCode(''), false);
});

test('تسمية الموقع: نظام، حقيقي، وخارج المنشأة', () => {
  assert.match(locationLabel('TRANSIT'), /مخزن النقل/);
  assert.equal(locationLabel('E5'), 'E5');
  assert.equal(locationLabel(null), EXTERNAL_LABEL);
  assert.equal(locationLabel(''), EXTERNAL_LABEL);
});

test('المواقع الواجب تصفيرها تشمل الاستلام والتجهيز والنقل، لا الإتلاف', () => {
  const z = zeroingLocations();
  assert.ok(z.includes('RECEIVING'));
  assert.ok(z.includes('STAGING'));
  assert.ok(z.includes('TRANSIT'));
  assert.ok(!z.includes('SCRAP'), 'الإتلاف يحتفظ برصيده كأثر للقيمة المشطوبة');
});

test('stuckBalances يكشف العالق في مواقع التصفير فقط', () => {
  const rows = [
    { sku: 'A', warehouse: 'TRANSIT', qty: 5 }, // عالق
    { sku: 'B', warehouse: 'RECEIVING', qty: 0 }, // صفر ⇒ سليم
    { sku: 'C', warehouse: 'E5', qty: 99 }, // مستودع حقيقي ⇒ ليس عالقًا
    { sku: 'D', warehouse: 'SCRAP', qty: 3 }, // إتلاف ⇒ لا يُصفَّر
  ];
  const stuck = stuckBalances(rows);
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].sku, 'A');
  assert.ok(stuck[0].hint.length > 0, 'يحمل تلميحًا يشرح سبب العلوق');
});

/* ───────────────── قواعد القيد ───────────────── */

test('الأنواع المحرّكة للمخزون وحدها لها قواعد قيد', () => {
  assert.equal(movesStock('GRN'), true);
  assert.equal(movesStock('PICK'), true);
  assert.equal(movesStock('ADJ'), true);
  assert.equal(movesStock('PR'), false, 'طلب الشراء التزامٌ لا حركة');
  assert.equal(movesStock('PO'), false);
  assert.equal(movesStock('PACK'), false, 'إعادة تغليف داخل نفس الموقع');
  assert.equal(movesStock('GP'), false, 'رقابة بوابة لا حركة');
  assert.equal(movesStock('CN'), false, 'أثر مالي بحت');
  assert.equal(movesStock('CC'), false, 'عدٌّ لا يغيّر');
});

test('الأنواع التي تحتاج حقل مستودع (بما فيها النقل بمستودعَيه)', () => {
  const need = warehouseRequiringTypes().sort();
  assert.deepEqual(need, ['ADJ', 'DMG', 'PICK', 'PUTAWAY', 'TRC', 'TRN']);
  assert.equal(needsWarehouse('GRN'), false, 'GRN يدخل ساحة الاستلام النظامية');
  assert.equal(needsWarehouse('DN'), false, 'DN يخرج من التجهيز النظامي');
  assert.equal(needsWarehouse('TRN'), true, 'مستند النقل يخرج من مستودع المصدر');
  assert.equal(needsWarehouse('TRC'), true, 'استلام النقل يدخل مستودع الوجهة');
});

test('POSTING_STATE هو الإنجاز لا الاعتماد', () => {
  assert.equal(POSTING_STATE, 'done');
});

/* ───────────────── بناء الحركات ───────────────── */

const grnDoc = {
  id: 'DOC1',
  type: 'GRN',
  number: 'GRN-2026-0001',
  state: 'done',
  header: { supplier: 'مورّد' },
  lines: [
    { sku: 'A', description: 'صنف أ', qtyReceived: 10, unitPrice: 2, expiryDate: '2026-12-01', batch: 'B1' },
    { sku: 'B', description: 'صنف ب', qtyReceived: 0, unitPrice: 5 }, // بلا كمية ⇒ يُتجاهل
  ],
};

test('GRN يبني حركة واحدة من الخارج إلى ساحة الاستلام', () => {
  const { moves, problems } = buildMoves(grnDoc);
  assert.equal(problems.length, 0);
  assert.equal(moves.length, 1, 'البند بلا كمية لا يُقيَّد');
  const m = moves[0];
  assert.equal(m.from, null, 'من خارج المنشأة');
  assert.equal(m.to, 'RECEIVING');
  assert.equal(m.qty, 10);
  assert.equal(m.value, 20);
  assert.equal(m.id, moveId('DOC1', 0));
  assert.equal(m.expiry, '2026-12-01', 'قرأ الصلاحية من expiryDate لا expiry');
});

test('معرّف الحركة حتميّ فيمنع الازدواج', () => {
  assert.equal(moveId('DOC1', 0), moveId('DOC1', 0));
  assert.notEqual(moveId('DOC1', 0), moveId('DOC1', 1));
  assert.equal(moveId('DOC1', 5), 'DOC1__005');
});

test('PUTAWAY يقرأ المستودع من الرأس، ويرفض غيابه', () => {
  const ok = buildMoves({
    id: 'P1', type: 'PUTAWAY', state: 'done',
    header: { warehouse: 'E5' },
    lines: [{ sku: 'A', description: 'أ', qty: 4, unitPrice: 1 }],
  });
  assert.equal(ok.problems.length, 0);
  assert.equal(ok.moves[0].from, 'RECEIVING');
  assert.equal(ok.moves[0].to, 'E5');

  const missing = buildMoves({
    id: 'P2', type: 'PUTAWAY', state: 'done',
    header: {},
    lines: [{ sku: 'A', qty: 4 }],
  });
  assert.equal(missing.moves.length, 0);
  assert.match(missing.problems[0], /المستودع غير محدَّد/);
});

test('البند بلا هوية صنف يُرفض بسبب مكتوب', () => {
  const { moves, problems } = buildMoves({
    id: 'X', type: 'GRN', state: 'done', header: {},
    lines: [{ description: 'بلا كود', qtyReceived: 3, unitPrice: 1 }],
  });
  assert.equal(moves.length, 0);
  assert.match(problems[0], /لا كود ولا باركود/);
});

test('ADJ الموجب والسالب: الكمية موجبة والاتجاه ينعكس', () => {
  const doc = {
    id: 'ADJ1', type: 'ADJ', state: 'done',
    header: { warehouse: 'E5' },
    lines: [
      { sku: 'A', description: 'زيادة', bookQty: 10, actualQty: 13, unitPrice: 2 }, // +3
      { sku: 'B', description: 'عجز', bookQty: 8, actualQty: 5, unitPrice: 4 }, // -3
    ],
  };
  const { moves } = buildMoves(doc);
  assert.equal(moves.length, 2);

  const inc = moves.find((m) => m.sku === 'A');
  assert.equal(inc.qty, 3, 'الكمية موجبة');
  assert.equal(inc.from, 'ADJUSTMENT');
  assert.equal(inc.to, 'E5', 'الزيادة تدخل المستودع');

  const dec = moves.find((m) => m.sku === 'B');
  assert.equal(dec.qty, 3, 'الكمية موجبة رغم أن الفارق سالب');
  assert.equal(dec.from, 'E5', 'العجز يخرج من المستودع');
  assert.equal(dec.to, 'ADJUSTMENT');
});

/* ───────────────── التوازن ───────────────── */

test('التوازن: GRN ثم QC ثم PUTAWAY يُفرّغ ساحة الاستلام', () => {
  // 10 دخلت الاستلام، QC رفض 3 (للحجر)، PUTAWAY خزّن 7 المقبولة.
  const grn = balanceDeltas(buildMoves(grnDoc).moves).deltas;
  const receivingAfterGrn = grn.find((d) => d.warehouse === 'RECEIVING');
  assert.equal(receivingAfterGrn.delta, +10);

  const qc = balanceDeltas(
    buildMoves({
      id: 'QC1', type: 'QC', state: 'done', header: {},
      lines: [{ sku: 'A', description: 'أ', qtyRejected: 3, unitPrice: 2, expiry: '2026-12-01' }],
    }).moves
  ).deltas;
  const receivingByQc = qc.find((d) => d.warehouse === 'RECEIVING');
  const quarantine = qc.find((d) => d.warehouse === 'QUARANTINE');
  assert.equal(receivingByQc.delta, -3);
  assert.equal(quarantine.delta, +3);

  const putaway = balanceDeltas(
    buildMoves({
      id: 'PUT1', type: 'PUTAWAY', state: 'done', header: { warehouse: 'E5' },
      lines: [{ sku: 'A', description: 'أ', qty: 7, unitPrice: 2 }],
    }).moves
  ).deltas;
  const receivingByPut = putaway.find((d) => d.warehouse === 'RECEIVING');
  const shelf = putaway.find((d) => d.warehouse === 'E5');
  assert.equal(receivingByPut.delta, -7);
  assert.equal(shelf.delta, +7);

  // المحصّلة على الاستلام: +10 −3 −7 = 0. الساحة فرغت كما يجب.
  assert.equal(10 - 3 - 7, 0);
});

test('balanceDeltas يتجاهل الخارج ويجمع المتكرّر', () => {
  const moves = [
    { sku: 'A', barcode: '', nameAr: 'أ', batch: 'B1', expiry: '', unitCost: 1, from: null, to: 'RECEIVING', qty: 4 },
    { sku: 'A', barcode: '', nameAr: 'أ', batch: 'B1', expiry: '', unitCost: 1, from: null, to: 'RECEIVING', qty: 6 },
  ];
  const { deltas } = balanceDeltas(moves);
  assert.equal(deltas.length, 1, 'نفس المفتاح يُجمع في دلتا واحدة');
  assert.equal(deltas[0].delta, 10);
});

/* ───────────────── حارس القيد ───────────────── */

test('canPost يمنع القيد قبل الإنجاز وبعد القيد', () => {
  assert.equal(canPost({ id: 'D', type: 'GRN', state: 'approved' }).ok, false);
  assert.equal(canPost({ id: 'D', type: 'GRN', state: 'done' }).ok, true);
  assert.equal(canPost({ id: 'D', type: 'GRN', state: 'done', posted: true }).ok, false);
  assert.equal(canPost({ id: 'D', type: 'PR', state: 'done' }).ok, false, 'نوع بلا أثر');
});

test('previewImpact يجمع الحركات والقيمة والمشاكل', () => {
  const p = previewImpact(grnDoc);
  assert.equal(p.ok, true);
  assert.equal(p.totalQty, 10);
  assert.equal(p.totalValue, 20);
});

/* ───────────────── الحجز والتخصيص ───────────────── */

test('المتاح = الموجود ناقص المحجوز، ولا يقلّ عن صفر', () => {
  assert.equal(availableQty({ qty: 10, qtyReserved: 3 }), 7);
  assert.equal(availableQty({ qty: 5, qtyReserved: 9 }), 0, 'لا سالب');
  assert.equal(availableQty({ qty: 8 }), 8, 'بلا حجز = الكلّ متاح');
});

test('allocateFefo يخصّص من الأقرب انتهاءً أولًا', () => {
  const balances = [
    { id: 'A__E5__LATE', sku: 'A', warehouse: 'E5', batch: 'LATE', expiry: '2027-01-01', qty: 100, unitCost: 2 },
    { id: 'A__E5__SOON', sku: 'A', warehouse: 'E5', batch: 'SOON', expiry: '2026-03-01', qty: 5, unitCost: 2 },
  ];
  const plan = allocateFefo({ sku: 'A', qty: 8 }, balances);
  assert.equal(plan.ok, true);
  assert.equal(plan.allocations.length, 2);
  assert.equal(plan.allocations[0].batch, 'SOON', 'الأقرب انتهاءً أولًا');
  assert.equal(plan.allocations[0].qty, 5);
  assert.equal(plan.allocations[1].batch, 'LATE');
  assert.equal(plan.allocations[1].qty, 3);
});

test('allocateFefo يحترم الحجز القائم ويُظهر العجز', () => {
  const balances = [{ id: 'A__E5__B1', sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2026-06-01', qty: 10, qtyReserved: 8, unitCost: 1 }];
  const plan = allocateFefo({ sku: 'A', qty: 5 }, balances);
  assert.equal(plan.allocated, 2, 'المتاح 2 فقط رغم أن الموجود 10');
  assert.equal(plan.shortfall, 3);
  assert.equal(plan.ok, false);
});

test('allocateDocument يفصّل العجز صنفًا صنفًا (مصدر تقرير العجز)', () => {
  const balances = [{ id: 'A__E5__B1', sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2026-06-01', qty: 3, unitCost: 1 }];
  const doc = {
    header: { warehouse: 'E5' },
    lines: [
      { sku: 'A', description: 'متوفّر جزئيًّا', qty: 5 },
      { sku: 'Z', description: 'غير موجود', qty: 4 },
    ],
  };
  const result = allocateDocument(doc, balances);
  assert.equal(result.fullyAllocated, false);
  assert.equal(result.shortages.length, 2);
  assert.equal(result.totalRequested, 9);
  assert.equal(result.totalAllocated, 3);
});

test('reservationDeltas يعكس الإشارة للفكّ', () => {
  const allocs = [{ balanceId: 'A__E5__B1', sku: 'A', warehouse: 'E5', batch: 'B1', qty: 4 }];
  assert.equal(reservationDeltas(allocs, 1)[0].delta, 4);
  assert.equal(reservationDeltas(allocs, -1)[0].delta, -4);
});

test('fillRate يقيس بالكمية لا بعدد الأسطر', () => {
  assert.equal(fillRate({ totalRequested: 100, totalAllocated: 80 }), 0.8);
  assert.equal(fillRate({ totalRequested: 0, totalAllocated: 0 }), null, 'لا طلب لا نسبة');
});

test('totalAvailable يجمع المتاح عبر التشغيلات', () => {
  const balances = [
    { qty: 10, qtyReserved: 2 },
    { qty: 5, qtyReserved: 5 },
    { qty: 3 },
  ];
  assert.equal(totalAvailable(balances), 8 + 0 + 3);
});

/* ───────────────── كشف الحركة ───────────────── */

test('buildLedgerCard يحسب رصيدًا جاريًا صنفًا في مستودع', () => {
  const moves = [
    { id: 'm1', docType: 'PUTAWAY', to: 'E5', from: 'RECEIVING', qty: 20, postedAt: { seconds: 100 } },
    { id: 'm2', docType: 'PICK', to: 'STAGING', from: 'E5', qty: 8, postedAt: { seconds: 200 } },
    { id: 'm3', docType: 'RET', to: 'RECEIVING', from: null, qty: 5, postedAt: { seconds: 300 } }, // لا يخصّ E5
  ];
  const card = buildLedgerCard(moves, 'E5', 0);
  assert.equal(card.rows.length, 2, 'حركتان تخصّان E5 فقط');
  assert.equal(card.rows[0].qtyIn, 20);
  assert.equal(card.rows[0].balance, 20);
  assert.equal(card.rows[1].qtyOut, 8);
  assert.equal(card.rows[1].balance, 12, 'الرصيد الجاري 20 − 8');
  assert.equal(card.closing, 12);
  assert.equal(card.totalIn, 20);
  assert.equal(card.totalOut, 8);
});

test('buildLedgerCard يحترم الرصيد الافتتاحي', () => {
  const moves = [{ id: 'm1', to: 'E5', from: 'STAGING', qty: 3, postedAt: { seconds: 1 } }];
  const card = buildLedgerCard(moves, 'E5', 100);
  assert.equal(card.rows[0].balance, 103);
  assert.equal(card.closing, 103);
});

test('summarizeMovement يميّز الوارد من الخارج عبر المواقع', () => {
  const moves = [
    { to: 'RECEIVING', from: null, qty: 10, value: 20 }, // وارد من الخارج
    { to: null, from: 'STAGING', qty: 4, value: 8 }, // خارج للعميل
    { to: 'E5', from: 'RECEIVING', qty: 10, value: 20 }, // داخلي
  ];
  const s = summarizeMovement(moves);
  assert.equal(s.count, 3);
  assert.equal(s.totalIn, 10);
  assert.equal(s.totalOut, 4);
  assert.equal(s.value, 48);
});
