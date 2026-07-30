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
];

export const REPORTS = [
  // ── التقارير التشغيلية ──────────────────────────────────────────────
  // المرجعان الرسميان (المحور 3 — ROADMAP §13): ضُمّا من جهاز المالك إلى
  // public/ ليصيرا مرجعًا حيًّا في البوابة لا ملفّين على سطح المكتب.
  {
    id: 'ops-reference', category: 'operations', icon: '📕', external: true,
    title: 'المرجع التشغيلي الرسمي',
    desc: 'المرجع التنفيذي الشامل: الدورة المستندية الـ12، مصفوفة الـ21 نموذجًا، والقواعد الذهبية لكل دورة.',
    path: '/المرجع-التشغيلي-الرسمي.html',
  },
  {
    id: 'jobs-structure', category: 'operations', icon: '🧑‍💼', external: true,
    title: 'هيكل الوظائف والأدوار',
    desc: 'الهيكل الرسمي: 18 وظيفة بمهامها وتبعيّاتها ومؤشراتها — مصدر كتالوج شاشة التوظيف الذكي.',
    path: '/تقرير-هيكل-الوظائف-والادوار.html',
  },
  {
    id: 'erp', category: 'operations', icon: '⚙️', external: true,
    title: 'تقرير دورات العمل ERP',
    desc: 'الدورات المستندية التشغيلية عبر منظومة Odoo.',
    path: '/تقرير(ERP).html',
  },
  {
    id: 'staffing', category: 'operations', icon: '👥', external: true,
    title: 'تقرير التوظيف والجدول الزمني',
    desc: 'الهيكل الوظيفي وجدول زمن إدارة المستودعات.',
    path: '/تقرير-التوظيف-والجدول-الزمني.html',
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
    id: 'studies-hub', category: 'analytics', icon: '📚', external: false,
    title: 'مركز الدراسات والمقارنات',
    desc: 'المرجع الواحد لكل الدراسات والمقارنات والتقارير الاحترافية الداعمة للقرار.',
    path: '/dashboard/studies',
  },
  {
    id: 'comparative-study', category: 'analytics', icon: '⚖️', external: false,
    title: 'الدراسة المقارنة العالمية',
    desc: 'الأنظمة العالمية × هيكلنا × دورتنا المستندية: فجوات ومخاطر وKPIs وأسئلة وتوصيات.',
    path: '/dashboard/comparative-study',
  },
  {
    id: 'global-doc-cycles', category: 'analytics', icon: '🌐', external: false,
    title: 'الدورات المستندية العالمية',
    desc: 'ثمانية نماذج تشغيلية كاملة: وول مارت وأمازون وإيكيا وشي إن وعلي بابا وكارفور ونون وإي باي.',
    path: '/dashboard/global-doc-cycles',
  },
];
