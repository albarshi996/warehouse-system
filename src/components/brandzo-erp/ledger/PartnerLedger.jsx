/**
 * كشوف الحساب وأعمار الديون (م٤-هـ · وبها تكتمل م‑٤).
 *
 * الرقم بلا مرجعٍ لا يُعرض: كلّ سطرٍ هنا يحمل مستنده وتاريخه واتّجاهه ورصيده
 * المتراكم. فإن اختلفتَ مع عميلٍ على مئة دينار، هذا ما تفتحه أمامه.
 *
 * بنية ٣ طبقات: من يستحقّ الانتباه · أرصدة الأطراف · كشف الطرف المختار.
 * الوصول: المديران والمالي والخزينة — والمندوب يرى مديونيّة عملائه في م‑٥.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenPartnerLedger } from '../../../services/ledger/partnerLedgerService.js';
import { subscribePartners } from '../../../services/partners/partnerService.js';
import { listenSettings } from '../../../services/settings/settingsService.js';
import { statement, balances, aging, AGING_BUCKETS, PARTIES, invoiceOutstanding } from '../../../services/ledger/partnerLedger.js';
import { customerExposure } from '../../../services/ledger/creditGuard.js';

// المندوب محصِّلٌ — من يُحاسَب على ذمم عملائه يجب أن يراها قبل أن يبيع.
const VIEWER_ROLES = ['admin', 'warehouse_manager', 'finance_manager', 'treasury', 'sales_rep'];

const input = 'bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip';
const card = 'rounded-xl border border-line bg-surface p-4';

const STATEMENT_COLUMNS = [
  { key: 'date', label: 'التاريخ' },
  { key: 'docNumber', label: 'المستند' },
  { key: 'labelAr', label: 'البيان' },
  { key: 'debit', label: 'مدين' },
  { key: 'credit', label: 'دائن' },
  // ما قاصّه السند من فواتير مسمّاة — كانت تُكتب ولا تُعرض لأحد.
  { key: 'allocations', label: 'قاصَّ' },
  { key: 'balance', label: 'الرصيد' },
];

const cellOf = (r, key) => {
  if (key === 'debit') return r.direction === 'debit' ? r.amount : '';
  if (key === 'credit') return r.direction === 'credit' ? r.amount : '';
  if (key === 'allocations') {
    return (r.allocations || []).map((a) => `${a.ref} (${a.amount})`).join(' · ');
  }
  return String(r[key] ?? '');
};

/** تصدير CSV — الرقم رقمٌ والتاريخ تاريخ، بلا اعتمادٍ على مكتبة. */
function exportCsv(rows, columns, filename) {
  const head = columns.map((c) => c.label).join(',');
  const body = rows
    .map((r) => columns.map((c) => `"${String(cellOf(r, c.key)).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  // BOM صريحًا لا حرفًا خفيًّا: بدونه يفتح إكسل العربيّةَ طلاسمَ، ومعه حرفًا
  // غير مرئيّ في الشيفرة يصير لغزًا لمن يقرأ بعدنا.
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([`${BOM}${head}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PartnerLedger() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState([]);
  const [partners, setPartners] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [party, setParty] = useState('customer');
  const [selected, setSelected] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !VIEWER_ROLES.includes(me.role)) return undefined;
    const u1 = listenPartnerLedger('', setEntries, () => setEntries([]));
    const u2 = subscribePartners('customer', setPartners, () => setPartners([]));
    const u3 = subscribePartners('supplier', setSuppliers, () => setSuppliers([]));
    const u4 = listenSettings(setSettings);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [me]);

  const today = new Date().toISOString().slice(0, 10);
  const scoped = useMemo(() => entries.filter((e) => e.party === party), [entries, party]);
  const rows = useMemo(() => balances(scoped), [scoped]);
  const ageRows = useMemo(() => aging(scoped, today), [scoped, today]);
  const master = party === 'customer' ? partners : suppliers;
  const partner = useMemo(
    () => master.find((p) => String(p.code || '').toUpperCase() === selected) || null,
    [master, selected]
  );
  const view = useMemo(() => statement(scoped, { partyCode: selected }), [scoped, selected]);
  /** المفتوح فاتورةً فاتورة (CC-302) — قارئ allocations الأوّل. */
  const openInvoices = useMemo(
    () => (selected ? invoiceOutstanding(scoped, selected).filter((r) => Math.abs(r.remaining) > 0.009) : []),
    [scoped, selected]
  );
  const exposure = useMemo(
    () => (party === 'customer' && selected ? customerExposure({ entries: scoped, partner, partyCode: selected, settings }) : null),
    [party, selected, scoped, partner, settings]
  );

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!VIEWER_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">كشوف الحساب محصورةٌ بالمديرَين والمالي والخزينة.</p>;
  }

  const overdue = ageRows.filter((r) => r.buckets.over90 > 0);

  return (
    <div className="space-y-5">
      {/* ═══ الطبقة ١: من يستحقّ الانتباه ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">تدخّل الآن</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-ink-2">
            الدفتر فارغ — يُقيَّد تلقائيًّا عند إنجاز أوّل فاتورةٍ أو استلامٍ أو سند.
          </p>
        ) : overdue.length === 0 ? (
          <p className="text-sm text-ink">لا دَين تجاوز تسعين يومًا.</p>
        ) : (
          <ul className="space-y-2">
            {overdue.slice(0, 5).map((r) => (
              <li key={r.partyCode} className="text-sm text-brand-red">
                {r.partyName}: {r.buckets.over90} د.ل متأخّرةٌ أكثر من ٩٠ يومًا (من أصل {r.total})
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ═══ الطبقة ٢: أرصدة الأطراف وأعمارها ═══ */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select className={input} value={party} onChange={(e) => { setParty(e.target.value); setSelected(''); }}>
            {Object.values(PARTIES).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className={input} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">كلّ الأطراف</option>
            {rows.map((r) => <option key={r.partyCode} value={r.partyCode}>{r.partyName}</option>)}
          </select>
          <button className={btn} onClick={() => window.print()}>طباعة</button>
          <button
            className={btn}
            onClick={() => exportCsv(view.rows, STATEMENT_COLUMNS, `كشف-${selected || 'الكل'}.csv`)}
            disabled={view.rows.length === 0}
          >
            تصدير CSV
          </button>
        </div>

        {exposure && (
          <div className="grid gap-3 sm:grid-cols-4 text-sm mb-4">
            <div className="rounded-lg bg-chip border border-line p-3">
              <div className="text-ink-2 text-xs mb-1">الرصيد</div>
              <div className="text-ink text-lg">{exposure.balance}</div>
            </div>
            <div className="rounded-lg bg-chip border border-line p-3">
              <div className="text-ink-2 text-xs mb-1">سقف الائتمان</div>
              <div className="text-ink text-lg">{exposure.limit || 'غير مُدخَل'}</div>
            </div>
            <div className="rounded-lg bg-chip border border-line p-3">
              <div className="text-ink-2 text-xs mb-1">المتاح</div>
              <div className="text-ink text-lg">{exposure.available === null ? '—' : exposure.available}</div>
            </div>
            <div className="rounded-lg bg-chip border border-line p-3">
              <div className="text-ink-2 text-xs mb-1">المستهلَك</div>
              <div className={exposure.verdict === 'block' ? 'text-brand-red text-lg' : 'text-ink text-lg'}>
                {exposure.limit ? `${exposure.usedPct}٪` : '—'}
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-2 text-xs border-b border-line">
                <th className="text-right font-bold py-2 px-2">الطرف</th>
                <th className="text-right font-bold py-2 px-2">الرصيد</th>
                {AGING_BUCKETS.map((b) => (
                  <th key={b.key} className="text-right font-bold py-2 px-2 whitespace-nowrap">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const age = ageRows.find((a) => a.partyCode === r.partyCode);
                return (
                  <tr key={r.partyCode} className="border-b border-line/60 cursor-pointer" onClick={() => setSelected(r.partyCode)}>
                    <td className="py-2 px-2 text-ink">{r.partyName}</td>
                    <td className="py-2 px-2 text-ink">{r.balance}</td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className={b.key === 'over90' && age?.buckets[b.key] ? 'py-2 px-2 text-brand-red' : 'py-2 px-2 text-ink'}>
                        {age?.buckets[b.key] || ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══ المفتوح لكلّ فاتورة — قبل الكشف: هذا ما يوزَّع عليه التحصيل ═══ */}
      {selected && openInvoices.length ? (
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-1">الفواتير المفتوحة — {selected}</h2>
          <p className="text-xs text-ink-2 mb-3">
            المقاصّات المسمّاة تُطرح من فاتورتها لا من الأقدم — وسالبُ المتبقّي تحصيلٌ زائد يُراجَع.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 text-xs border-b border-line">
                  {['الفاتورة', 'الإجمالي', 'المسدَّد', 'المتبقّي'].map((h) => (
                    <th key={h} className="text-right font-bold py-2 px-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((r) => (
                  <tr key={r.ref} className="border-b border-line/60">
                    <td className="py-2 px-2 text-ink">{r.ref}</td>
                    <td className="py-2 px-2 text-ink">{r.total}</td>
                    <td className="py-2 px-2 text-ink">{r.paid}</td>
                    <td className={`py-2 px-2 ${r.remaining < 0 ? 'text-brand-red' : 'text-ink'}`}>{r.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ═══ الطبقة ٣: كشف الطرف ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">
          كشف الحساب {selected ? `— ${view.rows[0]?.partyName || selected}` : '— كلّ الأطراف'}
        </h2>
        <p className="text-xs text-ink-2 mb-3">
          الافتتاحيّ {view.opening} · مدين {view.debit} · دائن {view.credit} · المتبقّي{' '}
          <span className="text-ink font-bold">{view.closing}</span>
          {view.balanced ? '' : ' ⚠ الرصيد لا يطابق مجموع السطور'}
        </p>
        {view.rows.length === 0 ? (
          <p className="text-sm text-ink-2">لا بيانات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 text-xs border-b border-line">
                  {STATEMENT_COLUMNS.map((c) => (
                    <th key={c.key} className="text-right font-bold py-2 px-2 whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60">
                    {STATEMENT_COLUMNS.map((c) => (
                      <td key={c.key} className="py-2 px-2 text-ink">{cellOf(r, c.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
