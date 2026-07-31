import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  listenOperations,
  listenScans,
  closeOperation,
} from '../../../services/stock/operationsService.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

const MANAGER_ROLES = ['admin', 'warehouse_manager'];

// خرائط نوع العملية → اسم أيقونة أودو (بدل الإيموجي؛ FontAwesome غير مُحمَّل).
const OP_ICONS = {
  'جرد': 'clipboardList',
  'استلام': 'arrowDownTray',
  'صرف': 'arrowUpTray',
  'إضافة أصناف': 'layers',
  'تالف': 'alertTriangle',
  'مرتجع': 'arrowLeftRight',
};

/** يحوّل طابع Firestore الزمني إلى نص عربي مقروء. */
function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY-u-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} ي`;
}

const OP_COLS = [
  { key: 'type', label: 'العملية' },
  { key: 'status', label: 'الحالة' },
  { key: 'by', label: 'المنفّذ' },
  { key: 'when', label: 'الوقت' },
];

const SCAN_COLS = [
  { key: 'item', label: 'الصنف' },
  { key: 'qty', label: 'الكمية', numeric: true },
  { key: 'by', label: 'من' },
  { key: 'when', label: 'متى' },
];

/**
 * شاشة متابعة العمليات — للمدير العام ومدير المستودع.
 * تعرض العمليات لحظياً، ومن يعمل عليها، وسجلّ المسح الحيّ لكل عملية.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ControlPanel + ListView + Badge + o_kpi + o_alert) — **المنطق (الاشتراكات
 * وخدمة الإقفال والتجميع) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2).
 */
export default function OperationsMonitor() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [selected, setSelected] = useState(null);
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');

  // من أنا؟ ثم استمع للعمليات إن كنت مديراً.
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      const profile = user ? await fetchUserProfile(user) : null;
      setMe(profile);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !MANAGER_ROLES.includes(me.role)) return;
    const unsub = listenOperations((rows) => {
      setOps(rows);
      setLoadingOps(false);
    });
    return () => unsub();
  }, [me]);

  // سجلّ المسح الحيّ للعملية المختارة.
  useEffect(() => {
    if (!selected) {
      setScans([]);
      return;
    }
    setLoadingScans(true);
    const unsub = listenScans(selected, (rows) => {
      setScans(rows);
      setLoadingScans(false);
    });
    return () => unsub();
  }, [selected]);

  const shown = useMemo(
    () => (filter === 'all' ? ops : ops.filter((o) => o.status === filter)),
    [ops, filter]
  );

  const openCount = useMemo(() => ops.filter((o) => o.status === 'open').length, [ops]);

  // تجميع سجلّ المسح: الإجماليات وتوزيع العمل على الموظّفين والأصناف.
  const agg = useMemo(() => {
    const byUser = new Map();
    const byItem = new Map();
    let totalQty = 0;
    for (const s of scans) {
      const q = Number(s.qty) || 0;
      totalQty += q;
      const u = s.byName || 'غير معروف';
      byUser.set(u, (byUser.get(u) || 0) + q);
      const key = s.barcode || '—';
      const prev = byItem.get(key) || { qty: 0, name: s.name, count: 0 };
      byItem.set(key, { qty: prev.qty + q, name: s.name || prev.name, count: prev.count + 1 });
    }
    return {
      totalQty,
      byUser: [...byUser.entries()].sort((a, b) => b[1] - a[1]),
      byItem: [...byItem.entries()].sort((a, b) => b[1].qty - a[1].qty),
    };
  }, [scans]);

  async function handleClose(opId) {
    if (!confirm('إقفال العملية؟ لن يُقبل أي مسح جديد عليها.')) return;
    try {
      await closeOperation(opId);
      flash('أُقفلت العملية.');
    } catch {
      flash('تعذّر الإقفال (تحقّق من صلاحيتك).');
    }
  }

  function flash(t) {
    setMsg(t);
    setTimeout(() => setMsg(''), 3500);
  }

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_dashboard_empty">جارٍ التحقّق…</div>
        </div>
      </div>
    );
  }

  if (!me || !MANAGER_ROLES.includes(me.role)) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> غير مصرّح</div>
            هذه الشاشة للمدير العام ومدير المستودع فقط.
          </div>
        </div>
      </div>
    );
  }

  const sel = ops.find((o) => o.id === selected);

  const opRows = shown.map((o) => ({
    id: o.id,
    decoration: selected === o.id ? 'bf' : o.status !== 'open' ? 'muted' : undefined,
    cells: {
      type: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Icon name={OP_ICONS[o.type] || 'package'} size={15} /> {o.type}
        </span>
      ),
      status: (
        <Badge variant={o.status === 'open' ? 'done' : 'draft'}>
          {o.status === 'open' ? 'مفتوحة' : 'مُقفلة'}
        </Badge>
      ),
      by: o.createdByName || 'غير معروف',
      when: (
        <span style={{ color: 'var(--o-main-color-muted)', fontSize: 'var(--o-font-size-xs)' }}>
          {fmtTime(o.createdAt)} · {fmtRelative(o.createdAt)}
        </span>
      ),
    },
  }));

  const scanRows = [...scans].reverse().map((s) => ({
    id: s.id,
    cells: {
      item: (
        <div>
          <div style={{ fontWeight: 'var(--o-font-weight-medium)' }}>{s.name || s.barcode}</div>
          <div style={{ color: 'var(--o-gray-500)', fontFamily: 'monospace', fontSize: 'var(--o-font-size-xs)' }} dir="ltr">
            {s.barcode}
          </div>
        </div>
      ),
      qty: <span className="decoration-bf">{int(s.qty)}</span>,
      by: s.byName || '—',
      when: fmtRelative(s.at) || '…',
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">متابعة العمليات</span></nav>
        </div>
      </div>

      <div className="o_ds">
        {msg && (
          <div className="o_alert" style={{ background: 'var(--o-badge-info-bg)', color: 'var(--o-text-info)', borderColor: 'var(--o-badge-info-bg)' }}>
            {msg}
          </div>
        )}

        {/* لقطة سريعة */}
        <div className="o_dashboard_kpis">
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="clipboardList" size={20} /></span>
            <span className="o_kpi_value">{int(ops.length)}</span>
            <span className="o_kpi_label">إجمالي العمليات</span>
          </div>
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="activity" size={20} /></span>
            <span className="o_kpi_value">{int(openCount)}</span>
            <span className="o_kpi_label">مفتوحة الآن</span>
          </div>
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="checkCircle" size={20} /></span>
            <span className="o_kpi_value">{int(ops.length - openCount)}</span>
            <span className="o_kpi_label">مُقفلة</span>
          </div>
        </div>

        <div className="o_dashboard_grid2">
          {/* قائمة العمليات */}
          <div className="o_dashboard_card">
            <div className="o_dashboard_card_head">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="package" size={16} /> العمليات
              </span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="o_input"
                style={{ width: 'auto' }}
              >
                <option value="all">الكل</option>
                <option value="open">مفتوحة</option>
                <option value="closed">مُقفلة</option>
              </select>
            </div>

            {loadingOps ? (
              <div className="o_dashboard_empty">جارٍ التحميل…</div>
            ) : shown.length === 0 ? (
              <div className="o_dashboard_empty">
                لا توجد عمليات بعد. تظهر هنا فور بدء أي موظّف عملية جرد أو استلام.
              </div>
            ) : (
              <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                <ListView
                  selectable={false}
                  columns={OP_COLS}
                  rows={opRows}
                  onRowClick={(row) => setSelected(row.id)}
                />
              </div>
            )}
          </div>

          {/* تفاصيل العملية المختارة */}
          <div className="o_dashboard_card">
            {!sel ? (
              <div className="o_dashboard_empty">اختر عملية من القائمة لعرض سجلّ المسح الحيّ.</div>
            ) : (
              <>
                <div className="o_dashboard_card_head">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Icon name={OP_ICONS[sel.type] || 'package'} size={16} /> {sel.type}
                    <span style={{ color: 'var(--o-gray-500)', fontFamily: 'monospace', fontSize: 'var(--o-font-size-xs)' }} dir="ltr">
                      {sel.id.slice(0, 8)}
                    </span>
                  </span>
                  {sel.status === 'open' && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleClose(sel.id)}>
                      <Icon name="checkCircle" size={14} /> إقفال العملية
                    </button>
                  )}
                </div>

                <div className="o_ds_pad">
                  <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 14px' }}>
                    بدأها {sel.createdByName || 'غير معروف'} · {fmtTime(sel.createdAt)}
                  </p>

                  {/* إجماليات */}
                  <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{int(scans.length)}</span>
                      <span className="o_kpi_label">عملية مسح</span>
                    </div>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{int(agg.totalQty)}</span>
                      <span className="o_kpi_label">إجمالي الكمية</span>
                    </div>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{int(agg.byItem.length)}</span>
                      <span className="o_kpi_label">صنف مختلف</span>
                    </div>
                  </div>

                  {/* من يعمل عليها */}
                  {agg.byUser.length > 0 && (
                    <div style={{ marginBottom: '18px' }}>
                      <h3 className="o_dashboard_section_title"><Icon name="users" size={16} /> توزيع العمل</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {agg.byUser.map(([name, qty]) => (
                          <Badge key={name} variant="progress">{name} — {int(qty)}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* سجلّ المسح الحيّ */}
                  <div>
                    <h3 className="o_dashboard_section_title">
                      <Icon name="activity" size={16} /> سجلّ المسح الحيّ
                      <span style={{ color: 'var(--o-gray-500)', fontWeight: 400, fontSize: 'var(--o-font-size-xs)' }}>
                        (يتحدّث تلقائيًّا)
                      </span>
                    </h3>
                    {loadingScans ? (
                      <div className="o_dashboard_empty">جارٍ التحميل…</div>
                    ) : scans.length === 0 ? (
                      <div className="o_dashboard_empty">لا مسح بعد على هذه العملية.</div>
                    ) : (
                      <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--o-border-color)', borderRadius: 'var(--o-border-radius)' }}>
                        <ListView selectable={false} columns={SCAN_COLS} rows={scanRows} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
