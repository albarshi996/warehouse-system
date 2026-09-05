import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { canEditLocations, listenLocations, saveLocationsBulk } from '../../../services/locations/locationsService.js';
import {
  countScheme,
  expandScheme,
  previewScheme,
  schemeProblems,
  toLocationInputs,
} from '../../../services/locations/locationScheme.js';
import { binPrefixOf, segmentLabelsOf } from '../../../services/locations/binAnatomy.js';
import {
  countForTemplate,
  paramDefaults,
  resolveLevels,
  templateById,
} from '../../../services/locations/binTemplate.js';
import { saveWarehouseNumbering } from '../../../services/locations/warehouseService.js';
import BIN_SCHEMES from '../../../data/warehouse-schemes.json';

const TEMPLATES = BIN_SCHEMES?.templates || [];
const ASSIGNMENTS = BIN_SCHEMES?.assignments || [];

/**
 * بانية مواقع التخزين — «نظام إضافة أماكن أوتوماتيك» (طلب المالك 2026-08-24).
 *
 * ═══ ما تحلّه ═══
 * تعريف الرفوف كان يدويًّا سطرًا سطرًا: مستودعٌ بعشرة ممرّاتٍ وخمسة رفوفٍ
 * وأربعة مستوياتٍ واثني عشر صندوقًا = ٢٤٠٠ سطرٍ بالقلم. فلا تُكتب، فيبقى
 * المخزون بلا مواقع، **فلا يعمل التخزين الموجّه أصلًا**.
 *
 * هنا تصف المدى مرّةً — من A01 إلى A10 — فيُولَّد الكاملُ دفعةً.
 *
 * ولا منطقَ في هذه الشاشة: التوليد والتحقّق والعدّ في `locationScheme.js`
 * الخالص المُختبَر، والحفظُ بـ`saveLocationsBulk` القائم.
 *
 * ⚠ وهو **يرفض الدفعة كلّها** إن كان فيها كودٌ معطوب («لم يُحفظ شيء») — ولذلك
 * يمرّ المولَّد على حارس `locationCodeProblem` **قبل** أن يُرسَل، ويحرسه
 * اختبارٌ يقول: «كلّ مولَّدٍ كودُ موقعٍ صالحٌ في النواة». فلا تُردّ دفعةٌ بعد
 * انتظار، ولا يُكتشف العطب عند الحفظ.
 *
 * ═══ ولا كتابةَ قبل المعاينة ═══
 * يُعرض العدد وأوّلُ الأكواد وآخرُها قبل أيّ حفظ. فمن يضغط «ولّد» يعرف ماذا
 * سيقع — نفس قاعدة صندوق الاستيراد.
 */

const LEVEL_META = [
  { key: 'zone', label: 'المنطقة / الغرفة', hint: 'PIK · BLK · RM01', sample: { values: 'PIK' } },
  { key: 'rack', label: 'الممرّ', hint: 'A01 … A10', sample: { prefix: 'A', from: 1, to: 10 } },
  { key: 'bay', label: 'الرفّ', hint: 'R01 … R05', sample: { prefix: 'R', from: 1, to: 5 } },
  { key: 'level', label: 'المستوى', hint: 'L01 … L04', sample: { prefix: 'L', from: 1, to: 4 } },
  { key: 'position', label: 'الصندوق', hint: 'B01 … B12', sample: { prefix: 'B', from: 1, to: 12 } },
];

const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

const initialLevels = () =>
  LEVEL_META.map((m) => ({
    key: m.key,
    label: m.label,
    enabled: true,
    prefix: m.sample.prefix || '',
    from: m.sample.from ?? 1,
    to: m.sample.to ?? 0,
    pad: 2,
    values: m.sample.values || '',
  }));

/**
 * مخطّطُ البذرة ⟵ حالةُ حقول هذه الشاشة.
 *
 * البذرةُ تحفظ القيمَ مصفوفةً (`['A','B',…]`) والحقلُ يقرؤها نصًّا مفصولًا
 * بمسافات — والتحويلُ هنا لا في البذرة، فالبذرةُ بنيةُ بياناتٍ لا شكلُ إدخال.
 */
function levelsFromResolved(resolved) {
  const byKey = new Map((resolved || []).map((l) => [l.key, l]));
  return LEVEL_META.map((m) => {
    const l = byKey.get(m.key);
    return {
      key: m.key,
      label: m.label,
      enabled: l ? l.enabled !== false : false,
      prefix: l?.prefix || '',
      from: l?.from ?? 1,
      to: l?.to ?? 0,
      pad: l?.pad ?? 2,
      values: (l?.values || []).join(' '),
    };
  });
}

export default function LocationBuilder() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [existing, setExisting] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [levels, setLevels] = useState(initialLevels);
  const [templateId, setTemplateId] = useState('');
  const [params, setParams] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const a = subscribeWarehouses(setWarehouses);
    const b = listenLocations(setExisting);
    return () => { a?.(); b?.(); };
  }, [me]);

  /**
   * ★★★ `warehouse` هنا **بادئةُ الملصقات** لا كودُ المستودع في البوّابة.
   *
   * كانت الشاشةُ تولّد بكود المستودع، فمستودعُ الرحبة `WH001` كان يُنتج
   * `WH001-A-L-01-01` — كودًا **لا وجودَ له على أيٍّ من ٢٦٠٠ ملصقٍ مطبوع**.
   * والوثيقةُ تحمل `binPrefix` منذ 2026-09-02، فهنا يُطابَق بها.
   */
  const whDoc = useMemo(() => {
    const p = String(warehouse || '').trim().toUpperCase();
    return p ? (warehouses || []).find((w) => binPrefixOf(w) === p) || null : null;
  }, [warehouses, warehouse]);

  const template = useMemo(() => templateById(TEMPLATES, templateId), [templateId]);

  /**
   * تسمياتُ المقاطع — القالبُ المختارُ يتقدّم (فهو ما يصفه المستخدم الآن)،
   * ثمّ المحفوظُ على المستودع، ثمّ الافتراضيّ.
   */
  const labels = useMemo(
    () => ({ ...segmentLabelsOf(whDoc), ...(template?.segmentLabels || {}) }),
    [whDoc, template]
  );

  const scheme = useMemo(() => ({ warehouse, levels }), [warehouse, levels]);
  const problems = useMemo(() => schemeProblems(scheme), [scheme]);
  const total = useMemo(() => countScheme(scheme), [scheme]);
  const preview = useMemo(() => (problems.length ? null : previewScheme(scheme, { sample: 4 })), [scheme, problems]);

  /** ما هو مسجَّلٌ أصلًا لهذا المستودع — فالتوليد يُظهر الجديد لا المكرّر. */
  const already = useMemo(() => {
    const wh = String(warehouse || '').toUpperCase();
    if (!wh) return new Set();
    return new Set((existing || []).map((l) => String(l.code || '').toUpperCase()).filter((c) => c.startsWith(`${wh}-`)));
  }, [existing, warehouse]);

  const fresh = useMemo(() => {
    if (!preview) return 0;
    return expandScheme(scheme).codes.filter((c) => !already.has(c)).length;
  }, [scheme, preview, already]);

  /** يملأ الحقولَ من قالبٍ ووسائطه — فلا يصف أحدٌ أربعةَ عشرَ حقلًا بيده. */
  function applyTemplate(id, nextParams) {
    const t = templateById(TEMPLATES, id);
    if (!t) return;
    const p = nextParams || paramDefaults(t);
    setTemplateId(id);
    setParams(p);
    setLevels(levelsFromResolved(resolveLevels(t, p)));
    setResult(null);
    setError('');
  }

  /** وسيطٌ واحدٌ يتغيّر — فتُعاد المستوياتُ فورًا وتُحدَّث المعاينة. */
  function patchParam(key, value) {
    const p = { ...params, [key]: value };
    setParams(p);
    if (template) setLevels(levelsFromResolved(resolveLevels(template, p)));
    setResult(null);
  }

  /**
   * إسنادٌ معتمدٌ بضغطةٍ واحدة — البادئةُ والقالبُ والوسائطُ معًا.
   * (هذه ملصقاتُ المالك المطبوعة، مقيسةً بها في `generate-bin-schemes.mjs`.)
   */
  function applyAssignment(a) {
    setWarehouse(a.binPrefix);
    applyTemplate(a.templateId, a.params);
  }

  function patch(i, p) {
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  }

  async function generate() {
    if (problems.length || !fresh) return;
    setBusy('يولّد ويحفظ…'); setError(''); setResult(null);
    try {
      const { codes } = expandScheme(scheme);
      const newCodes = codes.filter((c) => !already.has(c));
      const out = await saveLocationsBulk(toLocationInputs(newCodes, { warehouse }), me);

      // ★★ ويُحفظ الترقيمُ على المستودع في الحركة نفسِها — فيصير له قالبٌ
      // دائم: تعرفه شاشةُ المستودعات فتحسب ناقصَه، ويعرفه العاملُ فيقرأ
      // «الممرّ · الجهة · الرفّ · الخانة» بدل رموزٍ صمّاء. وفشلُ هذا الحفظ
      // **لا يُلغي المواقع المكتوبة** — يُعلَن ولا يُبتلع.
      let numberingWarning = '';
      if (whDoc?.id) {
        try {
          await saveWarehouseNumbering(
            whDoc.id,
            {
              binPrefix: warehouse,
              scheme,
              segmentLabels: template?.segmentLabels || whDoc.segmentLabels || null,
              valueLabels: template?.valueLabels || whDoc.valueLabels || null,
              templateId: templateId || whDoc.templateId || '',
              templateParams: params,
            },
            me
          );
        } catch (err) {
          numberingWarning = 'المواقع حُفظت، ولم يُحفظ القالبُ على المستودع: ' + (err?.message || 'سببٌ غير معروف');
        }
      } else {
        numberingWarning = 'المواقع حُفظت — ولا مستودعَ في البوّابة بهذه البادئة، فلم يُحفظ القالب.';
      }

      setResult({
        saved: out?.saved ?? newCodes.length,
        duplicates: out?.duplicates || 0,
        skipped: codes.length - newCodes.length,
        warning: numberingWarning,
      });
    } catch (err) {
      setError(err?.message || 'تعذّر الحفظ.');
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!canEditLocations(me.role)) return <Notice>تعريف المواقع لمن يملك تحرير المستودعات.</Notice>;

  return (
    <div dir="rtl" className="o_theme space-y-6">
      {/* ═══ الطبقة ١ — المستودع ═══ */}
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[200px]">
          <span className="block text-[11px] font-bold text-ink-2 mb-1">المستودع</span>
          <input
            list="wh-codes"
            value={warehouse}
            onChange={(e) => { setWarehouse(e.target.value.toUpperCase()); setResult(null); }}
            placeholder="RHB"
            className="w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 font-mono focus:outline-none focus:border-accent/50"
          />
          <datalist id="wh-codes">
            {warehouses.map((w) => <option key={w.code || w.id} value={String(w.code || w.id).toUpperCase()}>{w.nameAr || w.name || ''}</option>)}
          </datalist>
        </label>
        <div className="text-xs text-muted leading-relaxed max-w-md">
          {whDoc ? (
            <span className="text-ink-2">
              بادئةُ <strong className="text-ink">{whDoc.nameAr || whDoc.name || whDoc.code}</strong>{' '}
              (<span className="font-mono">{whDoc.code}</span>) — وكلُّ خانةٍ فيه تبدأ بها.
            </span>
          ) : (
            <>
              هذه <strong>بادئةُ الملصقات</strong> لا كودَ المستودع: الملصقُ المطبوع
              يبدأ بها، فيجب أن تطابقه حرفًا بحرف. وهي أوّلُ مقاطع كلّ خانة، ولا
              تقبل شرطةً داخلها.
            </>
          )}
        </div>
      </section>

      {/* ═══ الطبقة ١.٥ — القالب: ترميزٌ يُختار ومقاسٌ يُملأ ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="checkCircle" size={16} className="text-accent" />
          <h3 className="font-bold text-ink text-sm">قالب الترقيم</h3>
          <span className="text-[11px] text-muted">اختر الترميزَ مرّةً، ثمّ اكتب المقاسَ أرقامًا</span>
        </div>

        {ASSIGNMENTS.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-muted">إسنادٌ معتمدٌ بضغطة:</span>
            {ASSIGNMENTS.map((a) => (
              <button key={a.binPrefix} type="button" onClick={() => applyAssignment(a)} className="btn-secondary text-xs">
                {a.nameAr} · <span className="font-mono">{a.binPrefix}</span> · {num(a.expectedCount)} خانة
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className={templateId === t.id ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
            >
              {t.nameAr}
            </button>
          ))}
        </div>

        {template && (
          <>
            <p className="text-[11px] text-ink-2 leading-relaxed">
              {template.descriptionAr}
              {template.sampleCode && (
                <>
                  {' '}مثال:{' '}
                  <span className="font-mono" style={{ direction: 'ltr', display: 'inline-block' }}>{template.sampleCode}</span>
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-3 items-start">
              {(template.params || []).map((p) => (
                <label key={p.key} className="block">
                  <span className="block text-[11px] font-bold text-ink-2 mb-1">{p.labelAr}</span>
                  <input
                    type="number"
                    min={p.min}
                    max={p.max}
                    value={params[p.key] ?? p.default}
                    onChange={(e) => patchParam(p.key, e.target.value)}
                    className={`${IN} w-28`}
                  />
                  <span className="block text-[10px] text-muted mt-0.5">{p.hintAr || `${p.min}–${p.max}`}</span>
                </label>
              ))}
              <div className="self-center pt-4">
                <Stat label="يُنتج" value={num(countForTemplate(template, { binPrefix: warehouse || 'X', params }))} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* ═══ الطبقة ٢ — المستويات ═══ */}
      <section className="o_ds o_ds_card">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <Icon name="layers" size={16} className="text-accent" />
          <h3 className="font-bold text-ink text-sm">مستويات الترقيم</h3>
          <span className="text-[11px] text-muted">تُعطَّل من الآخر — مستودعٌ بلا صناديق يقف عند المستوى</span>
        </div>
        <div className="divide-y divide-line">
          {levels.map((l, i) => (
            <div key={l.key} className="p-3 flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-2 min-w-[150px]">
                <input type="checkbox" checked={l.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} />
                <span className="text-sm font-bold text-ink-2">{labels[l.key] || LEVEL_META[i].label}</span>
              </label>
              <span className="text-[10px] text-muted w-24">{LEVEL_META[i].hint}</span>
              <input
                placeholder="بادئة" value={l.prefix} disabled={!l.enabled}
                onChange={(e) => patch(i, { prefix: e.target.value.toUpperCase() })}
                className={`${IN} w-20 font-mono`}
              />
              <span className="text-[11px] text-muted">من</span>
              <input type="number" min="0" value={l.from} disabled={!l.enabled}
                onChange={(e) => patch(i, { from: e.target.value })} className={`${IN} w-16`} />
              <span className="text-[11px] text-muted">إلى</span>
              <input type="number" min="0" value={l.to} disabled={!l.enabled}
                onChange={(e) => patch(i, { to: e.target.value })} className={`${IN} w-16`} />
              <span className="text-[11px] text-muted">أو قيمٌ</span>
              <input
                placeholder="PIK BLK" value={l.values} disabled={!l.enabled}
                onChange={(e) => patch(i, { values: e.target.value.toUpperCase() })}
                className={`${IN} w-28 font-mono`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ الطبقة ٣ — المعاينة قبل الكتابة ═══ */}
      {problems.length > 0 ? (
        <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
          <div className="text-xs font-bold text-brand-red mb-1.5">لا يُولَّد قبل إصلاح هذه:</div>
          <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
            {problems.map((p, i) => <li key={i}>• {p}</li>)}
          </ul>
        </section>
      ) : (
        <section className="o_ds o_ds_card o_ds_pad space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <Stat label="سيُولَّد" value={num(total)} />
            <Stat label="جديدٌ منها" value={num(fresh)} tone={fresh ? '' : 'muted'} />
            <Stat label="مسجَّلٌ سلفًا" value={num(total - fresh)} tone="muted" />
            <div className="flex-1" />
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !fresh} onClick={generate}
              title={fresh ? '' : 'كلّها مسجّلةٌ سلفًا'}>
              ولّد واحفظ
            </button>
          </div>
          {preview && (
            <div className="text-[11px] font-mono text-ink-2 leading-relaxed break-all">
              <div>{preview.first.join('  ·  ')}</div>
              {preview.last.length > 0 && (
                <>
                  <div className="text-muted my-0.5">… {num(Math.max(0, total - preview.first.length - preview.last.length))} بينها …</div>
                  <div>{preview.last.join('  ·  ')}</div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {busy && <div className="text-xs text-accent font-bold">{busy}</div>}
      {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}

      {result && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 flex items-center gap-2">
          <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
          <span className="text-ink-2">
            حُفظ {num(result.saved)} موقعًا
            {result.skipped ? ` · تُخطّي ${num(result.skipped)} مسجّلًا سلفًا` : ''}
            {result.duplicates ? ` · ${num(result.duplicates)} مكرّرًا في الدفعة` : ''}
            {result.warning ? ` — ⚠️ ${result.warning}` : ' · وحُفظ القالبُ على المستودع'}
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted text-center">
        المولَّد يمرّ بنفس حارس أكواد المواقع — فلا يُكتب ما يُرفض عند الحفظ، ولا يُكرَّر ما هو مسجَّل.
      </p>
    </div>
  );
}

const IN = 'bg-surface border border-line rounded-lg text-ink text-xs px-2 py-1 focus:outline-none focus:border-accent/50 disabled:opacity-40';

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className={`text-xl font-black leading-tight ${tone === 'muted' ? 'text-muted' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] font-bold text-ink-2">{label}</div>
    </div>
  );
}

function Notice({ children }) {
  return (
    <div className="o_theme" dir="rtl">
      <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>
    </div>
  );
}
