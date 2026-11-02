/**
 * ‹WH-MOVE› تقرير حركة المستودعات وفق المستودع (طلب المالك 2026-11-02).
 *
 * لكلّ مستودعٍ على حدة: ما دخل رفوفه وما خرج منها وصافيهما وقيمتهما، ثمّ تفصيلُ
 * الحركات. المنطقُ خالصٌ ومُختبَرٌ في `warehouseMovements.js`، وهذه الشاشةُ تقرأ
 * الحركاتِ قراءةً مقصورةً (منذ الافتتاح، بسقفٍ) وتعرض كلفتَها — ثمّ تُصدَّر إكسل وPDF.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { listenMovesSince } from '../../../services/ledger/ledgerService.js';
import { libyaMidnightMs } from '../../../services/reports/odooReportsService.js';
import { warehouseMovementReport, warehouseMovementSheets } from '../../../services/reports/warehouseMovements.js';
import { WAREHOUSE_NAMES } from '../../../services/reports/odooReports.js';
import { exportAoaSheets } from '../../../services/excel/excelExport.js';
import { exportElementToPdf } from '../../../services/reports/pdfExport.js';

const MOVES_CAP = 2500;
const libyaToday = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
const shiftDay = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthStart = (day) => `${day.slice(0, 7)}-01`;
const prevMonth = (day) => {
  const first = monthStart(day);
  const lastPrev = shiftDay(first, -1);
  return [monthStart(lastPrev), lastPrev];
};
const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : n);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const whName = (code) => WAREHOUSE_NAMES[code] || code;
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

/** عنصرُ DOM مُفصَّلٌ للطباعة PDF — يُبنى ويُسلَّم لبوّابة `exportElementToPdf`. */
function buildMovementPdfElement(report, { from, to }) {
  const el = document.createElement('div');
  el.dir = 'rtl';
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;color:#111;font-family:\'IBM Plex Sans Arabic\',sans-serif;padding:24px;font-size:13px;';
  const sumRows = report.warehouses
    .map((w) => `<tr><td>${esc(w.name)}</td><td style="text-align:left">${fmt(w.moveCount)}</td><td style="text-align:left">${fmt(w.inQty)}</td><td style="text-align:left">${fmt(w.outQty)}</td><td style="text-align:left">${fmt(w.net)}</td></tr>`)
    .join('');
  const t = report.totals;
  const detRows = report.details
    .slice(0, 300)
    .map((d) => `<tr><td>${esc(d.day)}</td><td>${esc(d.warehouseName)}</td><td>${esc(d.dirLabel)}</td><td>${esc(d.reason)}</td><td style="direction:ltr">${esc(d.docNumber)}</td><td>${esc(d.nameAr || d.sku)}</td><td style="text-align:left">${fmt(d.qty)}</td><td>${esc(d.counterparty)}</td></tr>`)
    .join('');
  const th = 'style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;font-weight:700"';
  const td = 'border-bottom:1px solid #ddd;padding:5px 8px';
  el.innerHTML = `
    <h2 style="margin:0 0 4px">تقرير حركة المستودعات وفق المستودع</h2>
    <div style="color:#555;margin-bottom:14px">المدّة: ${esc(from)} ← ${esc(to)}</div>
    <h3 style="margin:10px 0 6px">الملخّص وفق المستودع</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr><th ${th}>المستودع</th><th ${th}>الحركات</th><th ${th}>الوارد</th><th ${th}>المنصرف</th><th ${th}>الصافي</th></tr></thead>
      <tbody>${sumRows}<tr style="font-weight:700;background:#f4f4f4"><td>الإجماليّ</td><td style="text-align:left">${fmt(t.moveCount)}</td><td style="text-align:left">${fmt(t.inQty)}</td><td style="text-align:left">${fmt(t.outQty)}</td><td style="text-align:left">${fmt(t.net)}</td></tr></tbody>
    </table>
    <h3 style="margin:10px 0 6px">تفصيل الحركات${report.details.length > 300 ? ` (أوّل 300 من ${fmt(report.details.length)})` : ''}</h3>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th ${th}>التاريخ</th><th ${th}>المستودع</th><th ${th}>الاتجاه</th><th ${th}>السبب</th><th ${th}>المستند</th><th ${th}>الصنف</th><th ${th}>الكمّيّة</th><th ${th}>الطرف المقابل</th></tr></thead>
      <tbody>${detRows}</tbody>
    </table>`;
  // تطبيقُ حدّ الخلايا على كلّ td (innerHTML لا يسمح بمحدِّدٍ تنازليّ).
  el.querySelectorAll('td').forEach((c) => (c.style.cssText += td));
  return el;
}

export default function WarehouseMovements() {
  const today = libyaToday();
  const [moves, setMoves] = useState(null);
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [warehouse, setWarehouse] = useState('');
  const [error, setError] = useState('');
  const [busyPdf, setBusyPdf] = useState(false);

  // ★ القراءةُ مقيَّدةٌ ببداية المدّة لا بالافتتاح الثابت (درس المراجعة العدائيّة):
  // أرضيّةُ `postedAt` هي «من»، فمدّةٌ قديمةٌ تجلب حركاتِها لا أحدثَ ٢٥٠٠ مطلقًا —
  // وتُعاد القراءةُ كلّما تغيّرت «من». والفارغُ يسقط إلى الافتتاح (حارسُ NaN).
  useEffect(() => {
    let active = true;
    let unsub = () => {};
    setMoves(null);
    try {
      unsub = listenMovesSince(
        (rows) => { if (active) setMoves(rows); },
        { sinceMs: from ? libyaMidnightMs(from) : undefined, max: MOVES_CAP },
      );
    } catch (e) {
      setError(e?.message || 'تعذّرت قراءة الحركات.');
      setMoves([]);
    }
    return () => { active = false; try { unsub(); } catch { /* مستمعٌ أُغلق */ } };
  }, [from]);

  const report = useMemo(
    () => warehouseMovementReport(moves || [], { from, to, warehouse, names: WAREHOUSE_NAMES }),
    [moves, from, to, warehouse],
  );
  const codes = useMemo(
    () => warehouseMovementReport(moves || [], { from, to }).warehouses.map((w) => w.code),
    [moves, from, to],
  );
  // ★ يبقى المستودعُ المختارُ في القائمة ولو خلا من حركةٍ في المدّة (درس المراجعة):
  // وإلّا ظهر `<select>` فارغًا والتقريرُ ما زال مُرشَّحًا إليه — فيُقرأ فراغُه «الكلّ».
  const options = useMemo(() => {
    const set = new Set(codes);
    if (warehouse) set.add(warehouse);
    return [...set];
  }, [codes, warehouse]);

  const loading = moves === null;
  const capped = Array.isArray(moves) && moves.length >= MOVES_CAP;
  const hasRows = report.warehouses.length > 0;

  function downloadExcel() {
    const sheets = warehouseMovementSheets(report);
    exportAoaSheets(sheets, `حركة-المستودعات-${from}_${to}`);
  }

  async function downloadPdf() {
    setBusyPdf(true);
    setError('');
    const el = buildMovementPdfElement(report, { from, to });
    document.body.appendChild(el);
    try {
      await exportElementToPdf(el, {
        margin: 10,
        filename: `حركة-المستودعات-${from}_${to}.pdf`,
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        html2canvas: { scale: 2 },
      });
    } catch (e) {
      setError(e?.message || 'تعذّر إنشاء PDF.');
    } finally {
      el.remove();
      setBusyPdf(false);
    }
  }

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">حركة المستودعات</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          <button type="button" className="btn btn-secondary" disabled={!hasRows} onClick={downloadExcel}>
            <Icon name="arrowDownTray" size={15} /> تنزيل إكسل
          </button>
          <button type="button" className="btn btn-secondary" disabled={!hasRows || busyPdf} onClick={downloadPdf}>
            <Icon name="fileText" size={15} /> {busyPdf ? 'يُجهّز…' : 'تنزيل PDF'}
          </button>
        </div>
      </div>

      <div className="o_ds">
        {/* ١) المدّة والمستودع */}
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
            {options.map((code) => <option key={code} value={code}>{whName(code)}</option>)}
          </select>
        </div>

        {error && <div className="o_alert danger" style={{ marginBottom: '14px' }}>{error}</div>}
        {loading && <div className="o_alert" style={{ marginBottom: '14px' }}>يقرأ حركات الدفتر…</div>}

        {/* ٢) الطبقةُ العليا: الإجماليّ */}
        <div className="o_dashboard_kpis" style={{ marginBottom: '14px' }}>
          <Stat label="عدد الحركات" value={report.totals.moveCount} />
          <Stat label="الوارد (كمّيّة)" value={report.totals.inQty} />
          <Stat label="المنصرف (كمّيّة)" value={report.totals.outQty} />
          <Stat label="الصافي" value={report.totals.net} />
        </div>

        {/* ٣-أ) الملخّص وفق المستودع */}
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 700 }}>الملخّص وفق المستودع</h3>
          {!hasRows ? (
            <div className="o_alert" style={{ margin: 0 }}>{loading ? 'جارٍ التحميل…' : warehouse ? `لا حركاتٍ لـ«${whName(warehouse)}» في هذه المدّة.` : 'لا حركاتٍ في هذه المدّة.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--o-border-color)' }}>
                    {['المستودع', 'عدد الحركات', 'الوارد', 'المنصرف', 'الصافي', 'قيمة الوارد', 'قيمة المنصرف'].map((h) => (
                      <th key={h} style={{ ...cell, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.warehouses.map((w) => (
                    <tr key={w.code} style={{ borderBottom: '1px solid var(--o-border-color)' }}>
                      <td style={cell}>{w.name}</td>
                      <td style={{ ...cell, textAlign: 'left' }}>{fmt(w.moveCount)}</td>
                      <td style={{ ...cell, textAlign: 'left' }}>{fmt(w.inQty)}</td>
                      <td style={{ ...cell, textAlign: 'left' }}>{fmt(w.outQty)}</td>
                      <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>{fmt(w.net)}</td>
                      <td style={{ ...cell, textAlign: 'left' }}>{fmt(w.inValue)}</td>
                      <td style={{ ...cell, textAlign: 'left' }}>{fmt(w.outValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ٣-ب) تفصيل الحركات */}
        {hasRows && (
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '10px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 700 }}>تفصيل الحركات</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--o-border-color)' }}>
                    {['التاريخ', 'المستودع', 'الاتجاه', 'السبب', 'المستند', 'الصنف', 'الكمّيّة', 'الطرف المقابل'].map((h) => (
                      <th key={h} style={{ ...cell, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.details.slice(0, 1000).map((d, i) => (
                    <tr key={`${d.docNumber}-${d.sku}-${d.direction}-${i}`} style={{ borderBottom: '1px solid var(--o-border-color)' }}>
                      <td style={{ ...cell, direction: 'ltr', textAlign: 'right' }}>{d.day || '—'}</td>
                      <td style={cell}>{d.warehouseName}</td>
                      <td style={cell}>{d.dirLabel}</td>
                      <td style={cell}>{d.reason || '—'}</td>
                      <td style={{ ...cell, direction: 'ltr', textAlign: 'right' }}>{d.docNumber || '—'}</td>
                      <td style={cell}>{d.nameAr || d.sku || '—'}</td>
                      <td style={{ ...cell, textAlign: 'left' }}>{fmt(d.qty)}</td>
                      <td style={cell}>{d.counterparty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.details.length > 1000 && (
                <p style={{ ...muted, marginTop: '8px' }}>يُعرض أوّلُ ألف صفّ — والإكسل يحمل الكلّ ({fmt(report.details.length)}).</p>
              )}
            </div>
          </div>
        )}

        <p style={muted}>
          الحركاتُ المقروءة لهذه المدّة: {fmt(Array.isArray(moves) ? moves.length : 0)} (منذ بداية «من»، بسقف {fmt(MOVES_CAP)})
          {capped && ' — بلغت السقفَ: اجعل «من» أحدثَ (مدّةً أقصر) لئلّا تُحجب الحركاتُ الأقدم.'}
          {report.undatedExcluded > 0 && ` · ${fmt(report.undatedExcluded)} حركةً بلا تاريخٍ مستبعَدةٌ من المدّة — امسح التاريخ لإظهارها.`}
          {report.undatedIncluded > 0 && ` · ${fmt(report.undatedIncluded)} حركةً بلا تاريخٍ مضمَّنةٌ (لا تاريخَ لترشيحها).`}
        </p>
      </div>
    </div>
  );
}
