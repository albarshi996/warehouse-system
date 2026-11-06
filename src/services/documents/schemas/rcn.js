/**
 * إذن استلام مخزنيّ عامّ (RCN) — مستندُ استلامٍ مستقلٌّ يُدخل البضاعة إلى المستودع.
 *
 * هو **نظيرُ `ISS` نحو الداخل**: الصرفُ يُخرج البضاعة من المستودع إلى خارج
 * الدفتر (`WAREHOUSE → EXTERNAL`) فيُخصم الرصيد، والاستلامُ يَعكسُه — بضاعةٌ
 * تدخل من خارج الدفتر إلى المستودع (`EXTERNAL → WAREHOUSE`) فيزيد الرصيد عند
 * الإنجاز. مواصفةُ موقع 155: «الاستلام يزيد الرصيد».
 *
 * لماذا نوعٌ مستقلّ؟ لأنّ المستودع يستلم بضاعةً لأسبابٍ لا تمرّ بسلسلة شراءٍ
 * (PR → PO → GRN → QC → PUTAWAY): توريدٌ مباشر · تحويلٌ وارد · مرتجعُ عميلٍ
 * يعود للرفّ · استخدامٌ تشغيليّ. فهذا المستند يستلمها **بسببها المكتوب**.
 *
 * نمطُ `SRI` في القيد (اتّجاهُ المصدر الوارد) مع `binSide:'to'`: الموقعُ يخصّ
 * **الوجهة** (الرفُّ الذي توضع عليه البضاعة) لا المصدر. وقيمتُه تُقرأ من الحركة
 * (`unitCost`). ولا يمسّ أودو — أثرُه محلّيٌّ في BHOME.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** قيمة البند المستلَم = الكمّيّة × تكلفة الوحدة. */
export function receiptValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitCost) || 0);
}

/** إجماليّ قيمة الاستلام — الأثر الدفتريّ للدخول. */
export function totalReceipt(lines) {
  return (lines || []).reduce((total, line) => total + receiptValue(line), 0);
}

/**
 * تحذيرات الاستلام (تنبّه ولا تمنع): مستندٌ بلا بندٍ مستلَمٍ لا يُقيَّد، وبندٌ
 * بلا تشغيلةٍ ولا صلاحيّةٍ يقطع التتبّع من جهة التوريد إلى الرفّ.
 */
export function receiptWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (!lines.length) out.push('لا بند مستلَم — مستندٌ بلا استلامٍ لا يُقيَّد');

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim() && !String(l?.expiry || '').trim());
  if (noBatch.length) {
    out.push(`${noBatch.length} بندًا بلا تشغيلة ولا صلاحيّة — ينقطع تتبّعُ ما استُلم`);
  }
  return out;
}

const schema = {
  type: 'RCN',
  stage: 7,
  titleAr: 'إذن استلام مخزنيّ',
  titleEn: 'Stock Receipt',
  formCode: '155-RCN-001',
  orientation: 'landscape',
  // يُطبع بلا اسمٍ/شعارٍ/صفةِ شركة — مستندات موقع 155.
  plainPrint: true,

  /** يُنشئه أمين المخزن، ويعتمده المدير أو مدقّق الجرد (فصلُ من يستلم عمّن يعتمد). */
  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager', 'inventory_auditor'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات الاستلام — Receipt Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'receiptDate', label: 'تاريخ الاستلام (Receipt Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن الوجهة (To Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المخزن الذي تدخل إليه البضاعة فعلًا — عليه يقع زيادةُ الرصيد والقيمة الدفترية.',
        },
        {
          key: 'source',
          label: 'الجهة المورِّدة (Source)',
          kind: 'text',
          hint: 'المورّد أو الجهة التي جاءت منها البضاعة — توثيقٌ لمصدر الوارد.',
        },
        {
          key: 'receiptReason',
          label: 'سبب الاستلام (Reason)',
          kind: 'select',
          options: ['توريد', 'تحويلٌ وارد', 'مرتجعُ عميل', 'أخرى'],
          required: true,
          hint: 'لماذا دخلت البضاعة — فلا يُفتعَل لها استلامٌ من مورّدٍ (GRN) لا يمثّله.',
        },
        {
          key: 'receivedBy',
          label: 'المسؤول عن الاستلام',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ السند',
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: 'الأصناف المستلَمة — Received Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '20%' },
        { key: 'qty', label: 'الكمّيّة المستلَمة', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '8%' },
        { key: 'unitCost', label: 'تكلفة الوحدة (د.ل)', kind: 'number', width: '9%' },
        { key: 'batch', label: 'الدفعة (Batch)', kind: 'text', width: '8%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '9%' },
        { key: 'bin', label: 'الموقع الهدف (Bin)', kind: 'text', scannable: true, ltr: true, width: '8%' },
        { key: 'receiptValue', label: 'القيمة (د.ل)', kind: 'computed', compute: receiptValue, width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: 'الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalQty', label: 'إجماليّ الكمّيّات المستلَمة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        { key: 'totalReceipt', label: 'إجماليّ القيمة المستلَمة (د.ل)', kind: 'computed', compute: (d) => totalReceipt(d.lines) },
      ],
    },
  ],

  signatures: [
    { key: 'receivedBy', label: 'المستلِم (Received By)', source: 'creator' },
    { key: 'approver', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'supplier', label: 'المورِّد (Supplier)', source: null },
  ],

  warnings: receiptWarnings,
};

export default schema;
