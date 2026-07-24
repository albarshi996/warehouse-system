/**
 * مخطّط سند التالف (DMG) — المرحلة 08، رفيق المرتجعات.
 *
 * الأصل الورقي: `public/forms/form_Damaged Goods Report.html`.
 *
 * لماذا مستقلٌّ عن المرتجع؟ لأن التالف قد يُكتشف داخل المستودع بلا إرجاعٍ
 * أصلًا (كسرٌ على الرفّ · انتهاء صلاحية · سوء تخزين)، ويوقَّع من مشرف
 * الجودة لا من مشرف المرتجعات، ويُفضي إلى **محضر إتلاف** لا إلى إشعار دائن.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم سند التالف» كان يُكتب ⇒ صار `DMG-2026-####`.
 *  · «قيمة التالف» و«الإجمالي» كانتا تُحسبان بالقلم ⇒ صارتا محسوبتين.
 *  · «المكتشف» كان اسمًا يُكتب ⇒ صار من الهوية.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** قيمة التالف للبند = الكمية التالفة × سعر الوحدة. */
export function damageValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
}

/** إجمالي قيمة التالف — الأثر المالي للخسارة. */
export function totalDamage(lines) {
  return (lines || []).reduce((total, line) => total + damageValue(line), 0);
}

/**
 * تحذيرات التالف: بندٌ بلا إجراء تصرّف · قرار «إتلاف» بلا رقم محضر إتلاف
 * (فالإتلاف بلا محضر خروجٌ للبضاعة بلا أثر).
 */
export function damageWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  const noAction = lines.filter((l) => !String(l?.disposal || '').trim());
  if (noAction.length) out.push(`${noAction.length} بندًا تالفًا بلا إجراء تصرّف`);

  const wantsDisposal = lines.some((l) => String(l?.disposal || '') === 'إتلاف');
  if (wantsDisposal && !String(doc?.header?.disposalRecordNo || '').trim()) {
    out.push('قرار الإتلاف يستوجب رقم محضر إتلاف — الإتلاف بلا محضر خروجٌ بلا أثر');
  }
  return out;
}

const schema = {
  type: 'DMG',
  stage: 8,
  titleAr: 'سند التالف',
  titleEn: 'Damaged Goods Report',
  formCode: 'BFP-DMG-001',
  orientation: 'landscape',

  /** 🥇 حارس الجودة: اعتماد التالف لمشرف الجودة والمدير. */
  roles: {
    create: ['storekeeper', 'warehouse_manager', 'return_manager'],
    approve: ['qc_inspector', 'warehouse_manager'],
    complete: ['return_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات سند التالف — Damage Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'discoveryDate', label: 'تاريخ الاكتشاف (Discovery Date)', kind: 'date', required: true },
        { key: 'location', label: 'الموقع / المستودع (Location)', kind: 'text', required: true },
        {
          key: 'discoveredBy',
          label: 'المكتشف (Discovered By)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ السند',
        },
        {
          key: 'cause',
          label: 'سبب التلف (Damage Cause)',
          kind: 'select',
          options: ['كسر / سقوط', 'انتهاء صلاحية', 'سوء تخزين', 'تلف نقل', 'آفات', 'أخرى'],
        },
        { key: 'disposalRecordNo', label: 'رقم محضر الإتلاف (Disposal Record No.)', kind: 'text' },
      ],
      extraFields: [{ key: 'otherDetails', label: 'تفاصيل أخرى (Other Details)', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: '📦 بنود التالف — Damaged Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'qty', label: 'الكمية التالفة', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '8%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '9%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '10%' },
        { key: 'damageValue', label: 'قيمة التالف (د.ل)', kind: 'computed', compute: damageValue, width: '9%' },
        {
          key: 'disposal',
          label: 'إجراء التصرف',
          kind: 'select',
          options: ['إتلاف', 'إرجاع للمورّد', 'بيع كخردة', 'تحت الفحص'],
          width: '11%',
        },
      ],
    },

    {
      key: 'summary',
      title: '📊 الأثر المالي — Financial Impact',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalQty', label: 'إجمالي الكميات التالفة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        { key: 'totalDamage', label: 'القيمة الإجمالية للتالف (د.ل)', kind: 'computed', compute: (d) => totalDamage(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'discoveredBy', label: 'المكتشف (Discovered By)', source: 'creator' },
    { key: 'qcSupervisor', label: 'مشرف الجودة (QC Supervisor)', source: 'approver' },
    { key: 'whManager', label: 'مدير المستودع (WH Manager)', source: null },
  ],

  warnings: damageWarnings,
};

export default schema;
