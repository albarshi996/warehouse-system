/**
 * أصولُ إدارة المستودعات وعهدُها ‹WH-501› — منظارٌ لا سجلٌّ رابع.
 *
 * ═══ ثلاثُ طبقاتٍ كنمط لوحات البوّابة ═══
 *   ① تدخّلٌ الآن — **ما يكسر التتبّع**: عهدةٌ ترقِّم أصلًا غيرَ موجود ·
 *      عهدتان مفتوحتان لجهازٍ واحد · عهدٌ مفتوحةٌ بلا رقمِ أصل · وأصولٌ
 *      بإدارةٍ تشبه إدارتَنا ولم تُطابق فسقطت من المنظار.
 *   ② لقطةٌ وإجراءات — ما نملكه، ما بيد الناس، وما هو حرّ.
 *   ③ الفهرسُ الكامل — بحثٌ ومرشّحاتٌ وحاملٌ لكلّ أصل.
 *
 * ═══ ★★★ ولا سجلَّ جديدًا ═══
 * الأصولُ من `department_assets` (الشاشةُ العامّة تكتبها)، والعهدُ من
 * `custodies` (شاشةُ العُهد تكتبها). وهذه الشاشةُ **تجمع وتربط وتُكمل
 * التفاصيل** — فالجهازُ الواحدُ سجلٌّ واحدٌ لا أربعة.
 *
 * ═══ ★★ ولا رقمَ يُحسب هنا ═══
 * `whSnapshot` و`linkReport` و`holderOf` و`filterWh` في `whDepartment`
 * المختبَر (٢٠ اختبارًا)، والشاشةُ تعرض وتستدعي.
 */
import { useEffect, useMemo, useState } from 'react';

import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { MANAGER_ROLES } from '../../../services/auth/roles.js';
import { ASSET_CONDITIONS } from '../../../services/assets/assetsModel.js';
import {
  EQUIPMENT_KINDS,
  WH_DEPARTMENT_LABEL,
  WH_DEPARTMENT_VALUES,
  custodyHistory,
  custodyIndex,
  describeSpecs,
  equipmentLabel,
  filterWh,
  holderOf,
  linkReport,
  specFields,
  specVerdict,
  splitByDepartment,
  whSnapshot,
} from '../../../services/assets/whDepartment.js';
import {
  listenDepartmentAssets,
  saveDepartmentAsset,
  appendAssetNote,
  listenAssetNotes,
} from '../../../services/assets/departmentAssetsService.js';
import { listenCustodies } from '../../../services/custody/custodyService.js';
import { buildWhReport } from '../../../services/assets/whReport.js';
import { exportVeneciaReportExcel } from '../../../services/assets/veneciaReportExcel.js';
import { todayLocal } from '../../../services/assets/departmentAssetsService.js';

const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

const inputCls =
  'w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent';

const CONDITION_VARIANT = {
  ممتاز: 'done', جيد: 'done', متوسط: 'progress', 'يحتاج صيانة': 'warn', معطل: 'danger',
};

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>
        {value}
      </div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-ink-2 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

export default function WhDepartmentAssets() {
  const [profile, setProfile] = useState(null);
  const [all, setAll] = useState([]);
  const [custodies, setCustodies] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState({ tone: '', text: '' });
  const [busy, setBusy] = useState('');

  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [condition, setCondition] = useState('');
  const [heldOnly, setHeldOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [openId, setOpenId] = useState('');
  const [specDraft, setSpecDraft] = useState(null); // { equipmentKind, specs }
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(
    () =>
      subscribeAuth(async (user) => {
        if (!user) return setProfile(null);
        setProfile(await fetchUserProfile(user).catch(() => null));
      }),
    []
  );

  useEffect(
    () =>
      listenDepartmentAssets(
        (list) => { setAll(list); setLoaded(true); setError(''); },
        (e) => {
          setLoaded(true);
          setError(
            e?.code === 'permission-denied'
              ? 'جردُ الأصول للمديرَين — وهذا حدٌّ في قاعدة البيانات لا في الشاشة.'
              : e?.message || 'تعذّرت قراءة الأصول.'
          );
        }
      ),
    []
  );

  // ★ العهدُ تُقرأ هنا لأنّها نصفُ الجواب: ما نملكه ومن يحمله.
  useEffect(() => listenCustodies((list) => setCustodies(list), () => setCustodies([])), []);

  useEffect(() => {
    if (!openId) return setNotes([]);
    return listenAssetNotes(openId, setNotes, () => setNotes([]));
  }, [openId]);

  const canWrite = MANAGER_ROLES.includes(profile?.role);
  const split = useMemo(() => splitByDepartment(all, WH_DEPARTMENT_VALUES), [all]);
  const index = useMemo(() => custodyIndex(custodies), [custodies]);
  const snap = useMemo(() => whSnapshot(all, custodies, WH_DEPARTMENT_VALUES), [all, custodies]);
  const link = useMemo(
    () => linkReport(split.inside.filter((a) => !a.archived), custodies),
    [split.inside, custodies]
  );
  const rows = useMemo(
    () => filterWh(split.inside, { q, kind, condition, heldOnly, freeOnly, includeArchived }, index),
    [split.inside, q, kind, condition, heldOnly, freeOnly, includeArchived, index]
  );
  const sorted = useMemo(
    () => [...rows].sort((x, y) => String(x.id).localeCompare(String(y.id))),
    [rows]
  );
  const open = useMemo(() => all.find((a) => a.id === openId) || null, [all, openId]);
  const openHolder = useMemo(() => (open ? holderOf(open, index) : null), [open, index]);

  /** مسارُ الأصول المنشور — تحتاجه مكتبةُ إكسل المستضافةُ ذاتيًّا. */
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const asOf = todayLocal();

  /** ★ التقريرُ يقول تصفياتِه — فلا يُقرأ جزءٌ على أنّه الكلّ. */
  const activeFilters = useMemo(() => {
    const f = [];
    if (q.trim()) f.push({ label: 'بحث', value: q.trim() });
    if (kind) f.push({ label: 'النوع', value: equipmentLabel(kind) });
    if (condition) f.push({ label: 'الحالة', value: condition });
    if (heldOnly) f.push({ label: 'المحمول فقط', value: 'نعم' });
    if (freeOnly) f.push({ label: 'الحرّ فقط', value: 'نعم' });
    if (includeArchived) f.push({ label: 'يشمل المكهَّن', value: 'نعم' });
    return f;
  }, [q, kind, condition, heldOnly, freeOnly, includeArchived]);

  const report = useMemo(
    () => buildWhReport(all, custodies, {
      asOf,
      scope: activeFilters.length ? 'أصولُ الإدارة (التقريرُ كاملٌ لا مُصفّى)' : 'أصولُ الإدارة كاملةً',
      filters: activeFilters,
    }),
    [all, custodies, asOf, activeFilters]
  );

  async function run(label, fn, done) {
    setBusy(label);
    setMsg({ tone: '', text: '' });
    try {
      const out = await fn();
      setMsg({ tone: 'ok', text: typeof done === 'function' ? done(out) : done });
    } catch (e) {
      setMsg({ tone: 'bad', text: e?.message || 'تعذّرت العمليّة.' });
    } finally {
      setBusy('');
    }
  }

  function startSpecs(a) {
    setSpecDraft({ equipmentKind: a.equipmentKind || '', specs: { ...(a.specs || {}) } });
  }

  const specProblems = specDraft ? specVerdict(specDraft.equipmentKind, specDraft.specs).problems : [];

  /** صفوفُ التدخّل — ولكلٍّ سببٌ مكتوب. */
  const attention = useMemo(() => {
    const out = [];
    for (const no of link.danglingAssetNos) {
      out.push({ key: `d-${no}`, tone: 'bad', text: `عهدةٌ ترقِّم الأصل ${no} ولا وجودَ له في الجرد` });
    }
    for (const a of link.held) {
      const h = holderOf(a, index);
      if (h?.conflict) {
        out.push({ key: `c-${a.id}`, tone: 'bad', text: `${a.id} «${a.assetName}» عليه ${num(h.conflict)} عهدٍ مفتوحة` });
      }
    }
    for (const c of link.unlinked.slice(0, 6)) {
      out.push({ key: `u-${c.number}`, tone: 'warn', text: `عهدةٌ ${c.number} لـ${c.employeeName} بلا رقمِ أصل — «${c.itemDesc}»` });
    }
    if (split.nearMiss.length) {
      out.push({
        key: 'near',
        tone: 'warn',
        text: `${num(split.nearMiss.length)} أصلًا بإدارةٍ تشبه إدارتَنا ولم تُطابق: ${[...new Set(split.nearMiss.map((a) => a.department))].join(' · ')}`,
      });
    }
    return out;
  }, [link, index, split.nearMiss]);

  return (
    <div dir="rtl" className="o_theme space-y-5">
      <section className="o_ds o_ds_card o_ds_pad">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
            <Icon name="warehouse" size={18} />
          </span>
          <div className="flex-1 min-w-[240px]">
            <div className="font-bold text-ink">أصول {WH_DEPARTMENT_LABEL} وعهدُها</div>
            <div className="text-xs text-muted leading-relaxed">
              منظارٌ على سجلّ الأصول وسجلّ العُهد معًا — <strong>ما نملكه ومن يحمله</strong>. ولا سجلَّ جديدًا:
              الأصلُ يُكتب في «جرد الأصول» والعهدةُ في «العُهد العينية»، وهنا يلتقيان ويُستكمل تفصيلُ المعدّة.
            </div>
          </div>
          <a className="btn btn-secondary btn-sm" href="../assets-inventory/">جرد الأصول</a>
          <a className="btn btn-secondary btn-sm" href="../custody/">العُهد العينية</a>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-xs p-2.5">{error}</div>
      )}
      {loaded && !error && !canWrite && (
        <div className="rounded-lg border border-line bg-surface-2 text-xs p-2.5 text-ink-2">
          أنت تقرأ ولا تكتب: تعديلُ الأصول للمدير العامّ ومدير المستودعات.
        </div>
      )}
      {msg.text && (
        <div className={`rounded-lg text-xs p-2.5 border whitespace-pre-line ${
          msg.tone === 'bad' ? 'border-brand-red/40 bg-brand-red/5 text-brand-red' : 'border-accent/40 bg-accent/5 text-ink-2'
        }`}>{msg.text}</div>
      )}

      {/* ═══ ① ما يكسر التتبّع ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="alertTriangle" size={16} className={attention.length ? 'text-brand-red' : 'text-muted'} />
          <div className="font-bold text-ink text-sm">ما يكسر التتبّع</div>
          <span className="text-[11px] text-muted">
            {attention.length ? `${num(attention.length)} موضعًا — وكلُّ سببٍ مكتوب` : 'لا شيء'}
          </span>
        </div>
        {!loaded && <div className="text-xs text-muted">تُقرأ الأصولُ والعهد…</div>}
        {loaded && !attention.length && !error && (
          <div className="text-xs text-muted">
            {split.inside.length ? 'كلُّ عهدةٍ ترقِّم أصلًا موجودًا، ولا جهازَ عليه عهدتان.' : 'لا أصلَ مسجَّلٌ لهذه الإدارة بعد.'}
          </div>
        )}
        <div className="space-y-1.5">
          {attention.map((r) => (
            <div key={r.key} className={`rounded-lg border p-2 text-[11px] ${
              r.tone === 'bad' ? 'border-brand-red/40 bg-brand-red/5 text-brand-red' : 'border-line bg-surface-2 text-ink-2'
            }`}>{r.text}</div>
          ))}
        </div>
      </section>

      {/* ═══ ② لقطة ═══ */}
      <section className="o_ds o_ds_card">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
          <Kpi label="أصولُ الإدارة" value={num(snap.assets)} hint={`${num(snap.archived)} مكهَّن`} />
          <Kpi label="بيد موظّفين" value={num(snap.held)} hint="عهدةٌ مفتوحةٌ بالرقم" />
          <Kpi label="حرٌّ بلا حامل" value={num(snap.free)} hint="في عهدة الإدارة" />
          <Kpi
            label="عهدٌ بلا رقمِ أصل"
            value={num(snap.unlinkedCustodies)}
            hint="لا يُعرف أيَّ جهازٍ تخصّ"
            tone={snap.unlinkedCustodies ? 'red' : ''}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-[11px] text-muted">
          <span className="font-bold text-ink-2">الأنواع:</span>
          {snap.byKind.length ? snap.byKind.map(([k, n]) => (
            <span key={k} className="rounded border border-line bg-surface-2 px-1.5 py-0.5">
              {equipmentLabel(k)} {num(n)}
            </span>
          )) : <span>لم يُصنَّف شيءٌ بعد — افتح أصلًا وحدّد نوعَ المعدّة.</span>}
          <button
            type="button"
            className="btn btn-primary btn-sm ms-auto"
            disabled={!!busy}
            onClick={() =>
              run(
                'يُنسَّق…',
                () => exportVeneciaReportExcel(report, { baseUrl: base, fileName: `تقرير-أصول-إدارة-المستودعات-${asOf}` }),
                (name) => `نُزّل ${name} — ملخّصٌ والأصولُ والعُهد.`
              )
            }
          >
            تقريرٌ منسَّق (إكسل)
          </button>
          {busy && <span className="font-bold text-accent">{busy}</span>}
        </div>
      </section>

      {/* ═══ لوحُ الأصل ═══ */}
      {open && (
        <section className="o_ds o_ds_card o_ds_pad space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-ink-2">{open.id}</span>
            <span className="font-bold text-ink">{open.assetName}</span>
            <Badge variant={CONDITION_VARIANT[open.condition] || 'draft'}>{open.condition || '—'}</Badge>
            {open.equipmentKind && <Badge variant="progress">{equipmentLabel(open.equipmentKind)}</Badge>}
            {openHolder ? (
              <span className="text-[11px] text-ink-2">
                بيد <strong>{openHolder.employeeName}</strong> — سند {openHolder.custody.number}
                {openHolder.conflict ? ` (وعليه ${num(openHolder.conflict)} عهدٍ مفتوحة)` : ''}
              </span>
            ) : (
              <span className="text-[11px] text-muted">حرٌّ — لا عهدةَ مفتوحةٌ عليه</span>
            )}
            <button type="button" className="btn btn-secondary btn-sm ms-auto" onClick={() => setOpenId('')}>أغلق</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* تفاصيلُ المعدّة */}
            <div className="rounded-lg border border-line p-3 space-y-2">
              <div className="font-bold text-[13px] text-ink flex items-center gap-1.5">
                <Icon name="wrench" size={14} /> تفاصيلُ المعدّة
              </div>
              {!specDraft ? (
                <>
                  <div className="text-[11px] text-ink-2">
                    {open.equipmentKind
                      ? describeSpecs(open.equipmentKind, open.specs) || 'النوعُ محدَّدٌ ولا تفاصيلَ بعد.'
                      : 'لم يُحدَّد نوعُ المعدّة بعد.'}
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!canWrite} onClick={() => startSpecs(open)}>
                    {open.equipmentKind ? 'عدّل التفاصيل' : 'حدّد النوع والتفاصيل'}
                  </button>
                </>
              ) : (
                <>
                  <Field label="نوعُ المعدّة">
                    <select
                      className={inputCls}
                      value={specDraft.equipmentKind}
                      onChange={(e) => setSpecDraft({ equipmentKind: e.target.value, specs: {} })}
                    >
                      <option value="">— اختر —</option>
                      {EQUIPMENT_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {specFields(specDraft.equipmentKind).map((f) => (
                      <Field key={f.key} label={f.label}>
                        <input
                          className={inputCls}
                          type={f.numeric ? 'number' : 'text'}
                          min={f.numeric ? '0' : undefined}
                          value={specDraft.specs[f.key] ?? ''}
                          onChange={(e) => setSpecDraft({
                            ...specDraft,
                            specs: { ...specDraft.specs, [f.key]: e.target.value },
                          })}
                        />
                      </Field>
                    ))}
                  </div>
                  {!!specProblems.length && (
                    <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-[11px] p-2">
                      {specProblems.map((p) => <div key={p}>• {p}</div>)}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!canWrite || !!busy || !!specProblems.length}
                      onClick={() =>
                        run(
                          'تُحفظ…',
                          () => saveDepartmentAsset({ ...open, ...specDraft }, profile, { mode: 'edit' }),
                          () => { setSpecDraft(null); return 'حُفظت تفاصيلُ المعدّة.'; }
                        )
                      }
                    >
                      احفظ
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSpecDraft(null)}>إلغاء</button>
                  </div>
                </>
              )}
            </div>

            {/* تاريخُ الحَمَلة */}
            <div className="rounded-lg border border-line p-3 space-y-2">
              <div className="font-bold text-[13px] text-ink flex items-center gap-1.5">
                <Icon name="users" size={14} /> من حمله
              </div>
              {(() => {
                const hist = custodyHistory(open, index);
                if (!hist.length) return <div className="text-[11px] text-muted">لا عهدةَ تُرقِّم هذا الأصل.</div>;
                return (
                  <div className="space-y-1.5 max-h-52 overflow-auto">
                    {hist.map((c) => (
                      <div key={c.number} className="rounded border border-line bg-surface-2 p-2">
                        <div className="text-[12px] text-ink">
                          {c.employeeName} — <span className="font-mono text-[10px]">{c.number}</span>
                        </div>
                        <div className="text-[10px] text-muted">
                          {c.issueDate || '—'} · {c.state === 'active' ? 'مفتوحة' : `أُغلقت: ${c.state}`}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <a className="btn btn-secondary btn-sm" href="../custody/">افتح العُهد لتسليمٍ أو إرجاع</a>
            </div>
          </div>

          {/* الملاحظات */}
          <div className="rounded-lg border border-line p-3 space-y-2">
            <div className="font-bold text-[13px] text-ink flex items-center gap-1.5">
              <Icon name="notebook" size={14} /> سجلُّ الملاحظات
              <span className="text-[10px] font-normal text-muted">يُلحَق ولا يُعدَّل</span>
            </div>
            <div className="flex items-end gap-2">
              <Field label="ملاحظةٌ جديدة">
                <input className={inputCls} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
              </Field>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canWrite || !!busy || !noteDraft.trim()}
                onClick={() => run('تُقيَّد…', () => appendAssetNote(open.id, noteDraft, profile), () => { setNoteDraft(''); return 'قُيّدت الملاحظة.'; })}
              >
                أضف
              </button>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-auto">
              {!notes.length && <div className="text-[11px] text-muted">لا ملاحظةَ بعد.</div>}
              {notes.map((n) => (
                <div key={n.id} className="rounded border border-line bg-surface-2 p-2">
                  <div className="text-[12px] text-ink">{n.text}</div>
                  <div className="text-[10px] text-muted">{n.day || '—'} · {n.byName || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ ③ الفهرس ═══ */}
      <section className="o_ds o_ds_card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <Icon name="search" size={14} className="text-muted" />
            <input
              className={inputCls}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث: الرقم · الاسم · النوع · المواصفة · الحامل · الموقع"
            />
          </div>
          <select className={`${inputCls} max-w-[170px]`} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">كلُّ الأنواع</option>
            {EQUIPMENT_KINDS.map((k) => (<option key={k.id} value={k.id}>{k.label}</option>))}
          </select>
          <select className={`${inputCls} max-w-[140px]`} value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">كلُّ الحالات</option>
            {ASSET_CONDITIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <input type="checkbox" checked={heldOnly} onChange={(e) => { setHeldOnly(e.target.checked); if (e.target.checked) setFreeOnly(false); }} />
            المحمول فقط
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <input type="checkbox" checked={freeOnly} onChange={(e) => { setFreeOnly(e.target.checked); if (e.target.checked) setHeldOnly(false); }} />
            الحرّ فقط
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
            أظهر المكهَّن
          </label>
          <span className="text-[11px] text-muted ms-auto">{num(sorted.length)} من {num(split.inside.length)}</span>
        </div>

        {!sorted.length ? (
          <div className="p-6 text-center text-xs text-muted">
            {split.inside.length ? 'لا أصلَ يطابق التصفية.' : `لا أصلَ مسجَّلٌ بإدارةٍ من: ${WH_DEPARTMENT_VALUES.join(' · ')}`}
          </div>
        ) : (
          <ListView
            selectable={false}
            onRowClick={(r) => { setOpenId(r.id); setSpecDraft(null); setNoteDraft(''); }}
            columns={[
              { key: 'no', label: 'رقم الأصل', width: '110px' },
              { key: 'name', label: 'اسم الأصل' },
              { key: 'kind', label: 'النوع', width: '140px' },
              { key: 'specs', label: 'التفاصيل' },
              { key: 'holder', label: 'بيد', width: '140px' },
              { key: 'loc', label: 'الموقع', width: '110px' },
              { key: 'cond', label: 'الحالة', width: '110px' },
            ]}
            rows={sorted.map((a) => {
              const h = holderOf(a, index);
              return {
                id: a.id,
                decoration: a.archived ? 'muted' : undefined,
                cells: {
                  no: <span className="font-mono text-[11px]">{a.id}</span>,
                  name: <span className={a.archived ? 'text-muted line-through' : ''}>{a.assetName}</span>,
                  kind: <span className="text-[11px]">{a.equipmentKind ? equipmentLabel(a.equipmentKind) : '—'}</span>,
                  specs: <span className="text-[11px] text-muted">{describeSpecs(a.equipmentKind, a.specs) || '—'}</span>,
                  holder: h ? (
                    <span className={`text-[11px] ${h.conflict ? 'text-brand-red font-bold' : ''}`}>
                      {h.employeeName}{h.conflict ? ` (${num(h.conflict)})` : ''}
                    </span>
                  ) : <span className="text-[11px] text-muted">حرّ</span>,
                  loc: <span className="text-[11px]">{a.location || '—'}</span>,
                  cond: <Badge variant={CONDITION_VARIANT[a.condition] || 'draft'}>{a.condition || '—'}</Badge>,
                },
              };
            })}
          />
        )}
      </section>
    </div>
  );
}
