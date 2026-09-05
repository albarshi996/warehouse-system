import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { buildGrid } from '../../../services/locations/travelGrid.js';
import { fefoLocationViolations, pickPlan } from '../../../services/locations/pickPlan.js';
// ‹JR-401› الخطّةُ تُطلق مهمّةً ميدانيّة — والحكمُ في الخدمة لا هنا.
import { createPickTask, listOpenTasks } from '../../../services/lpn/pickingService.js';
import { pickTaskDuplicateProblem, taskOpenProblem } from '../../../services/lpn/pickingTask.js';
// ‹JR-701› الصلاحيةُ تُعلَم قبل الضغط لا بعد ارتداد الخادم.
import { uiGate } from '../../../services/lpn/lpnRoles.js';
import { collectionWriteProblem } from '../../../services/labor/laborRoles.js';

/**
 * خطّة السحب — «نرفق الأكواد فيظهر مكانه» (طلب المالك 2026-08-24).
 *
 * ═══ ما تحلّه ═══
 * العامل يُعطى قائمةَ أصنافٍ ولا يُعطى **أين هي**. فيبحث في المستودع، أو
 * يسأل، أو يأخذ من أوّل ما يجد — فيخرج القديمُ بعد الجديد وتنتهي صلاحيّةُ
 * ما في العمق.
 *
 * والمنطق الذي يحلّ هذا **مبنيٌّ ومختبَرٌ منذ خطّة المواقع وبلا مستدعٍ واحد**:
 * يخصّص من المتاح بـFEFO (الأقرب انتهاءً أوّلًا)، ويعطي لكلّ بندٍ مواقعَه
 * وكمّيّاتِه ودفعاتِه، **ويرتّب المسار بالمشي الفعليّ** حين تتوفّر شبكة
 * المسافات — فيمشي العامل الممرّ مرّةً واحدة بدل أن يذهب ويعود.
 *
 * ═══ ومساران للمدخل ═══
 *   · **مستند سحبٍ قائم** — الحالة العاديّة.
 *   · **لصقُ أكواد** — «كود ٥» سطرًا سطرًا، فيُبنى طلبٌ عابرٌ في الذاكرة
 *     ويُخطَّط. لا يُحفظ شيء: هذا مسارُ «أين هذه الأصناف؟» لا مسار مستند.
 *
 * ولا حسابَ هنا: `pickPlan` و`fefoLocationViolations` و`buildGrid` كلّها
 * مبنيّةٌ ومختبَرة — هذه عرضٌ وتفاعل.
 *
 * ═══ ‹JR-401› ومنذ اليوم تُطلق ولا تكتفي بالتخطيط ═══
 * كانت الشاشة تعرض المسار جدولًا **ثمّ تنتهي**: يُطبع أو يُحفظ في رأس أحدهم،
 * والمحضّرُ يمشي بذاكرته. والمهمّةُ الميدانيّة تُغلق الحلقة — تُشتقّ من هذه
 * الخطّة عينِها (`createPickTask` يستدعي `pickPlan` بالشبكة نفسها) فلا يمشي
 * المحضّرُ غيرَ ما رآه المخطِّط.
 */

const DOCS_CAP = 300;
const PICKING_PATH = '/dashboard/lpn-picking';
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);

/**
 * ★★★ سببُ منع **الإطلاق** — سؤالان لا واحد ‹JR-701›.
 *
 * ═══ ما كان هنا ═══
 * مجموعةٌ مرتجلة (`CAN_PICK`) بخمسة أسماءٍ مكتوبةٍ باليد **تحرس الشاشةَ
 * كلَّها**، وفيها عطبان قِيسا لا خُمِّنا:
 *   ① **تُسقط `picking_unit`** — و`navCatalog` يمنحه `/dashboard/pick-plan`
 *     (السطر ٣٠٥). فمحضّرُ الطلبات يصل العنوانَ الذي فُتح له ويُردّ برسالة
 *     «خطّة السحب لأمين المخزن والمشرفين». وهو عينُ درسِ ل‑١٨: شاشةٌ تمنع من
 *     تسمح له القاعدةُ والبوّابةُ معًا.
 *   ② **وحراسةُ العنوان ليست شغلَ هذه الشاشة أصلًا**: `AuthGate` مغروسٌ في
 *     `DashboardLayout` على كلّ صفحةٍ، يشتقّ الصلاحيةَ من الكتالوج نفسِه
 *     **ومن مصفوفة التجاوزات** (`access_control/matrix`) ويُحوّل من لا يملكها
 *     قبل أن تُرفع التغطية. فقائمةٌ ثانيةٌ هنا لا تزيد أمنًا — تزيد انحرافًا:
 *     دورٌ مُنح الصفحةَ بتجاوزٍ من شاشة الصلاحيات يعبر الحارسَ الحقيقيَّ ثمّ
 *     تردّه هذه القائمةُ العمياء عن المصفوفة.
 *
 * فالحارسُ نُقل إلى موضعه الصحيح: **الفعلُ الذي يكتب**، لا النظرُ إلى خطّة.
 * والقراءةُ محروسةٌ حيث يجب — `firestore.rules` وحدَها تقرّر ما يُقرأ.
 *
 * ═══ والسؤالان ═══
 *   ① `uiGate(role, 'PICK')` — أتملك مصفوفةُ الميدان هذه العمليّة؟
 *   ② `collectionWriteProblem(role, 'picking_tasks')` — أيقبلها الخادم؟
 *
 * ★★★ **ولا يكفي الأوّلُ وحدَه**: `uiGate` تُعيد `allowed:true` للدور المجهول
 * **عمدًا** (منعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم) — فشاشةٌ
 * تسألها وحدَها تفتح الزرَّ لكلّ من لم يُخرَّط، فيضغط ويرتدّ عملُه. والثاني
 * هو الذي ينسخ القاعدةَ حرفًا: و`picking_tasks` يحرسها **`isStockActor`** لا
 * `isLaborWriter` (فُتشت القاعدةُ ولم تُفترض — نحو السطر ١٦٢٣) — ولذلك يُمنع
 * منها `labor_supervisor` وإن فُتحت له الشاشة.
 *
 * ⚠️ وكلاهما يصمت عن الدور الفارغ (ملفٌّ لم يُحمَّل بعد) — بقصد: الخادمُ يبتّ
 * حينئذٍ برسالةٍ واضحة، ولا يُمنع أحدٌ لأنّنا لم نعرفه بعد.
 */
function launchDenial(role) {
  const gate = uiGate(role, 'PICK');
  return gate.allowed ? collectionWriteProblem(role, 'picking_tasks') : gate.message;
}

export default function PickPlanScreen() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mode, setMode] = useState('doc');
  const [docId, setDocId] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  /* ‹JR-401› طورُ الإطلاق — المهمّةُ القائمةُ على هذا الأمر، والضغطةُ ونتيجتُها. */
  const [existing, setExisting] = useState(null);
  const [lookedUp, setLookedUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState(null);
  const [launchError, setLaunchError] = useState('');

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
    const fail = (what) => (e) => setError(e?.message || `تعذّرت قراءة ${what}.`);
    const a = listenAllDocuments(setDocs, DOCS_CAP);
    const b = listenBalances(setBalances, fail('الأرصدة'));
    const c = listenLocations(setLocations, fail('المواقع'));
    return () => { a?.(); b?.(); c?.(); };
  }, [me]);

  const picks = useMemo(
    () => (docs || []).filter((d) => String(d?.type).toUpperCase() === 'PICK'),
    [docs]
  );

  /** الشبكة تحسّن ولا تُشترط — بلا مواقعَ معرّفة يعود الترتيب إلى الكود. */
  const grid = useMemo(() => (locations.length ? buildGrid(locations) : null), [locations]);

  /** طلبٌ عابرٌ من الأكواد الملصوقة — «كود» أو «كود ٥» في كلّ سطر. */
  const pastedDoc = useMemo(() => {
    const lines = String(pasted || '')
      .split(/\r?\n/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const parts = raw.split(/[\s,;\t]+/).filter(Boolean);
        const qty = Number(parts[parts.length - 1]);
        const hasQty = parts.length > 1 && Number.isFinite(qty) && qty > 0;
        const code = (hasQty ? parts.slice(0, -1) : parts).join('');
        return { sku: code.toUpperCase(), barcode: code, qty: hasQty ? qty : 1 };
      });
    return { type: 'PICK', header: { warehouse: warehouse.toUpperCase() }, lines };
  }, [pasted, warehouse]);

  const source = useMemo(() => {
    if (mode === 'paste') return pastedDoc.lines.length ? pastedDoc : null;
    return picks.find((d) => d.id === docId) || null;
  }, [mode, pastedDoc, picks, docId]);

  /**
   * ⚠ الخطأ يُعاد **قيمةً** لا يُضبط حالةً هنا: `setState` داخل `useMemo`
   * تحديثٌ أثناء الرندر يرفضه React — فينهار المكوّن وتُفرَّغ الصفحة بلا
   * رسالة. (وقع حيًّا في أوّل تجربةٍ لهذه الشاشة.)
   */
  const { plan, planProblem } = useMemo(() => {
    if (!source) return { plan: null, planProblem: '' };
    try {
      return { plan: pickPlan(source, balances, { grid }), planProblem: '' };
    } catch (err) {
      return { plan: null, planProblem: err?.message || 'تعذّر بناء الخطّة.' };
    }
  }, [source, balances, grid]);

  const fefo = useMemo(
    () => (source && mode === 'doc' ? fefoLocationViolations(source, balances) : []),
    [source, balances, mode]
  );

  /** سببُ منع الإطلاق — يُحسب مرّةً: تسأله المعاينةُ والقراءةُ معًا. */
  const denial = useMemo(() => launchDenial(me?.role), [me]);

  /**
   * ★★★ المهمّةُ القائمةُ على هذا الأمر — تُقرأ **قبل** أن يُعرض زرُّ الإنشاء.
   *
   * وبلا هذه القراءة يرى المشرفُ زرًّا مغريًا، فيضغط، فترتدّ المعاملةُ برسالة
   * `pickTaskDuplicateProblem` — أي منعٌ يقع بعد الضغط لا قبله. والقراءةُ
   * بالمعرّف الحتميّ (`sourceDocId`) لا باستعلامٍ يطلب فهرسًا لم يُنشر.
   *
   * ⚠️ و`alive` ليس زينة: المستخدم يقلّب المستنداتِ في القائمة أسرعَ من الشبكة،
   * فجوابُ مستندٍ سابقٍ كان يهبط على مستندٍ لاحقٍ فيُخفي زرَّه بمهمّةٍ ليست له.
   *
   * ★ ولا تُقرأ لمن لا يُطلق: الممنوعُ يرى سببَ منعه لا رسالةَ قراءةٍ فاشلة.
   */
  useEffect(() => {
    setLaunched(null);
    setLaunchError('');
    setExisting(null);
    setLookedUp(false);
    if (!me || denial || mode !== 'doc' || !docId) return undefined;
    let alive = true;
    listOpenTasks({ sourceDocId: docId })
      .then((rows) => { if (alive) { setExisting(rows[0] ?? null); setLookedUp(true); } })
      .catch((e) => {
        // ★ الفشلُ يُقال ولا يُبتلع: قراءةٌ فاشلةٌ تُبتلع تصير «لا مهمّةَ عليه»
        // — وهي أخطرُ من رسالةٍ صريحة، إذ تدعو إلى فتح ثانيةٍ فوق قائمة.
        if (alive) { setLookedUp(false); setLaunchError(e?.message || 'تعذّرت قراءة مهامّ التحضير على هذا الأمر.'); }
      });
    return () => { alive = false; };
  }, [me, denial, mode, docId]);

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  const base = getBasePath();
  /* الفاعلُ اسمٌ لا معرّف — «من أسندها؟» يُقرأ في شاشة محضّرٍ لا في سجلّ خادم. */
  const actorName = me.name || me.displayName || me.email || '';
  const openProblem = plan ? taskOpenProblem(source, plan) : '';
  const dupProblem = existing ? pickTaskDuplicateProblem(existing, source) : '';

  async function launch() {
    if (busy) return;
    setBusy(true);
    setLaunchError('');
    try {
      // الشبكةُ نفسُها تُمرَّر — وإلّا رتّبت الخدمةُ مسارًا ثانيًا بالكود بينما
      // الشاشةُ تعرض مسارَ المشي، فيمشي المحضّر غيرَ ما رآه المخطِّط.
      const res = await createPickTask(source, balances, { actor: actorName, grid });
      setLaunched(res);
      setExisting({ id: res.id, ...res.task });
    } catch (e) {
      setLaunchError(e?.message || 'تعذّر فتح مهمّة التحضير.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="o_theme space-y-6">
      {/* ═══ الطبقة ١ — من أين نأتي بالطلب ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Tab active={mode === 'doc'} onClick={() => setMode('doc')} label={`مستند سحب (${num(picks.length)})`} />
          <Tab active={mode === 'paste'} onClick={() => setMode('paste')} label="ألصق أكوادًا" />
          <div className="flex-1" />
          <span className="text-[11px] text-muted self-center">
            {grid ? `شبكة المسافات جاهزة (${num(locations.length)} موقعًا)` : 'لا مواقعَ معرّفة — الترتيب بالكود'}
          </span>
        </div>

        {mode === 'doc' ? (
          <select
            className="w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
          >
            <option value="">— اختر مستند سحب —</option>
            {picks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number || d.id} · {d.header?.warehouse || '—'} · {num((d.lines || []).length)} بندًا
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-3">
            <input
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value.toUpperCase())}
              placeholder="المستودع (اختياريّ)"
              className="bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 font-mono w-44 focus:outline-none focus:border-accent/50"
            />
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={4}
              placeholder={'كودُ الصنف والكمّيّة في كلّ سطر:\nOIL-1L 12\n6291234567890 3'}
              className="flex-1 min-w-[260px] bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 font-mono focus:outline-none focus:border-accent/50"
            />
          </div>
        )}
      </section>

      {(error || planProblem) && (
        <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error || planProblem}</div>
      )}

      {plan && (
        <>
          {/* ═══ الطبقة ٢ — الحصيلة ═══ */}
          <section className="o_ds o_ds_card">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
              <Kpi label="بنود الطلب" value={num(plan.lines.length)} hint={plan.warehouse || 'كلّ المستودعات'} />
              <Kpi label="محطّات المسار" value={num(plan.path.length)} hint="موقعٌ × بند" />
              <Kpi label="نقصٌ عن المطلوب" value={num(plan.shortages.length)} hint="لا يكفي المتاح" tone={plan.shortages.length ? 'red' : ''} />
              {/* ⚠ `route` و`pathBasis` **كائنان** لا رقمٌ ونصّ — عرضُهما كما هما
                  يرمي React #31 ويُفرّغ الشاشة (وقع حيًّا في أوّل تجربة). */}
              <Kpi
                label="مسافة المشي"
                value={plan.route?.stops ? `${num(plan.route.meters)}‏م` : '—'}
                hint={plan.route?.approximate ? 'تقريبٌ — أقربُ تالٍ لا مسارٌ أمثل' : plan.route?.note || ''}
              />
            </div>
          </section>

          {fefo.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
              <div className="flex items-start gap-2.5">
                <Icon name="alertTriangle" size={16} className="text-brand-red mt-0.5 shrink-0" />
                <div className="min-w-0 text-xs leading-relaxed">
                  <div className="font-bold text-ink mb-1">{num(fefo.length)} مخالفةَ صلاحيّة</div>
                  <ul className="space-y-0.5 list-none p-0 text-ink-2">
                    {fefo.slice(0, 6).map((v, i) => (
                      <li key={i}>
                        • <span className="font-mono">{v.sku}</span>
                        {v.description ? ` — ${v.description}` : ''}: سُحب من{' '}
                        <span className="font-mono">{v.pickedBin || '—'}</span>
                        {v.pickedExpiry ? ` (صلاحية ${v.pickedExpiry})` : ''}، والأقربُ انتهاءً في{' '}
                        <span className="font-mono">{v.earliestBin || '—'}</span>
                        {v.earliestExpiry ? ` (صلاحية ${v.earliestExpiry}` : ''}
                        {v.earliestQty ? ` · متاحٌ ${num(v.earliestQty)})` : v.earliestExpiry ? ')' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ═══ الطبقة ٣ — المسار: هذا ما يمشيه العامل ═══ */}
          <section className="o_ds o_ds_card">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <Icon name="mapPin" size={16} className="text-accent" />
              <h3 className="font-bold text-ink text-sm">مسار السحب</h3>
              <span className="text-[11px] text-muted">{plan.pathBasis?.label || ''}</span>
            </div>
            {plan.path.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm">لا موقعَ لأيّ بند — راجع الأرصدة والمواقع.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-line">
                      <Th>#</Th><Th>الموقع</Th><Th>الصنف</Th><Th align="left">الكمّيّة</Th><Th>الدفعة</Th><Th>الصلاحية</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.path.map((s, i) => (
                      <tr key={`${s.bin}-${s.sku}-${i}`} className="border-b border-line/60 hover:bg-chip">
                        <Td className="text-muted">{i + 1}</Td>
                        <Td>
                          <span className="font-mono font-bold text-ink">{s.shortLabel || s.bin || '—'}</span>
                          {s.bin && s.shortLabel && s.bin !== s.shortLabel && (
                            <span className="block text-[10px] text-muted font-mono">{s.bin}</span>
                          )}
                        </Td>
                        <Td>
                          <span className="font-bold text-ink-2">{s.description || s.sku || s.barcode}</span>
                          {s.sku && <span className="block text-[10px] text-muted font-mono">{s.sku}</span>}
                        </Td>
                        <Td align="left" className="font-bold">{num(s.qty)}</Td>
                        <Td>{s.batch || '—'}</Td>
                        <Td className={s.expiry ? '' : 'text-muted'}>{s.expiry || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ═══ النواقص — تُعرض ولا تُخفى ═══ */}
          {plan.shortages.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad">
              <div className="font-bold text-ink text-sm mb-2">بنودٌ لا يكفيها المتاح</div>
              <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
                {plan.shortages.map((l) => (
                  <li key={l.index}>
                    • <span className="font-mono">{l.sku || l.barcode}</span> {l.description ? `— ${l.description}` : ''}:
                    طُلب {num(l.requested)} · خُصّص {num(l.allocated)} ·{' '}
                    <span className="text-brand-red font-bold">ينقص {num(l.shortfall)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ═══ الطبقة ٤ ‹JR-401› — من الخطّة إلى مهمّةٍ يمشيها محضّر ═══
              والمعاينةُ **قبل** الزرّ لا بعده: كلُّ ما يمنع الإطلاقَ يُقال
              بحكم الخدمة نفسِها (`taskOpenProblem` · `pickTaskDuplicateProblem`)
              فلا تُبنى هنا رسالةٌ ثانيةٌ تفترق عمّا يرمي به الخادم. */}
          <section className="o_ds o_ds_card o_ds_pad space-y-3">
            <div className="flex items-center gap-2">
              <Icon name="arrowUpTray" size={16} className="text-accent" />
              <h3 className="font-bold text-ink text-sm">مهمّةُ التحضير الميدانيّة</h3>
            </div>

            {denial ? (
              /* ★ المنعُ يُعلَن ولا يُخفى الزرُّ صمتًا: موظّفٌ لا يجد زرًّا يظنّ
                 الشاشةَ معطوبةً ويسأل عن العطب، ومن يُقال له «يملكها فلان» يذهب إليه. */
              <div className="text-xs text-brand-red leading-relaxed">{denial}</div>
            ) : openProblem ? (
              <div className="text-xs text-muted leading-relaxed">{openProblem}</div>
            ) : launched ? (
              <div className="space-y-2">
                <div className="text-xs text-ink-2 leading-relaxed">
                  فُتحت المهمّة <span className="font-mono font-bold text-ink">{launched.id}</span> بـ
                  {num((launched.task?.steps || []).length)} خطوةً — وتظهر في قائمة المهامّ المفتوحة
                  بلا إسنادٍ حتّى يأخذها محضّر.
                </div>
                {/* ⚠ `inline-block`: `.btn` بلا `display` في `odoo.css`، ووسمُ `a`
                    سطريٌّ فتُبتلع حشوتُه الرأسيّة ويخرج الزرُّ مضغوطًا. */}
                <a href={`${base}${PICKING_PATH}`} className="btn btn-primary btn-sm inline-block">افتح التحضير الميدانيّ</a>
              </div>
            ) : dupProblem ? (
              <div className="space-y-2">
                <div className="text-xs text-brand-red leading-relaxed">{dupProblem}</div>
                <a href={`${base}${PICKING_PATH}`} className="btn btn-secondary btn-sm inline-block">افتحها في التحضير الميدانيّ</a>
              </div>
            ) : !lookedUp ? (
              <div className="text-xs text-muted">يقرأ مهامّ التحضير على هذا الأمر…</div>
            ) : !actorName ? (
              <div className="text-xs text-muted leading-relaxed">مهمّةٌ بلا فاعلٍ لا تُفتح — ملفّك بلا اسمٍ ولا بريد.</div>
            ) : (
              <div className="space-y-2.5">
                {/* ★★ النقصُ لا يمنع الفتح — حكمٌ قائمٌ في `taskOpenProblem`،
                    وثمنُه أن يُعلَن **بالاسم قبل الضغط**: مهمّةٌ تُفتح على نقصٍ
                    مكتومٍ تُرسل المحضّرَ إلى رفٍّ ليس فيه ما طُلب، فيقف حائرًا
                    ويسأل — وهو ما كانت المهمّةُ لتوفّره. */}
                {plan.shortages.length > 0 && (
                  <div className="text-xs text-ink-2 leading-relaxed">
                    <span className="font-bold text-brand-red">{num(plan.shortages.length)} بندًا ينقص المتاحُ عنه</span>
                    {' '}— والمهمّةُ تُفتح معه ولا يمنعها، فيمشي المحضّرُ عالمًا لا مفاجَأً:{' '}
                    {plan.shortages.slice(0, 6).map((l, i) => (
                      <span key={l.index}>
                        {i > 0 ? ' · ' : ''}
                        <span className="font-mono">{l.sku || l.barcode}</span> ينقص {num(l.shortfall)}
                      </span>
                    ))}
                    {plan.shortages.length > 6 ? ` · وغيرُها (${num(plan.shortages.length - 6)})` : ''}
                  </div>
                )}
                <div className="text-[11px] text-muted leading-relaxed">
                  تُفتح على المستند <span className="font-mono">{source?.number || source?.id}</span> بـ
                  {num(plan.path.length)} خطوةً — بترتيب المسار المعروض أعلاه لا بترتيبٍ ثانٍ.
                  {/* ★ خطّةٌ بلا محطّةٍ واحدة: `taskOpenProblem` يقيس البنودَ لا المحطّات
                      فيُجيزها — والشاشةُ لا تخترع منعًا، لكنّها **تقول ما سيقع**:
                      مهمّةٌ بلا خطوةٍ تُقفل فارغةً ولا تُكوّن طبليةَ صرف. */}
                  {plan.path.length === 0 && ' ⚠ ولا محطّةَ فيها — لا موقعَ لأيّ بند، فتُفتح مهمّةٌ بلا مشي؛ راجع الأرصدةَ والمواقعَ أوّلًا.'}
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={launch}>
                  {busy ? 'يفتح…' : 'افتح مهمّةَ تحضيرٍ ميدانيّة'}
                </button>
              </div>
            )}

            {launchError && <div className="text-xs text-brand-red leading-relaxed">{launchError}</div>}
          </section>

          {mode === 'doc' && docId && (
            <div className="text-center">
              <a href={`${base}/dashboard/document?type=PICK&id=${docId}`} className="btn btn-secondary btn-sm">افتح المستند</a>
            </div>
          )}
        </>
      )}

      {!plan && (
        <Notice>
          {mode === 'doc' ? 'اختر مستند سحبٍ لترى مواقعه ومساره.' : 'ألصق أكواد الأصناف لترى أين هي.'}
        </Notice>
      )}

      <p className="text-[11px] text-muted text-center leading-relaxed">
        التخصيص بـFEFO — الأقربُ انتهاءً أوّلًا. والمسار يُرتَّب بالمشي الفعليّ متى توفّرت شبكة المسافات،
        وبالكود حين لا تتوفّر — ويُعلَن أساسُه ولا يُخمَّن.
        {plan?.route?.unknown ? ` · ${num(plan.route.unknown)} مسافةً لم تُحسب (موقعٌ بلا إحداثيّات) فبقيت آخر المسار.` : ''}
      </p>
    </div>
  );
}

function Tab({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border transition-colors ${
        active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-chip border-line text-ink-2 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted truncate">{hint}</div>
    </div>
  );
}

const Th = ({ children, align }) => (
  <th className={`px-3 py-2 font-bold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);
const Td = ({ children, align, className = '' }) => (
  <td className={`px-3 py-2 align-top ${align === 'left' ? 'text-left font-mono' : 'text-right'} ${className}`}>{children}</td>
);

function Notice({ children }) {
  return (
    <div className="o_theme" dir="rtl">
      <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>
    </div>
  );
}
