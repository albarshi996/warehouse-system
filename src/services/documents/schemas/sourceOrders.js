/**
 * ‹ODOO-ORD› أوامرُ البيع والشراء من أودو — سجلٌّ يُرى في البوّابة كما هو في أودو.
 *
 * ═══ لماذا نوعان جديدان لا SO وPO القائمان؟ ═══
 * أمرُ البيع في البوّابة **يحجز الرصيد** عند اعتماده (`allocateAndReserve`)، وأمرُ أودو حجزُه في أودو.
 * فلو استُورد SO لحُجز الرصيدُ مرّتين وبدا المتاحُ أقلّ ممّا هو. فهذان سجلّان بلا أثرٍ مخزنيّ ولا حجز:
 * يحملان المطلوبَ والمسلَّمَ (أو المستلَم) والمفوتَرَ كما يحسبها أودو.
 *
 * ═══ والأمرُ يتغيّر بعد إنشائه ═══
 * بخلاف مستند المصدر المنجَز (واقعةٌ لا تتغيّر)، يتقدّم الأمرُ: تسليمٌ جزئيّ، ثمّ كامل، ثمّ إلغاء. فالاستيرادُ
 * يُنشئه مرّةً ثمّ **يُحدّثه في مكانه** حين يتغيّر في أودو، ويُلغيه إن أُلغي هناك — والتدقيقُ يحفظ كلَّ تحديث.
 * ولا يُنشأ باليد (انظر `IMPORT_ONLY_TYPES`).
 */

const LINE_COLUMNS = (doneLabel) => [
  { key: 'sku', label: 'رمز SKU', kind: 'text', width: '11%' },
  { key: 'barcode', label: 'باركود', kind: 'text', ltr: true, width: '12%' },
  { key: 'description', label: 'اسم الصنف', kind: 'text', width: '25%' },
  { key: 'uom', label: 'الوحدة', kind: 'text', width: '6%' },
  { key: 'qty', label: 'المطلوب', kind: 'number', width: '8%' },
  { key: 'qtyDone', label: doneLabel, kind: 'number', width: '8%' },
  { key: 'qtyInvoiced', label: 'المفوتَر', kind: 'number', width: '8%' },
  { key: 'unitPrice', label: 'سعر الوحدة', kind: 'number', width: '8%' },
  { key: 'discount', label: 'الخصم %', kind: 'number', width: '6%' },
  { key: 'subtotal', label: 'الإجمالي', kind: 'number', width: '8%' },
];

function headerFields({ partyLabel, doneStatusLabel, plannedLabel }) {
  return [
    { key: 'sourceRef', label: 'رقم الأمر في أودو', kind: 'text', required: true, ltr: true, hint: 'به يُعرف الأمرُ ويُحدَّث ولا يتكرّر.' },
    { key: 'sourceSystem', label: 'النظام المصدر', kind: 'text' },
    { key: 'sourceDoneDate', label: 'تاريخ الأمر', kind: 'date', required: true, hint: 'تاريخُ الأمر في أودو بتوقيت ليبيا.' },
    { key: 'warehouse', label: 'المستودع', kind: 'text', hint: 'كود البوّابة (WH001 بنغازي · WH002 طرابلس).' },
    { key: 'partner', label: partyLabel, kind: 'text' },
    { key: 'partnerCode', label: `رمز ${partyLabel}`, kind: 'text', ltr: true },
    { key: 'orderRef', label: 'مرجع الطرف', kind: 'text', ltr: true },
    { key: 'sourceState', label: 'الحالة في أودو', kind: 'text' },
    { key: 'doneStatus', label: doneStatusLabel, kind: 'text' },
    { key: 'invoiceStatus', label: 'حالة الفوترة', kind: 'text' },
    { key: 'amountTotal', label: 'إجمالي الأمر', kind: 'number' },
    { key: 'currency', label: 'العملة', kind: 'text' },
    { key: 'salesperson', label: 'المسؤول', kind: 'text' },
    { key: 'commitmentDate', label: plannedLabel, kind: 'date' },
    { key: 'sourceUpdatedAt', label: 'آخر تعديل في أودو', kind: 'text', ltr: true },
    { key: 'notes', label: 'ملاحظات', kind: 'text' },
  ];
}

const ROLES = Object.freeze({
  create: ['warehouse_manager'],
  approve: ['warehouse_manager'],
  complete: ['warehouse_manager'],
});

function makeSchema({ type, titleAr, titleEn, formCode, partyLabel, doneLabel, doneStatusLabel, plannedLabel }) {
  return {
    type,
    stage: 9,
    titleAr,
    titleEn,
    formCode,
    orientation: 'landscape',
    /** سجلُّ أمرٍ من أودو — يُستورد ويُحدَّث ولا يُنشأ باليد (انظر رأس الملفّ). */
    sourceOrder: true,
    roles: ROLES,
    sections: [
      { key: 'header', title: `بيانات ${titleAr}`, kind: 'fields', columns: 3, fields: headerFields({ partyLabel, doneStatusLabel, plannedLabel }) },
      { key: 'lines', title: 'البنود — Lines', kind: 'table', minRows: 1, columns: LINE_COLUMNS(doneLabel) },
    ],
    signatures: [
      { key: 'importer', label: 'المستورِد (Imported by)', source: 'creator' },
      { key: 'approver', label: 'المعتمِد (Approved by)', source: 'approver' },
    ],
  };
}

/** أمرُ بيعٍ من أودو: المطلوبُ والمسلَّمُ والمفوتَر. */
export const oso = makeSchema({
  type: 'OSO',
  titleAr: 'أمرُ بيعٍ من أودو',
  titleEn: 'Odoo Sales Order',
  formCode: 'BFP-OSO-001',
  partyLabel: 'العميل',
  doneLabel: 'المسلَّم',
  doneStatusLabel: 'حالة التسليم',
  plannedLabel: 'موعد التسليم',
});

/** أمرُ شراءٍ من أودو: المطلوبُ والمستلَمُ والمفوتَر. */
export const opo = makeSchema({
  type: 'OPO',
  titleAr: 'أمرُ شراءٍ من أودو',
  titleEn: 'Odoo Purchase Order',
  formCode: 'BFP-OPO-001',
  partyLabel: 'المورّد',
  doneLabel: 'المستلَم',
  doneStatusLabel: 'حالة الاستلام',
  plannedLabel: 'موعد الوصول',
});

export const SOURCE_ORDER_SCHEMAS = Object.freeze({ OSO: oso, OPO: opo });

/** هل هذا النوع أمرٌ من أودو؟ */
export function isSourceOrderType(type) {
  return Object.hasOwn(SOURCE_ORDER_SCHEMAS, String(type || '').toUpperCase());
}
