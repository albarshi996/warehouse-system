/**
 * لوحةُ جرد **مخزن فينسيا** — الشاشةُ الموصولةُ بالسحابة (طلبُ المالك 2026-10-19).
 *
 * ═══ ثلاثُ طبقاتٍ كنمط لوحات البوّابة ═══
 *   ① تدخّلٌ الآن — أصلٌ معطلٌ أو كمّيّةٌ صفرٌ أو فرقُ جردٍ أو لم يُجرَد قطّ،
 *      **وكلُّ سببٍ مكتوبٌ بجواره** فلا يُترك الموظّفُ يبحث عن العلّة.
 *   ② لقطةٌ وإجراءاتٌ سريعة — أرقامُ المجموعتين وتقدّمُ الجرد، وأربعةُ أزرار.
 *   ③ الفهرسُ الكامل — بحثٌ وأربعُ مُرشّحات، وجدولُ نظام أودو.
 *
 * ═══ ★★★ ولا رقمَ يُحسب هنا ═══
 * `veneciaSnapshot` و`attentionRows` و`filterVenecia` و`countVariance` في
 * `veneciaModel` المختبَر (٣٢ اختبارًا). والشاشةُ **تعرض وتستدعي** — فالعطبُ
 * الذي يُمسكه اختبارٌ لا يُمسكه نظرٌ في لقطة.
 *
 * ═══ وسابقتُها `/dashboard/assets-inventory` تبقى كما هي ═══
 * تلك شاشةُ أصولٍ عامّةٌ لكلّ الإدارات، و**بلا تخزينٍ قطّ** (`let assets = []`
 * في الذاكرة، فكلُّ ما يُدخَل يضيع عند التحديث). ورابطُها لا يُحذف ولا
 * يُغيَّر — قاعدةُ البوّابة. وهذه لوحةُ فينسيا، تكتب في Firestore.
 */
import { useEffect, useMemo, useState } from 'react';

import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { MANAGER_ROLES } from '../../../services/auth/roles.js';
import { ASSET_CONDITIONS } from '../../../services/assets/assetsModel.js';
import {
  POPULATIONS,
  UNCLASSIFIED,
  assetCategory,
  attentionRows,
  categoriesOf,
  countVariance,
  filterVenecia,
  isCounted,
  nextAssetNoIn,
  populationLabel,
  rawQty,
  veneciaSnapshot,
} from '../../../services/assets/veneciaModel.js';
import {
  appendAssetNote,
  archiveVeneciaAsset,
  importVeneciaSeed,
  listenAssetNotes,
  listenVeneciaAssets,
  recordAssetCount,
  restoreVeneciaAsset,
  saveVeneciaAsset,
  settleAssetCount,
  todayLocal,
} from '../../../services/assets/veneciaService.js';
import { exportVeneciaAssets } from '../../../services/assets/veneciaExport.js';
import { listenVeneciaCards } from '../../../services/assets/veneciaCardsService.js';
import VeneciaReport from './VeneciaReport.jsx';
import VeneciaPhotos from './VeneciaPhotos.jsx';
import seed from '../../../data/venecia-assets-seed.json';

/** أرقامٌ لاتينيّةٌ دائمًا — قاعدةُ البوّابة. */
const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

/**
 * رقمٌ منسَّقٌ بإشارته معزولًا — `signedText` وحدَه يأخذ رقمًا خامًا،
 * وتمريرُ المنسَّق إليه يُضيع إشارةَ الموجب عند أوّل فاصلةُ آلاف.
 */
const signedNum = (n) => `‎${Number(n) > 0 ? '+' : ''}${num(n)}‎`;

/** شارةُ الحالة بمفردات نظام أودو — والأحمرُ للتحذير وحدَه. */
const CONDITION_VARIANT = {
  ممتاز: 'done',
  جيد: 'done',
  متوسط: 'progress',
  'يحتاج صيانة': 'warn',
  معطل: 'danger',
};

const EMPTY_FORM = {
  id: '',
  population: 'issue',
  assetName: '',
  brand: '',
  serial: '',
  qty: '',
  condition: 'جيد',
  responsible: '',
  department: 'مخزن فينسيا',
  section: '',
  location: 'فينسيا',
  receivedDate: '',
  notes: '',
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

function Field({ label, children, hint, required }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-ink-2 mb-1">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent';

export default function VeneciaAssets() {
  const [profile, setProfile] = useState(null);
  const [assets, setAssets] = useState([]);
  // بطاقاتُ الحركة تُقرأ هنا **للتقرير وحدَه** — واللوحةُ لا تعرضها،
  // فتقريرٌ عن مستودعٍ لا يذكر ما خرج منه ودخل إليه تقريرٌ ناقص.
  const [cards, setCards] = useState([]);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState({ tone: '', text: '' });
  const [busy, setBusy] = useState('');

  // الفهرس
  const [q, setQ] = useState('');
  const [population, setPopulation] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [uncountedOnly, setUncountedOnly] = useState(false);

  // الألواح
  const [form, setForm] = useState(null); // { ...record, mode }
  const [openId, setOpenId] = useState(''); // docId المفتوح في لوح الأصل
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [countDraft, setCountDraft] = useState('');
  const [archiveDraft, setArchiveDraft] = useState('');

  const today = todayLocal();

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
      listenVeneciaAssets(
        (list, hasPending) => {
          setAssets(list);
          setPending(hasPending);
          setLoaded(true);
          setError('');
        },
        (e) => {
          setLoaded(true);
          setError(
            e?.code === 'permission-denied'
              ? 'جردُ فينسيا للمديرَين — وهذا حدٌّ في قاعدة البيانات لا في الشاشة.'
              : e?.message || 'تعذّرت قراءة الجرد.'
          );
        }
      ),
    []
  );

  useEffect(() => listenVeneciaCards(setCards, () => setCards([])), []);

  useEffect(() => {
    if (!openId) return setNotes([]);
    return listenAssetNotes(openId, setNotes, () => setNotes([]));
  }, [openId]);

  const canWrite = MANAGER_ROLES.includes(profile?.role);
  const snap = useMemo(() => veneciaSnapshot(assets), [assets]);
  const attention = useMemo(() => attentionRows(assets, { asOf: today }), [assets, today]);
  const categories = useMemo(() => categoriesOf(assets.filter((a) => !a.archived)), [assets]);
  const urgent = useMemo(() => attention.filter((r) => r.tier === 'now'), [attention]);
  const backlog = useMemo(() => attention.filter((r) => r.tier === 'backlog'), [attention]);
  const rows = useMemo(
    () => filterVenecia(assets, { q, population, category, condition, includeArchived, uncountedOnly }),
    [assets, q, population, category, condition, includeArchived, uncountedOnly]
  );
  const open = useMemo(() => assets.find((a) => a.docId === openId) || null, [assets, openId]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (x, y) => x.population.localeCompare(y.population) || String(x.id).localeCompare(String(y.id))
      ),
    [rows]
  );

  /**
   * مسارُ الأصول المنشور — تحتاجه مكتبةُ إكسل المستضافةُ ذاتيًّا.
   * ★ ويُقرأ **محروسًا**: `import.meta.env` تحقنها أداةُ البناء، وقراءةٌ
   * مباشرةٌ تُسقط **الشاشة كلَّها** حيث لا تُحقن — وزرُّ تقريرٍ
   * لا يستأهل أن يأخذ الجردَ معه.
   */
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

  /**
   * ★ التقريرُ يقول نطاقَه وتصفياتِه صراحةً — فملفٌّ يُرسل عن جزءٍ من الجرد
   * ولا يقول إنّه جزءٌ يُقرأ على أنّه الكلّ.
   */
  const activeFilters = useMemo(() => {
    const f = [];
    if (q.trim()) f.push({ label: 'بحث', value: q.trim() });
    if (population) f.push({ label: 'المجموعة', value: populationLabel(population) });
    if (category) f.push({ label: 'التصنيف', value: category });
    if (condition) f.push({ label: 'الحالة', value: condition });
    if (uncountedOnly) f.push({ label: 'ما لم يُجرَد فقط', value: 'نعم' });
    if (includeArchived) f.push({ label: 'يشمل المكهَّن', value: 'نعم' });
    return f;
  }, [q, population, category, condition, uncountedOnly, includeArchived]);

  const scopeText = activeFilters.length ? 'الجردُ بعد التصفية' : 'الجرد كاملًا';

  /** يُشغّل عملًا سحابيًّا ويقول نتيجته — والخطأُ يُعرض بنصّه لا يُبتلع. */
  async function run(label, fn, done) {
    setBusy(label);
    setMsg({ tone: '', text: '' });
    try {
      const out = await fn();
      setMsg({ tone: 'ok', text: typeof done === 'function' ? done(out) : done });
    } catch (e) {
      setMsg({ tone: 'bad', text: e?.message || 'تعذّر الحفظ.' });
    } finally {
      setBusy('');
    }
  }

  function startAdd() {
    setForm({
      ...EMPTY_FORM,
      id: nextAssetNoIn(assets, 'issue'),
      mode: 'create',
    });
  }

  function startEdit(a) {
    setForm({ ...EMPTY_FORM, ...a, qty: String(rawQty(a.qty)), mode: 'edit' });
  }

  /** تغييرُ المجموعة في نموذج الإضافة يُعيد اقتراحَ الرقم — لكلّ تسلسلٍ رقمُه. */
  function onPopulationChange(next) {
    setForm((f) =>
      f.mode === 'create' ? { ...f, population: next, id: nextAssetNoIn(assets, next) } : { ...f, population: next }
    );
  }

  const submitForm = (e) => {
    e.preventDefault();
    const record = { ...form, qty: form.qty === '' ? 0 : Number(form.qty) };
    run(
      'يُحفظ…',
      () => saveVeneciaAsset(record, profile, { mode: form.mode }),
      () => {
        setForm(null);
        return `حُفظ ${record.id} — ${record.assetName}.`;
      }
    );
  };

  return (
    <div dir="rtl" className="o_theme space-y-5">
      {/* ═══ الترويسة ═══ */}
      <section className="o_ds o_ds_card o_ds_pad">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
            <Icon name="warehouse" size={18} />
          </span>
          <div className="flex-1 min-w-[240px]">
            <div className="font-bold text-ink">جرد مخزن فينسيا</div>
            <div className="text-xs text-muted leading-relaxed">
              مجموعتان: <strong>بضاعة الصرف</strong> و<strong>أصول المدعوم</strong> — وأرقامُهما تتصادم،
              فهويّةُ الأصل هي المجموعةُ مع الرقم. وكلُّ ما يُكتب هنا يُحفظ في قاعدة البيانات.
            </div>
          </div>
          {pending && (
            <span className="text-[11px] font-bold text-ink-2 flex items-center gap-1">
              <Icon name="history" size={13} /> تُرفع…
            </span>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-xs p-2.5">
          {error}
        </div>
      )}

      {loaded && !error && !canWrite && (
        <div className="rounded-lg border border-line bg-surface-2 text-xs p-2.5 text-ink-2">
          أنت تقرأ ولا تكتب: تعديلُ الجرد للمدير العامّ ومدير المستودعات — وهو حدٌّ في قاعدة البيانات.
        </div>
      )}

      {msg.text && (
        <div
          className={`rounded-lg text-xs p-2.5 border ${
            msg.tone === 'bad'
              ? 'border-brand-red/40 bg-brand-red/5 text-brand-red whitespace-pre-line'
              : 'border-accent/40 bg-accent/5 text-ink-2'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ═══ الطبقة ① — تدخّلٌ الآن ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="alertTriangle" size={16} className={urgent.length ? 'text-brand-red' : 'text-muted'} />
          <div className="font-bold text-ink text-sm">تدخّلٌ الآن</div>
          <span className="text-[11px] text-muted">
            {urgent.length ? `${num(urgent.length)} أصلًا — والسببُ مكتوبٌ بجوار كلٍّ` : 'لا شيء'}
          </span>
        </div>
        {!loaded && <div className="text-xs text-muted">يُقرأ الجرد…</div>}
        {loaded && !urgent.length && !error && (
          <div className="text-xs text-muted">
            {assets.length
              ? 'لا عطبَ قائمًا: لا حالةَ معطلةً ولا كمّيّةَ صفرٍ ولا فرقَ جردٍ معلَّقًا.'
              : 'لا جردَ في قاعدة البيانات بعد — استورد الجرد الأوّل من الإجراءات أدناه.'}
          </div>
        )}
        <div className="space-y-2">
          {urgent.slice(0, 10).map((a) => (
            <div
              key={a.docId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2.5"
            >
              <span className="font-mono text-[11px] text-ink-2 shrink-0">{a.id}</span>
              <span className="font-bold text-[13px] text-ink flex-1 min-w-[140px]">{a.assetName}</span>
              <span className="text-[10px] text-muted">{populationLabel(a.population)}</span>
              <Badge variant={CONDITION_VARIANT[a.condition] || 'draft'}>{a.condition || '—'}</Badge>
              <span className="text-[11px] text-ink-2">
                مسجَّل {num(rawQty(a.qty))}
                {isCounted(a) ? ` · معدود ${num(a.countedQty)}` : ''}
              </span>
              <span className="flex flex-wrap gap-1">
                {a.reasons.map((r) => (
                  <span
                    key={r}
                    className="text-[10px] rounded border border-brand-red/30 bg-brand-red/5 text-brand-red px-1.5 py-0.5"
                  >
                    {r}
                  </span>
                ))}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setOpenId(a.docId);
                  setCountDraft(String(rawQty(a.qty)));
                }}
              >
                افتحه
              </button>
            </div>
          ))}
          {urgent.length > 10 && (
            <div className="text-[11px] text-muted">
              و{num(urgent.length - 10)} أصلًا آخر — تُرى كلُّها في الفهرس أدناه.
            </div>
          )}
        </div>
        {/* المتراكمُ درجةٌ ثانيةٌ لا إنذار: «لم يُجرَد قطّ» حالةُ يومٍ أوّلَ لا عطب. */}
        {!!backlog.length && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5 text-[11px] text-ink-2">
            <Icon name="clipboardList" size={13} className="text-muted" />
            <span>
              و<strong>{num(backlog.length)}</strong> أصلًا لم يُجرَد بعد — وهذا عملُ الجرد لا عطبٌ فيه.
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setUncountedOnly(true);
                setQ('');
                setCondition('');
                setCategory('');
              }}
            >
              اعرضها في الفهرس
            </button>
          </div>
        )}
      </section>

      {/* ═══ الطبقة ② — لقطةٌ وإجراءاتٌ سريعة ═══ */}
      <section className="o_ds o_ds_card">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
          <Kpi label="أصولٌ في الجرد" value={num(snap.assets)} hint={`${num(snap.units)} وحدة`} />
          {snap.perPopulation.map((p) => (
            <Kpi key={p.id} label={p.label} value={num(p.assets)} hint={`${num(p.units)} وحدة`} />
          ))}
          <Kpi
            label="يحتاج تدخّلًا"
            value={num(snap.needsAttention)}
            hint="معطل أو يحتاج صيانة"
            tone={snap.needsAttention ? 'red' : ''}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line border-t border-line">
          <Kpi label="جُرد" value={num(snap.count.counted)} hint={`من ${num(snap.count.total)}`} />
          <Kpi
            label="لم يُجرَد"
            value={num(snap.count.pending)}
            hint="لا عدَّ فعليًّا بعد"
            tone={snap.count.pending ? 'red' : ''}
          />
          <Kpi
            label="فروقٌ ظاهرة"
            value={num(snap.count.variances)}
            hint={`الصافي ${signedNum(snap.count.netVariance)}`}
            tone={snap.count.variances ? 'red' : ''}
          />
          <Kpi label="مكهَّن" value={num(snap.archived)} hint="خارجَ كلّ رقمٍ أعلاه" />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={startAdd} disabled={!canWrite || !!busy}>
            أضف أصلًا
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canWrite || !!busy}
            onClick={() =>
              run(
                'يُستورد…',
                () => importVeneciaSeed(seed.assets, profile),
                (out) =>
                  out.written
                    ? `استُورد ${num(out.written)} أصلًا، وتُخطّي ${num(out.skipped)} موجودًا سلفًا.`
                    : `لا جديد — الأصولُ ${num(out.skipped)} كلُّها في قاعدة البيانات.`
              )
            }
          >
            استورد الجرد الأوّل ({num(seed.assets.length)})
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!sorted.length || !!busy}
            onClick={() =>
              run(
                'يُصدَّر…',
                async () =>
                  exportVeneciaAssets(sorted, { fileName: `جرد-مخزن-فينسيا-${today}` }),
                (name) => `نُزّل ${name} بـ${num(sorted.length)} صفًّا — المعروضُ بعد التصفية.`
              )
            }
          >
            صدّر المعروض إلى إكسل
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            اطبع
          </button>
          {busy && <span className="text-[11px] font-bold text-accent">{busy}</span>}
          <span className="text-[10px] text-muted ms-auto">
            بذرةُ الجرد من ملفّات {seed.asOf} — ولا يدهس الاستيرادُ ما جُرد.
          </span>
        </div>
      </section>

      {/* ═══ التقريرُ المنسَّق — إكسل وPDF من مصدرٍ واحد ═══ */}
      <VeneciaReport
        assets={assets}
        cards={cards}
        baseUrl={base}
        scope={scopeText}
        filters={activeFilters}
      />

      {/* ═══ نموذجُ الإضافة والتعديل ═══ */}
      {form && (
        <form onSubmit={submitForm} className="o_ds o_ds_card o_ds_pad space-y-3">
          <div className="flex items-center gap-2">
            <Icon name={form.mode === 'create' ? 'plus' : 'wrench'} size={16} className="text-accent" />
            <div className="font-bold text-ink text-sm">
              {form.mode === 'create' ? 'أصلٌ جديد' : `تعديل ${form.id}`}
            </div>
            <span className="text-[11px] text-muted">{populationLabel(form.population)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="المجموعة" required>
              <select
                className={inputCls}
                value={form.population}
                disabled={form.mode === 'edit'}
                onChange={(e) => onPopulationChange(e.target.value)}
              >
                {POPULATIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="رقم الأصل" required hint="الصيغة BRZ-0001 — ولكلّ مجموعةٍ تسلسلُها">
              <input
                className={`${inputCls} font-mono`}
                value={form.id}
                disabled={form.mode === 'edit'}
                onChange={(e) => setForm({ ...form, id: e.target.value.trim() })}
              />
            </Field>
            <Field label="اسم الأصل" required>
              <input
                className={inputCls}
                value={form.assetName}
                onChange={(e) => setForm({ ...form, assetName: e.target.value })}
              />
            </Field>
            <Field
              label={form.population === 'issue' ? 'التصنيف (عمود السيريال)' : 'المواصفة / السيريال'}
              hint={form.population === 'issue' ? 'اثاث · بناء · ري · سباكه · سيارات · كهرباء …' : ''}
            >
              <input
                className={inputCls}
                list="venecia-categories"
                value={form.serial}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
              />
            </Field>
            <Field label="الماركة / العبوة" hint="دستة · رول · صندوق · لفة …">
              <input
                className={inputCls}
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </Field>
            <Field label="الكمية" required>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
              />
            </Field>
            <Field label="الحالة">
              <select
                className={inputCls}
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المسؤول">
              <input
                className={inputCls}
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              />
            </Field>
            <Field label="الموقع">
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="تاريخ الاستلام" hint="اتركه فارغًا إن لم يكن معروفًا — ولا يُخترع تاريخ">
              <input
                type="date"
                className={inputCls}
                value={form.receivedDate}
                onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
              />
            </Field>
            <Field label="ملاحظة" hint="تُقيَّد في سجلّ الأصل باسمك عند الحفظ">
              <input
                className={inputCls}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          <datalist id="venecia-categories">
            {categories.map(([c]) => (
              <option key={c} value={c === UNCLASSIFIED ? '' : c} />
            ))}
          </datalist>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!canWrite || !!busy}>
              {form.mode === 'create' ? 'أضف الأصل' : 'احفظ التعديل'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* ═══ لوحُ الأصل: جردٌ · ملاحظاتٌ · تكهين ═══ */}
      {open && (
        <section className="o_ds o_ds_card o_ds_pad space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-ink-2">{open.id}</span>
            <span className="font-bold text-ink">{open.assetName}</span>
            <span className="text-[11px] text-muted">
              {populationLabel(open.population)} · {assetCategory(open)}
            </span>
            <Badge variant={CONDITION_VARIANT[open.condition] || 'draft'}>{open.condition || '—'}</Badge>
            {open.archived && <Badge variant="danger">مكهَّن</Badge>}
            <button
              type="button"
              className="btn btn-secondary btn-sm ms-auto"
              onClick={() => startEdit(open)}
              disabled={!canWrite}
            >
              عدّل
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId('')}>
              أغلق
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* الجرد */}
            <div className="rounded-lg border border-line p-3 space-y-2">
              <div className="font-bold text-[13px] text-ink flex items-center gap-1.5">
                <Icon name="clipboardList" size={14} /> الجرد
              </div>
              <div className="text-[11px] text-ink-2">
                المسجَّل <strong>{num(rawQty(open.qty))}</strong>
                {isCounted(open) ? (
                  <>
                    {' · '}المعدود <strong>{num(open.countedQty)}</strong>
                    {' · '}الفرق{' '}
                    <strong className={countVariance(open) ? 'text-brand-red' : ''} dir="ltr">
                      {countVariance(open) > 0 ? '+' : ''}
                      {num(countVariance(open))}
                    </strong>
                    {open.countedAt && (
                      <span className="text-muted">
                        {' '}
                        — {open.countedAt} بيد {open.countedBy || '—'}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted"> · لم يُجرَد قطّ</span>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="الكمية المعدودة" hint="صفرٌ عدٌّ صحيح: الأصلُ المفقود يُقيَّد ولا يُترك">
                  <input
                    type="number"
                    min="0"
                    className={`${inputCls} max-w-[120px]`}
                    value={countDraft}
                    onChange={(e) => setCountDraft(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!canWrite || !!busy || countDraft === ''}
                  onClick={() =>
                    run(
                      'يُقيَّد الجرد…',
                      () => recordAssetCount(open.docId, countDraft, profile),
                      (out) =>
                        out.variance === 0
                          ? 'قُيّد الجرد مطابقًا للمسجَّل.'
                          : `قُيّد الجرد — فرقٌ ${signedNum(out.variance)} يُقرّه مسؤولٌ بتسوية.`
                    )
                  }
                >
                  قيّد العدّ
                </button>
                {isCounted(open) && countVariance(open) !== 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!canWrite || !!busy}
                    onClick={() =>
                      run(
                        'تُسوّى…',
                        () => settleAssetCount(open.docId, profile, { reason: 'تسويةٌ من لوحة فينسيا' }),
                        (out) => `سُوّي المسجَّل ${num(out.from)} ← ${num(out.to)}.`
                      )
                    }
                  >
                    سوِّ المسجَّل على المعدود
                  </button>
                )}
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
                  <input
                    className={inputCls}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="مثال: واحدٌ منها عند سراج"
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!canWrite || !!busy || !noteDraft.trim()}
                  onClick={() =>
                    run(
                      'تُقيَّد…',
                      () => appendAssetNote(open.docId, noteDraft, profile),
                      () => {
                        setNoteDraft('');
                        return 'قُيّدت الملاحظة.';
                      }
                    )
                  }
                >
                  أضف
                </button>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-auto">
                {!notes.length && <div className="text-[11px] text-muted">لا ملاحظةَ بعد.</div>}
                {notes.map((n) => (
                  <div key={n.id} className="rounded border border-line bg-surface-2 p-2">
                    <div className="text-[12px] text-ink">{n.text}</div>
                    <div className="text-[10px] text-muted">
                      {n.day || '—'} · {n.byName || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ★ الصورُ — مستمعُها هنا لا في اللوحة، فلا تُقرأ إلّا ولوحُ الأصل مفتوح. */}
          <VeneciaPhotos asset={open} canWrite={canWrite} profile={profile} assetsCount={assets.length} />

          {/* التكهين */}
          <div className="rounded-lg border border-line p-3 space-y-2">
            <div className="font-bold text-[13px] text-ink flex items-center gap-1.5">
              <Icon name="archive" size={14} /> {open.archived ? 'إرجاعٌ إلى الجرد' : 'تكهينٌ بدل الحذف'}
            </div>
            <div className="text-[10px] text-muted">
              لا حذفَ في قاعدة البيانات: رقمُ الأصل مطبوعٌ على شيءٍ كان في المخزن، ومحوُه يجعل جردًا قديمًا
              يذكر ما لا وجودَ له. {open.archived && open.archiveReason ? `سببُ تكهينه: ${open.archiveReason}` : ''}
            </div>
            <div className="flex items-end gap-2">
              <Field label="السبب" required>
                <input
                  className={inputCls}
                  value={archiveDraft}
                  onChange={(e) => setArchiveDraft(e.target.value)}
                  placeholder={open.archived ? 'عاد إلى المخزن' : 'صُرف لمشروع الرحبة'}
                />
              </Field>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!canWrite || !!busy || !archiveDraft.trim()}
                onClick={() =>
                  run(
                    open.archived ? 'يُرجَع…' : 'يُكهَّن…',
                    () =>
                      open.archived
                        ? restoreVeneciaAsset(open.docId, archiveDraft, profile)
                        : archiveVeneciaAsset(open.docId, archiveDraft, profile),
                    () => {
                      setArchiveDraft('');
                      return open.archived ? 'أُرجع الأصل إلى الجرد.' : 'كُهّن الأصل بسببه.';
                    }
                  )
                }
              >
                {open.archived ? 'أرجِعه' : 'كهّنه'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ═══ الطبقة ③ — الفهرسُ الكامل ═══ */}
      <section className="o_ds o_ds_card space-y-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <Icon name="search" size={14} className="text-muted" />
            <input
              className={inputCls}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث: الاسم · الرقم · التصنيف · الماركة · المسؤول · الملاحظة"
            />
          </div>
          <select className={`${inputCls} max-w-[150px]`} value={population} onChange={(e) => setPopulation(e.target.value)}>
            <option value="">كلُّ المجموعات</option>
            {POPULATIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select className={`${inputCls} max-w-[150px]`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">كلُّ التصنيفات</option>
            {categories.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({num(n)})
              </option>
            ))}
          </select>
          <select className={`${inputCls} max-w-[140px]`} value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">كلُّ الحالات</option>
            {ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <input
              type="checkbox"
              checked={uncountedOnly}
              onChange={(e) => setUncountedOnly(e.target.checked)}
            />
            ما لم يُجرَد فقط
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            أظهر المكهَّن
          </label>
          <span className="text-[11px] text-muted ms-auto">
            {num(sorted.length)} من {num(assets.length)}
          </span>
        </div>

        {!sorted.length ? (
          <div className="p-6 text-center text-xs text-muted">
            {assets.length ? 'لا أصلَ يطابق التصفية.' : 'لا جردَ بعد — استورد الجرد الأوّل أعلاه.'}
          </div>
        ) : (
          <ListView
            selectable={false}
            onRowClick={(r) => {
              setOpenId(r.id);
              const a = assets.find((x) => x.docId === r.id);
              setCountDraft(a ? String(rawQty(a.qty)) : '');
              setArchiveDraft('');
            }}
            columns={[
              { key: 'thumb', label: '', width: '44px' },
              { key: 'no', label: 'رقم الأصل', width: '110px' },
              { key: 'name', label: 'اسم الأصل' },
              { key: 'pop', label: 'المجموعة', width: '110px' },
              { key: 'cat', label: 'التصنيف', width: '110px' },
              { key: 'brand', label: 'الماركة/العبوة', width: '120px' },
              { key: 'qty', label: 'الكمية', numeric: true, width: '80px' },
              { key: 'counted', label: 'المعدود', numeric: true, width: '80px' },
              { key: 'variance', label: 'الفرق', numeric: true, width: '70px' },
              { key: 'cond', label: 'الحالة', width: '110px' },
              { key: 'note', label: 'آخر ملاحظة' },
            ]}
            rows={sorted.map((a) => {
              const v = countVariance(a);
              return {
                id: a.docId,
                decoration: a.archived ? 'muted' : undefined,
                cells: {
                  // ★ المصغَّرةُ من السجلّ نفسِه (≤ ٨ ك.ب) — لا قراءةَ مرفقاتٍ للقائمة.
                  thumb: a.thumbPhoto ? (
                    <img
                      src={a.thumbPhoto}
                      alt=""
                      style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                    />
                  ) : (
                    <span className="text-muted text-[10px]">—</span>
                  ),
                  no: <span className="font-mono text-[11px]">{a.id}</span>,
                  name: (
                    <span className={a.archived ? 'text-muted line-through' : ''}>{a.assetName}</span>
                  ),
                  pop: <span className="text-[11px]">{populationLabel(a.population)}</span>,
                  cat: <span className="text-[11px]">{assetCategory(a)}</span>,
                  brand: <span className="text-[11px]">{a.brand || '—'}</span>,
                  qty: num(rawQty(a.qty)),
                  counted: isCounted(a) ? num(a.countedQty) : '—',
                  variance:
                    v === null ? (
                      '—'
                    ) : (
                      <span className={v ? 'text-brand-red font-bold' : ''} dir="ltr">
                        {v > 0 ? '+' : ''}
                        {num(v)}
                      </span>
                    ),
                  cond: <Badge variant={CONDITION_VARIANT[a.condition] || 'draft'}>{a.condition || '—'}</Badge>,
                  note: <span className="text-[11px] text-muted">{a.notes || '—'}</span>,
                },
              };
            })}
            footer={{
              label: `${num(sorted.length)} أصلًا`,
              cells: {
                qty: num(sorted.reduce((s, a) => s + rawQty(a.qty), 0)),
                counted: num(
                  sorted.filter(isCounted).reduce((s, a) => s + Number(a.countedQty), 0)
                ),
                // الإشارةُ تُعزل في التذييل كما تُعزل في الصفّ — وإلّا قُرئ
                // المجموعُ السالبُ «2-» وحدَه بين مجاميعَ موجبة.
                variance: (
                  <span dir="ltr">
                    {num(sorted.reduce((s, a) => s + (countVariance(a) ?? 0), 0))}
                  </span>
                ),
              },
            }}
          />
        )}
      </section>
    </div>
  );
}
