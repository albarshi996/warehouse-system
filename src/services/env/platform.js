/**
 * منصّةُ التشغيل — رايةُ بناءٍ واحدة. البناءُ المكتبيُّ (Tauri، يعمل أوفلاين) يضبط
 * `PUBLIC_IS_DESKTOP='true'` في `astro.config.desktop.mjs`؛ والويبُ لا يضبطها فتبقى
 * false. تُحقن وقتَ البناء في `import.meta.env`، فهي ثابتةٌ لا تتغيّر تشغيلًا.
 *
 * ★ القرارُ خالصٌ (`isDesktopFrom`) يُختبَر في Node، والقارئُ (`isDesktop`) غلافٌ
 *   رقيقٌ عليه يقرأ البيئةَ — نظيرُ `backendNameFrom`/`BACKEND` في باب البيانات.
 */

/** هل تدلّ هذه البيئةُ على بناءٍ مكتبيّ؟ — الرايةُ النصّيّةُ `'true'` وحدَها. */
export function isDesktopFrom(env) {
  return !!env && env.PUBLIC_IS_DESKTOP === 'true';
}

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** هل هذا البناءُ المكتبيُّ (Tauri، أوفلاين)؟ يُستعمل لإسقاط الموارد البعيدة. */
export function isDesktop() {
  return isDesktopFrom(ENV);
}

/** هل تدلّ هذه البيئةُ على بناءِ أندرويد؟ — الرايةُ `'true'` من astro.config.mobile. */
export function isAndroidFrom(env) {
  return !!env && env.PUBLIC_IS_ANDROID === 'true';
}

/**
 * هل هذا بناءُ أندرويد (Tauri موبايل)؟ يفصل محدّثَ أندرويد (تنزيل APK) عن محدّث
 * سطح المكتب (مُلحق Tauri). بناءُ أندرويد يضبط `PUBLIC_IS_DESKTOP` **و**
 * `PUBLIC_IS_ANDROID`، فـ`isAndroid()` أخصّ من `isDesktop()`.
 */
export function isAndroid() {
  return isAndroidFrom(ENV);
}
