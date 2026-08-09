import { useEffect, useMemo, useState } from 'react';

const Arrow = ({ direction = 'next' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={direction === 'next' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Cover({ sector }) {
  return (
    <>
      <div className="cover-index">عرض القطاع · {sector.short}</div>
      <div className="cover-copy">
        <p>{sector.status}</p>
        <h1>{sector.name}</h1>
        <h2>{sector.subtitle}</h2>
      </div>
      <div className="cover-foot"><span>النموذج التشغيلي الموحّد لتزويد القطاعات والفروع</span><span>محتوى مستخرج من المصدر المقدم</span></div>
    </>
  );
}

const SlideHead = ({ slide }) => (
  <>
    <div className="slide-kicker">{slide.label}</div>
    <h2>{slide.title}</h2>
    {slide.intro && <p className="slide-intro">{slide.intro}</p>}
  </>
);

function ItemGrid({ items = [], ordered = false }) {
  return (
    <div className={`item-grid${ordered ? ' is-ordered' : ''}`}>
      {items.map((item, index) => (
        <div key={`${item}-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{item}</span></div>
      ))}
    </div>
  );
}

function RoleGrid({ roles = [] }) {
  return (
    <div className="role-grid">
      {roles.map(([role, owner]) => <div key={`${role}-${owner}`}><span>{role}</span><strong>{owner}</strong></div>)}
    </div>
  );
}

function SlideBody({ slide }) {
  if (slide.type === 'cover') return <Cover sector={slide.sector} />;

  if (slide.type === 'comparison') {
    return (
      <><SlideHead slide={slide} /><div className={`comparison-grid columns-${Math.min(slide.columns.length, 3)}`}>
        {slide.columns.map((column) => (
          <section key={column.title}><span>{column.tag}</span><h3>{column.title}</h3><ul>{column.items.map((item) => <li key={item}>{item}</li>)}</ul></section>
        ))}
      </div></>
    );
  }

  if (slide.type === 'hierarchy') {
    return (
      <><SlideHead slide={slide} /><div className="hierarchy-path">{slide.path.map((item) => <span key={item}>{item}</span>)}</div>
        <div className="detail-lines">{slide.details.map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>
        {slide.note && <p className="evidence-note">{slide.note}</p>}
      </>
    );
  }

  if (slide.type === 'flow') {
    return (
      <><SlideHead slide={slide} /><div className={`flow-line steps-${slide.steps.length}`}>
        {slide.steps.map(([code, label]) => <div className="flow-step" key={`${code}-${label}`}><b>{code}</b><span>{label}</span></div>)}
      </div>
        {slide.codes && <div className="code-example"><span>مثال الترميز</span>{slide.codes.map((code) => <b key={code}>{code}</b>)}</div>}
        {slide.note && <p className="evidence-note">{slide.note}</p>}
      </>
    );
  }

  if (['list', 'status', 'questions', 'metrics'].includes(slide.type)) {
    return (
      <><SlideHead slide={slide} /><ItemGrid items={slide.items} ordered={slide.type === 'questions'} />
        {slide.footer && <p className="closing-line">{slide.footer}</p>}
      </>
    );
  }

  if (slide.type === 'steps') {
    return (
      <><SlideHead slide={slide} /><div className="step-stack">{slide.items.map((item, index) => <div key={item}><b>{String(index + 1).padStart(2, '0')}</b><p>{item}</p></div>)}</div>
        {slide.footer && <p className="closing-line">{slide.footer}</p>}
      </>
    );
  }

  if (slide.type === 'review') {
    return (
      <><SlideHead slide={slide} /><div className="review-layout"><ItemGrid items={slide.items} /><RoleGrid roles={slide.roles} /></div>
        {slide.note && <p className="evidence-note">{slide.note}</p>}
      </>
    );
  }

  if (slide.type === 'document') {
    return (
      <><SlideHead slide={slide} /><div className="document-layout">
        {slide.fields?.length > 0 && <ItemGrid items={slide.fields} />}
        <RoleGrid roles={slide.roles} />
      </div>
        {slide.outcome && <div className="document-outcome"><span>الأثر</span><strong>{slide.outcome}</strong></div>}
        {slide.note && <p className="evidence-note">{slide.note}</p>}
      </>
    );
  }

  if (slide.type === 'cadence') {
    return (
      <><SlideHead slide={slide} /><div className="cadence-grid">{slide.columns.map(([title, items]) => (
        <section key={title}><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ))}</div></>
    );
  }

  if (slide.type === 'decisions') {
    return (
      <><SlideHead slide={slide} /><ol className="decision-list">{slide.items.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, '0')}</b><span>{item}</span></li>)}</ol>
        <div className="next-step"><span>المخرج المطلوب</span><strong>{slide.outcome}</strong></div>
      </>
    );
  }

  return null;
}

export default function SectorDeck({ sector, base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const slides = useMemo(() => [
    { type: 'cover', label: 'الغلاف', title: sector.name, sector },
    ...sector.slides,
  ], [sector]);

  const go = (index) => setCurrent(Math.max(0, Math.min(slides.length - 1, index)));

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'PageDown' || event.key === ' ') go(current + 1);
      if (event.key === 'ArrowRight' || event.key === 'PageUp') go(current - 1);
      if (event.key === 'Home') go(0);
      if (event.key === 'End') go(slides.length - 1);
      if (event.key.toLowerCase() === 'o') setOverview((value) => !value);
      if (event.key === 'Escape') setOverview(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, slides.length]);

  return (
    <div className="sector-deck" data-tone={sector.statusTone}>
      <header className="deck-toolbar">
        <a className="back-link" href={`${base}/dashboard/sector-presentations`}><Arrow direction="back" /><span>كل القطاعات</span></a>
        <div className="deck-identity"><b>{sector.short}</b><span>{sector.name}</span></div>
        <button type="button" className="overview-button" onClick={() => setOverview(true)}>فهرس الشرائح</button>
      </header>

      <main className="deck-stage" aria-live="polite">
        {slides.map((slide, index) => (
          <article key={`${slide.label}-${index}`} className={`sector-slide slide-${slide.type}${current === index ? ' is-active' : ''}`} data-slide-index={index} data-tone={slide.tone || ''} aria-hidden={current !== index}>
            <SlideBody slide={slide} />
          </article>
        ))}
      </main>

      <footer className="deck-controls">
        <button type="button" onClick={() => go(current - 1)} disabled={current === 0} aria-label="الشريحة السابقة"><Arrow direction="back" /></button>
        <nav aria-label="التنقل بين الشرائح">
          {slides.map((slide, index) => <button type="button" key={`${slide.label}-${index}`} className={current === index ? 'is-current' : ''} onClick={() => go(index)} aria-label={slide.label}></button>)}
        </nav>
        <span>{String(current + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
        <button type="button" onClick={() => go(current + 1)} disabled={current === slides.length - 1} aria-label="الشريحة التالية"><Arrow /></button>
      </footer>

      {overview && (
        <div className="overview-layer" role="dialog" aria-modal="true" aria-label="فهرس الشرائح">
          <button className="overview-close" type="button" onClick={() => setOverview(false)} aria-label="إغلاق الفهرس">×</button>
          <div className="overview-grid">
            {slides.map((slide, index) => (
              <button type="button" key={`${slide.label}-${index}`} onClick={() => { go(index); setOverview(false); }}>
                <b>{String(index + 1).padStart(2, '0')}</b><span>{slide.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
