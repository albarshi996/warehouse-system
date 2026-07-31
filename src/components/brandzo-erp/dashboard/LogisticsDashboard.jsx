import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribeItems } from '../../../services/itemService.js';
import { listenRecentMoves } from '../../../services/ledger/ledgerService.js';
import { listenOperations } from '../../../services/stock/operationsService.js';
import { subscribePartners } from '../../../services/partnerService.js';
import { listenTrips } from '../../../services/fleet/fleetOpsService.js';
import { listenWorkOrders } from '../../../services/maintenance/maintenanceService.js';
import { listenCustodies } from '../../../services/custody/custodyService.js';
import { logisticsSummary } from '../../../services/dashboard/logisticsModel.js';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int, delta } from '../../odoo/format.js';
import Icon from '../../ui/Icon.jsx';

/**
 * LogisticsDashboard — لوحة اللوجستيات التنفيذيّة (المرحلة ٤ · مكوّنات أودو).
 *
 * قمرةٌ جامعةٌ للمدير تعرض حالة المخزون والعمليّات والسلاسل في نظرةٍ واحدة،
 * مبنيّةٌ فوق `logisticsModel` الخالص المُختبَر: تشترك حيًّا في الأصناف والحركات
 * والعمليّات والشركاء والسلاسل، ثمّ تعرض بمكوّنات أودو (ListView/Badge) داخل
 * حاوية `.o_theme` الفاتحة. حوكمة الواجهة: بلا إيموجي · الأحمر للتحذير فقط.
 * الأيقونات من مجموعة البوابة SVG (Icon) لأنّ FontAwesome غير مُحمَّل هنا.
 */

const MANAGER_ROLES = ['admin', 'warehouse_manager'];
const MOVES_CAP = 2500;

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
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [custodies, setCustodies] = useState([]);
  const nowMs = useMemo(() => Date.now(), [items, moves, operations]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me || !MANAGER_ROLES.includes(me.role)) return undefined;
    const subs = [
      subscribeItems(setItems, () => {}, { includeArchived: false }),
      listenRecentMoves((rows) => setMoves(rows || []), MOVES_CAP),
      listenOperations((rows) => setOperations(rows || [])),
      subscribePartners('supplier', (rows) => setSuppliers(rows || []), () => {}, {}),
      subscribePartners('customer', (rows) => setCustomers(rows || []), () => {}, {}),
      listenTrips((rows) => setTrips(rows || [])),
      listenWorkOrders((rows) => setWorkOrders(rows || [])),
      listenCustodies((rows) => setCustodies(rows || [])),
    ];
    return () => subs.forEach((u) => { if (typeof u === 'function') u(); });
  }, [me]);

  const summary = useMemo(
    () => logisticsSummary({ items, moves, operations, suppliers, customers, trips, workOrders, custodies }, nowMs),
    [items, moves, operations, suppliers, customers, trips, workOrders, custodies, nowMs],
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
    { key: 'from', label: 'من' },
    { key: 'to', label: 'إلى' },
    { key: 'qty', label: 'الكمية', numeric: true },
    { key: 'date', label: 'التاريخ' },
  ];
  const moveRows = summary.recentMoves.map((m, i) => ({
    id: m.id || `m${i}`,
    cells: {
      name: <span className="decoration-bf">{m.nameAr || m.sku || m.barcode || '—'}</span>,
      from: m.from || '—',
      to: m.to || '—',
      qty: int(m.qty || 0),
      date: fmtDate(m.postedAt),
    },
  }));

  const maxCat = summary.categories[0]?.value || 1;

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_dashboard">
        {/* المؤشّرات التنفيذيّة */}
        <div className="o_dashboard_kpis">
          <Kpi icon="dollarSign" value={int(k.totalValue)} label="قيمة المخزون (د.ل)" sub={k.itemsUnpriced ? `${int(k.itemsUnpriced)} صنف بلا سعر` : null} />
          <Kpi icon="package" value={int(k.itemsTotal)} label="عدد الأصناف" />
          <Kpi icon="alertTriangle" value={int(k.reorderCount)} label="تحت حدّ الطلب" alert={k.reorderCount > 0} sub={k.reorderWithoutMin ? `${int(k.reorderWithoutMin)} بلا حدّ` : null} />
          <Kpi icon="archive" value={int(k.stagnantValue)} label="قيمة الراكد (د.ل)" alert={k.stagnantValue > 0} sub={k.stagnantShare != null ? `${int(k.stagnantShare * 100)}٪ من المخزون` : null} />
          <Kpi icon="clipboardList" value={int(k.openOperations)} label="عمليّات مفتوحة" sub={`${int(k.operationsTotal)} إجماليّ`} />
          <Kpi icon="truck" value={int(k.tripsTotal)} label="الرحلات" />
          <Kpi icon="wrench" value={int(k.workOrdersTotal)} label="أوامر الصيانة" sub={k.custodiesTotal ? `${int(k.custodiesTotal)} عهدة` : null} />
          <Kpi icon="handshake" value={int(k.suppliersCount)} label="الموردون" sub={`${int(k.customersCount)} عميل`} />
        </div>

        {/* تدخّل الآن */}
        <div className="o_dashboard_section">
          <div className="o_dashboard_section_title"><Icon name="alertTriangle" size={16} /> تدخّل الآن</div>
          <div className="o_dashboard_grid2">
            <DataCard title="أصناف تحت حدّ الطلب" count={k.reorderCount} isEmpty={reorderRows.length === 0} emptyText="لا صنف تحت حدّه — جيّد.">
              <ListView selectable={false} columns={reorderCols} rows={reorderRows} />
            </DataCard>
            <DataCard title="مخزون راكد (٩٠ يومًا)" count={k.stagnantCount} isEmpty={stagnantRows.length === 0} emptyText="لا مخزون راكد.">
              <ListView selectable={false} columns={stagnantCols} rows={stagnantRows} />
            </DataCard>
          </div>
        </div>

        {/* النشاط الأخير */}
        <div className="o_dashboard_section">
          <div className="o_dashboard_section_title"><Icon name="activity" size={16} /> النشاط الأخير</div>
          <div className="o_dashboard_grid2">
            <DataCard title="آخر العمليّات" isEmpty={opsRows.length === 0} emptyText="لا عمليّات بعد.">
              <ListView selectable={false} columns={opsCols} rows={opsRows} />
            </DataCard>
            <DataCard title="آخر حركات المخزون" isEmpty={moveRows.length === 0} emptyText="لا حركات بعد.">
              <ListView selectable={false} columns={moveCols} rows={moveRows} />
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
