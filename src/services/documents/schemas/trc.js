/**
 * مخطّط استلام النقل (TRC) — الفرع يستلم، ومخزن النقل يعود للصفر.
 *
 * ⚖️ **هنا يُفرَّغ مخزن النقل**: بإنجاز الاستلام يُخصم المستلَم من مخزن النقل
 * (TRANSIT) ويُضاف إلى مستودع الوجهة. فإن طابق المستلَمُ المشحونَ عاد مخزن
 * النقل صفرًا. وإن نقص المستلَم، **بقي الفرقُ في مخزن النقل** ظاهرًا — وهو
 * تقرير فروقات النقل نفسه، لا يُخفى ولا يُبتلع بصمت.
 *
 * يُشتقّ من مستند النقل فيرث المشحون مرجعًا، ويملأ المستلِمُ الكميةَ الفعلية.
 * الفرق عمودٌ محسوب لا يُكتب بالقلم.
 *
 * ⚠️ حقل «مستودع الوجهة» إلزاميّ: إليه يصل الرصيد.
 */

/** فرق البند = المستلَم − المشحون (سالبٌ يعني نقصًا بقي في مخزن النقل). */
export function lineVariance(line) {
  return (Number(line?.qtyReceived) || 0) - (Number(line?.qtyShipped) || 0);
}

/** إجمالي المستلَم. */
export function totalReceived(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l?.qtyReceived) || 0), 0);
}

/** إجمالي النقص العالق في مخزن النقل (فرقٌ سالب). */
export function totalShortage(lines) {
  return (lines || []).reduce((s, l) => {
    const v = lineVariance(l);
    return s + (v < 0 ? -v : 0);
  }, 0);
}

/**
 * تحذيرات الاستلام: فروقٌ بلا سبب · استلامٌ يتجاوز المشحون (خطأ غالبًا).
 */
export function transferReceiptWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qtyShipped) > 0 || Number(l?.qtyReceived) > 0);
  const short = lines.filter((l) => lineVariance(l) < 0);
  const shortNoReason = short.filter((l) => !String(l?.varianceReason || '').trim());
  if (shortNoReason.length) out.push(`${shortNoReason.length} بندًا ناقصًا بلا سبب موثَّق — الفرق يبقى في مخزن النقل`);
  const over = lines.filter((l) => lineVariance(l) > 0);
  if (over.length) out.push(`${over.length} بندًا استُلم أكثر من المشحون — راجع العدّ`);
  if (!lines.filter((l) => Number(l?.qtyReceived) > 0).length) out.push('لا بند مستلَم — لا شيء يُقيَّد');
  return out;
}

const schema = {
  type: 'TRC',
  stage: 8,
  titleAr: 'استلام النقل',
  titleEn: 'Transfer Receipt',
  formCode: 'BFP-TRC-001',
  orientation: 'landscape',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '⚖️ بيانات الاستلام — Receipt Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'receiptDate', label: 'تاريخ الاستلام (Receipt Date)', kind: 'date', required: true },
        {
          key: 'transferNoteRef',
          label: 'رقم مستند النقل المرجعي (TRN Ref.)',
          kind: 'text',
          hint: 'يُملأ تلقائيًّا عند الاشتقاق من مستند النقل',
        },
        {
          key: 'fromWarehouse',
          label: 'مستودع المصدر (From Warehouse)',
          kind: 'text',
          hint: 'مورَّثٌ من مستند النقل — للمرجعية.',
        },
        {
          key: 'toWarehouse',
          label: 'مستودع الوجهة / الفرع (To Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المستودع الذي يصل إليه الرصيد فعلًا.',
        },
        { key: 'receivedBy', label: 'المستلِم (Received By)', kind: 'identity', source: 'creator' },
        { key: 'vehiclePlate', label: 'لوحة المركبة (Vehicle Plate)', kind: 'text', ltr: true },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الاستلام — Receipt Lines',
      kind: 'table',
      note: '⚖️ عند الإنجاز يُخصم المستلَم من مخزن النقل ويُضاف للوجهة. أيّ نقصٍ يبقى في مخزن النقل كفرق نقلٍ ظاهر.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '8%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'وصف الصنف', kind: 'text', width: '18%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '6%' },
        { key: 'qtyShipped', label: 'المشحون', kind: 'number', width: '8%' },
        { key: 'qtyReceived', label: 'المستلَم', kind: 'number', width: '8%' },
        { key: 'variance', label: 'الفرق', kind: 'computed', compute: lineVariance, width: '6%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '8%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '9%' },
        { key: 'unitCost', label: 'التكلفة', kind: 'number', width: '6%' },
        { key: 'varianceReason', label: 'سبب الفرق', kind: 'text', width: '10%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 ملخّص الاستلام — Receipt Summary',
      kind: 'fields',
      columns: 4,
      fields: [
        {
          key: 'totalLines',
          label: 'عدد الأصناف',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qtyReceived) > 0).length,
        },
        { key: 'totalReceived', label: 'إجمالي المستلَم', kind: 'computed', compute: (d) => totalReceived(d.lines) },
        { key: 'totalShortage', label: 'إجمالي النقص العالق', kind: 'computed', compute: (d) => totalShortage(d.lines) },
      ],
      extraFields: [
        { key: 'settlementStatus', label: 'حالة تسوية الفرق', kind: 'select', options: ['لا فرق', 'قيد المراجعة', 'مسوّى', 'مشطوب'] },
        { key: 'notes', label: 'ملاحظات', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'receivedBy', label: 'المستلِم (Received By)', source: 'creator' },
    { key: 'approvedBy', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'branchManager', label: 'مسؤول الفرع (Branch Manager)', source: null },
  ],

  warnings: transferReceiptWarnings,
};

export default schema;
