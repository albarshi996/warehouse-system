/**
 * إذن صرف مخزنيّ عامّ (ISS) — مستندُ صرفٍ مستقلٌّ يُخرج البضاعة من المستودع.
 *
 * لماذا نوعٌ مستقلّ؟ لأنّ المستودع يصرف بضاعةً لأسبابٍ لا تمرّ بسلسلة بيعٍ
 * (SO → PICK → DN) ولا بسلسلة إنتاجٍ (PRO → MIS): استهلاكٌ داخليّ · صرفٌ
 * لإدارةٍ · عيّناتٌ · استخدامٌ تشغيليّ. وكان يُفتعَل لها «بيعٌ» أو «تالف»
 * فتكذب التقارير على سببها. فهذا المستند يصرفها **بسببها المكتوب**: من
 * المستودع إلى خارج الدفتر (`WAREHOUSE → EXTERNAL`)، فيُخصم الرصيد عند الإنجاز.
 *
 * نمطُ `DMG` حرفيًّا: واقعةُ خروجٍ مباشرةٌ لا تُشتقّ من مستندٍ ولا يُشتقّ منها،
 * وقيمتُها تُقرأ من الحركة (`unitCost`). ولا يمسّ أودو — أثرُه محلّيٌّ في BHOME.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** قيمة البند المصروف = الكمّيّة × تكلفة الوحدة. */
export function issueValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitCost) || 0);
}

/** إجماليّ قيمة الصرف — الأثر الدفتريّ للخروج. */
export function totalIssue(lines) {
  return (lines || []).reduce((total, line) => total + issueValue(line), 0);
}

/**
 * تحذيرات الصرف (تنبّه ولا تمنع): مستندٌ بلا بندٍ مصروفٍ لا يُقيَّد، وبندٌ
 * بلا تشغيلةٍ ولا صلاحيّةٍ يقطع التتبّع من الرفّ إلى جهة الصرف.
 */
export function issueWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (!lines.length) out.push('لا بند مصروف — مستندٌ بلا صرفٍ لا يُقيَّد');

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim() && !String(l?.expiry || '').trim());
  if (noBatch.length) {
    out.push(`${noBatch.length} بندًا بلا تشغيلة ولا صلاحيّة — ينقطع تتبّعُ ما صُرف`);
  }
  return out;
}

const schema = {
  type: 'ISS',
  stage: 7,
  titleAr: 'إذن صرف مخزنيّ',
  titleEn: 'Stock Issue',
  formCode: 'BFP-ISS-001',
  orientation: 'landscape',

  /** يُنشئه أمين المخزن، ويعتمده المدير أو مدقّق الجرد (فصلُ من يصرف عمّن يعتمد). */
  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager', 'inventory_auditor'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات الصرف — Issue Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'issueDate', label: 'تاريخ الصرف (Issue Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المخزن الذي تخرج منه البضاعة فعلًا — عليه يقع خصم الرصيد والقيمة الدفترية.',
        },
        {
          key: 'issueReason',
          label: 'سبب الصرف (Reason)',
          kind: 'select',
          options: ['استهلاك داخليّ', 'صرف لإدارة', 'عيّنات', 'استخدام تشغيليّ', 'أخرى'],
          required: true,
          hint: 'لماذا تخرج البضاعة — فلا تُفتعَل لها واقعةُ بيعٍ أو تالفٍ لا تمثّلها.',
        },
        { key: 'beneficiary', label: 'الجهة / الإدارة المستفيدة (Beneficiary)', kind: 'text' },
        {
          key: 'issuedBy',
          label: 'المسؤول عن الصرف',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ السند',
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: 'الأصناف المصروفة — Issued Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '20%' },
        { key: 'qty', label: 'الكمّيّة المصروفة', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '8%' },
        { key: 'unitCost', label: 'تكلفة الوحدة (د.ل)', kind: 'number', width: '9%' },
        { key: 'batch', label: 'الدفعة (Batch)', kind: 'text', width: '8%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '9%' },
        { key: 'bin', label: 'الموقع المصدر (Bin)', kind: 'text', scannable: true, ltr: true, width: '8%' },
        { key: 'issueValue', label: 'القيمة (د.ل)', kind: 'computed', compute: issueValue, width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: 'الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalQty', label: 'إجماليّ الكمّيّات المصروفة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        { key: 'totalIssue', label: 'إجماليّ القيمة المصروفة (د.ل)', kind: 'computed', compute: (d) => totalIssue(d.lines) },
      ],
    },
  ],

  signatures: [
    { key: 'issuedBy', label: 'الصارف (Issued By)', source: 'creator' },
    { key: 'approver', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'receiver', label: 'المستلِم (Received By)', source: null },
  ],

  warnings: issueWarnings,
};

export default schema;
