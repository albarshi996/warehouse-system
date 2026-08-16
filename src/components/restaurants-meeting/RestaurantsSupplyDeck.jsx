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
  closingLine,
  closingOutcome,
  controlBoards,
  cycles,
  decisionPoints,
  dimensionRules,
  documentShortcutGrid,
  documentsScreen,
  fieldCycle,
  glossary,
  howTo,
  itemRules,
  keyboardHelp,
  masters,
  meetingMeta,
  odooRequest,
  odooRequestNote,
  orgLevels,
  portalShortcuts,
  slideIndex,
  sourceSlide,
  supplyStages,
  unitOptions,
  warehouseRules,
} from '../../data/restaurants-supply-chain.js';

/*
  ═══════════════════════════════════════════════════════════════════
  لوحة الرسم الثابتة 1280×720
  ═══════════════════════════════════════════════════════════════════
  كل شريحة تُرسم على مقاسٍ واحد ثم تُكبَّر أو تُصغَّر ككتلةٍ واحدة، فلا
  تنكسر النِّسَب بين شاشة الحاسوب وجهاز العرض في قاعة الاجتماع.
*/
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const DECISIONS_KEY = 'brandzo:restaurants-supply:decisions:v1';

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
  <header className="rs-slide-head">
    <p>{kicker}</p>
    <h2>{title}</h2>
    {intro && <span>{intro}</span>}
  </header>
);

const pad = (value) => String(value).padStart(2, '0');

/**
 * نسخٌ إلى الحافظة بمسارين: الواجهة الحديثة، ثم `execCommand` القديم — لأن
 * `navigator.clipboard` يفشل في ملء الشاشة وهو بالضبط وضع العرض في الاجتماع.
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
  بطاقة الاختصار — العنصر الذي بُني هذا العرض حوله: لا تكتفي بقول «افتح شاشة
  كذا»، بل تُسمّي الشاشة ومسارها، وتُعدّد النقرات بنصّ أزرارها الحقيقيّ،
  وتُعلن الدليل الذي تُخرجه — ثم تفتحها في تبويبٍ مستقلّ فلا ينكسر العرض.
*/
function ShortcutCard({ base, shortcutKey, compact = false }) {
  const item = portalShortcuts[shortcutKey];
  if (!item) return null;
  return (
    <article className={`rs-shortcut${compact ? ' is-compact' : ''}`}>
      <header>
        <div>
          <b>{item.label}</b>
          <span dir="ltr">{item.path}{item.query ? `?${item.query}` : ''}</span>
        </div>
        <a href={shortcutHref(base, shortcutKey)} target="_blank" rel="noreferrer"><LaunchIcon /> فتح الشاشة</a>
      </header>
      <p className="rs-shortcut-purpose">{item.purpose}</p>
      <ol className="rs-shortcut-clicks">
        {item.clicks.map((click, index) => <li key={click}><i>{index + 1}</i><span>{click}</span></li>)}
      </ol>
      <footer><b>الدليل:</b> {item.evidence}</footer>
    </article>
  );
}

const Flow = ({ nodes }) => (
  <div className="rs-flow">
    {nodes.map(([code, label], index) => (
      <span className="rs-node" key={code}>
        <b>{code}<em>{label}</em></b>
        {index < nodes.length - 1 && <i className="rs-arrow">←</i>}
      </span>
    ))}
  </div>
);

const Fields = ({ items, columns = 2 }) => (
  <div className={`rs-fields${columns === 3 ? ' is-three' : ''}${columns === 1 ? ' is-one' : ''}`}>
    {items.map((item, index) => <div key={item}><b>{pad(index + 1)}</b><span>{item}</span></div>)}
  </div>
);

const Roles = ({ roles }) => (
  <div className="rs-roles">
    {roles.map(([role, owner]) => <div key={role}><span>{role}</span><strong>{owner}</strong></div>)}
  </div>
);

const Ordered = ({ items, columns = 2 }) => (
  <ol className={`rs-ordered${columns === 1 ? ' is-one' : ''}`}>
    {items.map((item, index) => <li key={item}><b>{pad(index + 1)}</b><p>{item}</p></li>)}
  </ol>
);

/* ═══════════════════════════════════════════════════════════════════
   الشرائح
   ═══════════════════════════════════════════════════════════════════ */

function Cover() {
  return (
    <div className="rs-cover">
      <p>إدارة السلاسل والإمداد والمخازن — Brandzo Hub · اجتماع مع {meetingMeta.counterpart}</p>
      <div>
        <span>{meetingMeta.docNumber} · الإصدار {meetingMeta.version} · {meetingMeta.status}</span>
        <h1>{meetingMeta.titleEn}<br /><i>Chain</i></h1>
        <h2>{meetingMeta.titleAr}</h2>
        <p className="rs-cover-sub">{meetingMeta.subtitle}</p>
      </div>
      <footer>
        <div><b>{meetingMeta.preparedBy}</b><span>{meetingMeta.preparedRole}</span></div>
        <div><b>{meetingMeta.scope}</b><span>نطاق العرض</span></div>
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
        title="هذا ليس عرضًا يُقرأ — هو عملُنا معروضًا على الشاشات التي يُنفَّذ فيها"
        intro="كل عمليةٍ في هذه الجلسة تحمل بطاقة اختصار: اسم الشاشة، ومسارها الحقيقيّ في البوابة، والنقرات داخلها، والدليل الذي تُخرجه — تُفتح في تبويبٍ مستقلّ فلا ينقطع العرض."
      />
      <div className="rs-howto">
        {howTo.map((item) => (
          <section key={item.tag}><b>{item.tag}</b><h3>{item.title}</h3><p>{item.body}</p></section>
        ))}
      </div>
      <div className="rs-keys">
        <span>اختصارات لوحة المفاتيح</span>
        {keyboardHelp.map(([key, label]) => <p key={key}><kbd>{key}</kbd>{label}</p>)}
      </div>
    </>
  );
}

function AgendaSlide() {
  return (
    <>
      <SlideHead kicker="جدول الأعمال" title="ستة محاور — من المفهوم إلى الطلب الموقَّع" />
      <div className="rs-agenda">
        {agenda.map(([index, title, detail]) => (
          <div key={index}><b>{index}</b><h3>{title}</h3><p>{detail}</p></div>
        ))}
      </div>
    </>
  );
}

function DimensionsSlide({ base }) {
  const hierarchy = sourceSlide('الهيكل الموحد للبيانات');
  return (
    <>
      <SlideHead
        kicker="المحور 01 · الأبعاد التنظيمية"
        title="الطلب لا يصل «للمطاعم» — يصل إلى فرعٍ بعينه ومركز تكلفةٍ بعينه"
        intro={hierarchy.note}
      />
      <div className="rs-dims">
        <div className="rs-tree">
          {orgLevels.map(([id, label, title, why]) => (
            <div key={id}><b>{label}</b><div><h3>{title}</h3><p>{why}</p></div></div>
          ))}
        </div>
        <aside className="rs-side">
          <ul className="rs-bullets">
            {dimensionRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
          <ShortcutCard base={base} shortcutKey="orgDimensions" compact />
        </aside>
      </div>
    </>
  );
}

function GlossarySlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 01 · توحيد المفاهيم"
        title="اثنا عشر مصطلحًا بتعريفٍ واحد — قبل أن نتفق على إجراء"
        intro="أكثر ما يُفسد التزويد ليس نقص النظام، بل أن يُفهم المصطلح الواحد بوجهين. هذا الجدول هو ما يُوقَّع عليه في هذه الجلسة."
      />
      <div className="rs-table-wrap">
        <table className="rs-table rs-compact">
          <thead>
            <tr><th style={{ width: '17%' }}>المصطلح</th><th>التعريف المعتمد</th><th style={{ width: '30%' }}>الخلط الذي يُمنع</th></tr>
          </thead>
          <tbody>
            {glossary.map(([term, definition, confusion]) => (
              <tr key={term}><td><b>{term}</b></td><td>{definition}</td><td className="rs-warn">{confusion}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OwnershipSlide() {
  const rule = sourceSlide('قاعدة التشغيل');
  return (
    <>
      <SlideHead
        kicker="المحور 01 · القاعدة الحاكمة"
        title={rule.title}
        intro="سؤالٌ واحد يسبق كل مستند: هل الموقع المستلم مملوكٌ للشركة أم جهةٌ خارجية؟ الإجابة تحدّد الدورة كلّها والأثر الماليّ."
      />
      <div className="rs-compare">
        {rule.columns.map((column) => (
          <section key={column.title}>
            <span>{column.tag}</span>
            <h3>{column.title}</h3>
            <ul>{column.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </div>
    </>
  );
}

function MastersSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · البيانات المرجعية"
        title="أربعة ماستراتٍ تُضبط مرّةً — ثم لا يُناقَش رقمٌ بعدها"
        intro="كل خللٍ في التزويد يُردّ في النهاية إلى ماسترٍ ناقص: صنفٌ بلا باركود، أو فرعٌ بلا موقع، أو مورّدٌ اسمُه مكتوبٌ بصيغتين."
      />
      <div className="rs-masters">
        {masters.map(([title, detail, , why], index) => (
          <div key={title}>
            <b>{pad(index + 1)}</b>
            <div><h3>{title}</h3><p>{detail}</p><span>{why}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

function ItemsSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · الأصناف ووحدات القياس"
        title="الصنف هويّةٌ واحدة: رمزٌ وباركودٌ ووحدة قياسٍ لا تتبدّل"
      />
      <div className="rs-split">
        <div className="rs-side">
          <section>
            <b>وحدات القياس المعتمدة في الماستر</b>
            <div className="rs-chips">{unitOptions.map((unit) => <span key={unit}>{unit}</span>)}</div>
          </section>
          <ul className="rs-bullets">{itemRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </div>
        <ShortcutCard base={base} shortcutKey="items" />
      </div>
    </>
  );
}

function PartnersSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · شركاء الأعمال"
        title="المورّد والعميل رمزان لا اسمان يُكتبان في خانةٍ حرّة"
        intro="ماستران بمحرّكٍ واحد: إضافةٌ واستيرادٌ من Excel بمعاينة، وأرشفةٌ بلا حذف — فيبقى تاريخ الحركة سليمًا بعد التوقّف."
      />
      <div className="rs-duo">
        <ShortcutCard base={base} shortcutKey="suppliers" />
        <ShortcutCard base={base} shortcutKey="customers" />
      </div>
    </>
  );
}

function WarehousesSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 02 · المستودعات ومواقع الفروع"
        title="لكل فرع مطعمٍ موقعٌ مخزنيّ مستقلّ — وبينهما مخزن نقلٍ يجب أن يفرغ"
      />
      <div className="rs-split">
        <ul className="rs-bullets">{warehouseRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <ShortcutCard base={base} shortcutKey="warehouses" />
      </div>
    </>
  );
}

function DocumentsScreenSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · شاشة المستندات"
        title="المستند الرسميّ يُحفظ ولا يضيع: رقمٌ ومنشئٌ ومعتمدٌ وسجل تدقيق"
        intro="من هذه الشاشة الواحدة تُدار الدورات الخمس كلّها — الوارد والنقل والمرتجعات والتالف والمبيعات."
      />
      <div className="rs-split">
        <div className="rs-side">
          <div className="rs-masters">
            {documentsScreen.map(([title, detail], index) => (
              <div key={title}><b>{pad(index + 1)}</b><div><h3>{title}</h3><p>{detail}</p></div></div>
            ))}
          </div>
        </div>
        <ShortcutCard base={base} shortcutKey="documents" />
      </div>
    </>
  );
}

function CyclesMapSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · الدورات الخمس"
        title="خمس دوراتٍ تغطّي كل حركةٍ تخصّ فرع المطعم"
        intro="لكل دورةٍ رموزُ مستنداتها المبنيّة في المحرّك — وكلٌّ منها في الشرائح التالية بتفصيلها وقاعدتها الحاكمة."
      />
      <div className="rs-cycles-map">
        {cycles.map((cycle, index) => (
          <div key={cycle.id}>
            <b>{pad(index + 1)}</b>
            <h3>{cycle.title}</h3>
            <p>{cycle.intro}</p>
            <span>{cycle.nodes.map(([code]) => <i key={code}>{code}</i>)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CycleSlide({ base, cycle, index }) {
  return (
    <>
      <SlideHead kicker={`المحور 03 · الدورة ${pad(index + 1)} من ${pad(cycles.length)}`} title={cycle.headline} intro={cycle.intro} />
      <div className="rs-cycle">
        <div className="rs-cycle-main">
          <Flow nodes={cycle.nodes} />
          <div className="rs-callout is-neutral"><b>ما يتفرّع عنها</b><p>{cycle.branch}</p></div>
          <div className="rs-callout"><b>القاعدة الحاكمة</b><p>{cycle.rule}</p></div>
        </div>
        <div className="rs-side">
          {cycle.shortcuts.map((key) => <ShortcutCard key={key} base={base} shortcutKey={key} compact />)}
        </div>
      </div>
    </>
  );
}

function DocumentGridSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 03 · الإنشاء المباشر"
        title="كل رمزٍ هنا زرٌّ يفتح مستندًا حقيقيًّا في المحرّك"
        intro="ليست قائمة نوايا: كل رمزٍ في هذه الشبكة مخطّطٌ مبنيّ، يُفتح بضغطة وينشئ مستندًا برقمٍ تسلسليّ وسجل تدقيق."
      />
      <div className="rs-doc-grid">
        {documentShortcutGrid.map((group) => (
          <section key={group.group}>
            <h3>{group.group}</h3>
            <div>
              {group.types.map(([type, label]) => (
                <a key={type} href={`${base}/dashboard/document?type=${type}`} target="_blank" rel="noreferrer">
                  <b>{type}</b><span>{label}</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function StagesMapSlide() {
  const flow = sourceSlide('الدورة الحاكمة');
  return (
    <>
      <SlideHead
        kicker="المحور 04 · دورة تزويد الفرع"
        title={flow.title}
        intro={flow.note}
      />
      <div className="rs-stages">
        {supplyStages.map(([index, title, code, note]) => (
          <div key={index}><b>{index}</b><h3>{title}</h3><p>{note}</p><span>{code}</span></div>
        ))}
      </div>
      <p className="rs-note">الترميز المستخدم في المثال: <b dir="ltr">REST-BR01-003</b> للطلب، و<b dir="ltr">CC-REST-BR01-003</b> لمركز التكلفة — القطاع فالبراند فالفرع.</p>
    </>
  );
}

function StageOneSlide({ base }) {
  const slide = sourceSlide('المرحلة 1 · إنشاء TR');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلة ١" title={slide.title} intro={slide.intro} />
      <div className="rs-step">
        <div className="rs-step-main">
          <section><b>الحقول الإلزامية في طلب التحويل</b><Fields items={slide.items} columns={3} /></section>
          <div className="rs-guard"><p><b>أغراض التحويل المعتمدة:</b> {slide.footer.replace('أغراض التحويل: ', '')}</p></div>
        </div>
        <ShortcutCard base={base} shortcutKey="docTR" compact />
      </div>
    </>
  );
}

function StageReviewSlide() {
  const slide = sourceSlide('المرحلتان 2 و3');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلتان ٢ و٣" title={slide.title} intro={slide.note} />
      <div className="rs-step">
        <div className="rs-step-main">
          <section><b>ما تفحصه المراجعة قبل الاعتماد</b><Fields items={slide.items} columns={2} /></section>
        </div>
        <div className="rs-side">
          <section><b className="rs-label">من يفعل ماذا</b><Roles roles={slide.roles} /></section>
          <div className="rs-callout"><b>الفصل بين الصلاحيات</b><p>من ينشئ لا يراجع، ومن يراجع لا يعتمد، ومن يعتمد لا يُنجز — أربع أيدٍ على المستند الواحد.</p></div>
        </div>
      </div>
    </>
  );
}

function StagePickSlide() {
  const slide = sourceSlide('المرحلة 4 · التجهيز');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلة ٤" title={slide.title} />
      <div className="rs-step">
        <div className="rs-step-main">
          <Ordered items={slide.items} columns={2} />
          <div className="rs-guard"><p>{slide.footer}</p></div>
        </div>
        <div className="rs-side">
          <div className="rs-callout is-gold">
            <b>الصرف بالأقرب انتهاءً (FEFO)</b>
            <p>السحب يبدأ بالدفعة الأقرب لانتهاء الصلاحية لا بالأقرب إلى باب المخزن — وهو ما يمنع تراكم القريب من الانتهاء في رفوف الفروع.</p>
          </div>
          <div className="rs-callout is-neutral">
            <b>لماذا الفصل حسب البراند والفرع؟</b>
            <p>الرحلة واحدة والطرود مختلطة ⇒ يستلم الفرع ما ليس له، ويُفتح فرقٌ في فرعين معًا. الفصل والبطاقة يمنعان ذلك من المصدر.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function StageShipSlide({ base }) {
  const slide = sourceSlide('المرحلة 5 · مستند TRN');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلة ٥" title={slide.title} />
      <div className="rs-step">
        <div className="rs-step-main">
          <section><b>محتوى مستند الشحن</b><Fields items={slide.fields} columns={2} /></section>
          <div className="rs-guard"><p><b>الأثر المخزنيّ:</b> {slide.outcome} — الرصيد غادر المستودع ولم يدخل الفرع بعد، وهو مرئيٌّ في مخزن النقل لا مفقود.</p></div>
        </div>
        <div className="rs-side">
          <Roles roles={slide.roles} />
          <ShortcutCard base={base} shortcutKey="docTRN" compact />
        </div>
      </div>
    </>
  );
}

function StageTransitSlide({ base }) {
  const slide = sourceSlide('المرحلة 6 · النقل والمتابعة');
  const statuses = sourceSlide('حالات متابعة مقترحة في المصدر');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلة ٦" title={slide.title} intro="هنا يُجاب سؤال القطاع الأول: أين طلبي الآن؟ الحالة التشغيلية تفصل الانتظار عن التنفيذ عن الإغلاق." />
      <div className="rs-step">
        <div className="rs-step-main">
          <section><b>ما يديره قسم النقل والحركة</b><Fields items={slide.items} columns={2} /></section>
          <section>
            <b>حالات المتابعة المقترحة — من الطلب إلى الإغلاق</b>
            <div className="rs-chips is-soft">{statuses.items.map((status) => <span key={status}>{status}</span>)}</div>
          </section>
          <div className="rs-guard"><p>{statuses.footer}</p></div>
        </div>
        <ShortcutCard base={base} shortcutKey="transfers" compact />
      </div>
    </>
  );
}

function StageReceiveSlide({ base }) {
  const slide = sourceSlide('المرحلة 7 · استلام TRC');
  const evidence = sourceSlide('توصية إثبات في المصدر');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلة ٧" title={slide.title} />
      <div className="rs-step">
        <div className="rs-step-main">
          <section><b>محتوى مستند الاستلام</b><Fields items={slide.fields} columns={2} /></section>
          <section>
            <b>حزمة إثبات الاستلام — ترتبط بالمستند ولا تُحفظ منفصلةً عنه</b>
            <div className="rs-chips is-soft">{evidence.items.map((item) => <span key={item}>{item}</span>)}</div>
          </section>
          <div className="rs-guard"><p><b>الأثر المخزنيّ:</b> {slide.outcome} — بقدر المقبول فعليًّا لا بقدر المرسل.</p></div>
        </div>
        <div className="rs-side">
          <Roles roles={slide.roles} />
          <ShortcutCard base={base} shortcutKey="docTRC" compact />
        </div>
      </div>
    </>
  );
}

function StageVarianceSlide() {
  const slide = sourceSlide('المرحلة 8 · الفروقات');
  return (
    <>
      <SlideHead kicker="المحور 04 · المرحلة ٨" title={slide.title} intro="الفرق ليس خطأً يُخفى — هو بندٌ مفتوحٌ له مسؤولٌ وموعدٌ وإغلاق." />
      <div className="rs-step">
        <div className="rs-step-main">
          <Ordered items={slide.items} columns={1} />
        </div>
        <div className="rs-side">
          <div className="rs-callout">
            <b>القاعدة التي لا تُخترق</b>
            <p>لا تُعدَّل الكمية الأصلية ولا تُحذف الحركة لإخفاء الخطأ. الدفتر ملحق-فقط: التصحيح يكون بحركةٍ جديدةٍ مسبَّبة لا بمسح القديمة.</p>
          </div>
          <div className="rs-callout is-neutral">
            <b>مدّة الإغلاق قرارٌ في هذه الجلسة</b>
            <p>كم يومًا يُسمح ببقاء الفرق معلّقًا قبل التصعيد؟ ومن يعتمد التسوية؟ — بندٌ في لوحة القرار.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function DailyControlSlide({ base }) {
  const slide = sourceSlide('الرقابة اليومية · بيانات كل طلب');
  const board = controlBoards[0];
  return (
    <>
      <SlideHead kicker="المحور 05 · الرقابة اليومية" title={slide.title} intro={board.lead} />
      <div className="rs-boards">
        <div className="rs-side">
          <section>
            <b className="rs-label">خمسة عشر حقلًا تُقرأ لكل طلبٍ في لوحة واحدة</b>
            <div className="rs-metrics">{slide.items.map((item, index) => <div key={item}><b>{pad(index + 1)}</b><span>{item}</span></div>)}</div>
          </section>
        </div>
        <ShortcutCard base={base} shortcutKey={board.key} />
      </div>
    </>
  );
}

function BoardSlide({ base, board, kicker }) {
  return (
    <>
      <SlideHead kicker={kicker} title={board.title} />
      <div className="rs-boards">
        <div className="rs-side">
          <p className="rs-board-lead">{board.lead}</p>
          <ul className="rs-bullets">{board.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
        <ShortcutCard base={base} shortcutKey={board.key} />
      </div>
    </>
  );
}

function FieldSlide({ base }) {
  return (
    <>
      <SlideHead
        kicker="المحور 05 · الميدان والبيع من المركبة"
        title="المركبة مستودعٌ متنقّل له رصيدٌ وعهدةٌ تُقفل في نهاية اليوم"
        intro="دورةٌ كاملةٌ مبنيّةٌ في البوابة، تُضاف لتزويد المطاعم متى اعتمدها القطاع: تحميلٌ فبيعٌ فإرجاعٌ فتسوية."
      />
      <div className="rs-cycle">
        <div className="rs-cycle-main">
          <Flow nodes={fieldCycle.nodes} />
          <div className="rs-callout is-neutral"><b>ما يرافقها في الميدان</b><p>{fieldCycle.branch}</p></div>
          <ul className="rs-bullets">{fieldCycle.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
        <div className="rs-side">
          <ShortcutCard base={base} shortcutKey="vanOps" compact />
          <ShortcutCard base={base} shortcutKey="fieldOps" compact />
        </div>
      </div>
    </>
  );
}

function MetricsSlide() {
  const metrics = sourceSlide('المؤشرات الأسبوعية والشهرية');
  const cadence = sourceSlide('دورية الرقابة');
  return (
    <>
      <SlideHead kicker="المحور 05 · المؤشرات ودورية الرقابة" title={cadence.title} intro={metrics.title} />
      <div className="rs-metrics">
        {metrics.items.map((item, index) => <div key={item}><b>{pad(index + 1)}</b><span>{item}</span></div>)}
      </div>
      <div className="rs-cadence" style={{ marginTop: '1.1rem' }}>
        {cadence.columns.map(([title, items]) => (
          <section key={title}><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>
        ))}
      </div>
    </>
  );
}

function OdooRequestSlide() {
  return (
    <>
      <SlideHead
        kicker="المحور 06 · الطلب الموحَّد"
        title="ما نطلبه من شركة تنفيذ أودو — بعمودين لا بوصفٍ إنشائيّ"
        intro="العمود الأوسط مبنيٌّ ويُعرض حيًّا في البوابة، والعمود الأخير هو المطلوب تنفيذه هناك. هذه الشريحة هي الطلب نفسه."
      />
      <div className="rs-table-wrap">
        <table className="rs-table rs-compact">
          <thead>
            <tr>
              <th style={{ width: '19%' }}>البند</th>
              <th style={{ width: '40%' }}>ما هو مبنيٌّ عندنا — التصوّر القابل للتنفيذ</th>
              <th>المطلوب تنفيذه في أودو</th>
            </tr>
          </thead>
          <tbody>
            {odooRequest.map(([item, built, wanted]) => (
              <tr key={item}><td><b>{item}</b></td><td>{built}</td><td>{wanted}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rs-table-note">{odooRequestNote}</p>
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
        intro="تُسجَّل النتيجة والمسؤول والموعد هنا مباشرةً، وتُنسخ محضرًا جاهزًا بضغطة. البند غير المحسوم يبقى في المحضر بحالته."
      />
      <div className="rs-decisions">
        <ul className="rs-decision-list">
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

        <div className="rs-decision-panel">
          <p className="rs-decision-ask"><b>{decisionPoints[active].title}:</b> {decisionPoints[active].ask}</p>
          <div className="rs-decision-vote">
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
          <div className="rs-decision-fields">
            <label>
              المسؤول
              <input type="text" value={current.owner ?? ''} placeholder={decisionPoints[active].owner} onChange={(event) => patch({ owner: event.target.value })} />
            </label>
            <label>
              الموعد
              <input type="text" value={current.due ?? ''} placeholder="مثال: خلال أسبوع" onChange={(event) => patch({ due: event.target.value })} />
            </label>
            <label className="rs-wide">
              ما اتُّفق عليه
              <textarea rows={3} value={current.note ?? ''} onChange={(event) => patch({ note: event.target.value })} />
            </label>
          </div>
          <footer>
            <div className="rs-decision-meter"><i style={{ width: `${(summary.resolved / summary.total) * 100}%` }} /></div>
            <b>{summary.resolved} / {summary.total} محسوم</b>
            <button type="button" onClick={copyMinutes}>نسخ المحضر</button>
            <button type="button" className="rs-quiet" onClick={() => persist(createDecisionSession(decisionPoints.length))}>تفريغ</button>
          </footer>
          {flash && <p className="rs-note" style={{ margin: 0 }}>{flash}</p>}
        </div>
      </div>
    </>
  );
}

function OutcomeSlide() {
  return (
    <>
      <SlideHead kicker="إقفال الاجتماع" title="ما الذي يخرج من هذه الجلسة" />
      <div className="rs-outcome">
        {closingOutcome.map(([index, title, body]) => (
          <section key={index}><b>{index}</b><h3>{title}</h3><p>{body}</p></section>
        ))}
      </div>
      <p className="rs-outcome-foot"><b>{closingLine}</b></p>
    </>
  );
}

function DeckControls({ current, total, presenting, onGo, onOverview, onStart, onExit }) {
  return (
    <footer className="rs-controls">
      <div className="rs-progress" aria-hidden="true"><i style={{ width: `${((current + 1) / total) * 100}%` }} /></div>
      <div className="rs-controls-row">
        <div className="rs-controls-side">
          {presenting
            ? <button type="button" className="rs-btn rs-btn-exit" onClick={onExit}><CloseIcon /> إنهاء العرض</button>
            : <button type="button" className="rs-btn rs-btn-play" onClick={onStart}><PlayIcon /> بدء العرض</button>}
          <button type="button" className="rs-btn" onClick={onOverview}><GridIcon /> فهرس الشرائح</button>
        </div>
        <div className="rs-controls-nav">
          <button type="button" className="rs-btn rs-btn-step" onClick={() => onGo(current - 1)} disabled={current === 0}><Chevron direction="back" /> السابق</button>
          <span className="rs-counter"><b>{pad(current + 1)}</b> / {pad(total)}</span>
          <button type="button" className="rs-btn rs-btn-step" onClick={() => onGo(current + 1)} disabled={current === total - 1}>التالي <Chevron /></button>
        </div>
        <div className="rs-controls-side rs-controls-dots">
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

export default function RestaurantsSupplyDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);

  const slides = useMemo(() => [
    <Cover key="cover" />,
    <HowToSlide key="howto" />,
    <AgendaSlide key="agenda" />,
    <DimensionsSlide key="dimensions" base={base} />,
    <GlossarySlide key="glossary" />,
    <OwnershipSlide key="ownership" />,
    <MastersSlide key="masters" />,
    <ItemsSlide key="items" base={base} />,
    <PartnersSlide key="partners" base={base} />,
    <WarehousesSlide key="warehouses" base={base} />,
    <DocumentsScreenSlide key="documents" base={base} />,
    <CyclesMapSlide key="cycles-map" />,
    ...cycles.map((cycle, index) => <CycleSlide key={`cycle-${cycle.id}`} base={base} cycle={cycle} index={index} />),
    <DocumentGridSlide key="doc-grid" base={base} />,
    <StagesMapSlide key="stages" />,
    <StageOneSlide key="stage-1" base={base} />,
    <StageReviewSlide key="stage-2" />,
    <StagePickSlide key="stage-4" />,
    <StageShipSlide key="stage-5" base={base} />,
    <StageTransitSlide key="stage-6" base={base} />,
    <StageReceiveSlide key="stage-7" base={base} />,
    <StageVarianceSlide key="stage-8" />,
    <DailyControlSlide key="daily" base={base} />,
    <BoardSlide key="ledger" base={base} board={controlBoards[1]} kicker="المحور 05 · دفتر الحركات" />,
    <BoardSlide key="analytics" base={base} board={controlBoards[2]} kicker="المحور 05 · تحليل المخزون" />,
    <BoardSlide key="reports" base={base} board={controlBoards[3]} kicker="المحور 05 · التقارير" />,
    <FieldSlide key="field" base={base} />,
    <MetricsSlide key="metrics" />,
    <OdooRequestSlide key="odoo" />,
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
      stage.style.setProperty('--rs-scale', String(Math.max(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT), 0.1)));
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
    <div className={`rest-supply-deck${presenting ? ' is-presenting' : ''}`} ref={rootRef}>
      {!presenting && (
        <header className="rs-toolbar">
          <a href={`${base}/dashboard/reports`}><Chevron direction="back" /><span>مركز التقارير</span></a>
          <div><b>{meetingMeta.docNumber}</b><span>{meetingMeta.titleAr}</span></div>
          <p className="rs-toolbar-slide">{slideIndex[current]}</p>
        </header>
      )}

      <main className="rs-stage" ref={stageRef} aria-live="polite">
        <div className="rs-canvas">
          {slides.map((content, index) => (
            <article key={slideIndex[index]} className={`rs-slide${current === index ? ' is-active' : ''}`} aria-hidden={current !== index}>{content}</article>
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
        <div className="rs-overview" role="dialog" aria-modal="true" aria-label="فهرس الشرائح">
          <header>
            <b>فهرس الشرائح · {pad(total)} شريحة</b>
            <button type="button" className="rs-btn rs-btn-exit" onClick={() => setOverview(false)}><CloseIcon /> إغلاق الفهرس</button>
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
