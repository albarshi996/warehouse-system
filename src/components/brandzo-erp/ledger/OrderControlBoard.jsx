import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { OUTBOUND_CHAIN, BILLING_CHAIN } from '../../../services/documents/chain.js';
import { pendingOrders, outOfStockItems, ORDER_STATUS } from '../../../services/ledger/salesReports.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int, num } from '../../odoo/format.js';

/**
 * الرقابة على الطلبات — التقريران اللذان يحوّلان أوامر البيع إلى قرار.
 *
 * الأوّل «الطلبات المعلّقة»: كل أمرٍ لم يُسلَّم، مصنَّفًا بالرصيد وسبب التعثّر —
 * فيرى المدير أين توقّف كل طلب. والثاني «الأصناف غير المتوفّرة»: العجز مجمَّعًا
 * صنفًا صنفًا بقيمته المفقودة ومتوسط طلبه — إشارةُ شراءٍ مسبَّبة.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ControlPanel + o_kpi + ListView + Badge) — **المنطق (الاشتراكات والتقارير
 * الخالصة) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2) عبر format.
 */

const money = (n) => `${int(n)} د.ل`;

const TABS = [
  ['pending', 'الطلبات المعلّقة', 'clipboardList'],
  ['shortage', 'الأصناف غير المتوفّرة', 'alertTriangle'],
];

/** حالة الطلب → صنف شارة أودو (عرضٌ فقط). */
const STATUS_VARIANT = {
  'not-approved': 'warn',
  'no-stock': 'danger',
  'awaiting-pick': 'progress',
  'in-fulfillment': 'progress',
  'on-hold': 'draft',
  delivered: 'done',
  closed: 'done',
};

const PENDING_COLS = [
  { key: 'order', label: 'أمر البيع' },
  { key: 'customer', label: 'العميل' },
  { key: 'warehouse', label: 'المستودع' },
  { key: 'date', label: 'التاريخ' },
  { key: 'value', label: 'القيمة', numeric: true },
  { key: 'status', label: 'الحالة / سبب عدم التنفيذ' },
];

const SHORTAGE_COLS = [
  { key: 'item', label: 'الصنف' },
  { key: 'times', label: 'مرّات الطلب', numeric: true },
  { key: 'shortQty', label: 'الكمية العاجزة', numeric: true },
  { key: 'lostValue', label: 'القيمة المفقودة', numeric: true },
  { key: 'avgMonthly', label: 'متوسط الطلب الشهري', numeric: true },
  { key: 'lastStockout', label: 'آخر نفاد' },
];

export default function OrderControlBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    // سلسلة المبيعات كاملة: أمر البيع وأبناؤه (SO·PICK·PACK·DN·GP) + الفاتورة.
    const types = [...new Set([...OUTBOUND_CHAIN, ...BILLING_CHAIN])];
    const unsub = listenDocumentsByTypes(types, setDocs, 400);
    return () => unsub?.();
  }, [me]);

  const pending = useMemo(() => pendingOrders(docs), [docs]);
  const shortage = useMemo(() => outOfStockItems(docs), [docs]);

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><div className="o_dashboard_empty">جارٍ التحميل…</div></div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><Notice>افتح الصفحة بعد تسجيل الدخول.</Notice></div>
      </div>
    );
  }

  const base = getBasePath();

  const pendingRows = pending.rows.map((r) => {
    const s = ORDER_STATUS[r.status];
    return {
      id: r.id,
      cells: {
        order: (
          <a href={`${base}/dashboard/document?type=SO&id=${r.id}`} className="decoration-bf" style={{ color: 'var(--o-action)' }}>
            {r.number || 'مسودّة'}
          </a>
        ),
        customer: r.customer || '—',
        warehouse: r.warehouse || '—',
        date: <span style={{ whiteSpace: 'nowrap' }}>{r.orderDate || '—'}</span>,
        value: money(r.value),
        status: (
          <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Badge variant={STATUS_VARIANT[r.status] || 'draft'}>{r.holdReason || s.label}</Badge>
            {r.status === 'no-stock' && r.shortfallCount > 0 && (
              <span style={{ color: 'var(--o-gray-500)' }}>({int(r.shortfallCount)} صنفًا)</span>
            )}
          </span>
        ),
      },
    };
  });

  const shortageRows = shortage.rows.map((r) => ({
    id: r.key,
    cells: {
      item: (
        <div>
          <div className="decoration-bf">{r.sku || r.barcode}</div>
          <div style={{ color: 'var(--o-main-color-muted)', fontSize: 'var(--o-font-size-xs)' }}>{r.nameAr}</div>
        </div>
      ),
      times: num(r.times),
      shortQty: <span style={{ color: 'var(--o-text-warning)', fontWeight: 'var(--o-font-weight-bold)' }}>{num(r.shortQty)}</span>,
      lostValue: <span className="decoration-bf decoration-danger" style={{ whiteSpace: 'nowrap' }}>{money(r.lostValue)}</span>,
      avgMonthly: num(Math.round(r.avgMonthly)),
      lastStockout: <span style={{ whiteSpace: 'nowrap' }}>{r.lastStockout || '—'}</span>,
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">الرقابة على الطلبات</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          {TABS.map(([k, t, icon]) => (
            <button
              key={k}
              type="button"
              className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab(k)}
            >
              <Icon name={icon} size={15} /> {t}
            </button>
          ))}
        </div>
      </div>

      <div className="o_ds">
        <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
          <Stat label="طلبات معلّقة" value={pending.pending} icon="clipboardList" hint={money(pending.pendingValue)} />
          <Stat label="يوجد رصيد" value={pending.withStock} icon="checkCircle" hint="بانتظار التعبئة أو التجهيز" />
          <Stat label="لا يوجد رصيد" value={pending.noStock} icon="alertTriangle" alert hint="تُحوَّل لتقرير العجز" />
          <Stat label="أصناف عاجزة" value={shortage.itemCount} icon="package" alert hint={`قيمة مفقودة ${money(shortage.totalLostValue)}`} />
        </div>

        {tab === 'pending' && (
          <div className="o_ds_card">
            {Object.keys(pending.byReason).length > 0 && (
              <div className="o_ds_toolbar" style={{ flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(pending.byReason).map(([status, count]) => {
                  const s = ORDER_STATUS[status];
                  return (
                    <Badge key={status} variant={STATUS_VARIANT[status] || 'draft'}>{s.label}: {int(count)}</Badge>
                  );
                })}
              </div>
            )}
            {pending.rows.length === 0 ? (
              <div className="o_dashboard_empty">
                لا طلبات معلّقة — كل أمرٍ سُلّم أو أُقفل <Icon name="checkCircle" size={14} />
              </div>
            ) : (
              <ListView selectable={false} columns={PENDING_COLS} rows={pendingRows} />
            )}
          </div>
        )}

        {tab === 'shortage' && (
          <div className="o_ds_card">
            <div className="o_ds_pad" style={{ paddingBottom: 0 }}>
              <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: 0, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Icon name="alertTriangle" size={16} />
                <span>
                  كل صنفٍ عجز المخزون عن تلبيته — مرتّبًا بالقيمة المفقودة. يُغذّي <b>التنبؤ بالطلب</b> و<b>التخطيط الشرائي</b> وضبط <b>حدّ المخزون الأدنى</b>.
                  <span style={{ color: 'var(--o-gray-500)' }}> (متوسط الطلب الشهري محسوبٌ على {num(shortage.monthsSpanned)} شهرًا)</span>
                </span>
              </p>
            </div>
            {shortage.rows.length === 0 ? (
              <div className="o_dashboard_empty">
                لا عجز — كل ما طُلب توفّر <Icon name="checkCircle" size={14} />
              </div>
            ) : (
              <ListView selectable={false} columns={SHORTAGE_COLS} rows={shortageRows} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, icon, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      {icon && <span className="o_kpi_icon"><Icon name={icon} size={20} /></span>}
      <span className="o_kpi_value">{int(value)}</span>
      <span className="o_kpi_label">{label}</span>
      {hint && <span className="o_kpi_sub">{hint}</span>}
    </div>
  );
}

function Notice({ children }) {
  return <div className="o_alert danger">{children}</div>;
}
