/**
 * مخطّط تحميل المركبة (VLD) — أوّل حلقة في دورة البيع من المركبة.
 *
 * الفرق بينه وبين إذن التسليم (DN): إذن التسليم يُحمّل **طلبَ عميلٍ معلوم**
 * سُحب له من الرفّ إلى ساحة التجهيز. أمّا هذا فيُحمّل **مخزونًا للبيع** لم
 * يُطلَب بعد ولا يُعرف مشتريه — يقرّره السوق في الميدان. ولذلك يسحب من الرفّ
 * مباشرةً بلا ساحة تجهيزٍ ولا أمر بيع.
 *
 * ما يقع عند إنجازه: `المستودع ← VAN:‹لوحة›`. فتصبح البضاعة في **عهدة المندوب**
 * لا في المستودع — وهو الأثر الذي يجعل تسوية المساء ممكنة أصلًا.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات التحميل: بندٌ بلا تشغيلة أو صلاحية (فلا يُتتبَّع مرتجعه ولا تُنبَّه
 * صلاحيته عند العميل) · بلا لوحةٍ أو مندوب (فلا عهدة ولا تسوية) · صنفٌ منتهي
 * الصلاحية أو يوشك (تحميلُه إخراجُ خسارةٍ إلى الطريق).
 */
export function vldWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim() && !String(l?.expiry || '').trim());
  if (noBatch.length) out.push(`${noBatch.length} بندًا بلا تشغيلة ولا صلاحية — يتعذّر تتبّعه عند العميل`);

  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد موقع العهدة — لا تحميل بلا لوحة');
  if (!String(h.repName || '').trim()) out.push('اسم المندوب يُحدّد المسؤول عن العهدة حتى التسوية');

  const today = new Date().toISOString().slice(0, 10);
  const expired = lines.filter((l) => {
    const e = String(l?.expiry || '').trim();
    return e && e <= today;
  });
  if (expired.length) out.push(`${expired.length} بندًا منتهي الصلاحية — لا يُحمَّل للبيع`);

  return out;
}

const schema = {
  type: 'VLD',
  stage: 6,
  titleAr: 'أمر تحميل المركبة',
  titleEn: 'Van Load Order',
  formCode: 'BFP-VLD-001',
  orientation: 'portrait',

  roles: {
    create: ['storekeeper', 'warehouse_manager', 'sales_supervisor'],
    approve: ['warehouse_manager', 'sales_supervisor'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات التحميل — Load Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'loadDate', label: 'تاريخ التحميل (Load Date)', kind: 'date', required: true },
        { key: 'warehouse', label: 'المستودع المصدر (Source Warehouse)', kind: 'text', required: true },
        { key: 'tripRef', label: 'رقم الرحلة (Trip Ref.)', kind: 'text', hint: 'يربط التحميل برحلة المركبة فتُحسب تسويتها' },
        {
          key: 'whOfficer',
          label: 'أمين المخزن (WH Officer)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الأمر',
        },
      ],
    },

    {
      key: 'custody',
      title: '🛵 العهدة — Custody',
      kind: 'fields',
      columns: 3,
      note: 'ما يُحمَّل هنا يصير في عهدة المندوب حتى تسوية نهاية الرحلة — لا في المستودع.',
      fields: [
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'repName', label: 'اسم المندوب (Sales Rep)', kind: 'text', required: true },
        { key: 'route', label: 'خطّ السير (Route)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود التحميل — Load Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '24%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'batch', label: 'رقم الدفعة (Batch)', kind: 'text', width: '11%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '11%' },
        { key: 'unitCost', label: 'تكلفة الوحدة', kind: 'number', width: '12%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        {
          key: 'totalValue',
          label: 'قيمة الحمولة',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0) * (Number(l?.unitCost) || 0), 0),
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'whOfficer', label: 'أمين المخزن (WH Officer)', source: 'creator' },
    { key: 'rep', label: 'المندوب المستلم للعهدة (Sales Rep)', source: null },
  ],

  attachments: [{ key: 'signedCopy', kind: 'signedCopy', label: 'نسخة أمر التحميل موقّعة' }],

  warnings: vldWarnings,
};

export default schema;
