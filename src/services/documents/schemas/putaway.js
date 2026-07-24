/**
 * مخطّط أمر التخزين (PUTAWAY) — المرحلة 05، آخر حلقة في المسار الوارد.
 *
 * الأصل الورقي: `public/forms/form_PutawayList.html`.
 *
 * موقعه في الدورة: بعد اعتماد الجودة، تُنقل البضاعة من منطقة الاستلام إلى
 * مواقعها. وهو **مصدر بيانات التشغيلة والصلاحية والموقع** التي يعتمد عليها
 * حارس FEFO لاحقًا في السحب — فبندٌ بلا موقعٍ هنا يعني صنفًا لا يُعثر عليه.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم أمر التخزين» كان يُكتب بيد الموظّف ⇒ صار `PUTAWAY-2026-####`.
 *  · «رقم GRN المرجعي» كان يُنسخ بالقلم ⇒ صار رابطًا يُملأ عند الاشتقاق.
 *  · إجمالي الكميات كان يُجمع يدويًّا ⇒ صار محسوبًا.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات التخزين: بندٌ بلا موقع (لن يُعثر عليه) · بندٌ بلا تشغيلة أو
 * صلاحية (يُعطّل FEFO لاحقًا فيُسحب الأقدم بالخطأ).
 */
export function putawayWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  const noBin = lines.filter((l) => !String(l?.bin || '').trim());
  if (noBin.length) out.push(`${noBin.length} بندًا بلا موقع تخزين (Bin) — لن يُعثر عليه عند السحب`);

  const noExpiry = lines.filter((l) => !String(l?.expiry || '').trim());
  if (noExpiry.length) {
    out.push(`${noExpiry.length} بندًا بلا تاريخ صلاحية — يُعطّل ترتيب FEFO عند الصرف`);
  }
  return out;
}

const schema = {
  type: 'PUTAWAY',
  stage: 5,
  titleAr: 'أمر التخزين',
  titleEn: 'Putaway List',
  formCode: 'BFP-PUT-001',
  orientation: 'landscape',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager', 'inventory_auditor'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات أمر التخزين — Putaway Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'putawayDate', label: 'تاريخ التخزين (Putaway Date)', kind: 'date', required: true },
        {
          key: 'grnRef',
          label: 'رقم GRN المرجعي (GRN Ref.)',
          kind: 'text',
          required: true,
          hint: 'يُملأ تلقائيًّا عند اشتقاق الأمر من مذكرة الاستلام',
        },
        { key: 'supplier', label: 'اسم المورد (Supplier Name)', kind: 'text' },
        { key: 'stagingZone', label: 'منطقة الاستلام / Staging Zone', kind: 'text' },
        { key: 'defaultZone', label: 'منفذ التخزين الأساسي (Default Zone)', kind: 'text' },
        {
          key: 'team',
          label: 'اسم فريق التخزين (Putaway Team)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الأمر',
        },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود التخزين — Putaway Lines',
      kind: 'table',
      note: 'الموقع والتشغيلة والصلاحية هنا هي ما يعتمد عليه حارس FEFO عند الصرف — لا تتركها فارغة.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'batch', label: 'الدفعة (Batch)', kind: 'text', width: '10%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '11%' },
        { key: 'bin', label: 'الموقع المستهدف (Bin)', kind: 'text', width: '9%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '6%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات المخزَّنة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
      ],
    },
  ],

  signatures: [
    { key: 'operator', label: 'مُنفّذ التخزين (Putaway Operator)', source: 'creator' },
    { key: 'verifier', label: 'مدقّق الموقع (Location Verifier)', source: 'approver' },
    { key: 'supervisor', label: 'مشرف المستودع (WH Supervisor)', source: null },
  ],

  warnings: putawayWarnings,
};

export default schema;
