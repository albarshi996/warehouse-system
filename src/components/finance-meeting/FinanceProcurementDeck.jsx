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
  asks,
  closingLine,
  closingOutcome,
  decisionPoints,
  financialImpact,
  handoffs,
  howTo,
  internalCycle,
  keyboardHelp,
  kpiCards,
  kpiRule,
  masters,
  mastersRule,
  matchVerdicts,
  meetingMeta,
  ownership,
  portalShortcuts,
  purchaseBranches,
  purchaseStages,
  scenarioRule,
  scenarios,
  sharedReports,
  slideIndex,
  tolerance,
  vendorDimensions,
  vendorTiers,
} from '../../data/finance-procurement-meeting.js';

/*
  ═══════════════════════════════════════════════════════════════════
  لوحة الرسم الثابتة 1280×720 — الهيكل من `meeting-deck.css` المشترك
  ═══════════════════════════════════════════════════════════════════
  كل شريحة تُرسم على مقاسٍ واحد ثم تُكبَّر أو تُصغَّر ككتلةٍ واحدة، فلا
  تنكسر النِّسَب بين شاشة الحاسوب وجهاز العرض في قاعة الاجتماع.
*/
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const DECISIONS_KEY = 'brandzo:finance-procurement:decisions:v1';

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
const SEVERITY = { high: 'خطورة عالية', med: 'خطورة متوسّطة' };

/** نسخٌ إلى الحافظة بمسارين — `navigator.clipboard` يفشل في ملء الشاشة. */
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
          <span dir="ltr">{item.path}{item.query ? `?${item.query}` : ''}</span>
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

const Flow = ({ nodes }) => (
  <div className="mtg-flow">
    {nodes.map(([code, label], index) => (
      <span className="mtg-node" key={code}>
        <b>{code}<em>{label}</em></b>
        {index < nodes.length - 1 && <i className="mtg-arrow">←</i>}
      </span>
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
   الشرائح
   ═══════════════════════════════════════════════════════════════════ */

function Cover() {
  return (
    <div className="mtg-cover">
      <p>إدارة السلاسل والإمداد والمخازن — Brandzo Hub · اجتماع مع {meetingMeta.counterpart}</p>
      <div>
        <span>{meetingMeta.docNumber} · الإصدار {meetingMeta.version} · {meetingMeta.status}</span>
        <h1>Procure<br /><i>to Pay</i></h1>
        <h2>{meetingMeta.titleAr}</h2>
        <p className="mtg-cover-sub">{meetingMeta.subtitle}</p>
      </div>
      <footer>
        <div><b>{meetingMeta.preparedBy}</b><span>{meetingMeta.preparedRole}</span></div>
        <div><b>{meetingMeta.scope}</b><span>محور الاجتماع</span></div>
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
        title="ما نعرضه ليس مقترحًا يُبنى — هو مبنيٌّ ويعمل، ونطلب اعتماده حدًّا بيننا"
        intro="كل خطوة تحمل بطاقة اختصار تفتح الشاشة التي تُنفَّذ فيها داخل البوابة، وكلّ حكمٍ معروضٍ هنا مقروءٌ من الكود لا مكتوبٌ في شريحة."
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
      <SlideHead kicker="جدول الأعمال" title="ستة محاور — من الحدّ بين الإدارتين إلى القرار" />
      <div className="mtg-agenda">
        {agenda.map(([index, title, detail]) => (
          <div key={index}><b>{index}</b><h3>{title}</h3><p>{detail}</p></div>
        ))}
      </div>
    </>
  );
}

function RuleSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 01 · القاعدة الحاكمة"
        title="لا حركةَ بلا مستند، ولا مستندَ بلا أثر"
        intro="ليست شعارًا: كلّ مستندٍ يبلغ «منجَز» يُقيَّد حركةً في دفترٍ ملحق-فقط، والرصيد يتغيّر لحظتها. وما لم يبلغ الإنجاز لا أثر له مهما كُتب فيه."
      />
      <div className="mtg-split">
        <div className="mtg-side">
          <ul className="mtg-bullets">
            <li>كلّ مستندٍ له رقمٌ تسلسليّ ومنشئٌ ومعتمدٌ وسجلّ تدقيقٍ دائم — لا ورقةٌ تُملأ ثمّ تُفقد.</li>
            <li>لا تُنجَز حلقةٌ قبل اعتماد سابقتها — حارسٌ يمنع الابن من الإنجاز وأبوه غير معتمَد.</li>
            <li>الاشتقاق لا النسخ: المستند التالي يولد من سابقه ببنوده وروابطه، فلا يُعاد إدخال ما أُدخل.</li>
            <li>التصحيح بحركةٍ جديدةٍ مسبَّبة لا بمسح القديمة — الدفتر لا يُعدَّل ولا يُحذف منه.</li>
          </ul>
          <div className="mtg-callout">
            <b>ما الذي يتغيّر عمليًّا؟</b>
            <p>لا شيء في مقدار العمل — كلّ هذه المستندات مبنيّةٌ وتُملأ اليوم. الذي يتغيّر أنّ ما كان يُقفل بمكالمة صار يُقفل بحكمٍ محسوبٍ يراه الطرفان.</p>
          </div>
        </div>
        <ShortcutCard base={base} shortcutKey="documents" />
      </div>
    </>
  );
}

function OwnershipSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 01 · من يملك ماذا"
        title="المشتريات تتبع المالية — والحدّ بيننا ملكيّةُ خطوةٍ لا ملكيّةُ رأي"
        intro="عشر خطواتٍ في الدورة، لكلٍّ مالكٌ واحدٌ يقرّر وطرفٌ يُستشار ومستندٌ يُقفلها. ما لم يُكتب هكذا يُدار بالاجتهاد ثمّ يُختلَف عليه عند أوّل فرق."
      />
      <div className="mtg-table-wrap">
        <table className="mtg-table mtg-compact">
          <thead>
            <tr>
              <th style={{ width: '31%' }}>الخطوة</th>
              <th style={{ width: '20%' }}>المالك — من يقرّر</th>
              <th>من يُستشار أو يُخطَر</th>
              <th style={{ width: '13%' }}>المستند</th>
            </tr>
          </thead>
          <tbody>
            {ownership.map(([step, owner, consulted, doc]) => (
              <tr key={step}>
                <td><b>{step}</b></td>
                <td className="fin-owner-cell">{owner}</td>
                <td>{consulted}</td>
                <td className="fin-doc-cell">{doc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HandoffSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 01 · نقاط التسليم"
        title="أربع نقاطٍ تنتقل عندها المسؤولية — ولكلٍّ مستندٌ يُقفلها"
        intro="هذه هي الطلبُ الأوّل من هذه الجلسة: أن تُعتمد هذه النقاط الأربع حدًّا رسميًّا، فما يُقفل بمستندٍ لا يُعاد فتحه بمكالمة."
      />
      <div className="fin-handoff">
        {handoffs.map((point) => (
          <section key={point.n}>
            <header>
              <b>{point.n}</b>
              <i>من <b>{point.from}</b> إلى <b>{point.to}</b></i>
            </header>
            <h3>{point.title}</h3>
            <span className="fin-doc">{point.doc}</span>
            <p>{point.what}</p>
            <footer>بدونها: {point.risk}</footer>
          </section>
        ))}
      </div>
    </>
  );
}

function MastersSlide({ base }) {
  return (
    <>
      <SlideHead kicker="المحور 02 · البيانات المرجعية" title="ثلاثة ماستراتٍ تُضبط مرّةً — فينتهي نصف الخلاف" intro={mastersRule} />
      <div className="mtg-split">
        <div className="mtg-masters" style={{ gridTemplateColumns: '1fr' }}>
          {masters.map(([title, detail, , why], index) => (
            <div key={title}>
              <b>{pad(index + 1)}</b>
              <div><h3>{title}</h3><p>{detail}</p><span>{why}</span></div>
            </div>
          ))}
        </div>
        <div className="mtg-side">
          <ShortcutCard base={base} shortcutKey="suppliers" compact />
          <ShortcutCard base={base} shortcutKey="items" compact />
        </div>
      </div>
    </>
  );
}

function PurchaseMapSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · دورة الشراء المخزنيّ"
        title="خمس حلقاتٍ من الاحتياج إلى الرفّ — ولا حلقةَ تُنجَز قبل اعتماد سابقتها"
        intro="هذه هي السلسلة المعتمَدة في المحرّك حرفيًّا، وليست ترتيبًا مقترحًا: كلّ حلقةٍ تُشتقّ من سابقتها وتحمل رقمها."
      />
      <div className="mtg-stages fin-five">
        {purchaseStages.map((stage, index) => (
          <div key={stage.code}>
            <b>{pad(index + 1)}</b>
            <h3>{stage.title}</h3>
            <p>{stage.does}</p>
            <span>{stage.code}</span>
          </div>
        ))}
      </div>
      <p className="mtg-note">
        وثلاثة فروعٍ رسميّة تخرج منها: {purchaseBranches.map(([code]) => code).join(' · ')} — تُعرض في شرائح المطابقة والأثر الماليّ.
      </p>
    </>
  );
}

function StageSlide({ base, stage, index }) {
  return (
    <>
      <SlideHead
        kicker={`المحور 03 · الحلقة ${pad(index + 1)} من ${pad(purchaseStages.length)}`}
        title={`${stage.code} — ${stage.title}`}
        intro={stage.does}
      />
      <div className="mtg-step">
        <div className="mtg-step-main">
          <section>
            <b className="mtg-label">موضعها في السلسلة · ومالكها</b>
            <div className="mtg-flow">
              {purchaseStages.map((node, position) => (
                <span className="mtg-node" key={node.code}>
                  <b style={node.code === stage.code ? { borderColor: 'var(--red-700)', background: 'var(--tint-2)' } : { opacity: .45 }}>
                    {node.code}
                  </b>
                  {position < purchaseStages.length - 1 && <i className="mtg-arrow">←</i>}
                </span>
              ))}
              <span className="mtg-node"><b style={{ border: 0, background: 'transparent', color: 'var(--ink)' }}>{stage.owner}</b></span>
            </div>
          </section>
          <section>
            <b className="mtg-label">ما يحمله المستند فعلًا</b>
            <div className="mtg-fields">
              {stage.fields.map((field, position) => (
                <div key={field}><b>{pad(position + 1)}</b><span>{field}</span></div>
              ))}
            </div>
          </section>
          <div className="mtg-guard"><p><b>الحارس المبنيّ:</b> {stage.guard}</p></div>
        </div>
        <ShortcutCard base={base} shortcutKey={stage.shortcut} />
      </div>
    </>
  );
}

function MatchSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · المطابقة الثلاثية"
        title="المطلوب ↔ المستلَم ↔ المقبول — حكمٌ محسوبٌ صنفًا صنفًا قبل الفوترة"
        intro={`تقارن أمر الشراء بمذكرة الاستلام بتقرير الجودة، وتُخرج لكلّ صنفٍ حكمًا مسبَّبًا لا رأيًا. حدّ التسامح: ${tolerance.pct}٪ من الكمية أو ${tolerance.min} وحدة — أيّهما أكبر (فروق التقريب والوزن).`}
      />
      <div className="mtg-split">
        <div className="mtg-side">
          <div className="fin-chain">
            <div className="step-where"><b>PO</b><p><strong>المطلوب</strong> — ما التزمنا بشرائه بسعره وموعده.</p></div>
            <div className="step-where"><b>GRN</b><p><strong>المستلَم</strong> — ما وصل فعلًا عند الباب بدفعته.</p></div>
            <div className="step-where"><b>QC</b><p><strong>المقبول</strong> — ما اجتاز الفحص ويستحقّ الدفع.</p></div>
          </div>
          <div className="mtg-callout">
            <b>القاعدة التي نطلب اعتمادها</b>
            <p>لا تُعتمد فاتورةٌ قبل صدور حكم المطابقة، ولا يُفوتَر إلا <b>المقبول</b> — لا المطلوب ولا المستلَم.</p>
          </div>
        </div>
        <ShortcutCard base={base} shortcutKey="documents" />
      </div>
    </>
  );
}

function VerdictsSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · أحكام المطابقة"
        title="ستّة أحكامٍ لا سابع لها — يُخرجها المحرّك لا الاجتهاد"
        intro="هذه الأحكام مولَّدةٌ من الكود نفسه، ويسقط هذا العرض في الاختبار إن أُضيف حكمٌ أو حُذف — فما تراه هنا هو ما ستراه في الشاشة."
      />
      <div className="fin-verdicts">
        {matchVerdicts.map(([status, label, tone, meaning]) => (
          <div key={status} className={`tone-${tone}`}>
            <header><h3>{label}</h3><code>{status}</code></header>
            <p>{meaning}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function FinancialSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 04 · الأثر المالي"
        title="من الحكم إلى القيد — أربع محطّاتٍ تخصّ المالية وحدها"
        intro="ما قبلها تشغيلٌ يخصّ السلاسل؛ وهنا يصير الأثر ماليًّا: فاتورةٌ فسدادٌ فذمّةٌ فقيدٌ في أودو."
      />
      <div className="mtg-split">
        <div className="mtg-masters" style={{ gridTemplateColumns: '1fr' }}>
          {financialImpact.map(([code, title, detail]) => (
            <div key={code}>
              <b>{code}</b>
              <div><h3>{title}</h3><p>{detail}</p></div>
            </div>
          ))}
        </div>
        <div className="mtg-side">
          <ShortcutCard base={base} shortcutKey="partnerLedger" compact />
          <ShortcutCard base={base} shortcutKey="odooSync" compact />
        </div>
      </div>
    </>
  );
}

function InternalSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 04 · المشتريات الداخلية"
        title="طلبات الإدارات من المالية — دورةٌ مستقلّةٌ لا تدخل المخزون"
        intro={internalCycle.rule}
      />
      <div className="mtg-cycle">
        <div className="mtg-cycle-main">
          <Flow nodes={internalCycle.nodes} />
          <ul className="mtg-bullets">{internalCycle.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
        <ShortcutCard base={base} shortcutKey={internalCycle.shortcut} />
      </div>
    </>
  );
}

function ScenarioMapSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 05 · السيناريوهات السيئة"
        title="اثنا عشر سيناريو تُفسد الدورة — ولكلٍّ حارسٌ مبنيّ"
        intro={scenarioRule}
      />
      <div className="fin-scn-map">
        {scenarios.map((scenario) => (
          <div key={scenario.id} className={`sev-${scenario.severity}`}>
            <header>
              <b>{scenario.id}</b>
              <span className={`fin-sev is-${scenario.severity}`}>{SEVERITY[scenario.severity]}</span>
            </header>
            <h3>{scenario.title}</h3>
            <span>موضعه: {scenario.where}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ScenarioTableSlide({ severity, kicker, title, intro }) {
  const rows = scenarios.filter((scenario) => scenario.severity === severity);
  return (
    <>
      <SlideHead kicker={kicker} title={title} intro={intro} />
      <div className="mtg-table-wrap">
        <table className="mtg-table mtg-compact">
          <thead>
            <tr>
              <th style={{ width: '6%' }}>#</th>
              <th style={{ width: '20%' }}>السيناريو</th>
              <th style={{ width: '31%' }}>الأثر إن وقع</th>
              <th>الحارس المبنيّ في البوابة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((scenario) => (
              <tr key={scenario.id}>
                <td className="fin-doc-cell">{scenario.id}</td>
                <td><b>{scenario.title}</b></td>
                <td className="mtg-warn">{scenario.impact}</td>
                <td>{scenario.guard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AnatomySlide({ base, id }) {
  const scenario = scenarios.find((item) => item.id === id);
  return (
    <>
      <SlideHead
        kicker={`المحور 05 · تشريح ${scenario.id}`}
        title={scenario.title}
        intro={`موضعه: ${scenario.where} · ${SEVERITY[scenario.severity]}`}
      />
      <div className="fin-anatomy">
        <div className="fin-anatomy-main">
          <div className="fin-chain">
            <div className="step-risk"><b>الأثر</b><p>{scenario.impact}</p></div>
            <div className="step-guard"><b>الحارس</b><p>{scenario.guard}</p></div>
          </div>
          <div className="mtg-callout is-neutral">
            <b>ما نطلبه هنا</b>
            <p>ألّا يُعالَج هذا السيناريو باستثناءٍ شفويّ: الحارس مبنيٌّ ويعمل، والمطلوب اعتماده إلزامًا لا خيارًا — ومن يستثني يوثّق سببه.</p>
          </div>
        </div>
        <ShortcutCard base={base} shortcutKey={scenario.shortcut} />
      </div>
    </>
  );
}

function KpiSlide({ base }) {
  return (
    <>
      <SlideHead kicker="المحور 06 · القياس" title="أربعة مؤشّراتٍ محسوبةٍ من المستندات لا من التقدير" intro={kpiRule} />
      <div className="fin-kpis">
        {kpiCards.map(([fn, title, formula, why]) => (
          <div key={fn}>
            <h3>{title}</h3>
            <span>{formula}</span>
            <p>{why}</p>
            <code>{fn}()</code>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '1rem' }}>
        <ShortcutCard base={base} shortcutKey="kpis" compact />
      </div>
    </>
  );
}

function VendorSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 06 · بطاقة أداء الموردين"
        title="أربعة أبعادٍ بأوزانها تُخرج درجةً وتصنيفًا — لا انطباعًا"
        intro="الدرجة محسوبةٌ من مستنداتنا نحن: أمر الشراء ومذكرة الاستلام وتقرير الجودة. وعليها تُبنى سياسة توزيع الأوامر."
      />
      <div className="mtg-split">
        <div className="fin-weights">
          {vendorDimensions.map(([id, nameAr, weight, rationale]) => (
            <div key={id}>
              <header><h3>{nameAr}</h3><b>{weight}٪</b></header>
              <i style={{ width: `${weight}%` }} />
              <p>{rationale}</p>
            </div>
          ))}
        </div>
        <div className="mtg-side">
          <div className="fin-tiers">
            {vendorTiers.map(([tier, label, range, policy]) => (
              <div key={tier} className={`tier-${tier}`}>
                <b>{tier}</b>
                <div><h3>{label} <span>· {range}</span></h3><p>{policy}</p></div>
              </div>
            ))}
          </div>
          <ShortcutCard base={base} shortcutKey="vendorScorecard" compact />
        </div>
      </div>
    </>
  );
}

function ReportsSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 06 · التقارير المشتركة"
        title="ستّة تقاريرَ تُقرأ بيننا وبين المالية — بتصديرٍ يُرفق بالمحضر"
        intro="من أصل تسعة عشر تقريرًا على محرّكٍ واحد. هذه الستّة هي التي نقترح مراجعتها شهريًّا في جلسةٍ مشتركة."
      />
      <div className="mtg-split">
        <div className="mtg-masters" style={{ gridTemplateColumns: '1fr' }}>
          {sharedReports.map(([title, detail], index) => (
            <div key={title}>
              <b>{pad(index + 1)}</b>
              <div><h3>{title}</h3><p>{detail}</p></div>
            </div>
          ))}
        </div>
        <div className="mtg-side">
          <ShortcutCard base={base} shortcutKey="reports" compact />
          <ShortcutCard base={base} shortcutKey="dateIntegrity" compact />
        </div>
      </div>
    </>
  );
}

function AsksSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 06 · الطلب"
        title="ثمانية بنودٍ نطلب اعتمادها — كلّها مبنيّةٌ وتعمل اليوم"
        intro="لا يطلب أيٌّ منها نظامًا جديدًا ولا موظّفًا إضافيًّا: المطلوب أن يصير ما هو اختياريّ إلزاميًّا، وأن يُوثَّق الاستثناء حين يقع."
      />
      <div className="fin-asks">
        {asks.map(([title, detail], index) => (
          <div key={title}>
            <b>{pad(index + 1)}</b>
            <div><h3>{title}</h3><p>{detail}</p></div>
          </div>
        ))}
      </div>
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
        title="ثماني نقاطٍ تُحسم في هذه الجلسة لا بعدها"
        intro="تُسجَّل النتيجة والمسؤول والموعد هنا مباشرةً، وتُنسخ محضرًا جاهزًا بضغطة. والبند غير المحسوم يبقى في المحضر بحالته."
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
              <input type="text" value={current.due ?? ''} placeholder="مثال: من أول الشهر القادم" onChange={(event) => patch({ due: event.target.value })} />
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

export default function FinanceProcurementDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);

  const slides = useMemo(() => [
    <Cover key="cover" />,
    <HowToSlide key="howto" />,
    <AgendaSlide key="agenda" />,
    <RuleSlide key="rule" base={base} />,
    <OwnershipSlide key="ownership" />,
    <HandoffSlide key="handoff" />,
    <MastersSlide key="masters" base={base} />,
    <PurchaseMapSlide key="purchase-map" />,
    ...purchaseStages.map((stage, index) => (
      <StageSlide key={`stage-${stage.code}`} base={base} stage={stage} index={index} />
    )),
    <MatchSlide key="match" base={base} />,
    <VerdictsSlide key="verdicts" />,
    <FinancialSlide key="financial" base={base} />,
    <InternalSlide key="internal" base={base} />,
    <ScenarioMapSlide key="scn-map" />,
    <ScenarioTableSlide
      key="scn-high"
      severity="high"
      kicker="المحور 05 · الخطورة العالية"
      title="خمسة سيناريوهات تمسّ المال مباشرةً"
      intro="هذه التي تُدفع فيها قيمةٌ بلا سند، أو تدخل بضاعةٌ بلا التزامٍ معتمَد، أو يُقسَم تاريخُ جهةٍ أو صنف."
    />,
    <ScenarioTableSlide
      key="scn-med"
      severity="med"
      kicker="المحور 05 · الخطورة المتوسّطة"
      title="سبعة سيناريوهات تُفسد القياس والتخطيط"
      intro="لا تُفقد مالًا في يومها، لكنّها تُفسد الرصيد والمؤشّر وقرار الشراء التالي — فتُفقده لاحقًا."
    />,
    <AnatomySlide key="anat-1" base={base} id="S01" />,
    <AnatomySlide key="anat-2" base={base} id="S02" />,
    <AnatomySlide key="anat-3" base={base} id="S04" />,
    <KpiSlide key="kpis" base={base} />,
    <VendorSlide key="vendor" base={base} />,
    <ReportsSlide key="reports" base={base} />,
    <AsksSlide key="asks" />,
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
