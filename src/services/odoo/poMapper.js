/**
 * تخطيط أمر الشراء بين محرّك المستندات و Odoo — الفجوة الوحيدة التي كانت ناقصة.
 *
 * `odooMapper.js` يغطّي الأصناف والحركات (product.product / stock.move)، لكن لا
 * مخطِّط يترجم مستند أمر الشراء (`documents` type='PO') إلى نموذج `purchase.order`
 * في Odoo. هذا الملف يسدّها — وهو **مخطِّط الإنتاج نفسه**: يستعمله جسر المزامنة
 * في وضع التدريب (عبر العميل المحاكى) ووضع الإنتاج (عبر الوسيط) بلا فرق.
 *
 * قواعد أودو المستعملة (بادئة `x_` = حقول studio مخصّصة، تحاكيها المرآة):
 *   purchase.order
 *     - x_supplier      ← header.supplier         (اسم المورّد — partner_id في الإنتاج)
 *     - partner_ref     ← header.contractNo       (مرجع المورّد/العقد)
 *     - date_order      ← header.issueDate
 *     - date_planned    ← header.requiredDelivery
 *     - x_pr_ref        ← header.prRef            (رقم طلب الشراء المرجعيّ)
 *     - x_source_number ← doc.number             (رقم مستند البوابة — أثر الربط)
 *     - currency_id     ← 'LYD' (ثابت)
 *     - amount_total    ← الصافي بعد الخصم (محسوب)
 *     - state           ← 'draft' دائمًا عند الدفع (مسوّدة حتى الاعتماد)
 *     - order_line[]    ← بنود المستند (product.qty.price)
 */
import { subtotal, netTotal, lineTotal } from '../documents/schemas/po.js';

/** يقرأ حقلًا من رأس المستند بأمان (يقبل doc.header أو doc مباشرةً). */
function header(doc) {
  return doc?.header ?? doc ?? {};
}

/**
 * حوّل سطر مستندٍ واحدًا إلى سطر `purchase.order.line` بأسماء حقول أودو.
 * @param {object} line  { sku, description, uom, qty, unitPrice, notes }
 */
export function poLineToOrderLine(line = {}) {
  return {
    product_code: String(line.sku ?? '').trim().toUpperCase(),
    name: String(line.description ?? line.sku ?? '').trim(),
    product_qty: Number(line.qty) || 0,
    product_uom: String(line.uom ?? '').trim(),
    price_unit: Number(line.unitPrice) || 0,
    price_subtotal: lineTotal(line),
  };
}

/**
 * حوّل مستند أمر شراء (من `documents`) إلى قِيَم `purchase.order` لإنشائها في أودو.
 * الحالة `draft` دائمًا: كلّ ما يُدفع يصل مسوّدةً حتى يُعتمد صراحةً.
 *
 * @param {object} doc  مستند البوابة { number, header, lines }
 * @returns {object} قِيَم purchase.order (create values)
 */
export function poDocToPurchaseOrder(doc = {}) {
  const h = header(doc);
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  return {
    x_supplier: String(h.supplier ?? '').trim(),
    partner_ref: String(h.contractNo ?? h.supplierCode ?? '').trim(),
    date_order: String(h.issueDate ?? '').trim(),
    date_planned: String(h.requiredDelivery ?? '').trim(),
    x_pr_ref: String(h.prRef ?? '').trim(),
    x_source_number: String(doc.number ?? '').trim(),
    x_warehouse: String(h.warehouse ?? '').trim(),
    currency_id: 'LYD',
    amount_untaxed: subtotal(lines),
    amount_total: netTotal({ ...doc, header: h }),
    state: 'draft',
    order_line: lines.filter((l) => Number(l?.qty) > 0).map(poLineToOrderLine),
  };
}

/**
 * ملخّصٌ للعرض العكسيّ (Odoo → الواجهة): يحوّل سجلّ `purchase.order` القادم من
 * `searchRead` إلى شكلٍ مبسّط للبطاقة. يقبل حالة أودو الحقيقيّة (`purchase`) أو
 * المرآة.
 *
 * @param {object} rec  سجلّ purchase.order
 */
export function purchaseOrderToPoSummary(rec = {}) {
  const lines = Array.isArray(rec.order_line) ? rec.order_line : [];
  return {
    odooId: rec.id ?? null,
    name: String(rec.name ?? rec.x_source_number ?? '').trim(),
    supplier: String(rec.x_supplier ?? '').trim(),
    prRef: String(rec.x_pr_ref ?? '').trim(),
    sourceNumber: String(rec.x_source_number ?? '').trim(),
    state: String(rec.state ?? 'draft'),
    lineCount: lines.length,
    amountTotal: Number(rec.amount_total ?? 0) || 0,
    currency: String(rec.currency_id ?? 'LYD'),
  };
}

/** حالة أودو → تسمية عربيّة + نبرة (للشارة). draft كهرمانيّ، purchase أخضر. */
export function odooStateLabel(state) {
  if (state === 'purchase' || state === 'done') return { text: 'مؤكّد', tone: 'success' };
  if (state === 'cancel') return { text: 'ملغى', tone: 'error' };
  return { text: 'مسوّدة', tone: 'warn' };
}
