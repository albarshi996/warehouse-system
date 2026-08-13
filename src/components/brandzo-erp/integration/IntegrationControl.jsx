/**
 * لوحة التحكّم بالتكامل (م٧-أ · يكمل سدّ ف‑٩).
 *
 * تُعطي الشركة ما كان مخبوزًا في الكود: **أيّ نوعٍ يُدفع وأيّه يُسحب وأيّه
 * يُعزل، وأيّ حقولٍ تعبر، ومتى، وماذا يحدث عند التعارض.** ولا تُفعَّل تغييرًا
 * إلّا بعد أن يرى صاحبه أثره — فالسياسة تُغيَّر وهي مرئيّة لا في الظلام.
 *
 * بنية ٣ طبقات: ما يسري الآن · المصفوفة · محاكاة الأثر قبل الحفظ.
 * الوصول: المدير العام وحده — من يقلب اتّجاه التكامل يغيّر مصدر الحقيقة كلّه.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenIntegrationPolicy, saveIntegrationPolicy } from '../../../services/integration/integrationPolicyService.js';
import {
  DIRECTIONS,
  DATA_SCOPES,
  MATRIX_COLUMNS,
  MONEY_MODES,
  TIMINGS,
  CONFLICT_MODES,
  policyTypes,
  fullPolicy,
  simulate,
  policySummary,
  policyProblems,
} from '../../../services/integration/integrationPolicy.js';
import { isPushSealed } from '../../../services/odoo/directionGuard.js';

const EDITOR_ROLES = ['admin'];
const input = 'bg-surface border border-line rounded-lg px-2 py-1 text-xs text-ink';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';
const card = 'rounded-xl border border-line bg-surface p-4';

const OPTIONS = {
  direction: DIRECTIONS,
  money: MONEY_MODES,
  timing: TIMINGS,
  onConflict: CONFLICT_MODES,
};

export default function IntegrationControl() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(fullPolicy({}));
  const [draft, setDraft] = useState(fullPolicy({}));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    return listenIntegrationPolicy((policy) => {
      setSaved(policy);
      if (!touched) setDraft(policy);
    }, (e) => setErr(e?.message || 'تعذّرت قراءة السياسة'));
  }, [me, touched]);

  const sim = useMemo(() => simulate(saved, draft), [saved, draft]);
  const summary = useMemo(() => policySummary(draft), [draft]);
  // ختمُ الاتّجاه ثابتٌ في الكود لا في السياسة — فلا يُقرأ من Firestore ولا يتغيّر بحفظ.
  const sealed = isPushSealed();
  const problems = useMemo(() => policyProblems(draft), [draft]);
  const rows = useMemo(() => [...DATA_SCOPES.map((s) => s.id), ...policyTypes()], []);

  const patch = (type, key, value) => {
    setTouched(true);
    setDraft((d) => ({ ...d, [type]: { ...d[type], [key]: value } }));
  };

  async function onSave() {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const clean = await saveIntegrationPolicy(draft, me);
      setDraft(clean);
      setTouched(false);
      setMsg('سرت السياسة — والجسر يسألها قبل كلّ دفع.');
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!EDITOR_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">لوحة التكامل للمدير العام وحده — من يقلب اتّجاهها يغيّر مصدر الحقيقة كلّه.</p>;
  }

  return (
    <div className="space-y-5">
      {/* ═══ ختم الاتّجاه (SAP-15) ═══
          يُعلن الحقيقة الحاكمة قبل أيّ رقمٍ في اللوحة: مهما قال الجدول أدناه،
          لا تعبر كتابةٌ إلى أودو. فلا يظنّ المدير أنّ قلب صفٍّ إلى «دفع» يكفي. */}
      {sealed && (
        <section className={card}>
          <div className="flex items-start gap-3">
            <svg
              viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"
              className="text-ink-2 shrink-0 mt-0.5"
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <div>
              <h2 className="text-base font-bold text-ink mb-1">الدفع إلى أودو مختوم</h2>
              <p className="text-sm text-ink-2">
                الاتّجاه المعتمد <span className="font-bold text-ink">سحبٌ فقط: أودو ← البوابة</span>.
                أودو هو مصدر الحقيقة المالي، والبوابة تستورد وتُحدّث ولا تكتب.
              </p>
              <p className="text-xs text-ink-2 mt-2">
                الختم عند حدّ النقل نفسه، فلا يُفكّه قلبُ صفٍّ في الجدول أدناه.
                وما من مسارٍ يتجاوزه. لفكّه: قرارُ مالكٍ صريح ثمّ تغيير
                {' '}<span className="font-mono text-ink">INTEGRATION_DIRECTION</span>{' '}
                في <span className="font-mono text-ink">odoo/directionGuard.js</span> — ولم يُحذف سطرُ دفعٍ واحد.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ═══ الطبقة ١: ما يسري الآن ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">ما يسري الآن</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
          {DIRECTIONS.map((d) => (
            <div key={d.id} className="rounded-lg bg-chip border border-line p-3">
              <div className="text-ink-2 text-xs mb-1">{d.labelAr}</div>
              <div className="text-ink text-lg">{summary.byDirection[d.id]}</div>
            </div>
          ))}
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">يرفع حقول مال</div>
            <div className={summary.moneyPush ? 'text-brand-red text-lg' : 'text-ink text-lg'}>{summary.moneyPush}</div>
          </div>
        </div>
        <p className="text-xs text-ink-2 mt-3">
          الافتراض هو السياسة المعتمدة: <span className="font-bold text-ink">لا يُدفع شيءٌ افتراضًا</span> —
          فما من نوعٍ يعبر لأنّ أحدًا نسي أن يقرّر. والمال يُسحب ولا يُرفع في كلّ الأحوال:
          أودو يولّد القيد والبوابة تُنتج الواقعة.
        </p>
      </section>

      {/* ═══ الطبقة ٣ (تُعرض قبل الجدول لأنّها القرار): محاكاة الأثر ═══ */}
      {(sim.changes.length > 0 || problems.length > 0) && (
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-1">أثر ما ستحفظه</h2>
          <p className="text-xs text-ink-2 mb-3">{sim.changes.length} تغييرًا — محسوبًا قبل الحفظ لا بعده.</p>

          {problems.map((p) => <p key={p} className="text-sm text-brand-red mb-1">{p}</p>)}
          {sim.warnings.map((w) => <p key={w} className="text-sm text-brand-red mb-1">{w}</p>)}

          <ul className="space-y-1 mt-2">
            {sim.changes.slice(0, 20).map((c) => (
              <li key={`${c.type}.${c.field}`} className="text-xs text-ink">
                <span className="font-bold">{c.type}</span> · {c.labelAr}: {String(c.from)} ← {String(c.to)}
              </li>
            ))}
          </ul>
          {sim.changes.length > 20 && <p className="text-xs text-ink-2 mt-1">…و{sim.changes.length - 20} تغييرًا آخر</p>}

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-line">
            <button className={btnPrimary} onClick={onSave} disabled={saving || problems.length > 0}>
              {saving ? 'جارٍ الحفظ…' : 'احفظ السياسة'}
            </button>
            <button className={btn} onClick={() => { setDraft(saved); setTouched(false); }} disabled={saving}>
              تراجع
            </button>
            {msg ? <span className="text-xs text-ink">{msg}</span> : null}
            {err ? <span className="text-xs text-brand-red">{err}</span> : null}
          </div>
        </section>
      )}

      {/* ═══ الطبقة ٢: المصفوفة ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">مصفوفة الأثر</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-2 border-b border-line">
                <th className="text-right font-bold py-2 px-2">النوع</th>
                {MATRIX_COLUMNS.map((c) => (
                  <th key={c.key} className="text-right font-bold py-2 px-2 whitespace-nowrap">{c.labelAr}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((type) => {
                const p = draft[type] || {};
                const scope = DATA_SCOPES.find((s) => s.id === type);
                return (
                  <tr key={type} className="border-b border-line/60">
                    <td className="py-1.5 px-2 text-ink whitespace-nowrap font-bold">{scope ? scope.labelAr : type}</td>
                    {MATRIX_COLUMNS.map((c) => (
                      <td key={c.key} className="py-1.5 px-2">
                        {c.kind === 'bool' ? (
                          <input
                            type="checkbox"
                            checked={p[c.key] !== false}
                            onChange={(e) => patch(type, c.key, e.target.checked)}
                          />
                        ) : (
                          <select className={input} value={p[c.key] || ''} onChange={(e) => patch(type, c.key, e.target.value)}>
                            {(OPTIONS[c.key] || []).map((o) => (
                              <option key={o.id} value={o.id}>{o.labelAr}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
