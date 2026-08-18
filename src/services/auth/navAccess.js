/**
 * «من يرى ماذا» — خريطة الأدوار إلى مجموعات القائمة الجانبية.
 *
 * هذا هو **المصدر الوحيد** لتقييد القائمة. لتغيير ما يراه أي دور، عدّل
 * `ROLE_NAV` أدناه فقط — لا شيء آخر.
 *
 * ملاحظة أمنية: هذا تقييد على مستوى العرض (UX). الإلزام الحقيقي يبقى في
 * الحرّاس الستة في موديول أودو + قواعد أمان Firestore.
 * المرجع: ROADMAP.md §8 ركيزة 1.
 */
import { isAdmin, DEFAULT_ROLE } from './roles.js';

/** مفاتيح مجموعات القائمة (تطابق `key` في DashboardLayout). */
export const NAV_GROUP_LABELS = {
  daily: 'العمليات اليومية',
  warehouses: 'المستودعات والجرد',
  fleet: 'إدارة الحركة',
  field: 'الميدان والبيع من المركبة',
  odoo: 'دورات أودو والمحاكاة',
  reports: 'مركز التقارير',
  archive: 'الأرشيف والمرجعية',
  dept: 'طلبات الإدارات',
  procurement: 'المشتريات الداخلية',
};

/**
 * الدور → المجموعات المسموح برؤيتها.
 * الأدمن (المدير العام) يرى كل شيء دائمًا ولا يحتاج إدراجًا.
 */
export const ROLE_NAV = {
  admin: ['daily', 'warehouses', 'fleet', 'field', 'odoo', 'reports', 'archive', 'dept', 'procurement'],
  warehouse_manager: ['daily', 'warehouses', 'fleet', 'field', 'odoo', 'reports', 'archive', 'dept', 'procurement'],
  storekeeper: ['daily', 'warehouses', 'odoo'],
  qc_inspector: ['daily', 'odoo', 'reports'],
  // ‹EXE-602› ضابط البوابة يدخل «إدارة الحركة» — فيها تبويب الساحة والأبواب.
  // كان الدور قائمًا منذ البداية **بلا نظامٍ يخدمه**: يوقّع تصاريح الخروج ولا
  // يملك شاشةً يسجّل فيها وصولًا ولا بابًا ولا انتظارًا. وهو نفس نمط
  // `labor_supervisor` أدناه: مجموعةٌ كاملة، والحسّاس فيها محصورٌ ببنوده.
  gate_officer: ['daily', 'odoo', 'fleet'],
  // موظف المشتريات: يوفّر العروض ويصدر الأمر ويسلّم في دورة المشتريات الداخلية.
  purchase_officer: ['daily', 'odoo', 'reports', 'procurement'],
  // المدير المالي: يعتمد الطلب والترسية والأمر والصرف في الدورة.
  finance_manager: ['warehouses', 'odoo', 'reports', 'procurement'],
  return_manager: ['daily', 'warehouses', 'odoo'],
  inventory_auditor: ['warehouses', 'odoo', 'reports'],
  viewer: ['reports'],
  // مستخدم الإدارة (الجهة الطالبة/المستفيد): طلبات الإدارات + إصدار طلب المشتريات.
  department_user: ['dept', 'procurement'],
  // دور «الحركة»: مجموعة إدارة الحركة وحدها (مقيّد بصفحة جرد المركبات في pageAccess.js).
  fleet: ['fleet'],
  // أمين الخزينة: دورٌ مركّز على صرف قيمة أوامر الشراء في الدورة وحدها.
  treasury: ['procurement'],
  // مشرف المناولة: لوحة عمالة الشحن/التفريغ ضمن إدارة الحركة.
  labor_supervisor: ['fleet'],
  // مندوب المبيعات: مجموعة الميدان وحدها. **لا `fleet`** — وإلّا رأى مركز
  // الصيانة وعمالة الشحن وجرد المركبات، ولا شأن له بها. مجموعةٌ مستقلّة أنظف
  // من تقييد كلّ بندٍ في «إدارة الحركة» على حدة، وهي موضع ما سيأتي من الميدان
  // (خطّة الزيارات · الخريطة · المستهدفات).
  sales_rep: ['field'],
  // مشرف المبيعات: الميدان + التقارير، فهو من يعتمد فروقات التسوية ويقرأ الأداء.
  sales_supervisor: ['field', 'reports'],
  // ═══ قطاع الأغذية والمشروبات ‹FNB-107› ═══
  // مدير القطاع **صاحب المدخل**: يُدخل شجرته (الأبعاد التنظيميّة في
  // «التقارير») ويقرأ طلبات فروعه واستهلاكها. **لا `warehouses`**: لا يقيّد
  // حركةً ولا يعتمد صرفًا — نفس منطق حصر المندوب في «الميدان».
  fnb_manager: ['reports', 'daily'],
  // مدير الفرع **مصدر بيانات**: يطلب ويستلم ويسجّل الهدر والجرد المختصر —
  // العمليّات اليوميّة وحدها، ولا يرى تقارير القطاع المجمَّعة.
  branch_manager: ['daily'],
};

/** هل يرى هذا الدور مجموعة القائمة؟ */
export function canSeeGroup(roleId, groupKey) {
  if (isAdmin(roleId)) return true;
  const allowed = ROLE_NAV[roleId] || ROLE_NAV[DEFAULT_ROLE];
  return allowed.includes(groupKey);
}

/** المجموعات التي يراها هذا الدور (الأدمن: كلّها). */
export function groupsFor(roleId) {
  if (isAdmin(roleId)) return [...ROLE_NAV.admin];
  return [...(ROLE_NAV[roleId] || ROLE_NAV[DEFAULT_ROLE])];
}

/**
 * هل يرى هذا الدور **لوحة التحكم الرئيسية**؟
 *
 * الدور «المركّز» (يرى مجموعة واحدة فقط — مثل «الحركة» و«مستخدم إدارة»
 * و«المشاهد») يذهب مباشرة إلى صفحة عمله بدل لوحة مليئة ببطاقات لا يفتحها.
 * هذا يحفظ السلوك الذي كان مفروضًا يدويًّا قبل تدقيق 23.07، ويعمّمه على كل
 * دور مركّز بدل ذكر دورين بالاسم.
 */
export function canSeeHome(roleId) {
  return groupsFor(roleId).length > 1;
}

/**
 * هل يرى هذا الدور عنصرًا محصورًا بأدوار بعينها؟
 * `itemRoles` فارغة/غائبة ⇒ العنصر متاح لكل من يرى مجموعته.
 */
export function canSeeItem(roleId, itemRoles) {
  if (isAdmin(roleId)) return true;
  if (!itemRoles || itemRoles.length === 0) return true;
  return itemRoles.includes(roleId);
}
