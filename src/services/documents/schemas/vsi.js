/**
 * مخطّط فاتورة البيع من المركبة (VSI) — لحظة البيع في الميدان.
 *
 * ما يقع عند إنجازها: `VAN:‹لوحة› ← خارج المنشأة`. البيع والخصم والفوترة في
 * لحظةٍ واحدة، لا في ثلاث مراحل — لأنّ الميدان لا ينتظر.
 *
 * ═══ لماذا يعتمدها المندوب نفسه؟ ═══
 * سؤالٌ وجيه: أليس هذا خرقًا لمبدأ فصل الصلاحيات؟ لا — لأنّ البديل وهمٌ.
 * انتظار اعتماد مشرفٍ قبل تسليم كرتونةٍ لتاجرٍ واقفٍ أمام المندوب يعني أحد
 * أمرين: تعطيل البيع، أو بيعٌ خارج النظام يُسجَّل لاحقًا بالذاكرة. وكلاهما أسوأ.
 *
 * فالرقابة هنا **لاحقة ومركّبة**، لا سابقة:
 *   1. حارس الرصيد السالب — لا يبيع المندوب ما ليس على مركبته أصلًا.
 *   2. تسوية نهاية الرحلة — المخزون والنقد يتقابلان مساءً، والفرق يظهر رقمًا.
 *   3. اعتماد المشرف على الفرق — العجز يُنسب لصاحبه بسببٍ مكتوب.
 * وهذا هو نموذج محاسبة خطّ السير المعتمد عالميًّا: لا تمنع البيع، بل اجعل
 * إخفاءه مستحيلًا.
 */

function lineTotal(line) {
  const qty = Number(line?.qty) || 0;
  const price = Number(line?.unitPrice) || 0;
  const discount = Number(line?.discount) || 0;
  return Math.max(0, qty * price - discount);
}

function grandTotal(lines) {
  return (lines || []).reduce((total, line) => total + lineTotal(line), 0);
}

/**
 * تحذيرات الفاتورة: بلا عميلٍ أو لوحة (لا تُنسب الحركة) · تحصيلٌ نقديّ يخالف
 * الإجمالي (فرقٌ يظهر في تسوية النقد مساءً) · بيعٌ آجلٌ بلا موعد سداد.
 */
export function vsiWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد من أين خرجت البضاعة — لا بيع بلا لوحة');
  if (!String(h.customerCode || '').trim()) out.push('رمز العميل يربط البيع بحسابه وبموقعه — لا يُترك فارغًا');

  // السياج الجغرافيّ: الفاتورة تُربط بزيارةٍ موثّقة الموقع. الحالة تُكتب على
  // الرأس وقت الإنشاء من `invoiceGuard` في طبقة الميدان — وهذه مرآتها للمراجع.
  if (!String(h.visitRef || '').trim()) {
    out.push('فاتورة بلا زيارة مرجعيّة — لا يُعرف أين وقع البيع ولا متى');
  }
  const fence = String(h.fenceStatus || '').trim();
  if (fence === 'outside') {
    out.push(`صدرت خارج نطاق المتجر (${h.fenceDistanceM || '؟'}م) — تحتاج مراجعة المشرف`);
  } else if (fence === 'unverified') {
    out.push('صدرت وموقعها غير مُتحقَّق — وثّق السبب (ضعف إرسال / موقع المتجر غير مسجّل)');
  }

  const total = grandTotal(lines);
  const collected = Number(h.amountCollected) || 0;
  const mode = String(h.paymentMode || '').trim();

  if (mode === 'نقدًا' && Math.abs(collected - total) > 0.009) {
    out.push(`المحصّل (${collected}) يخالف الإجمالي (${total.toFixed(2)}) — الفرق يظهر في تسوية النقد`);
  }
  if (mode === 'آجل' && !String(h.dueDate || '').trim()) {
    out.push('بيعٌ آجل بلا موعد سداد — لا تُتابَع ذمّةٌ بلا تاريخ');
  }

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim());
  if (noBatch.length) out.push(`${noBatch.length} بندًا بلا تشغيلة — يتعذّر تتبّع صلاحيته عند العميل`);

  // ═══ حارس تسريب الترويجات ═══
  // بندٌ بصفرٍ سعرًا بلا رمز عرض هو المجّانيّ الذي مُنح بلا سند — وهو أشيع
  // أبواب التسريب. لا نمنعه (قد يكون عيّنةً معتمدة)، لكن لا يمرّ بلا أثر.
  const freeNoPromo = lines.filter((l) => Number(l?.unitPrice) === 0 && !String(l?.promoCode || '').trim());
  if (freeNoPromo.length) {
    out.push(`${freeNoPromo.length} بندًا مجّانيًّا بلا رمز عرض — وثّق سنده أو أزِله`);
  }
  const discountNoPromo = lines.filter(
    (l) => Number(l?.discount) > 0 && !String(l?.promoCode || '').trim()
  );
  if (discountNoPromo.length) {
    out.push(`${discountNoPromo.length} بندًا بخصمٍ يدويّ بلا رمز عرض — الخصم بلا سند يُراجَع`);
  }

  return out;
}

const schema = {
  type: 'VSI',
  stage: 7,
  titleAr: 'فاتورة بيع من المركبة',
  titleEn: 'Van Sales Invoice',
  formCode: 'BFP-VSI-001',
  orientation: 'portrait',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['sales_rep', 'sales_supervisor'],
    complete: ['sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الفاتورة — Invoice Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'saleDate', label: 'تاريخ البيع (Sale Date)', kind: 'date', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', required: true },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'visitRef', label: 'رقم الزيارة (Visit Ref.)', kind: 'text', hint: 'يربط البيع بزيارةٍ موثّقة بموقعها ووقتها' },
        {
          key: 'fenceStatus',
          label: 'التحقّق من الموقع (Geo-fence)',
          kind: 'select',
          options: ['inside', 'outside', 'unverified'],
          hint: 'داخل النطاق · خارجه · غير مُتحقَّق. يُملأ آليًّا من الزيارة ولا يُحرَّر يدويًّا إلا بمبرّر.',
        },
        { key: 'fenceDistanceM', label: 'البعد عن المتجر (م)', kind: 'number' },
        { key: 'tripRef', label: 'رقم الرحلة (Trip Ref.)', kind: 'text' },
        {
          key: 'rep',
          label: 'المندوب (Sales Rep)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أصدر الفاتورة',
        },
      ],
    },

    {
      key: 'custody',
      title: '🛵 المركبة — Vehicle',
      kind: 'fields',
      columns: 2,
      note: 'البضاعة تخرج من موقع هذه المركبة — لا من المستودع.',
      fields: [
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'outletType', label: 'نوع المنفذ (Outlet Type)', kind: 'select', options: ['بقالة', 'سوبرماركت', 'صيدلية', 'مطعم', 'جملة', 'أخرى'] },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الفاتورة — Invoice Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '20%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '8%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '8%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '9%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '10%' },
        { key: 'unitPrice', label: 'سعر الوحدة', kind: 'number', width: '9%' },
        { key: 'discount', label: 'الخصم', kind: 'number', width: '6%' },
        {
          key: 'promoCode',
          label: 'العرض',
          kind: 'text',
          width: '7%',
          hint: 'رمز العرض الذي منح المجّانيّ أو الخصم — به يُنسب أثره ولا يضيع.',
        },
        { key: 'lineTotal', label: 'الإجمالي', kind: 'computed', compute: lineTotal, width: '6%' },
      ],
    },

    {
      key: 'payment',
      title: '💵 التحصيل — Collection',
      kind: 'fields',
      columns: 3,
      note: 'ما يُحصَّل هنا يدخل تسوية النقد مساءً — والفرق يُنسب لا يُهمَل.',
      fields: [
        { key: 'paymentMode', label: 'طريقة الدفع (Payment Mode)', kind: 'select', options: ['نقدًا', 'شيك', 'تحويل', 'آجل'], required: true },
        { key: 'amountCollected', label: 'المبلغ المحصّل (Amount Collected)', kind: 'number' },
        { key: 'chequeNo', label: 'رقم الشيك (Cheque No.)', kind: 'text' },
        { key: 'dueDate', label: 'موعد السداد (Due Date)', kind: 'date' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0) },
        { key: 'grandTotal', label: 'الإجمالي المستحقّ', kind: 'computed', compute: (d) => grandTotal(d.lines) },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب (Sales Rep)', source: 'creator' },
    { key: 'customer', label: 'العميل / المستلم (Customer)', source: null },
  ],

  /** أدلّة البيع الميدانيّ: توقيع العميل، وصورة التسليم عند الطلب. */
  attachments: [
    { key: 'customerSignature', kind: 'signature', label: 'توقيع العميل بالاستلام' },
    { key: 'deliveryPhoto', kind: 'photo', label: 'صورة التسليم' },
  ],

  warnings: vsiWarnings,
};

export default schema;
