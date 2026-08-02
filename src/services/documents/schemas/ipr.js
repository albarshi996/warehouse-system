/**
 * مخطّط طلب المشتريات الداخلي (IPR) — المرحلة 01 من **دورة المشتريات الداخلية**:
 * طلبات الإدارات والأقسام الموجَّهة للإدارة المالية (لا الشراء المخزنيّ).
 *
 * الفرق عن `PR` (سلسلة الوارد المخزنيّة): لا SKU ولا باركود ولا حركة مخزون —
 * أصنافٌ/خدماتٌ نصّية يطلبها قسمٌ ما، تمرّ باعتماد المدير المالي ثم العروض
 * فأمر الشراء فالصرف فالتسليم. الرقم النظاميّ `IPR-2026-####`.
 *
 * السلسلة: IPR → RFQ → IPO → PV → DLV (خطّية، يفرض تسلسلَها حقلُ المرجع
 * الإلزاميّ في كلّ حلقة عبر حارس «لا إنجاز قبل اعتماد الأب»).
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
 * تحذيرات الطلب: تجاوز الميزانية المتاحة، وبندٌ بكمية بلا وصف.
 * تحذير لا حجب — القرار إداريّ، لكنه يُرى ويُوثَّق باسم صاحبه.
 */
export function iprWarnings(doc) {
  const out = [];
  const available = Number(doc?.header?.availableBudget);
  const total = estimatedTotal(doc?.lines);
  if (available && total > available) {
    out.push(`الإجمالي التقديري ${total.toLocaleString('ar-LY')} د.ل يتجاوز الميزانية المتاحة ${available.toLocaleString('ar-LY')} د.ل`);
  }
  const filled = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (filled.some((l) => !String(l?.description || '').trim())) {
    out.push('بندٌ بكمية بلا وصف — حدّد الصنف أو الخدمة المطلوبة');
  }
  return out;
}

const schema = {
  type: 'IPR',
  stage: 1,
  titleAr: 'طلب مشتريات داخلي',
  titleEn: 'Internal Procurement Request',
  formCode: 'BFP-IPR-001',
  orientation: 'portrait',

  /** الطلب حقُّ الإدارة الطالبة، واعتماده للمدير المالي، واستلامه للمشتريات. */
  roles: {
    create: ['department_user', 'purchase_officer', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['purchase_officer', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الطلب — Request Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'requestDate', label: 'تاريخ الطلب (Request Date)', kind: 'date', required: true },
        { key: 'department', label: 'الإدارة / القسم الطالب (Requesting Dept.)', kind: 'text', required: true },
        {
          key: 'requester',
          label: 'مُقدّم الطلب (Requester)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الطلب',
        },
        { key: 'beneficiary', label: 'المستفيد (Beneficiary)', kind: 'text', required: true },
        { key: 'neededBy', label: 'تاريخ الحاجة (Needed By)', kind: 'date' },
        {
          key: 'priority',
          label: 'درجة الأولوية (Priority)',
          kind: 'select',
          options: ['عاجل', 'عادي', 'منخفض'],
        },
      ],
      extraFields: [
        { key: 'justification', label: 'المبرّر / الغرض من الطلب (Justification)', kind: 'textarea', required: true },
      ],
    },

    {
      key: 'lines',
      title: '📦 الأصناف / الخدمات المطلوبة — Requested Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'description', label: 'الصنف / الخدمة المطلوبة', kind: 'text', width: '34%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '12%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '12%' },
        { key: 'estPrice', label: 'السعر التقديري (د.ل)', kind: 'number', width: '15%' },
        {
          key: 'estTotal',
          label: 'الإجمالي التقديري (د.ل)',
          kind: 'computed',
          compute: lineEstimate,
          width: '15%',
        },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '12%' },
      ],
    },

    {
      key: 'budget',
      title: '💰 الميزانية والتقدير — Budget',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'costCenter', label: 'مركز التكلفة / بند الميزانية (Cost Center)', kind: 'text' },
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
    { key: 'requester', label: 'مُقدّم الطلب / المستفيد (Requester)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'procurement', label: 'استلام فريق المشتريات (Procurement)', source: null },
  ],

  warnings: iprWarnings,
};

export default schema;
