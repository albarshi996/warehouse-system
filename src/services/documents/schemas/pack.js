/**
 * مخطّط قائمة التعبئة (PACK) — المرحلة 06، الحلقة الثانية في مسار الصرف.
 *
 * الأصل الورقي: `public/forms/form_PackingList.html`.
 *
 * ملاحظة على الترتيب: الورق يذكر «رقم إذن التسليم المرجعي» في التعبئة —
 * أي أنه كان يُملأ بعد إصدار الإذن. وفي النظام تُشتقّ التعبئة من **السحب**
 * (فبنودها هي ما سُحب فعلًا)، ثم يُشتقّ الإذن منها. فحقل مرجع الإذن يبقى
 * للكتابة اليدوية حين تُعبَّأ شحنةٌ لإذنٍ قائم — ولا يُخترَع رقمٌ لم يصدر.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم قائمة التعبئة» كان يُكتب ⇒ صار `PACK-2026-####`.
 *  · «إجمالي عدد الطرود» و«إجمالي الوزن» كانا يُجمعان بالقلم ⇒ صارا محسوبين.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** عدد الطرود المميّزة — الطرد الواحد قد يحمل أكثر من بند. */
export function cartonCount(lines) {
  const set = new Set(
    (lines || [])
      .map((l) => String(l?.cartonNo || '').trim())
      .filter(Boolean)
  );
  return set.size;
}

/** تحذيرات التعبئة: بندٌ بلا رقم طرد · طردٌ بلا وزن. */
export function packWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  const noCarton = lines.filter((l) => !String(l?.cartonNo || '').trim());
  if (noCarton.length) out.push(`${noCarton.length} بندًا بلا رقم طرد — لا يُتتبَّع داخل الشحنة`);

  const noWeight = lines.filter((l) => !(Number(l?.weight) > 0));
  if (noWeight.length) out.push(`${noWeight.length} بندًا بلا وزن — إجمالي الشحنة سيكون ناقصًا`);

  return out;
}

const schema = {
  type: 'PACK',
  stage: 6,
  titleAr: 'قائمة التعبئة',
  titleEn: 'Packing List',
  formCode: 'BFP-PACK-001',
  orientation: 'landscape',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['qc_inspector', 'warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات قائمة التعبئة — Packing Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'issueDate', label: 'تاريخ الإصدار (Issue Date)', kind: 'date', required: true },
        { key: 'dnRef', label: 'رقم إذن التسليم المرجعي (DN Ref.)', kind: 'text' },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'carrier', label: 'الناقل / شركة الشحن (Carrier)', kind: 'text' },
        { key: 'trackingNo', label: 'رقم البوليصة / AWB (Tracking No.)', kind: 'text' },
        { key: 'destination', label: 'الوجهة (Destination)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 محتويات الطرود — Carton Contents',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'cartonNo', label: 'رقم الطرد (Carton No.)', kind: 'text', width: '11%' },
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'محتوى الطرد', kind: 'text', width: '24%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'weight', label: 'الوزن (kg)', kind: 'number', step: 0.01, width: '9%' },
        { key: 'dimensions', label: 'الأبعاد (سم)', kind: 'text', width: '9%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 إجماليات الشحنة — Shipment Totals',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalCartons', label: 'إجمالي عدد الطرود (Total Cartons)', kind: 'computed', compute: (d) => cartonCount(d.lines) },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        { key: 'totalWeight', label: 'إجمالي الوزن (kg)', kind: 'computed', compute: (d) => Math.round(sumColumn(d.lines, 'weight') * 100) / 100 },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'packedBy', label: 'موظف التعبئة (Packed By)', source: 'creator' },
    { key: 'checkedBy', label: 'مدقق الجودة (Checked By)', source: 'approver' },
    { key: 'supervisor', label: 'مشرف المستودع (WH Supervisor)', source: null },
  ],

  warnings: packWarnings,
};

export default schema;
