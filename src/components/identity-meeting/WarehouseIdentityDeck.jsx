import { useCallback, useEffect, useRef, useState } from 'react';
import { REPORT_PATH, keyboardHelp, meetingMeta, sections } from '../../data/warehouse-identity-report.js';

/*
  ═══════════════════════════════════════════════════════════════════
  العرض = التقرير نفسه، قسمًا في كل شريحة
  ═══════════════════════════════════════════════════════════════════
  لا يُعاد رسم شيء ولا يُختصر: يُفتح تقرير التسويق داخل إطارٍ من نفس
  الأصل، ويُحقن فيه سكربتٌ يجمع عُقد الصفحة تحت عناوينها (`section
  .content-section.depth-1`) — لأنّ العناوين في التقرير أقسامٌ مستقلّة
  والمحتوى يليها **شقيقًا** لا ابنًا — ثمّ يُظهر مجموعةً واحدة.

  فرسوم النماذج الـ٤٤٢ وأنماط التقرير وهويّته تبقى كما صمّمها التسويق
  حرفيًّا، ويبقى للعرض ما يخصّه: تنقّلٌ وفهرسٌ وملء شاشة.
*/

/**
 * السكربت المحقون داخل الإطار. يُنفَّذ في سياق التقرير لا في سياق البوابة،
 * ولذلك يُكتب نصًّا: عناصره من DOM التقرير وحده.
 */
const FRAME_SCRIPT = `
(function () {
  if (window.__bzShowSection) return;

  /* أوّل قسمٍ عنوانيّ يدلّ على الحاوية الحقيقيّة — لا نخمّنها باسمٍ قد يتغيّر. */
  var first = document.querySelector('section.content-section.depth-1');
  if (!first) return;
  var host = first.parentElement;

  /*
    ⚠️ تحييد شبكة القشرة **قبل** إخفاء الشريط الجانبي: القشرة شبكةٌ بعمودَين
    (شريطٌ ثمّ محتوى)، فإخفاء الشريط بـdisplay:none يُزيح main إلى عمود
    الشريط الضيّق فينهار المحتوى إلى 253px (قِيس حيًّا). فتُجعل القشرة block.
  */
  var style = document.createElement('style');
  style.textContent = [
    '.report-shell { display: block !important; grid-template-columns: none !important; }',
    '.sidebar, .mobile-overlay, .side-toggle, .toolbar, .report-footer { display: none !important; }',
    'main { margin: 0 !important; max-width: none !important; width: 100% !important; }',
    'main > .content { max-width: none !important; }',
    'html, body { background: #fff !important; overflow-x: hidden; }'
  ].join('\\n');
  document.head.appendChild(style);

  /* العنوان قسمٌ مستقلّ والمحتوى يليه شقيقًا — فتُجمع العقد بين عنوانٍ وعنوان. */
  var kids = Array.prototype.slice.call(host.children);
  var cover = [];
  var groups = [];
  var bag = null;
  kids.forEach(function (node) {
    if (node.matches && node.matches('section.content-section.depth-1')) {
      bag = []; groups.push(bag);
    }
    (bag || cover).push(node);
  });

  /*
    كتل الغلاف ليست كلّها داخل الحاوية: الصورة الكبيرة والنماذج المميّزة
    والمقدّمة تقع في «main» خارجها. فبدل تعدادها بالاسم — وقد تتغيّر أسماؤها
    مع أيّ تحديثٍ للتقرير — تُؤخذ **كلّ** أبناء main عدا الفرع الذي يحوي
    الحاوية. (بقاؤها ظاهرةً كان يُبقي الغلاف مرسومًا فوق كلّ قسم.)
  */
  var main = document.querySelector('main');
  var outside = [];
  var node = host;
  while (node && node !== main && node.parentElement) {
    var parent = node.parentElement;
    Array.prototype.slice.call(parent.children).forEach(function (sib) {
      if (sib !== node) outside.push(sib);
    });
    node = parent;
  }

  window.__bzShowSection = function (index) {
    var onCover = (index === -1);
    outside.forEach(function (n) { n.style.display = onCover ? '' : 'none'; });
    cover.forEach(function (n) { n.style.display = onCover ? '' : 'none'; });
    groups.forEach(function (g, i) {
      var show = (i === index) ? '' : 'none';
      g.forEach(function (n) { n.style.display = show; });
    });
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (host.parentElement) host.parentElement.scrollTop = 0;
  };
  window.__bzSectionCount = groups.length;
})();
`;

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

/** الشرائح: غلاف التقرير ثمّ أقسامه الستّة والعشرون. */
const SLIDES = [{ n: '—', title: 'غلاف التقرير', anchor: '' }, ...sections];

export default function WarehouseIdentityDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [ready, setReady] = useState(false);
  const rootRef = useRef(null);
  const frameRef = useRef(null);

  const total = SLIDES.length;
  const reportSrc = `${base}${REPORT_PATH}`;

  const go = useCallback((index) => setCurrent((value) => {
    const next = Math.max(0, Math.min(total - 1, index));
    return next === value ? value : next;
  }), [total]);

  /**
   * الحقن **لا يُعلَّق على حدث `load` وحده**: التقرير مِلفٌّ ثقيل قد يكتمل
   * تحميله قبل أن يتماسك React، فيضيع الحدث ويبقى العرض بلا تقسيم (وقع فعلًا).
   * فالدالّة عديمة الأثر عند التكرار، وتُستدعى من الحدث ومن مؤقّتٍ قصير معًا.
   */
  const ensureInjected = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win) return false;
    try {
      if (typeof win.__bzShowSection === 'function') return true;
      if (win.document?.readyState !== 'complete') return false;
      const script = win.document.createElement('script');
      script.textContent = FRAME_SCRIPT;
      win.document.body.appendChild(script);
      return typeof win.__bzShowSection === 'function';
    } catch {
      // إن مُنع الوصول لأي سبب، يبقى التقرير معروضًا كاملًا بلا تقسيم.
      return false;
    }
  }, []);

  useEffect(() => {
    if (ready) return undefined;
    if (ensureInjected()) { setReady(true); return undefined; }
    const timer = window.setInterval(() => {
      if (ensureInjected()) { setReady(true); window.clearInterval(timer); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [ready, ensureInjected]);

  /* تبديل القسم المعروض داخل الإطار عند تغيّر الشريحة. */
  useEffect(() => {
    if (!ready) return;
    try {
      frameRef.current?.contentWindow?.__bzShowSection?.(current - 1);
    } catch {
      /* لا يُسقط العرض */
    }
  }, [current, ready]);

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

  const slide = SLIDES[current];

  return (
    <div className={`idn-deck${presenting ? ' is-presenting' : ''}`} ref={rootRef}>
      {!presenting && (
        <header className="idn-toolbar">
          <a href={`${base}/dashboard/reports`}><Chevron direction="back" /><span>مركز التقارير</span></a>
          <div><b>{meetingMeta.docNumber}</b><span>{meetingMeta.titleAr}</span></div>
          <a className="idn-open" href={reportSrc} target="_blank" rel="noreferrer"><LaunchIcon /> فتح التقرير كاملًا</a>
        </header>
      )}

      <main className="idn-stage">
        <div className="idn-slidebar">
          <b>{slide.n === '—' ? 'الغلاف' : slide.n}</b>
          <h2>{slide.title}</h2>
          <span>{meetingMeta.subtitle}</span>
        </div>
        <iframe
          ref={frameRef}
          className="idn-frame"
          src={reportSrc}
          title={`${meetingMeta.titleAr} — ${slide.title}`}
          onLoad={() => { if (ensureInjected()) setReady(true); }}
        />
      </main>

      <footer className="idn-controls">
        <div className="idn-progress" aria-hidden="true"><i style={{ width: `${((current + 1) / total) * 100}%` }} /></div>
        <div className="idn-controls-row">
          <div className="idn-controls-side">
            {presenting
              ? <button type="button" className="idn-btn idn-btn-exit" onClick={exitPresenting}><CloseIcon /> إنهاء العرض</button>
              : <button type="button" className="idn-btn idn-btn-play" onClick={startPresenting}><PlayIcon /> بدء العرض</button>}
            <button type="button" className="idn-btn" onClick={() => setOverview(true)}><GridIcon /> فهرس الأقسام</button>
          </div>
          <div className="idn-controls-nav">
            <button type="button" className="idn-btn idn-btn-step" onClick={() => go(current - 1)} disabled={current === 0}><Chevron direction="back" /> السابق</button>
            <span className="idn-counter"><b>{pad(current + 1)}</b> / {pad(total)}</span>
            <button type="button" className="idn-btn idn-btn-step" onClick={() => go(current + 1)} disabled={current === total - 1}>التالي <Chevron /></button>
          </div>
          <div className="idn-controls-side idn-controls-dots">
            <nav aria-label="الانتقال المباشر بين الأقسام">
              {SLIDES.map((item, index) => (
                <button type="button" key={item.title} title={`${item.n} — ${item.title}`} className={index === current ? 'is-current' : ''} onClick={() => go(index)} aria-label={item.title} />
              ))}
            </nav>
          </div>
        </div>
      </footer>

      {overview && (
        <div className="idn-overview" role="dialog" aria-modal="true" aria-label="فهرس الأقسام">
          <header>
            <b>فهرس التقرير · {pad(sections.length)} قسمًا</b>
            <button type="button" className="idn-btn idn-btn-exit" onClick={() => setOverview(false)}><CloseIcon /> إغلاق الفهرس</button>
          </header>
          <div>
            {SLIDES.map((item, index) => (
              <button type="button" key={item.title} className={index === current ? 'is-current' : ''} onClick={() => { go(index); setOverview(false); }}>
                <b>{item.n}</b><span>{item.title}</span>
              </button>
            ))}
          </div>
          <p>اختصارات لوحة المفاتيح: {keyboardHelp.map(([key, label]) => <span key={key}><b>{key}</b> {label} </span>)}</p>
        </div>
      )}
    </div>
  );
}
