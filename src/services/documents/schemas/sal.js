/**
 * صرفُ راتب (SAL) — ذ.
 *
 * مصروفٌ نقديٌّ باسم العامل: يُقيَّد **مدينًا رواتبَ وأجورًا** ودائنًا النقد
 * (أو البنك) عند «منجَز». لا يمسّ دفترَ الذمم (الراتبُ أجرُ عملٍ لا دَين) —
 * وسلفةُ العامل تُسدَّد بمستندها `ADVR` لا بالحسم داخل هذا المستند، فيبقى كلٌّ
 * مفردَ الغرض والدفترُ نظيفًا.
 */

export function salWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.worker || h.workerCode || '').trim()) out.push('العامل غير مُدخل — لا يُصرَف راتبٌ لمجهول');
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ الراتب صفرٌ — أدخِل المبلغ المصروف');
  return out;
}

const schema = {
  type: 'SAL',
  stage: 7,
  titleAr: 'صرف راتب',
  titleEn: 'Salary Payment',
  formCode: 'BFP-SAL-001',
  orientation: 'portrait',

  /** الإدخالُ والصرفُ للمالية والخزينة، والاعتمادُ للمالية — من صرف لا يعتمد صرفه. */
  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الصرف — Salary Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'payDate', label: 'تاريخ الصرف (Date)', kind: 'date', required: true },
        { key: 'worker', label: 'العامل / الموظّف (Worker)', kind: 'text', required: true },
        { key: 'workerCode', label: 'رمز العامل (Worker Code)', kind: 'text', ltr: true },
        { key: 'period', label: 'الشهر / المدّة (Period)', kind: 'text' },
        {
          key: 'paymentMethod',
          label: 'طريقة الصرف (Method)',
          kind: 'select',
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'amount', label: 'المبلغ المصروف (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'workerSign', label: 'توقيع العامل (Received By)', source: null },
  ],

  warnings: salWarnings,
};

export default schema;
