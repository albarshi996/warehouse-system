/**
 * مهلة الشحن والوقت المتبقّي ‹EXE-301› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ لماذا حقلٌ جديد وقد وُجد `requiredDate` ═══
 * `SO.requiredDate` **وعدٌ للعميل**: متى يريد بضاعته. و`mustShipBy` **قيدٌ
 * تشغيليّ**: متى يُقفل استلامُ الناقل. وقد يبعد بينهما يومان أو ساعتان،
 * والذي يقود عملَ المخزن اليوم هو الثاني لا الأوّل. وخلطُهما يجعل النظام
 * يهدأ ثمانيَ ساعاتٍ ثمّ يفوت موعد الشاحنة.
 *
 * ═══ ولماذا هنا لا في `exceptions.js` ═══
 * الوقت المتبقّي كان محسوبًا هناك للاستثناء وحده. ولمّا احتاجته المهامّ
 * والطلبات صار الجواب إمّا نسخَ الحساب (فيفترق) أو نقلَه إلى موضعٍ يخدم
 * الثلاثة. فهذا الملفّ هو الموضع، و`exceptions.js` يُحيل إليه.
 *
 * والوقت **يُمرَّر** (`nowMs`) ولا يُقرأ — فالحساب ثابتٌ للاختبار.
 */

/** الحقل المعتمَد للمهلة التشغيليّة. اسمٌ واحد في المخطّطات كلّها. */
export const SHIP_DEADLINE_FIELD = 'mustShipBy';

/** عتبة «قارب» بالساعات — تحتها يصير التنبيه واجبًا. */
export const SOON_HOURS = 4;

/**
 * درجات التأخّر — **درجاتٌ لا نعم/لا**.
 * `none` تعني «بلا موعدٍ معلن» وهي ليست «على الوقت»: الأولى جهلٌ والثانية حكم.
 */
export const DUE_LEVELS = Object.freeze({
  none: { id: 'none', label: 'بلا موعدٍ معلن', warn: false },
  ontime: { id: 'ontime', label: 'على الوقت', warn: false },
  soon: { id: 'soon', label: 'قارب الموعد', warn: false },
  late: { id: 'late', label: 'تأخّر', warn: true },
});

const HOUR = 3600000;

/** لحظةٌ من نصٍّ أو رقم — `null` إن تعذّرت القراءة. */
export function toMillis(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : t;
}

/**
 * الوقت المتبقّي ودرجته.
 *
 * @returns {{ms:number|null, hours:number|null, level:string, overdue:boolean, warn:boolean, label:string}}
 */
export function remainingFrom(dueMs, nowMs) {
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) {
    return { ms: null, hours: null, level: 'none', overdue: false, warn: false, label: DUE_LEVELS.none.label };
  }
  const ms = dueMs - nowMs;
  const hours = Math.round(ms / HOUR);

  if (ms < 0) return { ms, hours, level: 'late', overdue: true, warn: true, label: `تأخّر ${Math.abs(hours)} ساعة` };
  if (hours <= SOON_HOURS) return { ms, hours, level: 'soon', overdue: false, warn: false, label: `يبقى ${hours} ساعة` };
  return { ms, hours, level: 'ontime', overdue: false, warn: false, label: `يبقى ${hours} ساعة` };
}

/**
 * مهلة المستند — من `mustShipBy` أوّلًا، ثمّ `requiredDate` احتياطًا.
 *
 * ★ ولماذا الاحتياط ولا يُترك فارغًا؟ لأنّ مستندات اليوم كلّها بلا `mustShipBy`،
 * ونظامٌ يقول «بلا موعد» لكلّ أمرِ صرفٍ قائم لا يُوثَق به. فيُقرأ الوعد
 * للعميل **ويُعلَن أنّه احتياط** (`fallback:true`) — والفرق بين المصدرين
 * ظاهرٌ لمن يقرأ لا مطموسٌ في رقمٍ واحد.
 */
export function documentDeadline(doc) {
  const header = doc?.header || doc || {};
  const primary = toMillis(header[SHIP_DEADLINE_FIELD]);
  if (primary !== null) return { ms: primary, source: SHIP_DEADLINE_FIELD, fallback: false };

  const promise = toMillis(header.requiredDate);
  if (promise !== null) return { ms: promise, source: 'requiredDate', fallback: true };

  return { ms: null, source: '', fallback: false };
}

/** حال المستند مقابل مهلته — جاهزًا للعرض وللترتيب. */
export function documentDue(doc, nowMs) {
  const deadline = documentDeadline(doc);
  const remaining = remainingFrom(deadline.ms, nowMs);
  return {
    ...remaining,
    source: deadline.source,
    fallback: deadline.fallback,
    hint: deadline.fallback ? 'المهلة مأخوذةٌ من وعد العميل لا من قيدِ الناقل — سجّل مهلة الشحن.' : '',
  };
}

/**
 * ترتيبٌ بالإلحاح: المتأخّر أوّلًا ثمّ الأقرب.
 * وما لا موعد له **يُؤخَّر ولا يتصدّر** — الجهل ليس إلحاحًا.
 */
export function sortByDue(items, nowMs, getDoc = (x) => x) {
  const rank = { late: 0, soon: 1, ontime: 2, none: 3 };
  return (items || []).slice().sort((a, b) => {
    const da = documentDue(getDoc(a), nowMs);
    const db = documentDue(getDoc(b), nowMs);
    if (rank[da.level] !== rank[db.level]) return rank[da.level] - rank[db.level];
    if (da.ms === null || db.ms === null) return 0;
    return da.ms - db.ms;
  });
}
