/**
 * عرضُ حالة التحديث — منطقٌ خالصٌ يُختبَر في Node (بلا Tauri ولا React).
 *
 * يترجم أطوارَ `runAutoUpdate` (checking · available · downloading · installed ·
 * failed) وطورَي الواجهة (idle · uptodate · updated) إلى نصٍّ عربيٍّ ونبرةٍ
 * وأيقونةٍ وحالةِ انشغال — فيُبرهَن العرضُ بلا واجهةٍ ولا جهاز.
 *
 * النبرات: idle محايد · info أثناء العمل · success للإتمام · warn للفشل (الأحمر
 * للتحذير وحده بقرار المالك). والأيقوناتُ أسماءٌ يرسمها المكوّنُ SVG خطيًّا (بلا إيموجي).
 */

export const UPDATE_PHASES = [
  'idle',
  'checking',
  'available',
  'downloading',
  'installed',
  'failed',
  'uptodate',
  'updated',
];

/**
 * @param {{phase?:string, version?:string, error?:string}} [state]
 * @returns {{icon:string, tone:string, busy:boolean, title:string, detail:string}}
 */
export function describeUpdate({ phase, version, error } = {}) {
  const v = version ? ` ${version}` : '';
  switch (phase) {
    case 'checking':
      return { icon: 'spin', tone: 'info', busy: true, title: 'جارٍ فحص التحديثات…', detail: '' };
    case 'available':
      return { icon: 'down', tone: 'info', busy: true, title: `تحديثٌ جديد${v}`, detail: 'جارٍ التنزيل والتثبيت…' };
    case 'downloading':
      return { icon: 'down', tone: 'info', busy: true, title: `تحديثٌ${v}`, detail: 'جارٍ التنزيل والتثبيت…' };
    case 'installed':
      return { icon: 'check', tone: 'success', busy: true, title: 'اكتمل التحديث', detail: 'سيُعاد تشغيل التطبيق بالإصدار الجديد…' };
    case 'updated':
      return { icon: 'check', tone: 'success', busy: false, title: `تمّ التحديث${v}`, detail: 'بنجاح — أنت الآن على أحدث إصدار' };
    case 'uptodate':
      return { icon: 'check', tone: 'success', busy: false, title: 'أنت على أحدث إصدار', detail: 'لا تحديثات متاحة' };
    case 'failed':
      return { icon: 'warn', tone: 'warn', busy: false, title: 'تعذّر التحديث', detail: error || 'تحقّق من الاتصال وحاول مجدّدًا' };
    case 'idle':
    default:
      return { icon: 'refresh', tone: 'idle', busy: false, title: 'فحص التحديثات', detail: '' };
  }
}
