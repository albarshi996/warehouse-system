/**
 * فاتورةُ مورّدٍ — نمطُ «القيمة فقط» (ذ · اختارها المالك صراحةً).
 *
 * ═══ لماذا نمطان ═══
 * المحلُّ الصغير قد لا يُفصّل أصناف فاتورة المورّد — يكفيه أن يُثبت **كم يَدين**
 * ومتى يستحقّ. فهذا النمط يُقيَّد محاسبيًّا (مشترياتٌ مدينة · ذمّةُ المورّد
 * دائنة) **بلا مسٍّ للمخزون** (ليس في `POSTING_RULES`). والنمطُ الآخر `SINVI`
 * يُفصّل الأصناف ويقيّدها مخزونًا.
 *
 * ═══ الأثر ═══
 * دفترُ الذمم (مورّدٌ مدين) + القيدُ المزدوجُ المحلّيُّ عند «منجَز» — لا رفَّ
 * يتحرّك. وتاريخُ الاستحقاق يغذّي تذكيرَ السداد.
 */

/** تحذيراتُ الفاتورة — لا يُدان مجهولٌ ولا بقيمةٍ صفر. */
export function sinvWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.supplier || h.supplierCode || '').trim()) {
    out.push('المورّد غير مُدخل — لا تُقيَّد ذمّةٌ لمجهول');
  }
  if ((Number(h.amount) || 0) <= 0) out.push('قيمةُ الفاتورة صفرٌ — أدخِل المبلغ المستحقّ للمورّد');
  const inv = String(h.invoiceDate || '').slice(0, 10);
  const due = String(h.dueDate || '').slice(0, 10);
  if (inv && due && due < inv) out.push('تاريخُ الاستحقاق قبل تاريخ الفاتورة — راجِع المواعيد');
  return out;
}

const schema = {
  type: 'SINV',
  stage: 7,
  titleAr: 'فاتورة مورّد (قيمة)',
  titleEn: 'Supplier Invoice (Value Only)',
  formCode: 'BFP-SINV-001',
  orientation: 'portrait',

  /** الإدخالُ للمشتريات والمالية، والاعتمادُ والإنجازُ للمالية ومدير المستودع. */
  roles: {
    create: ['purchase_officer', 'finance_manager', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الفاتورة — Invoice Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'invoiceDate', label: 'تاريخ الفاتورة (Date)', kind: 'date', required: true },
        { key: 'supplier', label: 'المورّد (Supplier)', kind: 'text', required: true },
        { key: 'supplierCode', label: 'رمز المورّد (Supplier Code)', kind: 'text', ltr: true },
        { key: 'reference', label: 'رقم الفاتورة لدى المورّد (Ref.)', kind: 'text', ltr: true },
        { key: 'dueDate', label: 'تاريخ الاستحقاق (Due Date)', kind: 'date' },
        { key: 'amount', label: 'قيمة الفاتورة (د.ل)', kind: 'number', required: true },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'enteredBy', label: 'أدخلها (Entered By)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'archived', label: 'حُفظت (Filed)', source: null },
  ],

  warnings: sinvWarnings,
};

export default schema;
