/**
 * سلفةُ عامل (ADV) — ذ.
 *
 * نقدٌ يُدفع للعامل سلفةً: يُقيَّد **مدينًا سلفَ العمّال** (أصلٌ عليه) ودائنًا
 * النقد عند «منجَز»، ويُنشئ دَينًا على العامل في دفتر الذمم (طرفُ العامل).
 * يُسترَدُّ أو يُحسَم بمستند `ADVR`. تذكيرُ الاستحقاق متاحٌ بحقل `dueDate`.
 */

export function advWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.worker || h.workerCode || '').trim()) out.push('العامل غير مُدخل — لا تُصرَف سلفةٌ لمجهول');
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ السلفة صفرٌ — أدخِل المبلغ المصروف');
  return out;
}

const schema = {
  type: 'ADV',
  stage: 7,
  titleAr: 'سلفة عامل',
  titleEn: 'Worker Advance',
  formCode: 'BFP-ADV-001',
  orientation: 'portrait',

  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات السلفة — Advance Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'advanceDate', label: 'تاريخ السلفة (Date)', kind: 'date', required: true },
        { key: 'worker', label: 'العامل / الموظّف (Worker)', kind: 'text', required: true },
        { key: 'workerCode', label: 'رمز العامل (Worker Code)', kind: 'text', ltr: true },
        { key: 'dueDate', label: 'تاريخ السداد المتوقّع (Due)', kind: 'date' },
        {
          key: 'paymentMethod',
          label: 'طريقة الصرف (Method)',
          kind: 'select',
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'amount', label: 'مبلغ السلفة (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'workerSign', label: 'توقيع العامل (Received By)', source: null },
  ],

  warnings: advWarnings,
};

export default schema;
