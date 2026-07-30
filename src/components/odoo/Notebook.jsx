import { useRef, useState } from 'react';

/**
 * Notebook — دفتر التبويبات لأودو (D2).
 * تبويبات أفقية، الصفحة النشطة ظاهرة والبقية مخفيّة.
 *
 * وصول (R10): نمط WAI-ARIA tabs كامل — role=tablist/tab/tabpanel، aria-selected،
 * وربط aria-controls/aria-labelledby بين التبويب ولوحته، وroving tabindex،
 * وتنقّل بأسهم لوحة المفاتيح (في RTL: يسار = التالي، يمين = السابق) + Home/End.
 *
 * props:
 *   tabs: [{ id, label, content }]   // content = عقدة React
 *   initial: string                  // معرّف التبويب الأوّل (اختياري)
 */
export default function Notebook({ tabs = [], initial }) {
  const [active, setActive] = useState(initial || (tabs[0] && tabs[0].id));
  const btnRefs = useRef({});

  function onKeyDown(e, idx) {
    const last = tabs.length - 1;
    let next = null;
    if (e.key === 'ArrowLeft') next = idx === last ? 0 : idx + 1; // RTL: يسار = التالي
    else if (e.key === 'ArrowRight') next = idx === 0 ? last : idx - 1; // RTL: يمين = السابق
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[next];
    setActive(t.id);
    const ref = btnRefs.current[t.id];
    if (ref) ref.focus();
  }

  return (
    <div className="o_notebook">
      <div className="o_notebook_headers" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            ref={(el) => {
              btnRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className={active === t.id ? 'active' : ''}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          className="o_notebook_page"
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          tabIndex={0}
          hidden={active !== t.id}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
