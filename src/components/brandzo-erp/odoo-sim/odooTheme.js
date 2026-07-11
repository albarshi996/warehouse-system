/**
 * محاكي واجهة Odoo Enterprise — رموز التصميم وسجلّ التطبيقات والبيانات التأسيسية.
 * ─────────────────────────────────────────────────────────────────────────
 * نسخة تدريبية عالية الدقة تعمل دون اتصال، تحاكي واجهة Odoo Enterprise كما
 * تظهر فعلياً في بيئة عربية (RTL) بعملة الدينار الليبي — ليتعرّف المتدرّب على
 * الشاشات نفسها التي سيستخدمها في الإنتاج.
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
    activeItem: 'po',
    menu: [
      { section: 'الطلبات', items: [
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
        { key: 'transfers', label: 'التحويلات' },
        { key: 'receipts', label: 'عمليات الاستلام' },
        { key: 'delivery', label: 'أوامر التسليم' },
        { key: 'internal', label: 'التحويلات الداخلية' },
      ] },
      { section: 'المنتجات', items: [
        { key: 'products', label: 'المنتجات' },
        { key: 'lots', label: 'الدفعات / الأرقام التسلسلية' },
      ] },
      { section: 'التقارير', items: [
        { key: 'rep_stock', label: 'المخزون' },
        { key: 'moves', label: 'سجل الحركات' },
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
      { section: 'العملاء', items: [
        { key: 'invoices', label: 'فواتير العملاء' },
        { key: 'payments_c', label: 'المدفوعات' },
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

/* عناوين عربية معروضة في مسار التنقّل (breadcrumb) لكل مفتاح تنقّل. */
export const ITEM_LABEL = {
  po: 'أوامر الشراء',
  receipts: 'عمليات الاستلام',
  delivery: 'أوامر التسليم',
  internal: 'التحويلات الداخلية',
  bills: 'فواتير المورّدين',
  refunds: 'الإشعارات الدائنة',
};

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

/* إذن الاستلام (GRN) المُنشأ عند تأكيد أمر الشراء. */
export const RECEIPT_REF = 'WH/IN/00001';

/* ── مُنسّق العملة (الدينار الليبي) + شارات القوائم/الحالات ───────────────── */
export const fmt = (n) =>
  `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.ل`;

export const STATE_BADGE = {
  draft: { label: 'مسودة', color: '#6b7280', bg: '#f1f1f1' },
  ready: { label: 'جاهز', color: '#1d6fb8', bg: '#e7f1fa' },
  in_progress: { label: 'قيد التنفيذ', color: '#b8860b', bg: '#fdf6e3' },
  waiting_qc: { label: 'بانتظار الجودة', color: '#714B67', bg: '#f3eef2' },
  done: { label: 'مكتمل', color: '#1e7e34', bg: '#e9f7ef' },
};
