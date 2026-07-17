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
  odoo: 'دورات أودو والمحاكاة',
  reports: 'مركز التقارير',
  archive: 'الأرشيف والمرجعية',
  dept: 'طلبات الإدارات',
};

/**
 * الدور → المجموعات المسموح برؤيتها.
 * الأدمن (المدير العام) يرى كل شيء دائمًا ولا يحتاج إدراجًا.
 */
export const ROLE_NAV = {
  admin: ['daily', 'warehouses', 'odoo', 'reports', 'archive', 'dept'],
  warehouse_manager: ['daily', 'warehouses', 'odoo', 'reports', 'archive', 'dept'],
  storekeeper: ['daily', 'warehouses', 'odoo'],
  qc_inspector: ['daily', 'odoo', 'reports'],
  gate_officer: ['daily', 'odoo'],
  purchase_officer: ['daily', 'odoo', 'reports'],
  finance_manager: ['warehouses', 'odoo', 'reports'],
  return_manager: ['daily', 'warehouses', 'odoo'],
  inventory_auditor: ['warehouses', 'odoo', 'reports'],
  viewer: ['reports'],
  // دور مقيّد بالكامل — لا يرى أي مجموعة أخرى (الإلزام الحقيقي في AuthGate
  // عبر pageAccess.js؛ هذا فقط يمنع تسريب روابط أخرى في القائمة الجانبية).
  department_user: ['dept'],
};

/** هل يرى هذا الدور مجموعة القائمة؟ */
export function canSeeGroup(roleId, groupKey) {
  if (isAdmin(roleId)) return true;
  const allowed = ROLE_NAV[roleId] || ROLE_NAV[DEFAULT_ROLE];
  return allowed.includes(groupKey);
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
