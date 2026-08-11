/**
 * مخطّط سند التحصيل الميدانيّ (RCV) — م٥-أ · يسدّ ف‑١٠.
 *
 * ═══ لماذا مستندٌ مستقلٌّ عن RCP ═══
 * سند القبض يُصدره أمين الخزينة في المكتب: المال يدخل الخزينة مباشرةً. أمّا
 * التحصيل الميدانيّ فيقبضه **المندوب في الشارع**، فيبقى المال في جيبه حتّى
 * يُودعه في التسوية. فبينهما فرقٌ جوهريّ: **حسابٌ نقديٌّ وسيط**.
 *
 * ولو استعملنا `RCP` للاثنين لظهر مالُ المندوب في الخزينة قبل أن يصلها — وهو
 * أخطر ما في التحصيل الميدانيّ: عجزٌ لا يُكتشف إلّا عند الجرد النقديّ.
 *
 * ═══ الأثر المزدوج ═══
 * ① ذمّة العميل تنقص (كالقبض تمامًا).
 * ② **حساب المندوب النقديّ يزيد** — ويُقفَل بالإيداع في تسوية الرحلة (VSR).
 *
 * ═══ من يعتمد ═══
 * المشرف لا المندوب: من قبض المال لا يعتمد قبضه. لكنّ **الإصدار للمندوب**
 * لأنّ منعه يوقف التحصيل في وجه تاجرٍ يدفع — فيُسجَّل خارج النظام وتضيع الواقعة.
 */

/** مبلغ بندٍ — ما يُقاصّ من فاتورة. */
export function lineAmount(line) {
  return Number(line?.amount) || 0;
}

/** إجماليّ المحصَّل. */
export function collectedTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineAmount(line), 0);
}

/** تحذيرات السند — مرآةُ سند القبض، وزيادةُ ما يخصّ الميدان. */
export function rcvWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const total = collectedTotal(doc?.lines);

  if (!String(h.customerCode || h.customer || '').trim()) {
    out.push('العميل غير مُدخل — لا يُحصَّل من مجهول');
  }
  if (!String(h.repName || '').trim()) {
    out.push('المندوب المحصِّل غير مُدخل — والمال يبقى في عهدته حتّى الإيداع');
  }

  const declared = Number(h.amountCollected) || 0;
  if (declared > 0 && Math.abs(declared - total) > 0.009) {
    out.push(
      `المحصَّل ${declared} لا يساوي مجموع التوزيع ${total} — الفرق ${Math.round((declared - total) * 100) / 100} مالٌ بلا وجهة`
    );
  }

  const method = String(h.paymentMethod || '').trim();
  if (method === 'شيك' && !String(h.referenceNo || '').trim()) {
    out.push('الشيك بلا رقم مرجعي — أثبِت المرجع');
  }

  if (total <= 0) out.push('قيمة التحصيل صفر — وزّع المبلغ على الفواتير');

  for (const [i, line] of (doc?.lines || []).entries()) {
    if (lineAmount(line) < 0) out.push(`البند ${i + 1}: مبلغٌ سالب — المرتجع إشعارٌ دائن لا تحصيل`);
  }

  return out;
}

const schema = {
  type: 'RCV',
  stage: 8,
  titleAr: 'سند تحصيل ميدانيّ',
  titleEn: 'Field Collection Voucher',
  formCode: 'BFP-RCV-001',
  orientation: 'portrait',

  /**
   * الإصدار للمندوب — منعُه يوقف التحصيل في وجه تاجرٍ يدفع، فيُسجَّل خارج
   * النظام. والاعتماد للمشرف والمالي: من قبض لا يعتمد قبضه.
   */
  roles: {
    create: ['sales_rep', 'sales_supervisor', 'warehouse_manager'],
    approve: ['sales_supervisor', 'finance_manager', 'warehouse_manager'],
    complete: ['sales_supervisor', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات التحصيل — Collection Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'collectionDate', label: 'تاريخ التحصيل (Date)', kind: 'date', required: true },
        { key: 'customer', label: 'العميل (Customer)', kind: 'text', required: true },
        { key: 'customerCode', label: 'رمز العميل (Code)', kind: 'text', ltr: true },
        { key: 'repName', label: 'المندوب المحصِّل (Rep)', kind: 'text', required: true },
        { key: 'tripRef', label: 'رقم الرحلة (Trip Ref.)', kind: 'text', ltr: true, hint: 'يُقفَل هذا المبلغ في تسوية الرحلة' },
        { key: 'visitRef', label: 'رقم الزيارة (Visit Ref.)', kind: 'text', ltr: true },
        {
          key: 'paymentMethod',
          label: 'طريقة التحصيل',
          kind: 'select',
          options: ['نقدًا', 'شيك'],
          required: true,
        },
        { key: 'referenceNo', label: 'رقم الشيك (Cheque No.)', kind: 'text', ltr: true },
        { key: 'amountCollected', label: 'المبلغ المحصَّل (د.ل)', kind: 'number', required: true },
      ],
    },

    {
      key: 'lines',
      title: '🧾 توزيع المبلغ على الفواتير — Allocation',
      kind: 'table',
      note: 'كلّ بندٍ فاتورةٌ ومبلغٌ يُقاصّ منها. والمبلغ يبقى في عهدة المندوب حتّى إيداعه في تسوية الرحلة.',
      minRows: 1,
      columns: [
        { key: 'invoiceRef', label: 'رقم الفاتورة', kind: 'text', width: '28%', ltr: true },
        { key: 'invoiceDate', label: 'تاريخ الفاتورة', kind: 'date', width: '20%' },
        { key: 'invoiceTotal', label: 'إجماليّ الفاتورة', kind: 'number', width: '20%' },
        { key: 'amount', label: 'المحصَّل منها', kind: 'number', width: '20%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '12%' },
      ],
    },

    {
      key: 'totals',
      title: '💰 الإجماليّ — Total',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'collectedTotal', label: 'مجموع التوزيع (د.ل)', kind: 'computed', compute: (d) => collectedTotal(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات المندوب', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب المحصِّل', source: 'creator' },
    { key: 'supervisor', label: 'اعتماد المشرف', source: 'approver' },
    { key: 'customerSign', label: 'توقيع العميل', source: null },
  ],

  warnings: rcvWarnings,
};

export default schema;
