/**
 * آلة حالات المستند — من يملك تحريكه، وإلى أين.
 *
 * لماذا ملف مستقلّ؟ لأن هذه القواعد تُفرَض في **ثلاث طبقات**:
 *   1. الواجهة (تُخفي الزرّ) — من هنا.
 *   2. الخدمة (ترفض النقلة) — من هنا.
 *   3. قواعد أمان Firestore (لا تُتجاوَز حتى برمجيًّا) — انظر firestore.rules.
 * الطبقتان الأوليان تجربةُ مستخدم؛ الثالثة هي الحارس. تبقى الثلاث متسقة
 * لأنها تقرأ نفس الجدول أدناه.
 *
 * الرسم:
 *   مسودّة ⇄ مرفوض
 *      ↓
 *   مُرسَل → معتمَد → منجَز
 *      ↓
 *   مرفوض
 */

export const STATES = {
  draft: { id: 'draft', label: 'مسودّة', emoji: '📝', color: '#6b7280' },
  submitted: { id: 'submitted', label: 'بانتظار الاعتماد', emoji: '⏳', color: '#f59e0b' },
  approved: { id: 'approved', label: 'معتمَد', emoji: '✅', color: '#10b981' },
  rejected: { id: 'rejected', label: 'مرفوض', emoji: '❌', color: '#ef4444' },
  done: { id: 'done', label: 'منجَز', emoji: '🏁', color: '#059669' },
};

export const INITIAL_STATE = 'draft';

/** الحالات التي يجوز فيها تعديل الحقول. ما عداها مقروء فقط. */
export const EDITABLE_STATES = ['draft', 'rejected'];

/**
 * النقلات المسموحة. لكل نقلة:
 *   to        — الحالة الهدف
 *   label     — نصّ الزرّ
 *   by        — من يملكها: 'creator' (من أنشأ) أو مفتاح أدوار في مخطّط النموذج
 *   needsNote — هل تُلزِم بسبب مكتوب (الرفض يلزم دائمًا)
 *
 * 🥇 حارس الجودة: لا سبيل من `submitted` إلى `done` مباشرة — لا بدّ من
 * المرور بـ`approved`. أي أن «تمّ الاستلام» مستحيل قبل اعتماد الجودة،
 * وهذا هو نفس منطق `stock.picking.button_validate` في الموديول.
 */
export const TRANSITIONS = {
  draft: [{ to: 'submitted', label: 'إرسال للاعتماد', by: 'creator' }],
  rejected: [{ to: 'submitted', label: 'تصحيح وإعادة الإرسال', by: 'creator' }],
  submitted: [
    { to: 'approved', label: 'اعتماد', by: 'approve' },
    { to: 'rejected', label: 'رفض', by: 'approve', needsNote: true },
  ],
  approved: [{ to: 'done', label: 'إنهاء المستند', by: 'complete' }],
  done: [],
};

/** يُعيد كائن الحالة، أو المسودّة إن كان المعرّف غير معروف. */
export function getState(stateId) {
  return STATES[stateId] || STATES[INITIAL_STATE];
}

/** هل يجوز تعديل حقول مستند في هذه الحالة؟ */
export function isEditable(stateId) {
  return EDITABLE_STATES.includes(stateId);
}

/**
 * هل يملك هذا المستخدم هذه النقلة؟
 * الأدمن يملك كل شيء (المدير العام يرى ويفعل كل شيء — ROADMAP §8 ركيزة 1).
 */
export function canDo(transition, { role, uid }, schema, docData) {
  if (role === 'admin') return true;
  if (transition.by === 'creator') return docData?.createdByUid === uid;
  const allowed = schema?.roles?.[transition.by] || [];
  return allowed.includes(role);
}

/** النقلات المتاحة فعليًّا لهذا المستخدم على هذا المستند. */
export function availableTransitions(docData, user, schema) {
  const list = TRANSITIONS[docData?.state] || [];
  return list.filter((t) => canDo(t, user, schema, docData));
}

/** هل النقلة من→إلى مسموحة أصلًا في الجدول؟ (تحقّق مستقلّ عن الدور) */
export function isLegalTransition(from, to) {
  return (TRANSITIONS[from] || []).some((t) => t.to === to);
}
