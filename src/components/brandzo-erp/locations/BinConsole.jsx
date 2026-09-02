import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { useBarcodeCamera, ScanCameraButton, ScanCameraPanel } from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { createDraft } from '../../../services/documents/documentsService.js';
import {
  appendScan,
  closeOperation,
  createOperation,
  listOpenOperations,
  listenScans,
} from '../../../services/stock/operationsService.js';
import {
  BIN_SESSION_TYPE,
  findSessionFor,
  scanPayload,
  scanProblems,
  scansOfBin,
  sessionDraft,
  sessionLabel,
  sessionScopeFor,
  sessionSummary,
} from '../../../services/locations/binSession.js';
import { listUnitsAt } from '../../../services/lpn/lpnService.js';
import { binHeadline, binPrefixOf, segmentLabelsOf, warehouseForBin } from '../../../services/locations/binAnatomy.js';
import { withAssignments } from '../../../services/locations/binTemplate.js';
import {
  addressComplete,
  codingSteps,
  findByBarcode,
  nextAddress,
  normalizeBinBarcode,
  suggestAddress,
} from '../../../services/locations/binCoding.js';
import { bindLocationBarcode } from '../../../services/locations/locationsService.js';
import BinCodingWizard from './BinCodingWizard.jsx';
import BIN_SCHEMES from '../../../data/warehouse-schemes.json';
import { normalizeLocationCode } from '../../../services/locations/locationCode.js';
import {
  BIN_MODES,
  binContents,
  binProblem,
  buildDocDraft,
  draftLineFor,
  entryProblems,
  linesForScan,
  identifyBin,
  modeOf,
  orderRequirementOf,
  routeScan,
} from '../../../services/locations/binConsole.js';

/**
 * لوحة الخانة — «امسح الخانة فتُفتح كمستودعٍ داخليّ» (طلب المالك 2026-09-01).
 *
 * ═══ ما تحلّه ═══
 * كلّ شاشات المخزون تبدأ بمستند: افتح أمرًا ثمّ اذهب إلى الرفّ. والعاملُ في
 * الممرّ يبدأ بالرفّ — يقف أمام خانةٍ ويريد أن يعرف ما فيها. فلا شاشةَ تجيبه.
 *
 * ═══ القراءة ═══
 * محرّكُ المسح واحدٌ في `services/scan/` (درسُ «قارئ الباركود لا يقرأ»):
 * الكاميرا تعمل على كلّ جهازٍ ولا تُخفى بحكمٍ مسبق، وجهازُ الباركود مسموعٌ
 * في الشاشة كلّها لا في حقلٍ مركَّز. والتوجيهُ **بالتصنيف لا بترتيب الحقول**،
 * فيمسح العاملُ بأيّ ترتيبٍ ولا يقع كودُ خانةٍ في حقل صنف.
 *
 * ═══ ★★★ ولا رصيدَ يتحرّك من هنا ═══
 * كلّ الحكم في `binConsole.js` الخالص المُختبَر، وهذه الشاشة عرضٌ له. والأوضاعُ
 * الكاتبةُ تُنشئ **مسوّدةَ مستندٍ** تمرّ بمحرّك المستندات — نفسِ الطريق الذي
 * يمرّ به كلُّ شيء. فلا مسارَ رصيدٍ ثانٍ.
 */

const TEMPLATES = BIN_SCHEMES?.templates || [];
const ASSIGNMENTS = BIN_SCHEMES?.assignments || [];

const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const IN = 'bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50';

function Notice({ children }) {
  return (
    <div dir="rtl" className="o_theme">
      <div className="o_ds o_ds_card o_ds_pad text-sm text-ink-2">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone === 'muted' ? 'text-muted' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

export default function BinConsole() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [units, setUnits] = useState([]);

  // ★★★ مرحلتان لا واحدة (طلب المالك 2026-09-02): `pending` كودٌ **قُرئ ولم
  // يُحدَّد بعد**، و`bin` كودٌ **حدّده العامل**. والمسحُ فعلٌ أعمى — فمن يفتح
  // الخانةَ فورًا يجعل العاملَ يعمل في رفٍّ لم يتأكّد أنّه رفُّه.
  const [pending, setPending] = useState('');
  // ★★★ التكويد ‹LOC-708›: باركودٌ مقروءٌ لم يُربط بعد ⟶ ويزاردُ عنوان.
  // `coding` الباركودُ قيد التكويد ('' = لا ويزارد) · `manual` إدخالٌ بلا مسح.
  const [coding, setCoding] = useState('');
  const [manual, setManual] = useState(false);
  const [address, setAddress] = useState({});
  const [suggested, setSuggested] = useState(false);
  const [codingWhId, setCodingWhId] = useState('');
  const [lastAddress, setLastAddress] = useState(null);
  /** باركودٌ مُلتبِس: قد يكون ملصقَ موقعٍ لم يُكوَّد، وقد يكون صنفًا. */
  const [ambiguous, setAmbiguous] = useState('');
  /**
   * ★★★ المسارُ المعاكس ‹LOC-710› (طلب المالك 2026-09-02): «أنا موظّفٌ دخلتُ
   * الممرّ، اخترتُ الممرّ والجهة والمستوى — وأريد كذلك **إضافة الباركود له**،
   * لأنّ الباركود يأتي جاهزًا من التسويق».
   *
   * فالعنوانُ أوّلًا ثمّ الملصق: هذا هو الباركودُ المُلتقَط في تلك الخطوة.
   */
  const [codingBarcode, setCodingBarcode] = useState('');
  const [bin, setBin] = useState('');
  // الافتراضُ «جرد» — وهو إثباتُ ما في الخانة، وأكثرُ ما يُفعل عند الرفّ.
  const [mode, setMode] = useState('count');
  const [scanned, setScanned] = useState('');
  const [qty, setQty] = useState('');
  const [destination, setDestination] = useState('');
  // ★★★ الجلسةُ سجلٌّ ملحق-فقط في السحابة لا قائمةٌ في الشاشة (طلب المالك
  // 2026-09-02): كلُّ مسحةٍ تُثبَّت لحظتَها، فمن أُغلق هاتفُه لا يضيع عملُه.
  const [session, setSession] = useState(null);
  const [scans, setScans] = useState([]);
  const [entries, setEntries] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState('');
  const [created, setCreated] = useState(null);

  const base = getBasePath();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user).catch(() => null));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const a = subscribeWarehouses(setWarehouses);
    const b = listenLocations(setLocations);
    const c = listenBalances(setBalances);
    return () => { a?.(); b?.(); c?.(); };
  }, [me]);

  /** الكودُ الفاعل — المعروضُ للتعريف إن وُجد، وإلّا المحدَّد. */
  const activeCode = pending || bin;

  /**
   * ★ المستودعاتُ مُغنَاةً بالإسناد المعتمد — فيعرف العاملُ مستودعَه وتسمياتِ
   * مقاطعه **قبل** أن يُحفظ القالبُ على الوثيقة. والمحفوظُ يتقدّم دائمًا.
   */
  const effectiveWarehouses = useMemo(
    () => withAssignments(warehouses, { assignments: ASSIGNMENTS, templates: TEMPLATES }),
    [warehouses]
  );

  const whDoc = useMemo(() => warehouseForBin(activeCode, effectiveWarehouses), [activeCode, effectiveWarehouses]);

  /**
   * مستودعُ التكويد — يُسأل حين لا يدلّ عليه الباركود (وهو الأصلُ: الملصقُ
   * أصمُّ). ويُفترض الأوّلَ ذا القالب حتّى يختار الموظّف.
   */
  const codingWh = useMemo(() => {
    const list = effectiveWarehouses || [];
    return list.find((w) => (w.id || w.code) === codingWhId) || list.find((w) => w.binPrefix) || list[0] || null;
  }, [effectiveWarehouses, codingWhId]);

  /** خطواتُ الويزارد — تُشتقّ من مخطّط المستودع لا تُكتب بيد. */
  const wizardSteps = useMemo(() => codingSteps(codingWh, TEMPLATES), [codingWh]);

  /**
   * أينتظر الويزاردُ باركودًا الآن؟ — في المسار المعاكس، بعد اكتمال العنوان.
   * وحين ينتظر، تذهب المسحةُ إلى حقل الملصق لا إلى التوجيه.
   *
   * ⚠️ ويُعلَن **قبل** `onScanned`: هي تقرؤه في جسمها وفي قائمة تبعيّاتها،
   * و`const` لا يُقرأ قبل تهيئته — فالترتيبُ هنا شرطٌ لا تنسيق.
   */
  const awaitingBarcode = manual && wizardSteps.length > 0 && addressComplete(address, wizardSteps);
  const knownCodes = useMemo(() => (locations || []).map((l) => l.code), [locations]);
  const contents = useMemo(() => binContents(activeCode, { balances, units }), [activeCode, balances, units]);
  const problem = useMemo(() => (bin ? binProblem(bin, knownCodes) : ''), [bin, knownCodes]);

  /** بطاقةُ التعريف — كلُّ ما تعرضه المرحلةُ الأولى، من المنطق الخالص. */
  const ident = useMemo(
    () => (pending ? identifyBin(pending, { warehouses: effectiveWarehouses, knownCodes, balances, units }) : null),
    [pending, effectiveWarehouses, knownCodes, balances, units]
  );
  const m = modeOf(mode);

  /**
   * طبالي الخانة تُجلب عند فتحها لا مع كلّ رصيد — استعلامٌ محدودٌ بالمستودع
   * والخانة (`listUnitsAt`)، فلا تُقرأ آلافُ الطبالي لعرض رفٍّ واحد.
   */
  useEffect(() => {
    const code = normalizeLocationCode(activeCode);
    if (!me || !code || !whDoc) { setUnits([]); return undefined; }
    let alive = true;
    // ⚠️ هويّتان مشروعتان للمستودع على الطبليّة: كودُ البوّابة (`WH001`) وبادئةُ
    // الملصقات (`RH`) — و`listUnitsAt` يطابق `warehouse` مطابقةً تامّة. فيُسأل
    // عنهما ويُدمج الناتج، وإلّا عُرضت خانةٌ «بلا طبالي» وفيها طبالي.
    const asked = [...new Set([whDoc.code, binPrefixOf(whDoc)].filter(Boolean))];
    Promise.all(asked.map((w) => listUnitsAt({ warehouse: w, bin: code }).catch(() => [])))
      .then((groups) => {
        if (!alive) return;
        const seen = new Set();
        setUnits(groups.flat().filter((u) => (seen.has(u.code) ? false : seen.add(u.code))));
      });
    return () => { alive = false; };
  }, [me, activeCode, whDoc]);

  /**
   * عند فتح الويزارد بباركودٍ جديد: يُقترح عنوانُه إن كان الملصقُ ناطقًا،
   * وإلّا يُقترح **التالي في التسلسل** بعد آخر ربطٍ — فيمشي الموظّف بالتتابع
   * ولا يُعيد أربعَ ضغطاتٍ في كلّ خانةٍ من ٣٦٠٠.
   */
  useEffect(() => {
    if (!coding || !wizardSteps.length) return;
    const prefix = codingWh?.binPrefix || codingWh?.code || '';
    const fromBarcode = suggestAddress(coding, { binPrefix: prefix, steps: wizardSteps });
    if (fromBarcode.source) { setAddress(fromBarcode.address); setSuggested('barcode'); return; }
    const seq = lastAddress ? nextAddress(lastAddress, wizardSteps) : null;
    setAddress(seq || {});
    // ★ مصدرُ الاقتراح يُقال: «من الباركود» غيرُ «التالي بعد ما ربطتَه» —
    //   والموظّفُ يثق بالثاني أقلَّ فيراجعه.
    setSuggested(seq ? 'sequence' : '');
  }, [coding, wizardSteps, codingWh, lastAddress]);

  /** قيودُ الجلسة حيّةً — مصدرُ الحقيقة، لا قائمةُ الشاشة. */
  useEffect(() => {
    if (!session?.id) { setScans([]); return undefined; }
    return listenScans(session.id, setScans);
  }, [session?.id]);

  /** تسمياتُ مقاطع هذا المستودع — تقول «الممرّ» حيث يُسمّيه المستودعُ ممرًّا. */
  const labels = useMemo(() => segmentLabelsOf(whDoc), [whDoc]);
  const summary = useMemo(() => sessionSummary(scans), [scans]);
  const binScans = useMemo(() => scansOfBin(scans, bin), [scans, bin]);

  /** الصفوفُ التي يطابقها ما مُسح — قد تكون دفعاتٍ شتّى لصنفٍ واحد. */
  const hits = useMemo(() => (scanned ? linesForScan(contents, scanned) : []), [contents, scanned]);
  const [pickedBatch, setPickedBatch] = useState(0);
  const item = hits[pickedBatch] || hits[0] || null;

  /** يُغلق الخانة ويعود إلى المسح — ويمسح كلَّ أثرٍ من الخانة السابقة. */
  const resetBin = useCallback(() => {
    setPending('');
    setCoding('');
    setManual(false);
    setAmbiguous('');
    setAddress({});
    setSuggested('');
    setCodingBarcode('');
    setBin('');
    setScanned('');
    setQty('');
    setPickedBatch(0);
    setEntries([]);
    setCreated(null);
    setMsg({ type: '', text: '' });
  }, []);

  /**
   * ★★ المسحةُ **تعرض** الخانةَ ولا تفتحها. والفتحُ بضغطة «حدّد» — وهذا هو
   * الفرقُ بين أن يرى العاملُ ما مسح، وأن يكتشفه بعد أن يُثبت كمّيّاتٍ في
   * المكان الغلط. ومسحُ خانةٍ ثانيةٍ وهو داخلَ الأولى يعرضها كذلك ولا يقفز.
   */
  /**
   * ★★★ المسحةُ تبحث عن **ربطٍ** قبل كلّ شيء (طلب المالك 2026-09-02):
   * النظامُ لا يفترض عنوانَ الباركود. فإن كان مربوطًا عُرض عنوانُه للتأكيد،
   * وإن لم يكن فُتح ويزاردُ التكويد ليقول له الموظّفُ أين هو.
   */
  const presentBin = useCallback(
    (raw) => {
      setScanned('');
      setQty('');
      setPickedBatch(0);
      setAmbiguous('');
      setMsg({ type: '', text: '' });

      const hit = findByBarcode(locations, raw);
      if (hit) { setCoding(''); setManual(false); setPending(hit.code); return; }

      // غيرُ مربوط — يُفتح الويزارد بعنوانٍ **مقترَحٍ** إن كان الملصقُ ناطقًا.
      setPending('');
      setManual(false);
      setCoding(normalizeBinBarcode(raw));
    },
    [locations]
  );

  /** إدخالٌ يدويّ — المسارُ البديل حين يتعذّر المسح. */
  const startManual = useCallback(() => {
    setPending('');
    setCoding('');
    setManual(true);
    setSuggested('');
    setCodingBarcode('');
    setAddress(lastAddress ? nextAddress(lastAddress, wizardSteps) || {} : {});
  }, [lastAddress, wizardSteps]);

  /**
   * يعتمد المعروضَ فيصير الخانةَ المفتوحة — وهنا يبدأ العمل.
   *
   * ★★ وتُفتح **جلسةُ الممرّ** أو تُستأنف المفتوحةُ له: العاملُ يمشي ممرًّا
   * كاملًا، فجلسةٌ لكلّ خانةٍ تعني مئةَ محضرِ جردٍ في ممرٍّ واحد. وعاملان في
   * الممرّ نفسِه يكتبان في سجلٍّ واحد.
   *
   * ولا يُنتظر إقرارُ الخادم: createOperation تُعيد معرّفًا محلّيًّا فورًا
   * (درسُ ‹CAP-303›: انتظارُ الإقرار بلا شبكةٍ يعلّق الشاشة أبدًا).
   */
  const confirmBin = useCallback(async () => {
    const code = pending;
    setBin(code);
    setPending('');
    setEntries([]);
    setCreated(null);
    setMsg({ type: '', text: '' });

    const scope = sessionScopeFor(code);
    if (!scope.warehouse || session) return;

    try {
      const open = await listOpenOperations(50).catch(() => []);
      const found = findSessionFor(open, code);
      if (found) { setSession(found); return; }
      const made = await createOperation({
        type: BIN_SESSION_TYPE,
        profile: me,
        note: 'جلسةُ جرد خانات',
        warehouse: scope.warehouse,
        zone: scope.zone,
      });
      setSession({ id: made.id, code: made.code, type: BIN_SESSION_TYPE, status: 'open', ...made.scope });
      made.saved?.catch?.((err) =>
        setMsg({ type: 'error', text: 'تعذّر رفعُ رأس الجلسة: ' + (err?.message || 'سببٌ غير معروف') })
      );
    } catch (err) {
      setMsg({ type: 'error', text: 'تعذّر فتحُ الجلسة: ' + (err?.message || 'سببٌ غير معروف') });
    }
  }, [pending, session, me]);

  /** المسحةُ الواحدة — وجهتُها من التصنيف، والرفضُ يقول الصواب. */
  const onScanned = useCallback(
    (raw) => {
      // ★ المسارُ المعاكس: العنوانُ اكتمل وننتظر ملصقًا — فالمسحةُ ملصقٌ
      //   لا توجيه. (نفسُ قاعدة «القراءة تتبع الحقل المنتظِر» في شاشات الطبالي.)
      if (awaitingBarcode) { setCodingBarcode(normalizeBinBarcode(raw)); return; }

      const hit = findByBarcode(locations, raw);
      const v = routeScan(raw, { hasBin: Boolean(bin), bound: Boolean(hit) });
      if (v.action === 'bin') { presentBin(v.code); return; }
      if (v.action === 'ambiguous') {
        // لا يُفترض — يُعرض السؤالُ بزرَّيه، والجوابُ من الموظّف.
        setAmbiguous(v.code);
        setMsg({ type: '', text: '' });
        return;
      }
      if (v.action === 'item') {
        setScanned(v.code);
        setPickedBatch(0);
        setMsg({ type: '', text: '' });
        return;
      }
      if (v.action === 'pallet') {
        setMsg({ type: 'info', text: `طبليّة «${v.code}» — تُعرض في محتوى الخانة أدناه.` });
        return;
      }
      setMsg({ type: 'error', text: v.message });
    },
    [bin, presentBin, locations, awaitingBarcode]
  );

  /** خطوةٌ أُجيبت — وما بعدها يُمسح، فلا يبقى جوابٌ لسؤالٍ تغيّر ما قبله. */
  function pickStep(key, value) {
    const at = wizardSteps.findIndex((st) => st.key === key);
    const next = {};
    wizardSteps.forEach((st, i) => { if (i < at) next[st.key] = address[st.key]; });
    next[key] = value;
    setAddress(next);
    setSuggested('');
  }

  /** رجوعٌ إلى خطوة — تُمسح هي وما بعدها فتُسأل من جديد. */
  function backToStep(i) {
    const next = {};
    wizardSteps.forEach((st, j) => { if (j < i) next[st.key] = address[st.key]; });
    setAddress(next);
    setSuggested('');
  }

  function cancelWizard() {
    setCoding('');
    setManual(false);
    setAddress({});
    setSuggested('');
    setCodingBarcode('');
  }

  /**
   * تأكيدُ الويزارد: يربط الباركودَ بالعنوان (أو يفتح الموقعَ في الإدخال
   * اليدويّ)، ثمّ يعرض الخانةَ للتحديد — فيمضي الموظّف إلى محتواها.
   */
  async function confirmCoding(code) {
    if (!code) return;
    // في المسارَين يُربط ملصقٌ إن وُجد: المسحُ أوّلًا يحمل `coding`، والعنوانُ
    // أوّلًا يحمل `codingBarcode`. وبلا ملصقٍ تُفتح الخانةُ ولا يُربط شيء.
    const label = manual ? codingBarcode : coding;
    setBusy(label ? 'يربط…' : 'يفتح…');
    setMsg({ type: '', text: '' });
    try {
      if (label) await bindLocationBarcode(code, label, me);
      setLastAddress({ ...address });
      cancelWizard();
      setPending(code);
      setMsg({ type: 'success', text: label ? `رُبط الباركود بـ«${code}».` : '' });
    } catch (err) {
      setMsg({ type: 'error', text: (label ? 'تعذّر الربط: ' : 'تعذّر الفتح: ') + (err?.message || 'سببٌ غير معروف') });
    } finally {
      setBusy('');
    }
  }

  const camera = useBarcodeCamera({ onCode: onScanned, closeOnCode: true });
  useWedgeScanner(onScanned, { enabled: ready && Boolean(me) });

  /**
   * ★★★ المسحةُ تُثبَّت في السحابة **فورًا** ولا تُنتظر (وضعُ الجرد).
   *
   * ولا `await`: وعدُ `setDoc` لا يُحلّ بلا شبكة، وانتظارُه يعلّق الشاشةَ
   * أبدًا والعادُّ يضغط ولا شيء يحدث (درسُ ‹CAP› الحرفيّ). فيُرسَل ويُمضى،
   * وFirestore يرفعه حين تعود الشبكة. والفشلُ الحقيقيّ يُعلَن في `catch`.
   */
  function addEntry() {
    const source = item || { sku: scanned, barcode: scanned };

    if (mode === 'count') {
      const problems = scanProblems({ bin, item: source, qty });
      if (problems.length) { setMsg({ type: 'error', text: problems[0] }); return; }
      if (!session?.id) { setMsg({ type: 'error', text: 'لا جلسةَ مفتوحة — أعد تحديد الخانة.' }); return; }

      appendScan(session.id, scanPayload({ bin, item: source, qty, bookQty: item?.qty ?? 0, profile: me }))
        .catch((err) => setMsg({ type: 'error', text: 'لم تُثبَّت المسحة: ' + (err?.message || 'سببٌ غير معروف') }));

      setScanned('');
      setQty('');
      setPickedBatch(0);
      setMsg({ type: 'success', text: 'ثُبِّتت المسحة.' });
      return;
    }

    const line = draftLineFor(mode, { bin, item: source, qty, bookQty: item?.qty ?? 0 });
    const problems = entryProblems(mode, { line, contents, scanned });
    if (problems.length) { setMsg({ type: 'error', text: problems[0] }); return; }
    setEntries((prev) => [...prev, line]);
    setScanned('');
    setQty('');
    setPickedBatch(0);
    setMsg({ type: 'success', text: 'أُضيف البند.' });
  }

  /**
   * إنهاءُ الجلسة — المحضرُ يُبنى من **القيود المحفوظة** لا من الشاشة.
   * والإقفالُ بعد إنشاء المستند: من أقفل أوّلًا رفض الخادمُ ما بقي في طابور
   * الهاتف (درسُ ‹CAP›: الإقفالُ يبتلع الطابور).
   */
  async function finishSession() {
    if (!session?.id) return;
    const draft = sessionDraft(session, scans, { warehouseCode: whDoc?.code || '' });
    if (!draft) { setMsg({ type: 'error', text: 'لا مسحاتٍ في الجلسة بعد.' }); return; }
    setBusy('يُنهي الجلسة…');
    setMsg({ type: '', text: '' });
    try {
      const id = await createDraft({ type: draft.type, profile: me, header: draft.header, lines: draft.lines });
      await closeOperation(session.id).catch(() => {});
      setCreated({ id, type: draft.type, lines: draft.lines.length });
      setSession(null);
    } catch (err) {
      setMsg({ type: 'error', text: err?.message || 'تعذّر الإنهاء.' });
    } finally {
      setBusy('');
    }
  }

  async function saveDraft() {
    const draft = buildDocDraft(mode, {
      bin,
      // ★★★ كودُ المستودع في البوّابة لا بادئةُ الملصق (كُشف بالفحص الحيّ
      // 2026-09-02): `balances` معرّفُه `صنف__مستودع__دفعة`، والقيدُ يبنيه من
      // `header.warehouse`. فترويسةٌ تحمل «RH» بدل «WH001» تُنشئ رصيدًا
      // موازيًا لنفس البضاعة — عجزٌ في مكانٍ وفائضٌ في آخر بلا صوت.
      warehouse: whDoc?.code || '',
      lines: entries,
      destination,
    });
    if (!draft) { setMsg({ type: 'error', text: orderRequirementOf(mode) || 'لا بنودَ لحفظها.' }); return; }
    setBusy('يحفظ…');
    setMsg({ type: '', text: '' });
    try {
      const id = await createDraft({ type: draft.type, profile: me, header: draft.header, lines: draft.lines });
      setCreated({ id, type: draft.type, lines: draft.lines.length });
      setEntries([]);
    } catch (err) {
      setMsg({ type: 'error', text: err?.message || 'تعذّر الحفظ.' });
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  return (
    <div dir="rtl" className="o_theme space-y-5">
      {/* ═══ الطبقة ١ — امسح الخانة ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="mapPin" size={18} className="text-accent" />
          <h2 className="font-bold text-ink text-sm">امسح ملصق الخانة</h2>
          <span className="text-[11px] text-muted">الكاميرا أو جهاز الباركود — والجهازُ مسموعٌ في الشاشة كلّها</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={activeCode}
            onChange={(e) => presentBin(e.target.value.toUpperCase())}
            placeholder="RH-A-R-01-01"
            autoComplete="off"
            style={{ direction: 'ltr', textAlign: 'right' }}
            className={`${IN} flex-1 min-w-[200px] font-mono`}
          />
          <ScanCameraButton camera={camera} label="امسح" />
          {(bin || pending) && (
            <button type="button" onClick={resetBin} className="btn-secondary text-xs">
              {bin ? 'أغلق الخانة' : 'إلغاء'}
            </button>
          )}
          {/* المسارُ البديل — حين يتعذّر المسح (ملصقٌ تلف أو عدسةٌ لا تقرأ). */}
          {!bin && !pending && !coding && !manual && (
            <button type="button" onClick={startManual} className="btn-secondary text-xs">
              ابدأ بالعنوان
            </button>
          )}
        </div>
        <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى ملصق الخانة — يُعرض ما قرأتْه العدسة، ثمّ تُحدّده أنت." />
        {problem && <div className="text-xs text-brand-red">{problem}</div>}
        {/*
          ★★★ الرسالةُ هنا لا في قسمٍ مشروطٍ بخانةٍ مفتوحة (كُشف بالفحص الحيّ
          2026-09-02): أشيعُ ردٍّ يقع **قبل** فتح أيّ خانة — من يمسح صنفًا أوّلًا.
          وكانت الرسالة تُبنى ولا تُعرض، فيقف العاملُ أمام شاشةٍ لا تردّ عليه.
        */}
        {msg.text && (
          <div className={`text-xs ${msg.type === 'error' ? 'text-brand-red' : 'text-ink-2'}`}>{msg.text}</div>
        )}
      </section>

      {/* ═══ باركودٌ مُلتبِس — يُسأل ولا يُفترض ═══ */}
      {ambiguous && !coding && (
        <section className="o_ds o_ds_card o_ds_pad space-y-3 border border-accent/40">
          <div className="text-sm text-ink-2">
            الباركود{' '}
            <span className="font-mono font-bold text-ink" style={{ direction: 'ltr', display: 'inline-block' }}>{ambiguous}</span>
            {' '}<strong>غير مربوطٍ بأيّ موقع</strong>.
          </div>
          <div className="text-xs text-ink-2">
            قد يكون ملصقَ رفٍّ لم يُكوَّد بعد، وقد يكون صنفًا مسحتَه قبل تحديد الخانة — والنظامُ لا يفترض.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setCoding(ambiguous); setAmbiguous(''); setManual(false); }}
              className="btn-primary text-xs"
            >
              هذا ملصقُ موقع — كوّدْه
            </button>
            <button type="button" onClick={() => setAmbiguous('')} className="btn-secondary text-xs">
              هذا صنف — سأمسح الخانة أوّلًا
            </button>
          </div>
        </section>
      )}

      {/* ═══ ويزاردُ التكويد — باركودٌ لم يُربط، أو إدخالٌ يدويّ ═══ */}
      {(coding || manual) && (
        <BinCodingWizard
          barcode={coding}
          manual={manual}
          warehouse={codingWh}
          warehouses={effectiveWarehouses}
          onWarehouseChange={setCodingWhId}
          steps={wizardSteps}
          address={address}
          suggested={suggested}
          locations={locations}
          busy={busy}
          capturedBarcode={codingBarcode}
          onBarcodeChange={setCodingBarcode}
          scanButton={<ScanCameraButton camera={camera} compact label="امسح الملصق" />}
          onPick={pickStep}
          onBack={backToStep}
          onConfirm={confirmCoding}
          onCancel={cancelWizard}
        />
      )}

      {/* ═══ المرحلة ١ — قُرئ وعُرِّف · ولم يُحدَّد بعد ═══ */}
      {ident && (
        <section className="o_ds o_ds_card o_ds_pad space-y-3 border border-accent/40">
          <div className="flex items-center gap-2">
            <Icon name="mapPin" size={16} className="text-accent" />
            <h3 className="font-bold text-ink text-sm">هذا ما قرأتْه العدسة — تأكّدْ قبل أن تعمل</h3>
          </div>

          <div className="font-mono font-bold text-ink text-lg" style={{ direction: 'ltr' }}>{ident.code}</div>

          {ident.valid && ident.segments.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {ident.warehouse && (
                <div>
                  <div className="text-[11px] text-muted">المستودع</div>
                  <div className="text-sm font-bold text-ink">{ident.warehouse.nameAr || ident.warehouse.name || ident.warehouse.code}</div>
                </div>
              )}
              {ident.segments.map((seg) => (
                <div key={seg.key}>
                  <div className="text-[11px] text-muted">{seg.label}</div>
                  <div className="text-sm font-bold text-ink">{seg.text}</div>
                </div>
              ))}
            </div>
          )}

          {/* ملخّصٌ سريع: أفارغةٌ هي أم فيها بضاعة — قبل أن يدخل. */}
          {ident.valid && !ident.problem && (
            <div className="flex flex-wrap items-center gap-5 pt-1 border-t border-line">
              {ident.summary.empty ? (
                <span className="text-xs text-ink-2">الخانة فارغة — لا رصيدَ مسجَّلٌ عليها ولا طبليّة.</span>
              ) : (
                <>
                  <Stat label="أصناف" value={num(ident.summary.skuCount)} />
                  <Stat label="مجموع الكمّيّات" value={num(ident.summary.totalQty)} />
                  <Stat label="طبالي واقفة" value={num(ident.summary.palletCount)} tone={ident.summary.palletCount ? '' : 'muted'} />
                </>
              )}
            </div>
          )}

          {ident.problem && <div className="text-xs text-brand-red">{ident.problem}</div>}
          {ident.warning && <div className="text-xs text-ink-2">{ident.warning}</div>}

          <div className="flex flex-wrap gap-2 items-center pt-1">
            <button
              type="button"
              onClick={confirmBin}
              disabled={!ident.valid || Boolean(ident.problem)}
              className="btn-primary text-xs"
            >
              حدّد هذه الخانة
            </button>
            <button type="button" onClick={resetBin} className="btn-secondary text-xs">
              إلغاء — امسح غيرها
            </button>
            <span className="text-[11px] text-muted">ولا يبدأ العملُ قبل أن تُحدّد.</span>
          </div>
        </section>
      )}

      {/* ═══ المرحلة ٢ — الخانة محدَّدةً: هويّتُها ومحتواها ═══ */}
      {bin && !pending && !problem && (
        <>
          {/* ═══ شريطُ الجلسة — كلُّ مسحةٍ فيه مثبَّتةٌ في السحابة ═══ */}
          {session && (
            <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-x-5 gap-y-2">
              <Icon name="clipboardList" size={16} className="text-accent shrink-0" />
              <div>
                <div className="text-[11px] text-muted">جلسةٌ مفتوحة</div>
                <div className="text-sm font-bold text-ink">
                  {sessionLabel(session, whDoc, labels)}
                  {session.code && (
                    <span className="font-mono text-[11px] text-muted" style={{ direction: 'ltr' }}> · {session.code}</span>
                  )}
                </div>
              </div>
              <Stat label="مسحاتٌ مثبَّتة" value={num(summary.scanCount)} />
              <Stat label="خانات" value={num(summary.binCount)} />
              <Stat label="مجموع المعدود" value={num(summary.counted)} />
              <div className="flex-1" />
              <button
                type="button"
                onClick={finishSession}
                disabled={Boolean(busy) || summary.scanCount === 0}
                className="btn-primary text-xs"
                title={summary.scanCount ? '' : 'لا مسحاتٍ بعد'}
              >
                {busy || 'أنهِ الجلسة وابنِ المحضر'}
              </button>
            </section>
          )}
          <section className="o_ds o_ds_card o_ds_pad space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono font-bold text-ink text-base" style={{ direction: 'ltr' }}>{bin}</span>
              {/* ⚠️ وثيقةُ المستودع تكتب `name` (وهو الاسم العربيّ) — و`nameAr`
                  لا يكتبه أحد. فالترتيبُ هنا يقرأ الاثنين، وإلّا عُرض «WH001». */}
              {whDoc && <span className="text-sm text-ink-2">{whDoc.nameAr || whDoc.name || whDoc.code}</span>}
              {!whDoc && <span className="text-xs text-brand-red">بادئةٌ لا مستودعَ لها — ملصقُ فرعٍ آخر؟</span>}
            </div>
            {whDoc && <div className="text-xs text-ink-2">{binHeadline(bin, whDoc)}</div>}
            <div className="flex flex-wrap items-center gap-5 pt-1">
              <Stat label="أصناف" value={num(contents.skuCount)} />
              <Stat label="مجموع الكمّيّات" value={num(contents.totalQty)} />
              <Stat label="طبالي واقفة" value={num(contents.pallets.length)} tone={contents.pallets.length ? '' : 'muted'} />
            </div>
          </section>

          <section className="o_ds o_ds_card">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <Icon name="package" size={16} className="text-accent" />
              <h3 className="font-bold text-ink text-sm">ما في الخانة الآن</h3>
            </div>
            {contents.lines.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">الخانة فارغة — لا رصيدَ مسجَّلٌ عليها.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="o_list w-full text-sm">
                  <thead>
                    <tr>
                      <th>الصنف</th><th>الاسم</th><th>الدفعة</th><th>الصلاحية</th><th>الكمّيّة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contents.lines.map((l, i) => (
                      <tr key={`${l.sku}-${l.batch}-${i}`}>
                        <td className="font-mono" style={{ direction: 'ltr' }}>{l.sku}</td>
                        <td>{l.nameAr || '—'}</td>
                        <td className="font-mono" style={{ direction: 'ltr' }}>{l.batch || '—'}</td>
                        <td className="font-mono" style={{ direction: 'ltr' }}>{l.expiry || '—'}</td>
                        <td className="font-bold">{num(l.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {contents.pallets.length > 0 && (
              <div className="px-4 py-3 border-t border-line flex flex-wrap gap-2 items-center">
                <span className="text-[11px] text-muted">الطبالي:</span>
                {contents.pallets.map((p) => (
                  <span key={p.code} className="font-mono text-[11px] text-ink-2" style={{ direction: 'ltr' }}>{p.code}</span>
                ))}
              </div>
            )}
          </section>

          {/* ═══ الطبقة ٣ — الوضع ثمّ مسح الصنف ═══ */}
          <section className="o_ds o_ds_card o_ds_pad space-y-3">
            <div className="flex flex-wrap gap-2">
              {BIN_MODES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => { setMode(x.id); setMsg({ type: '', text: '' }); }}
                  className={mode === x.id ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                >
                  {x.labelAr}
                </button>
              ))}
            </div>

            {m.id === 'lookup' && (
              <p className="text-xs text-ink-2">
                وضعُ الاستعلام يقرأ ولا يكتب. امسح صنفًا لترى صفوفَه في هذه الخانة، أو بدّل الوضع للعمل.
              </p>
            )}
            {m.needsOrder && (
              <p className="text-xs text-brand-red">{orderRequirementOf(m.id)}</p>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={scanned}
                onChange={(e) => { setScanned(e.target.value); setPickedBatch(0); }}
                placeholder="امسح باركود الصنف أو اكتب كوده"
                autoComplete="off"
                style={{ direction: 'ltr', textAlign: 'right' }}
                className={`${IN} flex-1 min-w-[200px] font-mono`}
              />
              {m.docType && !m.needsOrder && (
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={m.id === 'count' ? 'المعدود' : 'الكمّيّة'}
                  className={`${IN} w-28`}
                />
              )}
              {m.docType && !m.needsOrder && (
                <button type="button" onClick={addEntry} className="btn-primary text-xs">أضف البند</button>
              )}
            </div>

            {scanned && hits.length === 0 && (
              <div className="text-xs text-ink-2">
                لا رصيدَ لهذا الصنف في هذه الخانة.
                {m.id === 'count' && ' وهذا معنى الجرد — اكتب المعدود ويُسجَّل الفائض.'}
              </div>
            )}

            {hits.length > 1 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[11px] text-muted">الدفعة:</span>
                {hits.map((h, i) => (
                  <button
                    key={`${h.batch}-${i}`}
                    type="button"
                    onClick={() => setPickedBatch(i)}
                    className={pickedBatch === i ? 'btn-primary text-[11px]' : 'btn-secondary text-[11px]'}
                  >
                    <span style={{ direction: 'ltr', display: 'inline-block' }}>{h.batch || 'بلا دفعة'}</span> · {num(h.qty)}
                  </button>
                ))}
              </div>
            )}

            {item && (
              <div className="text-xs text-ink-2">
                <strong className="text-ink">{item.nameAr || item.sku}</strong> — الدفتريُّ في هذه الخانة {num(item.qty)}
                {item.expiry ? ` · ينتهي ${item.expiry}` : ''}
              </div>
            )}

          </section>

          {/* ═══ ما ثُبِّت في هذه الخانة — من السحابة لا من الشاشة ═══ */}
          {mode === 'count' && binScans.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad space-y-2">
              <div className="flex items-center gap-2">
                <Icon name="checkCircle" size={16} className="text-accent" />
                <h3 className="font-bold text-ink text-sm">ثُبِّت في هذه الخانة — {num(binScans.length)}</h3>
                <span className="text-[11px] text-muted">محفوظٌ في السحابة، ولو أُغلق الهاتف</span>
              </div>
              <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
                {binScans.map((sc) => (
                  <li key={sc.id}>
                    <span className="font-mono" style={{ direction: 'ltr', display: 'inline-block' }}>{sc.sku || sc.barcode}</span>
                    {' — '}معدود {num(sc.qty)}
                    {sc.batch ? ` · دفعة ${sc.batch}` : ''}
                    {Number.isFinite(sc.bookQty) ? ` · دفتريّ ${num(sc.bookQty)}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ═══ الطبقة ٤ — المسوّدة قبل الحفظ (للأوضاع الأخرى) ═══ */}
          {mode !== 'count' && entries.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad space-y-3">
              <div className="flex items-center gap-2">
                <Icon name="clipboardList" size={16} className="text-accent" />
                <h3 className="font-bold text-ink text-sm">
                  {m.id === 'count' ? 'محضر جرد الخانة' : 'قائمة السحب'} — {num(entries.length)} بندًا
                </h3>
              </div>
              <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
                {entries.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono" style={{ direction: 'ltr', display: 'inline-block' }}>{e.sku}</span>
                    {' — '}
                    {m.id === 'count' ? `دفتريّ ${num(e.bookQty)} · معدود ${num(e.count1)}` : `كمّيّة ${num(e.qtyPicked)}`}
                    {e.batch ? ` · دفعة ${e.batch}` : ''}
                  </li>
                ))}
              </ul>
              {m.id === 'pick' && (
                <label className="block max-w-sm">
                  <span className="block text-[11px] font-bold text-ink-2 mb-1">الوجهة (إلزاميّة في قائمة السحب)</span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="ساحة التجهيز"
                    className={`${IN} w-full`}
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={Boolean(busy) || (m.id === 'pick' && !destination.trim())}
                  className="btn-primary text-xs"
                >
                  {busy || 'احفظ المسوّدة'}
                </button>
                <button type="button" onClick={() => setEntries([])} className="btn-secondary text-xs">
                  امسح البنود
                </button>
                <span className="text-[11px] text-muted">
                  تُحفظ مسوّدةً — والرصيدُ يتحرّك عند اعتمادها في محرّك المستندات.
                </span>
              </div>
            </section>
          )}

          {created && (
            <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-3">
              <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
              <span className="flex-1 text-sm text-ink-2">
                أُنشئت مسوّدةٌ بـ{num(created.lines)} بندًا — تنتظر الاعتماد.
              </span>
              <a href={`${base}/dashboard/document?type=${created.type}&id=${created.id}`} className="btn-secondary text-xs">
                افتح المستند
              </a>
            </section>
          )}
        </>
      )}
    </div>
  );
}
