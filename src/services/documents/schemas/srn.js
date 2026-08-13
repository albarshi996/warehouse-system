/**
 * مخطّط إشعار رفض الاستلام (SRN) — فرعٌ توثيقيّ من مذكرة الاستلام (المرحلة 04).
 *
 * موقعه: عند الاستلام تُرفض بنودٌ من أمر الشراء (كسر · انتهاء · مخالفة مواصفات).
 * فحص الجودة يعزلها في الحجر الصحّي، لكن يبقى **إثباتٌ موقَّعٌ من مندوب المورّد**
 * بأنّ هذه البنود رُفضت ولماذا — كي لا يُنكر المورّد لاحقًا، وكي يُبنى عليه أيّ
 * استرداد. هذا ما يوفّره هذا المستند.
 *
 * قرار المالك (2026-08-04): **إشعارٌ توثيقيّ فقط بلا حركة مخزون جديدة** — فحص
 * الجودة نقل المرفوض إلى الحجر أصلًا، فلا قيد ثانٍ هنا. ولذلك SRN غائبٌ عن
 * `postingRules.js` عمدًا (كالتصريح والإشعار الدائن: أثرٌ توثيقيّ لا مخزنيّ).
 *
 * يُشتقّ من مذكرة استلامٍ معتمَدة فيأخذ **البنود المرفوضة وحدها** (كمية الرفض
 * وسببه) ويحمل رقمها ورقم أمر الشراء مرجعًا — لا يُعاد إدخال شيء.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** تحذيرات الإشعار: بندٌ مرفوضٌ بلا سبب — رفضٌ بلا حجّة لا يُوقّعه مندوب. */
export function rejectionWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  const noReason = lines.filter((l) => !String(l?.reason || '').trim());
  if (noReason.length) out.push(`${noReason.length} بندًا مرفوضًا بلا سبب مكتوب`);
  if (!lines.length) out.push('لا بند مرفوض — لا إشعار رفضٍ بلا بنود');
  return out;
}

const schema = {
  type: 'SRN',
  stage: 4,
  titleAr: 'إشعار رفض الاستلام',
  titleEn: 'Supplier Rejection Note',
  formCode: 'BFP-SRN-001',
  orientation: 'landscape',

  /** 🥇 حارس الجودة حاضر: اعتماد الرفض لفاحص الجودة والمدير. */
  roles: {
    create: ['storekeeper', 'qc_inspector', 'warehouse_manager', 'purchase_officer'],
    approve: ['qc_inspector', 'warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الرفض — Rejection Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'rejectionDate', label: 'تاريخ الرفض (Rejection Date)', kind: 'date', required: true },
        { key: 'supplier', label: 'اسم المورّد (Supplier)', kind: 'text', required: true },
        {
          key: 'grnRef',
          label: 'رقم مذكرة الاستلام (GRN Ref.)',
          kind: 'docref',
          docType: 'GRN',
          hint: 'اكتب رقم مذكرة الاستلام (GRN-…) فيُتعرَّف عليه ويُربط — أو يُملأ عند الاشتقاق',
        },
        { key: 'poRef', label: 'رقم أمر الشراء (PO Ref.)', kind: 'text' },
        // رقم موافقة المورّد على الإرجاع (SAP-9 · يسدّ ف‑٢٢ · المرجع ‹3573›).
        // ليس إلزاميًّا: بعض المورّدين لا يُصدرونه، وإلزامُه يوقف رفضًا صحيحًا
        // انتظارًا لورقة. لكنّه يُطلب لأنّ إرجاعًا بلا موافقةٍ يعود على بابنا.
        {
          key: 'rmaNo',
          label: 'رقم موافقة المورّد على الإرجاع (RMA No.)',
          kind: 'text',
          hint: 'إن أصدره المورّد — يُسهّل قبول الشحنة المرتجعة عنده',
        },
        {
          key: 'receiver',
          label: 'مشرف الاستلام (Receiver)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الإشعار',
        },
        {
          key: 'supplierNotified',
          label: 'هل أُبلغ المورّد؟',
          kind: 'select',
          options: ['نعم', 'لا', 'لا ينطبق'],
        },
      ],
    },

    {
      key: 'lines',
      title: '📦 البنود المرفوضة — Rejected Items',
      kind: 'table',
      note: 'تُشتقّ تلقائيًّا من البنود المرفوضة في مذكرة الاستلام — لا يظهر هنا صنفٌ قُبل.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'qty', label: 'الكمية المرفوضة', kind: 'number', width: '10%' },
        { key: 'reason', label: 'سبب الرفض', kind: 'text', width: '18%' },
        {
          key: 'condition',
          label: 'حالة الصنف',
          kind: 'select',
          options: ['تالف', 'منتهي', 'ناقص', 'مخالف للمواصفات', 'خطأ في الصنف'],
          width: '12%',
        },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '9%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalRejected', label: 'إجمالي الكميات المرفوضة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        {
          key: 'totalValue',
          label: 'القيمة التقديرية للمرفوض (د.ل)',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((t, l) => t + (Number(l?.qty) || 0) * (Number(l?.unitPrice) || 0), 0),
        },
      ],
      extraFields: [
        { key: 'notes', label: 'ملاحظات', kind: 'textarea' },
        { key: 'corrective', label: 'الإجراء المطلوب من المورّد (استبدال / استرداد / إشعار دائن)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'receiver', label: 'مشرف الاستلام (Receiver)', source: 'creator' },
    { key: 'qcInspector', label: 'فاحص الجودة (QC Inspector)', source: 'approver' },
    { key: 'supplierRep', label: 'مندوب المورّد (Supplier Rep.)', source: null },
  ],

  /** الدليل: توقيع مندوب المورّد على الرفض، وصور البنود المرفوضة. */
  attachments: [
    { key: 'supplierSignature', kind: 'signature', label: 'توقيع مندوب المورّد على الرفض' },
    { key: 'goods', kind: 'goods', label: 'صورة البنود المرفوضة' },
  ],

  /** 🔍 الرقابة: يؤكّد المدقّق أن مندوب المورّد وقّع على الرفض وأسبابه. */
  control: {
    requireSignedCopy: true,
    compareFields: ['rejectionDate', 'supplier', 'grnRef', 'totalRejected'],
    checklist: [
      { key: 'items', label: 'البنود المرفوضة وكمياتها مطابقة' },
      { key: 'reasons', label: 'أسباب الرفض موثّقة لكل بند' },
      { key: 'signature', label: 'توقيع مندوب المورّد حاضر على الإشعار' },
    ],
  },

  warnings: rejectionWarnings,
};

export default schema;
