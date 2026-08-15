import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DECISION_STATES,
  createDecisionSession,
  normalizeDecisionSession,
  summarizeDecisionSession,
  updateDecision,
} from '../../services/executiveReview/decisionSession.js';
import { buildDecisionMinutes } from '../../services/nova/decisionMinutes.js';
import {
  agenda,
  brandScope,
  closingCriteria,
  decisionPoints,
  deliveryPackage,
  documentCycles,
  documentShortcutGrid,
  escalation,
  executionSteps,
  executiveSummary,
  governanceGate,
  keyboardHelp,
  kpis,
  meetingMeta,
  objectives,
  outOfScope,
  portalShortcuts,
  raciColumns,
  raciLegend,
  raciRows,
  responsibilities,
  risks,
  slideIndex,
  timeline,
  varianceRules,
} from '../../data/nova-meeting.js';

/*
  ═══════════════════════════════════════════════════════════════════
  لوحة الرسم الثابتة 1280×720
  ═══════════════════════════════════════════════════════════════════
  كل شريحة تُرسم على مقاسٍ واحد ثم تُكبَّر أو تُصغَّر ككتلةٍ واحدة، فلا
  تنكسر النِّسَب بين شاشة الحاسوب وجهاز العرض في قاعة الاجتماع.
  (نفس مبدأ `EngineeringMeetingDeck` — بُني هناك وأثبت نفسه حيًّا.)
*/
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const DECISIONS_KEY = 'brandzo:nova-meeting:decisions:v1';

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

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

const LaunchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SlideHead = ({ kicker, title, intro }) => (
  <header className="nv-slide-head">
    <p>{kicker}</p>
    <h2>{title}</h2>
    {intro && <span>{intro}</span>}
  </header>
);

/**
 * نسخٌ إلى الحافظة بمسارين: الواجهة الحديثة، ثم `execCommand` القديم.
 * لماذا القديم احتياطًا؟ لأن `navigator.clipboard` يفشل في السياق غير المركَّز
 * وفي بعض المتصفّحات داخل ملء الشاشة — وهو بالضبط وضع العرض في الاجتماع.
 */
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

/** رابط الشاشة داخل البوابة — `base` يُمرَّر من الصفحة (نشر تحت مسارٍ فرعيّ). */
function shortcutHref(base, key) {
  const item = portalShortcuts[key];
  if (!item) return base;
  return `${base}${item.path}${item.query ? `?${item.query}` : ''}`;
}

/*
  ═══════════════════════════════════════════════════════════════════
  بطاقة الاختصار — العنصر الذي طُلب هذا العرض من أجله
  ═══════════════════════════════════════════════════════════════════
  لا تكتفي بقول «افتح شاشة كذا»: تُسمّي الشاشة ومسارها، وتُعدّد النقرات
  بنصّ أزرارها الحقيقيّ، وتُعلن الدليل الذي تُخرجه الخطوة — ثم تفتحها
  في تبويبٍ مستقل حتى لا ينكسر العرض أثناء الاجتماع.
*/
function ShortcutCard({ base, shortcutKey, compact = false }) {
  const item = portalShortcuts[shortcutKey];
  if (!item) return null;
  return (
    <article className={`nv-shortcut${compact ? ' is-compact' : ''}`}>
      <header>
        <div>
          <b>{item.label}</b>
          <span dir="ltr">{item.path}{item.query ? `?${item.query}` : ''}</span>
        </div>
        <a href={shortcutHref(base, shortcutKey)} target="_blank" rel="noreferrer"><LaunchIcon /> فتح الشاشة</a>
      </header>
      <p className="nv-shortcut-purpose">{item.purpose}</p>
      <ol className="nv-shortcut-clicks">
        {item.clicks.map((click, index) => <li key={click}><i>{index + 1}</i><span>{click}</span></li>)}
      </ol>
      <footer><b>الدليل:</b> {item.evidence}</footer>
    </article>
  );
}

function Cover() {
  return (
    <div className="nv-cover">
      <p>إدارة السلاسل والإمداد — Brandzo Hub · اجتماع تنسيق مع {meetingMeta.beneficiary}</p>
      <div>
        <span>{meetingMeta.docNumber} · الإصدار {meetingMeta.version} · {meetingMeta.status}</span>
        <h1>{meetingMeta.titleEn}<br /><i>Plan</i></h1>
        <h2>{meetingMeta.titleAr}</h2>
        <p className="nv-cover-sub">{meetingMeta.subtitle}</p>
      </div>
      <footer>
        <div><b>{meetingMeta.preparedBy}</b><span>{meetingMeta.preparedRole}</span></div>
        <div><b>{meetingMeta.scope}</b><span>نطاق التنفيذ</span></div>
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
        title="هذا ليس ملفًّا يُقرأ — هو الخطة موصولةً بالشاشات التي تُنفَّذ فيها"
        intro="كل خطوة في الخطة تحمل بطاقة اختصار: اسم الشاشة، ومسارها، والنقرات داخلها، والدليل الذي تُخرجه. تُفتح الشاشة في تبويبٍ مستقل فلا ينقطع العرض."
      />
      <div className="nv-howto">
        <section>
          <b>01</b>
          <h3>بطاقة الاختصار</h3>
          <p>اسم الشاشة ومسارها الحقيقيّ · المسار داخلها بنصّ الأزرار · الدليل الناتج · زرّ «فتح الشاشة» في تبويبٍ جديد.</p>
        </section>
        <section>
          <b>02</b>
          <h3>حسمٌ حيّ للقرارات</h3>
          <p>شريحة نقاط القرار تُسجَّل فيها النتيجة والمسؤول والموعد أثناء الاجتماع، وتُنسخ محضرًا جاهزًا بضغطة.</p>
        </section>
        <section>
          <b>03</b>
          <h3>المصدر حاضر</h3>
          <p>الوثيقة الرسمية {meetingMeta.docNumber} معروضةٌ كاملةً داخل العرض قبل شريحة الإقفال — للرجوع إليها عند أي خلاف.</p>
        </section>
      </div>
      <div className="nv-keys">
        <span>اختصارات لوحة المفاتيح</span>
        {keyboardHelp.map(([key, label]) => <p key={key}><kbd>{key}</kbd>{label}</p>)}
      </div>
    </>
  );
}

function AgendaSlide() {
  return (
    <>
      <SlideHead kicker="مسار الاجتماع" title="من المرجعية إلى قراراتٍ مسجَّلة" />
      <div className="nv-agenda">
        {agenda.map(([n, title, detail]) => <div key={n}><b>{n}</b><h3>{title}</h3><p>{detail}</p></div>)}
      </div>
    </>
  );
}

function SummarySlide() {
  return (
    <>
      <SlideHead kicker="الملخص التنفيذي" title="خطة مبنية على ما تفعله البوابة فعلًا — لا على ما نتمنّاه" intro={executiveSummary.lead} />
      <div className="nv-facts">
        {executiveSummary.facts.map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
      </div>
      <div className="nv-callout">
        <b>{executiveSummary.decision.title}</b>
        <p>{executiveSummary.decision.body}</p>
      </div>
    </>
  );
}

function ObjectivesSlide() {
  return (
    <>
      <SlideHead kicker="الأهداف التشغيلية" title="خمسة أهداف تُقاس، لا نوايا تُعلَن" />
      <div className="nv-objectives">
        {objectives.map(([title, body], index) => (
          <div key={title}><b>{String(index + 1).padStart(2, '0')}</b><h3>{title}</h3><p>{body}</p></div>
        ))}
      </div>
    </>
  );
}

function KpiSlide() {
  return (
    <>
      <SlideHead kicker="مؤشرات الأداء" title="ستة مؤشرات بمستهدفاتها وتوقيت قياسها" intro="المستهدفات الموسومة «مقترح» قيمٌ مبدئية من إدارة السلاسل والإمداد — تصبح ملزمة بعد إقرارها في هذا الاجتماع." />
      <table className="nv-table">
        <thead><tr><th>المؤشر</th><th>طريقة الاحتساب</th><th className="nv-c">المستهدف</th><th>توقيت القياس</th></tr></thead>
        <tbody>
          {kpis.map(([name, formula, target, timing, proposed]) => (
            <tr key={name}>
              <td><b>{name}</b></td>
              <td>{formula}</td>
              <td className="nv-c"><span className={proposed ? 'nv-badge is-proposed' : 'nv-badge is-ok'}>{target}</span>{proposed && <i className="nv-prop">مقترح</i>}</td>
              <td>{timing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ScopeSlide({ base }) {
  return (
    <>
      <SlideHead kicker="نطاق الأصناف المرجعي" title="ملفات البرندات الخمسة هي المرجع الحاكم — لا قائمة الماستر" intro="أي صنفٍ لا يرد في هذه الملفات لا يُعدّ، ويُسجَّل ضمن قائمة الأصناف غير المعرّفة." />
      <div className="nv-scope">
        <div className="nv-brands">
          {brandScope.map(([brand, file], index) => (
            <div key={brand}><b>{String(index + 1).padStart(2, '0')}</b><h3>{brand}</h3><span dir="ltr">{file}</span></div>
          ))}
        </div>
        <aside>
          <div className="nv-callout is-neutral">
            <b>{outOfScope.title}</b>
            <p>{outOfScope.body}</p>
          </div>
          <ShortcutCard base={base} shortcutKey="items" compact />
        </aside>
      </div>
    </>
  );
}

function GateSlide() {
  return (
    <>
      <SlideHead kicker="بوابة الحوكمة قبل البدء" title="ستة شروط بدء — لا توصيات" intro="لا يُفتح العدّ في أي فرع ما لم تُستوفَ جميعها ويُثبَّت استيفاؤها في محضر التنسيق." />
      <div className="nv-gate">
        {governanceGate.map(([title, body], index) => (
          <div key={title}><i /><div><b>{title}</b><p>{body}</p></div><span>{String(index + 1).padStart(2, '0')}</span></div>
        ))}
      </div>
    </>
  );
}

function StepsMapSlide() {
  return (
    <>
      <SlideHead kicker="مسار التنفيذ داخل الأداة" title="سبع خطوات بالتسلسل — ولكلٍّ شاشتها" intro="لا يُنتقل إلى خطوةٍ قبل إغلاق سابقتها، ويسري التسلسل نفسه على كل فرعٍ داخل نافذته المستقلة." />
      <div className="nv-steps-map">
        {executionSteps.map((step) => (
          <div key={step.n}>
            <b>{String(step.n).padStart(2, '0')}</b>
            <h3>{step.title}</h3>
            <span>{portalShortcuts[step.shortcuts[0]].label}</span>
          </div>
        ))}
      </div>
      <p className="nv-note">الشرائح السبع التالية تفتح كل خطوة على حدة: ما تفعله · ما تحرسه · وأين تُنفَّذ في البوابة بالضبط.</p>
    </>
  );
}

function StepSlide({ base, step }) {
  return (
    <>
      <SlideHead kicker={`مسار التنفيذ · الخطوة ${String(step.n).padStart(2, '0')} من 07`} title={step.title} intro={step.summary} />
      <div className="nv-step">
        <div className="nv-step-side">
          <section>
            <b>ما يُنفَّذ</b>
            <ul>{step.does.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
          <section className="nv-step-guard">
            <b>ما يُحرَس</b>
            <p>{step.guard}</p>
          </section>
        </div>
        <div className="nv-step-shortcuts" data-count={step.shortcuts.length}>
          {step.shortcuts.map((key) => <ShortcutCard key={key} base={base} shortcutKey={key} compact={step.shortcuts.length > 2} />)}
        </div>
      </div>
    </>
  );
}

function TimelineSlide() {
  return (
    <>
      <SlideHead kicker="الجدول الزمني ونوافذ التنفيذ" title="«ت» هو يوم بدء العدّ في الفرع المعني" intro="التواريخ الفعلية تُثبَّت عند اعتماد مواعيد الفرعين في هذا الاجتماع؛ ويُنفَّذ الجدول نفسه لكل فرعٍ ضمن نافذته." />
      <table className="nv-table nv-compact">
        <thead><tr><th className="nv-c">التوقيت</th><th>المرحلة</th><th>المخرج المطلوب</th><th>الجهة المسؤولة</th></tr></thead>
        <tbody>
          {timeline.map(([when, phase, output, owner]) => (
            <tr key={when}><td className="nv-c"><b>{when}</b></td><td>{phase}</td><td>{output}</td><td>{owner}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CyclesSlide({ base }) {
  return (
    <>
      <SlideHead kicker="الدورات المستندية المعتمدة" title="كل عملية سلسلةٌ مترابطة — لا مستندٌ منفرد" intro="بأرقامٍ تسلسليّة ومنشئٍ ومعتمدٍ وسجل تدقيق، من الطلب حتى الاستلام أو التسوية." />
      <div className="nv-cycles">
        {documentCycles.map((cycle) => (
          <section key={cycle.id}>
            <h3>{cycle.title}</h3>
            <div className="nv-flow">
              {cycle.nodes.map(([code, label], index) => (
                <span key={code} className="nv-node">
                  {index > 0 && <i className="nv-arrow">←</i>}
                  <b dir="ltr">{code}</b>
                  <span>{label}</span>
                </span>
              ))}
            </div>
            <p><b>دليل الإقفال:</b> {cycle.close}</p>
            <div className="nv-cycle-links">
              {cycle.shortcuts.map((key) => (
                <a key={key} href={shortcutHref(base, key)} target="_blank" rel="noreferrer"><LaunchIcon /> {portalShortcuts[key].label}</a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function DocumentShortcutsSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="اختصارات إنشاء المستندات"
        title="كل رمزٍ هنا مخطّطٌ مبنيّ في محرّك المستندات — يفتح مباشرةً"
        intro="الزرّ يفتح شاشة المستند على نوعه فورًا (‎/dashboard/document?type=…‎). أي رمزٍ لا يقابله مخطّطٌ حقيقيّ يسقط في اختبار العرض قبل النشر."
      />
      <div className="nv-doc-grid">
        {documentShortcutGrid.map((group) => (
          <section key={group.group}>
            <h3>{group.group}</h3>
            <div>
              {group.types.map(([type, label]) => (
                <a key={type} href={`${base}/dashboard/document?type=${type}`} target="_blank" rel="noreferrer">
                  <b dir="ltr">{type}</b><span>{label}</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ResponsibilitiesSlide() {
  const mark = { a: 'ع', t: 'ت', c: 'ش', i: 'خ', '-': '—' };
  return (
    <>
      <SlideHead kicker="المسؤوليات ومصفوفة الاعتماد" title="مسؤولٌ واضح لكل نشاط، ومعتمِدٌ واحد لكل قرار" />
      <div className="nv-raci-wrap">
        <table className="nv-table nv-compact">
          <thead>
            <tr><th>النشاط</th>{raciColumns.map((column) => <th key={column} className="nv-c">{column}</th>)}</tr>
          </thead>
          <tbody>
            {raciRows.map(([activity, marks]) => (
              <tr key={activity}>
                <td>{activity}</td>
                {marks.map((value, index) => (
                  <td key={raciColumns[index]} className="nv-c"><span className={`nv-raci r-${value === '-' ? 'none' : value}`}>{mark[value]}</span></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <aside>
          {responsibilities.map(([party, , output]) => (
            <p key={party}><b>{party}</b><span>{output}</span></p>
          ))}
          <div className="nv-legend">
            {raciLegend.map(([code, letter, meaning]) => (
              <span key={code}><i className={`nv-raci r-${code}`}>{letter}</i>{meaning}</span>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

function VarianceSlide() {
  return (
    <>
      <SlideHead kicker="ضبط الفروقات والأصناف غير المعرّفة" title="لا يتحوّل فرقٌ إلى تسوية دون مسارٍ موثّق" intro="مبدأ فصل العدّ: يُعاد عدّ كل صنفٍ ذي فرقٍ مرةً على الأقل بفريقٍ مختلف عن الفريق الأول." />
      <table className="nv-table nv-compact">
        <thead><tr><th>الحالة</th><th>الإجراء الإلزامي</th><th>الدليل المطلوب</th><th>جهة القرار</th></tr></thead>
        <tbody>
          {varianceRules.map(([state, action, evidence, owner]) => (
            <tr key={state}><td><b>{state}</b></td><td>{action}</td><td>{evidence}</td><td>{owner}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RisksSlide() {
  const tone = { high: 'عالٍ', med: 'متوسط', low: 'منخفض' };
  return (
    <>
      <SlideHead kicker="سجل المخاطر وخطط الاحتواء" title="ثماني مخاطر — أربعٌ عالية الأثر تُغلق قبل أول مسح" />
      <div className="nv-risks">
        {risks.map(([risk, level, action], index) => (
          <div key={risk} className={`is-${level}`}>
            <b>{String(index + 1).padStart(2, '0')}</b>
            <div><h3>{risk}</h3><p>{action}</p></div>
            <span className={`nv-badge is-${level}`}>{tone[level]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function EscalationSlide() {
  return (
    <>
      <SlideHead kicker="مصفوفة التصعيد" title="ثلاثة مستويات بزمن استجابةٍ معلن" intro="أزمنة الاستجابة مقترحة وتصبح ملزمة بعد اعتمادها؛ وتُستكمل أسماء جهات المعالجة عند تسمية الممثلين." />
      <div className="nv-escalation">
        {escalation.map(([level, tone, kind, owner, sla]) => (
          <section key={level} className={`is-${tone}`}>
            <header><span className={`nv-badge is-${tone}`}>المستوى {level}</span><b>{sla}</b></header>
            <p>{kind}</p>
            <footer>{owner}</footer>
          </section>
        ))}
      </div>
    </>
  );
}

/*
  ═══════════════════════════════════════════════════════════════════
  لوحة الحسم الحيّ — القرارات تُسجَّل في الاجتماع لا بعده
  ═══════════════════════════════════════════════════════════════════
  المنطق مُعاد استعماله من `services/executiveReview/decisionSession.js`
  (مُختبَرٌ أصلًا) بمفتاح تخزينٍ مستقل لهذا الاجتماع. الحفظ محليّ على جهاز
  العارض — لا يُكتب شيء في قاعدة البيانات من شاشة عرض.
*/
function DecisionsSlide() {
  const [session, setSession] = useState(() => createDecisionSession(decisionPoints.length));
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const [copyState, setCopyState] = useState('idle'); // idle | done | fail
  const summary = useMemo(() => summarizeDecisionSession(session), [session]);

  useEffect(() => {
    try {
      setSession(normalizeDecisionSession(JSON.parse(localStorage.getItem(DECISIONS_KEY) || 'null'), decisionPoints.length));
    } catch {
      setSession(createDecisionSession(decisionPoints.length));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(DECISIONS_KEY, JSON.stringify(session));
  }, [ready, session]);

  const change = (patch) => setSession((current) => updateDecision(current, active, patch));

  /*
    إن رفض المتصفّح النسخ بالمسارين لا نصمت: نُعلن الفشل في الزرّ ونطبع
    المحضر في المِعراض (console) ليُنتشل — فالبديل الصامت أن يظنّ العارض
    أن المحضر في حافظته وهو ليس فيها.
  */
  async function copyMinutes() {
    const text = buildDecisionMinutes({
      heading: `محضر قرارات — ${meetingMeta.docNumber} · ${meetingMeta.titleAr}`,
      points: decisionPoints,
      session,
    });
    const ok = await copyText(text);
    if (!ok) console.warn('[اجتماع نوفا] تعذّر النسخ إلى الحافظة — المحضر:\n' + text);
    setCopyState(ok ? 'done' : 'fail');
    window.setTimeout(() => setCopyState('idle'), 3000);
  }

  function reset() {
    if (!window.confirm('مسح نتائج جلسة القرار المحفوظة على هذا الجهاز؟')) return;
    setSession(createDecisionSession(decisionPoints.length));
    setActive(0);
  }

  const current = session.decisions[active];
  const point = decisionPoints[active];

  return (
    <>
      <SlideHead
        kicker="نقاط قرار اجتماع التنسيق"
        title="عشرة بنودٍ مفتوحة — كلٌّ منها شرط بدء"
        intro="تُحسم أمام الحضور وتُحفظ على هذا الجهاز، ثم تُنسخ محضرًا جاهزًا. لا يُفتح العدّ قبل إغلاقها جميعًا."
      />
      <div className="nv-decisions">
        <ol className="nv-decision-list">
          {decisionPoints.map((item, index) => {
            const state = session.decisions[index].status;
            return (
              <li key={item.title}>
                <button type="button" className={`state-${state}${index === active ? ' is-active' : ''}`} onClick={() => setActive(index)}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>{item.title}</span>
                  <i>{DECISION_STATES[state]}</i>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="nv-decision-panel">
          <p className="nv-decision-ask"><b>القرار المطلوب:</b> {point.ask}</p>
          <div className="nv-decision-vote" role="group" aria-label="حسم القرار">
            {['approved', 'conditional', 'deferred', 'review'].map((value) => (
              <button type="button" key={value} className={current.status === value ? 'is-selected' : ''} aria-pressed={current.status === value} onClick={() => change({ status: value })}>
                {DECISION_STATES[value]}
              </button>
            ))}
          </div>
          <div className="nv-decision-fields">
            <label>المسؤول<input value={current.owner} onChange={(event) => change({ owner: event.target.value })} placeholder={point.owner} /></label>
            <label>الموعد<input value={current.due} onChange={(event) => change({ due: event.target.value })} placeholder="يُثبَّت في الاجتماع" /></label>
            <label className="nv-wide">الملاحظة أو الشرط<textarea rows="2" value={current.note} onChange={(event) => change({ note: event.target.value })} placeholder="تُسجَّل هنا حرفيًّا…" /></label>
          </div>
          <footer>
            <span className="nv-decision-meter"><i style={{ width: `${(summary.resolved / summary.total) * 100}%` }} /></span>
            <b>{summary.resolved} من {summary.total} حُسمت</b>
            <button type="button" onClick={copyMinutes}>
              {copyState === 'done' ? 'نُسخ المحضر' : copyState === 'fail' ? 'تعذّر النسخ' : 'نسخ محضر القرارات'}
            </button>
            <button type="button" className="nv-quiet" onClick={reset}>جلسة جديدة</button>
          </footer>
        </div>
      </div>
    </>
  );
}

function ClosingCriteriaSlide({ base }) {
  return (
    <>
      <SlideHead kicker="معايير الإقفال وحزمة التسليم" title="لا تُعدّ العملية مغلقة إلا باستيفائها كاملةً لكل فرع" />
      <div className="nv-closing">
        <ul>{closingCriteria.map((line) => <li key={line}>{line}</li>)}</ul>
        <aside>
          <div className="nv-callout is-neutral"><b>حزمة التسليم النهائية</b><p>{deliveryPackage}</p></div>
          <ShortcutCard base={base} shortcutKey="archive" compact />
        </aside>
      </div>
    </>
  );
}

function SourceSlide({ base, ready }) {
  return (
    <>
      <SlideHead kicker="المصدر الحاكم" title={`الوثيقة الرسمية ${meetingMeta.docNumber} كاملةً`} intro="ما يُعرض في هذه الشرائح قراءةٌ تشغيلية لهذه الوثيقة؛ وعند أي خلافٍ فالنصّ أدناه هو الحكم." />
      <div className="nv-source">
        <div className="nv-source-bar">
          <div><span>الوثيقة</span><b>{meetingMeta.titleAr}</b></div>
          <a href={`${base}/nova-meeting/plan.html`} target="_blank" rel="noreferrer"><LaunchIcon /> فتح في نافذة مستقلة</a>
        </div>
        {ready
          ? <iframe title="خطة تشغيل جرد ونقل مخزون شركة نوفا" src={`${base}/nova-meeting/plan.html`} />
          : <div className="nv-source-placeholder">تُحمَّل الوثيقة عند فتح الشريحة</div>}
      </div>
    </>
  );
}

function OutcomeSlide() {
  return (
    <>
      <SlideHead kicker="إقفال الاجتماع" title="ما الذي يخرج من هذه الجلسة" intro="لا يُعدّ أي بندٍ معتمدًا إلا بقرارٍ موثّقٍ ومسؤولٍ وموعد." />
      <div className="nv-outcome">
        <section><b>01</b><h3>محضر تنسيق موقّع</h3><p>يثبّت المواعيد ورمزي العمليتين والممثلين والمخوّلين بالاعتماد.</p></section>
        <section><b>02</b><h3>عشر نقاط محسومة</h3><p>لكلٍّ نتيجةٌ ومسؤولٌ وموعد — منسوخةً من لوحة الحسم في هذا العرض.</p></section>
        <section><b>03</b><h3>ضوءٌ أخضر خطي</h3><p>لكل فرعٍ على حدة، مع نافذة إيقاف الحركة أو سجل الحركة الطارئة.</p></section>
        <section><b>04</b><h3>دوراتٌ مُفعَّلة</h3><p>النقل والبيع وتحميل المندوبين تعمل بسلاسلها الكاملة بعد الإقفال.</p></section>
      </div>
      <p className="nv-outcome-foot">النتيجة المستهدفة: <b>رصيدٌ موثوق لكل فرع · فصلٌ كامل بين الفرعين · وكل حركةٍ بعد الجرد لها سلسلةٌ مستنديّة تُقفلها.</b></p>
    </>
  );
}

function DeckControls({ current, total, presenting, onGo, onOverview, onStart, onExit }) {
  return (
    <footer className="nv-controls">
      <div className="nv-progress" aria-hidden="true"><i style={{ width: `${((current + 1) / total) * 100}%` }} /></div>
      <div className="nv-controls-row">
        <div className="nv-controls-side">
          {presenting
            ? <button type="button" className="nv-btn nv-btn-exit" onClick={onExit}><CloseIcon /> إنهاء العرض</button>
            : <button type="button" className="nv-btn nv-btn-play" onClick={onStart}><PlayIcon /> بدء العرض</button>}
          <button type="button" className="nv-btn" onClick={onOverview}><GridIcon /> فهرس الشرائح</button>
        </div>
        <div className="nv-controls-nav">
          <button type="button" className="nv-btn nv-btn-step" onClick={() => onGo(current - 1)} disabled={current === 0}><Chevron direction="back" /> السابق</button>
          <span className="nv-counter"><b>{String(current + 1).padStart(2, '0')}</b> / {String(total).padStart(2, '0')}</span>
          <button type="button" className="nv-btn nv-btn-step" onClick={() => onGo(current + 1)} disabled={current === total - 1}>التالي <Chevron /></button>
        </div>
        <div className="nv-controls-side nv-controls-dots">
          <nav aria-label="الانتقال المباشر بين الشرائح">
            {slideIndex.map((label, index) => (
              <button type="button" key={label} title={`${String(index + 1).padStart(2, '0')} — ${label}`} className={index === current ? 'is-current' : ''} onClick={() => onGo(index)} aria-label={label} />
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default function NovaMeetingDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [seen, setSeen] = useState(() => new Set([0]));
  const rootRef = useRef(null);
  const stageRef = useRef(null);

  const slides = useMemo(() => {
    const list = [
      <Cover key="cover" />,
      <HowToSlide key="howto" />,
      <AgendaSlide key="agenda" />,
      <SummarySlide key="summary" />,
      <ObjectivesSlide key="objectives" />,
      <KpiSlide key="kpis" />,
      <ScopeSlide key="scope" base={base} />,
      <GateSlide key="gate" />,
      <StepsMapSlide key="steps-map" />,
      ...executionSteps.map((step) => <StepSlide key={`step-${step.n}`} base={base} step={step} />),
      <TimelineSlide key="timeline" />,
      <CyclesSlide key="cycles" base={base} />,
      <DocumentShortcutsSlide key="doc-shortcuts" base={base} />,
      <ResponsibilitiesSlide key="raci" />,
      <VarianceSlide key="variance" />,
      <RisksSlide key="risks" />,
      <EscalationSlide key="escalation" />,
      <DecisionsSlide key="decisions" />,
      <ClosingCriteriaSlide key="closing" base={base} />,
      null, // موضع شريحة المصدر — تُبنى أدناه لأنها تعتمد على `seen`
      <OutcomeSlide key="outcome" />,
    ];
    const sourceIndex = list.indexOf(null);
    list[sourceIndex] = <SourceSlide key="source" base={base} ready={seen.has(sourceIndex)} />;
    return list;
  }, [base, seen]);

  const total = slides.length;
  const go = useCallback((index) => setCurrent((value) => {
    const next = Math.max(0, Math.min(total - 1, index));
    return next === value ? value : next;
  }), [total]);

  useEffect(() => {
    setSeen((previous) => (previous.has(current) ? previous : new Set(previous).add(current)));
  }, [current]);

  useFitEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      stage.style.setProperty('--nv-scale', String(Math.max(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT), 0.1)));
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
    <div className={`nova-meeting-deck${presenting ? ' is-presenting' : ''}`} ref={rootRef}>
      {!presenting && (
        <header className="nv-toolbar">
          <a href={`${base}/dashboard`}><Chevron direction="back" /><span>لوحة التحكم</span></a>
          <div><b>{meetingMeta.docNumber}</b><span>{meetingMeta.titleAr}</span></div>
          <p className="nv-toolbar-slide">{slideIndex[current]}</p>
        </header>
      )}

      <main className="nv-stage" ref={stageRef} aria-live="polite">
        <div className="nv-canvas">
          {slides.map((content, index) => (
            <article key={slideIndex[index]} className={`nv-slide${current === index ? ' is-active' : ''}`} aria-hidden={current !== index}>{content}</article>
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
        <div className="nv-overview" role="dialog" aria-modal="true" aria-label="فهرس الشرائح">
          <header>
            <b>فهرس الشرائح · {String(total).padStart(2, '0')} شريحة</b>
            <button type="button" className="nv-btn nv-btn-exit" onClick={() => setOverview(false)}><CloseIcon /> إغلاق الفهرس</button>
          </header>
          <div>
            {slideIndex.map((label, index) => (
              <button type="button" key={label} className={index === current ? 'is-current' : ''} onClick={() => { go(index); setOverview(false); }}>
                <b>{String(index + 1).padStart(2, '0')}</b><span>{label}</span>
              </button>
            ))}
          </div>
          <p>اختصارات لوحة المفاتيح: {keyboardHelp.map(([key, label]) => <span key={key}><b>{key}</b> {label} </span>)}</p>
        </div>
      )}
    </div>
  );
}
