/**
 * بيعُ كشيت — بيعٌ بالجملة بالآجل بكشفٍ مطبوع (‹KSH ع› · طلب المالك 2026-11-09).
 *
 * «بيعُ دفعةٍ بالجملة بكشف»: يبيع كمّيّةً كبيرةً لعميلٍ **بالآجل** في مستندٍ واحد،
 * فيَدين العميلُ ويظهر البيعُ في **كشف حسابه** (ومن هنا «الكشف»). يُخرج البضاعةَ من
 * المخزن (WAREHOUSE → EXTERNAL) عند الإنجاز، ويُقيَّد **مدينًا ذمّةَ العميل دائنًا
 * المبيعات** (`LEDGER_RULES.KSH` + `COUNTERPART.KSH`) — فيُسوّى لاحقًا بسند قبض (RCP).
 *
 * يختلف عن الكاشير (POS): ذاك بيعٌ **نقديٌّ** للتجزئة بإيصال؛ وهذا بيعُ **جملةٍ آجلٌ**
 * بكشف. ويختلف عن سلسلة البيع القياسيّة (SO→PICK→…→INV): هذا **بخطوةٍ واحدة** من
 * المخزن مباشرةً، لا يمرّ بحجزٍ ولا تجهيز. يُطبع بلا هويّةِ شركة (`plainPrint`).
 */

/** إجماليُّ بندٍ = الكمّيّة × السعر − الخصم، لا يقلّ عن صفر. */
export function lineTotal(line) {
  return Math.max(0, (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0) - (Number(line?.discount) || 0));
}

/** إجماليُّ الكشف — به تُقيَّد ذمّةُ العميل. */
export function totalSale(lines) {
  return (lines || []).reduce((t, l) => t + lineTotal(l), 0);
}

/** تحذيراتُ بيع الكشيت (تنبّه ولا تمنع). */
export function kshWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (!lines.length) out.push('لا بندَ مباعٌ — كشفٌ فارغٌ لا يُقيَّد');
  if (!String(h.customerCode || h.customer || '').trim()) out.push('العميلُ غير محدَّد — بيعُ الكشيت آجلٌ على حسابه، فلا يُترَك فارغًا');
  if (!String(h.warehouse || '').trim()) out.push('المخزنُ المصدرُ غير محدَّد — منه يُخصم الرصيد');
  const noPrice = lines.filter((l) => !(Number(l?.unitPrice) > 0));
  if (noPrice.length) out.push(`${noPrice.length} بندًا بلا سعر — راجِع قائمةَ الأسعار`);
  return out;
}

const schema = {
  type: 'KSH',
  stage: 7,
  titleAr: 'بيع كشيت (جملة آجل)',
  titleEn: 'Wholesale Sheet Sale',
  formCode: 'BFP-KSH-001',
  orientation: 'landscape',
  // ★ يُطبع كشفًا بلا اسمٍ/شعارِ شركة.
  plainPrint: true,

  /** يُنشئه البائع/أمين المخزن، ويعتمده المدير أو مشرفُ المبيعات (فصلُ من يبيع عمّن يعتمد). */
  roles: {
    create: ['warehouse_manager', 'storekeeper', 'sales_rep', 'sales_supervisor'],
    approve: ['warehouse_manager', 'sales_supervisor'],
    complete: ['warehouse_manager', 'storekeeper', 'sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات الكشف — Sheet Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'saleDate', label: 'تاريخ البيع (Sale Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'المخزنُ الذي تخرج منه البضاعة فعلًا — عليه يقع خصمُ الرصيد.',
        },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', required: true, hint: 'من ماستر العملاء — عليه تُقيَّد الذمّة ويظهر في كشف حسابه.' },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'dueDate', label: 'موعد السداد (Due Date)', kind: 'date', hint: 'آجلٌ — فبلا موعدٍ لا تُتابَع ذمّةٌ بتاريخ.' },
        {
          key: 'soldBy',
          label: 'المسؤول عن البيع',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الكشف',
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: 'أصناف الكشف — Sheet Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'qty', label: 'الكمّيّة', kind: 'number', width: '9%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '8%' },
        { key: 'unitPrice', label: 'سعر الوحدة', kind: 'number', width: '9%' },
        { key: 'discount', label: 'الخصم', kind: 'number', width: '7%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '8%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '8%' },
        { key: 'lineTotal', label: 'الإجماليّ', kind: 'computed', compute: lineTotal, width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: 'الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجماليّ الكمّيّات', kind: 'computed', compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0) },
        { key: 'grandTotal', label: 'إجماليّ الكشف المستحقّ (د.ل)', kind: 'computed', compute: (d) => totalSale(d.lines) },
      ],
    },
  ],

  signatures: [
    { key: 'soldBy', label: 'البائع (Sold By)', source: 'creator' },
    { key: 'approver', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'customer', label: 'العميل / المستلم (Customer)', source: null },
  ],

  warnings: kshWarnings,
};

export default schema;
