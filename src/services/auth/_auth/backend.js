/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  اختيارُ محوَّل المصادقة — منطقٌ خالص، بلا Firebase وبلا شبكة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ نظيرُ `_db/backend.js` حرفًا بحرف، ولنفس السبب: القرارُ «بمن نُصادِق؟»
 *     لا يقلّ خطرًا عن «أين نكتب؟». فيوم يصل الدخولُ المحليّ لا يكون التبديلُ
 *     فرضيّةً تُجرَّب أوّلَ مرّةٍ على الإنتاج. والمصادقةُ تبقى على Firebase حتّى
 *     يُبنى المحوَّلُ المحليُّ ويُقاس — هذا الملفُّ يصنع نقطةَ الوصل فقط.
 *
 * ولذلك لا يستورد هذا الملفّ شيئًا. حرفيًّا.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** الاسمُ الحاكمُ حين لا يُذكر شيء — المصادقةُ على Firebase كما كانت. */
export const DEFAULT_AUTH_BACKEND = 'firebase';

/**
 * يقرأ اسمَ محوَّل المصادقة من بيئة البناء (`PUBLIC_AUTH_BACKEND`).
 * فارغٌ أو فراغاتٌ ⇒ الافتراض، فبناءُ CI بلا `.env` يبقى على Firebase.
 * @param {Record<string, unknown>} [env]
 * @returns {string}
 */
export function authBackendNameFrom(env) {
  const raw = env && env.PUBLIC_AUTH_BACKEND;
  const name = String(raw ?? '').trim();
  return name || DEFAULT_AUTH_BACKEND;
}

/**
 * يختار المحوَّل من جدول المحوّلات. الاسمُ المجهولُ **يسقط بصوتٍ عالٍ** ولا
 * يرجع صامتًا إلى الافتراض — خطأٌ مطبعيٌّ في مفتاح المصادقة يجب أن يُرى لا أن
 * يُبقي الدخولَ على مزوّدٍ يظنّ الجميعُ أنّه تبدّل.
 * @param {string} name
 * @param {Record<string, object>} table
 */
export function pickAuthBackend(name, table) {
  const known = Object.keys(table || {});
  if (table && Object.prototype.hasOwnProperty.call(table, name)) return table[name];
  throw new Error(
    `محوَّل مصادقةٍ مجهول: «${name}». المتاح: ${known.join(' · ') || '(لا شيء)'}`
  );
}

/**
 * الرموزُ التي يجب أن يُصدّرها كلُّ محوَّل مصادقة — مقيسةٌ من مستعملي
 * `authService.js` (الدخولُ والحارسُ وقائمةُ المستخدم): الاشتراكُ في الحالة،
 * الدخول، الخروج، إعادةُ التعيين، وقراءةُ الملف. وهي **عقدٌ** يفحصه الاختبار.
 */
export const REQUIRED_AUTH_SYMBOLS = Object.freeze([
  'subscribeAuth',
  'signIn',
  'signOutUser',
  'sendPasswordReset',
  'fetchUserProfile',
]);

/**
 * يفحص محوَّلًا مقابل العقد. يُعيد أسماءَ ما ينقصه — والفارغُ يعني تمامًا.
 * @param {object} impl
 * @returns {string[]}
 */
export function missingAuthSymbols(impl) {
  if (!impl) return [...REQUIRED_AUTH_SYMBOLS];
  return REQUIRED_AUTH_SYMBOLS.filter((n) => typeof impl[n] !== 'function');
}
