/**
 * غلافُ التحديث التلقائيّ (سطح المكتب) — يفحص عند الإقلاع ويُثبّت الأحدثَ الموقَّع.
 *
 * يُدرَج في بناء سطح المكتب وحدَه (الحارسُ في الطبقة + الوصلُ في DashboardLayout
 * خلف PUBLIC_IS_DESKTOP). لا يعرض شيئًا إلّا شريطًا لطيفًا أثناء التنزيل؛ والتثبيتُ
 * يعرضه ويندوز (installMode passive) ثمّ يُغلق التطبيقَ تلقائيًّا فيعود بالإصدار الجديد.
 */
import { useEffect, useState } from 'react';
import { runAutoUpdate } from '../../services/updater/autoUpdate.js';

export default function DesktopUpdater() {
  const [st, setSt] = useState(null);

  useEffect(() => {
    // تأخيرٌ يسيرٌ كي يستقرَّ الإقلاعُ أوّلًا قبل فحص الشبكة.
    const t = setTimeout(() => {
      runAutoUpdate({ onStatus: setSt }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  if (!st || (st.phase !== 'available' && st.phase !== 'downloading')) return null;

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 18,
        left: 18,
        zIndex: 2147483647,
        maxWidth: 320,
        background: '#1A1A2E',
        color: '#fff',
        border: '1.5px solid #DAAA3C',
        borderRadius: 14,
        padding: '12px 16px',
        boxShadow: '0 10px 30px rgba(0,0,0,.4)',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      تحديثٌ جديدٌ {st.version ? `(${st.version})` : ''} — جارٍ التنزيلُ والتثبيت…
    </div>
  );
}
