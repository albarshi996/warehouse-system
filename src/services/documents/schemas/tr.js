/**
 * مخطّط طلب النقل (TR) — رأس سلسلة النقل بين المستودعات والفروع.
 *
 * الأصل الورقي: طلب تحويل بضاعة من مستودعٍ إلى فرعٍ أو مستودعٍ آخر.
 *
 * طلبٌ لا حركة: مثل طلب الشراء، **لا يمسّ رصيدًا** — إنما يوثّق ما يُطلب نقله
 * ويُعتمد قبل أن يُشحن. الحركة تقع لاحقًا عند إصدار مستند النقل (TRN).
 *
 * ⚠️ حقلا «مستودع المصدر» و«مستودع الوجهة» إلزاميّان: عليهما تقوم الحركة كلها
 * — من الأوّل يخرج الرصيد، وإلى الثاني يصل بعد مروره بمخزن النقل.
 */

/** إجمالي الكميات المطلوب نقلها. */
export function totalQty(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0);
}

/** تحذيرات طلب النقل (تنبّه ولا تمنع). */
export function transferReqWarnings(doc) {
  const out = [];
  const from = String(doc?.header?.fromWarehouse || '').trim().toUpperCase();
  const to = String(doc?.header?.toWarehouse || '').trim().toUpperCase();
  if (from && to && from === to) {
    out.push('مستودع المصدر والوجهة واحد — لا نقل بلا انتقال');
  }
  if (!totalQty(doc?.lines)) {
    out.push('لا بند بكمية — طلبٌ فارغ لا يُشحن');
  }
  return out;
}

const schema = {
  type: 'TR',
  stage: 6,
  titleAr: 'طلب نقل',
  titleEn: 'Transfer Request',
  formCode: 'BFP-TR-001',
  orientation: 'portrait',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات طلب النقل — Transfer Request Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'requestDate', label: 'تاريخ الطلب (Request Date)', kind: 'date', required: true },
        { key: 'costCenter', label: 'مركز التكلفة (Cost Center)', kind: 'text', ltr: true, hint: 'رمزٌ من سيّد المواقع التنظيميّة — به تُحمَّل التكلفة على الفرع والبراند والقطاع' },
        {
          key: 'fromWarehouse',
          label: 'مستودع المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المستودع الذي يخرج منه الرصيد.',
        },
        {
          key: 'toWarehouse',
          label: 'مستودع الوجهة / الفرع (To Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المستودع أو الفرع المستفيد.',
        },
        { key: 'priority', label: 'الأولوية (Priority)', kind: 'select', options: ['عاجل', 'عادي', 'منخفض'] },
        { key: 'reason', label: 'سبب النقل (Reason)', kind: 'text' },
        { key: 'requiredDate', label: 'تاريخ الوصول المطلوب (Required Date)', kind: 'date' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود النقل — Transfer Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '13%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '15%' },
        { key: 'description', label: 'وصف الصنف', kind: 'text', width: '34%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '10%' },
        { key: 'qty', label: 'الكمية المطلوبة', kind: 'number', width: '12%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '16%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 ملخّص الطلب — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'totalLines',
          label: 'عدد الأصناف',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length,
        },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => totalQty(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات إضافية', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'requestedBy', label: 'طالب النقل (Requested By)', source: 'creator' },
    { key: 'approvedBy', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'warehouseKeeper', label: 'أمين المستودع (Warehouse Keeper)', source: null },
  ],

  warnings: transferReqWarnings,
};

export default schema;
