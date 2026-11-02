/**
 * نقل/تاكسي (TAXI) — مستندُ تشغيلٍ (المرحلة س).
 *
 * واقعةُ صرفٍ تشغيليّةٌ بحقولها: السائقُ/الشركة والمسارُ والغرض. تُقيَّد عند
 * «منجَز» **مصروفَ نقلٍ مبوّبًا** (`EXPENSE:TRANSPORT` Dr / نقد أو بنك Cr) —
 * فتُخصَم من الخزينة وتظهر في تقرير المصاريف بمحلّها. لا تمسّ المخزونَ ولا الذمم.
 */

export function taxiWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ الأجرة صفرٌ — أدخِل المبلغ المدفوع');
  if (!String(h.purpose || h.fromTo || '').trim()) out.push('الغرضُ أو المسارُ غيرُ مُدخل — وثّق سببَ النقل');
  return out;
}

const schema = {
  type: 'TAXI',
  stage: 7,
  titleAr: 'نقل / تاكسي',
  titleEn: 'Transport / Taxi',
  formCode: 'BFP-TAXI-001',
  orientation: 'portrait',

  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات النقل — Transport Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'tripDate', label: 'التاريخ (Date)', kind: 'date', required: true },
        { key: 'vendor', label: 'السائق / الشركة (Driver/Vendor)', kind: 'text' },
        { key: 'fromTo', label: 'المسار (من ← إلى)', kind: 'text' },
        { key: 'purpose', label: 'الغرض (Purpose)', kind: 'text' },
        {
          key: 'paymentMethod',
          label: 'طريقة الدفع (Method)',
          kind: 'select',
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'amount', label: 'الأجرة (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'receiver', label: 'المستلِم (Received By)', source: null },
  ],

  warnings: taxiWarnings,
};

export default schema;
