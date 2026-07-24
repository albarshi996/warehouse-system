/**
 * مخطّط إشعار الإرجاع (RET) — المرحلة 08، أوّل حلقة في مسار المرتجعات.
 *
 * الأصل الورقي: `public/forms/form_ReturnNote.html`.
 *
 * موقعه: بضاعةٌ خرجت (بإذن تسليم) تعود — من فرعٍ أو عميل. وهو **مصدر
 * الإشعار الدائن**: لا يُصدَر إشعار دائن (CN) إلا مشتقًّا من إشعار إرجاع
 * معتمَد، فلا خصمٌ ماليّ بلا مرتجعٍ موثَّق.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم مذكرة المرتجع» كان يُكتب بيد الموظّف ⇒ صار `RET-2026-####`.
 *  · «قيمة البند» و«القيمة الإجمالية» كانتا تُحسبان بالقلم ⇒ صارتا محسوبتين.
 *  · «مستلم المرتجع» كان اسمًا يُكتب ⇒ صار من الهوية.
 *  · «حالة الصنف» و«الإجراء المقرر» و«أُبلغ المورد» صارت قوائم اختيار.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** قيمة بند المرتجع = الكمية المُرجعة × سعر الوحدة. */
export function lineReturnValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
}

/**
 * تحذيرات المرتجع: بندٌ بلا سبب إرجاع · بندٌ بلا إجراء مقرَّر (يبقى المرتجع
 * في الرصيف بلا قرار) · مرتجعٌ يُوعَد بإشعار دائن ولم يُبلَّغ المورد.
 */
export function returnWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  const noReason = lines.filter((l) => !String(l?.reason || '').trim());
  if (noReason.length) out.push(`${noReason.length} بندًا مُرجعًا بلا سبب`);

  const noAction = lines.filter((l) => !String(l?.action || '').trim());
  if (noAction.length) out.push(`${noAction.length} بندًا بلا إجراء مقرَّر — يبقى معلَّقًا في الرصيف`);

  if (String(doc?.header?.supplierNotified || '') === 'لا' && sumColumn(lines, 'qty') > 0) {
    out.push('المورد لم يُبلَّغ بالمرتجع — قد يتعذّر الحصول على إشعار دائن');
  }
  return out;
}

const schema = {
  type: 'RET',
  stage: 8,
  titleAr: 'إشعار الإرجاع',
  titleEn: 'Return Note',
  formCode: 'BFP-RET-001',
  orientation: 'landscape',

  /** 🥇 حارس الجودة حاضر: اعتماد المرتجع لفاحص الجودة والمدير. */
  roles: {
    create: ['storekeeper', 'warehouse_manager', 'return_manager'],
    approve: ['qc_inspector', 'warehouse_manager'],
    complete: ['return_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات المرتجع — Return Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'returnDate', label: 'تاريخ الإرجاع (Return Date)', kind: 'date', required: true },
        { key: 'returningBranch', label: 'اسم الفرع المُرجِع (Returning Branch)', kind: 'text', required: true },
        {
          key: 'returnType',
          label: 'نوع المرتجع (Type)',
          kind: 'select',
          options: ['مرتجع مبيعات', 'مرتجع تحويل فرع', 'مرتجع مورّد', 'تالف'],
        },
        { key: 'dispatchRef', label: 'رقم أمر الصرف المرجعي (Dispatch Ref.)', kind: 'text' },
        {
          key: 'receiver',
          label: 'مستلم المرتجع (Return Receiver)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الإشعار',
        },
        {
          key: 'supplierNotified',
          label: 'هل أُبلغ المورد؟',
          kind: 'select',
          options: ['نعم', 'لا', 'لا ينطبق'],
        },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود المرتجع — Return Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '17%' },
        { key: 'qty', label: 'الكمية المُرجعة', kind: 'number', width: '8%' },
        { key: 'reason', label: 'سبب الإرجاع', kind: 'text', width: '13%' },
        {
          key: 'condition',
          label: 'حالة الصنف',
          kind: 'select',
          options: ['سليم', 'تالف', 'منتهي', 'ناقص'],
          width: '9%',
        },
        {
          key: 'action',
          label: 'الإجراء المقرر',
          kind: 'select',
          options: ['إعادة للمخزون', 'إتلاف', 'إرجاع للمورّد', 'تحت الفحص'],
          width: '11%',
        },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '9%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '6%' },
        { key: 'returnValue', label: 'القيمة (د.ل)', kind: 'computed', compute: lineReturnValue, width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص والإجراءات — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalQty', label: 'إجمالي الكميات المُرجعة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        {
          key: 'grandTotal',
          label: 'القيمة الإجمالية النهائية (د.ل)',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((t, l) => t + lineReturnValue(l), 0),
        },
        { key: 'creditNoteNo', label: 'رقم مذكرة الخصم (Credit Note No.)', kind: 'text' },
      ],
      extraFields: [
        { key: 'notes', label: 'ملاحظات إضافية', kind: 'textarea' },
        { key: 'corrective', label: 'الإجراءات التصحيحية لمنع التكرار', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'returnsSupervisor', label: 'مشرف المرتجعات (Returns Supervisor)', source: 'creator' },
    { key: 'qcInspector', label: 'فاحص الجودة (QC Inspector)', source: 'approver' },
    { key: 'whManager', label: 'مدير المستودع (WH Manager)', source: null },
  ],

  warnings: returnWarnings,
};

export default schema;
