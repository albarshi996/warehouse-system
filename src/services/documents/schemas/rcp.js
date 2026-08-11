/**
 * مخطّط سند القبض (RCP) — أوّل مستندٍ في وحدة الذمم (م٤-أ · يسدّ ف‑١ جزئيًّا).
 *
 * ═══ الفجوة التي يسدّها ═══
 * لا سند قبضٍ في النظام إطلاقًا: `accountBalance` لقطةٌ مستوردة من إكسل،
 * و`PV` للمشتريات الداخلية وحدها. فالمال يُحصَّل من العميل ولا أثر له — ولا
 * أحد يعرف كم له ولا كم عليه إلّا بورقةٍ في درج.
 *
 * ═══ لماذا بنودُه مقاصّةٌ لا بضاعة ═══
 * سند القبض لا يحمل أصنافًا بل **فواتير**: كلّ بندٍ فاتورةٌ ومبلغٌ يُقاصّ منها.
 * فدفعةٌ واحدة قد تُسدّد ثلاث فواتير جزئيًّا، ومن جمع المبلغ في رقمٍ واحد بلا
 * توزيع لم يستطع أن يقول أيّ فاتورةٍ أُقفلت وأيّها بقيت.
 *
 * ═══ لا أثر مخزنيّ ═══
 * ليس في `POSTING_RULES` عمدًا: المال لا يُحرّك رفًّا. أثره على دفتر الذمم
 * (م٤-ج) وحده.
 *
 * ═══ فصل من يقبض عمّن يعتمد ═══
 * يُصدره أمين الخزينة أو المندوب، ويعتمده المدير المالي. ومن قبض المال لا
 * يعتمد قبضه — وإلّا فالسند إقرارٌ ذاتيّ لا مستند.
 */

/** مبلغ بندٍ واحد — ما يُقاصّ من فاتورةٍ بعينها. */
export function lineAmount(line) {
  return Number(line?.amount) || 0;
}

/** إجماليّ المقبوض — مجموع ما وُزّع على الفواتير. */
export function receiptTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineAmount(line), 0);
}

/**
 * تحذيرات السند.
 * أخطرها **فرق التوزيع**: مبلغٌ مقبوضٌ لا يساوي مجموع ما وُزّع على الفواتير
 * يعني مالًا بلا وجهة — يظهر في الخزينة ولا يُقفل ذمّة.
 */
export function rcpWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const total = receiptTotal(doc?.lines);

  if (!String(h.payer || h.customerCode || '').trim()) {
    out.push('الدافع (العميل) غير مُدخل — لا يُقبض من مجهول');
  }

  const declared = Number(h.amountReceived) || 0;
  if (declared > 0 && Math.abs(declared - total) > 0.009) {
    out.push(
      `المبلغ المقبوض ${declared} لا يساوي مجموع التوزيع ${total} — الفرق ${Math.round((declared - total) * 100) / 100} مالٌ بلا وجهة`
    );
  }

  const method = String(h.paymentMethod || '').trim();
  if ((method === 'شيك' || method === 'تحويل مصرفي') && !String(h.referenceNo || '').trim()) {
    out.push(`طريقة القبض «${method}» بلا رقم مرجعي — أثبِت المرجع`);
  }

  if (total <= 0) out.push('قيمة القبض صفر — وزّع المبلغ على الفواتير');

  for (const [i, line] of (doc?.lines || []).entries()) {
    if (lineAmount(line) < 0) out.push(`البند ${i + 1}: مبلغٌ سالب — المرتجع إشعارٌ دائن لا سند قبض`);
  }

  return out;
}

const schema = {
  type: 'RCP',
  stage: 7,
  titleAr: 'سند قبض',
  titleEn: 'Receipt Voucher',
  formCode: 'BFP-RCP-001',
  orientation: 'portrait',

  /** القبض للخزينة والمندوب، والاعتماد للمالي — من قبض لا يعتمد قبضه. */
  roles: {
    create: ['treasury', 'sales_rep', 'sales_supervisor', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات السند — Receipt Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'receiptDate', label: 'تاريخ القبض (Date)', kind: 'date', required: true },
        { key: 'payer', label: 'الدافع / العميل (Payer)', kind: 'text', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', ltr: true },
        {
          key: 'paymentMethod',
          label: 'طريقة القبض (Payment Method)',
          kind: 'select',
          options: ['نقدًا', 'شيك', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'referenceNo', label: 'رقم الشيك / التحويل (Reference No.)', kind: 'text', ltr: true },
        { key: 'bankName', label: 'المصرف (Bank)', kind: 'text' },
        { key: 'amountReceived', label: 'المبلغ المقبوض (د.ل)', kind: 'number', required: true },
        { key: 'collectedBy', label: 'المحصِّل (Collected By)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '🧾 توزيع المبلغ على الفواتير — Allocation',
      kind: 'table',
      note: 'كلّ بندٍ فاتورةٌ ومبلغٌ يُقاصّ منها. دفعةٌ واحدة قد تُسدّد ثلاث فواتير جزئيًّا.',
      minRows: 1,
      columns: [
        { key: 'invoiceRef', label: 'رقم الفاتورة (Invoice Ref.)', kind: 'text', width: '26%', ltr: true },
        { key: 'invoiceDate', label: 'تاريخ الفاتورة', kind: 'date', width: '18%' },
        { key: 'invoiceTotal', label: 'إجماليّ الفاتورة (د.ل)', kind: 'number', width: '18%' },
        { key: 'amount', label: 'المقاصّ من الفاتورة (د.ل)', kind: 'number', width: '20%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '18%' },
      ],
    },

    {
      key: 'totals',
      title: '💰 إجماليّ المقبوض — Total',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'receiptTotal',
          label: 'مجموع التوزيع (د.ل)',
          kind: 'computed',
          compute: (d) => receiptTotal(d.lines),
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'collector', label: 'المحصِّل (القابض)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'payerSign', label: 'توقيع الدافع (Payer)', source: null },
  ],

  warnings: rcpWarnings,
};

export default schema;
