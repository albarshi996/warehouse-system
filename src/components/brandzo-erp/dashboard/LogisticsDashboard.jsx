import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribeItems } from '../../../services/items/itemService.js';
import { listenMovesSince } from '../../../services/ledger/ledgerService.js';
import { listenOperations } from '../../../services/stock/operationsService.js';
import { subscribePartners } from '../../../services/partners/partnerService.js';
import { listenDocumentsSince } from '../../../services/documents/documentsService.js';
import { listenBalances, listenBalancesDelta } from '../../../services/balances/balancesService.js';
import { productsFullReads } from '../../../services/items/catalogDelta.js';
import { countCollection } from '../../../services/dashboard/countsService.js';
import { OPENING_DAY, OPENING_MS } from '../../../services/documents/actualWork.js';
import {
  logisticsSummary,
  movesReadPlan,
  MOVES_CAP,
  ODOO_FEED_CAP,
} from '../../../services/dashboard/logisticsModel.js';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int, num, delta } from '../../odoo/format.js';
import Icon from '../../ui/Icon.jsx';

/**
 * LogisticsDashboard — لوحة اللوجستيات التنفيذيّة (المرحلة ٤ · مكوّنات أودو).
 *
 * قمرةٌ جامعةٌ للمدير تعرض حالة المخزون والعمليّات والسلاسل في نظرةٍ واحدة،
 * مبنيّةٌ فوق `logisticsModel` الخالص المُختبَر: تشترك حيًّا في الأصناف والحركات
 * والعمليّات والشركاء والسلاسل، ثمّ تعرض بمكوّنات أودو (ListView/Badge) داخل
 * حاوية `.o_theme` الفاتحة. حوكمة الواجهة: بلا إيموجي · الأحمر للتحذير فقط.
 * الأيقونات من مجموعة البوابة SVG (Icon) لأنّ FontAwesome غير مُحمَّل هنا.
 *
 * ═══ ‹ODOO-ORD› العملُ الفعليّ لا التجارب — وقراءةٌ بقدر ما يُعرض ═══
 * كانت تقرأ ≈2,700 مستندٍ لكلّ فتحة: 2,500 حركةٍ لتعرض عشرًا، والرحلاتِ والصيانةَ والعُهدَ كاملةً لتعرض `.length`.
 * - الحركاتُ **منذ الافتتاح** وحدها (`listenMovesSince`)، وكلُّ صفٍّ بمستنده ويوم واقعته — **وعشرٌ لا 2,500**
 *   ما دام الراكدُ لا يُحكم به (`movesReadPlan`): حجمُ أودو اليوميّ يبلغ السقفَ في أيّام، فـ«منذ الافتتاح» وحدَه لا يُخفّف.
 * - مستنداتُ أودو (المُرحَّلةُ وأمرا البيع والشراء) بسقف 500 — مؤشّرُ الأوامر المفتوحة وجدولُ آخرها.
 * - الرحلاتُ والصيانةُ والعُهد **عدٌّ** (`countCollection` — قراءةٌ لكلّ ألف) منذ الافتتاح، لا اشتراك.
 * - الموردون والعملاء باقون اشتراكًا: صغيران حقيقيّان، و«غيرُ المؤرشف» لا يُعَدّ من الخادم
 *   (`archived` غائبٌ عن أكثر السجلّات، و`!=` يُسقط الغائب) — فالعدُّ كان سيكذب.
 */

import { MANAGER_ROLES } from '../../../services/auth/roles.js';

/** المجموعاتُ التي تُعَدّ ولا تُقرأ — وحقلُ طابعها `createdAt` (serverTimestamp) في خدماتها الثلاث. */
const COUNTED = [
  ['trips', 'trips'],
  ['workOrders', 'work_orders'],
  ['custodies', 'custodies'],
];

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

/* تحويل طابع Firestore/عددٍ إلى مِلّي ثمّ إلى تاريخٍ لاتينيّ */
function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}
const DATE_FMT = new Intl.DateTimeFormat('ar-LY-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
function fmtDate(ts) {
  const ms = tsToMs(ts);
  return ms ? DATE_FMT.format(new Date(ms)) : '—';
}
/* يومٌ (`YYYY-MM-DD`) بالصيغة نفسها — بتوقيت UTC، فاليومُ لا ينزلق في منطقةٍ زمنيّةٍ أخرى.
   وفي النصّ العربيّ أيضًا: «2026-10-20» تُقلب شَرطاتُه المحايدةُ فتُقرأ «20-10-2026». */
const DAY_FMT = new Intl.DateTimeFormat('ar-LY-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
function fmtDay(day) {
  const ms = Date.parse(`${String(day || '').slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ms) ? DAY_FMT.format(new Date(ms)) : '—';
}
const footnote = { padding: '8px 14px', borderTop: '1px solid var(--o-border-color)', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' };

function Kpi({ icon, value, label, sub, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      <span className="o_kpi_icon"><Icon name={icon} size={20} /></span>
      <span className="o_kpi_value">{value}</span>
      <span className="o_kpi_label">{label}</span>
      {sub ? <span className="o_kpi_sub">{sub}</span> : null}
    </div>
  );
}

function DataCard({ title, count, isEmpty, emptyText, children }) {
  return (
    <div className="o_dashboard_card">
      <div className="o_dashboard_card_head">
        <span>{title}</span>
        {count != null ? <span className="o_count">{int(count)}</span> : null}
      </div>
      {isEmpty ? <div className="o_dashboard_empty">{emptyText || 'لا يوجد'}</div> : children}
    </div>
  );
}

const QUICK_LINKS = [
  { href: '/dashboard/odoo-reports', icon: 'fileText', label: 'تقارير أودو' },
  { href: '/dashboard/inventory-analytics', icon: 'barChart3', label: 'تحليل المخزون' },
  { href: '/dashboard/operations', icon: 'clipboardList', label: 'مراقبة العمليّات' },
  { href: '/dashboard/stock-ledger', icon: 'bookOpen', label: 'دفتر الحركات' },
  { href: '/dashboard/supply-chain', icon: 'truck', label: 'سلاسل الإمداد' },
  { href: '/dashboard/suppliers', icon: 'handshake', label: 'الموردون' },
  { href: '/dashboard/stock-operations', icon: 'tag', label: 'الجرد الذكي' },
];

export default function LogisticsDashboard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [operations, setOperations] = useState([]);
  const [odooDocs, setOdooDocs] = useState([]);
  // ‹ODOO-ORD› الأرصدةُ مصدرُ القيمة (تكلفةُ أودو في سطورها). null حتّى تصل — فلا تُعرض قيمةُ الماستر الفارغة صفرًا.
  const [balances, setBalances] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  // أعدادٌ من الخادم — null ما لم تصل (أو تعذّرت)، فيُعرض «—» لا صفرٌ لم يُعَدّ.
  const [counts, setCounts] = useState({ trips: null, workOrders: null, custodies: null });
  const nowMs = useMemo(() => Date.now(), [items, moves, operations, odooDocs]);
  // كم حركةً تُقرأ — يُحسم مرّةً عند الفتح.
  const movesPlan = useMemo(() => movesReadPlan(Date.now()), []);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me || !MANAGER_ROLES.includes(me.role)) return undefined;
    // نفسُ مفتاح الإطفاء الذي تقرؤه الرئيسيّةُ والأصناف: الفروقُ افتراضًا والكاملُ عند الطلب — لا آليّةَ ثانية.
    let fullReads = false;
    try {
      fullReads = productsFullReads(typeof localStorage === 'undefined' ? null : localStorage);
    } catch {
      fullReads = false;
    }
    const subs = [
      subscribeItems(setItems, () => {}, { includeArchived: false }),
      fullReads
        ? listenBalances((rows) => setBalances(rows || []), () => setBalances(null))
        : listenBalancesDelta((rows) => setBalances(rows || []), () => setBalances(null)),
      listenMovesSince((rows) => setMoves(rows || []), { max: movesPlan.max }),
      listenOperations((rows) => setOperations(rows || [])),
      // ★★ منذ الافتتاح والأحدثُ أوّلًا: بلغ السقفَ ⟵ سقط الأقدم لا عيّنةٌ عشوائيّة (استعلامُ `in` بالنوع بلا ترتيب).
      //    والنموذجُ يُبقي مستندات أودو وحدها، ويحسب بلوغَ السقف من العدد الخام.
      listenDocumentsSince((rows) => setOdooDocs(rows || []), { max: ODOO_FEED_CAP }),
      subscribePartners('supplier', (rows) => setSuppliers(rows || []), () => {}, {}),
      subscribePartners('customer', (rows) => setCustomers(rows || []), () => {}, {}),
    ];
    // العدُّ لقطةٌ عند الفتح لا قناةٌ حيّة؛ وفشلُه يُبقي «—».
    let alive = true;
    for (const [key, name] of COUNTED) {
      countCollection(name, { sinceField: 'createdAt', sinceMs: OPENING_MS })
        .then((n) => { if (alive) setCounts((c) => ({ ...c, [key]: n })); })
        .catch(() => {});
    }
    return () => {
      alive = false;
      subs.forEach((u) => { if (typeof u === 'function') u(); });
    };
  }, [me, movesPlan]);

  const summary = useMemo(
    () => logisticsSummary(
      { items, moves, operations, odooDocs, suppliers, customers, counts, balances },
      nowMs,
      { movesCap: movesPlan.movesCap, odooCap: ODOO_FEED_CAP },
    ),
    [items, moves, operations, odooDocs, suppliers, customers, counts, balances, nowMs, movesPlan],
  );

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl"><div className="o_dashboard"><div className="o_dashboard_empty">جارٍ التحميل…</div></div></div>
    );
  }
  if (!me || !MANAGER_ROLES.includes(me.role)) {
    return (
      <div className="o_theme" dir="rtl"><div className="o_dashboard"><div className="o_dashboard_empty">هذه اللوحة للمديرين فقط.</div></div></div>
    );
  }

  const k = summary.kpis;
  /* عدٌّ لم يصل يُعرض «—» لا صفرًا. */
  const dash = (v) => (v == null ? '—' : int(v));
  const sinceOpening = `منذ ${fmtDay(OPENING_DAY)}`;
  // الراكد: لا حكمَ قبل أن يغطّي تاريخُ الحركات نافذتَه — والسببُ يُقال بدل صفرٍ يُوهم.
  const stagnantNote = k.stagnantReady
    ? ''
    : k.stagnantReason === 'truncated'
      ? `الحركاتُ المقروءة (آخر ${int(MOVES_CAP)}) تغطّي ${int(k.stagnantHistoryDays)} يومًا من ${int(k.stagnantDays)} — لا يُحكم بالركود على تاريخٍ ناقص.`
      : `تحليلُ الراكد يحتاج ${int(k.stagnantDays)} يومًا من العمل الفعليّ (مضى ${int(k.stagnantHistoryDays)}) — يكتمل في ${fmtDay(k.stagnantReadyDay)}.`;

  const reorderCols = [
    { key: 'name', label: 'الصنف' },
    { key: 'balance', label: 'الرصيد', numeric: true },
    { key: 'min', label: 'الحدّ', numeric: true },
    { key: 'short', label: 'النقص', numeric: true },
  ];
  const reorderRows = summary.reorderTop.map((r) => ({
    id: r.key,
    decoration: 'danger',
    cells: {
      name: <span className="decoration-bf">{r.nameAr || r.sku}</span>,
      balance: int(r.balance),
      min: int(r.minStock),
      short: <span className="decoration-danger">{delta(-r.shortfall)}</span>,
    },
  }));

  const stagnantCols = [
    { key: 'name', label: 'الصنف' },
    { key: 'balance', label: 'الرصيد', numeric: true },
    { key: 'value', label: 'القيمة', numeric: true },
    { key: 'idle', label: 'أيام الركود', numeric: true },
  ];
  const stagnantRows = summary.stagnantTop.map((r) => ({
    id: r.key,
    cells: {
      name: <span className="decoration-bf">{r.nameAr || r.sku}</span>,
      balance: int(r.balance),
      value: int(r.value),
      idle: r.daysIdle == null ? 'لم يُصرف' : int(r.daysIdle),
    },
  }));

  const opsCols = [
    { key: 'status', label: 'الحالة' },
    { key: 'date', label: 'التاريخ' },
    { key: 'items', label: 'أصناف', numeric: true },
    { key: 'scanned', label: 'مَمسوح', numeric: true },
  ];
  const odooCols = [
    { key: 'type', label: 'النوع' },
    { key: 'ref', label: 'المرجع في أودو' },
    { key: 'party', label: 'الطرف' },
    { key: 'wh', label: 'المستودع' },
    { key: 'day', label: 'اليوم' },
    { key: 'qty', label: 'الكمّيّة', numeric: true },
  ];
  const odooRows = summary.recentOdooDocs.map((d) => ({
    id: d.id,
    cells: {
      // الأمرُ جارٍ والمُرحَّلُ منجَز — والشارةُ تفرّق بينهما بلا قراءة.
      type: <Badge variant={d.isOrder ? 'progress' : 'done'}>{d.label}</Badge>,
      ref: <span className="decoration-bf" dir="ltr">{d.sourceRef || d.number || '—'}</span>,
      party: d.party || '—',
      wh: d.warehouse || '—',
      day: fmtDay(d.day),
      qty: num(d.qty),
    },
  }));

  const opsRows = summary.recentOperations.map((o) => ({
    id: o.id,
    cells: {
      status: o.status === 'open' ? <Badge variant="progress">مفتوحة</Badge> : <Badge variant="done">مقفلة</Badge>,
      date: fmtDate(o.createdAt),
      items: int(o.itemCount || 0),
      scanned: int(o.scannedCount || 0),
    },
  }));

  const moveCols = [
    { key: 'name', label: 'الصنف' },
    { key: 'doc', label: 'المستند' },
    { key: 'from', label: 'من' },
    { key: 'to', label: 'إلى' },
    { key: 'qty', label: 'الكمية', numeric: true },
    { key: 'date', label: 'اليوم' },
  ];
  // اليومُ يومُ الواقعة (الإنجازُ في أودو) لا لحظةُ الترحيل — فتسليمُ الأمس يُقرأ أمسًا ولو رُحّل اليوم.
  const moveRows = summary.recentMoves.map((m, i) => ({
    id: m.id || `m${i}`,
    cells: {
      name: <span className="decoration-bf">{m.nameAr || m.sku || m.barcode || '—'}</span>,
      doc: m.docLabel || '—',
      from: m.from || '—',
      to: m.to || '—',
      qty: int(m.qty || 0),
      date: fmtDay(m.day),
    },
  }));

  const maxCat = summary.categories[0]?.value || 1;

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_dashboard">
        {/* المؤشّرات التنفيذيّة */}
        <div className="o_dashboard_kpis">
          <Kpi
            icon="dollarSign"
            value={int(k.totalValue)}
            label="قيمة المخزون (د.ل)"
            sub={k.valueSource === 'balances'
              ? `بتكلفة أودو · في الطريق ${int(k.transitValue)}${k.unpricedLines ? ` · ${int(k.unpricedLines)} سطرًا بلا تكلفة` : ''}`
              : (k.itemsUnpriced ? `${int(k.itemsUnpriced)} صنف بلا سعر` : null)}
          />
          <Kpi icon="package" value={int(k.itemsTotal)} label="عدد الأصناف" />
          <Kpi icon="alertTriangle" value={int(k.reorderCount)} label="تحت حدّ الطلب" alert={k.reorderCount > 0} sub={k.reorderWithoutMin ? `${int(k.reorderWithoutMin)} بلا حدّ` : null} />
          <Kpi
            icon="archive"
            value={dash(k.stagnantValue)}
            label="قيمة الراكد (د.ل)"
            alert={k.stagnantValue > 0}
            sub={k.stagnantReady
              ? (k.stagnantShare != null ? `${int(k.stagnantShare * 100)}٪ من المخزون` : null)
              : (k.stagnantReadyDay ? `يكتمل في ${fmtDay(k.stagnantReadyDay)}` : 'تاريخُ الحركات المقروء ناقص')}
          />
          <Kpi icon="shoppingCart" value={int(k.odooOpenOrders)} label="أوامر أودو مفتوحة" sub={`${int(k.odooOpenSales)} بيع · ${int(k.odooOpenPurchases)} شراء`} />
          <Kpi icon="clipboardList" value={int(k.openOperations)} label="جلسات جرد مفتوحة" sub={`${int(k.operationsTotal)} ${sinceOpening}`} />
          <Kpi icon="truck" value={dash(k.tripsTotal)} label="الرحلات" sub={sinceOpening} />
          <Kpi icon="wrench" value={dash(k.workOrdersTotal)} label="أوامر الصيانة" sub={`${dash(k.custodiesTotal)} عهدة · ${sinceOpening}`} />
          <Kpi icon="handshake" value={int(k.suppliersCount)} label="الموردون" sub={`${int(k.customersCount)} عميل`} />
        </div>

        {/* تدخّل الآن */}
        <div className="o_dashboard_section">
          <div className="o_dashboard_section_title"><Icon name="alertTriangle" size={16} /> تدخّل الآن</div>
          <div className="o_dashboard_grid2">
            <DataCard title="أصناف تحت حدّ الطلب" count={k.reorderCount} isEmpty={reorderRows.length === 0} emptyText="لا صنف تحت حدّه — جيّد.">
              <ListView selectable={false} columns={reorderCols} rows={reorderRows} />
            </DataCard>
            <DataCard
              title={`مخزون راكد (${int(k.stagnantDays)} يومًا)`}
              count={k.stagnantReady ? k.stagnantCount : null}
              isEmpty={!k.stagnantReady || stagnantRows.length === 0}
              emptyText={stagnantNote || 'لا مخزون راكد.'}
            >
              <ListView selectable={false} columns={stagnantCols} rows={stagnantRows} />
            </DataCard>
          </div>
        </div>

        {/* النشاط الأخير */}
        <div className="o_dashboard_section">
          <div className="o_dashboard_section_title"><Icon name="activity" size={16} /> النشاط الأخير</div>
          {/* العملُ الفعليُّ أوّلًا: ما أُنجز في أودو ووصل البوّابة */}
          <div style={{ marginBottom: '16px' }}>
            <DataCard title="آخر مستندات أودو" isEmpty={odooRows.length === 0} emptyText="لا مستندات من أودو بعد.">
              <ListView selectable={false} columns={odooCols} rows={odooRows} />
              {k.odooDocsCapped ? (
                <div style={footnote}>
                  بلغت القراءةُ سقفَها ({int(ODOO_FEED_CAP)} مستند) — قد يغيب عن الجدول والمؤشّر جديد؛ القائمةُ الكاملة في «تقارير أودو».
                </div>
              ) : null}
            </DataCard>
          </div>
          <div className="o_dashboard_grid2">
            <DataCard title="آخر حركات المخزون" isEmpty={moveRows.length === 0} emptyText={`لا حركات ${sinceOpening}.`}>
              <ListView selectable={false} columns={moveCols} rows={moveRows} />
            </DataCard>
            <DataCard
              title="آخر جلسات الجرد"
              isEmpty={opsRows.length === 0}
              emptyText={`لا جلسات جرد ${sinceOpening}.${k.preOpeningOperations ? ' وجلساتُ ما قبل الافتتاح تجاربُ لا تُعرض.' : ''}`}
            >
              <ListView selectable={false} columns={opsCols} rows={opsRows} />
            </DataCard>
          </div>
        </div>

        {/* قيمة المخزون بالفئات */}
        <div className="o_dashboard_section">
          <div className="o_dashboard_section_title"><Icon name="layers" size={16} /> قيمة المخزون بالفئات</div>
          <div className="o_dashboard_card">
            {summary.categories.length === 0 ? (
              <div className="o_dashboard_empty">لا بيانات تقييم.</div>
            ) : (
              summary.categories.map((c) => (
                <div className="o_catbar_row" key={c.category || 'بلا فئة'}>
                  <span className="o_catbar_name">{c.category || 'بلا فئة'}</span>
                  <span className="o_catbar_track"><span className="o_catbar_fill" style={{ width: `${Math.max(2, (c.value / maxCat) * 100)}%` }} /></span>
                  <span className="o_catbar_val">{int(c.value)} د.ل</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* روابط سريعة */}
        <div className="o_dashboard_section">
          <div className="o_dashboard_section_title"><Icon name="grid" size={16} /> روابط سريعة</div>
          <div className="o_dashboard_links">
            {QUICK_LINKS.map((l) => (
              <a className="o_quicklink" href={`${BASE}${l.href}`} key={l.href}>
                <Icon name={l.icon} size={16} /> {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
