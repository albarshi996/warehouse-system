/**
 * مخطّط المرتجع الميدانيّ (CRN) — بضاعةٌ عادت من العميل إلى المركبة.
 *
 * ما يقع عند إنجازه: `خارج المنشأة ← VAN:‹لوحة›`. لاحظ الوجهة: **المركبة لا
 * المستودع**. لأنّ المندوب ما يزال في الطريق حين يستلم المرتجع، فتدخل البضاعة
 * عهدته حتى يُرجعها مساءً بمستند `VRT`. ولو قيّدناها للمستودع مباشرةً لظهر في
 * المستودع رصيدٌ لم يصل إليه بعد، ولخرجت من تسوية المركبة فاختلّ ميزانها.
 *
 * ═══ لماذا يعتمده المشرف وحده؟ ═══
 * لأنّ المرتجع هو الباب الذي يُخفى منه العجز: كمّيةٌ ناقصةٌ تُسجَّل «مرتجعًا»
 * فيستقيم الميزان ظاهريًّا وقد ضاعت البضاعة. ولذلك يخرج اعتماده من يد المندوب،
 * ويُلزَم بسببٍ وحالةٍ وصورةٍ وتوقيع عميل. الفاتورة يعتمدها المندوب لأنّ منعها
 * يوقف البيع؛ والمرتجع لا يوقف منعُه شيئًا.
 *
 * التصرّف في كل بند (`disposition`) يُسجَّل هنا **نيّةً**، ويُنفَّذ في `VRT`
 * حين تصل البضاعة المستودع فعلًا. فالمندوب يقترح ولا يقرّر مصير التالف.
 */

/**
 * تحذيرات المرتجع: بلا سببٍ أو حالة (فلا يُصنَّف مصيره) · منتهي الصلاحية
 * مقترَحٌ لإعادته للمخزون (تناقضٌ صريح) · بلا دليلٍ مصوَّر (وهو أضعف ما يُقبل).
 */
export function crnWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد أين دخلت البضاعة — لا مرتجع بلا لوحة');
  if (!String(h.customerCode || '').trim()) out.push('رمز العميل يربط المرتجع بمن أرجعه');

  const noReason = lines.filter((l) => !String(l?.reason || '').trim());
  if (noReason.length) out.push(`${noReason.length} بندًا بلا سبب إرجاع — لا يُصنَّف مصيره`);

  const contradictory = lines.filter(
    (l) => String(l?.condition || '').trim() === 'منتهي' && String(l?.disposition || '').trim() === 'إعادة للمخزون'
  );
  if (contradictory.length) {
    out.push(`${contradictory.length} بندًا منتهي الصلاحية مقترحٌ لإعادته للمخزون — راجع التصرّف`);
  }

  const damaged = lines.filter((l) => ['تالف', 'كسر'].includes(String(l?.condition || '').trim()));
  if (damaged.length && !String(h.evidenceNote || '').trim()) {
    out.push('بنودٌ تالفة أو مكسورة بلا وصفٍ للحالة — أرفق صورةً ووصفًا قبل الاعتماد');
  }

  return out;
}

const schema = {
  type: 'CRN',
  stage: 8,
  titleAr: 'مرتجع ميدانيّ من العميل',
  titleEn: 'Customer Return Note (Field)',
  formCode: 'BFP-CRN-001',
  orientation: 'portrait',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['sales_supervisor', 'warehouse_manager', 'return_manager'],
    complete: ['sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات المرتجع — Return Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'returnDate', label: 'تاريخ الإرجاع (Return Date)', kind: 'date', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', required: true },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'invoiceRef', label: 'الفاتورة المرجعية (Invoice Ref.)', kind: 'text', hint: 'فاتورة البيع التي خرجت بها البضاعة — تُطابَق كميّتها' },
        { key: 'visitRef', label: 'رقم الزيارة (Visit Ref.)', kind: 'text' },
        { key: 'tripRef', label: 'رقم الرحلة (Trip Ref.)', kind: 'text' },
      ],
    },

    {
      key: 'custody',
      title: '🛵 المركبة المستلِمة — Receiving Vehicle',
      kind: 'fields',
      columns: 3,
      note: 'المرتجع يدخل عهدة المندوب حتى يُرجعه للمستودع بمستند الإرجاع (VRT).',
      fields: [
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'repName', label: 'اسم المندوب (Sales Rep)', kind: 'text' },
        { key: 'evidenceNote', label: 'وصف الحالة (Condition Note)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود المرتجع — Return Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '17%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '7%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '9%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '10%' },
        {
          key: 'reason',
          label: 'سبب الإرجاع',
          kind: 'select',
          options: ['منتهي الصلاحية', 'تالف', 'كسر', 'خطأ تحميل', 'استرجاع تجاري', 'استبدال', 'سحب تشغيلي'],
          width: '13%',
        },
        { key: 'condition', label: 'الحالة', kind: 'select', options: ['سليم', 'تالف', 'منتهي', 'ناقص', 'كسر'], width: '8%' },
        {
          key: 'disposition',
          label: 'التصرّف المقترح',
          kind: 'select',
          options: ['إعادة للمخزون', 'إتلاف', 'تحت الفحص', 'استبدال'],
          width: '11%',
        },
        { key: 'unitPrice', label: 'سعر الوحدة', kind: 'number', width: '5%' },
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
        {
          key: 'totalValue',
          label: 'قيمة المرتجع',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0) * (Number(l?.unitPrice) || 0), 0),
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب (Sales Rep)', source: 'creator' },
    { key: 'customer', label: 'العميل المُرجِع (Customer)', source: null },
    { key: 'supervisor', label: 'مشرف المبيعات (Supervisor)', source: null },
  ],

  /** أدلّة المرتجع: صورة البضاعة بحالتها، وتوقيع العميل — أضعف ما يُقبل. */
  attachments: [
    { key: 'returnPhoto', kind: 'photo', label: 'صورة البضاعة المرتجعة' },
    { key: 'customerSignature', kind: 'signature', label: 'توقيع العميل بالإرجاع' },
  ],

  warnings: crnWarnings,
};

export default schema;
