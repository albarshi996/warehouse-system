/**
 * بيعٌ نقديٌّ من نقطة بيع (POS) — كاشير التجزئة (‹POS م٧› · طلب المالك 2026-11-09).
 *
 * واقعةُ بيعٍ لحظيّةٌ من مخزنٍ ثابت (لا مركبة كـVSI): تُنشأ وتُخصَم وتُقيَّد في
 * لحظةٍ واحدة من شاشة الكاشير (`cashierService.recordSale` بخطوةٍ واحدة). ما يقع
 * عند الإنجاز: **(أ)** خروجُ البضاعة من المخزن (`WAREHOUSE → EXTERNAL`) فيُخصم الرصيد
 * (`POSTING_RULES.POS`)؛ **(ب)** قيدٌ مزدوج **مدينٌ النقد/البنك دائنٌ المبيعات**
 * (`deriveSaleEntry`). بيعٌ **نقديٌّ لا آجل** — فلا طرفَ في دفتر الذمم (بخلاف INV).
 *
 * النسخةُ الأولى (قرار المالك): **بلا ضريبة** · دفعٌ نقدٌ/بطاقة/تحويل · بلا عروضٍ
 * آليّة (سعرٌ + خصمٌ يدويّ). الطباعةُ محايدةٌ (`plainPrint`) — إيصالُ بيعٍ بلا هويّةِ
 * شركة. الرياضياتُ الخالصةُ في `src/services/pos/cashierCart.js`.
 */

/** إجماليُّ بندٍ = الكمّيّة × السعر − الخصم، لا يقلّ عن صفر. */
export function lineTotal(line) {
  return Math.max(0, (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0) - (Number(line?.discount) || 0));
}

/** مجموعُ البنود (قبل خصم السلّة). */
function linesSubtotal(lines) {
  return (lines || []).reduce((t, l) => t + lineTotal(l), 0);
}

/** تحذيراتُ البيع (تنبّه ولا تمنع — الحارسُ الصلبُ في الخدمة والترحيل). */
export function posWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (!lines.length) out.push('لا بندَ مباعٌ — سلّةٌ فارغةٌ لا تُقيَّد');
  if (!String(h.warehouse || '').trim()) out.push('المخزنُ المصدرُ غير محدَّد — منه يُخصم الرصيد');
  if (!String(h.paymentMethod || '').trim()) out.push('طريقةُ الدفع غير محدَّدة');
  const noPrice = lines.filter((l) => !(Number(l?.unitPrice) > 0));
  if (noPrice.length) out.push(`${noPrice.length} بندًا بلا سعر — راجِع قائمةَ الأسعار`);
  return out;
}

const schema = {
  type: 'POS',
  stage: 7,
  titleAr: 'بيع نقديّ (كاشير)',
  titleEn: 'Cash Sale (POS)',
  formCode: 'BFP-POS-001',
  orientation: 'portrait',
  // ★ طباعةٌ محايدةٌ بلا هويّةِ شركة — إيصالُ بيعٍ للعميل.
  plainPrint: true,

  /** البائعُ ينشئ ويعتمد وينجز في لحظةٍ واحدة (نمطُ VSI: الكاشير لا ينتظر). المدير
   *  العامّ (admin) يتجاوز عبر `canDo` فلا يُدرَج (عُرفُ المخطّطات). */
  roles: {
    create: ['warehouse_manager', 'sales_rep', 'sales_supervisor'],
    approve: ['warehouse_manager', 'sales_rep', 'sales_supervisor'],
    complete: ['warehouse_manager', 'sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات البيع — Sale Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'saleDate', label: 'تاريخ البيع (Sale Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'المخزنُ الذي تخرج منه البضاعة فعلًا — عليه يقع خصمُ الرصيد.',
        },
        {
          key: 'paymentMethod',
          label: 'طريقة الدفع (Payment)',
          kind: 'select',
          options: ['نقدًا', 'بطاقة', 'تحويل'],
          required: true,
          hint: 'نقدًا ⟵ الصندوق (مع باقٍ)؛ بطاقة/تحويل ⟵ البنك.',
        },
        { key: 'customer', label: 'العميل (اختياريّ)', kind: 'text' },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: 'الأصناف المباعة — Sold Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '12%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '14%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '26%' },
        { key: 'qty', label: 'الكمّيّة', kind: 'number', width: '10%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '10%' },
        { key: 'unitPrice', label: 'سعر الوحدة', kind: 'number', width: '12%' },
        { key: 'discount', label: 'الخصم', kind: 'number', width: '8%' },
        { key: 'lineTotal', label: 'الإجماليّ', kind: 'computed', compute: lineTotal, width: '8%' },
      ],
    },

    {
      key: 'payment',
      title: 'الدفع — Payment',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'cartDiscount', label: 'خصم السلّة (د.ل)', kind: 'number' },
        { key: 'grandTotal', label: 'الإجماليّ المستحقّ (د.ل)', kind: 'number' },
        { key: 'amountPaid', label: 'المدفوع (د.ل)', kind: 'number' },
        { key: 'change', label: 'الباقي (د.ل)', kind: 'number' },
      ],
    },

    {
      key: 'summary',
      title: 'الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'computedTotal', label: 'مجموع البنود (د.ل)', kind: 'computed', compute: (d) => linesSubtotal(d.lines) },
      ],
    },
  ],

  signatures: [
    { key: 'cashier', label: 'الكاشير (Cashier)', source: 'creator' },
    { key: 'customer', label: 'العميل (Customer)', source: null },
  ],

  warnings: posWarnings,
};

export default schema;
