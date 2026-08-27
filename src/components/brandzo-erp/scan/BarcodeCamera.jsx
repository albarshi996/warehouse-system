/**
 * ═══ كاميرا الباركود — مكوّنٌ واحدٌ لكلّ شاشات المسح ═══
 *
 * ★ **لا زرَّ يُخفى قبل أن يُجرَّب.** كان الزرّ مشروطًا بـ`BarcodeDetector`
 * الأصليّ فيختفي على آيفون وعلى كروم ويندوز، فيبدو النظام بلا كاميرا. الآن
 * الزرّ ظاهرٌ دائمًا لأنّ المحرّك يعمل على كلّ جهاز، وإن تعذّرت الكاميرا
 * فعلًا (أذنٌ مرفوض · لا عدسة · مشغولة) ظهر **سببٌ ومخرج** لا اختفاءٌ صامت.
 *
 * ★ **والشاشة عرضٌ لا حَكَم**: كلّ الحكم في `services/scan/` — هذا المكوّن
 * دورةُ حياةٍ وواجهةٌ فقط.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { startCameraScan } from '../../../services/scan/cameraScanner.js';
import { cameraErrorText } from '../../../services/scan/scanEngine.js';
import Icon from '../../ui/Icon.jsx';

/**
 * دورةُ حياة الكاميرا. تُعطى `onCode` فتُنادى بباركودٍ نظيفٍ عند كلّ قراءة.
 * تُعيد كائنًا يُمرَّر إلى `ScanCameraButton` و`ScanCameraPanel`.
 */
export function useBarcodeCamera({ onCode, closeOnCode = false } = {}) {
  const elementId = `bz-cam-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const stopRef = useRef(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  // ★ شاشةٌ تطلب كمّيّةً بعد كلّ قراءة تُغلق العدسة (`closeOnCode`) كي لا
  //   تلتقط الباركود نفسه والعامل يكتب؛ وشاشةُ الكرتونة تلو الكرتونة تُبقيها.
  const closeRef = useRef(closeOnCode);
  closeRef.current = closeOnCode;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setError('');
    setReady(false);
    startCameraScan({
      elementId,
      onCode: (code) => {
        if (closeRef.current) setOpen(false);
        onCodeRef.current?.(code);
      },
      onReady: () => { if (alive) setReady(true); },
    })
      .then((stop) => {
        // أُغلقت الشاشة قبل أن تُفتح العدسة — نُطفئها فورًا ولا نتركها مشتعلة.
        if (!alive) { stop(); return; }
        stopRef.current = stop;
      })
      .catch((e) => {
        if (!alive) return;
        const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
        setError(cameraErrorText(e, { secure }));
        setOpen(false);
      });
    return () => {
      alive = false;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [open, elementId]);

  return {
    elementId,
    open,
    ready,
    error,
    start: () => { setError(''); setOpen(true); },
    stop: () => setOpen(false),
  };
}

/** زرّ «مسحٌ بالكاميرا» — ظاهرٌ دائمًا، ولا يُخفى بحكمٍ مسبقٍ على الجهاز. */
export function ScanCameraButton({ camera, disabled = false, label = 'مسحٌ بالكاميرا', compact = false }) {
  if (camera.open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={camera.stop} title="إيقاف الكاميرا">
        <Icon name="close" size={compact ? 16 : 20} />
        {!compact && <span style={{ marginInlineStart: '6px' }}>إيقاف</span>}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={camera.start} disabled={disabled} title={label}>
      <Icon name="target" size={compact ? 16 : 20} />
      {!compact && <span style={{ marginInlineStart: '6px' }}>{label}</span>}
    </button>
  );
}

/**
 * لوحةُ العرض — تُوضع حيث يتّسع لها الصفّ (تحت حقل المسح عادةً).
 *
 * ⚠ العنصر المضيف يبقى في الشجرة بلا أبناءٍ من React: المكتبة تحقن الفيديو
 * داخله، فلو أدارت React أبناءه لتضاربت معها عند الإغلاق.
 */
export function ScanCameraPanel({ camera, hint = 'وجّه العدسة إلى الباركود — يُقرأ ويُسجَّل وحده.' }) {
  if (!camera.open && !camera.error) return null;
  return (
    <div style={{ marginBottom: '12px' }}>
      {camera.error && (
        <p
          className="o_alert danger"
          style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)' }}
          role="alert"
        >
          {camera.error}
        </p>
      )}
      {camera.open && (
        <div
          style={{
            position: 'relative',
            borderRadius: 'var(--o-border-radius-lg, 8px)',
            overflow: 'hidden',
            border: '1px solid var(--o-border-color, var(--o-border, #d8dadd))',
            background: '#000',
          }}
        >
          <div id={camera.elementId} style={{ width: '100%', minHeight: '180px' }} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={camera.stop}
            style={{ position: 'absolute', top: '8px', insetInlineEnd: '8px', zIndex: 2 }}
          >
            <Icon name="close" size={14} />
            <span style={{ marginInlineStart: '4px' }}>إيقاف</span>
          </button>
          {!camera.ready && (
            <p
              style={{
                position: 'absolute',
                insetInline: 0,
                bottom: '10px',
                margin: 0,
                textAlign: 'center',
                color: '#fff',
                fontSize: '12px',
                lineHeight: 1.7,
              }}
            >
              {/* ★ أوّلُ فتحٍ على الجهاز يقف على سؤال أذن المتصفّح — وهو سؤالٌ
                  في شريط العنوان لا في الصفحة. فبلا هذا السطر يرى العامل
                  شاشةً سوداء تقول «جارٍ» بلا نهاية ويحسبها عطلًا. */}
              جارٍ فتح الكاميرا…
              <br />
              إن سألك المتصفّح عن أذن الكاميرا فاضغط «السماح».
            </p>
          )}
        </div>
      )}
      {camera.open && (
        <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--o-main-color-muted, #6b7280)' }}>{hint}</p>
      )}
    </div>
  );
}
