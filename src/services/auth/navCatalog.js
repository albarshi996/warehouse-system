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
      // الفهرس الجامع لكل مقاصد البوابة — يُولَّد من هذا الكتالوج نفسه، فأيّ
      // عنصر يُضاف هنا مستقبلًا يظهر فيه تلقائيًّا بلا تعديل يدويّ.
      { path: '/dashboard/portal-operations', label: 'عمليات البوابة', icon: 'globe' },
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
    // دورة المشتريات الداخلية (طلبات الإدارات من المالية): طلب ← عروض ← أمر ←
    // صرف ← تسليم. صفحة القيادة role-aware، والمستندات تُفتح وتُنشأ من محرّك
    // المستندات (`/dashboard/document` ضمن ALWAYS_ALLOWED) عبر روابط الصفحة.
    key: 'procurement',
    group: 'المشتريات الداخلية',
    emoji: '🧾', icon: 'shoppingCart',
    items: [
      { path: '/dashboard/procurement', label: 'دورة المشتريات الداخلية', icon: 'shoppingCart' },
      // دفتر الذمم — موضعٌ ثانٍ لأمين الخزينة وحده: هو من يقبض ويصرف، ولا يرى
      // مجموعة التقارير. والصلاحية اتحاد المواضع لا أوّلها (`placementsFor`).
      { path: '/dashboard/partner-ledger', label: 'دفتر الذمم وكشوف الحساب', icon: 'dollarSign', roles: ['treasury'] },
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
      // تقارير البيانات — موضعٌ ثانٍ لأمين المخزن ومسؤول المرتجعات: تقارير
      // المخزون تخصّهما، وهما لا يريان مجموعة «التقارير». والصلاحية اتحادُ المواضع.
      { path: '/dashboard/data-reports', label: 'تقارير البيانات', icon: 'barChart3', roles: ['storekeeper', 'return_manager'] },
      { path: '/dashboard/transfers', label: 'النقل بين المستودعات', icon: 'truck' },
      { path: '/dashboard/order-control', label: 'الرقابة على الطلبات', icon: 'clipboardList' },
      { path: '/dashboard/retail-hub', label: 'خريطة التجزئة', icon: 'mapPin' },
      { path: '/dashboard/assets-inventory', label: 'جرد الأصول', icon: 'clipboardList' },
      // مراقبة سلسلة التبريد (IoT) وقوائم السلامة المهنية — ملحقا المرجع م-٥/٢ و م-٥/٣.
      { path: '/dashboard/cold-chain', label: 'سلسلة التبريد (IoT)', icon: 'package' },
      { path: '/dashboard/hse-checklists', label: 'قوائم السلامة (HSE)', icon: 'clipboardList' },
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
      { path: '/dashboard/labor-operations', label: 'عمالة الشحن والتفريغ', icon: 'users', roles: ['admin', 'warehouse_manager', 'labor_supervisor'] },
    ],
  },
  {
    // مجموعة الميدان — مستقلّة عن «سلاسل الإمداد والحركة» عمدًا: المندوب لا شأن
    // له بمركز الصيانة ولا بعمالة الشحن ولا بجرد المركبات. ولو أُدرج بندُه في
    // مجموعتها لرآها كلَّها، لأنّ البنود بلا `roles` مرئيّةٌ لكلّ من يرى مجموعتها.
    // وهنا موضع ما سيأتي: خطّة الزيارات · الخريطة الحيّة · المستهدفات.
    key: 'field',
    group: 'الميدان والبيع من المركبة',
    emoji: '🛵', icon: 'truck',
    items: [
      // قوائم الأسعار (م٣-ج): موضعها «الميدان» لا «العمليات اليوميّة» — فمشرف
      // المبيعات لا يرى مجموعة العمليات، وإدراجه هناك كان يمنحه اسمًا بلا باب.
      { path: '/dashboard/price-lists', label: 'قوائم الأسعار', icon: 'clipboardList', roles: ['admin', 'warehouse_manager', 'sales_supervisor'] },
      { path: '/dashboard/field-operations', label: 'يوم المندوب', icon: 'mapPin', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      { path: '/dashboard/van-operations', label: 'المستودع المتنقّل', icon: 'truck', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      { path: '/dashboard/customer-stock', label: 'بضاعة العملاء', icon: 'package', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      // المندوب يرى مستهدفاته وحدها (تصفيةٌ داخل الجزيرة)؛ والمشرف يرى الكلّ ويُعرّف.
      { path: '/dashboard/targets', label: 'المستهدفات', icon: 'barChart3', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      // العروض يضعها المشرف والمديران؛ المندوب لا يُعرّفها — يُطبّقها النظام عليه.
      { path: '/dashboard/promotions', label: 'العروض الترويجية', icon: 'dollarSign', roles: ['admin', 'warehouse_manager', 'sales_supervisor'] },
    ],
  },
  {
    key: 'odoo',
    group: 'دورات أودو والمحاكاة',
    emoji: '🔄', icon: 'graduationCap',
    items: [
      { path: '/dashboard/learn-odoo', label: 'تعلم أودو', icon: 'bookOpen' },
      // جسر المزامنة الحيّ: يقرأ أوامر الشراء والماستر الحقيقيّة من البوابة ويُظهر
      // دفعها إلى أودو مسوّدةً حتى الاعتماد (مرآةٌ على نفس مسار عميل الإنتاج).
      { path: '/dashboard/odoo-sync', label: 'جسر المزامنة مع أودو', icon: 'arrowLeftRight', roles: ['admin', 'warehouse_manager'] },
      // لوحة التحكّم بالتكامل (م٧-أ): للمدير العام وحده — من يقلب اتّجاهها
      // يغيّر مصدر الحقيقة في الشركة كلّها.
      { path: '/dashboard/integration-control', label: 'التحكّم بالتكامل', icon: 'arrowLeftRight', roles: ['admin'] },
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
      // تقارير البيانات (ر‑٠): اثنا عشر تقريرًا على محرّكٍ واحد. صفحةٌ جديدة
      // بجانب المركز القائم لا بدلًا منه — لا حذف ولا تغيير لأيّ URL.
      { path: '/dashboard/data-reports', label: 'تقارير البيانات', icon: 'barChart3', roles: ['admin', 'warehouse_manager', 'storekeeper', 'inventory_auditor', 'finance_manager', 'purchase_officer', 'return_manager'] },
      // دفتر الذمم وكشوف الحساب (م٤-هـ): للمديرَين والمالي والخزينة.
      // موضعه «التقارير» لأنّ المالي والخزينة يريانها — ولا يريان «العمليات».
      { path: '/dashboard/partner-ledger', label: 'دفتر الذمم وكشوف الحساب', icon: 'dollarSign', roles: ['admin', 'warehouse_manager', 'finance_manager', 'treasury'] },
      // التواريخ المعدّلة (م٢-ج): موضعه «التقارير» لا «العمليات اليوميّة» —
      // فمدقّق الجرد والمالي لا يريان مجموعة العمليات أصلًا، وإدراجه هناك كان
      // يمنحهما اسمًا بلا باب. (أمسكه اختبار انحراف الصلاحيات.)
      { path: '/dashboard/date-integrity', label: 'التواريخ المعدّلة', icon: 'clipboardList', roles: ['admin', 'warehouse_manager', 'inventory_auditor', 'finance_manager'] },
      // غرفة قرار سلاسل الإمداد — المراجعة التنفيذية أمام المدير العام (عرض
      // من 9 شاشات؛ الفرعيات الثمان ترث صلاحية هذا العنصر عبر وراثة الأب في
      // pageAccess). حزمة ربط كوديكس 2026-08-07 — رابط واحد لا قائمة موازية.
      { path: '/dashboard/executive-review', label: 'غرفة قرار سلاسل الإمداد', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // صفحة REQ-006 مطلوبة كوجهة مستقلة في «عمليات البوابة»؛ تبقى داخل
      // غرفة القرار وظيفيًّا وترث نطاق المديرَين نفسه بلا توسيع للصلاحيات.
      { path: '/dashboard/executive-review/restaurants', label: 'خطة المطاعم والمقاهي', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // تقرير آليّة الربط بأودو والمزامنة الحيّة — مرجعٌ فنّيّ/إداريّ مبنيّ على الكود
      // (طبقة odoo · الوسيط · الموديول · فايربيز · عقد التكامل). يظهر تلقائيًّا في
      // «عمليات البوابة» لأنه يُولَّد من هذا الكتالوج نفسه.
      { path: '/dashboard/odoo-integration-report', label: 'تقرير الربط بأودو والمزامنة', icon: 'arrowLeftRight' },
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
      // حزمة المطابقة والتسليم لشركة الميزان (2026-08-02): شرح المرجع · قبول UAT ·
      // قيمة البوابة · أداء الموردين · سجلّ حركة الأدوار · استمرارية الأعمال.
      { path: '/dashboard/reference-guide', label: 'الشرح التفاعلي للمرجع', icon: 'bookOpen' },
      // مركز متطلبات شركة الميزان: قراءة تنفيذية للحزمة BFP-SCM-REQ-2026،
      // ومصفوفة القرار بين البوابة وأودو وسجلّ المسائل التي تنتظر الحسم.
      { path: '/dashboard/requirements-command', label: 'مركز متطلبات التكامل', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // مركز عروض القطاعات: عرض مستقل لكل قطاع يشرح الدورة المقترحة والأنظمة
      // والضوابط والقرارات المطلوبة، مع إبقاء حالات المواءمة معلنة بوضوح.
      { path: '/dashboard/sector-presentations', label: 'عروض أنظمة القطاعات', icon: 'grid', roles: ['admin', 'warehouse_manager'] },
      // اجتماع المكتب الهندسي: مراجعة المتطلبات والزيارة الميدانية والمخططات
      // ومشروعات الرحبة وفينسيا، مع مسار متابعة وقرارات إقفال.
      { path: '/dashboard/engineering-office-meeting', label: 'اجتماع المكتب الهندسي', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/acceptance-check', label: 'المطابقة والاستلام (UAT)', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/portal-value', label: 'لماذا البوابة تكامليّة لأودو', icon: 'grid', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/vendor-scorecard', label: 'بطاقة أداء الموردين', icon: 'users', roles: ['admin', 'warehouse_manager', 'purchase_officer', 'finance_manager'] },
      { path: '/dashboard/role-activity', label: 'سجلّ حركة الأدوار', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/business-continuity', label: 'استمرارية الأعمال (BCP)', icon: 'grid', roles: ['admin', 'warehouse_manager'] },
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
      { path: '/dashboard/meetings', label: 'الاجتماعات ومحاضرها', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // الأرشيف الدوريّ — المصدر الأوّل المعتمد للتقارير والمحاضر (رفعٌ حيّ + بذرة ثابتة).
      { path: '/dashboard/periodic-archive', label: 'الأرشيف الدوريّ', icon: 'archive', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/recruitment', label: 'التوظيف', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/users', label: 'إدارة المستخدمين', icon: 'users', roles: ['admin'] },
      { path: '/dashboard/access-control', label: 'الصلاحيات والأدوار', icon: 'users', roles: ['admin'] },
      // سياسات التشغيل (م١-ج): القرارات ٤–٧ إعداداتٌ لا شيفرة. للأدمن وحده —
      // مدير المستودع نفسه `overrideRole` في قرارين، فلو كتبها لوسّع صلاحيته.
      { path: '/dashboard/policy-settings', label: 'سياسات التشغيل', icon: 'clipboardList', roles: ['admin'] },
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
