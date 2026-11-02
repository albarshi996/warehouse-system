/**
 * مصروفٌ مبوّب (EXP) — ذ · التبويبُ الهجين (قرارُ المالك 2026-11-01).
 *
 * فئةٌ من قائمةٍ ثابتة + ملاحظةٌ حرّة: الفئةُ تُنقّي التقرير، والملاحظةُ تحفظ
 * التفصيل. يُقيَّد **مدينًا مصروفًا مبوّبًا بفئته** (`EXPENSE:<فئة>`) ودائنًا
 * النقد (أو البنك) عند «منجَز». لا يمسّ المخزونَ ولا الذمم.
 *
 * ★ قائمةُ الفئاتِ هنا نسخةُ عرضٍ من `expenseCategories.js` (مصدرُ الحقيقة
 *   الواحد) — وحارسٌ في `exp.test.js` يمنع انحرافَها عنه. تُقيَّد القيمةُ في
 *   حساب الفئة عبر `normalizeCategory` فيردّ النصَّ العربيَّ إلى مفتاحه.
 */

/** الفئاتُ التشغيليّةُ التسع (نصُّها يطابق labelAr في expenseCategories.js). */
export const EXP_CATEGORY_LABELS = [
  'إيجار',
  'صيانة',
  'رسوم تراخيص',
  'نظافة',
  'نقل وتوصيل',
  'مناولة وعمالة يوميّة',
  'إعاشة وضيافة',
  'تشغيل عامّ',
  'أخرى',
];

export function expWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.category || '').trim()) out.push('الفئة غير مختارة — اختَر فئةَ المصروف');
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ المصروف صفرٌ — أدخِل المبلغ المصروف');
  return out;
}

const schema = {
  type: 'EXP',
  stage: 7,
  titleAr: 'مصروف مبوّب',
  titleEn: 'Classified Expense',
  formCode: 'BFP-EXP-001',
  orientation: 'portrait',

  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات المصروف — Expense Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'expenseDate', label: 'تاريخ المصروف (Date)', kind: 'date', required: true },
        { key: 'category', label: 'الفئة (Category)', kind: 'select', options: EXP_CATEGORY_LABELS, required: true },
        { key: 'beneficiary', label: 'المستفيد / الجهة (Beneficiary)', kind: 'text' },
        {
          key: 'paymentMethod',
          label: 'طريقة الصرف (Method)',
          kind: 'select',
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'amount', label: 'المبلغ (د.ل)', kind: 'number', required: true },
        { key: 'note', label: 'البيان (ملاحظة حرّة)', kind: 'text' },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات إضافيّة', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'archived', label: 'حُفظ (Filed)', source: null },
  ],

  warnings: expWarnings,
};

export default schema;
