/**
 * بضاعة العملاء — ما لدى كلّ تاجرٍ من أمانتنا، وما يوشك أن يصير خسارة.
 *
 * هذه الشاشة هي جواب السؤال الذي بُني عليه النظام كلّه: «بعنا للموزّع ثمّ فقدنا
 * الرؤية». هنا نراها — بالتشغيلة والصلاحية ومدّة الحماية المتبقّية.
 *
 * بنية ٣ طبقات: تدخّل الآن · إجراءات · فهرس.
 * الوصول: المندوب ومشرفه والمديران (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { atCustomerBalances } from '../../../services/ledger/locations.js';
import { listenPolicies, savePolicies, emptyPolicies } from '../../../services/protection/protectionService.js';
import {
  PROTECTION_POLICIES,
  customerStockAlerts,
  customerStockSummary,
  policyFor,
  policyVerdict,
} from '../../../services/protection/protectionModel.js';

const ROLES = ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'];
const EDITOR_ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';

const today = () => new Date().toISOString().slice(0, 10);

export default function CustomerStock() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [balances, setBalances] = useState([]);
  const [policies, setPolicies] = useState(emptyPolicies());
  const [tab, setTab] = useState('alerts');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !ROLES.includes(me.role)) return undefined;
    const fail = (e) => setErr(e?.message || 'تعذّر الاتصال');
    const u1 = listenBalances(setBalances, fail);
    const u2 = listenPolicies(setPolicies, fail);
    return () => {
      u1();
      u2();
    };
  }, [me]);

  const rows = useMemo(() => atCustomerBalances(balances), [balances]);
  const alerts = useMemo(() => customerStockAlerts(rows, policies, { asOf: today() }), [rows, policies]);
  const summary = useMemo(() => customerStockSummary(rows, policies, { asOf: today() }), [rows, policies]);

  const byCustomer = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const e = m.get(r.customerCode) || { code: r.customerCode, lines: 0, qty: 0, value: 0 };
      e.lines += 1;
      e.qty += Number(r.qty) || 0;
      e.value += (Number(r.qty) || 0) * (Number(r.unitCost) || 0);
      m.set(r.customerCode, e);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (r) => String(r.customerCode).includes(q) || String(r.sku || '').toUpperCase().includes(q) || String(r.nameAr || '').includes(filter.trim())
    );
  }, [rows, filter]);

  const canEdit = me && EDITOR_ROLES.includes(me.role);

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!ROLES.includes(me.role)) return <Muted>هذه الشاشة لمندوبي المبيعات ومشرفيهم والمديرين.</Muted>;

  return (
    <div className="space-y-5">
      {err ? <Banner tone="bad">{err}</Banner> : null}
      {msg ? <Banner tone="ok">{msg}</Banner> : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="عملاء لديهم أمانة" value={summary.customers} />
        <Kpi label="إجمالي الوحدات" value={summary.totalQty} />
        <Kpi label="قيمة الأمانة" value={Math.round(summary.totalValue)} />
        <Kpi label="منتهي الصلاحية" value={summary.expired} alert={summary.expired > 0} />
        <Kpi label="يقارب الانتهاء" value={summary.near} alert={summary.near > 0} />
      </div>

      {alerts.length ? (
        <Section title="تدخّل الآن — استردّ قبل أن تصير خسارة">
          <p className="text-sm text-ink-2 mb-3">
            بضاعةٌ عند تاجرٍ تنتهي بعد أسبوعين يمكن استردادها اليوم وبيعها في مكانٍ آخر — وبعد أسبوعين تصير خسارةً كاملة.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 border-b border-line">
                  {['العميل', 'الصنف', 'الدفعة', 'الكمية', 'الصلاحية', 'السياسة', 'التنبيه'].map((h) => (
                    <th key={h} className="text-right py-2 px-2 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 60).map((a, i) => (
                  <tr key={`${a.customerCode}-${a.sku}-${a.batch}-${i}`} className="border-b border-line/50">
                    <td className="py-2 px-2">{a.customerCode}</td>
                    <td className="py-2 px-2">{a.nameAr || a.sku}</td>
                    <td className="py-2 px-2 text-ink-2">{a.batch || '—'}</td>
                    <td className="py-2 px-2">{a.qty}</td>
                    <td className={`py-2 px-2 ${a.severity === 'high' ? 'text-red-600' : ''}`}>{a.expiry || '—'}</td>
                    <td className="py-2 px-2 text-ink-2">{a.policyLabel}</td>
                    <td className={`py-2 px-2 ${a.severity === 'high' ? 'text-red-600' : ''}`}>
                      {a.flags.map((f) => f.text).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <a className={btn} href={`${getBasePath()}/dashboard/document?type=VCR`}>
              أنشئ استرداد بضاعة محميّة
            </a>
          </div>
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Pill active={tab === 'alerts'} onClick={() => setTab('alerts')}>حسب العميل</Pill>
        <Pill active={tab === 'lines'} onClick={() => setTab('lines')}>كلّ البنود</Pill>
        {canEdit ? <Pill active={tab === 'policies'} onClick={() => setTab('policies')}>سياسات الحماية</Pill> : null}
      </div>

      {tab === 'alerts' ? (
        <Section title="ما لدى كلّ عميل">
          {!byCustomer.length ? (
            <Muted>لا أمانة لدى أيّ عميل — أنشئ إيداعًا من مستند «إيداع بضاعة محميّة».</Muted>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 border-b border-line">
                    {['العميل', 'عدد البنود', 'الوحدات', 'القيمة'].map((h) => (
                      <th key={h} className="text-right py-2 px-2 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byCustomer.map((c) => (
                    <tr key={c.code} className="border-b border-line/50">
                      <td className="py-2 px-2">{c.code}</td>
                      <td className="py-2 px-2">{c.lines}</td>
                      <td className="py-2 px-2">{Math.round(c.qty * 100) / 100}</td>
                      <td className="py-2 px-2">{Math.round(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      ) : null}

      {tab === 'lines' ? (
        <Section title={`كلّ بنود الأمانة (${filtered.length})`}>
          <input className={`${input} max-w-sm mb-3`} placeholder="ابحث برمز العميل أو الصنف…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 border-b border-line">
                  {['العميل', 'الصنف', 'الدفعة', 'الصلاحية', 'الكمية', 'التكلفة', 'السياسة'].map((h) => (
                    <th key={h} className="text-right py-2 px-2 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((r, i) => {
                  const p = policyFor(r, policies);
                  return (
                    <tr key={`${r.customerCode}-${r.sku}-${r.batch}-${i}`} className="border-b border-line/50">
                      <td className="py-2 px-2">{r.customerCode}</td>
                      <td className="py-2 px-2">{r.nameAr || r.sku}</td>
                      <td className="py-2 px-2 text-ink-2">{r.batch || '—'}</td>
                      <td className="py-2 px-2">{r.expiry || '—'}</td>
                      <td className="py-2 px-2">{r.qty}</td>
                      <td className="py-2 px-2">{r.unitCost || 0}</td>
                      <td className="py-2 px-2 text-ink-2">{PROTECTION_POLICIES[p?.type]?.labelAr || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 ? <Muted>عُرض أوّل ٢٠٠ بند — استعمل البحث لتضييق النطاق.</Muted> : null}
        </Section>
      ) : null}

      {tab === 'policies' && canEdit ? (
        <Section title="سياسات الحماية">
          <PolicyEditor
            policies={policies}
            onSave={async (next) => {
              setErr('');
              setMsg('');
              try {
                await savePolicies(next, me);
                setMsg('حُفظت السياسات.');
              } catch (e) {
                setErr(e?.message || 'تعذّر الحفظ');
              }
            }}
          />
        </Section>
      ) : null}
    </div>
  );
}

/** محرّر السياسات: الافتراضيّة، ثمّ استثناءات الأصناف والفئات. */
function PolicyEditor({ policies, onSave }) {
  const [draft, setDraft] = useState(policies);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(policies), [policies]);

  const setDefault = (patch) => setDraft((d) => ({ ...d, default: { ...d.default, ...patch } }));
  const setEntry = (map, key, patch) =>
    setDraft((d) => ({ ...d, [map]: { ...d[map], [key]: { ...(d[map]?.[key] || {}), ...patch } } }));
  const removeEntry = (map, key) =>
    setDraft((d) => {
      const next = { ...d[map] };
      delete next[key];
      return { ...d, [map]: next };
    });
  const addEntry = (map) => {
    const key = window.prompt(map === 'bySku' ? 'رمز الصنف' : 'اسم الفئة');
    if (!key) return;
    setEntry(map, key.trim().toUpperCase(), { type: 'full_return' });
  };

  const problems = useMemo(() => {
    const out = [];
    const check = (label, p) => {
      const v = policyVerdict(p);
      if (!v.ok) out.push(`${label}: ${v.problems.join(' · ')}`);
    };
    check('الافتراضيّة', draft.default);
    Object.entries(draft.bySku || {}).forEach(([k, v]) => check(`الصنف ${k}`, v));
    Object.entries(draft.byCategory || {}).forEach(([k, v]) => check(`الفئة ${k}`, v));
    return out;
  }, [draft]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        الأولويّة: سياسة الصنف تسبق سياسة الفئة تسبق الافتراضيّة. وصنفٌ سياسته «لا إرجاع» لا يُودَع أمانةً أصلًا.
      </p>

      <div className="border border-line rounded-lg p-3">
        <div className="text-sm text-ink mb-2">السياسة الافتراضيّة</div>
        <PolicyRow policy={draft.default} onChange={setDefault} />
      </div>

      {['bySku', 'byCategory'].map((map) => (
        <div key={map} className="border border-line rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-ink">{map === 'bySku' ? 'استثناءات الأصناف' : 'استثناءات الفئات'}</div>
            <button type="button" className={btn} onClick={() => addEntry(map)}>+ إضافة</button>
          </div>
          {!Object.keys(draft[map] || {}).length ? (
            <Muted>لا استثناءات — الكلّ يتبع الافتراضيّة.</Muted>
          ) : (
            <ul className="space-y-2">
              {Object.entries(draft[map]).map(([key, p]) => (
                <li key={key} className="flex flex-wrap items-end gap-2">
                  <span className="text-sm text-ink min-w-24">{key}</span>
                  <PolicyRow policy={p} onChange={(patch) => setEntry(map, key, patch)} />
                  <button type="button" className={btn} onClick={() => removeEntry(map, key)}>حذف</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {problems.length ? (
        <ul className="text-sm text-red-600 list-disc pr-5 space-y-1">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : null}

      <button
        type="button"
        className={btnPrimary}
        disabled={problems.length > 0 || saving}
        onClick={async () => {
          setSaving(true);
          await onSave(draft);
          setSaving(false);
        }}
      >
        {saving ? 'جارٍ الحفظ…' : 'حفظ السياسات'}
      </button>
    </div>
  );
}

function PolicyRow({ policy, onChange }) {
  const meta = PROTECTION_POLICIES[policy?.type];
  return (
    <div className="flex flex-wrap items-end gap-2 flex-1">
      <select className={`${input} max-w-xs`} value={policy?.type || 'none'} onChange={(e) => onChange({ type: e.target.value })}>
        {Object.values(PROTECTION_POLICIES).map((p) => (
          <option key={p.id} value={p.id}>{p.labelAr}</option>
        ))}
      </select>
      {meta?.needs?.includes('windowDays') ? (
        <input
          type="number"
          className={`${input} max-w-32`}
          placeholder="أيّام الحماية"
          value={policy?.windowDays || ''}
          onChange={(e) => onChange({ windowDays: Number(e.target.value) })}
        />
      ) : null}
      {meta?.needs?.includes('graceDays') ? (
        <input
          type="number"
          className={`${input} max-w-32`}
          placeholder="أيّام السماح"
          value={policy?.graceDays || ''}
          onChange={(e) => onChange({ graceDays: Number(e.target.value) })}
        />
      ) : null}
      <span className="text-xs text-ink-2 basis-full">{meta?.hint}</span>
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
    <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-sm border ${active ? 'border-accent text-ink bg-chip' : 'border-line text-ink-2'}`}>
      {children}
    </button>
  );
}

function Banner({ tone, children }) {
  const cls = tone === 'bad' ? 'border-red-500/40 bg-red-500/5 text-red-600' : 'border-line bg-chip text-ink';
  return <div className={`border rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function Muted({ children }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}
