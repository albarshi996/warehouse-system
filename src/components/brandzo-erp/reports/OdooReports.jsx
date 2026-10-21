/**
 * ‹ODOO-RPT› تقاريرُ أودو — «البوّابةُ هي الشاشةُ السهلةُ الفهم لأحداث أودو» (المالك 2026-10-21).
 *
 * سبعةُ تبويبات على مصدرٍ واحد (مستنداتُ المصدر المُرحَّلة): أوامرُ البيع · الاستلام · التوصيل ·
 * المرتجع · المخزونُ اليوميّ · الشهريّ · الرصيدُ في تاريخ. وكلُّ تبويبٍ يُنزَّل إكسل بما يعرضه حرفًا.
 *
 * والقراءةُ مقصورة (انظر `odooReportsService.js`): مستنداتُ المدّة تُقرأ عند الفتح، والأرصدةُ لا تُقرأ
 * إلّا حين يُطلب المخزون — وكلفةُ كلّ قراءةٍ معروضةٌ تحت الجدول.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import Badge from '../../odoo/Badge.jsx';
import { getBasePath } from '../../../services/auth/authService.js';
import {
  COLUMNS,
  FIRST_KNOWN_DAY,
  WAREHOUSE_NAMES,
  dailyStock,
  docDeltas,
  docRow,
  isDelivery,
  isReceipt,
  isReturn,
  lineRows,
  monthlyStock,
  returnDirection,
  salesOrdersReport,
  selectDocs,
  stockAsOf,
  summarize,
  toAoa,
} from '../../../services/reports/odooReports.js';
import { fetchBalancesForReports, fetchOdooDocsInRange, fetchPostedSince, totalsByWarehouse } from '../../../services/reports/odooReportsService.js';
import { exportAoaSheets } from '../../../services/excel/excelExport.js';

const TABS = [
  { id: 'orders', label: 'أوامر البيع', icon: 'clipboardList' },
  { id: 'receipts', label: 'الاستلام', icon: 'arrowDownTray' },
  { id: 'deliveries', label: 'التوصيل', icon: 'truck' },
  { id: 'returns', label: 'المرتجع', icon: 'arrowLeftRight' },
  { id: 'daily', label: 'المخزون اليوميّ', icon: 'barChart3', stock: true },
  { id: 'monthly', label: 'المخزون الشهريّ', icon: 'barChart3', stock: true },
  { id: 'asOf', label: 'الرصيد في تاريخ', icon: 'package', stock: true },
];

const libyaToday = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
const shiftDay = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthStart = (day) => `${day.slice(0, 7)}-01`;
const prevMonth = (day) => {
  const first = monthStart(day);
  const lastPrev = shiftDay(first, -1);
  return [monthStart(lastPrev), lastPrev];
};
const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : n);
const muted = { fontSize: '12px', color: 'var(--o-main-color-muted)' };
const cell = { padding: '6px 8px', whiteSpace: 'nowrap' };

function Stat({ label, value }) {
  return (
    <div className="o_kpi">
      <div className="o_kpi_label">{label}</div>
      <div className="o_kpi_value">{fmt(value)}</div>
    </div>
  );
}

function Table({ columns, rows, link }) {
  if (!rows.length) return <div className="o_alert" style={{ margin: 0 }}>لا بيانات في هذه المدّة.</div>;
  const base = getBasePath();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--o-border-color)' }}>
            {columns.map(([k, label]) => <th key={k} style={{ ...cell, fontWeight: 700 }}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 1000).map((r, i) => (
            <tr key={r.id || `${r.warehouse}-${r.day || r.month || r.sku}-${i}`} style={{ borderBottom: '1px solid var(--o-border-color)' }}>
              {columns.map(([k]) => (
                <td key={k} style={{ ...cell, direction: /sourceRef|number|sku|barcode|orderRef|refs/.test(k) ? 'ltr' : undefined, textAlign: 'right' }}>
                  {link && k === 'number' && r.id ? <a href={`${base}/dashboard/document?id=${r.id}`}>{r[k] || '—'}</a> : typeof r[k] === 'number' ? fmt(r[k]) : r[k] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 1000 && <p style={{ ...muted, marginTop: '8px' }}>يُعرض أوّلُ ألف صفّ — والإكسل يحمل الكلّ ({fmt(rows.length)}).</p>}
    </div>
  );
}

export default function OdooReports() {
  const today = libyaToday();
  const [tab, setTab] = useState('deliveries');
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [warehouse, setWarehouse] = useState('');
  const [party, setParty] = useState('');
  const [asOfDay, setAsOfDay] = useState(today);
  const [docs, setDocs] = useState(null);
  const [stock, setStock] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reads, setReads] = useState({ docs: 0, posted: 0, balances: 0 });
  const isStockTab = TABS.find((t) => t.id === tab)?.stock;

  const loadDocs = useCallback(async () => {
    setBusy('يقرأ مستندات المدّة…');
    setError('');
    try {
      const out = await fetchOdooDocsInRange(from, to);
      setDocs(out.docs);
      setReads((r) => ({ ...r, docs: out.reads }));
    } catch (e) {
      setError(e?.message || 'تعذّرت القراءة.');
    } finally {
      setBusy('');
    }
  }, [from, to]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  async function loadStock(refresh = false) {
    setBusy('يقرأ الأرصدة والمستندات المُرحَّلة…');
    setError('');
    try {
      const startDay = tab === 'asOf' ? asOfDay : from;
      const [bal, posted] = await Promise.all([fetchBalancesForReports({ refresh }), fetchPostedSince(startDay)]);
      const { rows, problems } = docDeltas(posted.docs);
      setStock({ balances: bal.rows, at: bal.at, cached: bal.cached, deltas: rows, problems, startDay });
      setReads((r) => ({ ...r, posted: posted.reads, balances: bal.reads }));
    } catch (e) {
      setError(e?.message || 'تعذّرت القراءة.');
    } finally {
      setBusy('');
    }
  }

  const filters = { from, to, warehouse, party };
  const view = useMemo(() => {
    const all = docs || [];
    if (tab === 'orders') {
      const rows = salesOrdersReport(all, filters);
      return { columns: COLUMNS.orders, rows, stats: { docs: rows.length, lines: rows.reduce((s, r) => s + r.lines, 0), qty: rows.reduce((s, r) => s + r.qty, 0), value: rows.reduce((s, r) => s + r.value, 0) }, label: 'أمر بيع' };
    }
    if (tab === 'receipts' || tab === 'deliveries' || tab === 'returns') {
      const pick = { receipts: isReceipt, deliveries: isDelivery, returns: isReturn }[tab];
      const selected = selectDocs(all, pick, filters);
      const rows = selected.map((d) => ({ ...docRow(d), direction: returnDirection(d) }));
      const columns = tab === 'returns' ? [...COLUMNS.docs, ['direction', 'الاتّجاه']] : COLUMNS.docs;
      return { columns, rows, stats: summarize(rows), selected, label: 'مستند' };
    }
    if (!stock) return { columns: [], rows: [] };
    const current = totalsByWarehouse(stock.balances);
    const whs = warehouse ? [warehouse] : undefined;
    if (tab === 'daily' || tab === 'monthly') {
      const daily = dailyStock({ currentByWarehouse: current, deltas: stock.deltas, from, to, ...(whs ? { warehouses: whs } : {}) });
      const rows = tab === 'daily' ? daily : monthlyStock(daily);
      return { columns: COLUMNS[tab], rows };
    }
    const rows = stockAsOf(stock.balances, stock.deltas, asOfDay, whs ? { warehouses: whs } : {});
    return { columns: COLUMNS.asOf, rows, stats: { docs: rows.length, qty: rows.reduce((s, r) => s + r.qty, 0) } };
  }, [docs, stock, tab, from, to, warehouse, party, asOfDay]);

  const stockStale = isStockTab && stock && (tab === 'asOf' ? asOfDay < stock.startDay : from < stock.startDay);

  function download() {
    const label = TABS.find((t) => t.id === tab)?.label || 'تقرير';
    const sheets = [{ name: label, aoa: toAoa(tab === 'returns' ? 'docs' : tab in COLUMNS ? tab : 'docs', view.rows, tab === 'returns' ? [['direction', 'الاتّجاه']] : []) }];
    if (view.selected) sheets.push({ name: 'البنود', aoa: toAoa('lines', lineRows(view.selected)) });
    if (tab === 'orders') sheets.push({ name: 'البنود', aoa: toAoa('lines', lineRows(selectDocs(docs || [], isDelivery, filters))) });
    const span = tab === 'asOf' ? asOfDay : `${from}_${to}`;
    exportAoaSheets(sheets, `تقارير-أودو-${label}-${span}`);
  }

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">تقارير أودو</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          <button type="button" className="btn btn-secondary" disabled={!view.rows?.length} onClick={download}>
            <Icon name="arrowDownTray" size={15} /> تنزيل إكسل
          </button>
        </div>
      </div>

      <div className="o_ds">
        {/* ١) المدّة والمرشّحات */}
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <label style={muted}>من <input className="o_input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={muted}>إلى <input className="o_input" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          {[
            ['اليوم', today, today],
            ['أمس', shiftDay(today, -1), shiftDay(today, -1)],
            ['هذا الشهر', monthStart(today), today],
            ['الشهر الماضي', ...prevMonth(today)],
          ].map(([label, f, t]) => (
            <button key={label} type="button" className="btn btn-link" onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
          <select className="o_input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} aria-label="المستودع">
            <option value="">كلّ المستودعات</option>
            {Object.entries(WAREHOUSE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          {!isStockTab && (
            <input className="o_input" value={party} onChange={(e) => setParty(e.target.value)} placeholder="الطرف: اسمٌ أو كود" style={{ flex: '1 1 180px' }} />
          )}
          {tab === 'asOf' && <label style={muted}>الرصيد في نهاية <input className="o_input" type="date" value={asOfDay} max={today} onChange={(e) => setAsOfDay(e.target.value)} /></label>}
        </div>

        <div role="tablist" aria-label="التقرير" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', borderBottom: '1px solid var(--o-border-color)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="btn btn-link"
              onClick={() => setTab(t.id)}
              style={{ borderBottom: tab === t.id ? '2px solid var(--o-brand-primary)' : '2px solid transparent', fontWeight: tab === t.id ? 700 : 500, borderRadius: 0 }}
            >
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </div>

        {error && <div className="o_alert danger" style={{ marginBottom: '14px' }}>{error}</div>}
        {busy && <div className="o_alert" style={{ marginBottom: '14px' }}>{busy}</div>}

        {/* ٢) الطبقةُ العليا: أرقامُ التبويب */}
        {view.stats && (
          <div className="o_dashboard_kpis" style={{ marginBottom: '14px' }}>
            <Stat label={tab === 'asOf' ? 'أصناف' : tab === 'orders' ? 'أوامر' : 'مستندات'} value={view.stats.docs} />
            {view.stats.lines !== undefined && <Stat label="بنود" value={view.stats.lines} />}
            <Stat label="الكمّيّة" value={view.stats.qty} />
            {view.stats.value !== undefined && <Stat label="القيمة (د.ل)" value={view.stats.value} />}
          </div>
        )}

        {/* المخزون: لا يُقرأ إلّا بطلب */}
        {isStockTab && (
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
            <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => loadStock(false)}>
              <Icon name="barChart3" size={15} /> {stock && !stockStale ? 'أعد الحساب' : 'احسب المخزون'}
            </button>
            {stock && (
              <button type="button" className="btn btn-link" disabled={Boolean(busy)} onClick={() => loadStock(true)} style={{ marginInlineStart: '8px' }}>
                حدّث الأرصدة من القاعدة
              </button>
            )}
            <p style={{ ...muted, margin: '8px 0 0', lineHeight: 1.7 }}>
              الرصيدُ في يومٍ = رصيدُ الآن ناقصَ ما وقع بعده — بمحرّك القيد نفسه. يُقرأ لذلك الأرصدةُ مرّةً للجلسة
              والمستنداتُ المُرحَّلة منذ أوّل المدّة.
              {stockStale && <strong> — غيّرتَ بدايةَ المدّة إلى ما قبل ما حُسب: أعد الحساب.</strong>}
              {from < FIRST_KNOWN_DAY && tab !== 'asOf' && <> · يبدأ الجدولُ من {FIRST_KNOWN_DAY} (لقطةُ الافتتاح) — وما قبلها لا تعرفه البوّابة.</>}
            </p>
            {stock?.problems?.length > 0 && (
              <div className="o_alert warning" style={{ marginTop: '10px' }}>
                {stock.problems.length} مستندًا تعذّر حسابُ أثره: {stock.problems.slice(0, 3).join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* ٣) الفهرسُ الكامل */}
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '10px' }}>
          {!isStockTab || stock ? (
            <Table columns={view.columns} rows={view.rows || []} link={['receipts', 'deliveries', 'returns'].includes(tab)} />
          ) : (
            <p style={{ ...muted, margin: 0 }}>اضغط «احسب المخزون» لعرض التقرير.</p>
          )}
        </div>

        <p style={muted}>
          كلفةُ القراءة في هذه الجلسة: مستنداتُ المدّة {fmt(reads.docs)} · المستنداتُ المُرحَّلة {fmt(reads.posted)} · الأرصدة {fmt(reads.balances)}
          {stock?.cached && ' (من ذاكرة الجلسة)'} · <Badge variant="draft">المصدر: أودو عبر الاستيراد المُرحِّل</Badge>
        </p>
      </div>
    </div>
  );
}
