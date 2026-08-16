/**
 * مخطّط أمر البيع (SO) — رأس سلسلة الصرف، وأوّل مستندٍ في دورة المبيعات.
 *
 * لماذا وُجد؟ لأن سلسلة الصرف كانت تبدأ من **قائمة السحب** بلا أمرٍ يسبقها —
 * فلا سجلّ لِما وعدنا به العميل قبل أن نجهّزه، ولا حجزٌ يمنع أن يَعِد بائعان
 * بنفس الكمية. أمر البيع يسدّ ذلك: يلتقط طلب العميل، **وعند اعتماده يحجز
 * الرصيد فعلًا** (المتاح = الموجود − المحجوز) فلا يُباع الصنف مرّتين.
 *
 * ما يُحسب لا يُكتب:
 *  · «رقم أمر البيع» ⇒ `SO-2026-####`.
 *  · «إجمالي البند» (كمية × سعر) وقيمة الأمر ⇒ عمودان محسوبان.
 *
 * وهذا المستند **يورّث سعره** عبر السلسلة كلها حتى الفاتورة — فما اتُّفق عليه
 * عند الطلب هو ما يُفوتَر عند التسليم، لا يُعاد إدخاله بالقلم.
 *
 * ⚠️ حقل «المستودع المصدر» **إلزاميّ**: عليه يقع الحجز، ومنه يخرج الرصيد.
 */

/** إجمالي البند = الكمية × سعر الوحدة. */
export function lineTotal(line) {
  return (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
}

/** قيمة الأمر الإجمالية قبل الخصم. */
export function orderValue(lines) {
  return (lines || []).reduce((total, line) => total + lineTotal(line), 0);
}

/**
 * تحذيرات أمر البيع (لا تمنع، تنبّه قبل الإرسال):
 *  · بندٌ بكمية بلا سعر — نَعِد بصنفٍ بلا ثمنٍ متّفق.
 *  · لا مستودع مصدر — لا يقع الحجز على فراغ.
 */
export function salesOrderWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);
  if (lines.some((l) => !(Number(l?.unitPrice) > 0))) {
    out.push('بندٌ بكمية بلا سعر وحدة — أمرٌ بلا ثمنٍ متّفق عليه');
  }
  if (!String(doc?.header?.warehouse || '').trim()) {
    out.push('لا مستودع مصدر محدَّد — لن يقع الحجز عند الاعتماد');
  }
  if (!lines.length) {
    out.push('لا بند بكمية — أمرٌ فارغ لا يُجهّز');
  }
  return out;
}

const schema = {
  type: 'SO',
  stage: 6,
  titleAr: 'أمر البيع',
  titleEn: 'Sales Order',
  formCode: 'BFP-SO-001',
  orientation: 'portrait',

  /** الإنشاء لأمين المخزن (مكتب الطلبات)، والاعتماد للمدير — الاعتماد يحجز. */
  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات أمر البيع — Sales Order Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'orderDate', label: 'تاريخ الطلب (Order Date)', kind: 'date', required: true },
        { key: 'costCenter', label: 'مركز التكلفة (Cost Center)', kind: 'text', ltr: true, hint: 'رمزٌ من سيّد المواقع التنظيميّة — به تُحمَّل التكلفة على الفرع والبراند والقطاع' },
        { key: 'requiredDate', label: 'تاريخ التسليم المطلوب (Required Date)', kind: 'date' },
        // ‹EXE-301› مهلة الشحن التشغيليّة — تُقرأ في ترتيب المهامّ ومحرّك الأولويّة.
        { key: 'mustShipBy', label: 'مهلة الشحن (Must Ship By)', kind: 'date', hint: 'قيدُ الناقل: متى يُقفل استلامُ الشحنة — يقود ترتيب العمل الميدانيّ. وهو غير «تاريخ التسليم المطلوب» الذي هو وعدٌ للعميل.' },
        {
          key: 'warehouse',
          label: 'المستودع المصدر (Source Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المستودع الذي يُحجز منه الرصيد ويخرج — إلزاميّ.',
        },
        { key: 'priority', label: 'الأولوية (Priority)', kind: 'select', options: ['عاجل', 'عادي', 'منخفض'] },
        { key: 'paymentTerms', label: 'شروط الدفع (Payment Terms)', kind: 'text' },
        { key: 'channel', label: 'قناة الطلب (Channel)', kind: 'select', options: ['فرع', 'جملة', 'تجزئة', 'مشروع'] },
        {
          key: 'holdReason',
          label: 'سبب الإيقاف (Hold Reason)',
          kind: 'select',
          options: ['—', 'مشكلة لوجستية', 'إيقاف من العميل', 'مشكلة بالنظام'],
          hint: 'يُترك «—» عادةً؛ يُحدَّد إن أُوقف الطلب رغم توفّر الرصيد — فيظهر في تقرير الطلبات المعلّقة.',
        },
      ],
    },

    {
      key: 'customer',
      title: '👤 بيانات العميل — Customer',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text' },
        { key: 'salesRep', label: 'مندوب البيع (Sales Rep.)', kind: 'text' },
        { key: 'contactNo', label: 'رقم التواصل (Contact No.)', kind: 'text', ltr: true },
      ],
      extraFields: [{ key: 'deliveryAddress', label: 'عنوان التسليم (Delivery Address)', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: '📦 بنود الطلب — Order Lines',
      kind: 'table',
      note: 'عند اعتماد الأمر تُحجز هذه الكميات من المستودع المصدر بترتيب FEFO — فلا تُباع مرّتين.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'وصف الصنف (Description)', kind: 'text', width: '27%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'qty', label: 'الكمية المطلوبة', kind: 'number', width: '10%' },
        { key: 'unitPrice', label: 'سعر البيع (د.ل)', kind: 'number', width: '11%' },
        { key: 'lineTotal', label: 'الإجمالي (د.ل)', kind: 'computed', compute: lineTotal, width: '11%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '8%' },
      ],
    },

    {
      key: 'summary',
      title: '💰 ملخّص الأمر — Order Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'totalLines',
          label: 'عدد الأصناف (Total Lines)',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length,
        },
        {
          key: 'totalQty',
          label: 'إجمالي الكميات',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0),
        },
        {
          key: 'orderValue',
          label: 'قيمة الأمر (د.ل)',
          kind: 'computed',
          compute: (d) => orderValue(d.lines),
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات إضافية', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'preparedBy', label: 'معدّ الأمر (Prepared By)', source: 'creator' },
    { key: 'salesManager', label: 'مدير المبيعات (Sales Manager)', source: 'approver' },
    { key: 'customer', label: 'العميل (Customer)', source: null },
  ],

  warnings: salesOrderWarnings,
};

export default schema;
