/**
 * مخطّط إيداع البضاعة المحميّة (VCD) — أمانةٌ لدى العميل بحقّ استرداد.
 *
 * ما يقع عند إنجازه: `VAN:‹لوحة› ← CUST:‹رمز›`. لاحظ أنّ الرصيد **لم يخرج من
 * دفترنا**: انتقل من موقعٍ نملكه إلى موقعٍ نملكه، وإن كان الثاني رفَّ التاجر.
 * فالبضاعة عنده ومِلكُها لنا حتى يبيعها (`VCS`) أو نستردّها (`VCR`).
 *
 * ═══ لماذا يعتمده المشرف؟ ═══
 * لأنّه **التزامٌ لا بيع**. المندوب هنا يمنح بضاعةً بلا مقابلٍ فوريّ، ويعِد
 * بحقّ إرجاعٍ يُكلّف الشركة لاحقًا. وهذا قرارٌ ائتمانيّ لا تشغيليّ — يشبه منح
 * أجلٍ لا تسليم طلب. فيخرج اعتماده من يد من يمنحه.
 *
 * والسياسة تحكم ما يجوز إيداعه: صنفٌ سياسته «لا إرجاع» لا يُودَع أمانةً أصلًا.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات الإيداع: بلا رمز عميلٍ أو لوحة (لا يُحلّ موقعٌ للقيد) · بلا تشغيلة
 * أو صلاحية (وهي جوهر المحميّة — بلا صلاحيةٍ لا تنبيه ولا استرداد قبل الخسارة).
 */
export function vcdWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  if (!String(h.customerCode || '').trim()) out.push('رمز العميل يُحدّد موقع الأمانة — لا إيداع بلا رمز');
  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد من أين خرجت البضاعة');
  if (!String(h.protectionPolicy || '').trim()) out.push('سياسة الحماية مطلوبة — بها يُحكم على المرتجع لاحقًا');

  const noExpiry = lines.filter((l) => !String(l?.expiry || '').trim());
  if (noExpiry.length) {
    out.push(`${noExpiry.length} بندًا بلا تاريخ صلاحية — لا تنبيه قبل الخسارة ولا استرداد في وقته`);
  }
  const noBatch = lines.filter((l) => !String(l?.batch || '').trim());
  if (noBatch.length) out.push(`${noBatch.length} بندًا بلا تشغيلة — يتعذّر تمييز ما عند العميل`);

  return out;
}

const schema = {
  type: 'VCD',
  stage: 7,
  titleAr: 'إيداع بضاعة محميّة',
  titleEn: 'Consignment Deposit',
  formCode: 'BFP-VCD-001',
  orientation: 'portrait',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['sales_supervisor', 'warehouse_manager'],
    complete: ['sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الإيداع — Deposit Header',
      kind: 'fields',
      columns: 3,
      note: 'الرصيد ينتقل إلى موقع العميل ويبقى ملكًا للشركة حتى البيع أو الاسترداد.',
      fields: [
        { key: 'depositDate', label: 'تاريخ الإيداع (Deposit Date)', kind: 'date', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', required: true },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'visitRef', label: 'رقم الزيارة (Visit Ref.)', kind: 'text' },
        {
          key: 'rep',
          label: 'المندوب (Sales Rep)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الإيداع',
        },
      ],
    },

    {
      key: 'protection',
      title: '🛡️ شروط الحماية — Protection Terms',
      kind: 'fields',
      columns: 3,
      note: 'هذه الشروط تحكم قبول المرتجع لاحقًا — لا تُترك للاجتهاد عند باب المتجر.',
      fields: [
        {
          key: 'protectionPolicy',
          label: 'سياسة الحماية (Policy)',
          kind: 'select',
          options: ['يحقّ إرجاعه بالكامل', 'يحقّ إرجاع المنتهي فقط', 'استبدال لا إرجاع', 'حماية لمدّة محدّدة', 'حماية حتى انتهاء الصلاحية'],
          required: true,
        },
        { key: 'windowDays', label: 'مدّة الحماية (أيّام)', kind: 'number', hint: 'تلزم عند اختيار «حماية لمدّة محدّدة» — ٩٠ يومًا مثلًا.' },
        { key: 'settlementCycle', label: 'دورة المطابقة', kind: 'select', options: ['أسبوعيّة', 'نصف شهريّة', 'شهريّة'] },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الأمانة — Consigned Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '24%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '9%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '9%' },
        { key: 'batch', label: 'رقم الدفعة (Batch)', kind: 'text', width: '11%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '11%' },
        { key: 'unitCost', label: 'تكلفة الوحدة', kind: 'number', width: '12%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        {
          key: 'totalValue',
          label: 'قيمة الأمانة',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0) * (Number(l?.unitCost) || 0), 0),
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب (Sales Rep)', source: 'creator' },
    { key: 'customer', label: 'العميل المُودَع لديه (Customer)', source: null },
    { key: 'supervisor', label: 'مشرف المبيعات (Supervisor)', source: 'approver' },
  ],

  attachments: [
    { key: 'customerSignature', kind: 'signature', label: 'توقيع العميل باستلام الأمانة' },
    { key: 'signedCopy', kind: 'signedCopy', label: 'نسخة محضر الإيداع موقّعة' },
  ],

  warnings: vcdWarnings,
};

export default schema;
