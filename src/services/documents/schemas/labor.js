/**
 * أجرةُ عمالة (LABOR) — مستندُ تشغيلٍ (المرحلة س).
 *
 * صرفُ أجورِ عمالةٍ يوميّةٍ أو طاقمٍ لعملٍ بعينه. تُقيَّد عند «منجَز» **مصروفَ
 * مناولةٍ وعمالةٍ مبوّبًا** (`EXPENSE:HANDLING` Dr / نقد أو بنك Cr). العدّةُ
 * والأجرةُ اليوميّةُ للتوثيق، والمبلغُ المدفوعُ هو ما يُقيَّد.
 */

export function laborWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ الأجرة صفرٌ — أدخِل المبلغ المدفوع');
  if (!String(h.task || h.crew || '').trim()) out.push('العملُ أو الطاقمُ غيرُ مُدخل — وثّق ما أُنجز ومن أنجزه');
  return out;
}

const schema = {
  type: 'LABOR',
  stage: 7,
  titleAr: 'أجرة عمالة',
  titleEn: 'Labor Wage',
  formCode: 'BFP-LABOR-001',
  orientation: 'portrait',

  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات العمالة — Labor Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'workDate', label: 'التاريخ (Date)', kind: 'date', required: true },
        { key: 'crew', label: 'العامل / الطاقم (Crew)', kind: 'text' },
        {
          key: 'laborType',
          label: 'نوع العمالة (Labor Type)',
          kind: 'select',
          options: ['عُرضة', 'مياومة', 'طاقم', 'دائمة'],
          required: true,
          hint: 'عُرضة: عمالةٌ تُستدعى عند الحاجة. مياومة: بأجرٍ يوميّ. طاقم: فريقٌ متعاقَد. دائمة: على رأس العمل.',
        },
        { key: 'task', label: 'العمل المنجَز (Task)', kind: 'text' },
        { key: 'workers', label: 'عدد العمّال', kind: 'number' },
        { key: 'dayRate', label: 'الأجرة اليوميّة (د.ل)', kind: 'number' },
        {
          key: 'paymentMethod',
          label: 'طريقة الدفع (Method)',
          kind: 'select',
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'amount', label: 'إجماليّ المدفوع (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'receiver', label: 'المستلِم (Received By)', source: null },
  ],

  warnings: laborWarnings,
};

export default schema;
