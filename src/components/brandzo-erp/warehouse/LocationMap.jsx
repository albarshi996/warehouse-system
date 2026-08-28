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
import {
  MAP_LEGEND,
  WORK_LEGEND,
  applyWorkLayer,
  buildLocationGrid,
  summarizeWork,
  warehouseCodesOf,
} from '../../../services/locations/mapGrid.js';
import { listenLaborTasks } from '../../../services/labor/laborTasksService.js';
// ‹LPN-211› طبقةُ الطبالي — الاتجاه واحد: الشاشة تقرأ `lpn/`، و`locations/`
// لا تعرفها (ح-٢، حارسُه `lpnIsolation.test.js`).
import {
  ON_FLOOR_STATES,
  PALLET_LEGEND,
  binSummary,
  binsOfItem,
  palletCellOf,
  palletsByBin,
  unexpectedPlacements,
} from '../../../services/lpn/palletMap.js';
import { listUnitsByState } from '../../../services/lpn/lpnService.js';

const n = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

/**
 * ‹LPN-211› سقفُ الجلب لكلّ حالةٍ من حالات «على الأرض».
 *
 * السقفُ لازمٌ (استعلامٌ بلا حدٍّ يقرأ المجموعة كلّها على Spark)، **ويُعلَن
 * حين يُبلَغ** — فخريطةٌ ناقصةٌ تبدو كاملةً أسوأ من خريطةٍ تقول إنّها ناقصة.
 */
const UNITS_PER_STATE = 300;

export default function LocationMap() {
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [storageType, setStorageType] = useState('');
  const [term, setTerm] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState(null);
  // ‹EXE-803› طبقةٌ ثانية على الشبكة نفسها — لا خريطةٌ ثانية ولا رابطٌ جديد.
  const [layer, setLayer] = useState('capacity');
  const [tasks, setTasks] = useState([]);
  // ‹LPN-211› الطبالي الواقفة — تُجلب بحالاتها المصدَّرة لا بقائمةٍ ثانيةٍ هنا.
  const [units, setUnits] = useState([]);
  const [itemTerm, setItemTerm] = useState('');

  useEffect(() => listenLocations(setLocations, () => setLocations([])), []);
  useEffect(() => listenBalances(setBalances, () => setBalances([])), []);
  useEffect(() => listenLaborTasks(setTasks, () => setTasks([])), []);

  // الجلبُ عند فتح الطبقة وحدها — الخريطة تُفتح للسعة في أغلب الأحيان،
  // وقراءةُ كلّ الطبالي في كلّ فتحةٍ ثمنٌ بلا مقابل.
  useEffect(() => {
    if (layer !== 'pallets') return undefined;
    let alive = true;
    Promise.all(ON_FLOOR_STATES.map((st) => listUnitsByState(st, UNITS_PER_STATE)))
      .then((rows) => { if (alive) setUnits(rows.flat()); })
      .catch(() => { if (alive) setUnits([]); });
    return () => { alive = false; };
  }, [layer]);

  const warehouseCodes = useMemo(() => warehouseCodesOf(locations), [locations]);
  const grid = useMemo(
    // الشبكة تُبنى مرّةً ثمّ **تُلحق** بها طبقة العمل — لا بناءٌ ثانٍ.
    () => applyWorkLayer(
      buildLocationGrid(locations, balances, { warehouse, storageType, term, includeArchived }),
      tasks
    ),
    [locations, balances, warehouse, storageType, term, includeArchived, tasks]
  );
  const work = useMemo(() => summarizeWork(grid.cells), [grid]);
  const showWork = layer === 'work';
  const showPallets = layer === 'pallets';

  // ‹LPN-211› الفهرسُ يُشتقّ ولا يُخزَّن — حقلٌ على الموقع كان سيفترق عن
  // الحقيقة أوّلَ نقلةٍ لم تُحدّثه، وهو ما يجعل الخرائط تكذب.
  const byBin = useMemo(() => palletsByBin(units), [units]);
  const palletCells = useMemo(() => {
    const map = new Map();
    for (const c of grid.cells) map.set(c.code, palletCellOf(binSummary(units, c.code)));
    return map;
  }, [grid.cells, units]);
  const palletTotals = useMemo(() => {
    let onGrid = 0;
    let offGrid = 0;
    for (const [bin, here] of byBin) {
      if (palletCells.has(bin)) onGrid += here.length;
      else offGrid += here.length;
    }
    return { total: units.length, onGrid, offGrid, bins: byBin.size };
  }, [byBin, palletCells, units]);
  const strays = useMemo(
    () => (showPallets ? unexpectedPlacements(units, locations) : []),
    [showPallets, units, locations]
  );
  const itemHits = useMemo(
    () => (showPallets && itemTerm.trim() ? binsOfItem(units, itemTerm) : []),
    [showPallets, itemTerm, units]
  );
  // «لا حدَّ صامت»: الجلبُ مسقوفٌ لكلّ حالة، والسقفُ يُعلَن حين يُبلَغ.
  const capped = showPallets && ON_FLOOR_STATES.some(
    (st) => units.filter((u) => u.state === st).length >= UNITS_PER_STATE
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

      {/* ── مبدّل الطبقة ‹EXE-803› — شبكةٌ واحدة، وما يُلوَّن به يتبدّل ── */}
      <div className="bz-locmap__legend o_no_print" aria-label="طبقة العرض">
        {[
          ['capacity', 'السعة والإشغال'],
          ['work', 'تقدّم العمل'],
          ['pallets', 'الطبالي الواقفة'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="btn btn-secondary"
            aria-pressed={layer === id}
            style={layer === id ? { fontWeight: 800, borderColor: 'var(--o-brand-primary)' } : undefined}
            onClick={() => setLayer(id)}
          >
            {label}
          </button>
        ))}
        {showWork && (
          <span className="bz-locmap__note" style={{ margin: 0 }}>
            {work.locations} موقعًا فيه عمل · أُنجز {n(work.done)} من {n(work.required)}
            {work.pct === null ? '' : ` (${work.pct}%)`}
            {work.stalled.length ? ` · متعثّر في ${work.stalled.length} موقعًا` : ''}
          </span>
        )}
        {showPallets && (
          <span className="bz-locmap__note" style={{ margin: 0 }}>
            {n(palletTotals.total)} طبليةً واقفةً في {n(palletTotals.bins)} موقعًا
            {palletTotals.offGrid > 0 && ` · ${n(palletTotals.offGrid)} خارج المرشّحات الحالية`}
            {capped && ' · ⚠ بلغ سقفُ الجلب — المعروض ليس كلّ الطبالي'}
          </span>
        )}
      </div>

      {/* ── البحثُ المعكوس ‹LPN-211›: أين يقف هذا الصنف؟ ─────────────── */}
      {showPallets && (
        <div className="bz-locmap__bar o_no_print" style={{ marginTop: 0 }}>
          <label className="bz-locmap__field bz-locmap__field--grow">
            <span>أين يقف هذا الصنف؟ (كودُ صنفٍ أو باركود)</span>
            <input
              className="o_input"
              value={itemTerm}
              onChange={(e) => setItemTerm(e.target.value)}
              placeholder="مثال: WNW-001"
            />
          </label>
        </div>
      )}
      {showPallets && itemTerm.trim() && (
        itemHits.length === 0 ? (
          <div className="o_alert">
            لا طبليةَ واقفةٌ تحمل «{itemTerm.trim()}». وقد يكون له رصيدٌ بلا طبلية — الطبقةُ تعرض الحمولة لا الرصيد.
          </div>
        ) : (
          <div className="bz-locmap__hits">
            <strong>{n(itemHits.length)} موقعًا يحمل «{itemTerm.trim()}»</strong>
            <ul className="bz-locmap__orphan-list">
              {itemHits.map((h) => (
                <li key={h.bin}>
                  <button
                    type="button"
                    className="btn btn-link bz-locmap__mono"
                    onClick={() => setSelected(h.bin)}
                  >
                    {h.bin}
                  </button>
                  {' — '}{n(h.qty)} وحدة في {n(h.pallets.length)} طبليةً
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* ── المفتاح ───────────────────────────────────────────────── */}
      <div className="bz-locmap__legend" aria-label="مفتاح الخريطة">
        {(showPallets ? PALLET_LEGEND : showWork ? WORK_LEGEND : MAP_LEGEND).map((s) => (
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
                      {rack.cells.map((c) => {
                        const pal = palletCells.get(c.code);
                        const state = showPallets ? `pallet-${pal?.state ?? 'none'}`
                          : showWork ? `work-${c.work.state}` : c.state;
                        const warn = showPallets ? Boolean(pal?.warn)
                          : showWork ? c.work.warn : c.alerts.length > 0;
                        const text = showPallets ? `${c.code} · ${pal?.summaryText ?? 'بلا طبالي'}`
                          : showWork ? `${c.code} · ${c.work.summaryText}` : c.summaryText;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            className="bz-locmap__cell"
                            data-state={state}
                            data-alert={warn ? 'yes' : undefined}
                            aria-pressed={selected === c.code}
                            aria-label={text}
                            title={text}
                            onClick={() => setSelected(selected === c.code ? null : c.code)}
                          >
                            <span className="bz-locmap__cell-sym" aria-hidden="true">
                              {showPallets ? (pal?.symbol ?? '·') : showWork ? c.work.symbol : c.symbol}
                            </span>
                            <span className="bz-locmap__cell-code">{c.shortLabel}</span>
                            <span className="bz-locmap__cell-qty">
                              {showPallets
                                ? (pal?.countText ?? '—')
                                : showWork
                                  ? (c.work.required ? `${n(c.work.done)}/${n(c.work.required)}` : '—')
                                  : c.occupancy.capacityQty === null
                                    ? n(c.occupancy.usedQty)
                                    : `${n(c.occupancy.usedQty)}/${n(c.occupancy.capacityQty)}`}
                            </span>
                          </button>
                        );
                      })}
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

          {/* ── ‹LPN-211› ماذا في هذا الرفّ؟ ───────────────────────── */}
          {showPallets && (() => {
            const bs = binSummary(units, cell.code);
            if (bs.count === 0) {
              return (
                <p className="bz-locmap__note">
                  لا طبليةَ واقفةٌ هنا. والرصيدُ أعلاه يُقرأ من الدفتر — فالحمولة طبقةٌ فوقه لا بديلٌ عنه.
                </p>
              );
            }
            return (
              <div className="bz-locmap__pallets">
                <strong>
                  {n(bs.count)} طبليةً · {n(bs.itemCount)} صنفًا · {n(bs.totalQty)} وحدة
                  {bs.blocked > 0 && ` · ${n(bs.blocked)} موسومة`}
                  {bs.mixed > 0 && ` · ${n(bs.mixed)} مخلوطة`}
                </strong>
                <ul className="bz-locmap__pallet-list">
                  {bs.pallets.map((p) => (
                    <li key={p.code} data-warn={p.flags.length ? 'yes' : undefined}>
                      <span className="bz-locmap__mono">{p.code}</span>
                      <span className="bz-locmap__pallet-state">{p.stateLabel}</span>
                      <span>{n(p.itemCount)} صنفًا · {n(p.totalQty)} وحدة</span>
                      {p.isMixed && <span className="bz-locmap__tag">مخلوطة</span>}
                      {p.flagLabels.map((f) => (
                        <span key={f} className="bz-locmap__tag" data-danger="yes">{f}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── ‹LPN-211› حمولةٌ في موضعٍ غير متوقّع — مقاسٌ لا مظنون ───── */}
      {showPallets && strays.length > 0 && (
        <div className="o_alert danger bz-locmap__orphans">
          <div className="o_alert_title">
            <Icon name="alertTriangle" size={16} /> {n(strays.length)} موقعًا فيه حمولةٌ لا ينبغي أن تقف فيه
          </div>
          <p>
            إمّا رفٌّ لا يعرفه سيّد المواقع، أو رفٌّ أُخرج من الخدمة ونُسيت فيه حمولة — وكلاهما يحتاج إنسانًا.
          </p>
          <ul className="bz-locmap__orphan-list">
            {strays.slice(0, 12).map((o) => (
              <li key={o.bin}>
                {o.reason} — {n(o.pallets.length)} طبليةً ({o.pallets.slice(0, 3).join('، ')}
                {o.pallets.length > 3 ? '…' : ''})
              </li>
            ))}
          </ul>
          {strays.length > 12 && <p>… و{n(strays.length - 12)} موقعًا آخر.</p>}
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

/* ‹EXE-803› طبقة العمل — النمط نفسه: لونٌ + نمطٌ + رمزٌ في الترميز. */
.bz-locmap__cell[data-state="work-idle"], .bz-locmap__swatch[data-state="idle"] {
  background-color:var(--o-gray-100); border-color:var(--o-gray-400); color:var(--o-gray-600); }
.bz-locmap__cell[data-state="work-waiting"], .bz-locmap__swatch[data-state="waiting"] {
  background-color:var(--o-badge-draft-bg); border-color:var(--o-brand-primary); color:var(--o-brand-primary);
  background-image:repeating-linear-gradient(45deg, transparent 0 5px, rgba(113,75,103,.22) 5px 10px); }
.bz-locmap__cell[data-state="work-active"], .bz-locmap__swatch[data-state="active"] {
  background-color:var(--o-badge-info-bg); border-color:var(--o-text-info); color:var(--o-text-info);
  background-image:radial-gradient(var(--o-text-info) 1px, transparent 1px); background-size:7px 7px; }
.bz-locmap__cell[data-state="work-done"], .bz-locmap__swatch[data-state="done"] {
  background-color:var(--o-badge-success-bg); border-color:var(--o-text-success); color:var(--o-text-success); }
.bz-locmap__cell[data-state="work-stalled"], .bz-locmap__swatch[data-state="stalled"] {
  background-color:var(--o-badge-danger-bg); border-color:var(--o-text-danger); color:var(--o-text-danger);
  background-image:repeating-linear-gradient(45deg, transparent 0 5px, rgba(210,63,58,.20) 5px 10px),
                   repeating-linear-gradient(-45deg, transparent 0 5px, rgba(210,63,58,.20) 5px 10px); }

/* ‹LPN-211› طبقة الطبالي — النمط نفسه: لونٌ + نمطٌ + رمزٌ في الترميز. */
.bz-locmap__cell[data-state="pallet-none"], .bz-locmap__swatch[data-state="none"] {
  background-color:var(--o-gray-100); border-color:var(--o-gray-400); color:var(--o-gray-600); }
.bz-locmap__cell[data-state="pallet-stored"], .bz-locmap__swatch[data-state="stored"] {
  background-color:var(--o-badge-success-bg); border-color:var(--o-text-success); color:var(--o-text-success); }
.bz-locmap__cell[data-state="pallet-busy"], .bz-locmap__swatch[data-state="busy"] {
  background-color:var(--o-badge-info-bg); border-color:var(--o-text-info); color:var(--o-text-info);
  background-image:repeating-linear-gradient(45deg, transparent 0 5px, rgba(23,115,160,.20) 5px 10px); }
.bz-locmap__cell[data-state="pallet-mixed"], .bz-locmap__swatch[data-state="mixed"] {
  background-color:var(--o-badge-warning-bg); border-color:var(--o-text-warning); color:var(--o-text-warning);
  background-image:repeating-linear-gradient(45deg, transparent 0 5px, rgba(153,102,0,.18) 5px 10px),
                   repeating-linear-gradient(-45deg, transparent 0 5px, rgba(153,102,0,.18) 5px 10px); }
.bz-locmap__cell[data-state="pallet-held"], .bz-locmap__swatch[data-state="held"] {
  background-color:var(--o-badge-danger-bg); border-color:var(--o-text-danger); color:var(--o-text-danger);
  background-image:radial-gradient(var(--o-text-danger) 1.2px, transparent 1.2px); background-size:6px 6px; }

/* قائمةُ طبالي الخانة المختارة والبحثُ المعكوس. */
.bz-locmap__pallets { margin-top:10px; }
.bz-locmap__hits { margin:8px 0 12px; padding:10px 12px; border:1px solid var(--o-border-color);
  border-radius:var(--o-border-radius); background:var(--o-view-background); }
.bz-locmap__pallet-list { list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:5px; }
.bz-locmap__pallet-list > li { display:flex; flex-wrap:wrap; align-items:center; gap:8px;
  padding:6px 8px; border:1px solid var(--o-border-color); border-radius:var(--o-border-radius);
  background:var(--o-gray-100); }
.bz-locmap__pallet-list > li[data-warn="yes"] { border-color:var(--o-text-danger); background:var(--o-badge-danger-bg); }
.bz-locmap__pallet-state { font-size:var(--o-font-size-xs); color:var(--o-main-color-muted); }
.bz-locmap__tag { font-size:var(--o-font-size-xs); padding:1px 7px; border-radius:999px;
  border:1px solid var(--o-text-warning); color:var(--o-text-warning); }
.bz-locmap__tag[data-danger="yes"] { border-color:var(--o-text-danger); color:var(--o-text-danger); }

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
