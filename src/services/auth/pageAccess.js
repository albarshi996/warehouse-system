/**
 * أدوار محصورة بصفحات بعينها — عكس بقية الأدوار (تصل لكل الصفحات ويقيّد
 * navAccess.js عرض القائمة فقط). دور مذكور هنا لا يصل لأي رابط لوحة تحكم
 * غير المذكور في مصفوفته، حتى بكتابة الرابط مباشرة.
 *
 * غياب الدور من هذه الخريطة = بلا تقييد إطلاقًا (سلوك كل الأدوار الحالية
 * كما كان قبل هذا الملف).
 */
export const RESTRICTED_ROLE_PATHS = {
  department_user: [
    '/dashboard/hiring-requests',
    '/dashboard/tasks',
    '/dashboard/meeting-assistant',
    '/dashboard/wh-manager-eval',
  ],
  // دور «الحركة»: صفحة جرد المركبات وحدها — إسناد الدور لبريد جديد يفتح له
  // هذه الصفحة بالمشاهدة والتحرير، ولا شيء سواها.
  fleet: ['/dashboard/vehicles-inventory'],
};

/** المسارات المسموحة لدور مقيّد، أو null إن كان الدور غير مقيّد. */
export function restrictedAllowedPaths(roleId) {
  return RESTRICTED_ROLE_PATHS[roleId] || null;
}

/** هل يسمح دور هذا المستخدم بفتح هذا المسار؟ الأدوار غير المقيّدة: دائمًا نعم. */
export function isPathAllowed(roleId, pathname, base) {
  const allowed = restrictedAllowedPaths(roleId);
  if (!allowed) return true;
  return allowed.some((p) => pathname === `${base}${p}` || pathname.startsWith(`${base}${p}/`));
}
