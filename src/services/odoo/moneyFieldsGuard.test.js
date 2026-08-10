/**
 * حارس حدّ المال (م١-ب · يسدّ ف‑٩).
 *
 * السياسة: **اسحب المالي ولا ترفعه.** أودو يولّد القيد، والبوابة تُنتج الواقعة.
 *
 * هذا الملفّ ليس توثيقًا للحاضر بل حارسًا للمستقبل: يمرّ على **كلّ مخطِّطات
 * الدفع** بمستنداتٍ محشوّةٍ بالأسعار عمدًا، ويطالب بألّا يخرج منها رقمُ مالٍ
 * واحد. فمن يضيف `price_unit` إلى مخطِّطٍ بعد ستّة أشهر يُسقط الاختبار قبل أن
 * يصل الحقل إلى أودو.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isMoneyField, findMoneyFields, assertNoMoneyFields } from './moneyFields.js';
import { poDocToPurchaseOrder, poLineToOrderLine, poDocTotal } from './poMapper.js';
import { grnDocToStockPicking, autoReceiptFromPo } from './grnMapper.js';
import { itemToProductValues, ledgerMoveToStockMove } from './odooMapper.js';
import { docToOdooValues } from './docCrosswalk.js';
import {
  mapVanDocument,
  vanDocToSaleOrder,
  vanDocToPicking,
  settlementToOdoo,
  VAN_SALES_TYPES,
} from './vanSalesMapper.js';

/* ═══════════ ١. السجلّ نفسه ═══════════ */

test('isMoneyField: يلتقط مفردات أودو ومفردات البوابة', () => {
  for (const f of [
    'amount_total',
    'amount_untaxed',
    'amount_tax',
    'price_unit',
    'price_subtotal',
    'x_amount_collected',
    'x_cash_variance',
    'x_total_sales',
    'discount',
    'list_price',
    'standard_price',
    'unitPrice',
    'unitCost',
  ]) {
    assert.equal(isMoneyField(f), true, `${f} حقلُ مال`);
  }
});

test('★ isMoneyField: لا يخلط الكمّيّة بالمال', () => {
  // هذه وقائع تشغيليّة، وحجبها يُفرغ الدفع من معناه.
  for (const f of [
    'product_uom_qty',
    'product_qty',
    'x_total_received', // مجموعُ كمّيّاتٍ لا مبلغ
    'x_total_rejected',
    'x_stock_variance', // فرق عدٍّ
    'x_visits_done',
    'x_payment_mode', // «نقدًا» أو «أجلًا» — شرطٌ لا مبلغ
    'x_is_free', // بندُ هديّةٍ يُحرّك مخزونًا
    'currency_id', // تسميةُ عملةٍ لا قيمة
    'x_min_stock',
    'qty_available',
  ]) {
    assert.equal(isMoneyField(f), false, `${f} ليس حقل مال`);
  }
});

test('findMoneyFields: يغوص في البنود ويُعيد المسار', () => {
  const found = findMoneyFields({
    x_source_number: 'PO-1',
    order_line: [{ product_code: 'A' }, { product_code: 'B', price_unit: 12 }],
  });
  assert.deepEqual(found, ['order_line[1].price_unit'], 'المسار يدلّ على السطر بعينه');
});

test('assertNoMoneyFields: يرفع خطأً مفهومًا يذكر الحقل والسياسة', () => {
  assert.throws(
    () => assertNoMoneyFields({ amount_total: 500 }, 'sale.order · VSI-1'),
    (e) => e.message.includes('amount_total') && e.message.includes('VSI-1') && e.message.includes('اسحب المالي')
  );
  assert.doesNotThrow(() => assertNoMoneyFields({ product_uom_qty: 5, currency_id: 'LYD' }));
});

/* ═══════════ ٢. المخطِّطات — مستنداتٌ محشوّةٌ بالأسعار عمدًا ═══════════ */

const PRICED_LINES = [
  { sku: 'A', description: 'صنف', uom: 'قطعة', qty: 10, unitPrice: 123.5, unitCost: 90, discount: 100, batch: 'B1', expiry: '2027-01-01' },
  { sku: 'B', description: 'مجّانيّ', uom: 'قطعة', qty: 2, unitPrice: 0, promoCode: 'PR-1' },
];

const PRICED_HEADER = {
  supplier: 'مورّد',
  customer: 'عميل',
  customerCode: 'C-01',
  vehiclePlate: '12-3456',
  warehouse: 'MAIN',
  issueDate: '2026-08-10',
  receivedAt: '2026-08-10',
  discount: 100,
  amountCollected: 900,
  cashSales: 1000,
  cashDeposited: 940,
  totalSales: 1000,
  paymentMode: 'نقدًا',
};

const pricedDoc = (type) => ({
  id: 'D1',
  number: `${type}-2026-0001`,
  type,
  header: { ...PRICED_HEADER },
  lines: PRICED_LINES.map((l) => ({ ...l, qtyReceived: l.qty, counted: 8, ledgerQty: 10 })),
});

const clean = (label, values) =>
  assert.deepEqual(findMoneyFields(values), [], `${label}: تسرّب حقل مال`);

test('★ مخطِّط أمر الشراء لا يُسرّب مالًا', () => {
  clean('poDocToPurchaseOrder', poDocToPurchaseOrder(pricedDoc('PO')));
  clean('poLineToOrderLine', poLineToOrderLine(PRICED_LINES[0]));
});

test('★ مخطِّط الاستلام لا يُسرّب مالًا', () => {
  clean('grnDocToStockPicking', grnDocToStockPicking(pricedDoc('GRN')));
  clean('autoReceiptFromPo', autoReceiptFromPo({ sourceNumber: 'PO-1', supplier: 'مورّد' }));
});

test('★ مخطِّط الأصناف والحركات لا يُسرّب مالًا', () => {
  clean('itemToProductValues', itemToProductValues({ sku: 'A', nameAr: 'صنف', minStock: 5, balance: 100 }));
  clean('ledgerMoveToStockMove', ledgerMoveToStockMove({ sku: 'A', qty: 5, from: 'WH', to: 'VAN/1' }));
});

test('★ المسار العامّ (docCrosswalk) لا يُسرّب مالًا', () => {
  clean('docToOdooValues', docToOdooValues(pricedDoc('DN')));
});

test('★ مخطِّط البيع من المركبة لا يُسرّب مالًا — الأنواع الثمانية', () => {
  clean('vanDocToSaleOrder', vanDocToSaleOrder(pricedDoc('VSI')));
  clean('vanDocToPicking', vanDocToPicking(pricedDoc('VLD')));
  clean('settlementToOdoo', settlementToOdoo(pricedDoc('VSR')));
  for (const type of VAN_SALES_TYPES) {
    const mapped = mapVanDocument(pricedDoc(type));
    clean(`mapVanDocument(${type})`, mapped?.values ?? {});
  }
});

/* ═══════════ ٣. الاتّجاه المعاكس مصون ═══════════ */

test('★ الحدّ على الدفع وحده — السحب يقرأ المال ويجب أن يبقى', () => {
  // لو حجبنا السحب لفقدنا المرآة الماليّة التي هي أصل السياسة.
  assert.equal(poDocTotal(pricedDoc('PO')), 10 * 123.5 - 100, 'الحساب المحلّيّ باقٍ');
  assert.equal(isMoneyField('amount_total'), true, 'الاسم نفسه ممنوعٌ دفعًا لا سحبًا');
});
