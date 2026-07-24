/**
 * مخطّط قائمة السحب (PICK) — المرحلة 06، أوّل حلقة في مسار الصرف.
 *
 * الأصل الورقي: `public/forms/form_Picking.html`.
 *
 * 🥇 **هنا يعيش حارس FEFO**: لا يُسحب صنفٌ من تشغيلةٍ أبعدَ انتهاءً وفي
 * المخزن ما هو أقرب — وإلا تراكم القديم حتى ينتهي فيُتلف. التحقّق نفسه في
 * `chain.js` (`fefoViolations`) لأنه يحتاج الأرصدة، والمخطّط يستدعيه.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم طلب الصرف» كان يُكتب بيد الموظّف ⇒ صار `PICK-2026-####`.
 *  · «الفرق» بين المطلوب والمجمَّع كان يُحسب بالقلم ⇒ صار عمودًا محسوبًا.
 *  · «الإجمالي» و«القيمة الإجمالية للطلب» كانا يدويَّين ⇒ صارا محسوبين.
 *  · «اسم العامل المنتقي» كان يُكتب ⇒ صار من الهوية.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** الفرق بين المطلوب والمجمَّع — سالبٌ يعني نقصًا في السحب. */
export function lineShortage(line) {
  return (Number(line?.qtyPicked) || 0) - (Number(line?.qtyRequested) || 0);
}

/** قيمة البند = المجمَّع × سعر الوحدة. */
export function lineValue(line) {
  return (Number(line?.qtyPicked) || 0) * (Number(line?.unitPrice) || 0);
}

/** القيمة الإجمالية للطلب. */
export function orderValue(lines) {
  return (lines || []).reduce((total, line) => total + lineValue(line), 0);
}

/**
 * تحذيرات السحب: نقصٌ عن المطلوب · سحبٌ يتجاوز المطلوب · بندٌ بلا تاريخ
 * صلاحية (يُخفي مخالفة FEFO محتملة).
 */
export function pickWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qtyRequested) > 0 || Number(l?.qtyPicked) > 0);

  const short = lines.filter((l) => lineShortage(l) < 0);
  if (short.length) out.push(`${short.length} بندًا سُحب أقلّ من المطلوب`);

  const over = lines.filter((l) => lineShortage(l) > 0);
  if (over.length) out.push(`${over.length} بندًا سُحب أكثر من المطلوب`);

  const noExpiry = lines.filter((l) => Number(l?.qtyPicked) > 0 && !String(l?.expiry || '').trim());
  if (noExpiry.length) out.push(`${noExpiry.length} بندًا مسحوبًا بلا تاريخ صلاحية — لا يمكن التحقّق من FEFO`);

  return out;
}

const schema = {
  type: 'PICK',
  stage: 6,
  titleAr: 'قائمة السحب',
  titleEn: 'Picking List',
  formCode: 'BFP-PICK-001',
  orientation: 'landscape',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات طلب الصرف — Dispatch Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'orderDate', label: 'تاريخ الطلب (Order Date)', kind: 'date', required: true },
        { key: 'branchOrderRef', label: 'رقم طلب الفرع (Branch Order Ref.)', kind: 'text' },
        { key: 'destination', label: 'الفرع المستفيد (Destination Branch)', kind: 'text', required: true },
        { key: 'priority', label: 'أولوية الطلب (Priority)', kind: 'select', options: ['عاجل', 'عادي', 'منخفض'] },
        { key: 'wave', label: 'الموجة (Wave No.)', kind: 'text' },
        { key: 'zone', label: 'منطقة التجميع (Picking Zone)', kind: 'text' },
        {
          key: 'picker',
          label: 'اسم العامل المنتقي (Picker Name)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ القائمة',
        },
        { key: 'startTime', label: 'وقت بداية التجميع (Start Time)', kind: 'text' },
        { key: 'endTime', label: 'وقت انتهاء التجميع (End Time)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود السحب — Pick Lines',
      kind: 'table',
      note: '🥇 حارس FEFO: التشغيلة المسحوبة يجب أن تكون الأقرب انتهاءً من المتاح في المخزن.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '17%' },
        { key: 'bin', label: 'الموقع', kind: 'text', width: '7%' },
        { key: 'qtyRequested', label: 'الكمية المطلوبة', kind: 'number', width: '8%' },
        { key: 'qtyPicked', label: 'الكمية المجمعة', kind: 'number', width: '8%' },
        { key: 'diff', label: 'الفرق', kind: 'computed', compute: lineShortage, width: '6%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '8%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '9%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '8%' },
        { key: 'lineValue', label: 'الإجمالي (د.ل)', kind: 'computed', compute: lineValue, width: '9%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 ملخّص التجميع — Picking Summary',
      kind: 'fields',
      columns: 4,
      fields: [
        {
          key: 'totalLines',
          label: 'إجمالي الأصناف (Total Lines)',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qtyPicked) > 0).length,
        },
        { key: 'totalPicked', label: 'إجمالي الكميات المجمّعة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyPicked') },
        { key: 'totalPallets', label: 'إجمالي الطبليات (Total Pallets)', kind: 'number' },
        { key: 'orderValue', label: 'القيمة الإجمالية (د.ل)', kind: 'computed', compute: (d) => orderValue(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'picker', label: 'العامل المنتقي (Picker)', source: 'creator' },
    { key: 'checker', label: 'المراجع (Checker / Packer)', source: 'approver' },
    { key: 'dispatchSupervisor', label: 'مشرف التوزيع (Dispatch Supervisor)', source: null },
  ],

  warnings: pickWarnings,
};

export default schema;
