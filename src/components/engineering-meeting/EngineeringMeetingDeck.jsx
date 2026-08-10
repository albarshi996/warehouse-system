import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  drawingPackages,
  fieldVisitAxes,
  fieldVisitRecommendations,
  meetingAttendees,
  meetingOutputs,
  requirementTopics,
  slideIndex,
} from '../../data/engineering-meeting.js';

/*
  ═══════════════════════════════════════════════════════════════════
  مقاس التصميم الثابت للشريحة (لوحة الرسم)
  ═══════════════════════════════════════════════════════════════════
  كل شريحة تُرسم على لوحة ثابتة 1280×720 (نسبة 16:9)، ثم تُكبَّر أو
  تُصغَّر بالكامل بمعامل واحد (transform: scale) لتملأ المساحة المتاحة.
  هذا يضمن أن النِّسَب لا تنكسر أبدًا مهما اختلف مقاس الشاشة أو دخلنا
  وضع العرض — تمامًا كما تعمل برامج العروض التقديمية.
*/
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

// أستروه يرسم المكوّن على الخادم أولًا؛ لذلك نستعمل layout effect في المتصفح فقط.
const useFitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const Chevron = ({ direction = 'next' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={direction === 'next' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const SlideHead = ({ kicker, title, intro }) => (
  <header className="em-slide-head">
    <p>{kicker}</p>
    <h2>{title}</h2>
    {intro && <span>{intro}</span>}
  </header>
);

const NumberedList = ({ items, start = 1, columns = 2 }) => (
  <div className={`em-numbered columns-${columns}`}>
    {items.map((item, index) => (
      <div key={item}><b>{String(start + index).padStart(2, '0')}</b><span>{item}</span></div>
    ))}
  </div>
);

function Cover() {
  return (
    <div className="em-cover">
      <p>اجتماع المكتب الهندسي · مراجعة الأعمال والمشروعات</p>
      <div>
        <span>عرض اجتماع</span>
        <h1>توحيد المتابعة<br />الهندسية للمشروع</h1>
        <h2>مراجعة المتطلبات والزيارة والمخططات تحت إشراف رئيس المكتب الهندسي</h2>
      </div>
      <footer><b>م. محمد الأوجلي</b><span>رئيس المكتب الهندسي</span></footer>
    </div>
  );
}

function PurposeSlide() {
  return (
    <>
      <SlideHead kicker="الغرض من الاجتماع" title="جميع الأعمال الهندسية في مسار إشراف واحد" intro="مراجعة ما تم، توحيد المتابعة، وتثبيت القرارات والمسؤوليات حتى إقفال المشروع." />
      <div className="em-attendees">
        {meetingAttendees.map(([name, role], index) => <div key={name}><b>{String(index + 1).padStart(2, '0')}</b><h3>{name}</h3><p>{role}</p></div>)}
      </div>
      <p className="em-takeaway">المخرج الحاكم: اطلاع مستمر للمهندس محمد الأوجلي على المستجدات، ومتابعة مباشرة لجميع الأعمال الهندسية المستقبلية.</p>
    </>
  );
}

function AgendaSlide() {
  const agenda = [
    ['01', 'المتطلبات المسلّمة', '25 عنوانًا ومحتوى المصدر كاملًا'],
    ['02', 'الزيارة الميدانية', '13 محورًا و4 توصيات وصور الزيارة'],
    ['03', 'المخططات الهندسية', '4 ملفات · 68 صفحة'],
    ['04', 'آلية المتابعة', 'إشراف هندسي وتواصل وسجل قرارات'],
    ['05', 'موقع 133 الرحبة', 'الحالة والإنجاز والتسليم والمعوقات'],
    ['06', 'نقل مستودع فينسيا', 'أسباب التأخير وخطة التسريع'],
  ];
  return (
    <>
      <SlideHead kicker="مسار المراجعة" title="من الأدلة السابقة إلى قرارات قابلة للمتابعة" />
      <div className="em-agenda">{agenda.map(([n, title, detail]) => <div key={n}><b>{n}</b><h3>{title}</h3><p>{detail}</p></div>)}</div>
    </>
  );
}

function RequirementsSlide({ second = false }) {
  const start = second ? 13 : 0;
  const items = second ? requirementTopics.slice(13) : requirementTopics.slice(0, 13);
  return (
    <>
      <SlideHead kicker={`المتطلبات المسلّمة لشركة عبر العالم · ${second ? 'الجزء الثاني' : 'الجزء الأول'}`} title={second ? 'المحاور 14-25 كما وردت في المصدر' : 'المحاور 01-13 كما وردت في المصدر'} intro="هذا الفهرس للتنقل؛ النصوص والجداول والتفاصيل الكاملة تظهر في الشريحة التالية دون حذف." />
      <NumberedList items={items} start={start + 1} columns={2} />
    </>
  );
}

function SourceDocument({ ready, base, file, title, sourceName }) {
  return (
    <div className="em-source-wrap">
      <div className="em-source-bar"><div><span>المصدر الحاكم</span><b>{sourceName}</b></div><a href={`${base}/engineering-meeting/${file}`} target="_blank" rel="noreferrer">فتح المستند في نافذة مستقلة</a></div>
      {ready ? <iframe title={title} src={`${base}/engineering-meeting/${file}`} /> : <div className="em-frame-placeholder">يُحمّل المستند عند فتح الشريحة</div>}
    </div>
  );
}

function SourceSlide({ ready, base, kind }) {
  const requirements = kind === 'requirements';
  return (
    <>
      <SlideHead kicker={requirements ? 'المتطلبات المسلّمة لشركة عبر العالم' : 'مخرجات الزيارة الميدانية'} title={requirements ? 'المستند الكامل دون حذف أو اختصار' : 'التقرير الكامل بالملاحظات والتوصيات'} intro="استخدم التمرير داخل المستند للمراجعة بندًا بندًا، أو افتحه في نافذة مستقلة للعرض الموسع." />
      <SourceDocument ready={ready} base={base} file={requirements ? 'requirements.html' : 'field-visit.html'} title={requirements ? 'مستند المتطلبات الكامل' : 'تقرير الزيارة الميدانية الكامل'} sourceName={requirements ? 'المتطلبات.htm' : 'الزيارة الميدانية.htm'} />
    </>
  );
}

function FieldVisitOverview() {
  return (
    <>
      <SlideHead kicker="الزيارة الميدانية مع مشرف شركة عبر العالم" title="كل محور موثّق بثلاث زوايا: الوضع والمناقشة والإجراء" intro="التفاصيل الحرفية لكل محور والتوصيات الأربع معروضة في المستند الكامل التالي." />
      <div className="em-field-layout">
        <NumberedList items={fieldVisitAxes} columns={2} />
        <aside><span>التوصيات الواردة</span>{fieldVisitRecommendations.map((item, index) => <p key={item}><b>{String(index + 1).padStart(2, '0')}</b>{item}</p>)}</aside>
      </div>
    </>
  );
}

function PhotoViewer({ base, layerHost }) {
  const [current, setCurrent] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const src = `${base}/engineering-meeting/source-images/field-visit-${String(current).padStart(2, '0')}.jpg`;
  return (
    <>
      <SlideHead kicker="سجل الزيارة المصوّر" title="تسع صور ميدانية مرتبطة بالتقرير" intro="اختر أي صورة للعرض، ثم افتحها بالحجم الكامل عند الحاجة للمناقشة." />
      <div className="em-photo-viewer">
        <button className="em-photo-main" type="button" onClick={() => setExpanded(true)} aria-label="فتح الصورة بالحجم الكامل"><img src={src} alt={`صورة الزيارة الميدانية ${current}`} /><span><ExpandIcon /> عرض موسع</span></button>
        <div className="em-photo-strip">{Array.from({ length: 9 }, (_, index) => index + 1).map((page) => {
          const thumb = `${base}/engineering-meeting/source-images/field-visit-${String(page).padStart(2, '0')}.jpg`;
          return <button type="button" className={page === current ? 'is-current' : ''} key={page} onClick={() => setCurrent(page)} title={`الصورة ${page}`}><img loading="lazy" src={thumb} alt={`الصورة ${page}`} /><b>{String(page).padStart(2, '0')}</b></button>;
        })}</div>
      </div>
      {expanded && <ZoomLayer src={src} alt={`صورة الزيارة الميدانية ${current}`} onClose={() => setExpanded(false)} container={layerHost} />}
    </>
  );
}

function DrawingsOverview() {
  return (
    <>
      <SlideHead kicker="المخططات الهندسية" title="أربع حزم و68 صفحة للمراجعة والاعتماد" intro="تم تحويل كل صفحات الملفات المطلوبة إلى معاينات محلية؛ لا تدخل النسخة الإضافية «مخازن موقع 155.pdf» في هذا العرض." />
      <div className="em-drawing-packages">{drawingPackages.map((item, index) => <div key={item.id}><b>{String(index + 1).padStart(2, '0')}</b><h3>{item.arabicName}</h3><p>{item.scope}</p><span>{item.code} · {item.name}</span><strong>{item.pages} صفحة</strong></div>)}</div>
      <div className="em-drawing-total"><span>الإجمالي</span><b>68</b><strong>صفحة مخطط ومعاينة</strong></div>
    </>
  );
}

function ZoomLayer({ src, alt, onClose, container }) {
  useEffect(() => {
    const close = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [onClose]);
  /*
    اللوحة مُكبَّرة بـtransform، وأي عنصر fixed داخلها يُقاس عليها لا على الشاشة.
    لذلك يُنقل العرض الموسّع إلى جذر العرض: يملأ الشاشة بمقاسه الأصلي، ويبقى
    داخل عنصر ملء الشاشة فيظهر أيضًا في وضع العرض.
  */
  const host = container?.current;
  if (!host) return null;
  return createPortal(
    <div className="em-zoom" role="dialog" aria-modal="true" aria-label="عرض موسع">
      <button type="button" className="em-zoom-close" onClick={onClose}><CloseIcon /> إغلاق العرض الموسع</button>
      <img src={src} alt={alt} />
    </div>,
    host,
  );
}

function DrawingViewer({ base, drawing, layerHost }) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const pageName = (number) => `page-${String(number).padStart(drawing.pad, '0')}.jpg`;
  const src = `${base}/engineering-meeting/drawings/${drawing.id}/${pageName(page)}`;
  const go = (next) => setPage(Math.max(1, Math.min(drawing.pages, next)));
  return (
    <>
      <SlideHead kicker={`${drawing.code} · ${drawing.name} · ${drawing.pages} صفحة`} title={drawing.arabicName} intro={`${drawing.scope} اختر الصفحة من الشريط السفلي، واضغط المخطط للعرض الموسع.`} />
      <div className="em-drawing-viewer">
        <button className="em-drawing-main" type="button" onClick={() => setExpanded(true)} aria-label="فتح صفحة المخطط بالحجم الكامل"><img src={src} alt={`${drawing.arabicName} - الصفحة ${page}`} /><span><ExpandIcon /> الصفحة {String(page).padStart(2, '0')} من {String(drawing.pages).padStart(2, '0')}</span></button>
        <div className="em-page-controls">
          <button type="button" className="em-page-step" onClick={() => go(page - 1)} disabled={page === 1}><Chevron direction="back" /> الصفحة السابقة</button>
          <div>{Array.from({ length: drawing.pages }, (_, index) => index + 1).map((number) => <button type="button" key={number} className={number === page ? 'is-current' : ''} onClick={() => setPage(number)} aria-label={`الصفحة ${number}`}>{number}</button>)}</div>
          <button type="button" className="em-page-step" onClick={() => go(page + 1)} disabled={page === drawing.pages}>الصفحة التالية <Chevron /></button>
        </div>
      </div>
      {expanded && <ZoomLayer src={src} alt={`${drawing.arabicName} - الصفحة ${page}`} onClose={() => setExpanded(false)} container={layerHost} />}
    </>
  );
}

function DrawingLinks() {
  const rows = [
    ['مبنى الخدمات', 'الموقع والمساقط والمقاطع والواجهات', 'اعتماد التصميم أو توثيق التعديلات المطلوبة'],
    ['المبنى الإداري', 'التوزيع الوظيفي والحركة والمظهر المعماري', 'اعتماد التوزيع والواجهات أو إعادتها للمراجعة'],
    ['المخازن 155', 'بيان المخازن والمساحات والارتباط بالموقع', 'تثبيت البيانات المرجعية التي سيُبنى عليها التنفيذ'],
    ['المخطط العام 2D و3D', 'المخازن والتبريد والسكن والحركة والمداخل', 'اعتماد المخطط العام وتسلسل التنفيذ المقترح'],
  ];
  return (
    <>
      <SlideHead kicker="الربط بمتطلبات المشروع" title="كل حزمة تنتهي بقرار هندسي موثّق" intro="المجالات أدناه مستخلصة من صفحات المخططات نفسها؛ الاعتماد النهائي يصدر بعد مراجعة المهندس محمد الأوجلي." />
      <div className="em-link-table"><header><span>الحزمة</span><span>نطاق المراجعة</span><span>القرار المطلوب</span></header>{rows.map((row) => <div key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}</div>
    </>
  );
}

function FollowUpSlide() {
  const phases = [
    ['أولاً بأول', ['إشعار رئيس المكتب الهندسي بأي مستجد أو تغيير', 'إرفاق المخطط أو الملاحظة أو الدليل المرتبط', 'تسجيل القرار والجهة المسؤولة فور صدوره']],
    ['مراجعة دورية', ['تحديث موحّد للحالة ونسبة الإنجاز', 'قائمة المعوقات والقرارات المعلقة', 'تأكيد الخطوة التالية والموعد والمسؤول']],
    ['إقفال هندسي', ['مراجعة التنفيذ مقابل المخطط المعتمد', 'توثيق الملاحظات المتبقية', 'إقفال البند بموافقة رئيس المكتب الهندسي']],
  ];
  return (
    <>
      <SlideHead kicker="مقترح للاعتماد في الاجتماع" title="متابعة مباشرة وسجل واحد حتى الإقفال" intro="الصيغة التالية مقترحة، وليست قرارًا نافذًا قبل اعتماد الحضور." />
      <div className="em-followup">{phases.map(([title, items], index) => <section key={title}><b>{String(index + 1).padStart(2, '0')}</b><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}</div>
      <p className="em-proposal">قناة المتابعة وتكرار الاجتماع الدوري والوثيقة المرجعية النهائية: تُحدد وتُعتمد أثناء الاجتماع.</p>
    </>
  );
}

function RahbaSlide() {
  const fields = [['الوضع الحالي', 'يُعرض ويُثبت في الاجتماع'], ['نسبة الإنجاز', 'تُحدد من آخر تقرير معتمد'], ['موعد التسليم المتوقع', 'قرار مطلوب من الاجتماع'], ['المعوقات', 'تُسجل مع المالك والإجراء والموعد']];
  return (
    <>
      <SlideHead kicker="متابعة مشروع صيانة موقع 133 الرحبة" title="لا يُقفل الاجتماع دون موعد تسليم واضح" intro="لا تتوفر في المصادر المقدمة نسبة إنجاز أو تاريخ تسليم معتمد؛ لذلك تُستكمل الحقول التالية أمام الحضور." />
      <div className="em-project-sheet"><div className="em-project-number"><span>الموقع</span><b>133</b><strong>الرحبة</strong></div><div className="em-project-fields">{fields.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></div>
    </>
  );
}

function VeneciaSlide() {
  const steps = ['تثبيت سبب أو أسباب التأخير بالأدلة.', 'تحديد الأعمال المتبقية والاعتماد الهندسي المرتبط بها.', 'تعيين مسؤول وموعد لكل إجراء تصحيحي.', 'اعتماد مسار تسريع ومراجعة تقدمه حتى الإقفال.'];
  return (
    <>
      <SlideHead kicker="متابعة مشروع نقل مستودع فينسيا" title="التأخير يحتاج خطة تعافٍ مرتبطة بالمسار الهندسي" intro="المعلومة المؤكدة في الطلب: النقل متأخر عن الجدول المستهدف. الأسباب والمواعيد لا تُفترض، بل تُثبت في الاجتماع." />
      <div className="em-delay"><aside><span>حالة مطلوبة للمعالجة</span><b>متأخر</b><p>عن الجدول المستهدف</p></aside><div><h3>مسار مقترح لخطة التسريع</h3><NumberedList items={steps} columns={1} /></div></div>
    </>
  );
}

function ResponsibilitiesSlide() {
  const rows = [
    ['م. محمد الأوجلي', 'الإشراف الهندسي، مراجعة واعتماد المخططات، متابعة المستجدات، وإقفال الملاحظات الهندسية.'],
    ['أ. رمزي الباش', 'تنسيق متطلبات الخدمات اللوجستية والموارد والارتباطات التنفيذية — مقترح للاعتماد.'],
    ['م. محمد إبراهيم البرشي', 'تجميع الحالة والمستندات، متابعة الأعمال من منظور سلاسل الإمداد، وتحديث سجل القرارات — مقترح للاعتماد.'],
  ];
  return (
    <>
      <SlideHead kicker="صيغة مسؤوليات مقترحة للاعتماد" title="مسؤول واضح لكل متابعة وقرار" intro="صلاحية رئيس المكتب الهندسي واردة في غرض الاجتماع؛ توزيع بقية المسؤوليات أدناه مقترح ويحتاج موافقة الحضور." />
      <div className="em-responsibilities">{rows.map(([name, responsibility], index) => <div key={name}><b>{String(index + 1).padStart(2, '0')}</b><h3>{name}</h3><p>{responsibility}</p></div>)}</div>
      <p className="em-proposal">يُستكمل سجل الإجراء بعد الاجتماع بالحقول: البند · القرار · المسؤول · الموعد · الحالة · دليل الإقفال.</p>
    </>
  );
}

function OutputsSlide() {
  return (
    <>
      <SlideHead kicker="إقفال الاجتماع" title="ستة مخرجات يجب أن تتحول إلى قرارات مسجلة" intro="لا يُعد أي بند معتمدًا إلا بعد توثيق قرار الحضور والمسؤول والموعد." />
      <NumberedList items={meetingOutputs} columns={2} />
      <div className="em-closing"><span>النتيجة المستهدفة</span><b>مرجع هندسي واحد · متابعة مباشرة · مسؤوليات ومواعيد حتى إقفال جميع البنود</b></div>
    </>
  );
}

/*
  ═══════════════════════════════════════════════════════════════════
  شريط التحكم — نفس المكوّن في الوضعين (داخل الصفحة / وضع العرض)
  ═══════════════════════════════════════════════════════════════════
  أزرار مُسمّاة بالنص لا بالأيقونة وحدها، لأن العارض في الاجتماع
  يحتاج أن يعرف فورًا: أين «التالي» وأين «السابق» وكيف يُنهي العرض.
*/
function DeckControls({ current, total, presenting, onGo, onOverview, onStart, onExit }) {
  return (
    <footer className={`em-controls${presenting ? ' is-presenting' : ''}`}>
      <div className="em-controls-progress" aria-hidden="true"><i style={{ width: `${((current + 1) / total) * 100}%` }} /></div>

      <div className="em-controls-row">
        <div className="em-controls-side">
          {presenting ? (
            <button type="button" className="em-btn em-btn-exit" onClick={onExit}><CloseIcon /> إنهاء العرض</button>
          ) : (
            <button type="button" className="em-btn em-btn-play" onClick={onStart}><PlayIcon /> بدء العرض</button>
          )}
          <button type="button" className="em-btn" onClick={onOverview}><GridIcon /> فهرس الشرائح</button>
        </div>

        <div className="em-controls-nav">
          <button type="button" className="em-btn em-btn-step" onClick={() => onGo(current - 1)} disabled={current === 0}><Chevron direction="back" /> السابق</button>
          <span className="em-counter"><b>{String(current + 1).padStart(2, '0')}</b> / {String(total).padStart(2, '0')}</span>
          <button type="button" className="em-btn em-btn-step" onClick={() => onGo(current + 1)} disabled={current === total - 1}>التالي <Chevron /></button>
        </div>

        <div className="em-controls-side em-controls-dots">
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

export default function EngineeringMeetingDeck({ base }) {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [seen, setSeen] = useState(() => new Set([0]));
  const rootRef = useRef(null);
  const stageRef = useRef(null);

  const slides = useMemo(() => [
    <Cover key="cover" />,
    <PurposeSlide key="purpose" />,
    <AgendaSlide key="agenda" />,
    <RequirementsSlide key="requirements-1" />,
    <RequirementsSlide key="requirements-2" second />,
    <SourceSlide key="requirements-source" ready={seen.has(5)} base={base} kind="requirements" />,
    <FieldVisitOverview key="field-overview" />,
    <SourceSlide key="field-source" ready={seen.has(7)} base={base} kind="field-visit" />,
    <PhotoViewer key="photos" base={base} layerHost={rootRef} />,
    <DrawingsOverview key="drawings-overview" />,
    ...drawingPackages.map((drawing) => <DrawingViewer key={drawing.id} base={base} drawing={drawing} layerHost={rootRef} />),
    <DrawingLinks key="drawing-links" />,
    <FollowUpSlide key="follow-up" />,
    <RahbaSlide key="rahba" />,
    <VeneciaSlide key="venecia" />,
    <ResponsibilitiesSlide key="responsibilities" />,
    <OutputsSlide key="outputs" />,
  ], [base, seen]);

  const total = slides.length;
  const go = useCallback((index) => setCurrent((value) => {
    const next = Math.max(0, Math.min(total - 1, index));
    return next === value ? value : next;
  }), [total]);

  // المستندات المضمّنة تبقى محمّلة بعد أول زيارة، فلا تُعاد التهيئة عند كل مرور.
  useEffect(() => {
    setSeen((previous) => (previous.has(current) ? previous : new Set(previous).add(current)));
  }, [current]);

  /*
    ملاءمة اللوحة الثابتة للمساحة المتاحة: معامل تكبير واحد يُطبَّق على
    الشريحة كاملةً، فلا تنكسر النسب ولا يُقتطع أي جزء من المحتوى.
  */
  useFitEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
      stage.style.setProperty('--em-scale', String(Math.max(scale, 0.1)));
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
    // الدخول إلى وضع العرض والخروج منه يغيّران مساحة المسرح فورًا؛ نعيد
    // الحساب صراحةً ولا نتّكل على المُراقِب وحده.
  }, [presenting]);

  /*
    وضع العرض: نطلب ملء الشاشة على حاوية العرض نفسها لا على الصفحة كلها،
    حتى لا يبقى هامش الشريط الجانبي وحشوة المحتوى داخل ملء الشاشة.
    وإن رفض المتصفح الطلب، تبقى الحاوية مثبّتة فوق الصفحة (بديل CSS) فيعمل الوضع دائمًا.
  */
  const startPresenting = useCallback(() => {
    setPresenting(true);
    const node = rootRef.current;
    if (node?.requestFullscreen) {
      node.requestFullscreen().catch(() => {});
    }
  }, []);

  const exitPresenting = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
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
      const isField = target instanceof HTMLElement
        && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (isField) return;
      // العرض الموسّع للصور والمخططات يبتلع المفاتيح بنفسه.
      if (document.querySelector('.em-zoom')) return;

      const key = event.key;
      const onControl = target instanceof HTMLElement && target.closest('button, a');
      // المسافة وEnter فوق زر: نترك الزر يعمل ولا نضيف تنقّلًا ثانيًا.
      if ((key === ' ' || key === 'Enter') && onControl) return;

      const next = () => { event.preventDefault(); go(current + 1); };
      const back = () => { event.preventDefault(); go(current - 1); };

      if (key === 'ArrowLeft' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') return next();
      if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'PageUp') return back();
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
    <div className={`engineering-meeting-deck${presenting ? ' is-presenting' : ''}`} ref={rootRef}>
      {!presenting && (
        <header className="em-toolbar">
          <a href={`${base}/dashboard`}><Chevron direction="back" /><span>لوحة التحكم</span></a>
          <div><b>ENGINEERING OFFICE</b><span>اجتماع توحيد المتابعة الهندسية</span></div>
          <p className="em-toolbar-slide">{slideIndex[current]}</p>
        </header>
      )}

      <main className="em-stage" ref={stageRef} aria-live="polite">
        <div className="em-canvas">
          {slides.map((content, index) => (
            <article key={slideIndex[index]} className={`em-slide${current === index ? ' is-active' : ''}`} aria-hidden={current !== index}>{content}</article>
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
        <div className="em-overview" role="dialog" aria-modal="true" aria-label="فهرس الشرائح">
          <header>
            <b>فهرس الشرائح · {String(total).padStart(2, '0')} شريحة</b>
            <button type="button" className="em-btn em-btn-exit" onClick={() => setOverview(false)}><CloseIcon /> إغلاق الفهرس</button>
          </header>
          <div>
            {slideIndex.map((label, index) => (
              <button type="button" key={label} className={index === current ? 'is-current' : ''} onClick={() => { go(index); setOverview(false); }}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p>اختصارات لوحة المفاتيح: <b>←</b> التالي · <b>→</b> السابق · <b>F</b> بدء أو إنهاء العرض · <b>O</b> الفهرس · <b>Esc</b> خروج</p>
        </div>
      )}
    </div>
  );
}
