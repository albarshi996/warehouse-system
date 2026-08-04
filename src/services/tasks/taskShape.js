/**
 * لغة المهام المُسنَدة السحابيّة — الحالات والأولويّات والانتقالات المسموحة.
 *
 * مصدرٌ واحد يستعمله: الخدمة (`tasksCloudService`) والواجهة (البطاقات/الخيط)
 * وقواعد Firestore (تُكرّر أسماء الحالات نصًّا — عدّلهما معًا كنمط المستندات).
 *
 * فلسفة التنفيذ (آلية التنفيذ): المُسنَد إليه يدفع المهمة للأمام فقط عبر مسارٍ
 * أحاديّ الاتجاه، والمدير وحده يُعيدها للخلف (فتح/إلغاء/إعادة إسناد).
 */

/** الحالات بترتيب دورة الحياة. `canceled` خارج المسار (إنهاءٌ إداريّ لا محو). */
export const TASK_STATUS = {
  ASSIGNED: 'assigned',
  ACKNOWLEDGED: 'acknowledged',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELED: 'canceled',
};

/** المسار الأماميّ الطبيعيّ (يُستعمل لقياس «هل تقدّمت المهمة؟»). */
export const STATUS_ORDER = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.ACKNOWLEDGED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.DONE,
];

export const STATUS_LABELS = {
  assigned: 'مُسندة',
  acknowledged: 'تمّ الاطّلاع',
  in_progress: 'قيد التنفيذ',
  done: 'منجَزة',
  canceled: 'ملغاة',
};

export const PRIORITY_LABELS = { high: 'عاجل', med: 'متوسط', low: 'عادي' };

/** أنواع أحداث سجلّ التوثيق (المجموعة الفرعيّة `events` الملحقة-فقط). */
export const EVENT_TYPE = {
  CREATED: 'created', // أُنشئت وأُسندت
  STATUS: 'status', // تغيّرت الحالة (اطّلاع/تنفيذ/إنجاز/إلغاء/فتح)
  REPLY: 'reply', // ردّ/تعليق في الخيط
  REASSIGNED: 'reassigned', // أعاد المدير الإسناد لمستخدمٍ آخر
  CHECKLIST: 'checklist', // تغيّرت خطوة في قائمة التحقّق
};

/**
 * هل يُسمح للمُسنَد إليه بنقل الحالة من `from` إلى `to`؟
 * أماميّ فقط داخل المسار (لا يتخطّى للخلف، ولا يُلغي). التخطّي للأمام مسموح
 * (مثلًا من «مُسندة» مباشرةً إلى «قيد التنفيذ») تسهيلًا، لكن ليس للوراء.
 */
export function canAssigneeMove(from, to) {
  const i = STATUS_ORDER.indexOf(from);
  const j = STATUS_ORDER.indexOf(to);
  return i !== -1 && j !== -1 && j > i;
}

/**
 * هل يُسمح للمدير بنقل الحالة من `from` إلى `to`؟ المدير يملك المسار كلّه:
 * أمامًا وخلفًا (إعادة فتح) وإلغاءً — لكن لا انتقال من/إلى قيمةٍ مجهولة.
 */
export function canManagerMove(from, to) {
  const known = { ...TASK_STATUS };
  const values = Object.values(known);
  return values.includes(from) && values.includes(to) && from !== to;
}

/** أزرار التنفيذ المتاحة للمُسنَد إليه انطلاقًا من الحالة الراهنة. */
export function assigneeNextActions(status) {
  switch (status) {
    case TASK_STATUS.ASSIGNED:
      return [TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.IN_PROGRESS];
    case TASK_STATUS.ACKNOWLEDGED:
      return [TASK_STATUS.IN_PROGRESS];
    case TASK_STATUS.IN_PROGRESS:
      return [TASK_STATUS.DONE];
    default:
      return [];
  }
}

/** يحوّل قيمة وقت Firestore/ISO/رقم إلى ميلي-ثانية (أو null). نقيّة للاختبار. */
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value.toMillis === 'function') return value.toMillis(); // Firestore Timestamp
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/**
 * لحظة الاستحقاق بالميلي-ثانية من `dueDate` (YYYY-MM-DD) و`dueTime` (HH:MM).
 * غياب الوقت ⇒ نهاية اليوم (23:59) كي لا تُحسب مهمّة اليوم متأخّرةً صباحًا.
 */
export function dueMillis(dueDate, dueTime) {
  if (!dueDate) return null;
  const time = dueTime && /^\d{1,2}:\d{2}$/.test(dueTime) ? dueTime : '23:59';
  const t = Date.parse(`${dueDate}T${time}:00`);
  return Number.isNaN(t) ? null : t;
}
