/**
 * اختبارات مخطِّط أمر الشراء ⇄ أودو (poMapper) — قلب جسر المزامنة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  poDocToPurchaseOrder,
  poLineToOrderLine,
  poDocTotal,
  purchaseOrderToPoSummary,
  odooStateLabel,
} from './poMapper.js';

const SAMPLE_DOC = {
  number: 'PO-2026-0007',
  header: {
    supplier: 'مختبرات الخليج للتجميل',
    contractNo: 'BID/2026/0155',
    supplierCode: 'SUP-9',
    issueDate: '2026-07-14',
    requiredDelivery: '2026-07-16',
    prRef: 'PR-2026-0155',
    warehouse: 'المستودع الرئيسي',
    discount: 100,
  },
  lines: [
    { sku: 'bz-vcs-30', description: 'سيروم فيتامين C', uom: 'وحدة', qty: 200, unitPrice: 123.5 },
    { sku: 'bz-toner', description: 'تونر', uom: 'وحدة', qty: 0, unitPrice: 10 }, // كمية صفر ⇒ تُستبعد
  ],
};

test('poLineToOrderLine: يرفع SKU والكمّيّة — بلا سعر (حدّ المال)', () => {
  const line = poLineToOrderLine({ sku: 'bz-vcs-30', qty: 3, unitPrice: 10, description: 'x' });
  assert.equal(line.product_code, 'BZ-VCS-30');
  assert.equal(line.product_qty, 3);
  assert.equal(line.price_unit, undefined, 'السعر لا يغادر البوابة');
  assert.equal(line.price_subtotal, undefined);
});

test('poLineToOrderLine: يتحمّل القيم الناقصة بأمان', () => {
  const line = poLineToOrderLine({});
  assert.equal(line.product_code, '');
  assert.equal(line.product_qty, 0);
});

test('poDocToPurchaseOrder: يصل مسوّدةً دائمًا (درفت حتى الاعتماد)', () => {
  assert.equal(poDocToPurchaseOrder(SAMPLE_DOC).state, 'draft');
});

test('poDocToPurchaseOrder: يخطّط حقول الرأس إلى أسماء أودو', () => {
  const values = poDocToPurchaseOrder(SAMPLE_DOC);
  assert.equal(values.x_supplier, 'مختبرات الخليج للتجميل');
  assert.equal(values.partner_ref, 'BID/2026/0155');
  assert.equal(values.date_order, '2026-07-14');
  assert.equal(values.date_planned, '2026-07-16');
  assert.equal(values.x_pr_ref, 'PR-2026-0155');
  assert.equal(values.x_source_number, 'PO-2026-0007');
  assert.equal(values.currency_id, 'LYD');
});

test('poDocToPurchaseOrder: يستبعد البنود ذات الكمية صفر', () => {
  const values = poDocToPurchaseOrder(SAMPLE_DOC);
  assert.equal(values.order_line.length, 1);
  assert.equal(values.order_line[0].product_code, 'BZ-VCS-30');
});

test('★ حدّ المال: قِيَم الدفع بلا مبالغ، والإجماليّ يبقى للعرض المحلّيّ', () => {
  const values = poDocToPurchaseOrder(SAMPLE_DOC);
  assert.equal(values.amount_untaxed, undefined, 'الفرعيّ لا يُرفع');
  assert.equal(values.amount_total, undefined, 'الصافي لا يُرفع — أودو يحسبه من قوائمه');
  // والحساب لم يضع: `poDocTotal` يخدم بطاقة الجسر ومرآتنا، ولا يُرسَل.
  assert.equal(poDocTotal(SAMPLE_DOC), 200 * 123.5 - 100); // 24600 بعد خصم 100
});

test('purchaseOrderToPoSummary: يلخّص سجلّ أودو للعرض العكسيّ', () => {
  const s = purchaseOrderToPoSummary({
    id: 1042,
    x_supplier: 'مورّد',
    x_source_number: 'PO-2026-0007',
    x_pr_ref: 'PR-1',
    state: 'purchase',
    amount_total: 24600,
    order_line: [{ product_code: 'A' }, { product_code: 'B' }],
  });
  assert.equal(s.odooId, 1042);
  assert.equal(s.sourceNumber, 'PO-2026-0007');
  assert.equal(s.lineCount, 2);
  assert.equal(s.amountTotal, 24600);
  assert.equal(s.state, 'purchase');
});

test('odooStateLabel: draft ⇒ مسوّدة (تحذير) · purchase ⇒ مؤكّد (نجاح)', () => {
  assert.deepEqual(odooStateLabel('draft'), { text: 'مسوّدة', tone: 'warn' });
  assert.deepEqual(odooStateLabel('purchase'), { text: 'مؤكّد', tone: 'success' });
});
