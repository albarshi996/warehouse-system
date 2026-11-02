/**
 * نظافة (CLEAN) — مستندُ تشغيلٍ (المرحلة س).
 *
 * صرفُ خدمةِ نظافةٍ (جهةٌ · مكانٌ · مدّة). تُقيَّد عند «منجَز» **مصروفَ نظافةٍ
 * مبوّبًا** (`EXPENSE:CLEANING` Dr / نقد أو بنك Cr) — فتُخصَم من الخزينة وتظهر
 * في المصاريف بمحلّها. لا تمسّ المخزونَ ولا الذمم.
 */

export function cleanWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ الخدمة صفرٌ — أدخِل المبلغ المدفوع');
  if (!String(h.provider || h.area || '').trim()) out.push('الجهةُ أو المكانُ غيرُ مُدخل — وثّق خدمةَ النظافة');
  return out;
}

const schema = {
  type: 'CLEAN',
  stage: 7,
  titleAr: 'نظافة',
  titleEn: 'Cleaning Service',
  formCode: 'BFP-CLEAN-001',
  orientation: 'portrait',

  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الخدمة — Cleaning Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'serviceDate', label: 'التاريخ (Date)', kind: 'date', required: true },
        { key: 'provider', label: 'الجهة / العامل (Provider)', kind: 'text' },
        { key: 'area', label: 'المكان / المساحة (Area)', kind: 'text' },
        { key: 'period', label: 'المدّة (Period)', kind: 'text' },
        {
          key: 'paymentMethod',
          label: 'طريقة الدفع (Method)',
          kind: 'select',
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'amount', label: 'المبلغ (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'receiver', label: 'المستلِم (Received By)', source: null },
  ],

  warnings: cleanWarnings,
};

export default schema;
