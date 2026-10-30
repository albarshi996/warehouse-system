/**
 * التحديثُ التلقائيّ (سطح المكتب فقط) — يفحص GitHub Releases ويثبّت الأحدثَ الموقَّع.
 *
 * ★★★ الهدف: تطبيقُ حاسوبٍ **مستقلٌّ عن قوقل** يُحدِّث نفسَه ويُضاف إليه — فمصدرُ
 *     التحديث `github.com/.../releases/latest/download/latest.json` (مضبوطٌ في
 *     tauri.conf.json)، لا أيَّ خدمةِ قوقل. والتوقيعُ يحميه (مفتاحٌ عامٌّ في الإعداد).
 *
 * ★★ محروسٌ بـ`isDesktop`: على الويب لا يُحمَّل محرّكُ Tauri أصلًا (الاستيرادُ
 *    ديناميٌّ داخل الحارس)، فلا يكسر بناءَ الويب ولا يُطلب شيءٌ خارجَ المكتبيّ.
 *
 * ★ لا يرمي أبدًا: كلُّ فشلٍ (بلا إنترنت · إضافةٌ غائبة · تعذّرُ تثبيت) يعود سببًا
 *   صريحًا، فلا يتعطّل الإقلاعُ ولا الواجهة. وعلى ويندوز يُغلق التطبيقُ تلقائيًّا
 *   عند التثبيت (حدُّ مثبّتات ويندوز)، فلا حاجةَ لإعادة تشغيلٍ يدويّة.
 */
import { isDesktop } from '../env/platform.js';

/**
 * يفحص ويثبّت التحديثَ إن وُجد.
 * @param {{onStatus?: (s:{phase:string, version?:string}) => void}} [opts]
 * @returns {Promise<{ok:boolean, updated?:boolean, version?:string, reason?:string, message?:string}>}
 */
export async function runAutoUpdate({ onStatus } = {}) {
  if (!isDesktop()) return { ok: false, reason: 'not-desktop' };

  let check;
  try {
    ({ check } = await import('@tauri-apps/plugin-updater'));
  } catch (e) {
    return { ok: false, reason: 'plugin-missing', message: e && e.message };
  }

  let update;
  try {
    update = await check(); // null إن لا تحديث؛ يرمي بلا إنترنت
  } catch (e) {
    return { ok: false, reason: 'check-failed', message: e && e.message };
  }
  if (!update) return { ok: true, updated: false };

  try {
    if (onStatus) onStatus({ phase: 'available', version: update.version });
    await update.downloadAndInstall((ev) => {
      if (onStatus && ev && ev.event === 'Progress') onStatus({ phase: 'downloading', version: update.version });
    });
    if (onStatus) onStatus({ phase: 'installed', version: update.version });
    return { ok: true, updated: true, version: update.version };
  } catch (e) {
    if (onStatus) onStatus({ phase: 'failed' });
    return { ok: false, reason: 'install-failed', message: e && e.message };
  }
}
