import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { agenda, allDecisions, executiveSlides, meetingMeta, sections, slides } from '../../data/gm-meeting.js';

/*
  ═══════════════════════════════════════════════════════════════════
  لوحة الرسم الثابتة 1280×720
  ═══════════════════════════════════════════════════════════════════
  كل شريحة تُرسم على مقاسٍ واحد ثم تُكبَّر أو تُصغَّر ككتلةٍ واحدة، فلا تنكسر
  النِّسَب بين شاشة الحاسوب وجهاز العرض في قاعة الاجتماع — نفس مبدأ
  `NovaMeetingDeck` و`EngineeringMeetingDeck`، بُني هناك وأثبت نفسه حيًّا.
*/
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const useFitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* ── أيقونات خطّية مرسومة هنا — لا مكتبة أيقونات ولا CDN ───────────── */
const Chevron = ({ direction = 'next' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d={direction === 'next' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);
const LayersIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DocIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GridIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── أدوات عرض صغيرة ──────────────────────────────────────────────── */

/** نبرة العنصر: نستنتجها من وسمه حين لا يصرّح المصدر بها. */
function toneOf(item) {
  if (item?.tone) return item.tone;
  const tag = item?.tag || '';
  if (/متفق|منجز|مكتمل|مطبق|جاهز|مغطى|مطابق|منفذ/.test(tag)) return 'good';
  if (/يحتاج|متابعة|قيد|جزئي|مقترح|انتظار|مؤجل/.test(tag)) return 'warn';
  if (/غير مغطى|متأخر|معلق|مخاطرة|عائق/.test(tag)) return 'bad';
  return 'info';
}

const Tag = ({ text, tone }) => (text ? <span className={`gm-tag is-${tone}`}>{text}</span> : null);

const SlideHead = ({ kicker, title, note }) => (
  <header className="gm-slide-head">
    {kicker && <p>{kicker}</p>}
    <h2>{title}</h2>
    {note && <span>{note}</span>}
  </header>
);

/** مسار أصلٍ ثابت تحت `public/` — `base` يُمرَّر من الصفحة (نشرٌ تحت مسارٍ فرعي). */
const asset = (base, path) => (path ? `${base}/${path}` : '');

/* ── كتل المحتوى ──────────────────────────────────────────────────── */

function BlockBody({ block }) {
  const items = block.items || [];
  switch (block.type) {
    case 'cards':
      return (
        <div className={`gm-cards count-${Math.min(items.length, 9)}`}>
          {items.map((item, index) => (
            <article key={`${item.title}-${index}`} className="gm-card">
              <h3>{item.title}</h3>
              {item.text && <p>{item.text}</p>}
              <Tag text={item.tag} tone={toneOf(item)} />
            </article>
          ))}
        </div>
      );
    case 'list':
      return (
        <ul className="gm-list">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <div>
                <strong>{item.title}<Tag text={item.tag} tone={toneOf(item)} /></strong>
                {item.text && <span>{item.text}</span>}
              </div>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <div className={`gm-steps count-${Math.min(items.length, 8)}`}>
          {items.map((item, index) => (
            <article key={`${item.title}-${index}`}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <h3>{item.title}</h3>
              {item.text && <p>{item.text}</p>}
            </article>
          ))}
        </div>
      );
    case 'timeline':
      return (
        <ol className="gm-timeline">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              {item.when && <span className="gm-when">{item.when}</span>}
              <h3>{item.title}</h3>
              {item.text && <p>{item.text}</p>}
            </li>
          ))}
        </ol>
      );
    case 'bars':
      return (
        <div className="gm-bars">
          {items.map((item, index) => {
            const value = Number.isFinite(item.value) ? Math.max(0, Math.min(100, item.value)) : null;
            return (
              <div key={`${item.title}-${index}`} className="gm-bar">
                <div>
                  <strong>{item.title || item.label}</strong>
                  {value !== null && <i>{value}%</i>}
                </div>
                <span className="gm-track"><span style={{ width: `${value ?? 0}%` }} /></span>
                {item.text && <small>{item.text}</small>}
              </div>
            );
          })}
        </div>
      );
    case 'table': {
      const head = block.head || [];
      const statusCols = new Set(
        head.map((cell, index) => (/الحالة|حالة|الوضع|الموقف|التغطية|الجاهزية|النتيجة|التنفيذ|المتابعة|التقييم/.test(cell) ? index : -1)).filter((index) => index >= 0),
      );
      return (
        <div className="gm-table-wrap">
          <table className="gm-table">
            <thead><tr>{head.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
            <tbody>
              {(block.rows || []).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => {
                    const text = String(cell ?? '').trim();
                    const tone = toneOf({ tag: text });
                    const asTag = statusCols.has(cellIndex) && text && text.length <= 34 && tone !== 'info';
                    return <td key={cellIndex}>{asTag ? <Tag text={text} tone={tone} /> : text}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'callout':
      return (
        <div className={`gm-callout is-${block.tone || 'info'}`}>
          {block.title && <strong>{block.title}</strong>}
          <p>{block.text}</p>
        </div>
      );
    case 'quote':
      return (
        <figure className="gm-quote">
          <blockquote>{block.text}</blockquote>
          {block.note && <figcaption>{block.note}</figcaption>}
        </figure>
      );
    default:
      return block.text ? <div className="gm-callout is-info"><p>{block.text}</p></div> : null;
  }
}

/* ── الشرائح ──────────────────────────────────────────────────────── */

function CoverSlide({ base }) {
  return (
    <section className="gm-slide is-cover" style={{ backgroundImage: `url(${asset(base, meetingMeta.cover)})` }}>
      <div className="gm-cover-veil" />
      <div className="gm-cover-body">
        {/* العنوان العربيّ هو الصدارة — والإنجليزيّ سطرُ تعريفٍ تحته لا عنوانًا
            فوقه. (قرار المالك 2026-10-06: غلافٌ يصدّره «Executive Briefing»
            بالإنجليزية فوق عرضٍ عربيٍّ أمام إدارةٍ عربيّة لا يليق.) */}
        <p className="gm-eyebrow">اجتماع الإدارة العامة · جدول أعمال ومخرجات</p>
        <h1>{meetingMeta.titleAr}</h1>
        <h2 className="gm-ltr">{meetingMeta.titleEn}</h2>
        <p className="gm-cover-sub">{meetingMeta.subtitle}</p>
        <dl className="gm-cover-meta">
          <div><dt>التاريخ</dt><dd>{meetingMeta.dayName} {meetingMeta.date}</dd></div>
          <div><dt>مقدّم العرض</dt><dd>{meetingMeta.preparedBy}</dd></div>
          <div><dt>مرجع الوثيقة</dt><dd className="gm-ltr">{meetingMeta.docNumber}</dd></div>
          <div><dt>ملاحظات وطلبات</dt><dd className="gm-ltr">{allDecisions.length}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function AgendaSlide({ onJump }) {
  return (
    <section className="gm-slide is-agenda">
      <SlideHead kicker="جدول الأعمال" title={`${agenda.length} بنود — ينتهي كلٌّ منها بملاحظاته وطلباته`} />
      <ol className="gm-agenda">
        {agenda.map((item) => (
          <li key={item.key}>
            <button type="button" onClick={() => onJump(item.key)}>
              <b className="gm-ltr">{item.num}</b>
              <span>
                <strong>{item.title}</strong>
                {item.desc && <small>{item.desc}</small>}
                {item.subs.length > 0 && (
                  <em>{item.subs.map((sub) => `${sub.num} ${sub.navTitle}`).join(' · ')}</em>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SectionSlide({ slide, base }) {
  const { section, kpis } = slide;
  const hero = section.hero ? asset(base, section.hero) : null;
  return (
    <section className={`gm-slide is-section${hero ? ' has-hero' : ''}`} style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
      <div className="gm-section-veil" />
      <div className="gm-section-body">
        <span className="gm-section-num gm-ltr">{section.num}</span>
        <div>
          {section.kicker && <p className="gm-eyebrow">{section.kicker}</p>}
          <h2>{section.headline}</h2>
          <p className="gm-lead">{section.lead}</p>
          {kpis.length > 0 && (
            <div className="gm-kpis">
              {kpis.map((kpi, index) => (
                <div key={index}>
                  <b className={/^[\x20-\x7E]+$/.test(kpi.value || '') ? 'gm-ltr' : undefined}>{kpi.value}</b>
                  <span>{kpi.label}</span>
                </div>
              ))}
            </div>
          )}
          {/* ★ وثيقةٌ منشورةٌ يفتحها البندُ في لسانٍ جديد — فلا يضيع العرضُ
              تحت يد المتحدّث. والمسارُ نسبيٌّ يسبقه `base`: عنوانُ نشرتنا
              مثبّتًا في ملفٍّ يُزامَن يصحّ هنا ويخطئ في مستودع الشركة. */}
          {section.link && (
            <a className="gm-doc-link" href={asset(base, section.link.href)} target="_blank" rel="noopener noreferrer">
              <DocIcon /> {section.link.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function BlockSlide({ slide }) {
  const { section, block, part, parts } = slide;
  return (
    <section className="gm-slide">
      <SlideHead
        kicker={`${section.num} · ${section.navTitle}`}
        title={block.title || 'تفصيل'}
        note={parts > 1 ? `جزء ${part} من ${parts}` : block.note}
      />
      <div className="gm-slide-body"><BlockBody block={block} /></div>
      {parts > 1 && block.note && <footer className="gm-slide-note">{block.note}</footer>}
    </section>
  );
}

function NotesSlide({ slide }) {
  const { section, blocks } = slide;
  return (
    <section className="gm-slide">
      <SlideHead kicker={`${section.num} · ${section.navTitle}`} title={blocks[0].title || 'ملاحظات'} />
      <div className="gm-slide-body gm-notes">
        {blocks.map((block, index) => <BlockBody key={index} block={block} />)}
      </div>
    </section>
  );
}

function DiagramSlide({ slide, base }) {
  const { section, diagram } = slide;
  return (
    <section className="gm-slide">
      <SlideHead kicker={`${section.num} · ${section.navTitle}`} title={diagram.title} />
      <div className="gm-slide-body gm-diagram">
        <img src={asset(base, diagram.file)} alt={diagram.title} loading="lazy" />
      </div>
      {diagram.cap && <footer className="gm-slide-note">{diagram.cap}</footer>}
    </section>
  );
}

function GallerySlide({ slide, base }) {
  const { section, gallery } = slide;
  return (
    <section className="gm-slide">
      <SlideHead kicker={`${section.num} · ${section.navTitle}`} title={gallery.title} />
      <div className={`gm-slide-body gm-gallery${gallery.doc ? ' is-doc' : ''} count-${gallery.items.length}`}>
        {gallery.items.map((item, index) => (
          <figure key={index}>
            <img src={asset(base, item.src)} alt={item.cap || gallery.title} loading="lazy" />
            {item.cap && <figcaption>{item.cap}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  );
}

function DecisionsSlide({ slide }) {
  const { section, items } = slide;
  return (
    <section className="gm-slide is-decisions">
      <SlideHead kicker={`${section.num} · ${section.navTitle}`} title="ملاحظات وطلبات" />
      <ol className="gm-decisions">
        {items.map((item, index) => (
          <li key={index}>
            <b className="gm-ltr">{String(index + 1).padStart(2, '0')}</b>
            <div><strong>{item.ask}</strong>{item.why && <span>{item.why}</span>}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClosingSlide({ slide }) {
  return (
    <section className="gm-slide is-closing">
      <SlideHead
        kicker="خلاصة الاجتماع"
        title="القرارات والتوجيهات المطلوبة من الإدارة العامة"
        note={`إجمالي ${allDecisions.length} ملاحظةً وطلبًا على ${agenda.length} بنود`}
      />
      <div className="gm-closing-grid">
        {slide.items.map((item, index) => (
          <article key={index}>
            <span className="gm-ltr">البند {item.sectionNum}</span>
            <strong>{item.ask}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── شرائح العرض التنفيذيّ ─────────────────────────────────────────
   شريحتان لا تعرضان إلّا ما هو مكتوبٌ أصلًا في المحتوى: بطاقةُ بندٍ واحدة
   لكلّ بند، وقائمةُ الطلبات بنصّ الطلب وحده. والتفصيل كلُّه حاضرٌ في الملحق
   المرجعيّ — فلا يُفقد شيء، ولا يُعرض كلُّ شيء. */


function BriefSlide({ slide, base, onDetails }) {
  const { section, kpis, asks } = slide;
  const hero = section.hero ? asset(base, section.hero) : null;
  return (
    <section className={`gm-slide is-brief${hero ? ' has-hero' : ''}`} style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
      <div className="gm-section-veil" />
      <div className="gm-brief-body">
        <header>
          <span className="gm-section-num gm-ltr">{section.num}</span>
          <div>
            {section.kicker && <p className="gm-eyebrow">{section.kicker}</p>}
            <h2>{section.headline}</h2>
          </div>
        </header>
        {kpis.length > 0 && (
          <div className="gm-kpis">
            {kpis.map((kpi, index) => (
              <div key={index}>
                <b className={/^[\x20-\x7E]+$/.test(kpi.value || '') ? 'gm-ltr' : undefined}>{kpi.value}</b>
                <span>{kpi.label}</span>
              </div>
            ))}
          </div>
        )}
        <footer className="gm-brief-asks">
          {/* بندٌ بلا طلبات بندُ عرضٍ لا نقص — فلا يُكتب «0 طلبات». */}
          <span>
            {asks === 0 ? 'بند عرضٍ — لا ملاحظات ولا طلبات عليه' : (
              <>
                ملاحظات وطلبات هذا البند: <b className="gm-ltr">{asks}</b>
                {asks === 1 ? ' طلب' : asks === 2 ? ' طلبان' : asks <= 10 ? ' طلبات' : ' طلبًا'}
              </>
            )}
          </span>
          {/* الملحقُ يُفتح **عند هذا البند** لا من أوّله — فالتفصيلُ يُطلب في
              سياقه، والرجوعُ يعيد إلى البطاقة نفسِها لا إلى الغلاف. */}
          <button type="button" className="gm-details" onClick={() => onDetails(section.key)}>
            <LayersIcon /> تفاصيل هذا البند
          </button>
        </footer>
      </div>
    </section>
  );
}

function AsksSlide({ slide }) {
  return (
    <section className="gm-slide is-asks">
      <SlideHead
        kicker="خلاصة البنود"
        title="ملاحظات وطلبات"
        note={`إجمالي ${allDecisions.length} ملاحظةً وطلبًا على ${agenda.length} بنود — وتفصيلُ كلٍّ في الملحق المرجعيّ`}
      />
      <ol className="gm-asks">
        {slide.items.map((item, index) => (
          <li key={index}>
            <b className="gm-ltr">{String(slide.from + index + 1).padStart(2, '0')}</b>
            <div>
              <strong>{item.ask}</strong>
              <span className="gm-ltr">البند {item.sectionNum}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SignoffSlide({ base }) {
  return (
    <section className="gm-slide is-signoff">
      <SlideHead kicker="الاعتماد" title="إعداد إدارة سلاسل الإمداد والمخازن" />
      <div className="gm-signoff">
        <div>
          {meetingMeta.sig1 && <img src={asset(base, meetingMeta.sig1)} alt="" />}
          <strong>{meetingMeta.preparedBy}</strong>
          <span>{meetingMeta.preparedRole}</span>
        </div>
        <div>
          {meetingMeta.sig2 && <img src={asset(base, meetingMeta.sig2)} alt="" />}
          <strong>{meetingMeta.coPresenter}</strong>
          <span>{meetingMeta.coPresenterRole}</span>
        </div>
      </div>
      <footer className="gm-slide-note">
        {meetingMeta.docNumber} · {meetingMeta.dayName} {meetingMeta.date} · {meetingMeta.scope}
      </footer>
    </section>
  );
}

/**
 * اسمٌ قصيرٌ للشريط السفليّ — آخرُ مقطعٍ بعد الفاصلة الطويلة، فعناوينُ الملحق
 * مركّبةٌ من اسم البند واسم الكتلة ورقم الجزء، وهي للفهرس لا للشريط.
 */
function shortLabel(slide) {
  if (!slide?.title) return '';
  const parts = slide.title.split(' — ');
  return parts.length > 1 ? parts[parts.length - 1] : slide.title;
}

function Slide({ slide, base, onJump, onDetails }) {
  switch (slide.kind) {
    case 'cover': return <CoverSlide base={base} />;
    case 'agenda': return <AgendaSlide onJump={onJump} />;
    case 'section': return <SectionSlide slide={slide} base={base} />;
    case 'block': return <BlockSlide slide={slide} />;
    case 'notes': return <NotesSlide slide={slide} />;
    case 'diagram': return <DiagramSlide slide={slide} base={base} />;
    case 'gallery': return <GallerySlide slide={slide} base={base} />;
    case 'decisions': return <DecisionsSlide slide={slide} />;
    case 'closing': return <ClosingSlide slide={slide} />;
    case 'brief': return <BriefSlide slide={slide} base={base} onDetails={onDetails} />;
    case 'asks': return <AsksSlide slide={slide} />;
    case 'signoff': return <SignoffSlide base={base} />;
    default: return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   اللوحة
   ═══════════════════════════════════════════════════════════════════ */
export default function GmMeetingDeck({ base = '' }) {
  /*
    طبقتان لا عرضان: **التنفيذيّ** هو ما يُدار به الاجتماع (22 شريحة)،
    و**الملحق المرجعيّ** هو العرض الكامل بحاله (140 شريحة) يُفتح عند السؤال
    وحده. والانتقالُ بينهما يبدأ من أوّل شريحة، فلا يقع المتحدّث في شريحةٍ
    لا سياق لها.
  */
  const [annex, setAnnex] = useState(false);
  const [rawActive, setActive] = useState(0);
  const [showIndex, setShowIndex] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const frameRef = useRef(null);

  const deck = annex ? slides : executiveSlides;
  const total = deck.length;
  /*
    ★★★ **الموضعُ يُقصّ على الطبقة الحاليّة** (انهيارٌ حيٌّ 2026-10-06): الرجوعُ
    من الملحق إلى العرض يبدّل الطبقةَ في هذه الرسمة، والموضعُ لا يُصحَّح إلّا
    في أثرٍ **بعدها** — فقرأ المكوّن الشريحةَ 134 من طبقةٍ فيها 23، فجاءت
    `undefined` وانفجر على `slide.kind` قبل أن يصل الأثرُ أصلًا.
    فالقصُّ هنا لا في الأثر: لا تُقرأ شريحةٌ خارج الطبقة ولو لرسمةٍ واحدة.
  */
  const active = Math.min(rawActive, Math.max(0, total - 1));
  const current = deck[active];

  /** أول شريحةٍ لكل بند — للقفز من جدول الأعمال ومن الفهرس. */
  const sectionStarts = useMemo(() => {
    const map = new Map();
    deck.forEach((slide, index) => {
      const opener = annex ? slide.kind === 'section' : slide.kind === 'brief';
      if (opener && !map.has(slide.key)) map.set(slide.key, index);
    });
    return map;
  }, [annex, deck]);

  /*
    ★ الملحقُ يُفتح **عند البند** لا من أوّله. و`pendingKey` يحمل مفتاحَ البند
    بين الطبقتين، لأنّ موضعَ البند يُحسب على الطبقة المقصودة لا الحاليّة —
    فيُؤجَّل القفزُ إلى ما بعد التبديل بأثرٍ يقرأ `sectionStarts` الجديدة.
  */
  const [pendingKey, setPendingKey] = useState(null);

  const toggleAnnex = useCallback(() => {
    setAnnex((value) => !value);
    setActive(0);
    setShowIndex(false);
    setPendingKey(null);
  }, []);

  /** من بطاقة البند التنفيذيّة إلى تفصيله في الملحق — وبالعكس. */
  const openDetails = useCallback((key) => {
    setAnnex(true);
    setShowIndex(false);
    setPendingKey(key);
  }, []);

  const backToBrief = useCallback(() => {
    setAnnex(false);
    setShowIndex(false);
    setPendingKey(current?.key ?? null);
  }, [current]);

  useEffect(() => {
    if (!pendingKey) return;
    const index = sectionStarts.get(pendingKey);
    setActive(index === undefined ? 0 : index);
    setPendingKey(null);
  }, [pendingKey, sectionStarts]);

  const go = useCallback((index) => {
    setActive(Math.max(0, Math.min(total - 1, index)));
  }, [total]);

  const jumpToSection = useCallback((key) => {
    const index = sectionStarts.get(key);
    if (index !== undefined) { go(index); setShowIndex(false); }
  }, [go, sectionStarts]);

  /*
    قياس المقاس: اللوحة مطلقةُ الموضع وممركزة، والمقياس يُمرَّر بمتغيّر CSS
    لا بحالة React — فلا تُعيد ResizeObserver الرسمَ في حلقة، ولا يدفع صندوقُ
    اللوحة (1280×720) التخطيطَ إلى التمدّد كما يحدث لو كانت في السياق العادي.
    (نفس آلية `NovaMeetingDeck` — بُنيت هناك وأثبتت نفسها حيًّا.)
  */
  useFitEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const fit = () => {
      /*
        ★ إزاحةُ رأس اللوحة تُقاس ولا تُفترض: اللوحةُ داخل `#bz-main` وهو مُزاحٌ
        من أعلى الصفحة (قِيس 24 بكسلًا على شاشةٍ عريضة و40 على الضيّقة بسبب
        الرأس الثابت). فـ`height: 100dvh` من رأسٍ مُزاحٍ تتجاوز الشاشة ويُقصّ
        الشريطُ السفليّ — وهنا يُطرح المقيسُ. وفي وضع العرض اللوحةُ مثبّتةٌ
        على الشاشة فالإزاحةُ صفر.
      */
      const deck = deckRef.current;
      if (deck) {
        const top = presenting ? 0 : Math.max(0, Math.round(deck.getBoundingClientRect().top));
        deck.style.setProperty('--gm-top', `${top}px`);
      }
      const { width, height } = frame.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.max(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT), 0.1);
      frame.style.setProperty('--gm-scale', String(scale));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [presenting]);

  /* لوحة المفاتيح: الأسهم بمنطق RTL — اليسار يتقدّم واليمين يرجع. */
  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (event.key) {
        case 'ArrowLeft': case 'PageDown': case ' ': event.preventDefault(); go(active + 1); break;
        case 'ArrowRight': case 'PageUp': event.preventDefault(); go(active - 1); break;
        case 'Home': event.preventDefault(); go(0); break;
        case 'End': event.preventDefault(); go(total - 1); break;
        case 'g': case 'G': setShowIndex((value) => !value); break;
        case 'Escape': if (showIndex) setShowIndex(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, go, showIndex, total]);

  /*
    ★★★ **ملءُ الشاشة على اللوحة نفسها لا على `<html>`** (عطبٌ حيٌّ 2026-10-06:
    وضعُ العرض شاشةٌ بيضاءُ عند المالك).

    كان الطلبُ على `document.documentElement`، فيبقى كلُّ تخطيط الصفحة قائمًا
    داخل ملء الشاشة: اللوحةُ تعيش داخل `#bz-main` **وهو مُزاحٌ** (قِيس: 40
    بكسلًا من الأعلى، و`margin-right: 4.75rem` للشريط الجانبيّ، ورأسٌ ثابتٌ
    يعلوه). واللوحةُ `height: 100dvh` — فمجموعُها يتجاوز الشاشة، ويُرسم في
    المساحة المرئيّة جزءٌ فارغٌ منها.

    والعلاجُ أن تصير **اللوحةُ نفسُها عنصرَ ملء الشاشة**: يقيسها المتصفّحُ
    بالشاشة مباشرةً، فلا يبلغها إزاحةُ أبٍ ولا هامشُه ولا رأسٌ ثابتٌ فوقه.
    ومعه في الأنماط `position: fixed; inset: 0` عند العرض — فلو رفض المتصفّحُ
    ملءَ الشاشة بقيت اللوحةُ مملوءةً سليمةً داخل الصفحة لا منقوصةً.
  */
  const deckRef = useRef(null);

  const togglePresent = useCallback(() => {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const target = deckRef.current || document.documentElement;
    const request = target.requestFullscreen?.bind(target);
    if (!request) { setPresenting((value) => !value); return; }
    // رفضُ المتصفّح لا يعني بقاءَنا في الوضع العاديّ: نعرض داخل الصفحة بملءٍ مثبّت.
    request().catch(() => setPresenting(true));
  }, []);

  useEffect(() => {
    const onChange = () => setPresenting(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* Escape يخرج من عرضِ الصفحة المثبَّت أيضًا — لا من ملء الشاشة وحده. */
  useEffect(() => {
    if (!presenting) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !document.fullscreenElement) setPresenting(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting]);

  return (
    <div ref={deckRef} className={`gm-meeting-deck${presenting ? ' is-presenting' : ''}`}>
      <div className="gm-toolbar">
        <a className="gm-back" href={`${base}/dashboard`}><BackIcon /> لوحة البوابة</a>
        <div className="gm-identity">
          <b>Brandzo</b>
          <span>{meetingMeta.titleAr}</span>
          <span className="gm-ltr">{meetingMeta.docNumber}</span>
        </div>
        <div className="gm-tools">
          {annex && current?.key && (
            <button type="button" className="gm-back-brief" onClick={backToBrief}>
              <BackIcon /> رجوع إلى بطاقة البند
            </button>
          )}
          <button type="button" onClick={toggleAnnex} aria-pressed={annex}>
            <LayersIcon /> {annex ? 'العرض التنفيذيّ' : 'الملحق المرجعيّ'}
          </button>
          <button type="button" onClick={() => setShowIndex(true)}><GridIcon /> الفهرس</button>
          <button type="button" onClick={togglePresent}>
            {presenting ? <CloseIcon /> : <PlayIcon />} {presenting ? 'إنهاء العرض' : 'وضع العرض'}
          </button>
        </div>
      </div>

      <div className="gm-frame" ref={frameRef}>
        <div className="gm-canvas" style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT }}>
          <Slide slide={current} base={base} onJump={jumpToSection} onDetails={openDetails} />
        </div>
      </div>

      <div className="gm-controls">
        <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="السابق">
          <Chevron direction="prev" />
        </button>
        <span className="gm-counter gm-ltr">{active + 1} / {total}</span>
        {/* عنوانُ الشريط سطرٌ واحد: الملحقُ يبني عناوينَ مركّبةً («بندٌ — كتلةٌ
            — (1/2)») تصلح للفهرس ولا تصلح شريطًا تحت العرض. */}
        <span className="gm-current" title={current?.title}>{shortLabel(current)}</span>
        <button type="button" onClick={() => go(active + 1)} disabled={active === total - 1} aria-label="التالي">
          <Chevron direction="next" />
        </button>
      </div>

      {showIndex && (
        <div className="gm-index" role="dialog" aria-label="فهرس الشرائح">
          <div className="gm-index-head">
            <strong>{annex ? 'الملحق المرجعيّ' : 'العرض التنفيذيّ'} — {total} شريحة</strong>
            <button type="button" onClick={() => setShowIndex(false)} aria-label="إغلاق"><CloseIcon /></button>
          </div>
          <div className="gm-index-jump">
            {sections.map((section) => (
              <button type="button" key={section.key} onClick={() => jumpToSection(section.key)}>
                <b className="gm-ltr">{section.num}</b> {section.navTitle}
              </button>
            ))}
          </div>
          <ol className="gm-index-list">
            {deck.map((slide, index) => (
              <li key={slide.title}>
                <button
                  type="button"
                  className={index === active ? 'is-active' : undefined}
                  onClick={() => { go(index); setShowIndex(false); }}
                >
                  <b className="gm-ltr">{index + 1}</b> {slide.title}
                </button>
              </li>
            ))}
          </ol>
          <p className="gm-index-help">
            الأسهم للتنقّل · <span className="gm-ltr">G</span> للفهرس · <span className="gm-ltr">Home</span> و<span className="gm-ltr">End</span> للبداية والنهاية
          </p>
        </div>
      )}
    </div>
  );
}
