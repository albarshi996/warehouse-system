import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DECISION_STATES,
  createDecisionSession,
  normalizeDecisionSession,
  summarizeDecisionSession,
  updateDecision,
} from '../../services/executiveReview/decisionSession.js';
import { buildDecisionMinutes } from '../../services/nova/decisionMinutes.js';
import { LOCATION_STATUSES, STORAGE_TYPES } from '../../services/locations/locationsModel.js';
import {
  acceptance,
  agenda,
  asks,
  closingLine,
  closingOutcome,
  codeExample,
  codeLevels,
  decisionPoints,
  deliverables,
  designFamilies,
  executiveLead,
  gates,
  gatesRule,
  governingRule,
  howTo,
  keyboardHelp,
  meetingMeta,
  objectives,
  ownership,
  ownershipNote,
  phases,
  portalShortcuts,
  scopeFacts,
  slideIndex,
  source,
  urgentPriorities,
  zones,
  zonesNote,
} from '../../data/warehouse-identity-meeting.js';

/*
  ═══════════════════════════════════════════════════════════════════
  لوحة الرسم الثابتة 1280×720 — الهيكل من `meeting-deck.css` المشترك
  ═══════════════════════════════════════════════════════════════════
*/
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const DECISIONS_KEY = 'brandzo:warehouse-identity:decisions:v1';

const useFitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

const SlideHead = ({ kicker, title, intro }) => (
  <header className="mtg-slide-head">
    <p>{kicker}</p>
    <h2>{title}</h2>
    {intro && <span>{intro}</span>}
  </header>
);

const pad = (value) => String(value).padStart(2, '0');

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* نجرّب المسار القديم */
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

function shortcutHref(base, key) {
  const item = portalShortcuts[key];
  if (!item) return base;
  return `${base}${item.path}${item.query ? `?${item.query}` : ''}`;
}

function ShortcutCard({ base, shortcutKey, compact = false }) {
  const item = portalShortcuts[shortcutKey];
  if (!item) return null;
  return (
    <article className={`mtg-shortcut${compact ? ' is-compact' : ''}`}>
      <header>
        <div>
          <b>{item.label}</b>
          <span dir="ltr">{item.path}</span>
        </div>
        <a href={shortcutHref(base, shortcutKey)} target="_blank" rel="noreferrer"><LaunchIcon /> فتح الشاشة</a>
      </header>
      <p className="mtg-shortcut-purpose">{item.purpose}</p>
      <ol className="mtg-shortcut-clicks">
        {item.clicks.map((click, index) => <li key={click}><i>{index + 1}</i><span>{click}</span></li>)}
      </ol>
      <footer><b>الدليل:</b> {item.evidence}</footer>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   الشرائح
   ═══════════════════════════════════════════════════════════════════ */

function Cover() {
  return (
    <div className="mtg-cover">
      <p>إدارة السلاسل والإمداد والمخازن — Brandzo Hub · {meetingMeta.counterpart}</p>
      <div>
        <span>{meetingMeta.docNumber} · الإصدار {meetingMeta.version} · {meetingMeta.status}</span>
        <h1>Operational<br /><i>Identity</i></h1>
        <h2>{meetingMeta.titleAr}</h2>
        <p className="mtg-cover-sub">{meetingMeta.subtitle}</p>
      </div>
      <footer>
        <div><b>{meetingMeta.preparedBy}</b><span>{meetingMeta.preparedRole}</span></div>
        <div><b>{meetingMeta.scope}</b><span>المواقع ضمن النطاق</span></div>
        <div><b>{meetingMeta.date}</b><span>تاريخ الوثيقة</span></div>
      </footer>
    </div>
  );
}

function HowToSlide() {
  return (
    <>
      <SlideHead
        kicker="قبل أن نبدأ"
        title="محور هذه الجلسة تقريرُ التسويق البصريّ — ومعه ما هو مبنيٌّ في البوابة"
        intro={`${source.title} · ${source.issuer} · ${source.date}. حالته: ${source.status}.`}
      />
      <div className="mtg-howto">
        {howTo.map((item) => (
          <section key={item.tag}><b>{item.tag}</b><h3>{item.title}</h3><p>{item.body}</p></section>
        ))}
      </div>
      <div className="mtg-keys">
        <span>اختصارات لوحة المفاتيح</span>
        {keyboardHelp.map(([key, label]) => <p key={key}><kbd>{key}</kbd>{label}</p>)}
      </div>
    </>
  );
}

function AgendaSlide() {
  return (
    <>
      <SlideHead kicker="جدول الأعمال" title="ستة محاور — من التقرير إلى القرار" />
      <div className="mtg-agenda">
        {agenda.map(([index, title, detail]) => (
          <div key={index}><b>{index}</b><h3>{title}</h3><p>{detail}</p></div>
        ))}
      </div>
    </>
  );
}

function ScopeSlide() {
  return (
    <>
      <SlideHead kicker="المحور 01 · الملخص التنفيذي" title="منظومةٌ واحدة — لا مجموعةَ لوحاتٍ منفصلة" intro={executiveLead} />
      <div className="mtg-masters">
        {scopeFacts.map(([value, label, detail]) => (
          <div key={label}>
            <b>{value}</b>
            <div><h3>{label}</h3><p>{detail}</p></div>
          </div>
        ))}
      </div>
      <p className="mtg-note">
        المصدر: {source.title} — {source.sections} قسمًا و{source.models} نموذجًا بصريًّا في {source.families} عائلة تصميم،
        و{source.urgentSites} من المواقع الأربعة بأولويةٍ عاجلة.
      </p>
    </>
  );
}

function RuleSlide({ base }) {
  return (
    <>
      <SlideHead kicker="المحور 01 · القاعدة الحاكمة" title={governingRule.headline} />
      <div className="mtg-split">
        <div className="mtg-side">
          <ul className="mtg-bullets">{governingRule.points.map((point) => <li key={point}>{point}</li>)}</ul>
          <div className="mtg-callout"><b>خلاصة المحور</b><p>{governingRule.closing}</p></div>
        </div>
        <ShortcutCard base={base} shortcutKey="warehouses" />
      </div>
    </>
  );
}

function OwnershipSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 01 · الحدّ بين الجهات"
        title="ستّ جهاتٍ في مشروعٍ واحد — ولكلٍّ ما تملكه"
        intro="أكثر ما يُعطّل مشاريع اللوحات ليس التصميم بل انتظارُ كلّ جهةٍ للأخرى. هذا الجدول يُنهي ذلك قبل أن يبدأ."
      />
      <div className="mtg-table-wrap">
        <table className="mtg-table">
          <thead>
            <tr><th style={{ width: '34%' }}>الطبقة</th><th style={{ width: '28%' }}>المالك</th><th>ما يُسلّمه</th></tr>
          </thead>
          <tbody>
            {ownership.map(([layer, owner, output]) => (
              <tr key={layer}><td><b>{layer}</b></td><td>{owner}</td><td>{output}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mtg-table-note">{ownershipNote}</p>
    </>
  );
}

function ObjectivesSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 01 · الأهداف"
        title="أحد عشر هدفًا — كلّها تشغيليّة لا تجميليّة"
        intro="مأخوذةٌ من القسم السابع في التقرير كما وردت."
      />
      <div className="mtg-fields is-three">
        {objectives.map((objective, index) => (
          <div key={objective}><b>{pad(index + 1)}</b><span>{objective}</span></div>
        ))}
      </div>
    </>
  );
}

function CodeSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · الترميز"
        title="ستّة مستويات يطلبها التقرير — وستّة مقاطعَ يولّدها النظام"
        intro="ليست مصادفة: هذا هو الكود الذي تكتبه البوابة اليوم لكلّ موقع تخزين، وهو الذي يجب أن يُطبع على الملصق."
      />
      <div className="mtg-split">
        <div className="mtg-side">
          <section>
            <b className="mtg-label">الكود الكامل الذي يحفظه النظام</b>
            <div className="idn-code">
              {codeLevels.map(([id, label], index) => (
                <span key={id}>
                  <b>{codeExample.full.split('-')[index]}</b>
                  <i>{label}</i>
                </span>
              ))}
            </div>
          </section>
          <div className="idn-levels">
            {codeLevels.map(([id, label, sample, why]) => (
              <div key={id}><b>{sample}</b><div><h3>{label}</h3><p>{why}</p></div></div>
            ))}
          </div>
          <div className="mtg-guard">
            <p><b>المختصر الذي يراه العامل: {codeExample.short}</b> — {codeExample.note}</p>
          </div>
        </div>
        <div className="mtg-side">
          <div className="mtg-callout is-gold"><b>قاعدة المحارف</b><p>{codeExample.rule}</p></div>
          <ShortcutCard base={base} shortcutKey="warehouses" compact />
        </div>
      </div>
    </>
  );
}

function StatesSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · الحالات والأنواع"
        title="اللوحة تعرض حالةً وصفةً — وكلتاهما معرَّفةٌ في النظام"
        intro="ستّ حالاتٍ للموقع وسبعة أنواع تخزين. التصميم يحتاجها ليقرّر اللون والخامة وما يُطبع على الملصق."
      />
      <div className="mtg-split">
        <section>
          <b className="mtg-label">حالات الموقع الستّ</b>
          <div className="idn-states">
            {Object.values(LOCATION_STATUSES).map((status) => (
              <div key={status.id}>
                <b>{status.labelAr}</b>
                <span>{status.hint} {status.accepts ? <em className="idn-yes">يستقبل بضاعة</em> : null}</span>
              </div>
            ))}
          </div>
        </section>
        <div className="mtg-side">
          <section>
            <b className="mtg-label">أنواع التخزين السبعة — صفةُ رفٍّ ماديّ</b>
            <div className="mtg-chips">
              {Object.values(STORAGE_TYPES).map((type) => <span key={type.id}>{type.labelAr}</span>)}
            </div>
          </section>
          <ShortcutCard base={base} shortcutKey="coldChain" compact />
        </div>
      </div>
    </>
  );
}

function ZonesSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · المناطق التشغيلية"
        title="اثنتان وعشرون منطقةً لكلٍّ كودٌ وباركودٌ مستقلّ"
        intro={zonesNote}
      />
      <div className="mtg-split is-wide-start">
        <div className="mtg-chips">{zones.map((zone) => <span key={zone}>{zone}</span>)}</div>
        <ShortcutCard base={base} shortcutKey="ledger" compact />
      </div>
    </>
  );
}

function ScanSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · الخريطة والمسح"
        title="قبل أن يُطبع الباركود بالآلاف — يُمسح مرّةً على الجهاز الحقيقيّ"
        intro="الخريطة الشبكية في البوابة تعرض حالة كلّ خانة بلونها، وشاشة المسح تُثبت أنّ الرمز يُقرأ من مسافة العمل وعلى الخامة النهائية."
      />
      <div className="mtg-duo">
        <ShortcutCard base={base} shortcutKey="scan" />
        <ShortcutCard base={base} shortcutKey="directedStorage" />
      </div>
    </>
  );
}

function FamiliesSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · ما هو مطلوب تصميمه"
        title={`اثنتا عشرة عائلة تصميم تجمع ${source.models} نموذجًا بصريًّا`}
        intro="كما صنّفها التقرير — وبجانب كلّ عائلةٍ الشاشةُ التي تُغذّيها بالبيانات."
      />
      <div className="idn-families">
        {designFamilies.map(([title, detail], index) => (
          <div key={title}>
            <b>{pad(index + 1)}</b>
            <h3>{title}</h3>
            <p>{detail}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function UrgentSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 04 · الأولوية العاجلة"
        title="الرحبة وطرابلس أوّلًا — وبستّ أولوياتٍ مرتّبة"
        intro="كما ورد في القسم الخامس: موقعان بأولويةٍ عاجلة، ثمّ أربع أولوياتٍ تمسّ الحركة والمخزون مباشرةً."
      />
      <div className="idn-urgent">
        {urgentPriorities.map(([index, title, detail]) => (
          <div key={index}><b>{index}</b><div><h3>{title}</h3><p>{detail}</p></div></div>
        ))}
      </div>
      <div style={{ marginTop: '1rem' }}>
        <ShortcutCard base={base} shortcutKey="engineering" compact />
      </div>
    </>
  );
}

function DeliverablesSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 04 · مخرجات التسويق"
        title="ثمانية مخرجاتٍ تُسلَّم — أربعة أدلّة وأربعة قوالب"
        intro="القسم الثاني والعشرون من التقرير: ما تُعدّه إدارة التسويق وتسلّمه ليصير مرجعًا يُطبع منه لاحقًا."
      />
      <div className="mtg-split">
        <div className="mtg-fields">
          {deliverables.map((item, index) => (
            <div key={item}><b>{pad(index + 1)}</b><span>{item}</span></div>
          ))}
        </div>
        <ShortcutCard base={base} shortcutKey="archive" />
      </div>
    </>
  );
}

function AsksSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 04 · الطلب"
        title="ثمانية بنودٍ نأمل من التسويق البدء بها"
        intro="القسم الخامس والعشرون — ولا يحتاج أوّلها ميزانيةً ولا مصمّمًا: اسمُ مسؤول مشروعٍ وموعدُ مسحٍ ميدانيّ."
      />
      <div className="mtg-split">
        <div className="mtg-fields">
          {asks.map((item, index) => (
            <div key={item}><b>{pad(index + 1)}</b><span>{item}</span></div>
          ))}
        </div>
        <ShortcutCard base={base} shortcutKey="meetings" />
      </div>
    </>
  );
}

function GatesSlide() {
  return (
    <>
      <SlideHead kicker="المحور 05 · البوابة" title="ستّ خطواتٍ لا تمرّ لوحةٌ إلى الطباعة قبلها" intro={gatesRule} />
      <div className="idn-gates">
        {gates.map(([index, title, detail]) => (
          <div key={index}><b>{index}</b><h3>{title}</h3><p>{detail}</p></div>
        ))}
      </div>
    </>
  );
}

function PhasesSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 05 · المراحل"
        title="أربع مراحل — تبدأ بالحصر لا بالتصميم"
        intro="القسم الثالث والعشرون. والمرحلة الأولى مشتركة: لا تصميمَ قبل أن نعرف كم لوحةً وأين وبأيّ مقاس."
      />
      <div className="idn-phases">
        {phases.map((phase) => (
          <section key={phase.n}>
            <header><b>{phase.n}</b><h3>{phase.title}</h3></header>
            <p>{phase.lead}</p>
            <ul>{phase.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </div>
    </>
  );
}

function AcceptanceSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 05 · معايير القبول"
        title="خمسة عشر معيارًا — يُعدّ المشروع مكتملًا عند تحقّقها"
        intro="القسم الرابع والعشرون. وأهمّها للطرفين معًا المعيار الثالث عشر: توحيد المسمّيات بين اللوحات والنظام والبوابة."
      />
      <ul className="idn-check">
        {acceptance.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </>
  );
}

function DecisionsSlide() {
  const [session, setSession] = useState(() => createDecisionSession(decisionPoints.length));
  const [active, setActive] = useState(0);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DECISIONS_KEY);
      if (raw) setSession(normalizeDecisionSession(JSON.parse(raw), decisionPoints.length));
    } catch {
      /* لا نُسقط العرض بسبب تخزينٍ معطوب */
    }
  }, []);

  const persist = useCallback((next) => {
    setSession(next);
    try {
      window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
    } catch {
      /* التخزين المحلّي قد يكون ممنوعًا — القرار يبقى في الشاشة */
    }
  }, []);

  const patch = (values) => persist(updateDecision(session, active, values));
  const summary = summarizeDecisionSession(session);
  const current = session.decisions[active] ?? {};

  const copyMinutes = async () => {
    const text = buildDecisionMinutes({
      heading: `محضر قرارات — ${meetingMeta.titleAr} (${meetingMeta.docNumber}) · ${meetingMeta.date}`,
      points: decisionPoints,
      session,
    });
    setFlash(await copyText(text) ? 'نُسخ المحضر إلى الحافظة' : 'تعذّر النسخ — انسخه يدويًّا من الشاشة');
    window.setTimeout(() => setFlash(''), 2600);
  };

  return (
    <>
      <SlideHead
        kicker="المحور 06 · نقاط القرار"
        title="ثماني نقاطٍ تُحسم في هذه الجلسة"
        intro="تُسجَّل النتيجة والمسؤول والموعد هنا مباشرةً، وتُنسخ محضرًا جاهزًا بضغطة."
      />
      <div className="mtg-decisions">
        <ul className="mtg-decision-list">
          {decisionPoints.map((point, index) => {
            const status = session.decisions[index]?.status ?? 'pending';
            return (
              <li key={point.title} className={`state-${status}`}>
                <button type="button" className={index === active ? 'is-active' : ''} onClick={() => setActive(index)}>
                  <b>{pad(index + 1)}</b><span>{point.title}</span><i>{DECISION_STATES[status]}</i>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mtg-decision-panel">
          <p className="mtg-decision-ask"><b>{decisionPoints[active].title}:</b> {decisionPoints[active].ask}</p>
          <div className="mtg-decision-vote">
            {Object.entries(DECISION_STATES).filter(([key]) => key !== 'pending').map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={current.status === key ? 'is-selected' : ''}
                onClick={() => patch({ status: current.status === key ? 'pending' : key })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mtg-decision-fields">
            <label>
              المسؤول
              <input type="text" value={current.owner ?? ''} placeholder={decisionPoints[active].owner} onChange={(event) => patch({ owner: event.target.value })} />
            </label>
            <label>
              الموعد
              <input type="text" value={current.due ?? ''} placeholder="مثال: خلال أسبوعين" onChange={(event) => patch({ due: event.target.value })} />
            </label>
            <label className="mtg-wide">
              ما اتُّفق عليه
              <textarea rows={3} value={current.note ?? ''} onChange={(event) => patch({ note: event.target.value })} />
            </label>
          </div>
          <footer>
            <div className="mtg-decision-meter"><i style={{ width: `${(summary.resolved / summary.total) * 100}%` }} /></div>
            <b>{summary.resolved} / {summary.total} محسوم</b>
            <button type="button" onClick={copyMinutes}>نسخ المحضر</button>
            <button type="button" className="mtg-quiet" onClick={() => persist(createDecisionSession(decisionPoints.length))}>تفريغ</button>
          </footer>
          {flash && <p className="mtg-note" style={{ margin: 0 }}>{flash}</p>}
        </div>
      </div>
    </>
  );
}

function OutcomeSlide() {
  return (
    <>
      <SlideHead kicker="إقفال الاجتماع" title="ما الذي يخرج من هذه الجلسة" />
      <div className="mtg-outcome">
        {closingOutcome.map(([index, title, body]) => (
          <section key={index}><b>{index}</b><h3>{title}</h3><p>{body}</p></section>
        ))}
      </div>
      <p className="mtg-outcome-foot"><b>{closingLine}</b></p>
    </>
  );
}

function DeckControls({ current, total, presenting, onGo, onOverview, onStart, onExit }) {
  return (
    <footer className="mtg-controls">
      <div className="mtg-progress" aria-hidden="true"><i style={{ width: `${((current + 1) / total) * 100}%` }} /></div>
      <div className="mtg-controls-row">
        <div className="mtg-controls-side">
          {presenting
            ? <button type="button" className="mtg-btn mtg-btn-exit" onClick={onExit}><CloseIcon /> إنهاء العرض</button>
            : <button type="button" className="mtg-btn mtg-btn-play" onClick={onStart}><PlayIcon /> بدء العرض</button>}
          <button type="button" className="mtg-btn" onClick={onOverview}><GridIcon /> فهرس الشرائح</button>
        </div>
        <div className="mtg-controls-nav">
          <button type="button" className="mtg-btn mtg-btn-step" onClick={() => onGo(current - 1)} disabled={current === 0}><Chevron direction="back" /> السابق</button>
          <span className="mtg-counter"><b>{pad(current + 1)}</b> / {pad(total)}</span>
          <button type="button" className="mtg-btn mtg-btn-step" onClick={() => onGo(current + 1)} disabled={current === total - 1}>التالي <Chevron /></button>
        </div>
        <div className="mtg-controls-side mtg-controls-dots">
          <nav aria-label="الانتقال المباشر بين الشرائح">
            {slideIndex.map((label, index) => (
              <button type="button" key={label} title={`${pad(index + 1)} — ${label}`} className={index === current ? 'is-current' : ''} onClick={() => onGo(index)} aria-label={label} />
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default function WarehouseIdentityDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);

  const slides = useMemo(() => [
    <Cover key="cover" />,
    <HowToSlide key="howto" />,
    <AgendaSlide key="agenda" />,
    <ScopeSlide key="scope" />,
    <RuleSlide key="rule" base={base} />,
    <OwnershipSlide key="ownership" />,
    <ObjectivesSlide key="objectives" />,
    <CodeSlide key="code" base={base} />,
    <StatesSlide key="states" base={base} />,
    <ZonesSlide key="zones" base={base} />,
    <ScanSlide key="scan" base={base} />,
    <FamiliesSlide key="families" />,
    <UrgentSlide key="urgent" base={base} />,
    <DeliverablesSlide key="deliverables" base={base} />,
    <AsksSlide key="asks" base={base} />,
    <GatesSlide key="gates" />,
    <PhasesSlide key="phases" />,
    <AcceptanceSlide key="acceptance" />,
    <DecisionsSlide key="decisions" />,
    <OutcomeSlide key="outcome" />,
  ], [base]);

  const total = slides.length;
  const go = useCallback((index) => setCurrent((value) => {
    const next = Math.max(0, Math.min(total - 1, index));
    return next === value ? value : next;
  }), [total]);

  useFitEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      stage.style.setProperty('--mtg-scale', String(Math.max(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT), 0.1)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [presenting]);

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
      // شريحة القرارات تحوي حقولًا حيّة — المفاتيح فيها للكتابة لا للتنقّل.
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

      const key = event.key;
      const onControl = target instanceof HTMLElement && target.closest('button, a');
      if ((key === ' ' || key === 'Enter') && onControl) return;

      if (key === 'ArrowLeft' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') { event.preventDefault(); return go(current + 1); }
      if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'PageUp') { event.preventDefault(); return go(current - 1); }
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
    <div className={`mtg-deck${presenting ? ' is-presenting' : ''}`} ref={rootRef}>
      {!presenting && (
        <header className="mtg-toolbar">
          <a href={`${base}/dashboard/reports`}><Chevron direction="back" /><span>مركز التقارير</span></a>
          <div><b>{meetingMeta.docNumber}</b><span>{meetingMeta.titleAr}</span></div>
          <p className="mtg-toolbar-slide">{slideIndex[current]}</p>
        </header>
      )}

      <main className="mtg-stage" ref={stageRef} aria-live="polite">
        <div className="mtg-canvas">
          {slides.map((content, index) => (
            <article key={slideIndex[index]} className={`mtg-slide${current === index ? ' is-active' : ''}`} aria-hidden={current !== index}>{content}</article>
          ))}
        </div>
      </main>

      <DeckControls
        current={current}
        total={total}
        presenting={presenting}
        onGo={go}
        onOverview={() => setOverview(true)}
        onStart={startPresenting}
        onExit={exitPresenting}
      />

      {overview && (
        <div className="mtg-overview" role="dialog" aria-modal="true" aria-label="فهرس الشرائح">
          <header>
            <b>فهرس الشرائح · {pad(total)} شريحة</b>
            <button type="button" className="mtg-btn mtg-btn-exit" onClick={() => setOverview(false)}><CloseIcon /> إغلاق الفهرس</button>
          </header>
          <div>
            {slideIndex.map((label, index) => (
              <button type="button" key={label} className={index === current ? 'is-current' : ''} onClick={() => { go(index); setOverview(false); }}>
                <b>{pad(index + 1)}</b><span>{label}</span>
              </button>
            ))}
          </div>
          <p>اختصارات لوحة المفاتيح: {keyboardHelp.map(([key, label]) => <span key={key}><b>{key}</b> {label} </span>)}</p>
        </div>
      )}
    </div>
  );
}
