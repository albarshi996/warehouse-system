/**
 * آلة حالات «احتياجات الموقع» — منطقٌ خالصٌ مستقلّ.
 *
 * ═══ لماذا ملفٌّ مستقلٌّ لا `documents/states.js` المشتركة؟ ═══
 * لأنّ هذه الشاشة تحتاج حالةَ **«قيد التنفيذ»** (`in_progress`)، وهي غيرُ
 * موجودةٍ في `states.js` المشتركة التي تخدم ٦٠+ نوعَ مستندٍ وقواعدَ أمنٍ.
 * فإضافةُ حالةٍ هناك تمسّ كلَّ تلك الأنواع — إفسادٌ عالي المخاطرة. فهذه
 * **نسخةُ شكلٍ** من `states.js` (STATES + TRANSITIONS + canDo) بلا استيرادها
 * ولا لمسِها: مجموعةُ Firestore خاصّةٌ (`site_needs`) وحالاتٌ خاصّةٌ بها.
 *
 * الرسم:
 *   جديد → معتمَد → قيد التنفيذ → منجَز
 *     ↓
 *   مرفوض
 *
 * والحالتان الختاميّتان (`done`/`rejected`) نهائيّتان: لا نقلةَ بعدهما،
 * ولا سبيلَ من «جديد» إلى «منجَز» مباشرةً — التنفيذ يمرّ بالاعتماد ثمّ البدء.
 *
 * ═══ الصلاحيّات ═══
 * الاعتماد/الرفض للمديرَين (admin · warehouse_manager)؛ والبدء/الإنهاء
 * لهما ولأمين المخزن (storekeeper) — فهو من ينفّذ احتياجَ الموقع ميدانيًّا.
 * والقاعدةُ مفروضةٌ في ثلاث طبقات (الواجهة · الخدمة · `firestore.rules`)،
 * الثلاث تقرأ هذا الجدول نفسَه.
 */

/** أدوار الاعتماد والرفض — تطابق `firestore.rules` (عدّلهما معًا). */
export const APPROVER_ROLES = ['admin', 'warehouse_manager'];

/** أدوار التنفيذ (البدء والإنهاء) — تطابق `firestore.rules`. */
export const EXECUTOR_ROLES = ['admin', 'warehouse_manager', 'storekeeper'];

/** من يسجّل احتياجًا جديدًا — تطابق `firestore.rules`. */
export const REQUESTER_ROLES = ['admin', 'warehouse_manager', 'storekeeper'];

/**
 * الحالات الخمس. الشكلُ كـ`states.js`: id · label · لونٌ للنقطة · أيقونةٌ
 * خطّيّة (من مكتبة `Icon`) · `variant` لشارة أودو. **الأحمر للرفض وحده**
 * (تحذير)، والبقيّة محايدةٌ/خضراء.
 */
export const NEED_STATES = {
  new: { id: 'new', label: 'جديد', color: '#6b7280', icon: 'clipboardList', variant: 'draft' },
  approved: { id: 'approved', label: 'معتمَد', color: '#1b6ec2', icon: 'checkCircle', variant: 'progress' },
  in_progress: { id: 'in_progress', label: 'قيد التنفيذ', color: '#8a6d1b', icon: 'activity', variant: 'warn' },
  done: { id: 'done', label: 'منجَز', color: '#146c43', icon: 'checkSquare', variant: 'done' },
  rejected: { id: 'rejected', label: 'مرفوض', color: '#b02a37', icon: 'close', variant: 'danger' },
};

export const INITIAL_STATE = 'new';

/** الحالات المنتهية: لا نقلةَ بعدها. */
export const TERMINAL_STATES = ['done', 'rejected'];

/**
 * فئات الاحتياج — حقلٌ جديدٌ خاصٌّ بهذه الشاشة (ليس في محرّك المستندات).
 */
export const NEED_CATEGORIES = {
  spare_parts: { id: 'spare_parts', label: 'قطع غيار' },
  packaging: { id: 'packaging', label: 'مواد تعبئة' },
  tools: { id: 'tools', label: 'أدوات' },
  maintenance: { id: 'maintenance', label: 'صيانة' },
  other: { id: 'other', label: 'أخرى' },
};

/**
 * النقلات المسموحة. لكلّ نقلة:
 *   to        — الحالة الهدف
 *   label     — نصّ الزرّ
 *   by        — مفتاح الصلاحيّة (approve | execute)
 *   roles     — الأدوار التي تملكها (الأدمن يملك كلَّ شيء دائمًا)
 *   needsNote — هل تُلزِم بسببٍ مكتوب (الرفض يُلزِم دائمًا)
 */
export const TRANSITIONS = {
  new: [
    { to: 'approved', label: 'اعتماد', by: 'approve', roles: APPROVER_ROLES },
    { to: 'rejected', label: 'رفض', by: 'approve', roles: APPROVER_ROLES, needsNote: true },
  ],
  approved: [
    { to: 'in_progress', label: 'بدء التنفيذ', by: 'execute', roles: EXECUTOR_ROLES },
  ],
  in_progress: [
    { to: 'done', label: 'إنهاء التنفيذ', by: 'execute', roles: EXECUTOR_ROLES },
  ],
  done: [],
  rejected: [],
};

/** يُعيد كائن الحالة، أو الحالة الابتدائيّة إن كان المعرّف غير معروف. */
export function getNeedState(stateId) {
  return NEED_STATES[stateId] || NEED_STATES[INITIAL_STATE];
}

/** هل الحالة منتهية؟ */
export function isTerminal(stateId) {
  return TERMINAL_STATES.includes(stateId);
}

/** هل النقلة من→إلى مشروعةٌ في الجدول؟ (تحقّقٌ مستقلٌّ عن الدور) */
export function isLegalTransition(from, to) {
  return (TRANSITIONS[from] || []).some((t) => t.to === to);
}

/**
 * هل يملك هذا الدور هذه النقلة؟ الأدمن يملك كلَّ شيء (يرى ويفعل كلَّ شيء).
 */
export function canDo(transition, role) {
  if (role === 'admin') return true;
  return Array.isArray(transition?.roles) && transition.roles.includes(role);
}

/** هل يجوز لهذا الدور نقلُ احتياجٍ من→إلى؟ (شرعيّةٌ + صلاحيّة) */
export function canTransition(from, to, role) {
  const t = (TRANSITIONS[from] || []).find((x) => x.to === to);
  return Boolean(t) && canDo(t, role);
}

/** النقلات المتاحة فعليًّا لهذا الدور على حالةٍ بعينها. */
export function availableTransitions(stateId, role) {
  return (TRANSITIONS[stateId] || []).filter((t) => canDo(t, role));
}

/** هل يملك هذا الدور تسجيلَ احتياجٍ جديد؟ */
export function canCreateNeed(role) {
  return role === 'admin' || REQUESTER_ROLES.includes(role);
}

/** هل يملك هذا الدور اعتمادَ/رفضَ الاحتياجات؟ (للعرض في الواجهة) */
export function canReviewNeeds(role) {
  return role === 'admin' || APPROVER_ROLES.includes(role);
}
