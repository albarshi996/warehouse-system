/**
 * لوحة العروض الترويجيّة — تعريفٌ ومتابعةُ ميزانيّةٍ ومحاكاةٌ قبل الإطلاق.
 *
 * المحاكي ليس ترفًا: عرضٌ يُطلَق بإعدادٍ خاطئ لا يُخطئ بصوتٍ عالٍ، بل **لا
 * ينطبق أبدًا** فيظنّ الجميع أنّه يعمل حتى تُقفَل الحملة. فهنا تُجرَّب أرقامٌ
 * افتراضيّة ويُرى الأثر قبل أن يخرج للميدان.
 *
 * بنية ٣ طبقات: تدخّل الآن · إجراءات · فهرس.
 * الوصول: المديران ومشرف المبيعات (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenPromotions, savePromotion, setPromotionActive } from '../../../services/promotions/promotionsService.js';
import {
  PROMO_TYPES,
  blankPromotion,
  promotionVerdict,
  isPromoLive,
  isBudgetExhausted,
} from '../../../services/promotions/promotionModel.js';
import { evaluateOrder } from '../../../services/promotions/promotionEngine.js';

const ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];
const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';

const today = () => new Date().toISOString().slice(0, 10);

export default function PromotionsBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [promos, setPromos] = useState([]);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('list');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !ROLES.includes(me.role)) return undefined;
    return listenPromotions(setPromos, (e) => setErr(e?.message || 'تعذّر الاتصال'));
  }, [me]);

  const live = useMemo(() => promos.filter((p) => isPromoLive(p, today())), [promos]);
  const exhausted = useMemo(() => promos.filter((p) => p.active !== false && isBudgetExhausted(p)), [promos]);
  const expiringSoon = useMemo(() => {
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return live.filter((p) => p.endDate && p.endDate <= in7);
  }, [live]);

  const totalSpend = useMemo(
    () => promos.reduce((s, p) => s + (Number(p?.usage?.value) || 0), 0),
    [promos]
  );

  const verdict = useMemo(() => (draft ? promotionVerdict(draft) : null), [draft]);

  const save = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await savePromotion(draft, me);
      setMsg('حُفظ العرض.');
      setDraft(null);
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!ROLES.includes(me.role)) return <Muted>هذه الشاشة لمشرف المبيعات والمديرين.</Muted>;

  return (
    <div className="space-y-5">
      {err ? <Banner tone="bad">{err}</Banner> : null}
      {msg ? <Banner tone="ok">{msg}</Banner> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="عروض سارية اليوم" value={live.length} />
        <Kpi label="إجمالي العروض" value={promos.length} />
        <Kpi label="كلفة الترويج المستهلَكة" value={Math.round(totalSpend)} />
        <Kpi label="استُنفدت ميزانيّتها" value={exhausted.length} alert={exhausted.length > 0} />
      </div>

      {exhausted.length || expiringSoon.length ? (
        <Section title="تدخّل الآن">
          <ul className="space-y-2 text-sm">
            {exhausted.map((p) => (
              <li key={p.id} className="text-red-600">
                «{p.nameAr}» استُنفدت ميزانيّته ({p.usage?.freeUnits || 0} وحدة) — لن يُطبَّق حتى تُرفع الميزانيّة أو يُعطَّل.
              </li>
            ))}
            {expiringSoon.map((p) => (
              <li key={p.id} className="text-ink-2">
                «{p.nameAr}» ينتهي في {p.endDate} — جدّده أو دعه ينقضي.
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Pill active={tab === 'list'} onClick={() => setTab('list')}>العروض</Pill>
        <Pill active={tab === 'sim'} onClick={() => setTab('sim')}>محاكاة طلب</Pill>
      </div>

      {tab === 'sim' ? (
        <Section title="محاكاة — جرّب قبل أن تُطلق">
          <Simulator promos={promos} />
        </Section>
      ) : null}

      {tab === 'list' && !draft ? (
        <Section title="فهرس العروض">
          <button type="button" className={`${btnPrimary} mb-4`} onClick={() => setDraft({ ...blankPromotion(), startDate: today() })}>
            عرض جديد
          </button>
          {!promos.length ? (
            <Muted>لا عروض بعد — أنشئ الأوّل ليُطبَّق آليًّا في فواتير المندوبين.</Muted>
          ) : (
            <ul className="space-y-2">
              {promos.map((p) => (
                <li key={p.id} className="border border-line rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-ink">
                        {p.nameAr} <span className="text-xs text-ink-2">({p.code})</span>
                        {p.active === false ? ' — معطّل' : isPromoLive(p, today()) ? ' · سارٍ' : ' — خارج النافذة'}
                        {p.exclusive ? ' · حصريّ' : ''}
                      </div>
                      <div className="text-xs text-ink-2">
                        {PROMO_TYPES[p.type]?.labelAr || p.type} · أولويّة {p.priority}
                        {p.startDate || p.endDate ? ` · ${p.startDate || '—'} ← ${p.endDate || '—'}` : ''}
                      </div>
                      <div className="text-xs text-ink-2 mt-1">
                        استُهلك: {p.usage?.freeUnits || 0} وحدة · {Math.round(p.usage?.value || 0)} قيمة · {p.usage?.orders || 0} طلبًا
                        {p.budget?.maxFreeUnits ? ` — السقف ${p.budget.maxFreeUnits} وحدة` : ''}
                        {p.budget?.maxValue ? ` — سقف القيمة ${p.budget.maxValue}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className={btn} onClick={() => setDraft({ ...blankPromotion(), ...p })}>تعديل</button>
                      <button
                        type="button"
                        className={btn}
                        onClick={() => setPromotionActive(p.id, p.active === false, me).catch((e) => setErr(e.message))}
                      >
                        {p.active === false ? 'تفعيل' : 'تعطيل'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {tab === 'list' && draft ? (
        <Section title={draft.id ? `تعديل «${draft.nameAr || draft.code}»` : 'عرض جديد'}>
          <PromoForm draft={draft} setDraft={setDraft} />
          {verdict && (verdict.problems.length || verdict.warnings.length) ? (
            <div className="mt-4 space-y-2">
              {verdict.problems.length ? (
                <ul className="text-sm text-red-600 list-disc pr-5 space-y-1">
                  {verdict.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              ) : null}
              {verdict.warnings.length ? (
                <ul className="text-sm text-ink-2 list-disc pr-5 space-y-1">
                  {verdict.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2 mt-4">
            <button type="button" className={btnPrimary} disabled={!verdict?.ok || saving} onClick={save}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ العرض'}
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>إلغاء</button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function PromoForm({ draft, setDraft }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setScope = (patch) => setDraft((d) => ({ ...d, scope: { ...d.scope, ...patch } }));
  const setBudget = (patch) => setDraft((d) => ({ ...d, budget: { ...d.budget, ...patch } }));
  const csv = (arr) => (arr || []).join('، ');
  const parse = (v) => String(v || '').split(/[،,]/).map((s) => s.trim().toUpperCase()).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <Field label="رمز العرض">
          <input className={input} value={draft.code} onChange={(e) => set({ code: e.target.value })} placeholder="PR-2026-01" />
        </Field>
        <Field label="اسم العرض">
          <input className={input} value={draft.nameAr} onChange={(e) => set({ nameAr: e.target.value })} placeholder="اشترِ ١٠ كراتين واحصل على واحد" />
        </Field>
        <Field label="النوع">
          <select className={input} value={draft.type} onChange={(e) => set({ type: e.target.value })}>
            {Object.values(PROMO_TYPES).map((t) => <option key={t.id} value={t.id}>{t.labelAr}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs text-ink-2">{PROMO_TYPES[draft.type]?.hint}</p>

      <div className="grid md:grid-cols-4 gap-3">
        <Field label="من تاريخ"><input type="date" className={input} value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
        <Field label="إلى تاريخ"><input type="date" className={input} value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
        <Field label="الأولويّة (الأصغر أوّلًا)"><input type="number" className={input} value={draft.priority} onChange={(e) => set({ priority: Number(e.target.value) })} /></Field>
        <Field label="حصريّ؟">
          <select className={input} value={draft.exclusive ? '1' : '0'} onChange={(e) => set({ exclusive: e.target.value === '1' })}>
            <option value="0">يتراكم مع غيره</option>
            <option value="1">حصريّ — يحتكر بنوده</option>
          </select>
        </Field>
      </div>

      {draft.type === 'buy_x_get_y' ? (
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="اشترِ (كميّة)"><input type="number" className={input} value={draft.buyQty} onChange={(e) => set({ buyQty: Number(e.target.value) })} /></Field>
          <Field label="خذ (كميّة مجّانيّة)"><input type="number" className={input} value={draft.getQty} onChange={(e) => set({ getQty: Number(e.target.value) })} /></Field>
          <Field label="الصنف المجّانيّ (فارغ = نفس الصنف)"><input className={input} value={draft.getSku} onChange={(e) => set({ getSku: e.target.value.toUpperCase() })} /></Field>
        </div>
      ) : null}

      {draft.type === 'attach' ? (
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="لكلّ كم وحدة"><input type="number" className={input} value={draft.perQty} onChange={(e) => set({ perQty: Number(e.target.value) })} /></Field>
          <Field label="صنف التحميل (البطيء)"><input className={input} value={draft.attachSku} onChange={(e) => set({ attachSku: e.target.value.toUpperCase() })} /></Field>
          <Field label="كميّة التحميل"><input type="number" className={input} value={draft.attachQty} onChange={(e) => set({ attachQty: Number(e.target.value) })} /></Field>
        </div>
      ) : null}

      {draft.type === 'tiered_discount' ? (
        <Field label="الشرائح — كميّة ونسبة">
          <TierEditor tiers={draft.tiers} onChange={(tiers) => set({ tiers })} />
        </Field>
      ) : null}

      {draft.type === 'bundle' ? (
        <div className="space-y-3">
          <Field label="بنود الحزمة — صنف وكميّة">
            <BundleEditor lines={draft.bundleLines} onChange={(bundleLines) => set({ bundleLines })} />
          </Field>
          <Field label="سعر الحزمة"><input type="number" className={input} value={draft.bundlePrice} onChange={(e) => set({ bundlePrice: Number(e.target.value) })} /></Field>
        </div>
      ) : null}

      {draft.type === 'mix_match' ? (
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="الأصناف (بفواصل)"><input className={input} value={csv(draft.mixMatchSkus)} onChange={(e) => set({ mixMatchSkus: parse(e.target.value) })} /></Field>
          <Field label="الكميّة المطلوبة"><input type="number" className={input} value={draft.mixMatchQty} onChange={(e) => set({ mixMatchQty: Number(e.target.value) })} /></Field>
          <Field label="سعر التشكيلة"><input type="number" className={input} value={draft.mixMatchPrice} onChange={(e) => set({ mixMatchPrice: Number(e.target.value) })} /></Field>
        </div>
      ) : null}

      <div className="grid md:grid-cols-4 gap-3">
        <Field label="النطاق — أصناف (بفواصل، فارغ = الكلّ)"><input className={input} value={csv(draft.scope?.skus)} onChange={(e) => setScope({ skus: parse(e.target.value) })} /></Field>
        <Field label="النطاق — فئات"><input className={input} value={csv(draft.scope?.categories)} onChange={(e) => setScope({ categories: parse(e.target.value) })} /></Field>
        <Field label="سقف الوحدات المجّانيّة (0 = بلا سقف)"><input type="number" className={input} value={draft.budget?.maxFreeUnits || 0} onChange={(e) => setBudget({ maxFreeUnits: Number(e.target.value) })} /></Field>
        <Field label="سقف القيمة (0 = بلا سقف)"><input type="number" className={input} value={draft.budget?.maxValue || 0} onChange={(e) => setBudget({ maxValue: Number(e.target.value) })} /></Field>
      </div>
    </div>
  );
}

function TierEditor({ tiers, onChange }) {
  const rows = tiers || [];
  const upd = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((t, i) => (
        <div key={i} className="flex gap-2">
          <input type="number" className={input} placeholder="من كميّة" value={t.minQty} onChange={(e) => upd(i, { minQty: Number(e.target.value) })} />
          <input type="number" className={input} placeholder="نسبة %" value={t.discountPct} onChange={(e) => upd(i, { discountPct: Number(e.target.value) })} />
          <button type="button" className={btn} onClick={() => onChange(rows.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button type="button" className={btn} onClick={() => onChange([...rows, { minQty: 0, discountPct: 0 }])}>+ شريحة</button>
    </div>
  );
}

function BundleEditor({ lines, onChange }) {
  const rows = lines || [];
  const upd = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((l, i) => (
        <div key={i} className="flex gap-2">
          <input className={input} placeholder="رمز الصنف" value={l.sku} onChange={(e) => upd(i, { sku: e.target.value.toUpperCase() })} />
          <input type="number" className={input} placeholder="كميّة" value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} />
          <button type="button" className={btn} onClick={() => onChange(rows.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button type="button" className={btn} onClick={() => onChange([...rows, { sku: '', qty: 0 }])}>+ بند</button>
    </div>
  );
}

/** محاكي التطبيق — أرقامٌ افتراضيّة تُظهر الأثر قبل الإطلاق. */
function Simulator({ promos }) {
  const [rows, setRows] = useState([{ sku: 'A', description: 'صنف تجريبيّ', qty: 20, unitPrice: 10, unitCost: 6, category: '' }]);
  const upd = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const result = useMemo(() => evaluateOrder({ lines: rows, promotions: promos, day: today() }), [rows, promos]);
  const gross = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <input className={input} placeholder="رمز الصنف" value={r.sku} onChange={(e) => upd(i, { sku: e.target.value.toUpperCase() })} />
            <input className={input} placeholder="الفئة" value={r.category} onChange={(e) => upd(i, { category: e.target.value })} />
            <input type="number" className={input} placeholder="الكميّة" value={r.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} />
            <input type="number" className={input} placeholder="السعر" value={r.unitPrice} onChange={(e) => upd(i, { unitPrice: Number(e.target.value) })} />
            <button type="button" className={btn} onClick={() => setRows(rows.filter((_, k) => k !== i))}>حذف</button>
          </div>
        ))}
        <button type="button" className={btn} onClick={() => setRows([...rows, { sku: '', description: '', qty: 0, unitPrice: 0, unitCost: 0, category: '' }])}>
          + بند
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="الإجمالي قبل العروض" value={Math.round(gross)} />
        <Kpi label="الخصم" value={result.totals.discount} />
        <Kpi label="وحدات مجّانيّة" value={result.totals.freeUnits} />
        <Kpi label="كلفة المجّانيّ" value={result.totals.freeCost} />
      </div>

      {result.applied.length ? (
        <div>
          <div className="text-sm text-ink mb-2">عروض طُبِّقت</div>
          <ul className="space-y-1 text-sm text-ink-2">
            {result.applied.map((a) => (
              <li key={a.promoId}>✓ {a.nameAr} ({a.code}) — {a.description}</li>
            ))}
          </ul>
        </div>
      ) : (
        <Muted>لا عرض ينطبق على هذا الطلب.</Muted>
      )}

      {result.freeLines.length ? (
        <div>
          <div className="text-sm text-ink mb-2">بنود مجّانيّة ستخرج من المركبة</div>
          <ul className="space-y-1 text-sm text-ink-2">
            {result.freeLines.map((f, i) => (
              <li key={i}>{f.sku} × {f.qty} — {f.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.nudges.length ? (
        <div>
          <div className="text-sm text-ink mb-2">تلميحات بيعٍ إضافيّ (تظهر للمندوب)</div>
          <ul className="space-y-1 text-sm text-ink-2">
            {result.nudges.map((n, i) => <li key={i}>{n.message}</li>)}
          </ul>
        </div>
      ) : null}

      {result.skipped.length ? (
        <details>
          <summary className="text-sm text-ink-2 cursor-pointer">لماذا لم تنطبق بقيّة العروض؟ ({result.skipped.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {result.skipped.map((s, i) => <li key={i}>{s.code || s.promoId}: {s.reason}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="text-sm text-ink-2 block">
      {label}
      <div className="mt-1">{children}</div>
    </label>
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
