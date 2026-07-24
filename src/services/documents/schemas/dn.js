/**
 * مخطّط إذن التسليم (DN) — المرحلة 07، الحلقة الثالثة في مسار الصرف.
 *
 * الأصل الورقي: `public/forms/form_DeliveryNote.html`.
 *
 * هو **المستند الذي يُجيز الخروج**: تصريح البوابة لا يُشتقّ إلا منه، ولا
 * يُشتقّ إلا بعد اعتماده. وهذا نصف حارس البوابة — ونصفه الآخر في `gp.js`.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم إذن التسليم» كان يُكتب بيد الموظّف ⇒ صار `DN-2026-####`.
 *  · بنوده كانت تُنسخ من قائمة السحب يدويًّا ⇒ صارت تُشتقّ منها.
 *  · «مسؤول المستودع» كان اسمًا يُكتب ⇒ صار من الهوية.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات الإذن: بندٌ بلا تشغيلة أو صلاحية (يُفقد تتبّع الشحنة عند
 * الاسترجاع) · بلا سائق أو لوحة (لا يُصدَر تصريح بوابة بلا مركبة معروفة).
 */
export function dnWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim() && !String(l?.expiry || '').trim());
  if (noBatch.length) out.push(`${noBatch.length} بندًا بلا تشغيلة ولا صلاحية — يتعذّر تتبّعه عند الاسترجاع`);

  if (!String(h.driverName || '').trim() || !String(h.vehiclePlate || '').trim()) {
    out.push('اسم السائق ولوحة المركبة يلزمان لإصدار تصريح البوابة');
  }
  return out;
}

const schema = {
  type: 'DN',
  stage: 7,
  titleAr: 'إذن التسليم',
  titleEn: 'Delivery Note',
  formCode: 'BFP-DN-001',
  orientation: 'portrait',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات إذن التسليم — Delivery Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'deliveryDate', label: 'تاريخ التسليم (Delivery Date)', kind: 'date', required: true },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'customerCode', label: 'رقم العميل (Customer Code)', kind: 'text' },
        { key: 'salesOrderRef', label: 'رقم طلب البيع (Sales Order Ref.)', kind: 'text' },
        { key: 'fromBranch', label: 'الفرع المُسلّم (From Branch)', kind: 'text' },
        {
          key: 'whOfficer',
          label: 'مسؤول المستودع (WH Officer)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الإذن',
        },
      ],
      extraFields: [{ key: 'deliveryAddress', label: 'عنوان التسليم (Delivery Address)', kind: 'textarea' }],
    },

    {
      key: 'transport',
      title: '🚚 بيانات النقل — Transport',
      kind: 'fields',
      columns: 3,
      note: 'هذه البيانات شرط إصدار تصريح البوابة — لا خروج بمركبة مجهولة.',
      fields: [
        { key: 'driverName', label: 'اسم السائق (Driver Name)', kind: 'text', required: true },
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'contactNo', label: 'رقم الجوال (Contact No.)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود التسليم — Delivery Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '26%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '10%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '10%' },
        { key: 'batch', label: 'رقم الدفعة (Batch)', kind: 'text', width: '11%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '11%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '8%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'whOfficer', label: 'مسؤول المستودع (WH Officer)', source: 'creator' },
    { key: 'driver', label: 'السائق (Driver)', source: null },
    { key: 'receiver', label: 'العميل / المُستلم (Customer / Receiver)', source: null },
  ],

  warnings: dnWarnings,
};

export default schema;
