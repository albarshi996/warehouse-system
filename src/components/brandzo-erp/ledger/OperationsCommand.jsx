import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { subscribeItems } from '../../../services/items/itemService.js';
import {
  ORIGIN,
  computeKpis,
  operationsSnapshot,
  operationExceptions,
  originOf,
  referenceFreshness,
} from '../../../services/ledger/operationsDashboard.js';
import ExceptionsBox from './ExceptionsBox.jsx';
import { listenExceptions, syncDetections } from '../../../services/ledger/exceptionsService.js';
import { canOpenPath } from '../../../services/auth/pageAccess.js';
import { listenLaborTasks } from '../../../services/labor/laborTasksService.js';
import { listenSyncEvents } from '../../../services/odoo/odooSyncService.js';
import { listenPullState } from '../../../services/odoo/pullService.js';
import { toMillis } from '../../../services/documents/inbox.js';

/**
 * حدّ عرض المستندات: اللوحة تقرأ أحدث DOC_CAP مستند وتحسب في المتصفّح. رقمٌ
 * كبيرٌ يكفي لحجم اليوم؛ وإن بلغه الإجمالي يظهر شريط تنبيه صادق (لا صمت). الحلّ
 * الجذريّ عند التوسّع هو تجميع خادميّ (Cloud Function) يُغني عن القراءة الكاملة.
 */
const DOC_CAP = 800;
/** نافذة المؤشرات: تقيس الأداء الحديث لا التاريخ كلّه — فتبقى صحيحة مع النموّ. */
const KPI_WINDOW_DAYS = 90;
const DAY_MS = 86400000;
/** سجلّ أحداث المزامنة: أحدث ما يكفي لمعرفة آخر سحبٍ — لا المجموعة كلّها. */
const SYNC_EVENTS_CAP = 40;

/**
 * المناظير المتخصّصة — قرار المالك 2026-08-24: **هذه اللوحة هي الرئيسة**.
 *
 * كانت أربعُ شاشاتٍ تجيب سؤالًا واحدًا («ما حال العمليّات الآن؟») موزّعةً على
 * أربع مجموعاتٍ في القائمة، فلا يعرف المستخدم أيّها الحقيقيّة. والفحص أظهر
 * أنّها ليست متطابقة: هذه تعرض الحال كلّه، وتلك تُقرّب زاويةً بتفصيلها. فبقيت
 * الثلاث كما هي — **بلا حذفٍ ولا تغيير رابط** — وصارت تُفتح من هنا بوصفها
 * نوافذَ لا لوحاتٍ منافسة.
 *
 * وتُفلتر بصلاحية الفاتح: هذه اللوحة مفتوحةٌ للجميع والمناظير للمديرَين، فلو
 * عُرضت كلُّها لصار خمسةُ أدوارٍ أمام «اسمٍ بلا باب» — وهو الدرس المدوَّن في
 * `navCatalog.js` نفسه.
 */
const LENSES = [
  { path: '/dashboard/operations', icon: 'clipboardList', label: 'متابعة الجرد والمسح الحيّ' },
  { path: '/dashboard/supply-chain', icon: 'truck', label: 'الأسطول والعُهد وأوامر الشغل' },
  { path: '/dashboard/logistics-dashboard', icon: 'gauge', label: 'قمرة اللوجستيات (أودو)' },
];

/**
 * غرفة القيادة ‹EXE-503› — الاستثناء في القلب والمرجعيّ معلَنُ التاريخ.
 *
 * ═══ ما تغيّر ═══
 * كانت الشاشة تفتح بأربع بطاقاتٍ كبيرة للمؤشّرات، والاستثناء تحتها. **فأوّل ما
 * يراه المشرف هو الطبيعيّ**، وما يحتاج تدخّلًا ينزل تحت الطيّة. فانقلب الترتيب:
 *   ١ **تدخّل الآن** — الاستثناء بإجرائه ومسؤوله في القلب.
 *   ٢ **إجراءات سريعة** — المؤشّرات شريطًا مضغوطًا · وأبوابُ العمل.
 *   ٣ **الفهرس الكامل** — العدّادات كلّها، كلٌّ بأصله المعلَن.
 *
 * ═══ والمرجعيّ يُعلَن تاريخه (ف ت‑١٢) ═══
 * «١٢ صنفًا تحت الحدّ الأدنى» رقمٌ نصفُه من أرصدتنا اللحظيّة ونصفُه حدٌّ
 * مستورَدٌ من أودو. فيُوضع بجانبه **نصُّ آخر سحب**، ولا يُخلط اللحظيّ
 * بالمرجعيّ في رقمٍ واحدٍ صامت. والأصلُ يُقرأ من `SNAPSHOT_ORIGIN` لا من
 * حكمٍ في الشاشة.
 *
 * ولا حسابَ هنا: كلّه في `operationsDashboard.js` الخالص المُختبَر.
 */

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const days = (v) => (v == null ? '—' : `${v.toFixed(1)} يوم`);
const num = (n) => (Number(n) || 0).toLocaleString('ar-LY');
const money = (n) => `${(Number(n) || 0).toLocaleString('ar-LY', { maximumFractionDigits: 0 })} د.ل`;

/** لون المؤشر حسب هدفه (أخضر جيّد · أصفر مقبول · أحمر متعثّر). */
function tone(v, good, ok, invert = false) {
  if (v == null) return '#6b7280';
  const val = invert ? -v : v;
  const g = invert ? -good : good;
  const o = invert ? -ok : ok;
  if (val >= g) return '#10b981';
  if (val >= o) return '#f59e0b';
  return '#ef4444';
}

export default function OperationsCommand() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [items, setItems] = useState([]);
  const nowMs = useMemo(() => Date.now(), [docs, balances]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const u1 = listenAllDocuments(setDocs, DOC_CAP);
    const u2 = listenBalances(setBalances, () => setBalances([]));
    const u3 = subscribeItems(setItems, () => setItems([]));
    return () => {
      u1?.();
      u2?.();
      u3?.();
    };
  }, [me]);

  const kpis = useMemo(() => computeKpis(docs, { nowMs, windowDays: KPI_WINDOW_DAYS }), [docs, nowMs]);
  const snap = useMemo(() => operationsSnapshot(docs, balances, items), [docs, balances, items]);
  const exceptions = useMemo(() => operationExceptions(docs, balances, nowMs, items), [docs, balances, items, nowMs]);

  // ‹EXE-204› السجلّ يُقرأ حيًّا، والتسجيل بيد المشرف (ت-O01) لا صامتًا.
  const [registry, setRegistry] = useState([]);
  const [registering, setRegistering] = useState('');
  const [laborTasks, setLaborTasks] = useState([]);
  useEffect(() => listenExceptions(setRegistry, () => setRegistry([])), []);
  useEffect(() => listenLaborTasks(setLaborTasks, () => setLaborTasks([])), []);

  // ‹EXE-503› قِدَم المرجعيّ: سجلّ أحداث المزامنة (للأصناف) وحالة السحب (للمرايا).
  // كلاهما محدودُ القراءة — لا مجموعةَ مزامنةٍ كاملة تُقرأ لأجل ختمِ زمن.
  const [syncEvents, setSyncEvents] = useState([]);
  const [pullState, setPullState] = useState([]);
  useEffect(() => listenSyncEvents(setSyncEvents, SYNC_EVENTS_CAP, () => setSyncEvents([])), []);
  useEffect(() => listenPullState(setPullState, () => setPullState([])), []);
  const reference = useMemo(
    () => referenceFreshness({ events: syncEvents, pullState }, nowMs),
    [syncEvents, pullState, nowMs]
  );

  async function registerDetected() {
    setRegistering('يسجّل…');
    try {
      await syncDetections(exceptions, registry, new Date(nowMs).getFullYear(), null);
    } catch (err) {
      console.error('تعذّر تسجيل الاستثناءات:', err);
    } finally {
      setRegistering('');
    }
  }

  // صدقُ البتر: إن بلغ عدد المستندات حدّ العرض فثمّة أقدمُ منها لم يُقرأ.
  // وإن كان أقدم مستندٍ مقروء أحدثَ من بداية نافذة المؤشرات، فالنافذة نفسها
  // ناقصة ⇒ المؤشرات قد لا تعكس كل الـ90 يومًا. نقولها صراحةً لا نُخفيها.
  const truncated = docs.length >= DOC_CAP;
  const oldestMs = useMemo(() => {
    let m = null;
    for (const d of docs) {
      const t = toMillis(d?.createdAt);
      if (t != null && (m == null || t < m)) m = t;
    }
    return m;
  }, [docs]);
  const kpiWindowIncomplete = truncated && oldestMs != null && oldestMs > nowMs - KPI_WINDOW_DAYS * DAY_MS;

  if (!ready) return <p className="text-ink-2 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  const base = getBasePath();
  const refNote = reference.master?.ageLabel || '';
  const lenses = LENSES.filter((l) => canOpenPath(me.role, l.path));

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── شريط صدق البتر (لا يظهر إلا عند بلوغ حدّ العرض) ── */}
      {truncated && (
        <div
          className={`rounded-xl border p-3 text-xs leading-relaxed flex items-start gap-2 ${
            kpiWindowIncomplete ? 'border-brand-red/40 bg-brand-red/5 text-brand-red' : 'border-line bg-chip text-ink-2'
          }`}
        >
          <Icon name="alertTriangle" size={14} className="mt-0.5 shrink-0" />
          <span>
            {kpiWindowIncomplete
              ? `المؤشرات محسوبة على جزءٍ من آخر ${KPI_WINDOW_DAYS} يومًا فقط — بلغت اللوحة حدّ عرض ${num(DOC_CAP)} مستند، فقد تكون الأرقام ناقصة. للدقّة الكاملة عند هذا الحجم يلزم تجميع خادميّ (Cloud Function).`
              : `اللقطة والعدّادات تعرض أحدث ${num(DOC_CAP)} مستند وقد لا تعكس الإجمالي التاريخي. المؤشرات محسوبة على آخر ${KPI_WINDOW_DAYS} يومًا (نافذتها مكتملة).`}
          </span>
        </div>
      )}

      {/* ═══ الطبقة ١ — تدخّل الآن ═══ */}
      <Layer
        icon="alertTriangle"
        title="تدخّل الآن"
        hint="ما لا يُؤجَّل — ولكلّ صفٍّ إجراؤه ومسؤوله ومساره"
      >
        <ExceptionsBox
          detections={exceptions}
          registry={registry}
          nowMs={nowMs}
          onRegister={registerDetected}
          laborTasks={laborTasks}
          busy={registering}
        />
      </Layer>

      {/* ═══ الطبقة ٢ — إجراءات سريعة ═══ */}
      <Layer
        icon="gauge"
        title="إجراءات سريعة"
        hint={`الطبيعيّ مختصرًا · وأبوابُ العمل · المؤشّرات لآخر ${KPI_WINDOW_DAYS} يومًا`}
      >
        <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-line sm:divide-x sm:divide-x-reverse">
            <Kpi label="تنفيذ الطلبات" hint="Fill Rate · هدف ≥95%" value={pct(kpis.fillRate)} color={tone(kpis.fillRate, 0.95, 0.85)} />
            <Kpi label="زمن دورة الطلب" hint="من الأمر للتسليم" value={days(kpis.cycleTimeDays)} color={tone(kpis.cycleTimeDays == null ? null : 1 / (kpis.cycleTimeDays || 1), 0.5, 0.2)} />
            <Kpi label="دقّة المخزون" hint="من محاضر الجرد · ≥98%" value={pct(kpis.inventoryAccuracy)} color={tone(kpis.inventoryAccuracy, 0.98, 0.9)} />
            <Kpi label="دقّة التسليم" hint="استلام النقل ÷ الشحن" value={pct(kpis.deliveryAccuracy)} color={tone(kpis.deliveryAccuracy, 0.98, 0.9)} />
          </div>

          {/* ★ المرجعيّ يُعلَن تاريخه — لا يُعرض المستورَد أمسِ كأنّه لحظيّ. */}
          <ReferenceBar reference={reference} base={base} />

          <div className="flex flex-wrap gap-2 p-3">
            <Quick href={`${base}/dashboard/documents`} icon="clipboardList" label="صندوق الوارد" />
            <Quick href={`${base}/dashboard/labor-operations`} icon="users" label="لوحة المناولة" />
            <Quick href={`${base}/dashboard/order-control`} icon="shoppingCart" label="مراقبة الطلبات" />
            <Quick href={`${base}/dashboard/stock-ledger`} icon="history" label="دفتر الحركات" />
            <Quick href={`${base}/dashboard/odoo-sync`} icon="arrowLeftRight" label="جسر أودو" />
          </div>
        </div>
      </Layer>

      {/* ═══ الطبقة ٣ — الفهرس الكامل ═══ */}
      <Layer
        icon="layers"
        title="الفهرس الكامل"
        hint="كلّ العدّادات بأصولها — واللحظيّ والمرجعيّ لا يُخلطان في رقم"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Panel icon="shoppingCart" title="المبيعات" href={`${base}/dashboard/order-control`}>
            <Row path="sales.orders" label="أوامر البيع" value={num(snap.sales.orders)} />
            <Row path="sales.pending" label="معلّقة" value={num(snap.sales.pending)} tone="#f59e0b" />
            <Row path="sales.noStock" label="بلا رصيد" value={num(snap.sales.noStock)} tone="#ef4444" />
            <Row path="sales.pendingValue" label="قيمة المعلّق" value={money(snap.sales.pendingValue)} />
          </Panel>

          <Panel icon="warehouse" title="المخازن" href={`${base}/dashboard/documents`}>
            <Row path="warehouse.picking" label="قوائم سحب مفتوحة" value={num(snap.warehouse.picking)} />
            <Row path="warehouse.putaway" label="أوامر تخزين" value={num(snap.warehouse.putaway)} />
            <Row path="warehouse.transfers" label="عمليات نقل" value={num(snap.warehouse.transfers)} />
            <Row path="warehouse.returns" label="مرتجعات" value={num(snap.warehouse.returns)} />
            <Row path="warehouse.adjustments" label="تصحيحات/تسويات" value={num(snap.warehouse.adjustments)} />
          </Panel>

          <Panel icon="truck" title="النقل" href={`${base}/dashboard/transfers`}>
            <Row path="transit.inTransit" label="في الطريق" value={num(snap.transit.inTransit)} tone="#f59e0b" />
            <Row path="transit.variances" label="فروق غير مسوّاة" value={num(snap.transit.variances)} tone="#ef4444" />
            <Row path="transit.value" label="قيمة عالقة بالطريق" value={money(snap.transit.value)} />
          </Panel>

          <Panel icon="tag" title="المخزون" href={`${base}/dashboard/stock-ledger`}>
            <Row path="inventory.shortItems" label="أصناف عاجزة" value={num(snap.inventory.shortItems)} tone="#ef4444" />
            <Row path="inventory.stuck" label="عالق في مواقع النظام" value={num(snap.inventory.stuck)} tone="#f59e0b" />
            <Row path="inventory.lostValue" label="قيمة المبيعات المفقودة" value={money(snap.inventory.lostValue)} />
            {/* ★ الفصل البصريّ: ما دونه يقارن أرصدتنا بحدٍّ مستورَد لا لحظيّ. */}
            <Divider label="مقارنةً بحدود أودو المرجعيّة" note={refNote} warn={reference.warn} />
            <Row path="inventory.belowMin" label="تحت الحدّ الأدنى" value={num(snap.inventory.belowMin)} tone="#f59e0b" refNote={refNote} refWarn={reference.warn} />
            <Row path="inventory.toBuy" label="مطلوب شراؤها (نفدت)" value={num(snap.inventory.toBuy)} tone="#ef4444" refNote={refNote} refWarn={reference.warn} />
          </Panel>

          <Panel icon="dollarSign" title="المالية" href={`${base}/dashboard/documents`}>
            <Row path="finance.invoices" label="فواتير العملاء" value={num(snap.finance.invoices)} />
            <Row path="finance.creditNotes" label="إشعارات دائنة" value={num(snap.finance.creditNotes)} />
            <Row path="finance.awaitingClose" label="بانتظار الإقفال" value={num(snap.finance.awaitingClose)} tone="#f59e0b" />
          </Panel>
        </div>
      </Layer>

      {/* ═══ الطبقة ٤ — مناظير متخصّصة ═══ */}
      {lenses.length > 0 && (
        <Layer
          icon="search"
          title="مناظير متخصّصة"
          hint="هذه اللوحة تعرض الحال كلّه — وهذه نوافذُ تُقرّب كلٌّ منها زاويةً بتفصيلها"
        >
          <div className="flex flex-wrap gap-2">
            {lenses.map((l) => (
              <Quick key={l.path} href={`${base}${l.path}`} icon={l.icon} label={l.label} />
            ))}
          </div>
        </Layer>
      )}

      <p className="text-[11px] text-muted text-center">
        لوحةٌ حيّة تُحدَّث لحظيًّا من دفتر الحركات والمستندات والأرصدة — كل رقمٍ فيها مردودٌ إلى مستنده،
        والمرجعيّ المستورَد معلَنُ التاريخ.
      </p>
    </div>
  );
}

/** طبقةٌ من الثلاث — عنوانها يقول ما تُجيب عنه، لا زينةً فوق البطاقات. */
function Layer({ icon, title, hint, children }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Icon name={icon} size={15} className="text-ink-2" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <span className="text-[11px] text-muted">{hint}</span>
      </div>
      {children}
    </section>
  );
}

/**
 * شريط المرجعيّ — «آخر سحبٍ من أودو» بنصّه لا بختمٍ خامّ.
 * والأحمر للتحذير وحده: لا لونَ إنذارٍ ما دام السحب حديثًا أو يتقادم.
 */
function ReferenceBar({ reference, base }) {
  const warn = reference.warn;
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 text-[11px]">
      <Icon name="arrowLeftRight" size={13} className={warn ? 'text-brand-red' : 'text-muted'} />
      <span className="text-ink-2 font-bold">المرجعيّ المستورَد من أودو:</span>
      {reference.scopes.map((s) => (
        <span
          key={s.id}
          title={s.error ? `آخر خطأ: ${s.error}` : ORIGIN.reference.hint}
          className={`px-1.5 py-0.5 rounded border ${
            s.warn ? 'border-brand-red/40 text-brand-red' : 'border-line text-muted'
          }`}
        >
          {s.label}: {s.ageLabel}
        </span>
      ))}
      <div className="flex-1" />
      <span className={warn ? 'text-brand-red' : 'text-muted'}>{reference.level.label}</span>
      <a href={`${base}/dashboard/odoo-sync`} className="text-accent font-bold hover:underline">
        اسحب الآن ↗
      </a>
    </div>
  );
}

/** بابُ عملٍ واحد — الطبقة الثانية تنقل إلى الفعل لا تصف حالة. */
function Quick({ href, icon, label }) {
  return (
    <a
      href={href}
      className="flex items-center gap-1.5 text-[11px] font-bold text-ink-2 bg-chip border border-line rounded-lg px-2.5 py-1.5 hover:text-accent"
    >
      <Icon name={icon} size={13} />
      {label}
    </a>
  );
}

function Kpi({ label, hint, value, color }) {
  return (
    <div className="p-3">
      <div className="text-2xl font-black leading-tight" style={{ color }}>{value}</div>
      <div className="text-xs font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function Panel({ icon, title, href, children }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <Icon name={icon} size={14} className="text-ink-2" />
          {title}
        </h3>
        <a href={href} className="text-[11px] text-accent hover:underline">فتح ↗</a>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** فاصلٌ يُسمّي ما بعده — كي لا يُقرأ المرجعيّ في عمود اللحظيّ. */
function Divider({ label, note, warn }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-1 border-t border-line text-[10px]">
      <span className="text-ink-2 font-bold">{label}</span>
      {note && <span className={warn ? 'text-brand-red' : 'text-muted'}>· {note}</span>}
    </div>
  );
}

/**
 * صفّ عدّاد. أصلُه من `originOf` لا من حكمٍ هنا — فالمرجعيّ يحمل نصّ قِدَمه
 * بجانب رقمه، واللحظيّ لا يحمل زينةً لا تعني شيئًا.
 */
function Row({ path, label, value, tone: color, refNote, refWarn }) {
  const origin = originOf(path);
  const declared = origin && origin.id !== ORIGIN.live.id;
  return (
    <div className="flex items-center justify-between text-xs border-t border-line py-1.5 first:border-t-0">
      <span className="text-muted flex items-center gap-1.5">
        {label}
        {declared && (
          <span
            title={`${origin.hint}${refNote ? ` — آخر سحب: ${refNote}` : ''}`}
            className={`text-[9px] px-1 py-px rounded border ${
              refWarn ? 'border-brand-red/40 text-brand-red' : 'border-line text-muted'
            }`}
          >
            {origin.label}
            {refNote ? ` · ${refNote}` : ''}
          </span>
        )}
      </span>
      <span className="font-bold text-ink" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function Notice({ children }) {
  return <div className="rounded-lg bg-brand-red/5 border border-brand-red/30 text-brand-red text-sm p-4">{children}</div>;
}
