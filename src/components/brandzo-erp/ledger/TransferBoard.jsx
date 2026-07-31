import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { TRANSFER_CHAIN } from '../../../services/documents/chain.js';
import { pendingShipments, transferVariances, SHIPMENT_STATUS } from '../../../services/ledger/transferReports.js';
import { getBasePath } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int, num } from '../../odoo/format.js';

/**
 * لوحة النقل بين المستودعات — نافذة مخزن النقل وتقريراه.
 *
 * تجيب عن ثلاثة أسئلة تشغيلية: ماذا في الطريق الآن؟ أين ضاعت الفروق؟ وهل عاد
 * مخزن النقل صفرًا؟ الأوّلان تقريران محكومان، والثالث رصيدُ موقع `TRANSIT`
 * الحيّ — فإن لم يكن صفرًا، فما تبقّى فيه هو مجموع ما لم يصل بعد.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (o_control_panel + o_kpi + o_notebook + ListView + Badge + o_alert) —
 * **المنطق (الاشتراكات وتقارير النقل والرصيد الحيّ) لم يُمسّ**، غُيّر ما يُرسَم
 * فقط. الأرقام لاتينية (R2) عبر format، والأحمر للتحذير فقط.
 */

const TRANSIT = 'TRANSIT';

/** حالة الشحنة ← نوع شارة أودو (progress = في الطريق · done = وصلت · danger = فرق). */
const STATUS_VARIANT = {
  draft: 'draft',
  'in-transit': 'progress',
  received: 'done',
  variance: 'danger',
};

const PENDING_COLS = [
  { key: 'doc', label: 'مستند النقل' },
  { key: 'route', label: 'المسار' },
  { key: 'date', label: 'التاريخ' },
  { key: 'shipped', label: 'مشحون', numeric: true },
  { key: 'received', label: 'مستلَم', numeric: true },
  { key: 'remaining', label: 'متبقٍّ', numeric: true },
  { key: 'status', label: 'الحالة' },
];

const VARIANCE_COLS = [
  { key: 'doc', label: 'المستند' },
  { key: 'item', label: 'الصنف' },
  { key: 'route', label: 'المسار' },
  { key: 'shipped', label: 'مشحون', numeric: true },
  { key: 'received', label: 'مستلَم', numeric: true },
  { key: 'variance', label: 'الفارق', numeric: true },
  { key: 'reason', label: 'السبب' },
  { key: 'settlement', label: 'التسوية' },
];

const TRANSIT_COLS = [
  { key: 'item', label: 'الصنف' },
  { key: 'batch', label: 'التشغيلة' },
  { key: 'expiry', label: 'الصلاحية' },
  { key: 'stuck', label: 'العالق', numeric: true },
];

export default function TransferBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [balances, setBalances] = useState([]);
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
    const u1 = listenDocumentsByTypes(TRANSFER_CHAIN, setDocs, 300);
    const u2 = listenBalances(setBalances, () => setBalances([]));
    return () => {
      u1?.();
      u2?.();
    };
  }, [me]);

  const pending = useMemo(() => pendingShipments(docs), [docs]);
  const variances = useMemo(() => transferVariances(docs), [docs]);

  // رصيد مخزن النقل الحيّ — إثبات التصفير (أو كشف ما عَلِق).
  const transitRows = useMemo(
    () =>
      balances
        .filter((b) => String(b.warehouse || '').toUpperCase() === TRANSIT)
        .filter((b) => Math.abs(Number(b.qty) || 0) > 0.0001)
        .sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0)),
    [balances]
  );
  const transitTotal = useMemo(() => transitRows.reduce((s, b) => s + (Number(b.qty) || 0), 0), [transitRows]);

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

  const pendingListRows = pending.rows.map((r) => {
    const s = SHIPMENT_STATUS[r.status];
    return {
      id: r.id,
      cells: {
        doc: (
          <div>
            <a href={`${base}/dashboard/document?type=TRN&id=${r.id}`} className="o_field_link decoration-bf">
              {r.number || 'مسودّة'}
            </a>
            {r.driverName && (
              <div className="decoration-muted" style={{ fontSize: 'var(--o-font-size-xs)' }}>{r.driverName} · {r.vehiclePlate}</div>
            )}
          </div>
        ),
        route: <span style={{ whiteSpace: 'nowrap' }}>{r.fromWarehouse} ← {r.toWarehouse}</span>,
        date: <span className="decoration-muted">{r.shipmentDate || '—'}</span>,
        shipped: num(r.shipped),
        received: num(r.received),
        remaining: r.remaining > 0
          ? <span className="decoration-bf">{num(r.remaining)}</span>
          : <span className="decoration-muted">{num(r.remaining)}</span>,
        status: <Badge variant={STATUS_VARIANT[r.status]}>{s.label}</Badge>,
      },
    };
  });

  const varianceListRows = variances.rows.map((r, i) => ({
    id: `${r.transferNote}·${r.key}·${i}`,
    cells: {
      doc: <span className="decoration-muted" style={{ whiteSpace: 'nowrap' }}>{r.transferNote}</span>,
      item: r.description,
      route: <span style={{ whiteSpace: 'nowrap' }}>{r.fromWarehouse} ← {r.toWarehouse}</span>,
      shipped: num(r.shipped),
      received: num(r.received),
      variance: (
        <span className="decoration-bf" style={{ color: r.variance < 0 ? 'var(--o-text-danger)' : 'var(--o-text-success)' }}>
          {r.variance > 0 ? `+${num(r.variance)}` : num(r.variance)}
        </span>
      ),
      reason: r.reason || <span className="decoration-danger">بلا سبب</span>,
      settlement: <Badge variant={r.resolved ? 'done' : 'warn'}>{r.settlement}</Badge>,
    },
  }));

  const transitListRows = transitRows.map((b) => ({
    id: b.id,
    cells: {
      item: (
        <div>
          <div className="decoration-bf">{b.sku || b.barcode}</div>
          <div className="decoration-muted" style={{ fontSize: 'var(--o-font-size-xs)' }}>{b.nameAr}</div>
        </div>
      ),
      batch: <span className="decoration-muted">{b.batch || '—'}</span>,
      expiry: <span className="decoration-muted">{b.expiry || '—'}</span>,
      stuck: <span className="decoration-bf" style={{ color: 'var(--o-text-warning)' }}>{num(b.qty)}</span>,
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">النقل بين المستودعات</span></nav>
        </div>
      </div>

      <div className="o_ds">
        {/* شريط مؤشّرات مخزن النقل */}
        <div className="o_dashboard_kpis">
          <Stat label="في الطريق" value={int(pending.inTransit)} icon="truck" hint="شحنات غادرت ولم تُستلم" />
          <Stat label="بفرق كميات" value={int(pending.withVariance)} icon="alertTriangle" alert={pending.withVariance > 0} hint="استُلمت ناقصةً" />
          <Stat label="رصيد مخزن النقل" value={num(transitTotal)} icon="package" hint={transitTotal > 0 ? 'يجب أن يعود صفرًا' : 'صفرٌ — لا شيء عالق'} />
          <Stat label="فروق غير مسوّاة" value={int(variances.unresolved)} icon="alertTriangle" alert={variances.unresolved > 0} hint={`نقصٌ إجماليّ ${num(variances.totalShortage)}`} />
        </div>

        {/* التبويبات */}
        <div className="o_notebook">
          <div className="o_notebook_headers">
            {[
              ['pending', 'الشحنات المعلّقة', 'truck'],
              ['variance', 'فروقات النقل', 'arrowLeftRight'],
              ['transit', 'رصيد مخزن النقل', 'package'],
            ].map(([k, t, ic]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={tab === k ? 'active' : ''}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon name={ic} size={15} /> {t}
              </button>
            ))}
          </div>

          <div className="o_notebook_page">
            {tab === 'pending' && (
              <div className="o_ds_card">
                {pending.rows.length === 0 ? (
                  <div className="o_dashboard_empty">لا شحنات نقلٍ بعد.</div>
                ) : (
                  <ListView selectable={false} columns={PENDING_COLS} rows={pendingListRows} />
                )}
              </div>
            )}

            {tab === 'variance' && (
              <div className="o_ds_card">
                {variances.rows.length === 0 ? (
                  <div className="o_dashboard_empty">لا فروق نقلٍ — كل ما شُحن وصل كاملًا.</div>
                ) : (
                  <ListView selectable={false} columns={VARIANCE_COLS} rows={varianceListRows} />
                )}
              </div>
            )}

            {tab === 'transit' && (
              <>
                <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
                  <b style={{ color: 'var(--o-main-text-color)' }}>مخزن النقل</b> موقعٌ وسيط يجب أن يعود <b style={{ color: 'var(--o-text-success)' }}>صفرًا</b> بعد اكتمال كل استلام.
                  أيّ رصيدٍ باقٍ هنا = بضاعةٌ غادرت المصدر ولم تصل الوجهة بعد — شحنةٌ في الطريق أو فرقٌ لم يُسوَّ.
                </p>
                {transitRows.length === 0 ? (
                  <div className="o_ds_card o_ds_pad">
                    <div className="o_alert success" style={{ margin: 0 }}>
                      <div className="o_alert_title"><Icon name="checkCircle" size={16} /> مخزن النقل صفرٌ — لا شيء عالق في الطريق.</div>
                    </div>
                  </div>
                ) : (
                  <div className="o_ds_card">
                    <ListView selectable={false} columns={TRANSIT_COLS} rows={transitListRows} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, hint, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      <span className="o_kpi_icon"><Icon name={icon} size={20} /></span>
      <span className="o_kpi_value">{value}</span>
      <span className="o_kpi_label">{label}</span>
      {hint && <span className="o_kpi_sub">{hint}</span>}
    </div>
  );
}

function Notice({ children }) {
  return <div className="o_alert danger">{children}</div>;
}
