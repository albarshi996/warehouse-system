/**
 * الخريطة البصريّة للمواقع — تبويبٌ ثالث داخل شاشة المستودعات لا صفحةٌ ثانية.
 *
 * لماذا هنا لا على رابطٍ مستقلّ؟ للسبب نفسه الذي أنزل شجرة المواقع هنا:
 * «صفحةٌ فوق صفحة» قاعدةٌ رفضها المالك، والخريطة والشجرة **عينان على البيانات
 * نفسها** — الشجرة تُجيب «ما تركيب المستودع؟» والخريطة تُجيب «أيّ رفٍّ يقبل
 * الآن؟». ولو سكنتا رابطين لَافترق منطقاهما أوّل تعديل.
 *
 * (قرار المالك LOC-O04، 2026-08-16: الخريطة تبويبٌ هنا · و`WarehouseMaps.jsx`
 * تقريرٌ ملغى فلا يُحيا ولا يُربط — ويبقى في مكانه بلا حذف.)
 *
 * وكلّ ما يُرسَم هنا مشتقٌّ من `bin_locations` والأرصدة الحيّة عبر `mapGrid.js`
 * — لا رسمَ ثابتًا في JSX. الحساب كلّه هناك، وهذا الملفّ يرسم فقط.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { STORAGE_TYPES } from '../../../services/locations/locationsModel.js';
import { MAP_LEGEND, buildLocationGrid, warehouseCodesOf } from '../../../services/locations/mapGrid.js';

const n = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

export default function LocationMap() {
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [storageType, setStorageType] = useState('');
  const [term, setTerm] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => listenLocations(setLocations, () => setLocations([])), []);
  useEffect(() => listenBalances(setBalances, () => setBalances([])), []);

  const warehouseCodes = useMemo(() => warehouseCodesOf(locations), [locations]);
  const grid = useMemo(
    () => buildLocationGrid(locations, balances, { warehouse, storageType, term, includeArchived }),
    [locations, balances, warehouse, storageType, term, includeArchived]
  );

  const { summary } = grid;
  const cell = useMemo(() => grid.cells.find((c) => c.code === selected) || null, [grid.cells, selected]);

  return (
    <div className="bz-locmap">
      <style>{MAP_CSS}</style>

      {/* ── المرشّحات ─────────────────────────────────────────────── */}
      <div className="bz-locmap__bar o_no_print">
        <label className="bz-locmap__field">
          <span>المستودع</span>
          <select className="o_input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">الكلّ</option>
            {warehouseCodes.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </label>

        <label className="bz-locmap__field">
          <span>نوع التخزين</span>
          <select className="o_input" value={storageType} onChange={(e) => setStorageType(e.target.value)}>
            <option value="">الكلّ</option>
            {Object.values(STORAGE_TYPES).map((s) => (
              <option key={s.id} value={s.id}>{s.labelAr}</option>
            ))}
          </select>
        </label>

        <label className="bz-locmap__field bz-locmap__field--grow">
          <span>بحثٌ في الكود أو الاسم</span>
          <input
            className="o_input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="مثال: A01 أو رفّ الزيوت"
          />
        </label>

        <label className="bz-locmap__check">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          <span>إظهار المؤرشَف</span>
        </label>

        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <Icon name="printer" size={15} /> طباعة
        </button>
      </div>

      {/* ── الأرقام ───────────────────────────────────────────────── */}
      <div className="bz-locmap__kpis">
        <Kpi label="خانات معروضة" value={n(summary.cells)} />
        <Kpi label="تقبل بضاعةً الآن" value={n(summary.acceptingCells)} />
        <Kpi
          label="نسبة الامتلاء"
          value={summary.fillPct === null ? '—' : `${n(summary.fillPct)}٪`}
          hint={
            summary.fillPct === null
              ? 'لا موقعَ بسعةٍ مسجَّلة — والنسبة بلا سقفٍ كذبة.'
              : `على ${n(summary.cappedCells)} موقعًا مسقوفًا من ${n(summary.cells)}`
          }
        />
        <Kpi label="الرصيد المرصود" value={n(summary.usedQty)} hint="مجموع الكمّيّات في الخانات المعروضة" />
        <Kpi label="تنبيهات" value={n(summary.alerts)} warn={summary.alerts > 0} />
      </div>

      {/* ── المفتاح ───────────────────────────────────────────────── */}
      <div className="bz-locmap__legend" aria-label="مفتاح الخريطة">
        {MAP_LEGEND.map((s) => (
          <span key={s.id} className="bz-locmap__legend-item" title={s.hint}>
            <span className="bz-locmap__swatch" data-state={s.id} aria-hidden="true">
              {s.symbol}
            </span>
            {s.labelAr}
          </span>
        ))}
      </div>
      <p className="bz-locmap__note">
        لكلّ حالةٍ رمزٌ ونمطٌ ونصّ إلى جانب اللون — فتُقرأ الخريطة بلا تمييز الألوان وعلى الطابعة بالأبيض والأسود.
      </p>

      {/* ── الشبكة ────────────────────────────────────────────────── */}
      {locations.length === 0 ? (
        <div className="o_alert">
          لا مواقع في سيّد المواقع بعد. أضِفها من تبويب <strong>«مواقع التخزين»</strong> — والخريطة تُرسَم منها لحظةَ حفظها.
        </div>
      ) : grid.cells.length === 0 ? (
        <div className="o_alert">لا خانة تطابق المرشّحات الحالية.</div>
      ) : (
        grid.warehouses.map((wh) => (
          <section key={wh.warehouse} className="bz-locmap__wh">
            <h3 className="bz-locmap__wh-title">
              <Icon name="warehouse" size={16} /> {wh.warehouse}
              <small>
                {n(wh.summary.cells)} خانة · {n(wh.summary.acceptingCells)} تقبل
                {wh.summary.fillPct !== null && ` · امتلاء ${n(wh.summary.fillPct)}٪`}
              </small>
            </h3>

            {wh.zones.map((zone) => (
              <div key={`${wh.warehouse}/${zone.zone}`} className="bz-locmap__zone">
                <h4 className="bz-locmap__zone-title">
                  <Icon name="layers" size={14} /> {zone.zone || 'بلا منطقة'}
                  <small>{n(zone.summary.cells)} خانة</small>
                </h4>

                {zone.racks.map((rack) => (
                  <div key={`${wh.warehouse}/${zone.zone}/${rack.rack}`} className="bz-locmap__rack">
                    <span className="bz-locmap__rack-label">{rack.rack || 'بلا رفّ'}</span>
                    <div className="bz-locmap__cells">
                      {rack.cells.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          className="bz-locmap__cell"
                          data-state={c.state}
                          data-alert={c.alerts.length ? 'yes' : undefined}
                          aria-pressed={selected === c.code}
                          aria-label={c.summaryText}
                          title={c.summaryText}
                          onClick={() => setSelected(selected === c.code ? null : c.code)}
                        >
                          <span className="bz-locmap__cell-sym" aria-hidden="true">{c.symbol}</span>
                          <span className="bz-locmap__cell-code">{c.shortLabel}</span>
                          <span className="bz-locmap__cell-qty">
                            {c.occupancy.capacityQty === null
                              ? n(c.occupancy.usedQty)
                              : `${n(c.occupancy.usedQty)}/${n(c.occupancy.capacityQty)}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))
      )}

      {/* ── تفصيل الخانة المختارة ─────────────────────────────────── */}
      {cell && (
        <div className="bz-locmap__detail">
          <div className="bz-locmap__detail-head">
            <span className="bz-locmap__swatch" data-state={cell.state} aria-hidden="true">{cell.symbol}</span>
            <strong className="bz-locmap__mono">{cell.code}</strong>
            <span>{cell.stateLabel}</span>
            <button type="button" className="btn btn-link o_no_print" onClick={() => setSelected(null)}>إغلاق</button>
          </div>
          <dl className="bz-locmap__dl">
            {cell.nameAr && <><dt>الاسم</dt><dd>{cell.nameAr}</dd></>}
            <dt>نوع التخزين</dt><dd>{cell.storageLabel}</dd>
            <dt>الرصيد والسعة</dt><dd>{cell.capacityText}</dd>
            <dt>الأصناف · الدفعات · السطور</dt>
            <dd>{n(cell.occupancy.items)} · {n(cell.occupancy.batches)} · {n(cell.occupancy.lines)}</dd>
            <dt>يقبل بضاعةً جديدة؟</dt><dd>{cell.accepts ? 'نعم' : 'لا'}</dd>
          </dl>
          {cell.alerts.map((a) => (
            <div key={a.id} className="o_alert danger bz-locmap__alert">
              <Icon name="alertTriangle" size={15} /> <strong>{a.labelAr}</strong> — {a.hint}
            </div>
          ))}
        </div>
      )}

      {/* ── أرصدةٌ على مواقع غير مسجَّلة ───────────────────────────── */}
      {grid.orphans.length > 0 && (
        <div className="o_alert danger bz-locmap__orphans">
          <div className="o_alert_title">
            <Icon name="alertTriangle" size={16} /> {n(grid.orphans.length)} كودًا في الأرصدة بلا تسجيل في سيّد المواقع
          </div>
          <p>
            بضاعةٌ مقيَّدة على مواقع لا تعرفها الخريطة — لا تظهر في أيّ خانة أعلاه. تُسجَّل من تبويب «مواقع التخزين» أو
            يُصحَّح كودها في المستند.
          </p>
          <ul className="bz-locmap__orphan-list">
            {grid.orphans.slice(0, 12).map((o) => (
              <li key={o.code}>
                <span className="bz-locmap__mono">{o.code}</span> — {n(o.qty)} وحدة في {n(o.lines)} سطرًا
              </li>
            ))}
          </ul>
          {grid.orphans.length > 12 && <p>… و{n(grid.orphans.length - 12)} كودًا آخر.</p>}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, warn }) {
  return (
    <div className="bz-locmap__kpi" data-warn={warn ? 'yes' : undefined}>
      <span className="bz-locmap__kpi-label">{label}</span>
      <strong className="bz-locmap__kpi-value">{value}</strong>
      {hint && <span className="bz-locmap__kpi-hint">{hint}</span>}
    </div>
  );
}

/**
 * أنماط الخريطة. النمط (`background-image`) هو ما يحمل المعنى مع الرمز، واللون
 * طبقةٌ ثالثة لا وحيدة — فالتظليل يبقى على الطابعة أحاديّة اللون.
 */
const MAP_CSS = `
.bz-locmap { font-size: var(--o-font-size-sm); color: var(--o-main-text-color); }

.bz-locmap__bar { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; margin-bottom:14px; }
.bz-locmap__field { display:flex; flex-direction:column; gap:4px; min-width:150px; }
.bz-locmap__field--grow { flex:1 1 220px; }
.bz-locmap__field > span { font-size:var(--o-font-size-xs); color:var(--o-main-color-muted); }
.bz-locmap__check { display:flex; align-items:center; gap:6px; padding-bottom:6px; }

.bz-locmap__kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }
.bz-locmap__kpi { background:var(--o-view-background); border:1px solid var(--o-border-color);
  border-radius:var(--o-border-radius); padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
.bz-locmap__kpi[data-warn="yes"] { border-color:var(--o-text-danger); }
.bz-locmap__kpi-label { font-size:var(--o-font-size-xs); color:var(--o-main-color-muted); }
.bz-locmap__kpi-value { font-size:20px; font-weight:700; }
.bz-locmap__kpi[data-warn="yes"] .bz-locmap__kpi-value { color:var(--o-text-danger); }
.bz-locmap__kpi-hint { font-size:var(--o-font-size-xs); color:var(--o-main-color-muted); }

.bz-locmap__legend { display:flex; flex-wrap:wrap; gap:14px; padding:10px 12px; border:1px solid var(--o-border-color);
  border-radius:var(--o-border-radius); background:var(--o-sheet-background); }
.bz-locmap__legend-item { display:inline-flex; align-items:center; gap:6px; font-size:var(--o-font-size-xs); }
.bz-locmap__note { font-size:var(--o-font-size-xs); color:var(--o-main-color-muted); margin:6px 0 16px; }

.bz-locmap__swatch { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;
  border-radius:var(--o-border-radius-sm); border:1px solid var(--o-gray-400); font-size:12px; line-height:1; }

.bz-locmap__wh { margin-bottom:22px; }
.bz-locmap__wh-title { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700; margin:0 0 10px;
  padding-bottom:6px; border-bottom:1px solid var(--o-border-color); }
.bz-locmap__wh-title small, .bz-locmap__zone-title small { font-weight:400; color:var(--o-main-color-muted); font-size:var(--o-font-size-xs); }
.bz-locmap__zone { margin:0 0 14px; padding-inline-start:6px; border-inline-start:2px solid var(--o-gray-200); }
.bz-locmap__zone-title { display:flex; align-items:center; gap:6px; font-size:var(--o-font-size-base); font-weight:600; margin:0 0 8px; }
.bz-locmap__rack { display:flex; align-items:flex-start; gap:10px; margin-bottom:8px; }
.bz-locmap__rack-label { min-width:52px; padding-top:6px; font-family:monospace; font-size:var(--o-font-size-xs);
  color:var(--o-main-color-muted); }
.bz-locmap__cells { display:flex; flex-wrap:wrap; gap:6px; }

.bz-locmap__cell { width:78px; min-height:62px; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:1px; padding:4px; cursor:pointer; border:1px solid var(--o-gray-400); border-radius:var(--o-border-radius);
  background-color:var(--o-white); background-repeat:repeat; font-family:inherit; color:inherit; text-align:center; }
.bz-locmap__cell:hover { box-shadow:var(--o-shadow-card-hover); }
.bz-locmap__cell[aria-pressed="true"] { outline:2px solid var(--o-brand-primary); outline-offset:1px; }
.bz-locmap__cell-sym { font-size:14px; line-height:1; }
.bz-locmap__cell-code { font-family:monospace; font-size:11px; font-weight:700; }
.bz-locmap__cell-qty { font-family:monospace; font-size:10px; color:var(--o-main-color-muted); }

/* الحالات: لونٌ + نمطٌ + (الرمز في الترميز نفسه) — ثلاثُ طبقاتٍ لا واحدة. */
.bz-locmap__cell[data-state="empty"], .bz-locmap__swatch[data-state="empty"] {
  background-color:var(--o-badge-success-bg); border-color:var(--o-text-success); color:var(--o-text-success); }
.bz-locmap__cell[data-state="occupied"], .bz-locmap__swatch[data-state="occupied"] {
  background-color:var(--o-badge-info-bg); border-color:var(--o-text-info); color:var(--o-text-info);
  background-image:radial-gradient(var(--o-text-info) 1px, transparent 1px); background-size:7px 7px; }
.bz-locmap__cell[data-state="full"], .bz-locmap__swatch[data-state="full"] {
  background-color:var(--o-gray-300); border-color:var(--o-gray-600); color:var(--o-gray-900); }
.bz-locmap__cell[data-state="reserved"], .bz-locmap__swatch[data-state="reserved"] {
  background-color:var(--o-badge-draft-bg); border-color:var(--o-brand-primary); color:var(--o-brand-primary);
  background-image:repeating-linear-gradient(45deg, transparent 0 5px, rgba(113,75,103,.22) 5px 10px); }
.bz-locmap__cell[data-state="stopped"], .bz-locmap__swatch[data-state="stopped"] {
  background-color:var(--o-badge-danger-bg); border-color:var(--o-text-danger); color:var(--o-text-danger);
  background-image:repeating-linear-gradient(45deg, transparent 0 5px, rgba(210,63,58,.20) 5px 10px),
                   repeating-linear-gradient(-45deg, transparent 0 5px, rgba(210,63,58,.20) 5px 10px); }
.bz-locmap__cell[data-state="maintenance"], .bz-locmap__swatch[data-state="maintenance"] {
  background-color:var(--o-badge-warning-bg); border-color:var(--o-text-warning); color:var(--o-text-warning);
  background-image:repeating-linear-gradient(0deg, transparent 0 5px, rgba(154,107,1,.20) 5px 10px),
                   repeating-linear-gradient(90deg, transparent 0 5px, rgba(154,107,1,.20) 5px 10px); }
.bz-locmap__cell[data-state="archived"], .bz-locmap__swatch[data-state="archived"] {
  background-color:var(--o-gray-100); border-style:dashed; border-color:var(--o-gray-500); color:var(--o-gray-600); }

/* التنبيه وحده يستحقّ إطارًا أحمر عريضًا — لا حالةٌ عاديّة. */
.bz-locmap__cell[data-alert="yes"] { box-shadow:inset 0 0 0 2px var(--o-text-danger); }

.bz-locmap__detail { margin-top:14px; padding:12px; border:1px solid var(--o-border-color);
  border-radius:var(--o-border-radius); background:var(--o-view-background); }
.bz-locmap__detail-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.bz-locmap__detail-head button { margin-inline-start:auto; }
.bz-locmap__mono { font-family:monospace; }
.bz-locmap__dl { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; margin:0; }
.bz-locmap__dl dt { color:var(--o-main-color-muted); font-size:var(--o-font-size-xs); }
.bz-locmap__dl dd { margin:0; }
.bz-locmap__alert { margin-top:10px; }
.bz-locmap__orphans { margin-top:16px; }
.bz-locmap__orphan-list { margin:6px 0 0; padding-inline-start:18px; }

@media print {
  .bz-locmap .o_no_print { display:none !important; }
  .bz-locmap__cell { break-inside:avoid; }
  .bz-locmap__wh { break-inside:avoid-page; }
}
`;
