/**
 * مخطّط سند صرف الخزينة (PV) — المرحلة 04 من دورة المشتريات الداخلية.
 *
 * بعد اعتماد أمر الشراء، تُصدر الخزينةُ سند الصرف بقيمة الأمر للمورّد،
 * فيعتمده المدير المالي، ثمّ يُشترى الطلب فعليًّا. الرقم `PV-2026-####`.
 *
 * مرجعه الإلزاميّ أمرُ الشراء (`ipoRef`) — فلا صرفَ بلا أمرٍ معتمَد. الفصل
 * بين مَن يعتمد (المالي) ومَن يصرف (الخزينة) حارسٌ رقابيّ لا يُتجاوَز.
 */

/** إجمالي البند = الكمية × سعر الوحدة. */
export function lineTotal(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
}

/** إجماليّ المبلغ المصروف — مجموع البنود. */
export function disbursedTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineTotal(line), 0);
}

/** تحذيرات السند: بلا مستفيدٍ بالصرف، أو طريقة صرفٍ بلا مرجع. */
export function pvWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.payee || '').trim()) {
    out.push('المستفيد بالصرف (المورّد) غير مُدخل — لا يُصرف لمجهول');
  }
  const method = String(h.paymentMethod || '').trim();
  if ((method === 'شيك' || method === 'تحويل مصرفي') && !String(h.referenceNo || '').trim()) {
    out.push(`طريقة الصرف «${method}» بلا رقم مرجعي (شيك/تحويل) — أثبِت المرجع`);
  }
  if (disbursedTotal(doc?.lines) <= 0) {
    out.push('قيمة الصرف صفر — أدرِج بنود المبلغ المستحقّ');
  }
  return out;
}

const schema = {
  type: 'PV',
  stage: 4,
  titleAr: 'سند صرف الخزينة',
  titleEn: 'Treasury Payment Voucher',
  formCode: 'BFP-PV-001',
  orientation: 'portrait',

  /** الإصدار لأمين الخزينة، والاعتماد للمدير المالي — فصل الصرف عن الاعتماد. */
  roles: {
    create: ['treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات السند — Voucher Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'voucherDate', label: 'تاريخ الصرف (Date)', kind: 'date', required: true },
        {
          key: 'ipoRef',
          label: 'رقم أمر الشراء المرجعي (IPO Ref.)',
          kind: 'docref',
          docType: 'IPO',
          required: true,
          hint: 'اكتب رقم أمر الشراء (IPO-…) — لا صرفَ بلا أمرٍ معتمَد',
        },
        { key: 'payee', label: 'المستفيد بالصرف / المورّد (Payee)', kind: 'text', required: true },
        {
          key: 'paymentMethod',
          label: 'طريقة الصرف (Payment Method)',
          kind: 'select',
          options: ['نقدًا', 'شيك', 'تحويل مصرفي'],
        },
        { key: 'referenceNo', label: 'رقم الشيك / التحويل (Reference No.)', kind: 'text', ltr: true },
        { key: 'department', label: 'الإدارة المستفيدة (Beneficiary Dept.)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود المبلغ المصروف — Disbursed Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'description', label: 'البيان (Description)', kind: 'text', width: '42%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '13%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '16%' },
        { key: 'lineTotal', label: 'الإجمالي (د.ل)', kind: 'computed', compute: lineTotal, width: '16%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '13%' },
      ],
    },

    {
      key: 'totals',
      title: '💰 إجماليّ الصرف — Total',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'disbursedTotal',
          label: 'إجماليّ المبلغ المصروف (د.ل)',
          kind: 'computed',
          compute: (d) => disbursedTotal(d.lines),
        },
      ],
      extraFields: [
        { key: 'notes', label: 'ملاحظات الخزينة (Treasury Notes)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'treasurer', label: 'أمين الخزينة (الصارف)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'receiver', label: 'المستلِم (Received By)', source: null },
  ],

  warnings: pvWarnings,
};

export default schema;
