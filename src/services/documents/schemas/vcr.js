/**
 * مخطّط استرداد البضاعة المحميّة (VCR) — الوفاء بالوعد الذي قطعه الإيداع.
 *
 * ما يقع عند إنجازه: `CUST:‹رمز› ← VAN:‹لوحة›`. البضاعة تعود إلى عهدة المندوب
 * لا إلى المستودع مباشرةً — فهو ما يزال في الطريق، ويُرجعها مساءً بـ`VRT`.
 *
 * ═══ حقلان لا حقل ═══
 * لكلّ بندٍ **حالٌ** و**مصير**:
 *   الحال يقرّره الناظر (سليم · منتهي · تالف · كسر).
 *   والمصير يُشتقّ منه لا من السياسة (رفّ · إتلاف · فحص · استبدال).
 * وحقّ الإرجاع يحكم **قبول الاسترداد** لا **إعادة البيع**. فصنفٌ سياسته «إرجاع
 * كامل» وعاد تالفًا يُقبل استرداده ويُتلَف — ومن يخلط بينهما يُعيد التالف إلى
 * رفّ البيع لأنّ «للعميل حقّ الإرجاع».
 *
 * ويعتمده المشرف لا المندوب: المرتجع هو الباب الذي يُخفى منه العجز.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات الاسترداد: بلا رمز عميلٍ أو لوحة · بلا حالٍ أو مصير · وأخطرها
 * **تناقض المصير مع الحال**: تالفٌ يُقترح لرفّ البيع.
 */
export function vcrWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0);

  if (!String(h.customerCode || '').trim()) out.push('رمز العميل يُحدّد من أيّ رصيدٍ يُستردّ — لا استرداد بلا رمز');
  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد إلى أين يعود الرصيد');

  const noCondition = lines.filter((l) => !String(l?.condition || '').trim());
  if (noCondition.length) out.push(`${noCondition.length} بندًا بلا حالٍ مسجّل — لا يُقرَّر مصيره`);

  const contradictory = lines.filter(
    (l) => ['تالف', 'كسر', 'منتهي'].includes(String(l?.condition || '').trim())
      && String(l?.disposition || '').trim() === 'إعادة للمخزون'
  );
  if (contradictory.length) {
    out.push(`${contradictory.length} بندًا تالفًا أو منتهيًا مقترحٌ لرفّ البيع — حقّ الإرجاع لا يجعله سليمًا`);
  }

  const outOfPolicy = lines.filter((l) => String(l?.policyVerdict || '').trim() === 'مرفوض');
  if (outOfPolicy.length) {
    out.push(`${outOfPolicy.length} بندًا خارج سياسة الحماية — يحتاج اعتماد المشرف بسببٍ مكتوب`);
  }

  return out;
}

const schema = {
  type: 'VCR',
  stage: 9,
  titleAr: 'استرداد بضاعة محميّة',
  titleEn: 'Consignment Recall',
  formCode: 'BFP-VCR-001',
  orientation: 'landscape',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['sales_supervisor', 'warehouse_manager', 'return_manager'],
    complete: ['sales_rep', 'sales_supervisor'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الاسترداد — Recall Header',
      kind: 'fields',
      columns: 3,
      note: 'البضاعة تعود إلى عهدة المندوب، ثمّ إلى المستودع بمستند إرجاع المتبقّي (VRT).',
      fields: [
        { key: 'recallDate', label: 'تاريخ الاسترداد (Date)', kind: 'date', required: true },
        { key: 'customerCode', label: 'رمز العميل (Customer Code)', kind: 'text', required: true },
        { key: 'customer', label: 'اسم العميل (Customer Name)', kind: 'text', required: true },
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'depositRef', label: 'مرجع الإيداع (Deposit Ref.)', kind: 'text' },
        {
          key: 'recallReason',
          label: 'سبب الاسترداد',
          kind: 'select',
          options: ['قرب انتهاء الصلاحية', 'انتهاء الصلاحية', 'انقضاء مدّة الحماية', 'طلب العميل', 'سحب تشغيليّ', 'تالف أو كسر', 'إغلاق المتجر'],
          required: true,
        },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الاسترداد — Recalled Lines',
      kind: 'table',
      minRows: 1,
      note: 'الحال يُقرَّر بالعين، والمصير يُشتقّ منه — لا من حقّ الإرجاع.',
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '17%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '7%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '9%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '10%' },
        { key: 'condition', label: 'الحال', kind: 'select', options: ['سليم', 'قارب الانتهاء', 'منتهي', 'تالف', 'كسر', 'ناقص'], width: '10%' },
        { key: 'disposition', label: 'المصير', kind: 'select', options: ['إعادة للمخزون', 'إتلاف', 'تحت الفحص', 'استبدال بمثله'], width: '11%' },
        { key: 'policyVerdict', label: 'حكم السياسة', kind: 'select', options: ['مقبول', 'مرفوض', 'يحتاج اعتمادًا'], width: '10%' },
        { key: 'unitCost', label: 'التكلفة', kind: 'number', width: '6%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي المسترَدّ', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
        {
          key: 'scrapQty',
          label: 'ما مصيره الإتلاف',
          kind: 'computed',
          compute: (d) => (d.lines || []).filter((l) => String(l?.disposition || '').trim() === 'إتلاف').reduce((s, l) => s + (Number(l?.qty) || 0), 0),
        },
      ],
      extraFields: [{ key: 'approvalNote', label: 'مبرّر الاستثناء إن وُجد (Approval Note)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب (Sales Rep)', source: 'creator' },
    { key: 'customer', label: 'العميل (Customer)', source: null },
    { key: 'supervisor', label: 'مشرف المبيعات (Supervisor)', source: 'approver' },
  ],

  attachments: [
    { key: 'recallPhoto', kind: 'photo', label: 'صورة البضاعة المسترَدّة بحالها' },
    { key: 'customerSignature', kind: 'signature', label: 'توقيع العميل بالتسليم' },
  ],

  warnings: vcrWarnings,
};

export default schema;
