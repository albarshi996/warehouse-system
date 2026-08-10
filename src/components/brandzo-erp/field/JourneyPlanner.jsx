/**
 * محرّر خطط الزيارات — أداة المشرف التي بلا فائدةٍ لولاها.
 *
 * شاشة المندوب تقرأ خطّةً، فلو لم يكن ثمّة من يضعها بقيت فارغةً أبدًا. هذا هو
 * الطرف الثاني: من يزور مَن، في أيّ أيّام، وبأيّ ترتيب.
 *
 * **الترتيب ليس زينة**: خطّ سيرٍ مرتّبٌ جغرافيًّا يوفّر وقودًا وساعات، ومرتّبٌ
 * عشوائيًّا يجعل المندوب يقطع المدينة ذهابًا وإيابًا. ولذلك التسلسل حقلٌ صريح
 * يُحرَّك بالأسهم، لا ترتيبَ إدخالٍ صامتًا.
 */
import { useMemo, useState } from 'react';
import { saveJourneyPlan, setPlanActive } from '../../../services/field/fieldService.js';
import { FREQUENCIES, WEEKDAYS, isDueOn } from '../../../services/field/journeyPlan.js';

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';

const blank = () => ({
  id: '',
  name: '',
  route: '',
  repUid: '',
  repName: '',
  frequency: 'weekly',
  weekdays: [6],
  startDate: new Date().toISOString().slice(0, 10),
  customers: [],
  active: true,
});

export default function JourneyPlanner({ me, plans, customers, reps, day }) {
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState('');

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const available = useMemo(() => {
    const taken = new Set((draft?.customers || []).map((c) => c.code));
    return customers.filter((c) => !taken.has(String(c.code).toUpperCase()));
  }, [customers, draft]);

  const addCustomer = () => {
    const c = customers.find((x) => String(x.code).toUpperCase() === pick);
    if (!c) return;
    set({
      customers: [
        ...(draft.customers || []),
        { code: String(c.code).toUpperCase(), name: c.nameAr || '', seq: (draft.customers?.length || 0) + 1 },
      ],
    });
    setPick('');
  };

  const move = (i, dir) => {
    const rows = [...draft.customers];
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    set({ customers: rows.map((r, k) => ({ ...r, seq: k + 1 })) });
  };

  const remove = (i) =>
    set({ customers: draft.customers.filter((_, k) => k !== i).map((r, k) => ({ ...r, seq: k + 1 })) });

  const toggleDay = (id) => {
    const has = draft.weekdays.includes(id);
    set({ weekdays: has ? draft.weekdays.filter((d) => d !== id) : [...draft.weekdays, id] });
  };

  const problems = useMemo(() => {
    if (!draft) return [];
    const out = [];
    if (!draft.name.trim()) out.push('اسم الخطّة مطلوب');
    if (!draft.repUid) out.push('لا خطّة بلا مندوب مسؤول');
    if (!draft.weekdays.length) out.push('اختر يومًا واحدًا على الأقلّ');
    if (!draft.customers.length) out.push('أضف متجرًا واحدًا على الأقلّ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) out.push('تاريخ البدء مطلوب (تُحسب منه الدورة)');
    return out;
  }, [draft]);

  const save = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const rep = reps.find((r) => r.uid === draft.repUid);
      await saveJourneyPlan({ ...draft, repName: rep?.displayName || rep?.email || draft.repName }, me);
      setMsg('حُفظت الخطّة.');
      setDraft(null);
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {err ? <div className="border border-red-500/40 bg-red-500/5 text-red-600 rounded-lg px-4 py-3 text-sm">{err}</div> : null}
      {msg ? <div className="border border-line bg-chip text-ink rounded-lg px-4 py-3 text-sm">{msg}</div> : null}

      {!draft ? (
        <>
          <button type="button" className={btnPrimary} onClick={() => setDraft(blank())}>
            خطّة جديدة
          </button>

          {!plans.length ? (
            <p className="text-sm text-ink-2">لا خطط بعد — أنشئ الأولى ليجد المندوب يومه محمَّلًا.</p>
          ) : (
            <ul className="space-y-2">
              {plans.map((p) => (
                <li key={p.id} className="border border-line rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-ink">
                        {p.name || p.route || p.id}
                        {p.active === false ? ' — معطّلة' : ''}
                        {isDueOn(p, day) ? ' · مستحقّة اليوم' : ''}
                      </div>
                      <div className="text-xs text-ink-2">
                        {p.repName || '—'} · {FREQUENCIES[p.frequency]?.labelAr || p.frequency} ·{' '}
                        {(p.weekdays || []).map((d) => WEEKDAYS.find((w) => w.id === d)?.labelAr).filter(Boolean).join('، ')} ·{' '}
                        {(p.customers || []).length} متجرًا
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className={btn} onClick={() => setDraft({ ...blank(), ...p })}>
                        تعديل
                      </button>
                      <button
                        type="button"
                        className={btn}
                        onClick={() => setPlanActive(p.id, p.active === false, me).catch((e) => setErr(e.message))}
                      >
                        {p.active === false ? 'تفعيل' : 'تعطيل'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-4 border border-line rounded-xl p-4">
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-sm text-ink-2">
              اسم الخطّة
              <input className={`${input} mt-1`} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="خطّ بنغازي الشرقي" />
            </label>
            <label className="text-sm text-ink-2">
              خطّ السير
              <input className={`${input} mt-1`} value={draft.route} onChange={(e) => set({ route: e.target.value })} placeholder="R-01" />
            </label>
            <label className="text-sm text-ink-2">
              المندوب
              <select className={`${input} mt-1`} value={draft.repUid} onChange={(e) => set({ repUid: e.target.value })}>
                <option value="">— اختر المندوب —</option>
                {reps.map((r) => (
                  <option key={r.uid} value={r.uid}>{r.displayName || r.email}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink-2">
              الدوريّة
              <select className={`${input} mt-1`} value={draft.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                {Object.values(FREQUENCIES).map((f) => (
                  <option key={f.id} value={f.id}>{f.labelAr}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink-2">
              تاريخ البدء
              <input type="date" className={`${input} mt-1`} value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </label>
          </div>

          <div>
            <div className="text-sm text-ink-2 mb-2">أيّام الزيارة</div>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleDay(w.id)}
                  className={`rounded-lg px-3 py-2 text-sm border ${
                    draft.weekdays.includes(w.id) ? 'border-accent bg-chip text-ink' : 'border-line text-ink-2'
                  }`}
                >
                  {w.labelAr}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-ink-2 mb-2">
              المتاجر بترتيب الزيارة ({draft.customers.length}) — الترتيب يوفّر وقودًا وساعات
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <select className={`${input} max-w-sm`} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">— أضف متجرًا —</option>
                {available.map((c) => (
                  <option key={c.code} value={String(c.code).toUpperCase()}>
                    {c.nameAr} ({c.code})
                  </option>
                ))}
              </select>
              <button type="button" className={btn} disabled={!pick} onClick={addCustomer}>إضافة</button>
            </div>
            <ol className="space-y-1">
              {draft.customers.map((c, i) => (
                <li key={c.code} className="flex items-center justify-between gap-2 border border-line rounded-lg px-3 py-2">
                  <span className="text-sm text-ink">{i + 1}. {c.name || c.code} <span className="text-ink-2 text-xs">({c.code})</span></span>
                  <span className="flex gap-1">
                    <button type="button" className={btn} onClick={() => move(i, -1)} aria-label="لأعلى">↑</button>
                    <button type="button" className={btn} onClick={() => move(i, 1)} aria-label="لأسفل">↓</button>
                    <button type="button" className={btn} onClick={() => remove(i)} aria-label="حذف">×</button>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {problems.length ? (
            <ul className="text-sm text-red-600 list-disc pr-5 space-y-1">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          ) : null}

          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={problems.length > 0 || saving} onClick={save}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ الخطّة'}
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
