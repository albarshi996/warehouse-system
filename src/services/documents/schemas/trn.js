/**
 * مخطّط مستند النقل (TRN) — الشحنة تغادر المصدر إلى مخزن النقل.
 *
 * 🚚 **هنا يبدأ مخزن النقل**: بمجرّد إنجاز هذا المستند يُخصم المشحون من مستودع
 * المصدر ويُضاف إلى **مخزن النقل (TRANSIT)** — لا إلى الوجهة مباشرةً. فبين
 * المغادرة والاستلام يقبع الرصيد «في الطريق»، وهو ما يظهره تقرير الشحنات
 * المعلّقة. ولا يصل الوجهةَ إلا باستلام الفرع (TRC).
 *
 * يُشتقّ من طلب النقل المعتمَد فيرث مستودعَيه وبنوده، ويحمل رقمه مرجعًا.
 *
 * ⚠️ حقل «مستودع المصدر» إلزاميّ: منه يقع الخصم. والوجهة تُورَّث للاستلام.
 */

/** إجمالي المشحون. */
export function totalShipped(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l?.qtyShipped) || 0), 0);
}

/** قيمة الشحنة الدفترية (لتقدير ما «في الطريق»). */
export function shipmentValue(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l?.qtyShipped) || 0) * (Number(l?.unitCost) || 0), 0);
}

/** تحذيرات مستند النقل (تنبّه ولا تمنع). */
export function transferNoteWarnings(doc) {
  const out = [];
  const from = String(doc?.header?.fromWarehouse || '').trim().toUpperCase();
  const to = String(doc?.header?.toWarehouse || '').trim().toUpperCase();
  if (from && to && from === to) out.push('المصدر والوجهة مستودعٌ واحد — لا نقل بلا انتقال');
  const shipped = (doc?.lines || []).filter((l) => Number(l?.qtyShipped) > 0);
  if (!shipped.length) out.push('لا بند مشحون — مستندٌ بلا شحنة لا يُقيَّد');
  const noExpiry = shipped.filter((l) => !String(l?.expiry || '').trim());
  if (noExpiry.length) out.push(`${noExpiry.length} بندًا مشحونًا بلا تاريخ صلاحية`);
  return out;
}

const schema = {
  type: 'TRN',
  stage: 7,
  titleAr: 'مستند النقل',
  titleEn: 'Transfer Note (Shipment)',
  formCode: 'BFP-TRN-001',
  orientation: 'landscape',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '🚚 بيانات الشحن — Shipment Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'shipmentDate', label: 'تاريخ الشحن (Shipment Date)', kind: 'date', required: true },
        {
          key: 'transferReqRef',
          label: 'رقم طلب النقل المرجعي (TR Ref.)',
          kind: 'docref',
          docType: 'TR',
          hint: 'اكتب رقم طلب النقل (TR-…) فيُتعرَّف عليه ويُربط — أو يُملأ عند الاشتقاق',
        },
        {
          key: 'fromWarehouse',
          label: 'مستودع المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المستودع الذي يخرج منه الرصيد فعلًا — عليه يقع الخصم.',
        },
        {
          key: 'toWarehouse',
          label: 'مستودع الوجهة / الفرع (To Warehouse)',
          kind: 'text',
          required: true,
          hint: 'يُورَّث لمستند الاستلام.',
        },
        // ‹FNB-102› مركز التكلفة المستفيد — يُورَّث من طلب النقل (TR>TRN)
        // ويُختار من الشجرة حين يُنشأ المستند مستقلًّا.
        { key: 'costCenter', label: 'مركز التكلفة (Cost Center)', kind: 'text', ltr: true, hint: 'رمزٌ من سيّد المواقع التنظيميّة — به تُحمَّل التكلفة على الفرع والبراند والقطاع' },
        { key: 'driverName', label: 'اسم السائق (Driver)', kind: 'text' },
        { key: 'vehiclePlate', label: 'لوحة المركبة (Vehicle Plate)', kind: 'text', ltr: true },
        { key: 'loadedBy', label: 'مسؤول التحميل (Loaded By)', kind: 'identity', source: 'creator' },
        { key: 'sealNo', label: 'رقم الرصاصة/الختم (Seal No.)', kind: 'text' },
        { key: 'expectedArrival', label: 'الوصول المتوقّع (Expected Arrival)', kind: 'date' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الشحنة — Shipment Lines',
      kind: 'table',
      note: '🚚 عند إنجاز المستند يُخصم المشحون من المصدر ويُضاف إلى مخزن النقل حتى يستلمه الفرع.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'وصف الصنف', kind: 'text', width: '20%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '7%' },
        { key: 'qtyShipped', label: 'الكمية المشحونة', kind: 'number', width: '10%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '9%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '11%' },
        { key: 'unitCost', label: 'التكلفة (د.ل)', kind: 'number', width: '9%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '14%' },
      ],
    },

    {
      key: 'packing',
      title: '📦 تعبئة الشحنة — Packing Checklist',
      kind: 'checklist',
      note: 'تُملأ قبل مغادرة الشحنة — دليلُ أن ما يُشحن مُعبَّأ ومختوم وموسوم لوجهته.',
      items: [
        { key: 'count-ok', label: 'عدد الطرود مطابق للبنود المشحونة' },
        { key: 'sealed', label: 'الطرود مغلقة ومختومة' },
        { key: 'labels', label: 'بطاقة الوجهة/الفرع ملصقة على كل طرد' },
        { key: 'no-damage', label: 'لا تلف ظاهر على التعبئة' },
        { key: 'cold-chain', label: 'شروط النقل (تبريد/تجميد) مهيّأة إن لزمت' },
        { key: 'seal-logged', label: 'رقم الختم مسجَّل في رأس المستند' },
        { key: 'docs-attached', label: 'نسخة مستند النقل مرافقة للشحنة' },
      ],
    },

    {
      key: 'summary',
      title: '📊 ملخّص الشحنة — Shipment Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'totalLines',
          label: 'عدد الأصناف',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qtyShipped) > 0).length,
        },
        { key: 'totalShipped', label: 'إجمالي المشحون', kind: 'computed', compute: (d) => totalShipped(d.lines) },
        { key: 'shipmentValue', label: 'القيمة الدفترية (د.ل)', kind: 'computed', compute: (d) => shipmentValue(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'loadedBy', label: 'مسؤول التحميل (Loaded By)', source: 'creator' },
    { key: 'approvedBy', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'driver', label: 'السائق (Driver)', source: null },
  ],

  /** أدلّة الشحنة: صورة التعبئة/التحميل، والنسخة الموقّعة من مستلم الفرع. */
  attachments: [
    { key: 'packing', kind: 'packing', label: 'صورة التعبئة/التحميل' },
    { key: 'signedCopy', kind: 'signedCopy', label: 'نسخة موقّعة من المستلم' },
  ],

  /** 🔍 الرقابة: طابِق الشحنة بصورة التعبئة والنسخة الموقّعة من مستلم الفرع. */
  control: {
    requireSignedCopy: true,
    compareFields: ['shipmentDate', 'fromWarehouse', 'toWarehouse', 'totalShipped'],
    checklist: [
      { key: 'qty', label: 'الكميات المشحونة مطابقة لصورة التعبئة' },
      { key: 'dest', label: 'مستودع الوجهة صحيح' },
      { key: 'seal', label: 'رقم الختم مطابق' },
      { key: 'signature', label: 'توقيع مستلم الفرع حاضر' },
    ],
  },

  warnings: transferNoteWarnings,
};

export default schema;
