/**
 * مخطّط تأكيد التسليم للعميل (POD) — الحلقة التي تُفرّغ المركبة (قرار المالك 2026-08-04).
 *
 * موقعه في الدورة: إذن التسليم (DN) **حمّل** الطلب في مركبةٍ بعينها، فبقي الرصيد
 * «على المركبة المتنقّلة». وهذا المستند — بيد **فريق الحركة** — يؤكّد وصوله
 * للعميل فعلًا، فعند إنجازه يُخصم المشحون من موقع المركبة (`VAN:‹لوحة›`) إلى
 * خارج المنشأة. هنا **يُخصم الرصيد وتتأكّد العملية** كما وصف المالك حرفيًّا.
 *
 * يُشتقّ من إذن تسليمٍ معتمَد فيرث بنوده وعميله و**لوحة مركبته** — منها يقرأ
 * القيد موقع المركبة الذي يخصم منه (`postingRules.POD` → `@vehicle`).
 *
 * ⚠️ حقل «لوحة المركبة» إلزاميّ: منه يُعرَف الرصيد الذي يُخصم. وحارس الرصيد
 * السالب يمنع تأكيد تسليم أكثر مما حُمِّل على تلك المركبة.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** تحذيرات تأكيد التسليم (تنبّه ولا تمنع). */
export function podWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (!String(h.vehiclePlate || '').trim()) {
    out.push('لوحة المركبة يلزم إدخالها — منها يُخصم رصيد المركبة عند التأكيد');
  }
  if (!lines.length) out.push('لا بند بكمية — تأكيدٌ بلا تسليمٍ لا يُخصم رصيدًا');
  if (!String(h.receivedBy || '').trim()) {
    out.push('اسم مستلم العميل غير مُدخل — التسليم بلا مستلمٍ لا يُثبَت');
  }
  return out;
}

const schema = {
  type: 'POD',
  stage: 8,
  titleAr: 'تأكيد التسليم للعميل',
  titleEn: 'Proof of Delivery',
  formCode: 'BFP-POD-001',
  orientation: 'portrait',

  /**
   * 🚚 وظيفة فريق الحركة (قرار المالك): الحركة تؤكّد التسليم فيُخصم رصيد المركبة.
   * المدير يشاركها. (دور fleet مُنح صلاحية القيد المخزنيّ لهذا الغرض في القواعد.)
   */
  roles: {
    create: ['fleet', 'storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager', 'fleet'],
    complete: ['fleet', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات التسليم — Delivery Confirmation',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'deliveryDate', label: 'تاريخ التسليم الفعلي (Delivery Date)', kind: 'date', required: true },
        { key: 'customer', label: 'اسم العميل (Customer)', kind: 'text', required: true },
        {
          key: 'dnRef',
          label: 'رقم إذن التسليم (DN Ref.)',
          kind: 'docref',
          docType: 'DN',
          hint: 'اكتب رقم إذن التسليم (DN-…) فيُتعرَّف عليه ويُربط — أو يُملأ عند الاشتقاق',
        },
        {
          key: 'vehiclePlate',
          label: 'لوحة المركبة (Vehicle Plate)',
          kind: 'text',
          ltr: true,
          required: true,
          hint: 'المركبة التي حُمِّل عليها الطلب — منها يُخصم الرصيد عند التأكيد.',
        },
        { key: 'driverName', label: 'اسم السائق (Driver)', kind: 'text' },
        { key: 'receivedBy', label: 'اسم مستلم العميل (Received By)', kind: 'text' },
      ],
      extraFields: [{ key: 'deliveryAddress', label: 'موقع التسليم (Delivery Location)', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: '📦 بنود التسليم — Delivered Lines',
      kind: 'table',
      note: '🚚 عند إنجاز المستند يُخصم المُسلَّم من موقع المركبة إلى خارج المنشأة.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '26%' },
        { key: 'qty', label: 'الكمية المُسلَّمة', kind: 'number', width: '11%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '10%' },
        { key: 'batch', label: 'رقم الدفعة (Batch)', kind: 'text', width: '11%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '11%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalLines', label: 'عدد البنود المُسلَّمة', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات المُسلَّمة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'driver', label: 'سائق التسليم (Driver)', source: 'creator' },
    { key: 'approvedBy', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'customer', label: 'استلام العميل (Customer)', source: null },
  ],

  /** الدليل: توقيع العميل بالاستلام، وصورة التسليم. */
  attachments: [
    { key: 'customerSignature', kind: 'signature', label: 'توقيع العميل بالاستلام' },
    { key: 'photo', kind: 'goods', label: 'صورة التسليم' },
  ],

  /** 🔍 الرقابة: يؤكّد المدقّق مطابقة المُسلَّم للمركبة وحضور توقيع العميل. */
  control: {
    requireSignedCopy: true,
    compareFields: ['deliveryDate', 'customer', 'vehiclePlate', 'totalQty'],
    checklist: [
      { key: 'qty', label: 'الكميات المُسلَّمة مطابقة للمحمّل على المركبة' },
      { key: 'customer', label: 'العميل والموقع مطابقان' },
      { key: 'signature', label: 'توقيع مستلم العميل حاضر' },
    ],
  },

  warnings: podWarnings,
};

export default schema;
