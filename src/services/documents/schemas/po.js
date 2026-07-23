/**
 * مخطّط أمر الشراء (PO) — المرحلة 02، الحلقة الثانية في سلسلة F2.
 *
 * الأصل الورقي: `public/forms/form_PO.html`.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم أمر الشراء» كان يُكتب بيد الموظّف ⇒ صار `PO-2026-####`.
 *  · «رقم طلب الشراء المرجعي» كان يُنسخ بالقلم ⇒ صار **رابطًا حقيقيًّا**
 *    يُملأ تلقائيًّا حين يُشتقّ الأمر من طلبه (`links.PR`).
 *  · الإجمالي الفرعي والخصم والصافي كانت تُحسب بالآلة الحاسبة ⇒ صارت محسوبة.
 *  · «إجمالي البند» (كمية × سعر) كان بالقلم ⇒ صار عمودًا محسوبًا.
 *
 * وهذا المستند هو **مرجع المطابقة الثلاثية**: كمياته وأسعاره هي ما تُقاس
 * عليها كمياتُ الاستلام ونتيجةُ الفحص (انظر `matching.js`).
 */

/** إجمالي البند = الكمية × سعر الوحدة. */
export function lineTotal(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
}

/** الإجمالي الفرعي قبل الخصم. */
export function subtotal(lines) {
  return (lines || []).reduce((total, line) => total + lineTotal(line), 0);
}

/** الصافي بعد الخصم — لا يقلّ عن صفر مهما كان الخصم. */
export function netTotal(doc) {
  const gross = subtotal(doc?.lines);
  const discount = Number(doc?.header?.discount) || 0;
  return Math.max(0, gross - discount);
}

/** تحذير: خصم يتجاوز قيمة الأمر — غالبًا خطأ إدخال لا نيّة. */
export function poWarnings(doc) {
  const out = [];
  const gross = subtotal(doc?.lines);
  const discount = Number(doc?.header?.discount) || 0;
  if (discount > gross && gross > 0) {
    out.push(`الخصم ${discount.toLocaleString('ar-LY')} د.ل يتجاوز إجمالي الأمر ${gross.toLocaleString('ar-LY')} د.ل`);
  }
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (lines.some((l) => !(Number(l?.unitPrice) > 0))) {
    out.push('بندٌ بكمية بلا سعر وحدة — الأمر يُلزم المورّد بسعرٍ غير مذكور');
  }
  return out;
}

const schema = {
  type: 'PO',
  stage: 2,
  titleAr: 'أمر الشراء',
  titleEn: 'Purchase Order',
  formCode: 'BFP-PO-001',
  orientation: 'portrait',

  /** الإنشاء للمشتريات، والاعتماد للمدير — لا يعتمد المشتري أمره بنفسه. */
  roles: {
    create: ['purchase_officer', 'warehouse_manager'],
    approve: ['warehouse_manager', 'finance_manager'],
    complete: ['purchase_officer', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات أمر الشراء — PO Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'issueDate', label: 'تاريخ الإصدار (Issue Date)', kind: 'date', required: true },
        { key: 'requiredDelivery', label: 'تاريخ التسليم المطلوب (Required Delivery)', kind: 'date', required: true },
        {
          key: 'prRef',
          label: 'رقم طلب الشراء المرجعي (PR Ref.)',
          kind: 'text',
          hint: 'يُملأ تلقائيًّا عند اشتقاق الأمر من طلب شراء',
        },
        { key: 'warehouse', label: 'الفرع / المستودع (Branch/Warehouse)', kind: 'text' },
        { key: 'incoterms', label: 'شروط التسليم (Incoterms)', kind: 'text' },
        { key: 'paymentTerms', label: 'شروط الدفع (Payment Terms)', kind: 'text' },
      ],
    },

    {
      key: 'supplier',
      title: '🏢 بيانات المورد — Supplier',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'supplier', label: 'اسم المورد (Supplier Name)', kind: 'text', required: true },
        { key: 'supplierCode', label: 'رمز المورد (Supplier Code)', kind: 'text' },
        { key: 'contractNo', label: 'رقم العقد / الاتفاقية (Contract No.)', kind: 'text' },
        { key: 'contactPerson', label: 'جهة التواصل (Contact Person)', kind: 'text' },
      ],
      extraFields: [
        { key: 'supplierAddress', label: 'عنوان المورد (Supplier Address)', kind: 'textarea' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود أمر الشراء — Order Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'وصف الصنف (Description)', kind: 'text', width: '27%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'qty', label: 'الكمية المطلوبة', kind: 'number', width: '10%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '11%' },
        { key: 'lineTotal', label: 'الإجمالي (د.ل)', kind: 'computed', compute: lineTotal, width: '11%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '8%' },
      ],
    },

    {
      key: 'totals',
      title: '💰 الإجماليات — Totals',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'subtotal',
          label: 'الإجمالي الفرعي (د.ل)',
          kind: 'computed',
          compute: (d) => subtotal(d.lines),
        },
        { key: 'discount', label: 'الخصم (د.ل)', kind: 'number' },
        {
          key: 'netTotal',
          label: 'الصافي المستحق (د.ل)',
          kind: 'computed',
          compute: netTotal,
        },
      ],
      extraFields: [
        { key: 'deliveryWindow', label: 'معلومات نافذة التسليم (Delivery Window)', kind: 'textarea' },
        { key: 'notes', label: 'ملاحظات إضافية (Additional Notes)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'preparedBy', label: 'معد أمر الشراء (Prepared By)', source: 'creator' },
    { key: 'purchasingManager', label: 'مدير المشتريات (Purchasing Manager)', source: 'approver' },
    { key: 'finance', label: 'المدير المالي (Financial Approval)', source: null },
  ],

  warnings: poWarnings,
};

export default schema;
