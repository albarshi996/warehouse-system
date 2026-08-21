/**
 * «أين كنتُ ذاهبًا قبل أن يوقفني حارس الدخول؟»
 *
 * **الحاجة:** المدير يفتح جلسة جردٍ ويرسل رابطها للجنة. وعضو اللجنة يفتحه على
 * هاتفه فيجد نفسه أمام شاشة الدخول — وكان الحارس يحوّل إلى `/login` **ويرمي
 * باقي الرابط**، فيدخل بحسابه ويصل إلى لوحةٍ عامّة لا إلى الجلسة. فيسأل: «وأين
 * الجرد؟». الدعوة تموت عند الحارس.
 *
 * فصار الحارس يحمل الوجهة معه، وصفحةُ الدخول تُعيده إليها.
 *
 * ── ولماذا هذا الملفّ بحرّاسه ──────────────────────────────────────────
 * «أعِد المستخدم إلى ما في الرابط» أشهرُ ثغرةٍ في هذا الباب: **التحويل
 * المفتوح**. يكفي أن يُرسل لعاملٍ رابطُ بوّابتنا وفي ذيله وجهةٌ إلى موقعٍ
 * يشبه شاشة دخولنا، فيُدخل كلمة سرّه هناك وهو مطمئنٌّ لأنّ الرابط بدأ باسمنا.
 * ولذلك لا تُقبل الوجهة إلّا إن كانت **مسارًا داخليًّا تحت جذر البوّابة**،
 * وكلّ صيغةٍ تحتمل الخروج تُرفض بلا اجتهاد.
 */

/** اسم المعامل الحامل للوجهة. */
export const RETURN_PARAM = 'next';

/** بروتوكولٌ صريح في أوّل النصّ (`https:` · `javascript:` · `data:`). */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * يبني رابط شاشة الدخول حاملًا الوجهة المقصودة.
 *
 * @param {string} base جذر النشر كما يُعيده `getBasePath()` — بلا مثالٍ حرفيّ:
 *   اسمُ المستودع يختلف بين الشخصيّ والشركة، وكتابتُه هنا تسريبُ هويّة.
 * @param {string} pathname المسار الحاليّ
 * @param {string} [search] سلسلة الاستعلام بما فيها `?`
 */
export function loginUrlFor(base, pathname, search = '') {
  const target = `${pathname || ''}${search || ''}`;
  const login = `${base}/login`;
  if (!target || target === login || target.startsWith(`${login}?`)) return login;
  return `${login}?${RETURN_PARAM}=${encodeURIComponent(target)}`;
}

/**
 * يُصفّي وجهةً قادمةً من الرابط: مسارٌ داخليٌّ صالح، أو `null`.
 *
 * تُرفض: المسارات المطلقة بمضيف (`//evil.example`) · أيّ بروتوكول · الشرطة
 * المائلة العكسيّة (تقرؤها بعض المتصفّحات مائلةً عاديّة) · ما هو خارج جذر
 * البوّابة · والعودة إلى شاشة الدخول نفسها (حلقةٌ لا تنتهي).
 *
 * @returns {string|null}
 */
export function safeReturnPath(raw, base) {
  if (typeof raw !== 'string' || !raw) return null;

  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null; // ترميزٌ معطوب — لا يُخمَّن المقصود
  }
  path = path.trim();

  if (!path.startsWith('/')) return null; // نسبيٌّ أو مطلقٌ بمضيف
  if (path.startsWith('//')) return null; // `//host` يخرج من الموقع
  if (path.includes('\\')) return null;
  if (HAS_SCHEME.test(path)) return null;
  // محارف التحكّم والمسافات تُستعمل لتقطيع الرؤوس وإخفاء الوجهة الحقيقيّة.
  // فحصٌ بالرمز العدديّ لا بتعبيرٍ نمطيّ عمدًا: كتابةُ محرف تحكّمٍ داخل
  // تعبيرٍ تجعله **غير مرئيّ في المراجعة** ويمحوه أوّل محرّرٍ ينظّف الملفّ.
  for (const ch of path) {
    const code = ch.codePointAt(0);
    if (code <= 0x20 || code === 0x7f) return null;
  }

  const root = base || '';
  if (root && path !== root && !path.startsWith(`${root}/`)) return null;
  if (!root && path.startsWith('//')) return null;

  const bare = path.split('?')[0].split('#')[0];
  if (bare === `${root}/login`) return null; // لا يُعاد إلى الدخول

  return path;
}

/**
 * يقرأ الوجهة من سلسلة استعلامٍ ويُصفّيها — سطرٌ واحد لمن يستدعي.
 *
 * @param {string} search سلسلة الاستعلام، مثل `?next=%2F…%2Fdashboard`
 * @param {string} base جذر النشر
 */
export function returnPathFrom(search, base) {
  try {
    return safeReturnPath(new URLSearchParams(search || '').get(RETURN_PARAM), base);
  } catch {
    return null;
  }
}
