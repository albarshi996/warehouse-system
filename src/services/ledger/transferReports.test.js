/**
 * اختبارات دورة النقل — الخاصّية المحورية: **مخزن النقل يعود للصفر**.
 * منطق خالص في Node، بلا شبكة ولا متصفّح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoves, balanceDeltas } from './movements.js';
import { postingRuleFor } from './postingRules.js';
import { deriveDocument } from '../documents/chain.js';
import { pendingShipments, transferVariances } from './transferReports.js';

const TRANSIT = 'TRANSIT';

/* ───────────────── القيد: من المصدر لمخزن النقل وبالعكس ───────────────── */

test('مستند النقل يُخرج من المصدر إلى مخزن النقل', () => {
  const trn = {
    id: 'trn1', type: 'TRN', number: 'TRN-2026-0001', state: 'done',
    header: { fromWarehouse: 'E5', toWarehouse: 'BR2' },
    lines: [{ sku: 'A', qtyShipped: 10, unitCost: 3 }],
  };
  const { moves, problems } = buildMoves(trn);
  assert.equal(problems.length, 0);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'E5');
  assert.equal(moves[0].to, TRANSIT);
  assert.equal(moves[0].qty, 10);

  const { deltas } = balanceDeltas(moves);
  const e5 = deltas.find((d) => d.warehouse === 'E5');
  const transit = deltas.find((d) => d.warehouse === TRANSIT);
  assert.equal(e5.delta, -10, 'يُخصم من المصدر');
  assert.equal(transit.delta, +10, 'يُضاف لمخزن النقل');
});

test('استلام النقل يُفرغ مخزن النقل إلى الوجهة', () => {
  const trc = {
    id: 'trc1', type: 'TRC', number: 'TRC-2026-0001', state: 'done',
    header: { fromWarehouse: 'E5', toWarehouse: 'BR2' },
    lines: [{ sku: 'A', qtyShipped: 10, qtyReceived: 10, unitCost: 3 }],
  };
  const { moves } = buildMoves(trc);
  assert.equal(moves[0].from, TRANSIT);
  assert.equal(moves[0].to, 'BR2');
  assert.equal(moves[0].qty, 10);

  const { deltas } = balanceDeltas(moves);
  assert.equal(deltas.find((d) => d.warehouse === TRANSIT).delta, -10);
  assert.equal(deltas.find((d) => d.warehouse === 'BR2').delta, +10);
});

test('الخاصّية المحورية: شحنٌ ثم استلامٌ مطابق ⇒ مخزن النقل صفر', () => {
  const shipped = 25;
  const trn = { id: 't', type: 'TRN', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR2' }, lines: [{ sku: 'A', qtyShipped: shipped, unitCost: 2 }] };
  const trc = { id: 'r', type: 'TRC', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR2' }, lines: [{ sku: 'A', qtyShipped: shipped, qtyReceived: shipped, unitCost: 2 }] };

  const dTrn = balanceDeltas(buildMoves(trn).moves).deltas;
  const dTrc = balanceDeltas(buildMoves(trc).moves).deltas;
  const transitNet =
    (dTrn.find((d) => d.warehouse === TRANSIT)?.delta || 0) +
    (dTrc.find((d) => d.warehouse === TRANSIT)?.delta || 0);
  assert.equal(transitNet, 0, 'مخزن النقل يعود صفرًا بعد الاستلام الكامل');
});

test('نقصٌ في الاستلام ⇒ يبقى الفرق في مخزن النقل', () => {
  const trn = { id: 't', type: 'TRN', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR2' }, lines: [{ sku: 'A', qtyShipped: 30, unitCost: 1 }] };
  const trc = { id: 'r', type: 'TRC', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR2' }, lines: [{ sku: 'A', qtyShipped: 30, qtyReceived: 28, unitCost: 1 }] };
  const net =
    (balanceDeltas(buildMoves(trn).moves).deltas.find((d) => d.warehouse === TRANSIT)?.delta || 0) +
    (balanceDeltas(buildMoves(trc).moves).deltas.find((d) => d.warehouse === TRANSIT)?.delta || 0);
  assert.equal(net, 2, 'وحدتان مفقودتان تبقيان عالقتين في مخزن النقل — تقرير الفرق');
});

test('مستند النقل بلا مستودع مصدر يُرفض بسبب مكتوب', () => {
  const trn = { id: 't', type: 'TRN', state: 'done', header: { toWarehouse: 'BR2' }, lines: [{ sku: 'A', qtyShipped: 5 }] };
  const { moves, problems } = buildMoves(trn);
  assert.equal(moves.length, 0);
  assert.ok(problems.length > 0, 'لا قيد بلا مستودع مصدر');
});

/* ───────────────── الاشتقاق ───────────────── */

test('طلب النقل يشتقّ مستند النقل بالمشحون والمستودعَين', () => {
  const tr = {
    id: 'tr1', type: 'TR', number: 'TR-2026-0001', state: 'approved',
    header: { fromWarehouse: 'E5', toWarehouse: 'BR2' },
    lines: [{ sku: 'A', description: 'صنف', qty: 12, uom: 'علبة' }],
  };
  const draft = deriveDocument(tr);
  assert.equal(draft.type, 'TRN');
  assert.equal(draft.header.fromWarehouse, 'E5');
  assert.equal(draft.header.toWarehouse, 'BR2');
  assert.equal(draft.header.transferReqRef, 'TR-2026-0001');
  assert.equal(draft.lines[0].qtyShipped, 12, 'المطلوب صار المشحون');
});

test('مستند النقل يشتقّ الاستلام بالمشحون مرجعًا', () => {
  const trn = {
    id: 'trn1', type: 'TRN', number: 'TRN-2026-0001', state: 'done',
    header: { fromWarehouse: 'E5', toWarehouse: 'BR2' },
    lines: [{ sku: 'A', description: 'صنف', qtyShipped: 12, uom: 'علبة', batch: 'B1' }],
    links: { TR: { id: 'tr1', number: 'TR-2026-0001' } },
  };
  const draft = deriveDocument(trn);
  assert.equal(draft.type, 'TRC');
  assert.equal(draft.header.transferNoteRef, 'TRN-2026-0001');
  assert.equal(draft.lines[0].qtyShipped, 12, 'المشحون يُورَّث مرجعًا');
  assert.equal(draft.links.TRN.id, 'trn1');
});

/* ───────────────── التقارير ───────────────── */

const inTransit = { id: 'n1', type: 'TRN', number: 'TRN-1', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR2', shipmentDate: '2026-07-20' }, lines: [{ sku: 'A', qtyShipped: 10, unitCost: 2 }] };
const receivedFull = { id: 'n2', type: 'TRN', number: 'TRN-2', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR3', shipmentDate: '2026-07-19' }, lines: [{ sku: 'B', qtyShipped: 5, unitCost: 4 }] };
const rcptFull = { id: 'r2', type: 'TRC', number: 'TRC-2', state: 'done', header: { toWarehouse: 'BR3' }, links: { TRN: { id: 'n2' } }, lines: [{ sku: 'B', qtyShipped: 5, qtyReceived: 5 }] };
const shippedShort = { id: 'n3', type: 'TRN', number: 'TRN-3', state: 'done', header: { fromWarehouse: 'E5', toWarehouse: 'BR4', shipmentDate: '2026-07-18' }, lines: [{ sku: 'C', qtyShipped: 20, unitCost: 1 }] };
const rcptShort = { id: 'r3', type: 'TRC', number: 'TRC-3', state: 'done', header: { toWarehouse: 'BR4', settlementStatus: 'قيد المراجعة' }, links: { TRN: { id: 'n3' } }, lines: [{ sku: 'C', qtyShipped: 20, qtyReceived: 17, varianceReason: 'كسر أثناء النقل' }] };

test('تقرير الشحنات المعلّقة يصنّف الحالات', () => {
  const { rows, inTransit: it, withVariance, received } = pendingShipments([inTransit, receivedFull, rcptFull, shippedShort, rcptShort]);
  assert.equal(rows.length, 3);
  assert.equal(it, 1, 'شحنةٌ في الطريق');
  assert.equal(received, 1, 'شحنةٌ استُلمت كاملةً');
  assert.equal(withVariance, 1, 'شحنةٌ بفرق');
  const n1 = rows.find((r) => r.id === 'n1');
  assert.equal(n1.status, 'in-transit');
  assert.equal(n1.remaining, 10);
});

test('تقرير فروقات النقل يكشف النقص وسببه وحالة تسويته', () => {
  const { rows, totalShortage, unresolved } = transferVariances([inTransit, receivedFull, rcptFull, shippedShort, rcptShort]);
  assert.equal(rows.length, 1, 'فرقٌ واحد فقط (المطابق لا يظهر)');
  assert.equal(rows[0].shortage, 3);
  assert.equal(rows[0].reason, 'كسر أثناء النقل');
  assert.equal(rows[0].settlement, 'قيد المراجعة');
  assert.equal(rows[0].resolved, false);
  assert.equal(totalShortage, 3);
  assert.equal(unresolved, 1);
});

test('النقل ليس في قواعد القيد إلا TRN و TRC (لا TR)', () => {
  assert.equal(postingRuleFor('TR'), null, 'الطلب لا يُحرّك مخزونًا');
  assert.ok(postingRuleFor('TRN'), 'الشحن يُحرّك');
  assert.ok(postingRuleFor('TRC'), 'الاستلام يُحرّك');
});
