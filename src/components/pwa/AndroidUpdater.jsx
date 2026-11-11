/**
 * محدّثُ أندرويد — نظيرُ `DesktopUpdater` للموبايل. مُلحق Tauri updater لا يدعم
 * أندرويد، فهذا المكوّن يفحص `android-latest.json` ويقارن الإصدار؛ وإن توفّر أحدثُ
 * عرض زرًّا يفتح رابطَ تنزيل APK في المتصفّح (أندرويد لا يثبّت صامتًا — يحتاج إذنَ
 * المستخدم «تثبيت من مصدر غير معروف»).
 *
 * يُدرَج في بناء أندرويد وحدَه (الوصلُ في DashboardLayout خلف PUBLIC_IS_ANDROID).
 * المنطقُ الخالصُ في `androidUpdate.js` (مُختبَر في Node). لا يرمي أبدًا.
 */
import { useCallback, useEffect, useState } from 'react';
import { checkAndroidUpdate } from '../../services/updater/androidUpdate.js';

const CURRENT = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PUBLIC_APP_VERSION) || '0.0.0';

const TONE = {
  info: { fg: '#EDEDF2', bd: '#DAAA3C', mark: '#DAAA3C' },
  success: { fg: '#EDEDF2', bd: '#2E7D5B', mark: '#36B37E' },
};

/** يفتح رابطًا في المتصفّح الخارجيّ — مُلحق opener، وإلّا window.open احتياطًا. */
async function openExternal(url) {
  try {
    const inv = typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
    if (inv) {
      await inv('plugin:opener|open_url', { url });
      return true;
    }
  } catch {
    /* يسقط إلى window.open */
  }
  try {
    window.open(url, '_blank');
    return true;
  } catch {
    return false;
  }
}

function Icon({ name }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };
  if (name === 'down') {
    return (
      <svg {...p}>
        <path d="M12 3v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function AndroidUpdater() {
  const [state, setState] = useState({ phase: 'idle', version: '', url: '' });

  const check = useCallback(async () => {
    const r = await checkAndroidUpdate(CURRENT);
    if (r && r.ok && r.updateAvailable && r.url) {
      setState({ phase: 'available', version: r.version, url: r.url });
    } else {
      setState({ phase: 'idle', version: '', url: '' });
    }
  }, []);

  // فحصٌ تلقائيٌّ بعد استقرار الإقلاع (كالمكتب).
  useEffect(() => {
    const t = setTimeout(() => {
      check();
    }, 4000);
    return () => clearTimeout(t);
  }, [check]);

  if (state.phase !== 'available') return null;
  const tone = TONE.info;

  return (
    <div dir="rtl" style={{ position: 'fixed', bottom: 18, left: 18, zIndex: 2147483647 }}>
      <button
        type="button"
        onClick={() => openExternal(state.url)}
        title={`تحديثٌ متاح: ${state.version}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          maxWidth: 340,
          background: '#1A1A2E',
          color: tone.fg,
          border: `1.5px solid ${tone.bd}`,
          borderRadius: 999,
          padding: '9px 15px',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.35,
          textAlign: 'start',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        }}
      >
        <span style={{ color: tone.mark, display: 'inline-flex', flex: '0 0 auto' }}>
          <Icon name="down" />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span>{`تحديثٌ متاح — الإصدار ${state.version}`}</span>
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.82 }}>اضغط لتنزيل التحديث وتثبيته</span>
        </span>
      </button>
    </div>
  );
}
