/**
 * اختبارات مخطِّط الاستلام ⇄ أودو (grnMapper) — الحلقة الثانية للجسر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  grnDocToStockPicking,
  grnLineToMoveLine,
  autoReceiptFromPo,
  stockPickingToSummary,
  pickingStateLabel,
} from './grnMapper.js';

const SAMPLE_GRN = {
  number: 'GRN-2026-0003',
  header: {
    poRef: 'PO-2026-0007',
    supplier: 'مختبرات الخليج للتجميل',
    asnNo: 'ASN-114',
    truckPlate: 'LBY-5-88214',
    receivedAt: '2026-07-16 09:30',
  },
  lines: [
    { sku: 'bz-vcs-30', description: 'سيروم فيتامين C', qtyReceived: 195, qtyRejected: 5, expiryDate: '2026-12-31' },
    { sku: 'bz-toner', description: 'تونر', qtyReceived: 0, qtyRejected: 0 }, // لم يُستلم ⇒ يُستبعد
  ],
};

test('grnLineToMoveLine: يرفع SKU ويحمل الكميّات والانتهاء', () => {
  const line = grnLineToMoveLine(SAMPLE_GRN.lines[0]);
  assert.equal(line.product_code, 'BZ-VCS-30');
  assert.equal(line.product_uom_qty, 195);
  assert.equal(line.x_qty_rejected, 5);
  assert.equal(line.x_expiry, '2026-12-31');
});

test('grnDocToStockPicking: يصل مسوّدةً دائمًا عند الدفع اليدويّ', () => {
  assert.equal(grnDocToStockPicking(SAMPLE_GRN).state, 'draft');
});

test('grnDocToStockPicking: يربط بأمر الشراء (origin) ويحمل رأس الاستلام', () => {
  const v = grnDocToStockPicking(SAMPLE_GRN);
  assert.equal(v.picking_type, 'incoming');
  assert.equal(v.origin, 'PO-2026-0007');
  assert.equal(v.x_supplier, 'مختبرات الخليج للتجميل');
  assert.equal(v.x_source_number, 'GRN-2026-0003');
  assert.equal(v.x_asn, 'ASN-114');
});

test('grnDocToStockPicking: يجمع الإجماليّات ويستبعد بنود صفر الاستلام', () => {
  const v = grnDocToStockPicking(SAMPLE_GRN);
  assert.equal(v.x_total_received, 195);
  assert.equal(v.x_total_rejected, 5);
  assert.equal(v.move_lines.length, 1);
});

test('autoReceiptFromPo: تأكيد الأمر يولّد استلامًا جاهزًا (assigned) موسومًا تلقائيًّا', () => {
  const v = autoReceiptFromPo({ sourceNumber: 'PO-2026-0007', supplier: 'مورّد' });
  assert.equal(v.state, 'assigned');
  assert.equal(v.origin, 'PO-2026-0007');
  assert.equal(v.x_auto_created, true);
});

test('stockPickingToSummary: يلخّص سجلّ أودو للعرض', () => {
  const s = stockPickingToSummary({
    id: 4001,
    origin: 'PO-2026-0007',
    x_supplier: 'مورّد',
    x_source_number: 'GRN-2026-0003',
    x_auto_created: false,
    state: 'done',
    x_total_received: 195,
    move_lines: [{}],
  });
  assert.equal(s.odooId, 4001);
  assert.equal(s.origin, 'PO-2026-0007');
  assert.equal(s.state, 'done');
  assert.equal(s.totalReceived, 195);
  assert.equal(s.lineCount, 1);
});

test('pickingStateLabel: draft/assigned كهرمانيّ · done أخضر', () => {
  assert.deepEqual(pickingStateLabel('draft'), { text: 'مسوّدة', tone: 'warn' });
  assert.deepEqual(pickingStateLabel('assigned'), { text: 'جاهز (مجدول)', tone: 'warn' });
  assert.deepEqual(pickingStateLabel('done'), { text: 'منجَز', tone: 'success' });
});
