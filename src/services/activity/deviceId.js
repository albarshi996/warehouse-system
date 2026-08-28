/**
 * رقمُ الجهاز ‹VIS-102› — أربعةُ محارفَ تفرّق شخصين على حسابٍ واحد.
 *
 * ═══ لماذا رقمٌ عشوائيٌّ لا بصمةُ متصفّح؟ ═══
 * بصمةُ المتصفّح (الشاشة · الخطوط · اللغة · الرسوميّات) تتعقّب الإنسانَ عبر
 * المواقع وتبقى وإن مسح بياناتِه — وهي أكثرُ ممّا طُلب بكثير. والمطلوب أضيق:
 * **أن نفرّق جهازًا عن جهاز داخل بوّابتنا**. فرقمٌ عشوائيٌّ يفعلها ولا يكشف
 * عن الجهاز شيئًا.
 *
 * ═══ ★★ والفشلُ لا يُسقط شيئًا (ض-٢) ═══
 * متصفّحٌ يمنع تخزينَ الموقع (نافذةٌ خاصّة · إعدادٌ صارم) **لا يرمي خطأً هنا**:
 * يعود رقمٌ يعيش للجلسة وحدها، فتُسجَّل الزيارةُ ناقصةَ الثبات ولا تتعطّل
 * البوّابة. (نمط `useFieldLang` القائم: `try` حول التخزين والأصلُ احتياط.)
 *
 * ═══ والتخزينُ يُحقَن ═══
 * الدالّةُ تأخذ المخزنَ وسيطًا فتُختبر بلا متصفّح — ولا تقرأ `window` إلا في
 * الغلاف الرقيق أسفلَه.
 */

const KEY = 'bz.portal.deviceId';

/** أربعةُ محارفَ من حروفٍ وأرقامٍ لا تلتبس (بلا 0/O و1/I). */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * يولّد رقمًا جديدًا. `rand` يُحقَن للاختبار الحتميّ.
 * @param {() => number} [rand]
 */
export function makeDeviceId(rand = Math.random) {
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    const n = Math.floor(rand() * ALPHABET.length);
    out += ALPHABET[Math.min(Math.max(n, 0), ALPHABET.length - 1)];
  }
  return out;
}

/** أهذا رقمُ جهازٍ سليم؟ (يُستعمل لرفض قيمةٍ تالفةٍ في التخزين) */
export function isDeviceId(value) {
  return typeof value === 'string' && /^[23456789A-HJ-NP-Z]{4}$/.test(value);
}

/**
 * يقرأ رقمَ الجهاز من المخزن، ويولّده ويحفظه إن غاب أو فسد.
 *
 * @param {{getItem:Function, setItem:Function}} [storage]
 * @param {() => number} [rand]
 * @returns {{id:string, persisted:boolean}} و`persisted:false` تعني رقمًا
 *   يعيش للجلسة وحدها — يُعلَن ولا يُخفى، فمن يقرأ السجلّ يعرف لماذا تغيّر.
 */
export function readDeviceId(storage, rand = Math.random) {
  try {
    const stored = storage?.getItem?.(KEY);
    if (isDeviceId(stored)) return { id: stored, persisted: true };
    const fresh = makeDeviceId(rand);
    storage?.setItem?.(KEY, fresh);
    // نتحقّق أنّه حُفظ فعلًا — بعضُ المتصفّحات تقبل الكتابة ثمّ لا تُبقيها.
    return { id: fresh, persisted: isDeviceId(storage?.getItem?.(KEY)) };
  } catch {
    // تخزينٌ ممنوعٌ كلّيًّا — رقمٌ للجلسة، والبوّابة تعمل.
    return { id: makeDeviceId(rand), persisted: false };
  }
}

/** غلافُ المتصفّح — الموضعُ الوحيد الذي يعرف `window`. */
export function browserDeviceId() {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  return readDeviceId(storage);
}

/**
 * معرّفُ الجلسة — يُولَّد لكلّ تبويبٍ ويموت بإغلاقه.
 *
 * ★ ولماذا نحتاجه والجهازُ موجود؟ لأنّ الجهازَ الواحد يُفتح فيه تبويبان، وبلا
 * فصلٍ بينهما يبدو المستخدمُ قافزًا بين شاشتين في اللحظة نفسها.
 */
export function browserSessionId() {
  try {
    const store = typeof window === 'undefined' ? null : window.sessionStorage;
    const existing = store?.getItem?.('bz.portal.sessionId');
    if (existing) return existing;
    const fresh = makeDeviceId() + makeDeviceId();
    store?.setItem?.('bz.portal.sessionId', fresh);
    return fresh;
  } catch {
    return makeDeviceId() + makeDeviceId();
  }
}
