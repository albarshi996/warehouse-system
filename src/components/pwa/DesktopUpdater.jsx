/**
 * زرُّ التحديث وحالتُه (سطح المكتب فقط) — فحصٌ يدويٌّ بزرٍّ ظاهر + فحصٌ تلقائيٌّ عند
 * الإقلاع + رسالةُ اكتمالٍ بعد إعادة التشغيل.
 *
 * يُدرَج في بناء سطح المكتب وحدَه (الوصلُ في DashboardLayout خلف PUBLIC_IS_DESKTOP؛
 * والحارسُ في `runAutoUpdate` يعيد `not-desktop` على الويب فلا يُحمَّل محرّكُ Tauri).
 *
 * ★ التحقّق: Tauri يتأكّد من توقيع الحزمة بالمفتاح العامّ (tauri.conf.json) قبل
 *   التثبيت — فلا يُثبَّت إلّا الموقَّع. ★ البيانات: قاعدةُ الجهاز في app_data_dir
 *   (منفصلةٌ عن مجلّد التثبيت) فالتحديثُ لا يمسّها. ★ المنطقُ الخالصُ في `updateView.js`.
 */
import { useCallback, useEffect, useState } from 'react';
import { runAutoUpdate } from '../../services/updater/autoUpdate.js';
import { describeUpdate } from '../../services/updater/updateView.js';

const PENDING_KEY = 'bz.update.pending';

const readLS = (k) => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
  } catch {
    return null;
  }
};
const writeLS = (k, v) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* تجاهلٌ آمن: النافذةُ الخاصّة أو تخزينٌ محجوب */
  }
};

const TONE = {
  idle: { fg: '#EDEDF2', bd: '#3A3A52', mark: '#DAAA3C' },
  info: { fg: '#EDEDF2', bd: '#DAAA3C', mark: '#DAAA3C' },
  success: { fg: '#EDEDF2', bd: '#2E7D5B', mark: '#36B37E' },
  warn: { fg: '#FFE2E2', bd: '#C0392B', mark: '#E05B4B' },
};

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
  if (name === 'refresh' || name === 'spin') {
    return (
      <svg {...p} style={name === 'spin' ? { animation: 'bzspin 1s linear infinite' } : undefined}>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    );
  }
  if (name === 'down') {
    return (
      <svg {...p}>
        <path d="M12 3v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  if (name === 'check') {
    return (
      <svg {...p}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export default function DesktopUpdater() {
  const [phase, setPhase] = useState('idle');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');

  const onStatus = useCallback((s) => {
    if (!s || !s.phase) return;
    setPhase(s.phase);
    if (s.version) setVersion(s.version);
    // نُثبّت الإصدارَ المُنتظَر قبل التثبيت؛ فبعد إعادة التشغيل تظهر رسالةُ الاكتمال.
    if (s.phase === 'available' && s.version) writeLS(PENDING_KEY, s.version);
    if (s.phase === 'failed') writeLS(PENDING_KEY, null);
  }, []);

  const check = useCallback(async () => {
    setError('');
    setPhase('checking');
    const r = await runAutoUpdate({ onStatus });
    if (!r || r.ok === false) {
      if (r && r.reason === 'not-desktop') {
        setPhase('idle');
        return;
      }
      setError((r && (r.message || r.reason)) || '');
      setPhase('failed');
    } else if (!r.updated) {
      setPhase('uptodate');
    }
    // r.updated === true: التثبيتُ التمريريّ (passive) يُغلق التطبيقَ ويعيده بالإصدار الجديد.
  }, [onStatus]);

  // عند الإقلاع: رسالةُ اكتمالٍ إن حُدِّثنا للتوّ، وإلّا فحصٌ تلقائيٌّ بعد استقرار الإقلاع.
  useEffect(() => {
    const pending = readLS(PENDING_KEY);
    if (pending) {
      setVersion(pending);
      setPhase('updated');
      writeLS(PENDING_KEY, null);
      return undefined; // حُدِّث للتوّ — لا فحصَ تلقائيَّ هذه المرّة
    }
    const t = setTimeout(() => {
      check();
    }, 4000);
    return () => clearTimeout(t);
  }, [check]);

  // الرسائلُ النهائيّةُ اللطيفة تعود إلى زرّ الفحص بعد مهلة.
  useEffect(() => {
    if (phase === 'uptodate' || phase === 'updated') {
      const t = setTimeout(() => setPhase('idle'), 7000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const view = describeUpdate({ phase, version, error });
  const tone = TONE[view.tone] || TONE.idle;
  const clickable = !view.busy && (phase === 'idle' || phase === 'failed' || phase === 'uptodate' || phase === 'updated');

  return (
    <div dir="rtl" style={{ position: 'fixed', bottom: 18, left: 18, zIndex: 2147483647 }}>
      <button
        type="button"
        onClick={clickable ? () => check() : undefined}
        disabled={!clickable}
        title={view.detail || view.title}
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
          cursor: clickable ? 'pointer' : 'default',
          boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        }}
      >
        <span style={{ color: tone.mark, display: 'inline-flex', flex: '0 0 auto' }}>
          <Icon name={view.icon} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span>{view.title}</span>
          {view.detail ? (
            <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.82 }}>{view.detail}</span>
          ) : null}
        </span>
      </button>
      <style>{'@keyframes bzspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
