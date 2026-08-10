/**
 * لوحة المستودع المتنقّل — مخزون المركبات وتسوية نهاية الرحلة.
 *
 * تجيب عن ثلاثة أسئلةٍ لم يكن للنظام جوابٌ عليها: ماذا يحمل كلّ مندوبٍ الآن؟
 * وأيّ مركبةٍ تأخّرت عن التصفير؟ وهل يستقيم ميزان الرحلة حين نُقفلها؟
 *
 * بنية ٣ طبقات: تدخّل الآن · إجراءات · فهرس.
 * الوصول: المندوب ومشرفه والمديران (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenVanMoves } from '../../../services/vanSales/vanSalesService.js';
import { onVehicleBalances, vehiclePlateFromCode } from '../../../services/ledger/locations.js';
import { vanSettlement, settlementVerdict, VAN_FLOWS } from '../../../services/vanSales/settlement.js';

const VAN_ROLES = ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'];
const SUPERVISOR_ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];

/** مركبةٌ محمّلة منذ أكثر من هذا تُعدّ متأخّرة عن التصفير. */
const STALE_HOURS = 24;

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';

export default function VanOperations() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [balances, setBalances] = useState([]);
  const [moves, setMoves] = useState([]);
  const [plate, setPlate] = useState('');
  const [counted, setCounted] = useState({});
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('stock');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !VAN_ROLES.includes(me.role)) return undefined;
    return listenBalances(setBalances, (e) => setErr(e?.message || 'تعذّر الاتصال'));
  }, [me]);

  useEffect(() => {
    if (!plate) {
      setMoves([]);
      return undefined;
    }
    return listenVanMoves(plate, setMoves, (e) => setErr(e?.message || 'تعذّر قراءة الحركات'));
  }, [plate]);

  /** أرصدة المركبات كلّها، مجمّعةً بلوحةٍ لوحة. */
  const vans = useMemo(() => {
    const rows = onVehicleBalances(balances);
    const byPlate = new Map();
    for (const row of rows) {
      const p = row.plate || vehiclePlateFromCode(row.warehouse);
      const entry = byPlate.get(p) || { plate: p, lines: 0, qty: 0, value: 0, oldestMs: null, rows: [] };
      entry.lines += 1;
      entry.qty += Number(row.qty) || 0;
      entry.value += (Number(row.qty) || 0) * (Number(row.unitCost) || 0);
      const ms = row.updatedAt?.seconds ? row.updatedAt.seconds * 1000 : null;
      if (ms && (!entry.oldestMs || ms < entry.oldestMs)) entry.oldestMs = ms;
      entry.rows.push(row);
      byPlate.set(p, entry);
    }
    return [...byPlate.values()].sort((a, b) => b.qty - a.qty);
  }, [balances]);

  const stale = useMemo(() => {
    const cutoff = Date.now() - STALE_HOURS * 3600 * 1000;
    return vans.filter((v) => v.oldestMs && v.oldestMs < cutoff);
  }, [vans]);

  const selected = useMemo(() => vans.find((v) => v.plate === plate) || null, [vans, plate]);

  const settlement = useMemo(() => {
    if (!plate) return null;
    const countedRows = Object.entries(counted)
      .filter(([, v]) => String(v).trim() !== '')
      .map(([key, v]) => {
        const [sku, batch] = key.split('||');
        return { sku, batch, qty: Number(v) || 0 };
      });
    return vanSettlement({
      plate,
      moves,
      balances,
      counted: countedRows.length ? countedRows : null,
    });
  }, [plate, moves, balances, counted]);

  const verdict = useMemo(
    () => (settlement ? settlementVerdict({ settlement, supervisorApproved: false }) : null),
    [settlement]
  );

  const canSupervise = me && SUPERVISOR_ROLES.includes(me.role);

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!VAN_ROLES.includes(me.role)) return <Muted>هذه الشاشة لمندوبي المبيعات ومشرفيهم والمديرين.</Muted>;

  const totalQty = vans.reduce((s, v) => s + v.qty, 0);
  const totalValue = vans.reduce((s, v) => s + v.value, 0);

  return (
    <div className="space-y-6">
      {err ? (
        <div className="border border-red-500/40 bg-red-500/5 text-red-600 rounded-lg px-4 py-3 text-sm">{err}</div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="مركبات محمّلة الآن" value={vans.length} />
        <Kpi label="إجمالي الوحدات على المركبات" value={fmt(totalQty)} />
        <Kpi label="قيمة الحمولة" value={fmt(totalValue)} />
        <Kpi label={`متأخّرة عن التصفير (+${STALE_HOURS}س)`} value={stale.length} alert={stale.length > 0} />
      </div>

      {stale.length ? (
        <Section title="تدخّل الآن">
          <p className="text-sm text-ink-2 mb-3">
            هذه المركبات تحمل رصيدًا منذ أكثر من {STALE_HOURS} ساعة. بضاعةٌ على مركبةٍ بلا تسوية هي بضاعةٌ بلا
            عهدة — لا المستودع يطالب بها ولا المندوب مسؤول عنها.
          </p>
          <div className="flex flex-wrap gap-2">
            {stale.map((v) => (
              <button
                key={v.plate}
                type="button"
                onClick={() => setPlate(v.plate)}
                className="border border-red-500/40 bg-red-500/5 text-red-600 rounded-lg px-3 py-2 text-sm"
              >
                {v.plate} — {fmt(v.qty)} وحدة في {v.lines} بندًا
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="اختر مركبة">
        <div className="flex flex-wrap items-center gap-3">
          <select className={`${input} max-w-xs`} value={plate} onChange={(e) => { setPlate(e.target.value); setCounted({}); }}>
            <option value="">— اختر لوحة المركبة —</option>
            {vans.map((v) => (
              <option key={v.plate} value={v.plate}>
                {v.plate} ({fmt(v.qty)} وحدة)
              </option>
            ))}
          </select>
          {plate ? (
            <div className="flex gap-2">
              <Pill active={tab === 'stock'} onClick={() => setTab('stock')}>مخزون المركبة</Pill>
              <Pill active={tab === 'settle'} onClick={() => setTab('settle')}>تسوية الرحلة</Pill>
            </div>
          ) : null}
        </div>
        {!vans.length ? <Muted>لا مركبة تحمل رصيدًا الآن.</Muted> : null}
      </Section>

      {plate && tab === 'stock' && selected ? (
        <Section title={`مخزون المركبة ${plate}`}>
          <Table
            head={['الصنف', 'الدفعة', 'الصلاحية', 'الكمية', 'تكلفة الوحدة', 'القيمة']}
            rows={selected.rows.map((r) => [
              r.nameAr || r.sku || r.barcode,
              r.batch || '—',
              r.expiry || '—',
              fmt(r.qty),
              fmt(r.unitCost),
              fmt((Number(r.qty) || 0) * (Number(r.unitCost) || 0)),
            ])}
          />
        </Section>
      ) : null}

      {plate && tab === 'settle' && settlement ? (
        <Section title={`تسوية الرحلة — ${plate}`}>
          <p className="text-sm text-ink-2 mb-3">
            بداية + تحميل + مرتجع − مبيعات − إرجاع = المتوقّع. والمعدود يُقارَن بالدفتريّ لا بالمتوقّع:
            اختلاف المتوقّع عن الدفتريّ حركةٌ خارج نافذة الرحلة، واختلاف المعدود عن الدفتريّ عجزٌ حقيقيّ.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {['load', 'returnIn', 'sale', 'returnOut'].map((f) => (
              <Kpi key={f} label={VAN_FLOWS[f].labelAr} value={fmt(settlement.totals[f])} />
            ))}
            <Kpi label="المتبقّي دفتريًّا" value={fmt(settlement.totals.ledgerQty)} alert={!settlement.isClear} />
          </div>

          {verdict && !verdict.ok ? (
            <div className="border border-red-500/40 bg-red-500/5 rounded-lg px-4 py-3 mb-4">
              <div className="text-sm text-red-600 font-medium mb-1">لا تُقفل الرحلة بعد</div>
              <ul className="text-sm text-red-600 list-disc pr-5 space-y-1">
                {verdict.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          ) : null}

          {verdict?.warnings?.length ? (
            <div className="border border-line bg-chip rounded-lg px-4 py-3 mb-4">
              <ul className="text-sm text-ink-2 list-disc pr-5 space-y-1">
                {verdict.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 border-b border-line">
                  {['الصنف', 'الدفعة', 'بداية', 'تحميل', 'مرتجع', 'مبيعات', 'إرجاع', 'متوقّع', 'دفتريّ', 'معدود', 'الفرق'].map((h) => (
                    <th key={h} className="text-right py-2 px-2 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settlement.rows.map((r) => {
                  const key = `${r.sku}||${r.batch}`;
                  const variance = r.variance;
                  return (
                    <tr key={r.key} className="border-b border-line/50">
                      <td className="py-2 px-2">{r.nameAr || r.sku || r.barcode}</td>
                      <td className="py-2 px-2">{r.batch || '—'}</td>
                      <td className="py-2 px-2">{fmt(r.opening)}</td>
                      <td className="py-2 px-2">{fmt(r.load)}</td>
                      <td className="py-2 px-2">{fmt(r.returnIn)}</td>
                      <td className="py-2 px-2">{fmt(r.sale)}</td>
                      <td className="py-2 px-2">{fmt(r.returnOut)}</td>
                      <td className="py-2 px-2">{fmt(r.expected)}</td>
                      <td className={`py-2 px-2 ${Math.abs(r.drift) > 0.0001 ? 'text-red-600' : ''}`}>{fmt(r.ledgerQty)}</td>
                      <td className="py-2 px-2">
                        {canSupervise ? (
                          <input
                            className="w-20 bg-chip border border-line rounded px-2 py-1 text-sm text-ink"
                            inputMode="decimal"
                            value={counted[key] ?? ''}
                            onChange={(e) => setCounted((c) => ({ ...c, [key]: e.target.value }))}
                            placeholder="—"
                          />
                        ) : (
                          <span className="text-ink-2">—</span>
                        )}
                      </td>
                      <td className={`py-2 px-2 ${variance !== undefined && Math.abs(variance) > 0.0001 ? 'text-red-600' : ''}`}>
                        {variance === undefined ? '—' : fmt(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!settlement.rows.length ? <Muted>لا حركة لهذه المركبة بعد.</Muted> : null}
          {!canSupervise ? (
            <p className="text-xs text-ink-2 mt-3">إدخال الجرد الفعليّ للمشرف — لا يعتمد أحدٌ فرق نفسه.</p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="border border-line rounded-xl p-4">
      <h2 className="text-base text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, alert }) {
  return (
    <div className={`border rounded-xl p-3 ${alert ? 'border-red-500/40 bg-red-500/5' : 'border-line bg-chip'}`}>
      <div className="text-xs text-ink-2 mb-1">{label}</div>
      <div className={`text-xl ${alert ? 'text-red-600' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm border ${active ? 'border-accent text-ink bg-chip' : 'border-line text-ink-2'}`}
    >
      {children}
    </button>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-2 border-b border-line">
            {head.map((h) => <th key={h} className="text-right py-2 px-2 font-normal whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/50">
              {r.map((c, j) => <td key={j} className="py-2 px-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Muted({ children }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}

/** أرقام لاتينية بفاصلةٍ عشرية عند الحاجة — بلا أصفارٍ زائدة. */
function fmt(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
