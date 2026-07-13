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
};

/** الدور الافتراضي الآمن لمن لا ملف دور له بعد (أقل صلاحية). */
export const DEFAULT_ROLE = 'viewer';

/** يُعيد كائن الدور، أو الافتراضي إن كان المعرّف غير معروف. */
export function getRole(roleId) {
  return ROLES[roleId] || ROLES[DEFAULT_ROLE];
}

/** هل هذا الدور أدمن (يرى كل شيء)؟ */
export function isAdmin(roleId) {
  return roleId === 'admin';
}
