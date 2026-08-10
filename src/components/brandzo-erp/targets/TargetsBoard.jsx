/**
 * لوحة المستهدفات — الرقم مقابل مرجعه، والإيقاع لا النسبة وحدها.
 *
 * «حقّقتَ ٤٠٪» جملةٌ ناقصة: أفي اليوم الثالث أم الثامن والعشرين؟ الأولى تفوّقٌ
 * والثانية كارثة. فتعرض هذه الشاشة الإيقاع والمطلوب يوميًّا والإسقاط — لتُعدّل
 * المسار وهو يُسار، لا لتُحرّر محضر إدانةٍ آخر الشهر.
 *
 * بنية ٣ طبقات: تدخّل الآن · إجراءات · فهرس.
 * الوصول: المندوب يرى مستهدفاته، والمشرف والمديران يرون الكلّ ويُعرّفون.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { listenRecentVisits } from '../../../services/field/fieldService.js';
import { listenTargets, saveTarget, setTargetActive } from '../../../services/targets/targetsService.js';
import {
  DIMENSIONS,
  METRICS,
  PERIODS,
  SALES_DOC_TYPES,
  blankTarget,
  targetVerdict,
} from '../../../services/targets/targetModel.js';
import { computeAll, summarize, STATUS_LABELS } from '../../../services/targets/achievement.js';

const ROLES = ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'];
const EDITOR_ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';

const today = () => new Date().toISOString().slice(0, 10);

/** يقترح مدّةً من الدوريّة — كي لا تُكتب التواريخ بيدٍ في كلّ مرّة. */
function periodRange(periodId, from) {
  const start = from || today();
  const days = PERIODS[periodId]?.days || 0;
  if (!days) return { from: start, to: '' };
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days - 1);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

export default function TargetsBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [targets, setTargets] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [visits, setVisits] = useState([]);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

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
    const u1 = listenTargets(setTargets, fail);
    const u2 = listenDocumentsByTypes(SALES_DOC_TYPES, setDocuments, 500);
    const u3 = listenRecentVisits(setVisits, fail, 1000);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [me]);

  const canEdit = me && EDITOR_ROLES.includes(me.role);

  // المندوب يرى مستهدفاته وحدها — لا لوحة زملائه.
  const visible = useMemo(() => {
    if (canEdit) return targets;
    return targets.filter((t) => t.dimension === 'all' || (t.dimension === 'rep' && t.dimensionValue === me?.uid));
  }, [targets, canEdit, me]);

  const rows = useMemo(
    () => computeAll({ targets: visible, documents, visits, asOf: today() }),
    [visible, documents, visits]
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const needsAttention = rows.filter((r) => r.status === 'behind' || r.status === 'at_risk');

  const verdict = useMemo(() => (draft ? targetVerdict(draft) : null), [draft]);

  const save = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await saveTarget(draft, me);
      setMsg('حُفظ المستهدف.');
      setDraft(null);
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!ROLES.includes(me.role)) return <Muted>هذه الشاشة لمندوبي المبيعات ومشرفيهم والمديرين.</Muted>;

  return (
    <div className="space-y-5">
      {err ? <Banner tone="bad">{err}</Banner> : null}
      {msg ? <Banner tone="ok">{msg}</Banner> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="مستهدفات سارية" value={summary.total} />
        <Kpi label="مُنجَزة" value={summary.achieved} />
        <Kpi label="متأخّرة" value={summary.behind} alert={summary.behind > 0} />
        <Kpi label="متوسّط الإنجاز" value={`${summary.avgPct}%`} />
      </div>

      {needsAttention.length ? (
        <Section title="تدخّل الآن — تحت الإيقاع">
          <p className="text-sm text-ink-2 mb-3">
            هذه المستهدفات لن تُبلَغ إن استمرّ المعدّل الحاليّ. الرقم المطلوب يوميًّا مذكورٌ لكلٍّ منها.
          </p>
          <ul className="space-y-2">
            {needsAttention.map((r) => (
              <li key={r.targetId} className="border border-red-500/40 bg-red-500/5 rounded-lg p-3">
                <div className="text-ink">{r.name}</div>
                <div className="text-sm text-red-600 mt-1">
                  أنجز {r.achieved} من {r.amount} {r.unit} ({r.pct}%) — والمتوقّع حتى اليوم {r.expected}.
                  {r.remainingDays > 0
                    ? ` يلزم ${r.requiredPerDay} ${r.unit} يوميًّا في الأيّام الـ${r.remainingDays} المتبقّية.`
                    : ''}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {canEdit ? (
        <Section title="إجراءات">
          <button type="button" className={btnPrimary} onClick={() => setDraft({ ...blankTarget(), ...periodRange('monthly') })}>
            مستهدف جديد
          </button>
        </Section>
      ) : null}

      {draft ? (
        <Section title={draft.id ? `تعديل «${draft.name}»` : 'مستهدف جديد'}>
          <TargetForm draft={draft} setDraft={setDraft} />
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
              {saving ? 'جارٍ الحفظ…' : 'حفظ المستهدف'}
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>إلغاء</button>
          </div>
        </Section>
      ) : null}

      <Section title={`المستهدفات (${rows.length})`}>
        {!rows.length ? (
          <Muted>
            {canEdit ? 'لا مستهدفات بعد — أنشئ الأوّل ليصير للأرقام مرجع.' : 'لا مستهدفات مسندة إليك بعد.'}
          </Muted>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const t = targets.find((x) => x.id === r.targetId);
              const tone = STATUS_LABELS[r.status]?.tone;
              return (
                <li key={r.targetId} className="border border-line rounded-lg p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-64">
                      <div className="text-ink">
                        {r.name}
                        <span className={`text-xs mr-2 ${tone === 'bad' ? 'text-red-600' : 'text-ink-2'}`}>
                          — {STATUS_LABELS[r.status]?.labelAr}
                        </span>
                      </div>
                      <div className="text-xs text-ink-2 mt-0.5">
                        {r.dimensionLabel}
                        {r.dimensionValue ? ` · ${r.dimensionValue}` : ''} · {r.metricLabel} ·{' '}
                        {t?.from} ← {t?.to}
                      </div>

                      <Bar pct={r.pct} expectedPct={r.amount ? Math.round((r.expected / r.amount) * 100) : 0} tone={tone} />

                      <div className="text-xs text-ink-2 mt-1">
                        {r.achieved} من {r.amount} {r.unit} ({r.pct}%) · المتوقّع حتى اليوم {r.expected}
                        {r.remainingDays > 0 ? ` · متبقٍّ ${r.remainingDays} يومًا` : ' · انتهت المدّة'}
                        {r.projection && r.status !== 'achieved' ? ` · الإسقاط ${r.projection}` : ''}
                      </div>
                      {r.breakdown?.freeQty ? (
                        <div className="text-xs text-ink-2 mt-0.5">
                          منها {r.breakdown.freeQty} وحدة مجّانيّة (تُعدّ كميّةً لا قيمة) · {r.breakdown.outlets} متجرًا
                        </div>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <button type="button" className={btn} onClick={() => setDraft({ ...blankTarget(), ...t })}>تعديل</button>
                        <button
                          type="button"
                          className={btn}
                          onClick={() => setTargetActive(r.targetId, false, me).catch((e) => setErr(e.message))}
                        >
                          تعطيل
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** شريط التقدّم مع علامة الإيقاع — الفرق بينهما هو الرسالة كلّها. */
function Bar({ pct, expectedPct, tone }) {
  const width = Math.min(100, Math.max(0, pct));
  const mark = Math.min(100, Math.max(0, expectedPct));
  const color = tone === 'bad' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-accent';
  return (
    <div className="relative h-2 bg-chip border border-line rounded-full mt-2 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
      {mark > 0 && mark < 100 ? (
        <div className="absolute top-0 h-full w-px bg-ink" style={{ right: `${mark}%` }} title="الإيقاع المتوقّع" />
      ) : null}
    </div>
  );
}

function TargetForm({ draft, setDraft }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setScope = (patch) => setDraft((d) => ({ ...d, scope: { ...d.scope, ...patch } }));
  const csv = (arr) => (arr || []).join('، ');
  const parse = (v) => String(v || '').split(/[،,]/).map((s) => s.trim().toUpperCase()).filter(Boolean);

  const dim = DIMENSIONS[draft.dimension];
  const metric = METRICS[draft.metric];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <Field label="اسم المستهدف">
          <input className={input} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="مبيعات أغسطس — مندوب بنغازي" />
        </Field>
        <Field label="البُعد (لمن؟)">
          <select className={input} value={draft.dimension} onChange={(e) => set({ dimension: e.target.value })}>
            {Object.values(DIMENSIONS).map((d) => <option key={d.id} value={d.id}>{d.labelAr}</option>)}
          </select>
        </Field>
        <Field label={dim?.id === 'all' ? 'لا قيمة مطلوبة' : `قيمة ${dim?.labelAr || 'البُعد'}`}>
          <input
            className={input}
            value={draft.dimensionValue}
            disabled={dim?.id === 'all'}
            onChange={(e) => set({ dimensionValue: e.target.value })}
            placeholder={dim?.id === 'rep' ? 'معرّف المندوب (uid)' : dim?.id === 'customer' ? 'رمز العميل' : ''}
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Field label="المقياس">
          <select className={input} value={draft.metric} onChange={(e) => set({ metric: e.target.value })}>
            {Object.values(METRICS).map((m) => <option key={m.id} value={m.id}>{m.labelAr}</option>)}
          </select>
        </Field>
        <Field label={`الرقم المستهدف (${metric?.unit || ''})`}>
          <input type="number" className={input} value={draft.amount} onChange={(e) => set({ amount: Number(e.target.value) })} />
        </Field>
        <Field label="الدوريّة">
          <select
            className={input}
            value={draft.period}
            onChange={(e) => set({ period: e.target.value, ...periodRange(e.target.value, draft.from) })}
          >
            {Object.values(PERIODS).map((p) => <option key={p.id} value={p.id}>{p.labelAr}</option>)}
          </select>
        </Field>
        <Field label="من ← إلى">
          <div className="flex gap-2">
            <input type="date" className={input} value={draft.from} onChange={(e) => set({ from: e.target.value, ...periodRange(draft.period, e.target.value) })} />
            <input type="date" className={input} value={draft.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </Field>
      </div>

      {metric?.source === 'documents' ? (
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="النطاق — أصناف (بفواصل، فارغ = الكلّ)">
            <input className={input} value={csv(draft.scope?.skus)} onChange={(e) => setScope({ skus: parse(e.target.value) })} />
          </Field>
          <Field label="النطاق — فئات / علامات">
            <input className={input} value={csv(draft.scope?.categories)} onChange={(e) => setScope({ categories: parse(e.target.value) })} />
          </Field>
        </div>
      ) : null}

      <p className="text-xs text-ink-2">
        الإنجاز يُحسب من المستندات المنجَزة ({SALES_DOC_TYPES.join(' · ')}) والزيارات المغلقة — لا يُخزَّن ولا يُحرَّر يدويًّا.
      </p>
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

function Banner({ tone, children }) {
  const cls = tone === 'bad' ? 'border-red-500/40 bg-red-500/5 text-red-600' : 'border-line bg-chip text-ink';
  return <div className={`border rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function Muted({ children }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}
