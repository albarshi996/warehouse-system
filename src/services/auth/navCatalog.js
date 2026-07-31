/**
 * كتالوج القائمة الجانبية — **المصدر الواحد** لبنية البوابة وصلاحياتها.
 *
 * لماذا ملف مستقلّ؟ كانت هذه المصفوفة مكتوبة داخل `DashboardLayout.astro`،
 * فلم يستطع حارس الدخول قراءتها، فكُتبت **قائمة ثانية يدويًّا** في
 * `pageAccess.js` — وانحرفت: الحارس كان يقيّد دورين فقط بينما القائمة
 * تُخفي روابط عشرة أدوار أخرى تفتح صفحاتها بكتابة الرابط. الآن الاثنان
 * يقرآن من هنا (نفس نمط `org-structure.json` الذي أنهى انحراف التقارير).
 *
 * ثلاثة مستهلكين:
 *   1. `DashboardLayout.astro` — يرسم القائمة (يضيف `base` لكل `path`).
 *   2. `pageAccess.js` — يشتقّ «أي دور يفتح أي صفحة» (الحارس الحقيقي).
 *   3. `scripts/audit-portal.mjs` — يكشف الصفحات اليتيمة والروابط المكسورة.
 *
 * قواعد التحرير:
 *   - `path` **نسبيّ بلا `base`** ويبدأ بـ`/` (مثال: `/dashboard/products`).
 *   - `external: true` ⇒ المسار ملف داخل `public/` لا صفحة Astro.
 *   - `key` يطابق مفاتيح `ROLE_NAV` في `navAccess.js`.
 *   - `roles` على عنصر يحصره بأصحابها (الأدمن يرى كل شيء دائمًا).
 *   - أي صفحة جديدة في `src/pages/dashboard/` **يجب** أن تُدرج هنا أو في
 *     `ALWAYS_ALLOWED` بـ`pageAccess.js` — واختبار الانحراف يفرض ذلك.
 */

/** عنصر مثبّت أعلى القائمة (خارج المجموعات). */
export const PINNED_ITEM = { path: '/dashboard', label: 'الرئيسية', icon: 'grid' };

/**
 * المجموعات المنطقية. الترتيب: الأكثر استخدامًا يوميًّا في الأعلى ←
 * المرجعيّ/التأسيسي في الأسفل.
 */
export const NAV_GROUPS = [
  {
    key: 'daily',
    group: 'العمليات اليومية',
    emoji: '🗓️', icon: 'calendar',
    items: [
      { path: '/dashboard/documents', label: 'المستندات', icon: 'clipboardList' },
      { path: '/dashboard/forms', label: 'اختار وظيفتك', icon: 'clipboardList' },
      { path: '/dashboard/tasks', label: 'المهام', icon: 'clipboardList' },
      { path: '/dashboard/products', label: 'الأصناف', icon: 'package' },
      // ماستر شركاء الأعمال (§15.2/15.3) — للمديرَين كإدارة بياناتٍ مرجعية.
      { path: '/dashboard/suppliers', label: 'ماستر الموردين', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/customers', label: 'ماستر العملاء', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/stock-operations', label: 'عمليات مخزنية', icon: 'package' },
      { path: '/dashboard/operations', label: 'متابعة العمليات', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
    ],
  },
  {
    key: 'warehouses',
    group: 'المستودعات والجرد',
    emoji: '📦', icon: 'warehouse',
    items: [
      { path: '/dashboard/command-center', label: 'لوحة القيادة التشغيلية', icon: 'grid' },
      { path: '/dashboard/warehouses', label: 'المستودعات', icon: 'package' },
      { path: '/dashboard/stock-ledger', label: 'دفتر حركات المخزون', icon: 'clipboardList' },
      { path: '/dashboard/transfers', label: 'النقل بين المستودعات', icon: 'truck' },
      { path: '/dashboard/order-control', label: 'الرقابة على الطلبات', icon: 'clipboardList' },
      { path: '/dashboard/retail-hub', label: 'خريطة التجزئة', icon: 'mapPin' },
      { path: '/dashboard/assets-inventory', label: 'جرد الأصول', icon: 'clipboardList' },
    ],
  },
  {
    // مجموعة مستقلة لدور «الحركة» — رابط جرد المركبات انتقل إليها من
    // «المستودعات والجرد» (نقل لا حذف) كي يرى دور fleet مجموعته وحدها.
    key: 'fleet',
    group: 'سلاسل الإمداد والحركة',
    emoji: '🚚', icon: 'truck',
    items: [
      { path: '/dashboard/vehicles-inventory', label: 'جرد المركبات', icon: 'package' },
      { path: '/dashboard/fleet-operations', label: 'عمليات الأسطول', icon: 'clipboardList' },
      { path: '/dashboard/maintenance-center', label: 'مركز الصيانة', icon: 'grid' },
      { path: '/dashboard/custody', label: 'العُهد العينية', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/supply-chain', label: 'لوحة سلاسل الإمداد', icon: 'grid', roles: ['admin', 'warehouse_manager'] },
    ],
  },
  {
    key: 'odoo',
    group: 'دورات أودو والمحاكاة',
    emoji: '🔄', icon: 'graduationCap',
    items: [
      { path: '/dashboard/learn-odoo', label: 'تعلم أودو', icon: 'bookOpen' },
      { path: '/dashboard/workflows', label: 'الهيكل والمسارات', icon: 'workflows' },
      { path: '/dashboard/erp-workflows', label: 'دورات العمل ERP', icon: 'dollarSign' },
      { path: '/dashboard/training', label: 'تدريب Odoo (محاكي)', icon: 'grid' },
    ],
  },
  {
    key: 'reports',
    group: 'مركز التقارير',
    emoji: '📊', icon: 'barChart3',
    items: [
      { path: '/dashboard/reports', label: 'مركز التقارير', icon: 'clipboardList', pinned: true },
      // لوحة اللوجستيات التنفيذيّة (المرحلة ٤) — قمرةٌ جامعةٌ بمكوّنات أودو تجمّع
      // مؤشّرات المخزون والعمليّات والسلاسل في نظرةٍ واحدة. للمديرَين كلوحةٍ إدارية.
      { path: '/dashboard/logistics-dashboard', label: 'لوحة اللوجستيات التنفيذيّة', icon: 'gauge', roles: ['admin', 'warehouse_manager'] },
      // مؤشرات المشتريات والأداء — المحور الرابع في تقييم السلاسل، محسوبة من
      // طوابع المستندات وروابطها (procurementKpis.js). للمديرَين كلوحةٍ إدارية.
      { path: '/dashboard/kpis', label: 'مؤشرات المشتريات والأداء', icon: 'grid', roles: ['admin', 'warehouse_manager'] },
      // تحليل المخزون: التقييم والراكد وإعادة الطلب (§17) — محسوبٌ من ماستر
      // الأصناف ودفتر الحركات القائمَين. للمديرَين كلوحةٍ إدارية.
      { path: '/dashboard/inventory-analytics', label: 'تحليل المخزون', icon: 'package', roles: ['admin', 'warehouse_manager'] },
      // مركز الدراسات — مرجع الدراسات والمقارنات (25.07): الدراسة المقارنة
      // العالمية + مكتبة الدورات المستندية للشركات الثماني كمحتوى أصيل.
      { path: '/dashboard/studies', label: 'مركز الدراسات والمقارنات', icon: 'bookOpen' },
      { path: '/dashboard/comparative-study', label: 'الدراسة المقارنة العالمية', icon: 'grid' },
      // الهيكل التشغيليّ المستهدف وخارطة التحوّل — طبقتا التصميم وخارطة الطريق من
      // نموذج ديلويت TOM، مبنيّتان فوق الدراسة المقارنة (استعداد ديلويت — اليوم 4).
      { path: '/dashboard/target-operating-model', label: 'الهيكل التشغيليّ المستهدف', icon: 'workflows', roles: ['admin', 'warehouse_manager'] },
      // حزمة الاستعداد للمقابلة — القمرة الجامعة (٦ مكوّنات) للبروفة قبل تقييم
      // ديلويت، بأرقامٍ حيّة من الدراسة (استعداد ديلويت — اليوم 5).
      { path: '/dashboard/interview-readiness', label: 'حزمة الاستعداد — البروفة', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/global-doc-cycles', label: 'الدورات المستندية العالمية', icon: 'bookOpen' },
      // كانت صفحة يتيمة: مبنيّة وغير مربوطة بأي قائمة — كشفها تدقيق 23.07.
      { path: '/تقرير-الدورة-المستندية-الكامل-2026.html', label: 'الدورة المستندية والتنظيم', icon: 'clipboardList', external: true },
      { path: '/المرجع-التشغيلي-الرسمي.html', label: 'المرجع التشغيلي الرسمي', icon: 'bookOpen', external: true },
      { path: '/تقرير-هيكل-الوظائف-والادوار.html', label: 'هيكل الوظائف والأدوار', icon: 'users', external: true },
      { path: '/تقرير-الانجاز.html', label: 'تقرير الانجاز', icon: 'clipboardList', external: true },
      { path: '/تقرير(ERP).html', label: 'تقرير ERP', icon: 'fileUp', external: true },
    ],
  },
  {
    key: 'archive',
    group: 'الأرشيف والمرجعية',
    emoji: '🗄️', icon: 'archive',
    items: [
      { path: '/dashboard/org-structure', label: 'الهيكل التنظيمي', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/meetings', label: 'الاجتماعات التحضيرية', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/recruitment', label: 'التوظيف', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/users', label: 'إدارة المستخدمين', icon: 'users', roles: ['admin'] },
      { path: '/dashboard/access-control', label: 'الصلاحيات والأدوار', icon: 'users', roles: ['admin'] },
      { path: '/dashboard/arch-wiki', label: 'خريطة النظام', icon: 'grid', roles: ['admin'] },
      { path: '/dashboard/archive', label: 'الأرشيف التأسيسي', icon: 'package' },
      { path: '/dashboard/meeting-assistant', label: 'مساعد الاجتماعات', icon: 'grid' },
    ],
  },
  {
    key: 'dept',
    group: 'طلبات الإدارات',
    emoji: '🏬', icon: 'building2',
    items: [
      { path: '/dashboard/hiring-requests', label: 'طلب توظيف', icon: 'clipboardList' },
      // أداة تقييم سرّية — المدير العام ومستخدم الإدارة فقط:
      { path: '/dashboard/wh-manager-eval', label: 'تقييم مدير المستودعات', icon: 'clipboardList', roles: ['admin', 'department_user'] },
      // روابط تعاونية لمستخدم الإدارة فقط (بياناتها محليّة في متصفّحه — خاصّة به):
      { path: '/dashboard/tasks', label: 'المهام', icon: 'clipboardList', roles: ['department_user'] },
      { path: '/dashboard/meeting-assistant', label: 'مساعد الاجتماعات', icon: 'grid', roles: ['department_user'] },
    ],
  },
];

/** كل عناصر الكتالوج مسطَّحة، كلٌّ يحمل مفتاح مجموعته. */
export function flatItems() {
  return NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, groupKey: g.key })));
}

/**
 * كل المواضع التي تظهر فيها صفحة داخلية بعينها.
 * صفحة واحدة قد تتكرّر في مجموعتين بأدوار مختلفة (المهام ومساعد الاجتماعات)
 * — والصلاحية اتحادُ المواضع لا أوّلها.
 */
export function placementsFor(path) {
  return flatItems().filter((it) => !it.external && it.path === path);
}

/** مسارات الصفحات الداخلية بلا تكرار — يستهلكها التدقيق واختبار الانحراف. */
export function internalPaths() {
  return [...new Set(flatItems().filter((it) => !it.external).map((it) => it.path))];
}

/** مسارات ملفات `public/` المشار إليها من القائمة — يتحقّق التدقيق من وجودها. */
export function externalPaths() {
  return [...new Set(flatItems().filter((it) => it.external).map((it) => it.path))];
}
