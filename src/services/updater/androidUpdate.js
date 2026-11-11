/**
 * فحصُ تحديث أندرويد — نسخةُ الموبايل تحدّث نفسَها كالـexe لكن بآليّةٍ مختلفة:
 * مُلحق Tauri updater لا يدعم الموبايل، فنفحص ملفَّ `android-latest.json` المنشورَ
 * في GitHub Releases ونقارن الإصدار. وأندرويد **لا يثبّت APK صامتًا** (يتطلّب إذنَ
 * المستخدم «تثبيت من مصدر غير معروف»)، فدورُنا: الكشفُ، والواجهةُ تفتح رابطَ التنزيل.
 *
 * ★ منطقٌ خالص (لا DOM ولا Tauri) — يُختبَر في Node. و`checkAndroidUpdate` لا
 *   ترمي أبدًا: كلُّ فشلٍ (بلا إنترنت · ملفٌّ ناقص) يعود سببًا صريحًا فلا يتعطّل شيء.
 */

/** رابطُ بيانِ التحديث — ثابتٌ على وسم `android-latest` فلا يتغيّر بين الإصدارات. */
export const ANDROID_LATEST_URL =
  'https://github.com/albarshi996/warehouse-system/releases/download/android-latest/android-latest.json';

/**
 * يقارن نسختين «x.y.z» رقميًّا. يُعيد 1 إن a أحدث، -1 إن b أحدث، 0 إن تساوتا.
 * يتجاهل ما بعد الأرقام (لاحقةٌ كـ`-rc1` تُقصّ عند أوّل غير رقم).
 */
export function cmpSemver(a, b) {
  const part = (v) =>
    String(v == null ? '' : v)
      .trim()
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = part(a);
  const pb = part(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** هل `latest` أحدثُ من `current`؟ (غلافٌ مقروء حول `cmpSemver`). */
export function isNewer(latest, current) {
  return cmpSemver(latest, current) > 0;
}

/**
 * يفحص التحديث. لا يرمي.
 * @param {string} currentVersion إصدارُ التطبيق الحاليّ (من tauri getVersion)
 * @param {{fetchImpl?:Function, url?:string}} [opts]
 * @returns {Promise<{ok:boolean, updateAvailable?:boolean, version?:string, url?:string, notes?:string, reason?:string, message?:string}>}
 */
export async function checkAndroidUpdate(currentVersion, opts = {}) {
  const url = opts.url || ANDROID_LATEST_URL;
  const f = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return { ok: false, reason: 'no-fetch' };

  let data;
  try {
    const res = await f(url, { cache: 'no-store' });
    if (!res || !res.ok) return { ok: false, reason: 'fetch-failed', message: res && String(res.status) };
    data = await res.json();
  } catch (e) {
    return { ok: false, reason: 'error', message: e && e.message };
  }

  const latest = String((data && data.version) || '').trim();
  if (!latest) return { ok: false, reason: 'no-version' };

  return {
    ok: true,
    updateAvailable: isNewer(latest, currentVersion),
    version: latest,
    url: (data && data.url) || '',
    notes: (data && data.notes) || '',
  };
}
