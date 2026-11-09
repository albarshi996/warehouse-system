/**
 * نقلٌ مباشرٌ بخطوةٍ واحدة (TRS) — موقع 155 (أبوهادي).
 *
 * الفرق عن سلسلة النقل العامّة (TR → TRN → TRC): تلك ثلاثُ خطواتٍ تمرّ بمخزن
 * النقل (المصدر → مخزن النقل → الوجهة) لتُظهر «ما في الطريق» بين مستودعاتٍ
 * متباعدة. وموقع 155 مستودعاتُه متجاورة، فالمالكُ أراد نقلًا **لحظيًّا**: الرصيدُ
 * يغادر المصدرَ ويصل الوجهةَ في مستندٍ واحد (`WAREHOUSE_FROM → WAREHOUSE_TO`)،
 * بلا شحنةٍ معلّقةٍ ولا استلامٍ لاحق.
 *
 * ★ يُطبع بلا هويّة شركة (`plainPrint`) كسائر مستندات موقع 155 — فيأخذ توقيعاتِه
 *   فارغةً للتوقيع اليدويّ (جزء ١). و`warehouseItemPicker` يُشغّل منتقيَ أصناف
 *   المصدر المفلتر (جزء ٣): عند اختيار مخزن المصدر تُقترح أصنافُه.
 *
 * ★★★ إضافةُ صنفٍ ليس في المصدر: يُسمح أثناء التحرير؛ ويُوسَم البندُ
 *   `addedFromTransfer` فيأخذ عند الترحيل دورةَ «زيادةُ جردٍ ثمّ خصمٌ لصفر» —
 *   حركتان ملحَقتان في الدفتر (postingRules.js · movements.js)، لا تحويرُ صفّ.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** قيمة البند = الكمّيّة × تكلفة الوحدة. */
export function lineValue(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitCost) || 0);
}

/** إجماليّ القيمة المنقولة — الأثر الدفتريّ. */
export function totalValue(lines) {
  return (lines || []).reduce((total, line) => total + lineValue(line), 0);
}

/**
 * تحذيرات النقل المباشر (تنبّه ولا تمنع): مصدرٌ = وجهة، مستندٌ فارغ، بندٌ مضافٌ
 * بلا تشغيلةٍ ولا صلاحيّة (يقطع التتبّع).
 */
export function directTransferWarnings(doc) {
  const out = [];
  const from = String(doc?.header?.fromWarehouse || '').trim().toUpperCase();
  const to = String(doc?.header?.toWarehouse || '').trim().toUpperCase();
  if (from && to && from === to) out.push('مستودع المصدر والوجهة واحد — لا نقل بلا انتقال');

  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (!lines.length) out.push('لا بند بكمية — مستندٌ فارغ لا يُرحَّل');

  const added = lines.filter((l) => l?.addedFromTransfer === true);
  if (added.length) {
    out.push(`${added.length} بندًا مُضافًا من خارج رصيد المصدر — تُسجَّل له زيادةُ جردٍ عند الترحيل`);
  }
  const addedNoTrace = added.filter((l) => !String(l?.batch || '').trim() && !String(l?.expiry || '').trim());
  if (addedNoTrace.length) {
    out.push(`${addedNoTrace.length} بندًا مضافًا بلا تشغيلةٍ ولا صلاحيّة — ينقطع تتبّعُ ما أُضيف`);
  }
  return out;
}

const schema = {
  type: 'TRS',
  stage: 7,
  titleAr: 'نقل مباشر (موقع 155)',
  titleEn: 'Direct Transfer',
  formCode: '155-TRS-001',
  orientation: 'landscape',
  // يُطبع بلا اسمٍ/شعارٍ/صفةِ شركة — مستندات موقع 155.
  plainPrint: true,
  // ‹155-P3› يُشغّل منتقيَ أصناف المصدر المفلتر (DocumentEngine): عند اختيار مخزن
  // المصدر تُقرأ أرصدتُه (مقيَّدةً) وتُقترح أصنافُه، ويُوسَم ما ليس فيها «مضافًا».
  warehouseItemPicker: true,

  /** يُنشئه أمين المخزن، ويعتمده مدير المستودع (فصلُ من ينقل عمّن يعتمد). */
  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات النقل المباشر — Direct Transfer Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'transferDate', label: 'تاريخ النقل (Transfer Date)', kind: 'date', required: true },
        {
          key: 'fromWarehouse',
          label: 'مستودع المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المخزن الذي يخرج منه الرصيد فعلًا — عليه يقع الخصم، ومنه تُقترح الأصناف.',
        },
        {
          key: 'toWarehouse',
          label: 'مستودع الوجهة (To Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المخزن الذي يصل إليه الرصيد فورًا — لا يمرّ بمخزن النقل.',
        },
        { key: 'costCenter', label: 'مركز التكلفة (Cost Center)', kind: 'text', ltr: true, hint: 'رمزٌ اختياريٌّ من سيّد المواقع التنظيميّة.' },
        { key: 'reason', label: 'سبب النقل (Reason)', kind: 'text' },
        {
          key: 'movedBy',
          label: 'المسؤول عن النقل',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ المستند',
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: 'الأصناف المنقولة — Transferred Items',
      kind: 'table',
      note: 'الصنفُ غيرُ الموجودِ في المصدر يُسجَّل له عند الترحيل زيادةُ جردٍ (+) ثمّ يُخصم، فيصل الوجهةَ ويرجع المصدرُ صفرًا.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'qty', label: 'الكمّيّة المنقولة', kind: 'number', width: '10%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '8%' },
        { key: 'unitCost', label: 'تكلفة الوحدة (د.ل)', kind: 'number', width: '9%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '8%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '9%' },
        { key: 'lineValue', label: 'القيمة (د.ل)', kind: 'computed', compute: lineValue, width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: 'الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'totalLines',
          label: 'عدد الأصناف',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length,
        },
        { key: 'totalQty', label: 'إجماليّ الكمّيّات', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        { key: 'totalValue', label: 'إجماليّ القيمة (د.ل)', kind: 'computed', compute: (d) => totalValue(d.lines) },
      ],
    },
  ],

  signatures: [
    { key: 'movedBy', label: 'منفّذ النقل (Moved By)', source: 'creator' },
    { key: 'approvedBy', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'receivedBy', label: 'مستلِم الوجهة (Received By)', source: null },
  ],

  warnings: directTransferWarnings,
};

export default schema;
