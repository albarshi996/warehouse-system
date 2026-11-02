/**
 * فاتورةُ مورّدٍ — نمطُ «بالأصناف» (ذ · اختارها المالك صراحةً).
 *
 * النظيرُ المُفصَّل لـ`SINV`: يذكر الأصناف وكلفتَها، فيُقيَّد **مخزونًا مدينًا**
 * (قيمةُ البضاعة) **وذمّةَ المورّد دائنة**. القيمةُ تُقرأ من البنود (كمّيّة ×
 * كلفة) فلا مجموعٌ مخزَّنٌ ينحرف عن بنوده.
 *
 * ملاحظةٌ صادقة: هذا النمط يُقيَّد محاسبيًّا في حساب المخزون؛ أمّا تحريكُ
 * **كمّيّات** المخزون فعبر دورة الوارد القائمة (GRN/PUTAWAY) حين يُستعمل المحرّكُ
 * المخزنيّ — لا يختلقه هذا المستند. منطق خالص.
 *
 * ⚠️ **بديلٌ عن GRN لا مكمّلٌ له:** فاتورةُ المورّد (SINV/SINVI) تُنشئ ذمّةَ
 * المورّد للمحلّ الذي **لا يُشغّل دورةَ الاستلام الكاملة** (GRN). ومن سجّل
 * استلامَ البضاعة بـGRN **لا يُدخلها ثانيةً كفاتورةٍ هنا** — فكلاهما يُنشئ
 * ذمّةً للمورّد، واجتماعُهما لنفس التوريد يضاعف ما نَدينه (لا حسابَ مقاصّةٍ
 * وسيط GR/IR بعد). سدادُ الفاتورة سندُ سدادٍ (SPV) يُقاصّها.
 */

/** قيمةُ بندٍ — كمّيّةٌ × كلفة. */
export function lineValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitCost) || 0);
}

/** إجماليُّ الفاتورة من بنودها. */
export function invoiceTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineValue(line), 0);
}

/** تحذيراتُ الفاتورة المُفصّلة. */
export function sinviWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.supplier || h.supplierCode || '').trim()) {
    out.push('المورّد غير مُدخل — لا تُقيَّد ذمّةٌ لمجهول');
  }
  if (invoiceTotal(doc?.lines) <= 0) out.push('لا قيمةَ للبنود — أدخِل الكمّيّة والكلفة');
  const inv = String(h.invoiceDate || '').slice(0, 10);
  const due = String(h.dueDate || '').slice(0, 10);
  if (inv && due && due < inv) out.push('تاريخُ الاستحقاق قبل تاريخ الفاتورة — راجِع المواعيد');
  for (const [i, l] of (doc?.lines || []).entries()) {
    if ((Number(l?.qty) || 0) < 0 || (Number(l?.unitCost) || 0) < 0) {
      out.push(`البند ${i + 1}: كمّيّةٌ أو كلفةٌ سالبة — المرتجع إشعارٌ لا فاتورة`);
    }
  }
  return out;
}

const schema = {
  type: 'SINVI',
  stage: 7,
  titleAr: 'فاتورة مورّد (بالأصناف)',
  titleEn: 'Supplier Invoice (Itemized)',
  formCode: 'BFP-SINVI-001',
  orientation: 'portrait',

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
      ],
    },
    {
      key: 'lines',
      title: '🧾 الأصناف — Items',
      kind: 'table',
      note: 'كلُّ بندٍ صنفٌ وكمّيّتُه وكلفتُه — والقيمةُ تُحسب فلا تُخزَّن.',
      minRows: 1,
      columns: [
        { key: 'item', label: 'الصنف (Item)', kind: 'text', width: '34%' },
        { key: 'barcode', label: 'الباركود', kind: 'text', width: '20%', ltr: true },
        { key: 'qty', label: 'الكمّيّة', kind: 'number', width: '14%' },
        { key: 'unitCost', label: 'الكلفة (د.ل)', kind: 'number', width: '16%' },
        { key: 'lineValue', label: 'القيمة (د.ل)', kind: 'computed', width: '16%', compute: lineValue },
      ],
    },
    {
      key: 'totals',
      title: '💰 إجماليُّ الفاتورة — Total',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'invoiceTotal', label: 'الإجماليّ (د.ل)', kind: 'computed', compute: (d) => invoiceTotal(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'enteredBy', label: 'أدخلها (Entered By)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'archived', label: 'حُفظت (Filed)', source: null },
  ],

  warnings: sinviWarnings,
};

export default schema;
