/**
 * سياسات التشغيل — القرارات الأربعة التي يملكها المالك (م١-ج).
 *
 * لا سياسة مخبوزة (المبدأ ٨): ما يتغيّر بقرارٍ إداريّ يُقرأ من الإعدادات. وهذه
 * الشاشة هي المكان الذي يُتّخذ فيه القرار — فلا يحتاج تغييرُ سقف الإنذار من ٩٠٪
 * إلى ٨٠٪ نشرةَ إصدارٍ جديدة، ولا يحتاج تخفيف حارسٍ يوم جردٍ مزدحم إلى انتظار
 * بناءٍ ونشر.
 *
 * ولأنّ التغيير يسري لحظيًّا على كلّ جهازٍ مفتوح، تُعرض **معاينة الأثر** قبل
 * الحفظ: ماذا يحدث فعلًا لمن يبيع لعميلٍ بلغ ٩٥٪ من سقفه؟ سياسةٌ تُغيَّر بلا
 * رؤية أثرها قرارٌ في الظلام.
 *
 * بنية ٣ طبقات: ما يسري الآن · القرارات الأربعة · الأثر والسجلّ.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenSettings, saveSettings } from '../../../services/settings/settingsService.js';
import { ROLES } from '../../../services/auth/roles.js';
import {
  DEFAULT_SETTINGS,
  SETTING_CHOICES,
  SETTING_LIMITS,
  normalizeSettings,
  settingsIssues,
  internalItemInSaleVerdict,
  manualPriceVerdict,
  creditVerdict,
  backdateVerdict,
} from '../../../services/settings/settingsModel.js';

const EDITOR_ROLES = ['admin'];

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent/60';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const card = 'rounded-xl border border-line bg-surface p-4';

/** أدوارٌ صالحة لفكّ القيد — تُقرأ من كتالوج الأدوار لا تُكتب يدويًّا. */
const ROLE_OPTIONS = Object.values(ROLES).map((r) => ({ value: r.id, label: r.label }));

const setIn = (obj, group, key, value) => ({ ...obj, [group]: { ...obj[group], [key]: value } });

function Field({ label, hint, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm text-ink mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-2 mt-1">{hint}</span> : null}
    </label>
  );
}

function Choice({ path, value, onChange, disabled }) {
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {(SETTING_CHOICES[path] || []).map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  );
}

function RoleChoice({ value, onChange, disabled }) {
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {ROLE_OPTIONS.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  );
}

export default function PolicySettings() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(DEFAULT_SETTINGS);
  const [raw, setRaw] = useState(null);
  const [exists, setExists] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
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
    if (!me) return undefined;
    return listenSettings(
      (settings, meta) => {
        setSaved(settings);
        setRaw(meta.raw);
        setExists(meta.exists);
        // المسوّدة تُزامَن مع المحفوظ ما لم يكن المالك يحرّر الآن.
        setDraft((d) => (dirtyRef.current ? d : settings));
      },
      (e) => setErr(e?.message || 'تعذّر قراءة السياسات')
    );
  }, [me]);

  // التغيير اللحظيّ نعمةٌ ونقمة: لولا هذا المرجع لدهس تحديثٌ وارد ما يكتبه
  // المالك في اللحظة نفسها. مرجعٌ لا حالة — لا داعي لإعادة رسمٍ عند كلّ ضغطة.
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const canEdit = Boolean(me && EDITOR_ROLES.includes(me.role));
  const issues = useMemo(() => settingsIssues(raw), [raw]);

  const update = (group, key) => (value) => {
    setMsg('');
    setDraft((d) => setIn(d, group, key, value));
  };

  async function onSave() {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const clean = await saveSettings(draft, me);
      setDraft(clean);
      setMsg('سرت السياسة على كلّ جهازٍ مفتوح.');
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  /* ═══ معاينة الأثر — بالمسوّدة لا بالمحفوظ، فيُرى القرار قبل اتّخاذه ═══ */
  const preview = useMemo(() => {
    const s = normalizeSettings(draft);
    const day = '2026-08-10';
    const back = new Date(Date.parse(`${day}T00:00:00Z`) - (s.dating.backdateDays + 1) * 86400000)
      .toISOString()
      .slice(0, 10);
    return [
      {
        q: 'أمين مخزنٍ يضع صنفًا داخليًّا في أمر بيع',
        a: internalItemInSaleVerdict(draft, 'storekeeper'),
        text: (v) => (v.allowed ? (v.message || 'يمرّ') : v.message),
        bad: (v) => !v.allowed,
      },
      {
        q: 'مندوبٌ يكتب سعرًا بيده',
        a: manualPriceVerdict(draft, 'sales_rep'),
        text: (v) => (v.allowed ? (v.mustTag ? 'يمرّ ويُوسم «سعر يدويّ»' : 'يمرّ بلا وسم') : v.message),
        bad: (v) => !v.allowed,
      },
      {
        q: 'بيعٌ بـ٢٠٠ لعميلٍ رصيده ٩٠٠ وسقفه ١٠٠٠',
        a: creditVerdict(draft, { balance: 900, limit: 1000, addition: 200 }),
        text: (v) =>
          v.verdict === 'block' ? v.message : v.verdict === 'warn' ? v.message : 'يمرّ بلا إنذار',
        bad: (v) => v.verdict === 'block',
      },
      {
        q: `تسجيل واقعةٍ عمرها ${s.dating.backdateDays + 1} يومًا`,
        a: backdateVerdict(draft, back, day),
        text: (v) => (v.verdict === 'ok' ? 'يمرّ' : v.message),
        bad: (v) => v.verdict !== 'ok',
      },
    ];
  }, [draft]);

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;

  return (
    <div className="space-y-5">
      {/* ═══ الطبقة ١: ما يسري الآن ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">ما يسري الآن</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">الصنف الداخليّ في أمر بيع</div>
            <div className="text-ink">
              {SETTING_CHOICES['items.internalInSales'].find((c) => c.value === saved.items.internalInSales)?.label}
            </div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">تعديل السعر يدويًّا</div>
            <div className="text-ink">
              {SETTING_CHOICES['pricing.manualOverride'].find((c) => c.value === saved.pricing.manualOverride)?.label}
            </div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">حدّ الائتمان</div>
            <div className="text-ink">
              {SETTING_CHOICES['credit.enforce'].find((c) => c.value === saved.credit.enforce)?.label}
              {saved.credit.enforce !== 'off' ? ` · إنذارٌ عند ${saved.credit.warnAtPct}٪` : ''}
            </div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">التأريخ للماضي</div>
            <div className="text-ink">{saved.dating.backdateDays} يومًا بلا اعتماد</div>
          </div>
        </div>

        {!exists ? (
          <p className="text-xs text-ink-2 mt-3">
            لا مستند سياساتٍ محفوظ بعد — النظام يعمل بالافتراضات المعتمدة في الخطة. أوّل حفظٍ يثبّتها.
          </p>
        ) : null}

        {issues.length ? (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <div className="text-sm text-ink font-semibold mb-1">قِيَمٌ مرفوضة سقطت إلى افتراضها</div>
            <ul className="text-xs text-ink-2 space-y-1">
              {issues.map((i) => (
                <li key={i.path}>
                  <span className="text-ink">{i.path}</span>: «{String(i.given)}» — {i.why}. المستعمَل: {String(i.used)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ═══ الطبقة ٢: القرارات الأربعة ═══ */}
      <section className={card}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-ink">القرارات الأربعة</h2>
          {!canEdit ? <span className="text-xs text-ink-2">للعرض — التعديل للمدير العام</span> : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">٤ — الصنف الداخليّ في أمر بيع</h3>
            <Field label="السلوك" hint="مواد التغليف وقطع الغيار تُنقل ولا تُباع.">
              <Choice
                path="items.internalInSales"
                value={draft.items.internalInSales}
                onChange={update('items', 'internalInSales')}
                disabled={!canEdit}
              />
            </Field>
            <Field label="من يفكّ المنع" hint="الأدمن يفكّ دائمًا بحكم دوره.">
              <RoleChoice value={draft.items.overrideRole} onChange={update('items', 'overrideRole')} disabled={!canEdit} />
            </Field>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">٥ — تعديل السعر يدويًّا</h3>
            <Field label="السلوك" hint="الموسوم يظهر في تقرير انحراف الأسعار.">
              <Choice
                path="pricing.manualOverride"
                value={draft.pricing.manualOverride}
                onChange={update('pricing', 'manualOverride')}
                disabled={!canEdit}
              />
            </Field>
            <Field label="من يملك التعديل">
              <RoleChoice
                value={draft.pricing.overrideRole}
                onChange={update('pricing', 'overrideRole')}
                disabled={!canEdit}
              />
            </Field>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">٦ — حدّ الائتمان</h3>
            <Field label="السلوك">
              <Choice
                path="credit.enforce"
                value={draft.credit.enforce}
                onChange={update('credit', 'enforce')}
                disabled={!canEdit}
              />
            </Field>
            <Field
              label="عتبة الإنذار (٪ من السقف)"
              hint={`المدى ${SETTING_LIMITS['credit.warnAtPct'].min}–${SETTING_LIMITS['credit.warnAtPct'].max}. سقفٌ غير مُدخَلٍ لا يمنع أحدًا.`}
            >
              <input
                className={input}
                type="number"
                min={SETTING_LIMITS['credit.warnAtPct'].min}
                max={SETTING_LIMITS['credit.warnAtPct'].max}
                value={draft.credit.warnAtPct}
                onChange={(e) => update('credit', 'warnAtPct')(Number(e.target.value))}
                disabled={!canEdit || draft.credit.enforce === 'off'}
              />
            </Field>
            <Field label="من يفكّ المنع">
              <RoleChoice value={draft.credit.unlockRole} onChange={update('credit', 'unlockRole')} disabled={!canEdit} />
            </Field>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">٧ — مدى التأريخ للماضي</h3>
            <Field
              label="أيّامٌ مسموحةٌ بلا اعتماد"
              hint={`المدى ${SETTING_LIMITS['dating.backdateDays'].min}–${SETTING_LIMITS['dating.backdateDays'].max}. لا واقعة في المستقبل مهما كان الإعداد.`}
            >
              <input
                className={input}
                type="number"
                min={SETTING_LIMITS['dating.backdateDays'].min}
                max={SETTING_LIMITS['dating.backdateDays'].max}
                value={draft.dating.backdateDays}
                onChange={(e) => update('dating', 'backdateDays')(Number(e.target.value))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="من يعتمد ما وراء المدى">
              <RoleChoice
                value={draft.dating.approveRole}
                onChange={update('dating', 'approveRole')}
                disabled={!canEdit}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.dating.requireReason}
                onChange={(e) => update('dating', 'requireReason')(e.target.checked)}
                disabled={!canEdit}
              />
              سببٌ مكتوبٌ إلزاميّ مع الاعتماد
            </label>
          </div>
        </div>

        {canEdit ? (
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-line">
            <button className={btnPrimary} onClick={onSave} disabled={saving || !dirty}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ السياسة'}
            </button>
            <button className={btn} onClick={() => setDraft(saved)} disabled={saving || !dirty}>
              تراجع
            </button>
            {dirty ? <span className="text-xs text-ink-2">تغييراتٌ لم تُحفظ بعد</span> : null}
            {msg ? <span className="text-xs text-ink">{msg}</span> : null}
            {err ? <span className="text-xs text-red-500">{err}</span> : null}
          </div>
        ) : null}
      </section>

      {/* ═══ الطبقة ٣: أثر ما تختاره ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">أثر ما تختاره</h2>
        <p className="text-xs text-ink-2 mb-3">
          محسوبٌ من المسوّدة التي أمامك — لا من المحفوظ. فترى القرار قبل أن تتّخذه.
        </p>
        <ul className="space-y-2">
          {preview.map((p) => (
            <li key={p.q} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="text-ink-2">{p.q}:</span>
              <span className={p.bad(p.a) ? 'text-red-500' : 'text-ink'}>{p.text(p.a)}</span>
            </li>
          ))}
        </ul>
        {exists && raw?.byName ? (
          <p className="text-xs text-ink-2 mt-4 pt-3 border-t border-line">
            آخر تغيير: {raw.byName}
          </p>
        ) : null}
      </section>
    </div>
  );
}
