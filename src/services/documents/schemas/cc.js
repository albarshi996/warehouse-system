/**
 * مخطّط محضر الجرد الدوري (CC) — المرحلة 09.
 *
 * الأصل الورقي: `public/forms/form_CycleCount.html`.
 *
 * موقعه في الدورة: رقابةٌ مستمرة تقارن **الرصيد الدفتري** (ما يقوله النظام)
 * بـ**العدّ المادي** (ما على الرفّ فعلًا). وهو **مصدر سند التسوية**: لا
 * تُسوّى كميةٌ في النظام إلا مشتقةً من محضر جردٍ مصادَق — فلا تصحيحٌ للأرقام
 * بلا عدٍّ موثَّق (هذا نصف حارس التسوية، ونصفه الآخر في `adj.js`).
 *
 * ما صُحِّح أثناء النقل:
 *  · «الفرق» و«قيمة الفرق» و«% الفرق» كانت تُحسب بالقلم ⇒ صارت محسوبة.
 *  · «% دقة المخزون» و«قيمة الفوارق الإجمالية» كانتا يدويّتين ⇒ صارتا محسوبتين.
 *  · **العدّ المزدوج**: عدّان ماديّان، والفرق يُقاس من **الثاني** المؤكَّد
 *    (الورق كان يترك أيّهما المرجع غامضًا).
 */

/** العدّ المؤكَّد: الثاني إن وُجد، وإلا الأول. */
function confirmedCount(line) {
  const second = line?.count2;
  if (second !== undefined && second !== null && second !== '') return Number(second) || 0;
  return Number(line?.count1) || 0;
}

/** فرق البند = العدّ المؤكَّد − الرصيد الدفتري. سالبٌ يعني عجزًا. */
export function lineVariance(line) {
  return confirmedCount(line) - (Number(line?.bookQty) || 0);
}

/** قيمة الفرق = الفرق × سعر الوحدة (قد تكون سالبة). */
export function varianceValue(line) {
  return lineVariance(line) * (Number(line?.unitPrice) || 0);
}

/** عدد البنود المطابقة تمامًا (فرق صفر). */
export function matchedCount(lines) {
  return (lines || []).filter((l) => hasCount(l) && lineVariance(l) === 0).length;
}

/** هل عُدّ هذا البند فعلًا؟ (بلا عدٍّ لا يُحسب في الدقّة) */
function hasCount(line) {
  return (
    (line?.count1 !== undefined && line.count1 !== '') ||
    (line?.count2 !== undefined && line.count2 !== '')
  );
}

/**
 * دقّة المخزون = نسبة البنود المطابقة من المعدودة (%).
 * تُقاس من **المعدودة** لا من كل الأسطر — فبندٌ لم يُعدّ لا يُثبت دقّةً ولا
 * ينفيها.
 */
export function inventoryAccuracy(lines) {
  const counted = (lines || []).filter(hasCount);
  if (!counted.length) return 0;
  return Math.round((matchedCount(counted) / counted.length) * 1000) / 10;
}

/** تحذيرات الجرد: بندٌ بفرقٍ بلا سبب · بندٌ لم يُعدّ إطلاقًا. */
export function cycleWarnings(doc) {
  const out = [];
  const lines = doc?.lines || [];

  const varNoReason = lines.filter((l) => hasCount(l) && lineVariance(l) !== 0 && !String(l?.reason || '').trim());
  if (varNoReason.length) out.push(`${varNoReason.length} بندًا بفرقٍ بلا سبب مكتوب`);

  const notCounted = lines.filter((l) => String(l?.sku || l?.description || '').trim() && !hasCount(l));
  if (notCounted.length) out.push(`${notCounted.length} بندًا لم يُعدّ بعد`);

  return out;
}

const schema = {
  type: 'CC',
  stage: 9,
  titleAr: 'محضر الجرد الدوري',
  titleEn: 'Cycle Count Sheet',
  formCode: 'BFP-CC-001',
  orientation: 'landscape',

  roles: {
    create: ['inventory_auditor', 'storekeeper', 'warehouse_manager'],
    approve: ['inventory_auditor', 'warehouse_manager'],
    complete: ['inventory_auditor', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الجرد — Count Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'countDate', label: 'تاريخ الجرد (Count Date)', kind: 'date', required: true },
        { key: 'shift', label: 'فترة الجرد (Shift/Period)', kind: 'text' },
        { key: 'zone', label: 'المنطقة / الرف (Zone / Rack)', kind: 'text', required: true },
        {
          key: 'abcCategory',
          label: 'فئة ABC المجردة',
          kind: 'select',
          options: ['A', 'B', 'C', 'الكل'],
        },
        {
          key: 'counter',
          label: 'عدّاد الجرد (Counter)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ المحضر',
        },
      ],
    },

    {
      key: 'lines',
      title: '🔢 بنود الجرد — Count Lines',
      kind: 'table',
      note: 'الفرق يُقاس من العدّ المادي الثاني المؤكَّد مقابل الرصيد الدفتري — وهو ما يُبنى عليه سند التسوية.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '16%' },
        { key: 'bin', label: 'الموقع', kind: 'text', width: '7%' },
        { key: 'abc', label: 'ABC', kind: 'text', width: '5%' },
        { key: 'bookQty', label: 'الرصيد الدفتري', kind: 'number', width: '9%' },
        { key: 'count1', label: 'العدّ الأول', kind: 'number', width: '8%' },
        { key: 'count2', label: 'العدّ الثاني', kind: 'number', width: '8%' },
        { key: 'variance', label: 'الفرق', kind: 'computed', compute: lineVariance, width: '6%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '8%' },
        { key: 'varValue', label: 'قيمة الفرق (د.ل)', kind: 'computed', compute: varianceValue, width: '8%' },
        { key: 'reason', label: 'سبب الفرق', kind: 'text', width: '10%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 دقّة المخزون — Inventory Accuracy',
      kind: 'fields',
      columns: 4,
      fields: [
        {
          key: 'totalItems',
          label: 'إجمالي الأصناف المجردة',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => String(l?.sku || l?.description || '').trim()).length,
        },
        { key: 'matchedItems', label: 'أصناف مطابقة (100%)', kind: 'computed', compute: (d) => matchedCount(d.lines) },
        {
          key: 'varianceItems',
          label: 'أصناف بفرق',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => lineVariance(l) !== 0 && Number(l?.bookQty || l?.count1 || l?.count2)).length,
        },
        { key: 'accuracy', label: '% دقة المخزون الكلي', kind: 'computed', compute: (d) => inventoryAccuracy(d.lines) },
      ],
      extraFields: [
        {
          key: 'totalVarianceValue',
          label: 'قيمة الفوارق الإجمالية (د.ل)',
          kind: 'computed',
          compute: (d) => Math.round((d.lines || []).reduce((t, l) => t + varianceValue(l), 0) * 100) / 100,
        },
        { key: 'corrective', label: 'الإجراء المتخذ (Corrective Action)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'firstCounter', label: 'العدّاد الأول (First Counter)', source: 'creator' },
    { key: 'verifier', label: 'مراجع الجرد (Verifier)', source: 'approver' },
    { key: 'whManager', label: 'مدير المستودع (WH Manager)', source: null },
  ],

  warnings: cycleWarnings,
};

export default schema;
