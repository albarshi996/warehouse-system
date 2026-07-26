import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { subscribeItems } from '../../../services/itemService.js';
import { computeKpis, operationsSnapshot, operationExceptions } from '../../../services/ledger/operationsDashboard.js';
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

/**
 * لوحة القيادة التشغيلية — الشاشة الواحدة التي تُتوّج الدورة كلها.
 *
 * تعرض بالترتيب: المؤشرات الأربعة (صحّة المنظومة) · لوحة الاستثناءات (ما يحتاج
 * تدخّلًا اليوم، أوّلًا لأنها الأهمّ) · ثم اللقطة الموزَّعة على أقسام العمل.
 * كل الحساب في `operationsDashboard.js` الخالص المُختبَر؛ هذا عرضٌ حيّ له.
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

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  const base = getBasePath();

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── شريط صدق البتر (لا يظهر إلا عند بلوغ حدّ العرض) ── */}
      {truncated && (
        <div
          className={`rounded-xl border p-3 text-xs leading-relaxed ${
            kpiWindowIncomplete
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          {kpiWindowIncomplete
            ? `⚠️ المؤشرات محسوبة على جزءٍ من آخر ${KPI_WINDOW_DAYS} يومًا فقط — بلغت اللوحة حدّ عرض ${num(DOC_CAP)} مستند، فقد تكون الأرقام ناقصة. للدقّة الكاملة عند هذا الحجم يلزم تجميع خادميّ (Cloud Function).`
            : `ℹ️ اللقطة والعدّادات تعرض أحدث ${num(DOC_CAP)} مستند وقد لا تعكس الإجمالي التاريخي. المؤشرات محسوبة على آخر ${KPI_WINDOW_DAYS} يومًا (نافذتها مكتملة).`}
        </div>
      )}

      {/* ── المؤشرات الأربعة ── */}
      <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-white">المؤشرات الأربعة</h2>
        <span className="text-[11px] text-gray-500">لآخر {KPI_WINDOW_DAYS} يومًا</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="نسبة تنفيذ الطلبات" hint="Fill Rate · هدف ≥95%" value={pct(kpis.fillRate)} color={tone(kpis.fillRate, 0.95, 0.85)} />
        <Kpi label="زمن دورة الطلب" hint="Order Cycle · من الأمر للتسليم" value={days(kpis.cycleTimeDays)} color={tone(kpis.cycleTimeDays == null ? null : 1 / (kpis.cycleTimeDays || 1), 0.5, 0.2)} />
        <Kpi label="دقّة المخزون" hint="من محاضر الجرد · هدف ≥98%" value={pct(kpis.inventoryAccuracy)} color={tone(kpis.inventoryAccuracy, 0.98, 0.9)} />
        <Kpi label="دقّة التسليم" hint="استلام النقل ÷ الشحن" value={pct(kpis.deliveryAccuracy)} color={tone(kpis.deliveryAccuracy, 0.98, 0.9)} />
      </div>
      </div>

      {/* ── لوحة الاستثناءات ── */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🚨</span>
          <h2 className="text-sm font-bold text-white">لوحة الاستثناءات — ما يحتاج تدخّلًا</h2>
          <span className="text-xs text-gray-500">({num(exceptions.length)})</span>
        </div>
        {exceptions.length === 0 ? (
          <p className="text-emerald-300 text-sm py-6 text-center font-bold">✓ لا استثناءات — كل العمليات ضمن الطبيعي.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {exceptions.slice(0, 16).map((e, i) => {
              const sev = e.severity === 'high' ? '#ef4444' : e.severity === 'med' ? '#f59e0b' : '#6b7280';
              return (
                <a
                  key={i}
                  href={`${base}${e.href}`}
                  className="flex items-start gap-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/20 p-3 transition-colors"
                >
                  <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: sev }} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{e.title}</div>
                    <div className="text-[11px] text-gray-400 leading-snug">{e.detail}</div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ── اللقطة الموزَّعة ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Panel title="🛒 المبيعات" href={`${base}/dashboard/order-control`}>
          <Row label="أوامر البيع" value={num(snap.sales.orders)} />
          <Row label="معلّقة" value={num(snap.sales.pending)} tone="#f59e0b" />
          <Row label="بلا رصيد" value={num(snap.sales.noStock)} tone="#ef4444" />
          <Row label="قيمة المعلّق" value={money(snap.sales.pendingValue)} />
        </Panel>

        <Panel title="📦 المخازن" href={`${base}/dashboard/documents`}>
          <Row label="قوائم سحب مفتوحة" value={num(snap.warehouse.picking)} />
          <Row label="أوامر تخزين" value={num(snap.warehouse.putaway)} />
          <Row label="عمليات نقل" value={num(snap.warehouse.transfers)} />
          <Row label="مرتجعات" value={num(snap.warehouse.returns)} />
          <Row label="تصحيحات/تسويات" value={num(snap.warehouse.adjustments)} />
        </Panel>

        <Panel title="🚚 النقل" href={`${base}/dashboard/transfers`}>
          <Row label="في الطريق" value={num(snap.transit.inTransit)} tone="#f59e0b" />
          <Row label="فروق غير مسوّاة" value={num(snap.transit.variances)} tone="#ef4444" />
          <Row label="قيمة عالقة بالطريق" value={money(snap.transit.value)} />
        </Panel>

        <Panel title="🏷️ المخزون" href={`${base}/dashboard/stock-ledger`}>
          <Row label="أصناف عاجزة" value={num(snap.inventory.shortItems)} tone="#ef4444" />
          <Row label="تحت الحدّ الأدنى" value={num(snap.inventory.belowMin)} tone="#f59e0b" />
          <Row label="مطلوب شراؤها (نفدت)" value={num(snap.inventory.toBuy)} tone="#ef4444" />
          <Row label="عالق في مواقع النظام" value={num(snap.inventory.stuck)} tone="#f59e0b" />
          <Row label="قيمة المبيعات المفقودة" value={money(snap.inventory.lostValue)} />
        </Panel>

        <Panel title="💵 المالية" href={`${base}/dashboard/documents`}>
          <Row label="فواتير العملاء" value={num(snap.finance.invoices)} />
          <Row label="إشعارات دائنة" value={num(snap.finance.creditNotes)} />
          <Row label="بانتظار الإقفال" value={num(snap.finance.awaitingClose)} tone="#f59e0b" />
        </Panel>
      </div>

      <p className="text-[11px] text-gray-500 text-center">
        لوحةٌ حيّة تُحدَّث لحظيًّا من دفتر الحركات والمستندات والأرصدة — كل رقمٍ فيها مردودٌ إلى مستنده.
      </p>
    </div>
  );
}

function Kpi({ label, hint, value, color }) {
  return (
    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="text-sm font-bold text-gray-100 mt-1">{label}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>
    </div>
  );
}

function Panel({ title, href, children }) {
  return (
    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <a href={href} className="text-[11px] text-brand-gold hover:underline">فتح ↗</a>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between text-xs border-t border-white/5 py-1.5 first:border-t-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold" style={{ color: tone || '#e5e7eb' }}>{value}</span>
    </div>
  );
}

function Notice({ children }) {
  return <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-4">{children}</div>;
}
