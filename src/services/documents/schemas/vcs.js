/**
 * مخطّط تحقّق بيع الأمانة (VCS) — اللحظة التي تخرج فيها الملكيّة فعلًا.
 *
 * ما يقع عند إنجازه: `CUST:‹رمز› ← خارج المنشأة`. البضاعة كانت عند التاجر
 * ومِلكُها لنا؛ وقد باعها للمستهلك، فالآن فقط تصير بيعًا وتُستحقّ قيمتها.
 *
 * ═══ لماذا مستندٌ مستقلّ عن الفاتورة؟ ═══
 * لأنّ البيع الأوّليّ (إلى التاجر) والبيع الفعليّ (إلى المستهلك) حدثان مختلفان
 * في الزمن وفي المعنى. وهذه بعينها المشكلة التي بُني عليها النظام كلّه: الشركة
 * تعرف ما سلّمت ولا تعرف ما بيع. فهذا المستند هو **الجواب**: كم بيع فعلًا،
 * ومن أيّ تشغيلة، ومتى — لا تخمينًا من فرق الأرصدة.
 *
 * والحارس يخدمنا مجّانًا: لا يُحتسب مبيعًا إلّا ما أُودع فعلًا، لأنّ حارس الرصيد
 * السالب يمنع سحب ما ليس في موقع العميل.
 */

function lineTotal(line) {
  const qty = Number(line?.qty) || 0;
  const price = Number(line?.unitPrice) || 0;
  return Math.max(0, qty * price);
}

/** تحذيرات المطابقة: بلا رمز عميل · بلا تشغيلة · دورة مطابقة متأخّرة. */
export function vcsWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  if (!String(h.customerCode || '').trim()) out.push('رمز العميل يُحدّد من أيّ رصيدٍ يُخصم — لا مطابقة بلا رمز');
  if (!String(h.depositRef || '').trim()) out.push('مرجع الإيداع يربط المبيع بأمانته — يُفضَّل ذكره');

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim());
  if (noBatch.length) out.push(`${noBatch.length} بندًا بلا تشغيلة — يتعذّر خصمه من الدفعة الصحيحة`);

  const noPrice = lines.filter((l) => !(Number(l?.unitPrice) > 0));
  if (noPrice.length) out.push(`${noPrice.length} بندًا بلا سعر — لا تُستحقّ قيمةٌ بلا سعر`);

  return out;
}

const schema = {
  type: 'VCS',
  stage: 8,
  titleAr: 'تحقّق بيع الأمانة',
  titleEn: 'Consignment Sell-Through',
  formCode: 'BFP-VCS-001',
  orientation: 'portrait',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['sales_rep', 'sales_supervisor'],
    complete: ['sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات المطابقة — Sell-Through Header',
      kind: 'fields',
      columns: 3,
      note: 'ما يُثبت هنا يخرج من رصيد العميل نهائيًّا وتُستحقّ قيمته.',
      fields: [
        { key: 'saleDate', label: 'تاريخ المطابقة (Date)', kind: 'date', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', required: true },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'depositRef', label: 'مرجع الإيداع (Deposit Ref.)', kind: 'text' },
        { key: 'visitRef', label: 'رقم الزيارة (Visit Ref.)', kind: 'text' },
        { key: 'rep', label: 'المندوب (Sales Rep)', kind: 'identity', source: 'creator' },
      ],
    },

    {
      key: 'lines',
      title: '📦 المبيع فعلًا — Sold Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '12%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '14%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '26%' },
        { key: 'qty', label: 'الكمية المباعة', kind: 'number', width: '11%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '11%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '11%' },
        { key: 'unitPrice', label: 'سعر الوحدة', kind: 'number', width: '9%' },
        { key: 'lineTotal', label: 'الإجمالي', kind: 'computed', compute: lineTotal, width: '6%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي المباع', kind: 'computed', compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0) },
        { key: 'grandTotal', label: 'القيمة المستحقّة', kind: 'computed', compute: (d) => (d.lines || []).reduce((s, l) => s + lineTotal(l), 0) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب (Sales Rep)', source: 'creator' },
    { key: 'customer', label: 'العميل (Customer)', source: null },
  ],

  attachments: [{ key: 'customerSignature', kind: 'signature', label: 'توقيع العميل بالمطابقة' }],

  warnings: vcsWarnings,
};

export default schema;
