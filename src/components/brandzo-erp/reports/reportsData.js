/**
 * مصدر البيانات الموحّد لمركز التقارير (Reports Center).
 *
 * كل تقرير: { id, category, icon, title, desc, path, external }.
 *   - path     : المسار نسبةً إلى BASE_URL (تُضاف البادئة في المكوّن).
 *   - external : true لملف HTML مستقل (يُفتح في نافذة جديدة)، false لصفحة داخلية.
 *
 * القاعدة الذهبية: لا حذف — هذا الملف يجمّع روابط التقارير القائمة (صفحات .astro
 * وملفات .html في public/) في مصدر واحد منظّم دون المساس بأصولها.
 */

export const REPORT_CATEGORIES = [
  { id: 'operations', label: 'التقارير التشغيلية', icon: '🏭' },
  { id: 'quality', label: 'الجودة والمعايير', icon: '🏆' },
  { id: 'analytics', label: 'التحليل والمقارنات', icon: '🌍' },
  { id: 'visual', label: 'التوثيق المرئي', icon: '🖼️' },
];

export const REPORTS = [
  // ── التقارير التشغيلية ──────────────────────────────────────────────
  {
    id: 'warehouse-155', category: 'operations', icon: '🏢', external: false,
    title: 'تقرير تحوير مستودع 155',
    desc: 'خطة تحوير المستودعات لرفع الكفاءة التشغيلية إلى معيار Class A.',
    path: '/dashboard/warehouse-155-report',
  },
  {
    id: 'doc-cycle', category: 'operations', icon: '🔄', external: false,
    title: 'الدورة المستندية الكاملة',
    desc: 'المسار الكامل للمستندات من الطلب حتى الإغلاق المالي.',
    path: '/dashboard/تقرير-الدورة-المستندية-الكامل',
  },
  {
    id: 'erp', category: 'operations', icon: '⚙️', external: true,
    title: 'تقرير دورات العمل ERP',
    desc: 'الدورات المستندية التشغيلية عبر منظومة Odoo.',
    path: '/تقرير(ERP).html',
  },
  {
    id: 'storage', category: 'operations', icon: '📦', external: true,
    title: 'تقرير التخزين',
    desc: 'مخططات التخزين وتوزيع الأصناف داخل المستودعات.',
    path: '/تقرير(التخزين).html',
  },
  {
    id: 'staffing', category: 'operations', icon: '👥', external: true,
    title: 'تقرير التوظيف والجدول الزمني',
    desc: 'الهيكل الوظيفي وجدول زمن إدارة المستودعات.',
    path: '/تقرير-التوظيف-والجدول-الزمني.html',
  },
  {
    id: 'achievement', category: 'operations', icon: '✅', external: false,
    title: 'تقرير الإنجاز',
    desc: 'سجل الإنجازات اليومية والمهام التشغيلية المكتملة.',
    path: '/dashboard/achievement-report',
  },

  // ── الجودة والمعايير ───────────────────────────────────────────────
  {
    id: 'quality', category: 'quality', icon: '🏆', external: true,
    title: 'تقرير إدارة الجودة الشاملة',
    desc: 'معايير ضبط الجودة والفحص عبر دورة المستودعات.',
    path: '/تقرير-إدارة-الجودة.html',
  },

  // ── التحليل والمقارنات ─────────────────────────────────────────────
  {
    id: 'global', category: 'analytics', icon: '🌍', external: false,
    title: 'المقارنة العالمية',
    desc: 'مقارنة النظام التشغيلي مع عمالقة اللوجستيات العالمية.',
    path: '/dashboard/global-warehouse-report',
  },

  // ── التوثيق المرئي ─────────────────────────────────────────────────
  {
    id: 'gallery', category: 'visual', icon: '🖼️', external: false,
    title: 'معرض التوثيق المرئي',
    desc: 'صور وفيديوهات توثيقية للمستودعات والعمليات اليومية.',
    path: '/dashboard/gallery',
  },
];
