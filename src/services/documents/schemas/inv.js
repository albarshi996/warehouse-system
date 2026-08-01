/**
 * مخطّط فاتورة العميل (INV) — آخر مستندٍ في دورة المبيعات، قبل الإغلاق المالي.
 *
 * الأصل: قرار المالك — **مستندٌ بقيمة بلا قيدٍ محاسبيّ مزدوج**. الفاتورة توثّق
 * ذمّة العميل وقيمة ما سُلّم؛ والقيد المزدوج (مدين/دائن) يُترك لموديول أودو.
 *
 * كيف تُبنى؟ **تُشتقّ من إذن التسليم** (`DN`) فتأخذ الكميات التي خرجت فعلًا،
 * و**السعر يركب معها من أمر البيع** عبر السلسلة — فما اتُّفق عليه عند الطلب هو
 * ما يُفوتَر عند التسليم، لا يُعاد إدخاله بالقلم. ومراجعها (أمر البيع · التسليم)
 * تُملأ من روابطها تلقائيًّا.
 *
 * ⚖️ الفاتورة **لا تُحرّك مخزونًا** — البضاعة خرجت بإذن التسليم، والفوترة أثرٌ
 * ماليّ على الذمّة لا على الرفّ. لذلك هي خارج قواعد القيد في `postingRules.js`.
 */

/** إجمالي البند = الكمية × سعر الوحدة، ناقصًا خصم البند إن وُجد. */
export function lineTotal(line) {
  const gross = (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
  const discount = Number(line?.discount) || 0;
  return Math.max(0, gross - discount);
}

/** الإجمالي الفرعي — مجموع قيم البنود بعد خصومها. */
export function subtotal(lines) {
  return (lines || []).reduce((total, line) => total + lineTotal(line), 0);
}

/** قيمة الضريبة على الإجمالي الفرعي (النسبة من الرأس، صفرٌ إن غابت). */
export function taxAmount(doc) {
  const rate = Number(doc?.header?.taxRate) || 0;
  return (subtotal(doc?.lines) * rate) / 100;
}

/** الإجمالي المستحق = الفرعي + الضريبة − خصمٌ عامّ على الفاتورة. */
export function grandTotal(doc) {
  const discount = Number(doc?.header?.invoiceDiscount) || 0;
  return Math.max(0, subtotal(doc?.lines) + taxAmount(doc) - discount);
}

/**
 * تحذيرات الفاتورة (تنبّه ولا تمنع):
 *  · بندٌ بكمية بلا سعر — فاتورةٌ بقيمةٍ ناقصة.
 *  · إجمالي غير موجب — فاتورةٌ بلا مبلغ مستحق.
 *  · لا مرجع تسليم — فاتورةٌ لا تُسنَد إلى ما خرج فعلًا.
 */
export function invoiceWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (lines.some((l) => !(Number(l?.unitPrice) > 0))) {
    out.push('بندٌ بكمية بلا سعر — الفاتورة بقيمةٍ ناقصة');
  }
  if (!(grandTotal(doc) > 0)) {
    out.push('الإجمالي المستحق غير موجب — فاتورةٌ بلا مبلغ');
  }
  if (!String(doc?.header?.deliveryRef || '').trim() && !doc?.links?.DN) {
    out.push('لا مرجع إذن تسليم — الفاتورة لا تُسنَد إلى ما خرج فعلًا');
  }
  return out;
}

const schema = {
  type: 'INV',
  stage: 12,
  titleAr: 'فاتورة العميل',
  titleEn: 'Customer Invoice (AR)',
  formCode: 'BFP-INV-001',
  orientation: 'portrait',

  /** الإصدار للمالية أو المدير، والاعتماد للمدير المالي — فصل الإعداد عن الاعتماد. */
  roles: {
    create: ['finance_manager', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الفاتورة — Invoice Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'invoiceDate', label: 'تاريخ الفاتورة (Invoice Date)', kind: 'date', required: true },
        { key: 'dueDate', label: 'تاريخ الاستحقاق (Due Date)', kind: 'date' },
        {
          key: 'deliveryRef',
          label: 'رقم إذن التسليم (Delivery Ref.)',
          kind: 'docref',
          docType: 'DN',
          hint: 'اكتب رقم إذن التسليم (DN-…) فيُتعرَّف عليه ويُربط — أو يُملأ عند الاشتقاق',
        },
        {
          key: 'salesOrderRef',
          label: 'رقم أمر البيع (Sales Order Ref.)',
          kind: 'text',
          hint: 'يُملأ تلقائيًّا من سلسلة الأمر',
        },
        { key: 'paymentTerms', label: 'شروط الدفع (Payment Terms)', kind: 'text' },
        { key: 'paymentStatus', label: 'حالة السداد (Payment Status)', kind: 'select', options: ['غير مدفوعة', 'مدفوعة جزئيًّا', 'مدفوعة'] },
      ],
    },

    {
      key: 'customer',
      title: '👤 بيانات العميل — Customer',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text' },
        { key: 'taxNo', label: 'الرقم الضريبي (Tax No.)', kind: 'text', ltr: true },
      ],
      extraFields: [{ key: 'billingAddress', label: 'عنوان الفوترة (Billing Address)', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: '🧾 بنود الفاتورة — Invoice Lines',
      kind: 'table',
      note: 'الكميات من إذن التسليم (ما خرج فعلًا)، والأسعار من أمر البيع (ما اتُّفق عليه).',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', ltr: true, width: '12%' },
        { key: 'description', label: 'وصف الصنف (Description)', kind: 'text', width: '25%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '8%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '9%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '11%' },
        { key: 'discount', label: 'خصم البند (د.ل)', kind: 'number', width: '9%' },
        { key: 'lineTotal', label: 'الإجمالي (د.ل)', kind: 'computed', compute: lineTotal, width: '11%' },
      ],
    },

    {
      key: 'totals',
      title: '💵 الإجماليات — Totals',
      kind: 'fields',
      columns: 4,
      fields: [
        { key: 'subtotal', label: 'الإجمالي الفرعي (د.ل)', kind: 'computed', compute: (d) => subtotal(d.lines) },
        { key: 'taxRate', label: 'نسبة الضريبة (%)', kind: 'number' },
        { key: 'taxAmount', label: 'قيمة الضريبة (د.ل)', kind: 'computed', compute: taxAmount },
        { key: 'invoiceDiscount', label: 'خصم الفاتورة (د.ل)', kind: 'number' },
        { key: 'grandTotal', label: 'الإجمالي المستحق (د.ل)', kind: 'computed', compute: grandTotal },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'preparedBy', label: 'معدّ الفاتورة (Prepared By)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المالية (Finance Approval)', source: 'approver' },
    { key: 'customer', label: 'استلام العميل (Customer)', source: null },
  ],

  warnings: invoiceWarnings,
};

export default schema;
