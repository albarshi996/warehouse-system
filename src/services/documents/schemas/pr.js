/**
 * مخطّط طلب الشراء الداخلي (PR) — المرحلة 01 من الدورة، وأوّل حلقة في سلسلة F2.
 *
 * الأصل الورقي: `public/forms/form_PurchaseRequisition.html` — العناوين
 * والحقول منقولة منه، ويبقى كما هو (قاعدة صفر حذف).
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم طلب الشراء» كان يُكتب بيد الموظّف ⇒ صار رقم النظام `PR-2026-####`.
 *  · «الإجمالي التقديري للطلب» كان يُعاد جمعه يدويًّا ⇒ صار محسوبًا من البنود.
 *  · «إجمالي البند» (كمية × سعر) كان يُحسب بالقلم ⇒ صار عمودًا محسوبًا.
 *  · «اسم مُقدّم الطلب» كان يُكتب ⇒ صار من الهوية (مَن أنشأ المستند).
 *  · الأولوية كانت نصًّا حرًّا ⇒ صارت قائمة اختيار.
 */

/** إجمالي البند التقديري = الكمية × السعر التقديري. */
export function lineEstimate(line) {
  return (Number(line?.qty) || 0) * (Number(line?.estPrice) || 0);
}

/** إجمالي الطلب التقديري — أساس مقارنة الميزانية. */
export function estimatedTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineEstimate(line), 0);
}

/**
 * تحذير الميزانية: الطلب يتجاوز المتاح.
 * تحذير لا حجب — قرار الصرف فوق الميزانية إداريّ لا برمجيّ، لكنه يُرى.
 */
export function budgetWarnings(doc) {
  const available = Number(doc?.header?.availableBudget);
  if (!available) return [];
  const total = estimatedTotal(doc?.lines);
  return total > available
    ? [`الإجمالي التقديري ${total.toLocaleString('ar-LY')} د.ل يتجاوز الميزانية المتاحة ${available.toLocaleString('ar-LY')} د.ل`]
    : [];
}

const schema = {
  type: 'PR',
  stage: 1,
  titleAr: 'طلب شراء داخلي',
  titleEn: 'Purchase Requisition',
  formCode: 'BFP-PR-001',
  orientation: 'portrait',

  /**
   * من يفعل ماذا: أي قسم يطلب، والاعتماد لمدير المستودع أو المشتريات.
   * (اعتماد الإدارة المالية خانة توقيع مطبوعة — الحوكمة المالية في S12.)
   */
  roles: {
    create: ['storekeeper', 'warehouse_manager', 'purchase_officer', 'department_user'],
    approve: ['warehouse_manager', 'purchase_officer'],
    complete: ['purchase_officer', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الطلب — Requisition Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'requestDate', label: 'تاريخ الطلب (Request Date)', kind: 'date', required: true },
        { key: 'department', label: 'القسم الطالب (Requesting Dept.)', kind: 'text', required: true },
        {
          key: 'requester',
          label: 'اسم مُقدّم الطلب (Requester)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ المستند',
        },
        { key: 'neededBy', label: 'تاريخ الاحتياج (Needed By)', kind: 'date', required: true },
        {
          key: 'priority',
          label: 'درجة الأولوية (Priority)',
          kind: 'select',
          options: ['عاجل', 'عادي', 'منخفض'],
        },
        { key: 'warehouse', label: 'الفرع / المستودع (Branch/Warehouse)', kind: 'text' },
      ],
      extraFields: [
        { key: 'justification', label: 'سبب الطلب (Justification)', kind: 'textarea', required: true },
      ],
    },

    {
      key: 'lines',
      title: '📦 الأصناف المطلوبة — Requested Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف / الوصف', kind: 'text', width: '26%' },
        { key: 'qty', label: 'الكمية المطلوبة', kind: 'number', width: '10%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'estPrice', label: 'السعر التقديري (د.ل)', kind: 'number', width: '11%' },
        {
          key: 'estTotal',
          label: 'الإجمالي التقديري (د.ل)',
          kind: 'computed',
          compute: lineEstimate,
          width: '11%',
        },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '9%' },
      ],
    },

    {
      key: 'budget',
      title: '💰 الميزانية والاعتماد المالي — Budget',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'budgetCode', label: 'بند الميزانية / مركز التكلفة (Budget Code)', kind: 'text' },
        { key: 'availableBudget', label: 'الميزانية المتاحة (د.ل)', kind: 'number' },
        {
          key: 'estimatedTotal',
          label: 'الإجمالي التقديري للطلب (د.ل)',
          kind: 'computed',
          compute: (d) => estimatedTotal(d.lines),
        },
      ],
      extraFields: [
        { key: 'financeNotes', label: 'ملاحظات الإدارة المالية (Finance Notes)', kind: 'textarea' },
      ],
    },
  ],

  /** خانات التوقيع المطبوعة — الاسمان الأوّلان من الهوية لا من القلم. */
  signatures: [
    { key: 'requester', label: 'مُقدّم الطلب (Requester)', source: 'creator' },
    { key: 'deptManager', label: 'مدير القسم (Dept. Manager)', source: 'approver' },
    { key: 'finance', label: 'اعتماد الإدارة المالية (Finance Approval)', source: null },
  ],

  warnings: budgetWarnings,
};

export default schema;
