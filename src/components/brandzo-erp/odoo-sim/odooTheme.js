/**
 * محاكي واجهة Odoo Enterprise — رموز التصميم وسجلّ التطبيقات والبيانات التأسيسية.
 * ─────────────────────────────────────────────────────────────────────────
 * نسخة تدريبية عالية الدقة تعمل دون اتصال، تحاكي واجهة Odoo Enterprise كما
 * تظهر فعلياً في بيئة عربية (RTL) بعملة الدينار الليبي — ليتعرّف المتدرّب على
 * الشاشات نفسها التي سيستخدمها في الإنتاج، عبر الدورة المستندية الكاملة
 * (12 مرحلة) من المرجع التشغيلي الرسمي.
 *
 * القاعدة الذهبية: لا حذف — هذه وحدة كاملة (odoo-sim) تُكمّل محاكي الدورة
 * المستندية القائم (training) ولا تمسّه.
 *
 * ملاحظة i18n: عناصر القائمة الجانبية تُعرّف بـ { key, label } — المفتاح (ASCII
 * ثابت) هو هوية التنقّل، و label هو النص العربي المعروض. هذا يمنع هشاشة مطابقة
 * السلاسل العربية عبر الملفات.
 */

/* ── رموز تصميم Odoo (تقريب لِلوحة ألوان Enterprise) ──────────────────────── */
export const ODOO = {
  purple: '#714B67',      // بنفسجي Odoo — الأزرار الأساسية / الحالة النشطة
  purpleDark: '#5c3d54',
  purpleSoft: '#f3eef2',  // خلفية عنصر القائمة النشط
  contentBg: '#f5f5f5',   // خلفية محتوى التطبيق (رمادي)
  border: '#dee2e6',      // حدود الورقة / اللوحات
  borderSoft: '#efefef',
  text: '#374151',
  muted: '#8f8f8f',
  green: '#28a745',
  teal: '#17a2b8',
};

/* ── التطبيقات الأساسية الثلاثة وقوائمها الجانبية ────────────────────────── */
export const APPS = [
  {
    id: 'purchase',
    name: 'المشتريات',
    icon: '🛒',
    color: '#714B67',
    activeItem: 'requisitions',
    menu: [
      { section: 'الطلبات', items: [
        { key: 'requisitions', label: 'طلبات الشراء الداخلية' },
        { key: 'rfq', label: 'طلبات عروض الأسعار' },
        { key: 'po', label: 'أوامر الشراء' },
        { key: 'agreements', label: 'اتفاقيات الشراء' },
        { key: 'vendors', label: 'المورّدون' },
      ] },
      { section: 'المنتجات', items: [
        { key: 'products', label: 'المنتجات' },
        { key: 'variants', label: 'متغيّرات المنتج' },
      ] },
      { section: 'التقارير', items: [
        { key: 'rep_purchase', label: 'المشتريات' },
      ] },
      { section: 'الإعدادات', items: [
        { key: 'settings', label: 'الإعدادات' },
      ] },
    ],
  },
  {
    id: 'inventory',
    name: 'المخزون',
    icon: '📦',
    color: '#00A09D',
    activeItem: 'receipts',
    menu: [
      { section: 'نظرة عامة', items: [
        { key: 'dashboard', label: 'لوحة القيادة' },
      ] },
      { section: 'العمليات', items: [
        { key: 'receipts', label: 'عمليات الاستلام' },
        { key: 'internal', label: 'التحويلات الداخلية' },
        { key: 'delivery', label: 'أوامر التسليم' },
        { key: 'gatepass', label: 'تصاريح البوابة' },
        { key: 'returns', label: 'المرتجعات' },
      ] },
      { section: 'الجرد والرقابة', items: [
        { key: 'physical', label: 'الجرد الدوري' },
        { key: 'adjust', label: 'تسويات المخزون' },
      ] },
      { section: 'المنتجات', items: [
        { key: 'products', label: 'المنتجات' },
        { key: 'lots', label: 'الدفعات / الأرقام التسلسلية' },
      ] },
      { section: 'الإعدادات', items: [
        { key: 'settings', label: 'الإعدادات' },
        { key: 'putaway_rules', label: 'قواعد التخزين' },
      ] },
    ],
  },
  {
    id: 'accounting',
    name: 'المحاسبة',
    icon: '💰',
    color: '#5B899E',
    activeItem: 'bills',
    menu: [
      { section: 'المورّدون', items: [
        { key: 'bills', label: 'فواتير المورّدين' },
        { key: 'refunds', label: 'الإشعارات الدائنة' },
        { key: 'payments_v', label: 'المدفوعات' },
        { key: 'vendors', label: 'المورّدون' },
      ] },
      { section: 'الفترة المالية', items: [
        { key: 'close', label: 'الإغلاق المالي' },
      ] },
      { section: 'التقارير', items: [
        { key: 'balance', label: 'الميزانية العمومية' },
        { key: 'pnl', label: 'الأرباح والخسائر' },
      ] },
      { section: 'الإعدادات', items: [
        { key: 'settings', label: 'الإعدادات' },
      ] },
    ],
  },
];

/* ── سجلّ تأسيسي: أمر شراء نموذجي (يطابق منتج التدريب) ────────────────────── */
export const SAMPLE_PO = {
  name: 'P00042',
  vendor: 'مختبرات الخليج للتجميل',
  vendorRef: 'BID/2026/0155',
  orderDeadline: '2026-07-14 10:00:00',
  receiptDate: '2026-07-16',
  buyer: 'محمد البرشي',
  company: 'براندزو هَب',
  paymentTerms: '30 يوماً',
  currency: 'LYD',
  lines: [
    { product: '[BZ-VCS-30] سيروم فيتامين C — 30 مل', qty: 200, uom: 'وحدة', price: 123.5, tax: '15%' },
  ],
};

/* ── مراجع المستندات عبر الدورة الكاملة (12 مرحلة) ────────────────────────── */
export const PR_REF = 'PR-2026-0155';        // 01 طلب الشراء الداخلي
export const RECEIPT_REF = 'WH/IN/00001';    // 04 إذن الاستلام (GRN)
export const GP_REF = 'GP/2026/0001';        // 07 تصريح خروج البوابة
export const RET_REF = 'WH/RET/00001';       // 08 إشعار المرتجع
export const CN_REF = 'RBILL/2026/07/0001';  // 08 الإشعار الدائن
export const CC_REF = 'CC/2026/0001';        // 09 ورقة الجرد الدوري
export const ADJ_REF = 'ADJ/2026/0001';      // 10 سند تسوية المخزون

/* ثوابت سيناريو التدريب */
export const RETURN_QTY = 20;   // مرتجع العميل: 20 وحدة تالفة تُعاد للمورّد
export const CC_SYSTEM_QTY = 60; // رصيد النظام للدفعة LOT-2027-NEW عند الجرد
export const CC_LOT = 'LOT-2027-NEW';

/* ── مُنسّق العملة (الدينار الليبي) + شارات القوائم/الحالات ───────────────── */
export const fmt = (n) =>
  `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.ل`;

export const STATE_BADGE = {
  draft: { label: 'مسودة', color: '#6b7280', bg: '#f1f1f1' },
  scheduled: { label: 'مجدول', color: '#1d6fb8', bg: '#e7f1fa' },
  to_approve: { label: 'قيد الموافقة', color: '#b8860b', bg: '#fdf6e3' },
  approved: { label: 'معتمد', color: '#1e7e34', bg: '#e9f7ef' },
  ready: { label: 'جاهز', color: '#1d6fb8', bg: '#e7f1fa' },
  in_progress: { label: 'قيد التنفيذ', color: '#b8860b', bg: '#fdf6e3' },
  waiting_qc: { label: 'بانتظار الجودة', color: '#714B67', bg: '#f3eef2' },
  validated: { label: 'مُصادَق', color: '#1e7e34', bg: '#e9f7ef' },
  posted: { label: 'مُرحّلة', color: '#1e7e34', bg: '#e9f7ef' },
  in_payment: { label: 'قيد الدفع', color: '#b8860b', bg: '#fdf6e3' },
  open: { label: 'مفتوحة', color: '#1d6fb8', bg: '#e7f1fa' },
  closed: { label: 'مُغلقة', color: '#1e7e34', bg: '#e9f7ef' },
  done: { label: 'مكتمل', color: '#1e7e34', bg: '#e9f7ef' },
};
