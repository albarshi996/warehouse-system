import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MANUAL_PATH, keyboardHelp, meetingMeta, portalScreens, slides } from '../../data/hr-meeting.js';

/*
  ═══════════════════════════════════════════════════════════════════
  العرض = شرائح الدليل نفسها
  ═══════════════════════════════════════════════════════════════════
  لا يُعاد رسم شريحة ولا يُعاد صوغ نصّ: الخمس عشرة شريحة مقتصَّةٌ من الدليل
  في ملفّ PDF بترتيب محاور الاجتماع، وتُعرض واحدةً واحدة داخل الإطار.
  والإطار من `frame-deck.css` المشترك مع عرض الهوية التشغيلية.

  لماذا PDF لا صور؟ لأنّه أخفّ وأدقّ: الشريحة تبقى متجهةً (نصًّا حقيقيًّا
  يُكبَّر بلا تحبّب) وحجم الخمس عشرة صفحة أصغر من خمس عشرة صورة.
*/

const Chevron = ({ direction = 'next' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={direction === 'next' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const PlayIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;

const LaunchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const pad = (value) => String(value).padStart(2, '0');

export default function HrMeetingDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const rootRef = useRef(null);

  const total = slides.length;
  const slide = slides[current];

  /* صفحة الملفّ = موضع الشريحة في العرض (اقتُصّت بالترتيب)، لا رقمها في الدليل. */
  const frameSrc = useMemo(
    () => `${base}${MANUAL_PATH}#page=${current + 1}&view=FitH&toolbar=0&navpanes=0`,
    [base, current],
  );

  const go = useCallback((index) => setCurrent((value) => {
    const next = Math.max(0, Math.min(total - 1, index));
    return next === value ? value : next;
  }), [total]);

  const startPresenting = useCallback(() => {
    setPresenting(true);
    rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const exitPresenting = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setPresenting(false);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key;
      const onControl = target instanceof HTMLElement && target.closest('button, a');
      if ((key === ' ' || key === 'Enter') && onControl) return;

      if (key === 'ArrowLeft' || key === 'PageDown') { event.preventDefault(); return go(current + 1); }
      if (key === 'ArrowRight' || key === 'PageUp') { event.preventDefault(); return go(current - 1); }
      if (key === 'Home') { event.preventDefault(); return go(0); }
      if (key === 'End') { event.preventDefault(); return go(total - 1); }
      if (key === 'o' || key === 'O' || key === 'ف') return setOverview((value) => !value);
      if (key === 'f' || key === 'F' || key === 'ب') return presenting ? exitPresenting() : startPresenting();
      if (key === 'Escape') {
        if (overview) return setOverview(false);
        if (presenting) return exitPresenting();
      }
      return undefined;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, total, overview, presenting, go, startPresenting, exitPresenting]);

  return (
    <div className={`fd-deck${presenting ? ' is-presenting' : ''}`} ref={rootRef}>
      {!presenting && (
        <header className="fd-toolbar">
          <a href={`${base}/dashboard/reports`}><Chevron direction="back" /><span>مركز التقارير</span></a>
          <div><b>{meetingMeta.docNumber}</b><span>{meetingMeta.subtitle}</span></div>
          <a className="fd-open" href={`${base}${MANUAL_PATH}`} target="_blank" rel="noreferrer"><LaunchIcon /> فتح الشرائح</a>
        </header>
      )}

      <main className="fd-stage">
        <div className="fd-slidebar">
          <b>{pad(current + 1)}</b>
          <h2>{slide.title}</h2>
          <span>{slide.axis}</span>
        </div>
        {/*
          `key` يُعيد تركيب الإطار عند تغيّر الشريحة عمدًا: قارئ PDF في
          المتصفّح **لا يستجيب لتغيير المرساة وحدها** على المصدر نفسه، فيبقى
          على الصفحة الأولى مهما تغيّر `#page` (قِيس حيًّا). وإعادةُ التركيب
          تفتحه على الصفحة المطلوبة — والملفّ من ذاكرة المتصفّح لا الشبكة.
        */}
        <iframe
          key={current}
          className="fd-frame"
          src={frameSrc}
          title={`${meetingMeta.docNumber} — ${slide.title}`}
        />
      </main>

      <footer className="fd-controls">
        <div className="fd-progress" aria-hidden="true"><i style={{ width: `${((current + 1) / total) * 100}%` }} /></div>
        <div className="fd-controls-row">
          <div className="fd-controls-side">
            {presenting
              ? <button type="button" className="fd-btn fd-btn-exit" onClick={exitPresenting}><CloseIcon /> إنهاء العرض</button>
              : <button type="button" className="fd-btn fd-btn-play" onClick={startPresenting}><PlayIcon /> بدء العرض</button>}
            <button type="button" className="fd-btn" onClick={() => setOverview(true)}><GridIcon /> فهرس الشرائح</button>
          </div>
          <div className="fd-controls-nav">
            <button type="button" className="fd-btn fd-btn-step" onClick={() => go(current - 1)} disabled={current === 0}><Chevron direction="back" /> السابق</button>
            <span className="fd-counter"><b>{pad(current + 1)}</b> / {pad(total)}</span>
            <button type="button" className="fd-btn fd-btn-step" onClick={() => go(current + 1)} disabled={current === total - 1}>التالي <Chevron /></button>
          </div>
          <div className="fd-controls-side fd-controls-dots">
            <nav aria-label="الانتقال المباشر بين الشرائح">
              {slides.map((item, index) => (
                <button type="button" key={item.title + item.page} title={`${pad(index + 1)} — ${item.title}`} className={index === current ? 'is-current' : ''} onClick={() => go(index)} aria-label={item.title} />
              ))}
            </nav>
          </div>
        </div>
      </footer>

      {overview && (
        <div className="fd-overview" role="dialog" aria-modal="true" aria-label="فهرس الشرائح">
          <header>
            <b>محاور الاجتماع · {pad(total)} شريحة من الدليل</b>
            <button type="button" className="fd-btn fd-btn-exit" onClick={() => setOverview(false)}><CloseIcon /> إغلاق الفهرس</button>
          </header>
          <div>
            {slides.map((item, index) => (
              <button type="button" key={item.title + item.page} className={index === current ? 'is-current' : ''} onClick={() => { go(index); setOverview(false); }}>
                <b>{item.axis}</b><span>{item.title}</span>
              </button>
            ))}
          </div>
          <p>
            شاشات البوابة: {portalScreens.map(([label, path]) => (
              <a key={path} href={`${base}${path}`} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline', marginInlineEnd: '.6rem' }}>{label}</a>
            ))}
            <br />
            اختصارات لوحة المفاتيح: {keyboardHelp.map(([key, label]) => <span key={key}><b>{key}</b> {label} </span>)}
          </p>
        </div>
      )}
    </div>
  );
}
