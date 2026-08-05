/**
 * مخطّط مستند مناولة الحاوية (CTR) — وثيقةٌ مخصّصة لكلّ حاويةٍ يُتعامل معها،
 * مربوطةٌ بالفريق المنفِّذ وبأمر الاستلام/التسليم (المحور الثاني).
 *
 * توثيقيٌّ بلا أثرٍ مخزنيّ (مثل طلب النقل TR): يوثّق تفريغ/تحميل الحاوية —
 * رقمها وخطّها الملاحيّ والختم والفريق المنفِّذ — ويُربط برقم أمر الاستلام (GRN)
 * عبر حقلٍ من نوع docref. الحركة المخزنيّة تبقى في GRN/DN، وهذا سجلٌّ للمناولة.
 */

/** إجمالي كميات بنود الحاوية. */
export function ctrTotalQty(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0);
}

/** تحذيرات مستند الحاوية (تنبّه ولا تمنع). */
export function containerWarnings(doc) {
  const out = [];
  if (!String(doc?.header?.containerNo || '').trim()) out.push('رقم الحاوية غير مُدخَل');
  if (!String(doc?.header?.crewNo || '').trim()) out.push('لم يُحدَّد الفريق المنفِّذ');
  if (!ctrTotalQty(doc?.lines)) out.push('لا بند بكمية — حاويةٌ فارغة');
  return out;
}

const schema = {
  type: 'CTR',
  stage: 4,
  titleAr: 'مستند مناولة حاوية',
  titleEn: 'Container Handling',
  formCode: 'BFP-CTR-001',
  orientation: 'portrait',

  roles: {
    create: ['labor_supervisor', 'storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager', 'labor_supervisor'],
    complete: ['labor_supervisor', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📦 بيانات الحاوية — Container Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'containerNo', label: 'رقم الحاوية (Container No.)', kind: 'text', required: true, ltr: true },
        { key: 'shippingLine', label: 'الخطّ الملاحيّ (Shipping Line)', kind: 'text' },
        { key: 'operation', label: 'العملية (Operation)', kind: 'select', options: ['تفريغ', 'تحميل'], required: true },
        { key: 'sealNo', label: 'رقم الختم (Seal No.)', kind: 'text', ltr: true },
        { key: 'arrivalDate', label: 'تاريخ المناولة (Date)', kind: 'date', required: true },
        { key: 'dockNo', label: 'رصيف التفريغ (Dock)', kind: 'text' },
        { key: 'crewNo', label: 'رقم الفريق المنفِّذ (Crew No.)', kind: 'text', required: true },
        { key: 'truckPlate', label: 'لوحة الشاحنة (Truck Plate)', kind: 'text', ltr: true },
        { key: 'grnRef', label: 'مرجع أمر الاستلام (GRN)', kind: 'docref', docType: 'GRN' },
      ],
    },

    {
      key: 'lines',
      title: '🧾 محتويات الحاوية — Container Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '13%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '15%' },
        { key: 'description', label: 'وصف الصنف', kind: 'text', width: '34%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '10%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '12%' },
        { key: 'condition', label: 'الحالة', kind: 'text', width: '16%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 ملخّص المناولة — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'totalLines',
          label: 'عدد الأصناف',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length,
        },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => ctrTotalQty(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات المناولة', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'handledBy', label: 'مشرف المناولة (Handled By)', source: 'creator' },
    { key: 'approvedBy', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'gateOfficer', label: 'ضابط البوابة (Gate Officer)', source: null },
  ],

  warnings: containerWarnings,
};

export default schema;
