/**
 * مخطّط الإشعار الدائن (CN) — المرحلة 11، خاتمة مسار المرتجعات.
 *
 * الأصل الورقي: `public/forms/form_Credit Note.html`.
 *
 * هو **الأثر المالي للمرتجع**: مبلغٌ يُردّ للعميل أو يُخصم من المورّد. ولذلك
 * لا يُصدَر إلا مشتقًّا من **إشعار إرجاع معتمَد** (`links.RET`) — فلا خصمٌ
 * ماليّ بلا مرتجعٍ موثَّق ومعتمَد جودةً. واعتماده يشمل المالية.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم مذكرة الخصم» كان يُكتب ⇒ صار `CN-2026-####`.
 *  · بنوده كانت تُنسخ من المرتجع يدويًّا ⇒ صارت تُشتقّ منه.
 *  · «القيمة الإجمالية» صارت محسوبة من البنود.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** قيمة بند الإشعار = الكمية × سعر الوحدة. */
export function creditLineValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
}

/** إجمالي مبلغ الإشعار الدائن. */
export function creditTotal(lines) {
  return (lines || []).reduce((total, line) => total + creditLineValue(line), 0);
}

/**
 * تحذيرات الإشعار: بلا مرجع مرتجع (خصمٌ بلا سند) · بندٌ بلا سعر (لا يُحسب
 * مبلغ الخصم) · بلا مستفيد محدَّد.
 */
export function creditWarnings(doc) {
  const out = [];
  const h = doc?.header || {};

  if (!String(h.returnRef || '').trim()) {
    out.push('لا مرجع إشعار إرجاع — الخصم الماليّ يُبنى على مرتجعٍ معتمَد لا على طلب');
  }
  if (!String(h.beneficiary || '').trim()) {
    out.push('المستفيد من الإشعار غير محدَّد (عميل / مورّد)');
  }

  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  const noPrice = lines.filter((l) => !(Number(l?.unitPrice) > 0));
  if (noPrice.length) out.push(`${noPrice.length} بندًا بلا سعر — لا يُحسب مبلغ الخصم`);

  return out;
}

const schema = {
  type: 'CN',
  stage: 11,
  titleAr: 'إشعار دائن',
  titleEn: 'Credit Note',
  formCode: 'BFP-CN-001',
  orientation: 'portrait',

  /** الاعتماد للمالية والمدير — الإشعار الدائن التزامٌ ماليّ. */
  roles: {
    create: ['return_manager', 'warehouse_manager', 'finance_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الإشعار الدائن — Credit Note Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'issueDate', label: 'تاريخ الإصدار (Issue Date)', kind: 'date', required: true },
        {
          key: 'returnRef',
          label: 'رقم إشعار الإرجاع المرجعي (Return Ref.)',
          kind: 'text',
          required: true,
          hint: 'يُملأ تلقائيًّا عند اشتقاق الإشعار من مرتجع معتمَد',
        },
        {
          key: 'beneficiaryType',
          label: 'نوع المستفيد',
          kind: 'select',
          options: ['عميل', 'مورّد', 'فرع'],
        },
        { key: 'beneficiary', label: 'اسم المستفيد (Beneficiary)', kind: 'text', required: true },
        { key: 'supplierNotified', label: 'هل أُبلغ المورد؟', kind: 'select', options: ['نعم', 'لا', 'لا ينطبق'] },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الخصم — Credit Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '28%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '11%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '13%' },
        { key: 'lineValue', label: 'القيمة (د.ل)', kind: 'computed', compute: creditLineValue, width: '13%' },
        { key: 'reason', label: 'سبب الخصم', kind: 'text', width: '11%' },
      ],
    },

    {
      key: 'summary',
      title: '💰 إجمالي الخصم — Credit Total',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        { key: 'creditTotal', label: 'إجمالي مبلغ الإشعار (د.ل)', kind: 'computed', compute: (d) => Math.round(creditTotal(d.lines) * 100) / 100 },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'preparedBy', label: 'مُعدّ الإشعار (Prepared By)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'whManager', label: 'مدير المستودع (WH Manager)', source: null },
  ],

  warnings: creditWarnings,
};

export default schema;
