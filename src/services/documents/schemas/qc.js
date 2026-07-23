/**
 * مخطّط تقرير فحص الجودة (QC) — المرحلة 04، الحلقة الرابعة في سلسلة F2.
 *
 * الأصل الورقي: `public/forms/form_QCReport.html`.
 *
 * لماذا تقرير مستقلّ والـGRN فيه فحص أصلًا؟ لأن الورق يفصلهما: الاستلام
 * يوقّعه أمين المخزن، والفحص يوقّعه مفتّش الجودة ومدير الجودة — ولأن
 * **تقرير عدم المطابقة (NCR)** يُبنى على هذا لا على ذاك. والفصل يجعل
 * حارس الجودة مرئيًّا: مستندٌ مستقلٌّ باسمه ورقمه لا بند داخل غيره.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم تقرير الفحص» كان يُكتب ⇒ صار `QC-2026-####`.
 *  · «رقم GRN المرجعي» و«رقم أمر الشراء» كانا يُنسخان بالقلم ⇒ صارا
 *    رابطين حقيقيين يُملآن عند الاشتقاق (`links.GRN` و`links.PO`).
 *  · «اسم المفتش» كان يُكتب ⇒ صار من الهوية.
 *  · مجموع المقبول والمرفوض كان بالقلم ⇒ صار محسوبًا، ومعه **نسبة الرفض**.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** نسبة الرفض المئوية من إجمالي المفحوص — مؤشّر جودة المورّد. */
export function rejectionRate(lines) {
  const inspected = sumColumn(lines, 'qtyInspected');
  if (!inspected) return 0;
  return Math.round((sumColumn(lines, 'qtyRejected') / inspected) * 1000) / 10;
}

/**
 * تحذيرات الفحص: بندٌ مرفوض بلا سبب · قرار «رفض» بلا رقم NCR ·
 * مجموع المقبول والمرفوض لا يطابق المفحوص (خطأ عدّ).
 */
export function qcWarnings(doc) {
  const out = [];
  const lines = doc?.lines || [];

  const noReason = lines.filter((l) => Number(l?.qtyRejected) > 0 && !String(l?.reason || '').trim());
  if (noReason.length) out.push(`${noReason.length} بندًا مرفوضًا بلا سبب مكتوب`);

  const mismatched = lines.filter((l) => {
    const inspected = Number(l?.qtyInspected) || 0;
    if (!inspected) return false;
    return (Number(l?.qtyAccepted) || 0) + (Number(l?.qtyRejected) || 0) !== inspected;
  });
  if (mismatched.length) out.push(`${mismatched.length} بندًا: المقبول + المرفوض لا يساوي المفحوص`);

  const decision = String(doc?.header?.finalDecision || '');
  if (decision === 'رفض' && !String(doc?.header?.ncrNo || '').trim()) {
    out.push('قرار الرفض يستوجب رقم تقرير عدم مطابقة (NCR)');
  }
  return out;
}

const schema = {
  type: 'QC',
  stage: 4,
  titleAr: 'تقرير فحص الجودة',
  titleEn: 'Quality Control Report',
  formCode: 'BFP-QC-001',
  orientation: 'landscape',

  /**
   * 🥇 حارس الجودة: الإنشاء والاعتماد لمفتّش الجودة ومديرها — لا لأمين
   * المخزن مهما احتاج. هذا نفس منطق GRN، مطبَّقًا على المستند المستقلّ.
   */
  roles: {
    create: ['qc_inspector', 'warehouse_manager'],
    approve: ['qc_inspector', 'warehouse_manager'],
    complete: ['qc_inspector', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات تقرير الفحص — QC Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'inspectionDate', label: 'تاريخ الفحص (Inspection Date)', kind: 'date', required: true },
        {
          key: 'grnRef',
          label: 'رقم GRN المرجعي (GRN Ref.)',
          kind: 'text',
          required: true,
          hint: 'يُملأ تلقائيًّا عند اشتقاق التقرير من مذكرة الاستلام',
        },
        { key: 'poRef', label: 'رقم أمر الشراء (PO Ref.)', kind: 'text' },
        { key: 'supplier', label: 'اسم المورد (Supplier Name)', kind: 'text', required: true },
        {
          key: 'inspector',
          label: 'اسم المفتش (Inspector Name)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ التقرير',
        },
        { key: 'location', label: 'الموقع (Location)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '🔬 بنود الفحص — Inspection Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'qtyInspected', label: 'الكمية المفحوصة', kind: 'number', width: '10%' },
        { key: 'sampleSize', label: 'حجم العينة', kind: 'number', width: '8%' },
        { key: 'qtyAccepted', label: 'مقبول', kind: 'number', width: '9%' },
        { key: 'qtyRejected', label: 'مرفوض', kind: 'number', width: '9%' },
        { key: 'reason', label: 'السبب', kind: 'text', width: '12%' },
        {
          key: 'result',
          label: 'النتيجة',
          kind: 'select',
          options: ['مطابق', 'غير مطابق', 'مشروط'],
          width: '8%',
        },
      ],
    },

    {
      key: 'checks',
      title: '✅ بنود الفحص القياسية — Standard Checks',
      kind: 'checklist',
      items: [
        { key: 'spec-match', label: 'مطابقة المواصفات الفنية المتفق عليها' },
        { key: 'labels-ar', label: 'الملصقات واضحة وباللغة العربية' },
        { key: 'shelf-life', label: 'العمر الافتراضي المتبقي ضمن المقبول' },
        { key: 'packaging', label: 'التعبئة والتغليف سليمان' },
        { key: 'quantity', label: 'مطابقة الكمية لأمر الشراء' },
        { key: 'certificates', label: 'شهادات المنشأ والتحليل مرفقة' },
        { key: 'no-damage', label: 'لا توجد أضرار أو تلوّث' },
        { key: 'storage', label: 'ظروف النقل والتخزين محقّقة' },
      ],
    },

    {
      key: 'summary',
      title: '📊 القرار النهائي — Final Decision',
      kind: 'fields',
      columns: 4,
      fields: [
        {
          key: 'totalInspected',
          label: 'إجمالي المفحوص',
          kind: 'computed',
          compute: (d) => sumColumn(d.lines, 'qtyInspected'),
        },
        {
          key: 'totalAccepted',
          label: 'إجمالي المقبول',
          kind: 'computed',
          compute: (d) => sumColumn(d.lines, 'qtyAccepted'),
        },
        {
          key: 'totalRejected',
          label: 'إجمالي المرفوض',
          kind: 'computed',
          compute: (d) => sumColumn(d.lines, 'qtyRejected'),
        },
        {
          key: 'rejectionRate',
          label: 'نسبة الرفض (%)',
          kind: 'computed',
          compute: (d) => rejectionRate(d.lines),
        },
      ],
      extraFields: [
        {
          key: 'finalDecision',
          label: 'القرار النهائي (Final Decision)',
          kind: 'select',
          options: ['قبول', 'رفض', 'قبول مشروط'],
          required: true,
        },
        { key: 'ncrNo', label: 'رقم تقرير عدم المطابقة (NCR No.) — إن وُجد', kind: 'text' },
        { key: 'notes', label: 'ملاحظات وتوصيات (Notes & Recommendations)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'inspector', label: 'مفتش الجودة (QC Inspector)', source: 'creator' },
    { key: 'whSupervisor', label: 'مشرف المستودع (WH Supervisor)', source: null },
    { key: 'qaManager', label: 'مدير الجودة (QA Manager)', source: 'approver' },
  ],

  warnings: qcWarnings,
};

export default schema;
