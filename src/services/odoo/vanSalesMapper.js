/**
 * تخطيط دورة البيع من المركبة والبضاعة المحميّة إلى أودو.
 *
 * ثمانية أنواعٍ جديدة تحتاج ترجمةً إلى نموذجَين اثنين لا أكثر:
 *   `sale.order`    — ما يُخرج الملكيّة: `VSI` (بيع من المركبة) و`VCS` (تحقّق بيع الأمانة).
 *   `stock.picking` — ما يُحرّك بضاعةً بين مواقعنا: `VLD`·`VRT`·`CRN`·`VCD`·`VCR`.
 *   `x_van.settlement` — التسوية: لا مقابل أصليّ لها، فهي محضر إقفالٍ لا حركة.
 *
 * ═══ المواقع: نفس أسماء دفترنا ═══
 * أودو يمثّل المركبة والعميل بمواقع مخزون، فنُسمّيها بما يطابق دفترنا حرفيًّا:
 * `VAN/‹لوحة›` و`CUST/‹رمز›`. والتطابق ليس ترفًا — به تُطابَق الأرصدة بين
 * النظامين بلا جدول ترجمةٍ ثالثٍ ينحرف.
 *
 * ═══ الأثر الراجع ═══
 * كلّ سجلٍّ يحمل `x_source_number` = رقم مستند البوابة. وهو أثر الربط الذي
 * يجعل السجلّ في أودو قابلًا لنسبته إلى أصله، ويجعل **الدفع مرّةً واحدة**
 * ممكنًا حتى لو ضاعت المرآة (انظر `findExistingBySource` في الجسر).
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

/** يقرأ رأس المستند بأمان. */
function header(doc) {
  return doc?.header ?? doc ?? {};
}

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** اسم موقع المركبة في أودو — يطابق `VAN:‹لوحة›` في دفترنا. */
export function vanLocationName(plate) {
  const p = up(plate);
  return p ? `VAN/${p}` : '';
}

/** اسم موقع العميل في أودو — يطابق `CUST:‹رمز›` في دفترنا. */
export function customerLocationName(code) {
  const c = up(code);
  return c ? `CUST/${c}` : '';
}

/** الخارج (المورّد/العميل) — موقع أودو الافتراضيّ للشركاء. */
export const PARTNER_LOCATION = 'Partners/Customers';

/** المستودع من رأس المستند، أو الافتراضيّ. */
function warehouseName(h) {
  return up(h.warehouse || h.fromWarehouse || h.toWarehouse) || 'WH/Stock';
}

/**
 * مواقع المناقلة لكلّ نوع: من أين إلى أين.
 * تطابق `POSTING_RULES` حرفيًّا — ولو اختلفا لانحرف رصيد أودو عن دفترنا.
 */
export function pickingRouteFor(type, h) {
  const van = vanLocationName(h.vehiclePlate);
  const cust = customerLocationName(h.customerCode);
  const wh = warehouseName(h);
  switch (type) {
    case 'VLD':
      return { from: wh, to: van, kind: 'internal' };
    case 'VRT':
      return { from: van, to: wh, kind: 'internal' };
    case 'CRN':
      return { from: PARTNER_LOCATION, to: van, kind: 'incoming' };
    case 'VCD':
      return { from: van, to: cust, kind: 'internal' };
    case 'VCR':
      return { from: cust, to: van, kind: 'internal' };
    default:
      return null;
  }
}

/** بند مستندٍ ← سطر `stock.move`. */
export function lineToStockMove(line = {}) {
  return {
    product_code: up(line.sku),
    name: str(line.description || line.sku),
    product_uom_qty: num(line.qty),
    product_uom: str(line.uom),
    x_batch: str(line.batch),
    x_expiry: str(line.expiry),
    price_unit: num(line.unitCost ?? line.unitPrice),
  };
}

/** بند مستندٍ ← سطر `sale.order.line`. */
export function lineToSaleLine(line = {}) {
  const qty = num(line.qty);
  const price = num(line.unitPrice);
  const discount = num(line.discount);
  const gross = qty * price;
  return {
    product_code: up(line.sku),
    name: str(line.description || line.sku),
    product_uom_qty: qty,
    price_unit: price,
    // أودو يقرأ الخصم نسبةً لا مبلغًا — فنحوّله، ونصفّره حين لا قيمة للبند
    // (المجّانيّ سعره صفر أصلًا، ونسبة خصمٍ عليه قسمةٌ على صفر).
    discount: gross > 0 ? money((discount / gross) * 100) : 0,
    x_promo_code: str(line.promoCode),
    x_is_free: Number(line.unitPrice) === 0,
    x_batch: str(line.batch),
    price_subtotal: money(Math.max(0, gross - discount)),
  };
}

/** مستند بيعٍ (`VSI`/`VCS`) ← قِيَم `sale.order`. */
export function vanDocToSaleOrder(doc = {}) {
  const h = header(doc);
  const lines = (doc.lines || []).filter((l) => num(l?.qty) > 0);
  return {
    x_customer_code: up(h.customerCode),
    x_customer_name: str(h.customer),
    partner_ref: up(h.customerCode),
    date_order: str(h.saleDate || h.date),
    x_source_number: str(doc.number),
    x_source_type: str(doc.type),
    x_vehicle: up(h.vehiclePlate),
    x_visit_ref: str(h.visitRef),
    x_trip_ref: str(h.tripRef),
    x_payment_mode: str(h.paymentMode),
    x_amount_collected: num(h.amountCollected),
    // موقع السحب: المركبة للبيع المباشر، ورفّ العميل لتحقّق بيع الأمانة.
    x_source_location: doc.type === 'VCS' ? customerLocationName(h.customerCode) : vanLocationName(h.vehiclePlate),
    currency_id: 'LYD',
    amount_total: money(lines.reduce((s, l) => s + Math.max(0, num(l.qty) * num(l.unitPrice) - num(l.discount)), 0)),
    state: 'draft',
    order_line: lines.map(lineToSaleLine),
  };
}

/** مستند حركةٍ ← قِيَم `stock.picking`. */
export function vanDocToPicking(doc = {}) {
  const h = header(doc);
  const route = pickingRouteFor(doc.type, h);
  const lines = (doc.lines || []).filter((l) => num(l?.qty) > 0);
  return {
    x_source_number: str(doc.number),
    x_source_type: str(doc.type),
    picking_type: route?.kind || 'internal',
    location_id: route?.from || '',
    location_dest_id: route?.to || '',
    x_vehicle: up(h.vehiclePlate),
    x_customer_code: up(h.customerCode),
    x_rep: str(h.repName),
    x_trip_ref: str(h.tripRef),
    scheduled_date: str(h.loadDate || h.returnDate || h.depositDate || h.recallDate || h.date),
    origin: str(doc.number),
    state: 'draft',
    move_ids: lines.map(lineToStockMove),
  };
}

/** محضر التسوية ← نموذج studio مخصّص (لا يُحرّك مخزونًا). */
export function settlementToOdoo(doc = {}) {
  const h = header(doc);
  const lines = doc.lines || [];
  return {
    x_source_number: str(doc.number),
    x_trip_ref: str(h.tripRef),
    x_vehicle: up(h.vehiclePlate),
    x_rep: str(h.repName),
    x_settlement_date: str(h.settlementDate),
    x_total_sales: num(h.totalSales),
    x_cash_sales: num(h.cashSales),
    x_cash_deposited: num(h.cashDeposited),
    x_cash_variance: money(num(h.cashSales) - num(h.cashDeposited)),
    x_stock_variance: money(lines.reduce((s, l) => s + (num(l.counted) - num(l.ledgerQty)), 0)),
    x_visits_done: num(h.visitsDone),
    x_visits_planned: num(h.visitsPlanned),
    state: 'draft',
  };
}

/** الأنواع التي يغطّيها هذا المخطِّط. */
export const VAN_SALES_TYPES = ['VLD', 'VSI', 'CRN', 'VRT', 'VSR', 'VCD', 'VCS', 'VCR'];

/** هل يغطّي هذا المخطِّط النوع؟ */
export function isVanSalesType(type) {
  return VAN_SALES_TYPES.includes(type);
}

/**
 * الموزّع: نوع المستند ← `{model, values}` جاهزة للإنشاء في أودو.
 * يُعيد `null` لما لا يغطّيه هذا المخطِّط — فيتولّاه المسار العامّ.
 */
export function mapVanDocument(doc = {}) {
  const type = doc?.type;
  if (!isVanSalesType(type)) return null;
  if (type === 'VSI' || type === 'VCS') return { model: 'sale.order', values: vanDocToSaleOrder(doc) };
  if (type === 'VSR') return { model: 'x_van.settlement', values: settlementToOdoo(doc) };
  return { model: 'stock.picking', values: vanDocToPicking(doc) };
}

/** ملخّصٌ للعرض في بطاقة الجسر. */
export function vanDocSummary(doc = {}) {
  const h = header(doc);
  const mapped = mapVanDocument(doc);
  return {
    type: doc?.type || '',
    number: str(doc?.number),
    model: mapped?.model || '',
    customer: str(h.customer || h.customerCode),
    vehicle: up(h.vehiclePlate),
    lineCount: (doc?.lines || []).filter((l) => num(l?.qty) > 0).length,
    amountTotal: mapped?.values?.amount_total ?? 0,
  };
}
