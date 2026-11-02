/**
 * سدادُ سلفةِ عامل (ADVR) — ذ.
 *
 * يُقفل ما فتحته `ADV`: يُقيَّد **مدينًا النقد** (أو البنك عند التحويل) **ودائنًا
 * سلفَ العمّال** عند «منجَز»، فينقص الدَّينُ على العامل في دفتر الذمم. التصحيحُ
 * قيدٌ مضادٌّ لا محوٌ — كسائر الدفتر الملحق-فقط.
 */

export function advrWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.worker || h.workerCode || '').trim()) out.push('العامل غير مُدخل — لا يُسدَّد لمجهول');
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ السداد صفرٌ — أدخِل المبلغ المُسترَدّ');
  return out;
}

const schema = {
  type: 'ADVR',
  stage: 7,
  titleAr: 'سداد سلفة عامل',
  titleEn: 'Advance Repayment',
  formCode: 'BFP-ADVR-001',
  orientation: 'portrait',

  roles: {
    create: ['finance_manager', 'treasury', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات السداد — Repayment Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'repayDate', label: 'تاريخ السداد (Date)', kind: 'date', required: true },
        { key: 'worker', label: 'العامل / الموظّف (Worker)', kind: 'text', required: true },
        { key: 'workerCode', label: 'رمز العامل (Worker Code)', kind: 'text', ltr: true },
        {
          key: 'method',
          label: 'طريقة السداد (Method)',
          kind: 'select',
          // نقدًا أو تحويلًا مصرفيًّا. «الحسمُ من الراتب» تسويةٌ غيرُ نقديّةٍ تحتاج
          // حسابَ رواتبَ مستحقّة — مؤجّلةٌ حتّى تُبنى، فلا يُقيَّد قبضٌ نقديٌّ وهميّ.
          options: ['نقدًا', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'advanceRef', label: 'مرجع السلفة (Advance Ref.)', kind: 'text', ltr: true },
        { key: 'amount', label: 'المبلغ المُسترَدّ (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'receiver', label: 'القابض (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'workerSign', label: 'توقيع العامل (Worker)', source: null },
  ],

  warnings: advrWarnings,
};

export default schema;
