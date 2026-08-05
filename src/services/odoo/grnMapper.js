/**
 * تخطيط مذكرة الاستلام (GRN) بين محرّك المستندات و Odoo — الحلقة الثانية للجسر.
 *
 * يترجم مستند GRN (`documents` type='GRN') إلى نموذج `stock.picking` (استلام
 * وارد) في أودو، على نسق `poMapper.js` نفسه. وهو أيضًا مخطِّط إنتاجٍ يعمل في
 * الوضعين (محاكى/حقيقيّ) بلا فرق.
 *
 * حالات الاستلام في أودو الحقيقيّ: draft → assigned (جاهز) → done (منجَز).
 * قاعدة الجسر: كلّ ما يُدفع يصل `draft`، والاستلام الذي يولّده تأكيد أمر الشراء
 * يصل `assigned` (مجدولًا) — محاكاةً حرفيّة لسلوك أودو: تأكيد PO يُنشئ WH/IN.
 */

/** يقرأ رأس المستند بأمان. */
function header(doc) {
  return doc?.header ?? doc ?? {};
}

/** يجمع عمودًا رقميًّا من البنود (نفس منطق مخطّط GRN). */
function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * حوّل سطر استلامٍ واحدًا إلى سطر حركة مخزنيّة بأسماء حقول أودو.
 * @param {object} line  { sku, description, qtyReceived, qtyRejected, expiryDate }
 */
export function grnLineToMoveLine(line = {}) {
  return {
    product_code: String(line.sku ?? '').trim().toUpperCase(),
    name: String(line.description ?? line.sku ?? '').trim(),
    product_uom_qty: Number(line.qtyReceived) || 0,
    x_qty_rejected: Number(line.qtyRejected) || 0,
    x_expiry: String(line.expiryDate ?? '').trim(),
  };
}

/**
 * حوّل مستند GRN إلى قِيَم `stock.picking` لإنشائها في أودو.
 * الحالة `draft` دائمًا عند الدفع اليدويّ (درفت حتى التصديق).
 *
 * @param {object} doc  مستند البوابة { number, header, lines }
 */
export function grnDocToStockPicking(doc = {}) {
  const h = header(doc);
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  return {
    picking_type: 'incoming',
    origin: String(h.poRef ?? '').trim(), // الربط بأمر الشراء — أثر السلسلة
    x_supplier: String(h.supplier ?? '').trim(),
    x_source_number: String(doc.number ?? '').trim(),
    x_asn: String(h.asnNo ?? '').trim(),
    x_truck_plate: String(h.truckPlate ?? '').trim(),
    scheduled_date: String(h.receivedAt ?? '').trim(),
    x_total_received: sumColumn(lines, 'qtyReceived'),
    x_total_rejected: sumColumn(lines, 'qtyRejected'),
    state: 'draft',
    move_lines: lines.filter((l) => Number(l?.qtyReceived) > 0).map(grnLineToMoveLine),
  };
}

/**
 * قِيَم الاستلام الذي يولّده أودو **تلقائيًّا** عند تأكيد أمر الشراء —
 * محاكاة حرفيّة لسلوك أودو الحقيقيّ (confirm PO ⇒ scheduled WH/IN).
 * يصل `assigned` (جاهزًا) لأن أودو يجدوله لا يتركه مسوّدة.
 *
 * @param {object} poRec  سجلّ مرآة أمر الشراء { sourceNumber, supplier, odooId }
 */
export function autoReceiptFromPo(poRec = {}) {
  return {
    picking_type: 'incoming',
    origin: String(poRec.sourceNumber ?? '').trim(),
    x_supplier: String(poRec.supplier ?? '').trim(),
    x_source_number: '', // لا مستند بوابة مصدرًا — وُلد في أودو
    x_auto_created: true,
    state: 'assigned',
    move_lines: [],
  };
}

/** ملخّص سجلّ `stock.picking` للعرض في العمود. */
export function stockPickingToSummary(rec = {}) {
  const lines = Array.isArray(rec.move_lines) ? rec.move_lines : [];
  return {
    odooId: rec.id ?? null,
    name: String(rec.name ?? '').trim(),
    origin: String(rec.origin ?? '').trim(),
    supplier: String(rec.x_supplier ?? '').trim(),
    sourceNumber: String(rec.x_source_number ?? '').trim(),
    autoCreated: Boolean(rec.x_auto_created),
    state: String(rec.state ?? 'draft'),
    lineCount: lines.length,
    totalReceived: Number(rec.x_total_received ?? 0) || 0,
  };
}

/** حالة الاستلام → تسمية عربيّة + نبرة الشارة. */
export function pickingStateLabel(state) {
  if (state === 'done') return { text: 'منجَز', tone: 'success' };
  if (state === 'assigned') return { text: 'جاهز (مجدول)', tone: 'warn' };
  if (state === 'cancel') return { text: 'ملغى', tone: 'error' };
  return { text: 'مسوّدة', tone: 'warn' };
}
