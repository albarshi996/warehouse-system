/**
 * مخطّط أمر الشراء الداخلي (IPO) — المرحلة 03 من دورة المشتريات الداخلية.
 *
 * بعد اعتماد الترسية، يُصدر فريقُ المشتريات أمر الشراء للمورّد الفائز
 * بالأسعار المتَّفق عليها، فيعتمده المدير المالي. الرقم `IPO-2026-####`.
 *
 * مرجعه الإلزاميّ كشفُ العروض (`rfqRef`) — فلا أمرَ شراء بلا ترسيةٍ معتمَدة
 * (حارس «لا إنجاز قبل اعتماد الأب»). ويحمل مرجع الطلب الأصليّ للسلسلة.
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

/** تحذيرات الأمر: خصمٌ يتجاوز القيمة، أو بندٌ بكمية بلا سعر. */
export function ipoWarnings(doc) {
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
  type: 'IPO',
  stage: 3,
  titleAr: 'أمر شراء داخلي',
  titleEn: 'Internal Purchase Order',
  formCode: 'BFP-IPO-001',
  orientation: 'portrait',

  /** الإصدار للمشتريات، والاعتماد للمدير المالي — لا يعتمد المشتري أمره بنفسه. */
  roles: {
    create: ['purchase_officer', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
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
        {
          key: 'rfqRef',
          label: 'رقم كشف العروض المرجعي (RFQ Ref.)',
          kind: 'docref',
          docType: 'RFQ',
          required: true,
          hint: 'اكتب رقم كشف العروض (RFQ-…) — لا أمر شراء بلا ترسيةٍ معتمَدة',
        },
        {
          key: 'iprRef',
          label: 'رقم الطلب الأصلي (IPR Ref.)',
          kind: 'docref',
          docType: 'IPR',
          hint: 'يُملأ من سلسلة الروابط — مرجع الطلب الذي بدأ الدورة',
        },
        { key: 'department', label: 'الإدارة المستفيدة (Beneficiary Dept.)', kind: 'text' },
        { key: 'beneficiary', label: 'المستفيد (Beneficiary)', kind: 'text' },
        { key: 'requiredDelivery', label: 'تاريخ التوريد المطلوب (Required Delivery)', kind: 'date' },
      ],
    },

    {
      key: 'supplier',
      title: '🏢 بيانات المورّد — Supplier',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'supplier', label: 'اسم المورّد الفائز (Supplier)', kind: 'text', required: true },
        { key: 'supplierPhone', label: 'هاتف المورّد (Phone)', kind: 'text', ltr: true },
        { key: 'paymentTerms', label: 'شروط الدفع (Payment Terms)', kind: 'text' },
      ],
      extraFields: [
        { key: 'supplierAddress', label: 'عنوان المورّد (Supplier Address)', kind: 'textarea' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود أمر الشراء — Order Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'description', label: 'الصنف / الخدمة (Description)', kind: 'text', width: '34%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '12%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '11%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '15%' },
        { key: 'lineTotal', label: 'الإجمالي (د.ل)', kind: 'computed', compute: lineTotal, width: '15%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '13%' },
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
          label: 'الصافي المستحقّ (د.ل)',
          kind: 'computed',
          compute: netTotal,
        },
      ],
      extraFields: [
        { key: 'notes', label: 'ملاحظات إضافية (Additional Notes)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'preparedBy', label: 'أعدّ الأمر (المشتريات)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'generalManager', label: 'اعتماد الإدارة العامة (GM)', source: null },
  ],

  warnings: ipoWarnings,
};

export default schema;
