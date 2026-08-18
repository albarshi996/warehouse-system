/**
 * أدوار بوابة العمليات — مبنية على مجموعات الأمان السبع في موديول
 * brandzo_warehouse + دور الأدمن (المدير العام) الذي يرى كل شيء.
 *
 * كل دور: المعرّف · الاسم العربي · رمز تعبيري · لون الشارة.
 * المصدر المرجعي للمصفوفة الكاملة (يرى ماذا / يفعل ماذا): ROADMAP.md §8 ركيزة 1.
 */
export const ROLES = {
  admin:             { id: 'admin',             label: 'المدير العام',     emoji: '👑', color: '#DAAA3C' },
  warehouse_manager: { id: 'warehouse_manager', label: 'مدير المستودع',    emoji: '🏢', color: '#c41e3a' },
  storekeeper:       { id: 'storekeeper',       label: 'أمين المخزن',      emoji: '📦', color: '#3b82f6' },
  qc_inspector:      { id: 'qc_inspector',      label: 'مفتّش الجودة',     emoji: '🔬', color: '#10b981' },
  gate_officer:      { id: 'gate_officer',      label: 'ضابط البوابة',     emoji: '🛡️', color: '#8b5cf6' },
  purchase_officer:  { id: 'purchase_officer',  label: 'موظف المشتريات',   emoji: '🛒', color: '#f59e0b' },
  finance_manager:   { id: 'finance_manager',   label: 'المدير المالي',    emoji: '💰', color: '#059669' },
  return_manager:    { id: 'return_manager',    label: 'مسؤول المرتجعات',  emoji: '↩️', color: '#ef4444' },
  inventory_auditor: { id: 'inventory_auditor', label: 'مدقّق الجرد',      emoji: '🔎', color: '#0ea5e9' },
  viewer:            { id: 'viewer',            label: 'مشاهد',            emoji: '👁️', color: '#6b7280' },
  department_user:   { id: 'department_user',   label: 'مستخدم إدارة',     emoji: '🏬', color: '#14b8a6' },
  fleet:             { id: 'fleet',             label: 'الحركة',           emoji: '🚚', color: '#f97316' },
  treasury:          { id: 'treasury',          label: 'أمين الخزينة',     emoji: '🏦', color: '#7c3aed' },
  labor_supervisor:  { id: 'labor_supervisor',  label: 'مشرف المناولة',    emoji: '📋', color: '#0d9488' },
  // ═══ الميدان (2026-08-09) ═══
  // المندوب ليس «أمين مخزنٍ بلا مبنى»: يبيع ويحصّل ويُرجع، وعهدته مركبةٌ تتحرّك.
  // ومشرفه هو من يعتمد فروقات التسوية — فلا يعتمد المندوب فرق نفسه.
  sales_rep:         { id: 'sales_rep',         label: 'مندوب المبيعات',   emoji: '🛵', color: '#0891b2' },
  sales_supervisor:  { id: 'sales_supervisor',  label: 'مشرف المبيعات',    emoji: '🗺️', color: '#4f46e5' },
  // ═══ قطاع الأغذية والمشروبات ‹FNB-107› (2026-08-18) ═══
  // من خلاصة خطة القطاع (أسطر 523–529): «F&B يحدّد الطلب والتشغيل»
  // و«الفروع تستلم وتستهلك و**تغذّي النظام بالبيانات الفعليّة**».
  // فالدوران ليسا مشاهدَين بأسماءٍ أرقّ: الأوّل **صاحب المدخل** (البراندات
  // والفروع والمنيو وخطط الافتتاح والحملات وتوقّع المبيعات)، والثاني
  // **مصدر بيانات** لا متلقٍّ فقط (الاستلام والاستهلاك والهدر والجرد المختصر).
  fnb_manager:       { id: 'fnb_manager',       label: 'مدير قطاع الأغذية', emoji: '🍽️', color: '#714B67' },
  branch_manager:    { id: 'branch_manager',    label: 'مدير الفرع',        emoji: '🏪', color: '#0e7490' },
  // ‹FNB-502 · ق-O05› الشيف التنفيذيّ يملك «الوصفات ومعايير الإنتاج» (سطر 525)
  // — أُضيف بالسلوك الافتراضيّ المعلَن في الخطة، والمدير معتمِدٌ أعلى.
  executive_chef:    { id: 'executive_chef',    label: 'الشيف التنفيذيّ',   emoji: '👨‍🍳', color: '#b45309' },
};

/**
 * ما يملكه مدير القطاع من مدخلاتٍ تشغيليّة ‹FNB-107› — المدخلات التسعة في
 * القسم «أولًا» من خطة القطاع. سجلٌّ معلَن لا شروطٌ مبثوثة: **ملكيّة المدخل
 * لا مجرّد وجود الحقل** — فمن يملك المنيو غير من يملك المخزن.
 */
export const FNB_OWNED_INPUTS = Object.freeze([
  'brands', 'branches', 'menu', 'openingPlans', 'campaigns',
  'salesForecast', 'operationalChanges', 'products', 'conceptRequirements',
]);

/** أدوار القطاع — من يقرأ شجرته وطلباته. */
export const FNB_ROLES = ['fnb_manager', 'branch_manager', 'executive_chef'];

/** الدور الافتراضي الآمن لمن لا ملف دور له بعد (أقل صلاحية). */
export const DEFAULT_ROLE = 'viewer';

/**
 * المديران — المصدر الواحد. كان مكرَّرًا يدويًّا في أربعة ملفات
 * (LogisticsDashboard · DocumentsInbox · OperationsMonitor · org-structure)
 * فوُحِّد هنا ضمن «العملية الجراحية» المحور ٢-ب.
 */
export const MANAGER_ROLES = ['admin', 'warehouse_manager'];

/** يُعيد كائن الدور، أو الافتراضي إن كان المعرّف غير معروف. */
export function getRole(roleId) {
  return ROLES[roleId] || ROLES[DEFAULT_ROLE];
}

/** هل هذا الدور أدمن (يرى كل شيء)؟ */
export function isAdmin(roleId) {
  return roleId === 'admin';
}
