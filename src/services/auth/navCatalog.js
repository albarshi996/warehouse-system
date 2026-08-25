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
      // ‹تدقيق 24.08› اسمها كان «متابعة العمليات» — عامٌّ يوهم بلوحةٍ ثانية،
      // وهي في الحقيقة منظارُ الجرد: العمليّات الجارية ومن يعمل عليها وسجلّ
      // المسح لحظيًّا. اللوحة الرئيسة واحدة (`command-center`، قرار المالك).
      { path: '/dashboard/operations', label: 'متابعة الجرد والمسح الحيّ', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
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
      // التخزين والسحب الموجّه (LOC-202): استيراد أوامر المصدر ← معاينة ←
      // مستند. مقصورٌ على من يملك اعتماد الاستيراد — لا يراه أمين المخزن.
      // خريطة المواقع **مرجعٌ عامّ** لا أداةُ توجيه: قيس نقلُها إلى
      // «التخزين الموجّه» فأسقطها عن الماليّ ومسؤول المرتجعات والشيف — فبقيت.
      { path: '/dashboard/warehouses', label: 'المستودعات', icon: 'package' },
      { path: '/dashboard/stock-ledger', label: 'دفتر حركات المخزون', icon: 'clipboardList' },
      // ‹CAP-501› مطابقة المخزون: توصل محرّك `reconcile` الذي بُني ومُختبِر
      // وبقي بلا مستدعٍ واحد. شاشةٌ مستقلّةٌ عن صفحة الجرد بقرار المالك ق-٦
      // («صفحة الجرد للجرد»)، وموضعها بعد الدفتر: الحركةُ تُقيَّد ثمّ تُطابَق.
      // لمدقّق الجرد كما للمديرَين — وهو صاحبها الأوّل.
      { path: '/dashboard/stock-reconcile', label: 'مطابقة المخزون', icon: 'arrowLeftRight', roles: ['admin', 'warehouse_manager', 'inventory_auditor'] },
      // التقارير التفصيليّة — موضعٌ ثانٍ لأمين المخزن ومسؤول المرتجعات: تقارير
      // المخزون تخصّهما، وهما لا يريان مجموعة «التقارير». والصلاحية اتحادُ المواضع.
      { path: '/dashboard/data-reports', label: 'التقارير التفصيليّة', icon: 'barChart3', roles: ['storekeeper', 'return_manager'] },
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
      // ‹تدقيق 24.08› كانت «لوحة سلاسل الإمداد» — والاسم يوحي بلوحةٍ جامعة
      // بينما مضمونها الأسطولُ وأوامرُ الشغل والعُهد وتنبيهاتُ الصلاحية.
      { path: '/dashboard/supply-chain', label: 'الأسطول والعُهد وأوامر الشغل', icon: 'truck', roles: ['admin', 'warehouse_manager'] },
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
      // ماستر المندوبين (SAP-21): منه تنبثق قوائم «المندوب» في المستندات.
      { path: '/dashboard/sales-reps', label: 'المندوبون', icon: 'users', roles: ['admin', 'warehouse_manager', 'sales_supervisor'] },
      { path: '/dashboard/price-lists', label: 'قوائم الأسعار', icon: 'clipboardList', roles: ['admin', 'warehouse_manager', 'sales_supervisor'] },
      { path: '/dashboard/field-operations', label: 'يوم المندوب', icon: 'mapPin', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      { path: '/dashboard/van-operations', label: 'المستودع المتنقّل', icon: 'truck', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      { path: '/dashboard/customer-stock', label: 'بضاعة العملاء', icon: 'package', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      // المندوب يرى مستهدفاته وحدها (تصفيةٌ داخل الجزيرة)؛ والمشرف يرى الكلّ ويُعرّف.
      { path: '/dashboard/targets', label: 'المستهدفات', icon: 'barChart3', roles: ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'] },
      // العروض يضعها المشرف والمديران؛ المندوب لا يُعرّفها — يُطبّقها النظام عليه.
      { path: '/dashboard/promotions', label: 'العروض الترويجية', icon: 'dollarSign', roles: ['admin', 'warehouse_manager', 'sales_supervisor'] },
      // دفتر الذمم (CC-302): المندوب محصِّلٌ يُحاسَب على ذمم عملائه — يراها من
      // مجموعته هو («الميدان») لا من «التقارير» التي لا يراها أصلًا: نفس المسار
      // في مجموعتين نمطٌ قائم (الخزينة والتقارير)، والبديل اسمٌ بلا باب.
      { path: '/dashboard/partner-ledger', label: 'ذمم عملائي وكشوفهم', icon: 'dollarSign', roles: ['sales_rep'] },
    ],
  },
  {
    /**
     * التخزين الموجّه ‹LOC› — تطبيقُ الرفّ والعامل (طلب المالك 2026-08-24).
     *
     * كان مبعثرًا في ثلاثة مواضع: **خريطةُ المواقع** في «المستودعات والجرد»،
     * و**عمالةُ المناولة** في «إدارة الحركة»، و**شاشةُ العامل** مدفونةً داخل
     * لوحةٍ إداريّة بلا رابطٍ لها أصلًا. واسمُ «التخزين والسحب الموجّه» كان
     * على **صندوق استيراد شيت** لا على توجيهٍ لعامل.
     *
     * فجُمعت في تطبيقٍ واحد: تُعرَّف الرفوف ← تُرسم الخريطة ← يُوجَّه العامل.
     * ولم تُحذف صفحةٌ ولا تغيّر رابط — نُقلت مداخلُها إلى بيتها.
     */
    key: 'putaway',
    group: 'التخزين الموجّه',
    emoji: '🏷️', icon: 'mapPin',
    items: [
      // ‹LOC-402› «مهامي» أوّلَ المجموعة: هي **شاشة العامل** — يفتحها ويعمل.
      // كانت مدفونةً داخل لوحة عمالة الشحن بلا رابطٍ لها، وهي مصمّمةٌ للهاتف
      // أوّلًا. وضابطُ البوّابة وأمينُ المخزن ينفّذان مهامَّ بنودٍ أيضًا.
      { path: '/dashboard/my-tasks', label: 'مهامي — تنفيذ التخزين والسحب', icon: 'checkSquare', roles: ['admin', 'warehouse_manager', 'labor_supervisor', 'storekeeper', 'gate_officer'] },
      // ‹LOC› البانية: تصف المدى مرّةً فيُولَّد الكامل — ٢٤٠٠ موقعٍ كانت تُكتب
      // بالقلم فلا تُكتب، فيبقى المخزون بلا مواقع ولا يعمل التوجيه أصلًا.
      { path: '/dashboard/location-builder', label: 'بانية مواقع التخزين', icon: 'layers', roles: ['admin', 'warehouse_manager'] },
      // ‹LOC› إسناد الأصناف: بعد تعريف الرفوف يُقال **أين كلّ صنف**. تقرأ
      // ورقة الأرصدة بالمستورد القائم — والمضاف حارسُ الموقع: رفٌّ لا وجود
      // له يُوقف الاعتماد قبل أن يصير رصيدًا لا يجده أحد.
      { path: '/dashboard/bin-assignment', label: 'إسناد الأصناف إلى المواقع', icon: 'package', roles: ['admin', 'warehouse_manager', 'inventory_auditor'] },
      // ‹LOC-303› خطّة السحب: توصل `pickPlan` المبنيّ المهجور — موقعُ كلّ بندٍ
      // ومسارٌ مرتَّبٌ بالمشي. لأمين المخزن أوّلًا: هو من يمشيه.
      { path: '/dashboard/pick-plan', label: 'خطّة السحب والمسار', icon: 'mapPin', roles: ['admin', 'warehouse_manager', 'storekeeper', 'labor_supervisor', 'inventory_auditor'] },
      { path: '/dashboard/directed-storage', label: 'استيراد مستندات المصدر', icon: 'fileUp', roles: ['admin', 'warehouse_manager', 'inventory_auditor'] },
      { path: '/dashboard/labor-operations', label: 'عمالة الشحن والتفريغ', icon: 'users', roles: ['admin', 'warehouse_manager', 'labor_supervisor'] },
    ],
  },
  {
    /**
     * قطاع الأغذية والمشروبات ‹FNB› — بيتُ شاشاته (قرار المالك 2026-08-24).
     *
     * كُشف في تدقيق 24.08 أنّ للقطاع **ثلاث عشرة قدرةً مبنيّةً ومختبَرة** بلا
     * شاشةٍ واحدة: طلبُ الفرع والطلبُ المجمَّع والإغلاقُ اليوميّ وتكلفةُ الطعام
     * ومبيعاتُ نقطة البيع والوصفاتُ وتخصيصُ الإنتاج وإعادةُ التوازن وبرجُ
     * القطاع… منطقٌ كاملٌ لا يراه أحد. فقرّر المالك: «نريد جعله شاشات منطقيّة».
     *
     * ولماذا مجموعةٌ جديدة لا إلحاقٌ بقائمة؟ لأنّ صاحبَيه — مدير القطاع
     * والشيف التنفيذيّ — يريان مجموعتين **مختلفتين** (`daily` و`warehouses`)،
     * فإلحاقُ الشاشة بإحداهما يحجبها عن الآخر أو يوسّع صلاحيّته في مجموعةٍ
     * كاملةٍ لا تخصّه. والمجموعة تستوعب الشاشات الأربع القادمة بلا إزاحة.
     */
    key: 'fnb',
    group: 'قطاع الأغذية',
    emoji: '🍽️', icon: 'factory',
    items: [
      // الوصفة أساسُ القطاع: الإنتاج يفجّرها، والتكلفة تُحسب منها، والتخصيص
      // على الفروع يحتاجها. فهي أولى الشاشات لا إحداها.
      { path: '/dashboard/recipes', label: 'دفتر الوصفات', icon: 'notebook', roles: ['admin', 'warehouse_manager', 'fnb_manager', 'executive_chef'] },
      // ‹FNB-302› طلب الفرع: **مدير الفرع صاحبه الأوّل** — هو من يطلب. ولا
      // يُدرَج له برجُ القطاع لاحقًا (تقاريرُ مجمَّعةٌ ليست له)، فالحصر ببنوده
      // لا بالمجموعة — نفس نمط «إدارة الحركة» مع مشرف المناولة.
      { path: '/dashboard/branch-order', label: 'طلب الفرع', icon: 'shoppingCart', roles: ['admin', 'warehouse_manager', 'fnb_manager', 'branch_manager'] },
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
      // تقارير البيانات: **تسعة عشر تقريرًا** على محرّكٍ واحد (٦ مخزون +
      // ٦ حسابات + ٧ تشغيليّة بعد SAP-14). صفحةٌ بجانب المركز القائم لا
      // بدلًا منه. ومشرف المبيعات أُضيف (تقريرا المندوبين والمبيعات له).
      { path: '/dashboard/data-reports', label: 'التقارير التفصيليّة (19)', icon: 'barChart3', roles: ['admin', 'warehouse_manager', 'storekeeper', 'inventory_auditor', 'finance_manager', 'purchase_officer', 'return_manager', 'sales_supervisor'] },
      // دفتر الذمم وكشوف الحساب (م٤-هـ): للمديرَين والمالي والخزينة —
      // وللمندوب (CC-302): المحصِّلُ يُحاسَب على ذمم عملائه فيجب أن يراها قبل
      // أن يبيع (وهو نصّ فلسفة قاعدة partner_ledger نفسها: القراءة لكلّ مصادَق).
      // موضعه «التقارير» لأنّ المالي والخزينة يريانها — ولا يريان «العمليات».
      { path: '/dashboard/partner-ledger', label: 'دفتر الذمم وكشوف الحساب', icon: 'dollarSign', roles: ['admin', 'warehouse_manager', 'finance_manager', 'treasury', 'sales_rep'] },
      // التواريخ المعدّلة (م٢-ج): موضعه «التقارير» لا «العمليات اليوميّة» —
      // فمدقّق الجرد والمالي لا يريان مجموعة العمليات أصلًا، وإدراجه هناك كان
      // يمنحهما اسمًا بلا باب. (أمسكه اختبار انحراف الصلاحيات.)
      { path: '/dashboard/date-integrity', label: 'التواريخ المعدّلة', icon: 'clipboardList', roles: ['admin', 'warehouse_manager', 'inventory_auditor', 'finance_manager'] },
      // الأبعاد التنظيمية (CC-401): سيّد المواقع (م٦-أ) يُدار من شاشةٍ واحدة —
      // قطاع›براند›فرع›مركز تكلفة، والتكلفة تصعد الشجرة. موضعه «التقارير» لأنّ
      // الماليّ صاحبه الأوّل — ولا يرى «العمليات» أصلًا (درس اسمٍ بلا باب).
      // ‹FNB-107› مدير القطاع يملك المدخل (البراندات والفروع) فيرى شجرته ويُدخلها.
      { path: '/dashboard/org-dimensions', label: 'الأبعاد التنظيمية والتكلفة', icon: 'workflows', roles: ['admin', 'warehouse_manager', 'finance_manager', 'fnb_manager'] },
      // تقرير آليّة الربط بأودو والمزامنة الحيّة — مرجعٌ فنّيّ/إداريّ مبنيّ على الكود
      // (طبقة odoo · الوسيط · الموديول · فايربيز · عقد التكامل). يظهر تلقائيًّا في
      // «عمليات البوابة» لأنه يُولَّد من هذا الكتالوج نفسه.
      { path: '/dashboard/odoo-integration-report', label: 'تقرير الربط بأودو والمزامنة', icon: 'arrowLeftRight' },
      // لوحة اللوجستيات التنفيذيّة (المرحلة ٤) — قمرةٌ جامعةٌ بمكوّنات أودو تجمّع
      // مؤشّرات المخزون والعمليّات والسلاسل في نظرةٍ واحدة. للمديرَين كلوحةٍ إدارية.
      { path: '/dashboard/logistics-dashboard', label: 'قمرة اللوجستيات (أودو)', icon: 'gauge', roles: ['admin', 'warehouse_manager'] },
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
      { path: '/dashboard/global-doc-cycles', label: 'الدورات المستندية العالمية', icon: 'bookOpen' },
      // حزمة المطابقة والتسليم لشركة الميزان (2026-08-02): شرح المرجع · قبول UAT ·
      // قيمة البوابة · أداء الموردين · سجلّ حركة الأدوار · استمرارية الأعمال.
      { path: '/dashboard/reference-guide', label: 'الشرح التفاعلي للمرجع', icon: 'bookOpen' },
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
    /**
     * العروض والاجتماعات — ما تُدار به جلسةٌ أمام أناس، لا ما يُقرأ كتقرير.
     *
     * كانت هذه الإحدى عشرة داخل «مركز التقارير» فبلغ خمسةً وثلاثين عنصرًا —
     * ثلاثةَ أجناسٍ في سلّة: تقريرٌ يقرأ بيانات النظام، وعرضٌ لجلسةٍ بعينها،
     * ومرجعٌ ثابت. فصار المركز موضعَ كلِّ ما لا يُعرف أين يوضع.
     *
     * الفرق عمليّ لا ذوقيّ: التقرير يُفتح ليُجاب سؤالٌ عن الحال الآن، والعرض
     * يُفتح مرّةً في اجتماعٍ ثمّ يبقى شاهدًا على ما عُرض. خلطُهما يُغرق
     * الأوّل بالثاني.
     *
     * كلّها محصورةٌ بالمديرَين (والماليّ في عرض جلسته) — فالنقل لم يكسب دورًا
     * ولم يُفقده شيئًا، ولم يتغيّر رابطٌ واحد.
     */
    key: 'presentations',
    group: 'العروض والاجتماعات',
    emoji: '🎦', icon: 'bookOpen',
    items: [
      // غرفة قرار سلاسل الإمداد — المراجعة التنفيذية أمام المدير العام (عرض
      // من 9 شاشات؛ الفرعيات الثمان ترث صلاحية هذا العنصر عبر وراثة الأب في
      // pageAccess). حزمة ربط كوديكس 2026-08-07 — رابط واحد لا قائمة موازية.
      { path: '/dashboard/executive-review', label: 'غرفة قرار سلاسل الإمداد', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // صفحة REQ-006 مطلوبة كوجهة مستقلة في «عمليات البوابة»؛ تبقى داخل
      // غرفة القرار وظيفيًّا وترث نطاق المديرَين نفسه بلا توسيع للصلاحيات.
      { path: '/dashboard/executive-review/restaurants', label: 'خطة المطاعم والمقاهي', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // مركز عروض القطاعات: عرض مستقل لكل قطاع يشرح الدورة المقترحة والأنظمة
      // والضوابط والقرارات المطلوبة، مع إبقاء حالات المواءمة معلنة بوضوح.
      { path: '/dashboard/sector-presentations', label: 'عروض أنظمة القطاعات', icon: 'grid', roles: ['admin', 'warehouse_manager'] },
      // «سلاسل الإمداد — المطاعم»: عرض المطاعم أُخرج من مركز عروض القطاعات
      // ليقف تقريرًا مستقلًّا يُدار به اجتماع القطاع — دورة العمل والدورة
      // المستندية موصولةً بشاشاتها، ومنتهيةً بطلبٍ موحَّد لشركة تنفيذ أودو.
      // (المحتوى يُستدعى من `sector-presentations.js` نفسه — لا نسخة ثانية.)
      { path: '/dashboard/restaurants-supply-chain', label: 'سلاسل الإمداد — المطاعم', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // «الدورة المستندية — السلاسل والمشتريات»: عرض اجتماع الإدارة المالية —
      // الحدّ بين الإدارتين (المشتريات تتبع المالية)، ودورة الشراء بحلقاتها،
      // والمطابقة الثلاثية، واثنا عشر سيناريو يُفسد الدورة ولكلٍّ حارسٌ مبنيّ.
      // المدير المالي مُدرَجٌ عمدًا: الجلسة معه، والعرض يُفتح أمامه لا عنه.
      { path: '/dashboard/finance-procurement-meeting', label: 'الدورة المستندية — السلاسل والمشتريات', icon: 'clipboardList', roles: ['admin', 'warehouse_manager', 'finance_manager'] },
      // «الهوية التشغيلية للمستودعات»: تقرير التسويق البصريّ معروضًا قسمًا
      // بقسم (٢٦ قسمًا · ٤٤٢ نموذجًا) بتنقّلٍ وفهرسٍ وملء شاشة — لا محتوى
      // مؤلَّفًا فوقه. تُفتح أمام التسويق في الجلسة المشتركة.
      { path: '/dashboard/warehouse-identity-meeting', label: 'الهوية التشغيلية للمستودعات', icon: 'mapPin', roles: ['admin', 'warehouse_manager'] },
      // المراجعة التنفيذية لسلاسل الإمداد [Codex ثم أعاد Claude بناءها بقرار
      // المالك]: عرض محطات «من المتابعة إلى القرار» — لوحة المدير العام،
      // القرارات بأثرَيها، المواقع (155 + الرحبة)، الكتالوج التشغيلي،
      // ونموذج مكاتب الإدارات — عرض وحفظ محلّيّ فقط.
      { path: '/dashboard/general-manager-operations-briefing', label: 'المراجعة التنفيذية لسلاسل الإمداد', icon: 'target', roles: ['admin', 'warehouse_manager'] },
      // اجتماع المكتب الهندسي: مراجعة المتطلبات والزيارة الميدانية والمخططات
      // ومشروعات الرحبة وفينسيا، مع مسار متابعة وقرارات إقفال.
      { path: '/dashboard/engineering-office-meeting', label: 'اجتماع المكتب الهندسي', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // اجتماع شركة نوفا (NOV-OPS-001): خطة جرد فرعي بنغازي وطرابلس وتفعيل
      // دورات النقل والبيع وتحميل المندوبين — عرضٌ حيٌّ تُدار به الجلسة، وفي كل
      // خطوةٍ بطاقةُ اختصارٍ تفتح الشاشة التي تُنفَّذ فيها داخل البوابة.
      { path: '/dashboard/nova-inventory-meeting', label: 'اجتماع شركة نوفا — الجرد والنقل', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // مركز متطلبات شركة الميزان: قراءة تنفيذية للحزمة BFP-SCM-REQ-2026،
      // ومصفوفة القرار بين البوابة وأودو وسجلّ المسائل التي تنتظر الحسم.
      { path: '/dashboard/requirements-command', label: 'مركز متطلبات التكامل', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // حزمة الاستعداد للمقابلة — القمرة الجامعة (٦ مكوّنات) للبروفة قبل تقييم
      // ديلويت، بأرقامٍ حيّة من الدراسة (استعداد ديلويت — اليوم 5).
      { path: '/dashboard/interview-readiness', label: 'حزمة الاستعداد — البروفة', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
    ],
  },
  {
    key: 'archive',
    group: 'الأرشيف والمرجعية',
    emoji: '🗄️', icon: 'archive',
    items: [
      { path: '/dashboard/org-structure', label: 'الهيكل التنظيمي', icon: 'users', roles: ['admin', 'warehouse_manager'] },
      { path: '/dashboard/meetings', label: 'الاجتماعات ومحاضرها', icon: 'clipboardList', roles: ['admin', 'warehouse_manager'] },
      // اجتماع الموارد البشرية: شرائح دليل الإدارة `BFP-SCM-MAN-2026-053`
      // نفسها — خمس عشرة شريحة بترتيب محاور الاجتماع (التوظيف · الهيكل ·
      // السياسات · العقوبات · الترقية · الجوائز · التوثيق في البوابة).
      // يظهر تلقائيًّا في «عمليات البوابة» لأنّه يُولَّد من هذا الكتالوج.
      { path: '/dashboard/hr-meeting', label: 'اجتماع الموارد البشرية', icon: 'users', roles: ['admin', 'warehouse_manager'] },
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
