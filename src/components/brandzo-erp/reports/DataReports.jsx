/**
 * شاشة التقارير الواحدة (ر‑٠ · يسدّ ف‑٧).
 *
 * **شاشةٌ واحدة لاثني عشر تقريرًا** — وللواحد والعشرين الباقية بعدها. تقرأ
 * التعريف وترسمه: فلاترَه وأعمدته ومجاميعه. فإضافة تقريرٍ ملفُّ تعريفٍ لا شاشة،
 * ولا تتباعد التقارير في منطق الفلترة والطباعة والتصدير.
 *
 * تحمل من معايير القبول الثمانية ثلاثة: الطباعة بالهوية · تصدير Excel بأعمدة
 * حقيقيّة · خمسة آلاف صفٍّ بلا تجميد. والباقي في المحرّك الخالص.
 *
 * بنية ٣ طبقات: اختيار التقرير · الفلاتر والمجاميع · الجدول.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { REPORTS, getReport } from '../../../services/reports/index.js';
import { runReport, reportsForRole, formatCell, exportRows } from '../../../services/reports/reportEngine.js';
import { listenRecentMoves } from '../../../services/ledger/ledgerService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenPartnerLedger } from '../../../services/ledger/partnerLedgerService.js';
import { subscribeItems } from '../../../services/itemService.js';

const input = 'bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const card = 'rounded-xl border border-line bg-surface p-4';

/** تصدير CSV يفتحه إكسل بأعمدةٍ حقيقيّة — الرقم رقمٌ والتاريخ تاريخ. */
function downloadCsv(rows, columns, filename) {
  const data = exportRows(rows, columns);
  const head = columns.map((c) => c.label).join(',');
  const body = data
    .map((r) => columns.map((c) => {
      const v = r[c.label];
      return typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`;
    }).join(','))
    .join('\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([`${BOM}${head}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function DataReports() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState('');
  const [filters, setFilters] = useState({});
  const [data, setData] = useState({ moves: [], balances: [], documents: [], ledger: [], items: [] });

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // مصادر البيانات الخمسة. كلٌّ منها يفشل إلى قائمةٍ فارغة — فتقريرٌ ناقص
  // البيانات يقول «لا بيانات» ولا يُسقط الشاشة.
  useEffect(() => {
    if (!me) return undefined;
    const set = (k) => (v) => setData((d) => ({ ...d, [k]: v || [] }));
    const subs = [
      listenRecentMoves(set('moves'), 5000),
      listenBalances(set('balances'), () => set('balances')([])),
      listenAllDocuments(set('documents'), 1000),
      listenPartnerLedger('', set('ledger'), () => set('ledger')([])),
      subscribeItems(set('items'), () => set('items')([])),
    ];
    return () => subs.forEach((u) => typeof u === 'function' && u());
  }, [me]);

  const groups = useMemo(() => reportsForRole(REPORTS, me?.role || ''), [me]);
  const def = useMemo(() => getReport(selected), [selected]);
  const today = new Date().toISOString().slice(0, 10);
  const result = useMemo(
    () => (def ? runReport(def, { ...data, today }, { ...filters, today }, { role: me?.role || '' }) : null),
    [def, data, filters, me, today]
  );

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (groups.length === 0) return <p className="text-sm text-ink-2">لا تقارير متاحةً لدورك.</p>;

  return (
    <div className="space-y-5">
      {/* ═══ الطبقة ١: اختيار التقرير ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">التقارير المتاحة لك</h2>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="text-xs text-ink-2 mb-2">{g.group}</div>
              <div className="flex flex-wrap gap-2">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    className={`rounded-lg px-3 py-2 text-sm border ${selected === it.id ? 'border-accent text-ink bg-chip' : 'border-line text-ink-2 bg-surface'}`}
                    onClick={() => { setSelected(it.id); setFilters({}); }}
                  >
                    {it.titleAr}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {def && result && (
        <>
          {/* ═══ الطبقة ٢: الفلاتر والمجاميع ═══ */}
          <section className={card}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-base font-bold text-ink">{def.titleAr}</h2>
              <div className="flex gap-2">
                <button className={btn} onClick={() => window.print()}>طباعة</button>
                <button
                  className={btn}
                  disabled={result.empty}
                  onClick={() => downloadCsv(result.rows, def.columns, `${def.titleAr}.csv`)}
                >
                  تصدير
                </button>
              </div>
            </div>
            {def.note ? <p className="text-xs text-ink-2 mb-3">{def.note}</p> : null}

            <div className="flex flex-wrap items-end gap-3 mb-4">
              {(def.filters || []).map((f) => (
                <label key={f.key} className="text-xs text-ink-2">
                  <span className="block mb-1">{f.label}</span>
                  {f.kind === 'select' ? (
                    <select className={input} value={filters[f.key] || ''} onChange={(e) => setFilter(f.key, e.target.value)}>
                      <option value="">الكلّ</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.kind === 'dateRange' ? (
                    <span className="flex gap-2">
                      <input className={input} type="date" value={filters[f.key]?.from || ''}
                        onChange={(e) => setFilter(f.key, { ...(filters[f.key] || {}), from: e.target.value })} />
                      <input className={input} type="date" value={filters[f.key]?.to || ''}
                        onChange={(e) => setFilter(f.key, { ...(filters[f.key] || {}), to: e.target.value })} />
                    </span>
                  ) : (
                    <input
                      className={input}
                      type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                      value={filters[f.key] || ''}
                      onChange={(e) => setFilter(f.key, e.target.value)}
                    />
                  )}
                </label>
              ))}
              {Object.keys(filters).length > 0 && (
                <button className={btn} onClick={() => setFilters({})}>مسح الفلاتر</button>
              )}
            </div>

            <p className="text-xs text-ink-2">
              {result.count} صفًّا
              {result.truncated ? ` — يُعرض منها ${result.rows.length} فقط، والمجاميع محسوبةٌ على الكلّ` : ''}
            </p>
          </section>

          {/* ═══ الطبقة ٣: الجدول ═══ */}
          <section className={card}>
            {result.empty ? (
              <p className="text-sm text-ink-2">{result.message}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-ink-2 text-xs border-b border-line">
                      {def.columns.map((c) => (
                        <th key={c.key} className="text-right font-bold py-2 px-2 whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={r.id || `${i}`} className="border-b border-line/60">
                        {def.columns.map((c) => (
                          <td key={c.key} className="py-2 px-2 text-ink whitespace-nowrap">
                            {formatCell(r[c.key], c.kind)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-bold">
                      {def.columns.map((c) => (
                        <td key={c.key} className="py-2 px-2 text-ink">
                          {c.sum ? formatCell(result.totals[c.key], c.kind) : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
