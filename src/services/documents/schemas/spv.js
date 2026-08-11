/**
 * مخطّط سند سداد المورّد (SPV) — النظير الصادر لسند القبض (م٤-ب · يسدّ ف‑١).
 *
 * ═══ لماذا لا يكفي PV ═══
 * `PV` سند صرف الخزينة في دورة **المشتريات الداخلية** (طلبات الإدارات): مرجعه
 * أمر شراءٍ داخليّ إلزاميّ، وبنودُه مبالغُ مصروفة. أمّا هذا فسدادُ **مورّدٍ
 * خارجيّ** يُقاصّ أوامر شرائه وفواتيره — وهو الطرف الآخر من دفتر الذمم.
 * ولو خلطناهما لصار «ما علينا للموردين» مختلطًا بمصروفات الإدارات.
 *
 * ═══ المرآة ═══
 * ما يصحّ في القبض يصحّ هنا معكوسًا: بنودُه مقاصّة، وفرقُ التوزيع مالٌ بلا
 * وجهة، ومن صرف المال لا يعتمد صرفه.
 */

/** مبلغ بندٍ واحد — ما يُقاصّ من أمرٍ أو فاتورة. */
export function lineAmount(line) {
  return Number(line?.amount) || 0;
}

/** إجماليّ المسدَّد — مجموع ما وُزّع. */
export function paymentTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineAmount(line), 0);
}

/** تحذيرات السند — مرآة `rcpWarnings`. */
export function spvWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const total = paymentTotal(doc?.lines);

  if (!String(h.supplier || h.supplierCode || '').trim()) {
    out.push('المورّد المستفيد غير مُدخل — لا يُسدَّد لمجهول');
  }

  const declared = Number(h.amountPaid) || 0;
  if (declared > 0 && Math.abs(declared - total) > 0.009) {
    out.push(
      `المبلغ المسدَّد ${declared} لا يساوي مجموع التوزيع ${total} — الفرق ${Math.round((declared - total) * 100) / 100} مالٌ بلا وجهة`
    );
  }

  const method = String(h.paymentMethod || '').trim();
  if ((method === 'شيك' || method === 'تحويل مصرفي') && !String(h.referenceNo || '').trim()) {
    out.push(`طريقة السداد «${method}» بلا رقم مرجعي — أثبِت المرجع`);
  }

  if (total <= 0) out.push('قيمة السداد صفر — وزّع المبلغ على الأوامر والفواتير');

  for (const [i, line] of (doc?.lines || []).entries()) {
    if (lineAmount(line) < 0) out.push(`البند ${i + 1}: مبلغٌ سالب — المرتجع إشعارٌ مدين لا سند سداد`);
  }

  return out;
}

const schema = {
  type: 'SPV',
  stage: 7,
  titleAr: 'سند سداد مورّد',
  titleEn: 'Supplier Payment Voucher',
  formCode: 'BFP-SPV-001',
  orientation: 'portrait',

  /** السداد للخزينة والمشتريات، والاعتماد للمالي — من صرف لا يعتمد صرفه. */
  roles: {
    create: ['treasury', 'purchase_officer', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['treasury', 'finance_manager', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات السند — Payment Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'paymentDate', label: 'تاريخ السداد (Date)', kind: 'date', required: true },
        { key: 'supplier', label: 'المورّد المستفيد (Supplier)', kind: 'text', required: true },
        { key: 'supplierCode', label: 'رمز المورّد (Supplier Code)', kind: 'text', ltr: true },
        {
          key: 'paymentMethod',
          label: 'طريقة السداد (Payment Method)',
          kind: 'select',
          options: ['نقدًا', 'شيك', 'تحويل مصرفي'],
          required: true,
        },
        { key: 'referenceNo', label: 'رقم الشيك / التحويل (Reference No.)', kind: 'text', ltr: true },
        { key: 'bankName', label: 'المصرف (Bank)', kind: 'text' },
        { key: 'amountPaid', label: 'المبلغ المسدَّد (د.ل)', kind: 'number', required: true },
        { key: 'paidBy', label: 'الصارف (Paid By)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '🧾 توزيع المبلغ على الأوامر والفواتير — Allocation',
      kind: 'table',
      note: 'كلّ بندٍ أمرُ شراءٍ أو فاتورةُ مورّدٍ ومبلغٌ يُقاصّ منها.',
      minRows: 1,
      columns: [
        { key: 'docRef', label: 'رقم الأمر / الفاتورة', kind: 'text', width: '26%', ltr: true },
        { key: 'docDate', label: 'تاريخ الأمر / الفاتورة', kind: 'date', width: '18%' },
        { key: 'docTotal', label: 'الإجماليّ (د.ل)', kind: 'number', width: '18%' },
        { key: 'amount', label: 'المقاصّ (د.ل)', kind: 'number', width: '20%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '18%' },
      ],
    },

    {
      key: 'totals',
      title: '💰 إجماليّ المسدَّد — Total',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'paymentTotal',
          label: 'مجموع التوزيع (د.ل)',
          kind: 'computed',
          compute: (d) => paymentTotal(d.lines),
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'payer', label: 'الصارف (الخزينة)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'supplierSign', label: 'توقيع المورّد (Received By)', source: null },
  ],

  warnings: spvWarnings,
};

export default schema;
