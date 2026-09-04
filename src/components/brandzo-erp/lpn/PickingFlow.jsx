/**
 * التحضير الميدانيّ — مهمّةٌ تُمشى بالمسح الثلاثيّ خطوةً خطوة.
 *
 * ═══ القاعدة الحاكمة ═══
 * **الشاشة عرضٌ للحكم لا حَكَم.** كلّ مسحةٍ تمرّ بـ`executePick` التي
 * تستدعي `pickVerdict` الخالصة على البيانات الحيّة — فلا شرطَ يُكتب هنا،
 * والمرحلةُ التالية تُشتقّ من `nextStage` لا من عدّادٍ في الواجهة.
 *
 * والترتيب يتبع المسار الذي رتّبه `pickPlan`: خطوةٌ واحدةٌ ظاهرةٌ في كلّ
 * لحظة — فالمحضّر لا يحتاج أن يقرأ جدولًا وهو يمشي، بل أن يُقال له:
 * **اذهب إلى هذا الرفّ وامسح**.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { currentStep, pathBasisLabel, stepRemaining, taskTotals, fulfillmentGap } from '../../../services/lpn/pickingTask.js';
import { SCAN_STAGES, nextStage, pickEntryVerdict, stepQtyPanel } from '../../../services/lpn/pickingScan.js';
// ‹JR-301ب› خانةُ الكمّيّة لم تعد عاريةً — والمعاينةُ من محرّك الوحدات القائم
// حرفًا: لا تُعاد كتابةُ ضربٍ هنا ولا تُبنى رسالةٌ، فالشاشةُ تعرض حكمًا.
import { baseQtyPreview } from '../../../services/stock/scanFlow.js';
import { packEntryVerdict } from '../../../services/items/packEntry.js';
import {
  closeTaskWithPallet,
  executePick,
  listOpenTasks,
  listenTask,
  skip,
} from '../../../services/lpn/pickingService.js';
import {
  useBarcodeCamera,
  ScanCameraButton,
  ScanCameraPanel,
} from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';
// ‹LPN-309› طورُ التجهيز — ما بعد إقفال المهمّة لا شاشةٌ أخرى.
import { assignToStaging, listStagingQueue, previewStaging } from '../../../services/lpn/stagingService.js';
// ‹LPN-511› الصلاحية تُعلَم قبل الضغط لا بعد ارتداد الخادم.
import { uiGate } from '../../../services/lpn/lpnRoles.js';
import { FieldLangSwitch, useFieldLang } from './useFieldLang.jsx';
// ‹LPN-310› التحميل — طورٌ ثالثٌ لا شاشةٌ خامسة: دورُ LOADER يحمل التجهيز
// والتحميل معًا، والعاملُ نفسُه يمشي من منطقة التجهيز إلى باب الشحن.
import {
  buildSession,
  closeLoad,
  listRoutes,
  loadingCloseProblem,
  loadingCounters,
  scanLoad,
} from '../../../services/lpn/loadingService.js';
// ‹LPN-408› استلامُ الوجهة — من يمسح يقف عند الشاحنة لا عند مكتب.
import {
  buildDiscrepancies,
  buildInboundSession,
  listInbound,
  receiveCloseProblem,
  receiveCounters,
  scanInbound,
} from '../../../services/lpn/inboundService.js';
import { DISCREPANCY_TYPES } from '../../../services/lpn/transferPallets.js';

export default function PickingFlow() {
  const { lang, dir, setLang, tr } = useFieldLang();
  const [me, setMe] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskId, setTaskId] = useState('');
  const [task, setTask] = useState(null);
  const [scan, setScan] = useState({});
  const [input, setInput] = useState('');
  const [qty, setQty] = useState('');
  const [flash, setFlash] = useState(null);
  // ‹JR-301ب› وحدةُ الإدخال والوعاءُ المُعلَن — حالةُ عرضٍ لا حكم.
  const [entryUom, setEntryUom] = useState('');
  const [pack, setPack] = useState({ label: '', containers: '', per: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // ‹LPN-309› 'picking' | 'staging'
  const [mode, setMode] = useState('picking');
  const [stageQueue, setStageQueue] = useState([]);
  const [stageCapped, setStageCapped] = useState(false);
  const [stageUnit, setStageUnit] = useState(null);
  const [stageBin, setStageBin] = useState('');
  const inputRef = useRef(null);

  const actorName = me?.name || me?.displayName || me?.email || '';
  // ‹LPN-511› والمجهولُ يمرّ — لا تُبنى شاشةٌ على جهلٍ بالهويّة.
  const pickGate = uiGate(me?.role, 'PICK');
  const stageGate = uiGate(me?.role, 'STAGE');
  const loadGate = uiGate(me?.role, 'LOAD');

  /* ── ‹LPN-310› التحميل — والجلسةُ تُشتقّ في كلّ فتحة ── */
  const [routes, setRoutes] = useState([]);
  const [loadUnits, setLoadUnits] = useState([]);
  const [route, setRoute] = useState('');
  const [loadSession, setLoadSession] = useState(null);
  const [loadCode, setLoadCode] = useState('');
  const [seal, setSeal] = useState('');
  const [closeNote, setCloseNote] = useState('');

  /* ── ‹LPN-408› استلامُ الوجهة ── */
  const [inRoutes, setInRoutes] = useState([]);
  const [inUnits, setInUnits] = useState([]);
  const [inRoute, setInRoute] = useState('');
  const [inSession, setInSession] = useState(null);
  const [inManifest, setInManifest] = useState(null);
  const [inCode, setInCode] = useState('');
  const [sealState, setSealState] = useState('intact');

  const refreshInbound = useCallback(async () => {
    try {
      const r = await listInbound({ max: 200 });
      setInRoutes(r.routes);
      setInUnits(r.units);
    } catch {
      setInRoutes([]); setInUnits([]);
      setFlash({ kind: 'err', text: 'تعذّرت قراءة الشحنات الواصلة.' });
    }
  }, []);

  useEffect(() => { if (mode === 'inbound') refreshInbound(); }, [mode, refreshInbound]);

  useEffect(() => {
    if (mode !== 'inbound' || !inRoute || !actorName) { setInSession(null); setInManifest(null); return; }
    const built = buildInboundSession(inUnits, inRoute, { actor: actorName, at: new Date().toISOString() });
    setInSession(built.session);
    setInManifest(built.manifest);
  }, [mode, inRoute, inUnits, actorName]);

  const inCounters = useMemo(() => (inSession ? receiveCounters(inSession) : null), [inSession]);
  const inDiscrepancies = useMemo(
    () => (inSession ? buildDiscrepancies(inSession, { manifest: inManifest }) : []),
    [inSession, inManifest]
  );
  const inCloseProblem = useMemo(
    () => (inSession ? receiveCloseProblem(inSession, inDiscrepancies) : ''),
    [inSession, inDiscrepancies]
  );

  async function doInboundScan(e, scanned) {
    e?.preventDefault?.();
    const lpn = String(scanned ?? inCode).trim();
    if (!lpn || !inSession) return;
    setBusy(true);
    try {
      const unit = inUnits.find((u) => u.code === lpn) ?? null;
      const r = await scanInbound(inSession, lpn, unit, {
        sealIntact: sealState !== 'broken',
        opened: sealState === 'opened',
        actor: actorName,
      });
      if (r.problem) { say('err', r.problem); return; }
      setInSession(r.session);
      setInCode('');
      say('ok', `${lpn} — وصلت.`);
      await refreshInbound();
    } catch (err) {
      say('err', err?.message || 'تعذّر تسجيل الاستلام.');
    } finally { setBusy(false); }
  }

  const refreshRoutes = useCallback(async () => {
    try {
      const r = await listRoutes({ max: 200 });
      setRoutes(r.routes);
      setLoadUnits(r.units);
    } catch {
      setRoutes([]); setLoadUnits([]);
      setFlash({ kind: 'err', text: 'تعذّرت قراءة وجهات التحميل.' });
    }
  }, []);

  useEffect(() => { if (mode === 'loading') refreshRoutes(); }, [mode, refreshRoutes]);

  // ★ الجلسةُ تُبنى من الحالة الحيّة — فجلسةٌ ضاعت تعود كما كانت.
  useEffect(() => {
    if (mode !== 'loading' || !route || !actorName) { setLoadSession(null); return; }
    const built = buildSession(loadUnits, route, { actor: actorName, at: new Date().toISOString() });
    setLoadSession(built.problem ? null : built.session);
    if (built.problem) setFlash({ kind: 'err', text: built.problem });
  }, [mode, route, loadUnits, actorName]);

  const loadCounters = useMemo(
    () => (loadSession ? loadingCounters(loadSession) : null),
    [loadSession]
  );
  const closeProblem = useMemo(
    () => (loadSession ? loadingCloseProblem(loadSession, { override: Boolean(closeNote.trim()), overrideNote: closeNote }) : ''),
    [loadSession, closeNote]
  );

  async function doLoadScan(e, scanned) {
    e?.preventDefault?.();
    const lpn = String(scanned ?? loadCode).trim();
    if (!lpn || !loadSession) return;
    setBusy(true);
    try {
      const unit = loadUnits.find((u) => u.code === lpn) ?? null;
      const r = await scanLoad(loadSession, lpn, unit, { actor: actorName });
      if (r.problem) { say('err', r.problem); return; }
      setLoadSession(r.session);
      setLoadCode('');
      say('ok', `${lpn} — حُمّلت.`);
      await refreshRoutes();
    } catch (err) {
      say('err', err?.message || 'تعذّر تسجيل التحميل.');
    } finally { setBusy(false); }
  }

  async function doCloseLoad() {
    if (!loadSession) return;
    setBusy(true);
    try {
      const r = await closeLoad(loadSession, {
        seal, override: Boolean(closeNote.trim()), overrideNote: closeNote, actor: actorName,
      });
      if (r.problem) { say('err', r.problem); return; }
      say('ok', `أُغلق تحميل «${route}»${seal ? ` بختم ${seal}` : ''}.`);
      setLoadSession(null); setRoute(''); setSeal(''); setCloseNote('');
      await refreshRoutes();
    } catch (err) {
      say('err', err?.message || 'تعذّر إغلاق التحميل.');
    } finally { setBusy(false); }
  }

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await listOpenTasks({ max: 50 }));
    } catch (e) {
      setFlash({ kind: 'err', text: e?.message || 'تعذّرت قراءة المهامّ.' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  /**
   * ★★★ مهمّةٌ تُفتح من العنوان — `?doc=<معرّف المستند الآمر>`.
   *
   * ═══ ما كان يقع ═══
   * من ضغط «ابدأ التحضير الميدانيّ» على أمره يصل إلى **قائمةٍ** يبحث فيها عن
   * أمره بين خمسين: الشاشةُ لم تقرأ `searchParams` قطّ. وهو المزلقُ الأوّلُ
   * المكتوبُ في `services/tasks/fieldRoutes.js` حرفًا — «فالمسارُ عارٍ حتّى
   * تقرأه الشاشة، ثمّ يُضاف هنا وفي الشاشة معًا لا هنا وحده». وهذا نصفُه الثاني.
   *
   * ★ والمعاملُ **معرّفُ المستند لا معرّفُ المهمّة**: المهمّةُ تولد على
   * `pickTaskId(doc)` حتمًا، فالمستندُ هو المفتاحُ الذي بيد كلّ داعٍ (زرُّ صفّ
   * المستندات، وشاشةُ خطّة السحب) — ومنه يجيب `listOpenTasks` بقراءةٍ واحدةٍ
   * بالمعرّف بلا فهرسٍ مركّبٍ ينتظر نشرًا.
   *
   * ★★ ولا يُفتح تعريفًا: أمرٌ بلا مهمّةٍ مفتوحةٍ تُقال علّتُه وتبقى القائمة —
   * فشاشةُ تفصيلٍ على مهمّةٍ غيرِ موجودةٍ تعرض «اكتملت خطوات المهمّة» وزرَّ
   * إقفال، وهي كذبةٌ تدعو إلى إقفال ما لم يُفتح.
   *
   * والتنظيفُ بعدها نمطُ `stock/ScanFlow.jsx` حرفًا لا نمطٌ ثانٍ: إعادةُ تحميلٍ
   * بعد رجوعٍ إلى القائمة كانت ستردّه إلى المهمّة التي تركها بقصد.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const wanted = new URLSearchParams(window.location.search).get('doc');
    if (!wanted) return undefined;
    let alive = true;
    listOpenTasks({ sourceDocId: wanted })
      .then(([found]) => {
        if (!alive) return;
        if (found) {
          setMode('picking');
          setTaskId(found.id);
          setScan({});
        } else {
          setFlash({
            kind: 'err',
            text: `لا مهمّةَ تحضيرٍ مفتوحةً على «${wanted}» — إمّا أُقفلت، وإمّا لم تُفتح بعدُ من شاشة خطّة السحب.`,
          });
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('doc');
        window.history.replaceState({}, '', url);
      })
      .catch((e) => {
        if (alive) setFlash({ kind: 'err', text: e?.message || 'تعذّرت قراءةُ المهمّة المطلوبة في العنوان.' });
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => (taskId ? listenTask(taskId, setTask) : undefined), [taskId]);

  const step = useMemo(() => (task ? currentStep(task) : null), [task]);
  const totals = useMemo(() => (task ? taskTotals(task) : null), [task]);
  const gap = useMemo(() => (task ? fulfillmentGap(task) : []), [task]);
  const stage = useMemo(() => nextStage(scan), [scan]);
  /*
   * ★★★ أساسُ الترتيب **كائنٌ مخزَّن** (`{id, label, covered, total}`) — وكائنٌ
   * يُعرض ولدًا في JSX يرميه React ولا `ErrorBoundary` هنا يمسكه، فتُبيَّض
   * الشاشةُ في يد المحضّر عند أوّل رندر. فالتسميةُ تُطلب من الخدمة والبيانةُ
   * تبقى كما هي — والحكمُ ماذا يُعرض ليس شرطًا يُكتب في الواجهة.
   */
  const basis = pathBasisLabel(task?.pathBasis);

  /*
   * ‹JR-301ب› لوحةُ خانة الكمّيّة — **الحكمُ أيَّ المسارَين من الخدمة**:
   * `panel.mode` يقوله `stepQtyPanel` سائلًا `needsPackEntry`، فلا يُقلَّد هنا
   * بشرطٍ يشبهه فيفترق عن حكم المحرّك. والشاشةُ تعرض ما أعطاها.
   */
  const panel = useMemo(() => stepQtyPanel(step), [step]);
  // وحدةُ الإدخال تعود إلى وحدة الخطوة عند كلّ خطوة — لا تلتصق وحدةُ سابقتها.
  useEffect(() => {
    setEntryUom(panel.uom);
    setPack({ label: '', containers: '', per: '' });
  }, [panel.uom, step?.seq]);

  // معاينةٌ حيّة «= ٢٤ قطعة» — تُقرأ قبل الضغط فيُكشف الخطأ وهو قابلٌ للتصحيح.
  const preview = baseQtyPreview(panel.card, qty, entryUom);
  const requiredPreview = step ? baseQtyPreview(panel.card, stepRemaining(step), panel.uom) : '';
  // المسار (ب): صنفٌ لا وحدةَ له أصلًا — يُعلن الوعاءَ ومحتواه فيُضربان.
  const packVerdict = useMemo(
    () => packEntryVerdict({
      item: panel.card, containerLabel: pack.label, containers: pack.containers, perContainer: pack.per,
    }),
    [panel.card, pack]
  );

  const say = useCallback((kind, text) => {
    setFlash({ kind, text });
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
    }
  }, []);

  // العدسة تبقى مفتوحةً عبر المراحل الثلاث — المحضّر يمسح الرفّ ثمّ الطبلية
  // ثمّ الصنف بلا أن يعيد فتحها ثلاثًا وهو يحمل بضاعة.
  /*
   * ‹LPN-309› والقراءةُ تتبع الطور: في التجهيز الممسوحُ كودُ منطقةٍ لا
   * بندُ سحب — ولو ذهب إلى `applyScan` لَرُدَّ غريبًا بلا سببٍ يُفهم.
   */
  const onScanned = (c) => {
    if (mode === 'staging') { setStageBin(normalizeScanned(c)); return; }
    if (mode === 'loading') { doLoadScan(null, normalizeScanned(c)); return; }
    if (mode === 'inbound') { doInboundScan(null, normalizeScanned(c)); return; }
    applyScan(c);
  };

  const camera = useBarcodeCamera({ onCode: onScanned });
  useWedgeScanner(onScanned, {
    enabled: (Boolean(task) && stage !== 'QTY') || (mode === 'staging' && Boolean(stageUnit)) || (mode === 'loading' && Boolean(loadSession)) || (mode === 'inbound' && Boolean(inSession)),
  });

  function acceptScan(e) {
    e?.preventDefault?.();
    applyScan(input);
  }

  /**
   * مسارٌ واحدٌ للقراءة مهما كان بابُها: الكاميرا · جهاز الباركود · الكتابة.
   *
   * ★ **تصحيح 2026-08-27:** لم تكن في هذه الشاشة كاميرا إطلاقًا، والمسحُ
   * الثلاثيّ (رفّ ⇐ طبلية ⇐ صنف) يُنفَّذ على قدمين — فاشتراطُ كتابةٍ يدويّةٍ
   * أو تركيزٍ في حقلٍ يُبطل معنى «اذهب وامسح».
   */
  function applyScan(rawInput) {
    const raw = normalizeScanned(rawInput);
    if (!raw || stage === 'QTY') return;
    // الشاشة تجمع المراحل الثلاث ثمّ تُسلّمها للحكم دفعةً — فالحكم واحدٌ
    // في موضعٍ واحد، ولا تُوزَّع الشروط على ثلاث نقرات.
    const next = { ...scan };
    if (stage === 'BIN') next.bin = raw;
    else if (stage === 'PALLET') next.lpn = raw;
    else if (stage === 'ITEM') next.sku = raw;
    setScan(next);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 20);
  }

  async function submitPick() {
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }
    /*
     * ★★★ ما يُدخَل يُحوَّل **إلى وحدة الخطوة** قبل أن يُرسَل: `required` مكتوبٌ
     * بها و`qtyVerdict` يقارن بها. ومن كتب «٢» واختار الكرتون تُرسَل عنه
     * أربعٌ وعشرون — وهو الفارقُ الذي كان يظهر في الجرد بعد شهر.
     *
     * ★ والخانةُ الفارغة تبقى تعني «الباقي» بوحدة الخطوة نفسِها — سلوكُ
     * اليوم حرفًا، فلا تُحوَّل ولا تُحكَّم.
     */
    const typed = Number(qty);
    const entry = Number.isFinite(typed) && typed > 0
      ? pickEntryVerdict(step, { qty: typed, uom: entryUom })
      : { ok: true, problem: '', entry: { qty: stepRemaining(step) } };
    if (!entry.ok) { say('err', entry.problem); return; }
    setBusy(true);
    try {
      const r = await executePick(taskId, { ...scan, batch: step?.batch, qty: entry.entry.qty }, { actor: actorName });
      if (r.ok) {
        say('ok', r.message);
        setScan({}); setQty('');
      } else {
        say('err', r.message);
        // الحكم يقول **أين** وقف — فتُعاد تلك المرحلة وحدها لا الثلاث.
        if (r.stage === 'BIN') setScan({});
        else if (r.stage === 'PALLET') setScan({ bin: scan.bin });
        else if (r.stage === 'ITEM') setScan({ bin: scan.bin, lpn: scan.lpn });
      }
    } catch (e) {
      say('err', e?.message || 'تعذّر تنفيذ السحبة.');
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  async function skipCurrent() {
    const reason = typeof window !== 'undefined' ? window.prompt('سبب التخطّي (إلزاميّ — الأمر سيخرج ناقصًا):') : '';
    if (!reason) return;
    setBusy(true);
    try {
      await skip(taskId, step.seq, { reason, actor: actorName });
      say('ok', `تُخطّيت الخطوة ${step.seq} — والسبب في السجلّ.`);
      setScan({});
    } catch (e) {
      say('err', e?.message || 'تعذّر التخطّي.');
    } finally { setBusy(false); }
  }

  /* ── ‹LPN-309› طورُ التجهيز ─────────────────────────────────── */
  const refreshStageQueue = useCallback(async () => {
    try {
      const { units, capped } = await listStagingQueue({ max: 100 });
      setStageQueue(units);
      setStageCapped(capped);
    } catch {
      setStageQueue([]);
      setStageCapped(false);
      setFlash({ kind: 'err', text: 'تعذّرت قراءة قائمة التجهيز — تحقّق من الاتّصال.' });
    }
  }, []);

  useEffect(() => { if (mode === 'staging') refreshStageQueue(); }, [mode, refreshStageQueue]);

  // حكمُ المنطقة **معاينةٌ حيّةٌ بلا كتابة** — فيُرى الرفض قبل الضغط.
  const stageVerdict = useMemo(() => {
    if (!stageUnit || !stageBin.trim()) return null;
    return previewStaging(stageUnit, stageBin, {
      route: stageUnit.route ?? '', branch: stageUnit.branch ?? '',
    });
  }, [stageUnit, stageBin]);

  async function doStage(e) {
    e?.preventDefault?.();
    if (!stageUnit || !stageBin.trim()) return;
    setBusy(true);
    try {
      const r = await assignToStaging(stageUnit.code, stageBin, {
        route: stageUnit.route ?? '', branch: stageUnit.branch ?? '', actor: actorName,
      });
      if (r.problem) { say('err', r.problem); return; }
      say('ok', `${stageUnit.code} → منطقة ${r.bin}`);
      setStageUnit(null);
      setStageBin('');
      await refreshStageQueue();
    } catch (err) {
      say('err', err?.message || 'تعذّر ربطُ المنطقة.');
    } finally { setBusy(false); }
  }

  async function finish() {
    setBusy(true);
    try {
      const r = await closeTaskWithPallet(taskId, { actor: actorName });
      say('ok', r.lpn ? `أُقفلت المهمّة — وطبلية الصرف ${r.lpn}.` : 'أُقفلت المهمّة بلا سحبات.');
      setTaskId(''); setTask(null);
      await loadTasks();
    } catch (e) {
      say('err', e?.message || 'تعذّر الإقفال.');
    } finally { setBusy(false); }
  }

  if (loading) return <div className="o_theme"><p className="text-ink-2 text-sm">جارٍ قراءة المهامّ…</p></div>;

  // ── ‹LPN-408› طورُ استلام الوجهة — الفرقُ يبقى مفتوحًا حتى يُحسم ──
  if (mode === 'inbound') {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <StageSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={loadGate} />
        {flash && <Flash flash={flash} />}

        {!inRoute ? (
          <>
            <h2 className="text-lg font-bold text-ink mb-1">{tr('arriving_shipments')}</h2>
            <p className="text-ink-2 text-xs mb-3">{tr('arriving_hint')}</p>
            {inRoutes.length === 0 ? (
              <p className="text-ink-2 text-sm">{tr('no_arriving')}</p>
            ) : (
              <ul className="space-y-2">
                {inRoutes.map((r) => (
                  <li key={r.route}>
                    <button
                      type="button"
                      disabled={busy || !loadGate.allowed}
                      onClick={() => setInRoute(r.route)}
                      className="w-full text-right rounded-lg border px-4 py-4"
                      style={{ borderColor: 'var(--o-border)' }}
                    >
                      <div className="font-bold text-ink">{r.route}</div>
                      <div className="text-ink-2 text-xs mt-1">
                        {r.onTruck} {tr('on_truck')} · {r.received} {tr('received_count')}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="rounded-lg border px-4 py-3 mb-3" style={{ borderColor: 'var(--o-border)' }}>
              <div className="font-bold text-ink">{inRoute}</div>
              {inCounters && (
                <div className="text-ink-2 text-sm mt-1 tabular-nums">
                  {inCounters.received}/{inCounters.expected} {tr('received_of_expected')}
                  {inCounters.missing > 0 && ` · ${inCounters.missing} ${tr('not_arrived')}`}
                </div>
              )}
            </div>

            {/* ★ حالُ الختم يُختار قبل المسح — والمفتوحةُ تُوسم لتُعدّ فعليًّا. */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[['intact', tr('seal_intact')], ['broken', tr('seal_broken')], ['opened', tr('arrived_opened')]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSealState(id)}
                  aria-pressed={sealState === id}
                  className={sealState === id ? 'btn btn-primary text-sm' : 'btn btn-secondary text-sm'}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={doInboundScan} className="mb-3">
              <div className="flex gap-2 mb-2">
                <input
                  value={inCode}
                  onChange={(e) => setInCode(e.target.value)}
                  placeholder={tr('scan_arriving_pallet')}
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="go"
                  disabled={!loadGate.allowed}
                />
                <ScanCameraButton camera={camera} compact />
              </div>
              <ScanCameraPanel camera={camera} hint={tr('scan_arriving_pallet')} />
            </form>

            {/* ★★★ الفروقُ تُقاس آليًّا لا تُكتب بيد — فمحضرٌ يُقاس يوجد
                دائمًا حين يوجد فرق، ومحضرٌ يُكتب يوجد حين يتذكّر أحد. */}
            {inDiscrepancies.length > 0 && (
              <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>
                <strong>{inDiscrepancies.length} {tr('open_discrepancies')}</strong>
                <ul className="mt-1 space-y-1">
                  {inDiscrepancies.slice(0, 10).map((d, i) => (
                    <li key={`${d.type}-${d.lpn}-${i}`} className="tabular-nums">
                      {DISCREPANCY_TYPES[d.type] ?? d.type} — {d.lpn}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {inCloseProblem && (
              <div className="o_alert danger mb-2" style={{ fontSize: 'var(--o-font-size-sm)' }}>{inCloseProblem}</div>
            )}

            <p className="text-ink-2 text-xs mb-2 leading-relaxed">{tr('discrepancy_rule')}</p>

            <button
              type="button"
              className="btn btn-secondary w-full py-2"
              disabled={busy}
              onClick={() => { setInRoute(''); setInCode(''); }}
            >
              {tr('back_to_list')}
            </button>
          </>
        )}
      </div>
    );
  }
  // ── ‹LPN-310› طورُ التحميل — الجلسةُ تُشتقّ فلا تضيع ──
  if (mode === 'loading') {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <StageSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={loadGate} />
        {flash && <Flash flash={flash} />}

        {!route ? (
          <>
            <h2 className="text-lg font-bold text-ink mb-1">{tr('pick_route')}</h2>
            <p className="text-ink-2 text-xs mb-3">{tr('route_hint')}</p>
            {routes.length === 0 ? (
              <p className="text-ink-2 text-sm">{tr('no_routes')}</p>
            ) : (
              <ul className="space-y-2">
                {routes.map((r) => (
                  <li key={r.route}>
                    <button
                      type="button"
                      disabled={busy || !loadGate.allowed}
                      onClick={() => setRoute(r.route)}
                      className="w-full text-right rounded-lg border px-4 py-4"
                      style={{ borderColor: 'var(--o-border)' }}
                    >
                      <div className="font-bold text-ink">{r.route}</div>
                      <div className="text-ink-2 text-xs mt-1">
                        {r.staged} {tr('waiting_to_load')} · {r.loaded} {tr('already_loaded')}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="rounded-lg border px-4 py-3 mb-3" style={{ borderColor: 'var(--o-border)' }}>
              <div className="font-bold text-ink">{route}</div>
              {loadCounters && (
                <div className="text-ink-2 text-sm mt-1 tabular-nums">
                  {loadCounters.loaded}/{loadCounters.expected} {tr('loaded_of_expected')}
                  {loadCounters.missing > 0 && ` · ${loadCounters.missing} ${tr('still_missing')}`}
                  {loadCounters.extras > 0 && ` · ${loadCounters.extras} ${tr('extra_loaded')}`}
                </div>
              )}
            </div>

            <form onSubmit={doLoadScan} className="mb-3">
              <div className="flex gap-2 mb-2">
                <input
                  value={loadCode}
                  onChange={(e) => setLoadCode(e.target.value)}
                  placeholder={tr('scan_pallet_to_load')}
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="go"
                  disabled={!loadGate.allowed}
                />
                <ScanCameraButton camera={camera} compact />
              </div>
              <ScanCameraPanel camera={camera} hint={tr('scan_pallet_to_load')} />
            </form>

            {/* ★ المتبقّي يُسمّى لا يُعدّ فقط — العاملُ يبحث عن هويّةٍ لا عن رقم. */}
            {loadCounters && loadCounters.missing > 0 && (
              <details className="mb-3">
                <summary className="text-sm text-ink-2 cursor-pointer">
                  {loadCounters.missing} {tr('still_missing')}
                </summary>
                <ul className="mt-2 space-y-1">
                  {loadCounters.missingList.map((c) => (
                    <li key={c} className="text-sm text-ink-2 tabular-nums">{c}</li>
                  ))}
                </ul>
              </details>
            )}

            <label className="block mb-2">
              <span className="text-xs text-ink-2">{tr('seal_number')}</span>
              <input
                value={seal}
                onChange={(e) => setSeal(e.target.value)}
                className="w-full rounded-lg border px-4 py-3 mt-1"
                style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
                autoComplete="off"
              />
            </label>

            {/* ★★ الإغلاقُ الناقصُ لا يُمنع مطلقًا — الشاحنةُ قد تكون واقفةً
                والسائقُ ينتظر، وبابٌ مغلقٌ تمامًا يعني خروجًا بلا تسجيل.
                لكنّه يحتاج سببًا مكتوبًا يبقى في السجلّ. */}
            {closeProblem && (
              <div className="o_alert danger mb-2" style={{ fontSize: 'var(--o-font-size-sm)' }}>{closeProblem}</div>
            )}
            {loadCounters && !loadCounters.complete && (
              <input
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder={tr('close_reason')}
                className="w-full rounded-lg border px-4 py-3 text-sm mb-2"
                style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
              />
            )}

            <button
              type="button"
              className="btn btn-primary w-full py-3"
              disabled={busy || !loadGate.allowed || Boolean(closeProblem)}
              onClick={doCloseLoad}
            >
              {tr('close_and_depart')}
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full py-2 mt-2"
              disabled={busy}
              onClick={() => { setRoute(''); setLoadCode(''); setSeal(''); setCloseNote(''); }}
            >
              {tr('back_to_list')}
            </button>
          </>
        )}
      </div>
    );
  }
  // ── ‹LPN-309› طورُ التجهيز — ما بعد إقفال المهمّة لا شاشةٌ أخرى (ح-٤) ──
  if (mode === 'staging') {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <StageSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={stageGate} />
        {flash && <Flash flash={flash} />}

        {!stageUnit ? (
          <>
            <h2 className="text-lg font-bold text-ink mb-1">{tr('awaiting_staging')} ({stageQueue.length})</h2>
            <p className="text-ink-2 text-xs mb-3">
              {tr('awaiting_staging_hint')}
              {stageCapped && ` ⚠ ${tr('cap_reached')}`}
            </p>
            {stageQueue.length === 0 ? (
              <p className="text-ink-2 text-sm">{tr('no_pallet_staging')}</p>
            ) : (
              <ul className="space-y-2">
                {stageQueue.map((u) => (
                  <li key={u.code}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setStageUnit(u); setStageBin(''); }}
                      className="w-full text-right rounded-lg border px-4 py-4"
                      style={{ borderColor: 'var(--o-border)' }}
                    >
                      <div className="font-bold text-ink tabular-nums">{u.code}</div>
                      <div className="text-ink-2 text-xs mt-1">
                        {u.warehouse || '—'} · {(u.lines ?? []).length} بندًا
                        {(u.route || u.branch) && ` · وجهتها ${u.route || u.branch}`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="rounded-lg border px-4 py-3 mb-3" style={{ borderColor: 'var(--o-border)' }}>
              <div className="font-bold text-ink tabular-nums">{stageUnit.code}</div>
              <div className="text-ink-2 text-xs mt-1">
                {(stageUnit.lines ?? []).length} بندًا
                {(stageUnit.route || stageUnit.branch)
                  ? ` · وجهتها ${stageUnit.route || stageUnit.branch}`
                  : ' · بلا وجهةٍ معلنة'}
              </div>
            </div>

            <form onSubmit={doStage}>
              <div className="flex gap-2 mb-2">
                <input
                  value={stageBin}
                  onChange={(e) => setStageBin(e.target.value)}
                  placeholder={tr('scan_staging_area')}
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="go"
                />
                <ScanCameraButton camera={camera} compact />
              </div>
              <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى ملصق منطقة التجهيز." />

              {stageVerdict && !stageVerdict.ok && (
                <div className="rounded-lg border px-4 py-3 text-sm mb-2" style={{ borderColor: 'var(--o-danger, #b42318)' }}>
                  {stageVerdict.message}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full py-3"
                disabled={!stageGate.allowed || busy || !stageBin.trim() || (stageVerdict && !stageVerdict.ok)}
              >
                {tr('assign_to_area')}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full py-2 mt-2"
                disabled={busy}
                onClick={() => { setStageUnit(null); setStageBin(''); }}
              >
                {tr('back_to_list')}
              </button>
            </form>
          </>
        )}
      </div>
    );
  }

  if (!taskId) {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <StageSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={pickGate} />
        {flash && <Flash flash={flash} />}
        <h2 className="text-lg font-bold text-ink mb-3">{tr('open_pick_tasks')} ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <p className="text-ink-2 text-sm">لا مهمّة مفتوحة. تُنشأ المهامّ من مستند سحبٍ أو أمر بيعٍ معتمد.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const tt = taskTotals(t);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => { setTaskId(t.id); setScan({}); setFlash(null); }}
                    className="w-full text-right rounded-lg border px-4 py-4" style={{ borderColor: 'var(--o-border)' }}>
                    <div className="font-bold text-ink">{t.source?.number || 'بلا مستند'}</div>
                    <div className="text-ink-2 text-xs mt-1">
                      {t.warehouse} · {tt.stepCount} خطوة · {tt.percent}٪
                      {t.assignee && <span> · {t.assignee}</span>}
                    </div>
                    {(t.shortages ?? []).length > 0 && (
                      <div className="text-ink-2 text-xs mt-1">⚠ {t.shortages.length} صنفًا ناقصًا معلَنًا</div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="o_theme" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          {/* ★ رقمُ الأمر يُفتح لا يُقرأ — المحضّرُ يقف في الممرّ ويسأل «ما في
              هذا الأمر؟»، والمعرّفُ في يده منذ `openPickTask` فلا حجّةَ لنصٍّ
              أصمّ. وهنا موضعُه: **قبل أن يمشي** لا بعد أن يقفل. */}
          <div className="font-bold text-ink"><DocLink source={task?.source} /></div>
          {/* ★ والفاصلةُ تتبع ما بعدها: مهمّةٌ بلا أساسٍ معلَنٍ كانت تخرج
              بمستودعٍ يتدلّى منه «·» لا شيء بعده. */}
          <div className="text-ink-2 text-xs">{task?.warehouse}{basis ? ` · ${basis}` : ''}</div>
        </div>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => { setTaskId(''); setTask(null); }}>رجوع</button>
      </div>

      {totals && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="الخطوات" value={`${totals.doneSteps}/${totals.stepCount}`} />
          <Stat label="المسحوب" value={totals.picked} />
          <Stat label="المتبقّي" value={totals.remaining} />
        </div>
      )}

      {flash && <Flash flash={flash} />}

      {!step ? (
        <div className="rounded-lg border p-5 text-center" style={{ borderColor: 'var(--o-border)' }}>
          <p className="text-ink font-bold mb-2">اكتملت خطوات المهمّة.</p>
          {gap.length > 0 && (
            <p className="text-ink-2 text-sm mb-3">
              ونقصٌ معلَن: {gap.map((g) => `${g.sku} (${g.gap})`).join(' · ')}
            </p>
          )}
          <button type="button" className="btn btn-primary w-full py-3" onClick={finish} disabled={busy}>
            إقفال المهمّة وتكوين طبلية الصرف
          </button>
        </div>
      ) : (
        <>
          {/* ★ خطوةٌ واحدةٌ ظاهرة — المحضّر يُقال له أين يذهب لا يُعطى جدولًا */}
          <div className="rounded-lg border p-4 mb-4" style={{ borderColor: 'var(--o-primary)' }}>
            <div className="text-xs text-ink-2 mb-1">الخطوة {step.seq} من {totals?.stepCount}</div>
            <div className="text-2xl font-bold text-ink mb-1">{step.bin}</div>
            <div className="text-ink">{step.sku} {step.batch && <span className="text-ink-2">· دفعة {step.batch}</span>}</div>
            {/* ★ المطلوبُ يُقال بوحدته: «٥ كرتون» لا «٥» — والرقمُ العاري كان
                يُقرأ قطعًا فيُسحب خُمسُ الأمر ولا يشتكي أحدٌ قبل الجرد. */}
            <div className="text-ink-2 text-sm mt-1">
              المطلوب {stepRemaining(step)}{panel.label ? ` ${panel.label}` : ''}
              {requiredPreview && <span className="tabular-nums"> {requiredPreview}</span>}
            </div>
          </div>

          <ol className="flex gap-2 mb-3 text-xs">
            {['BIN', 'PALLET', 'ITEM'].map((s) => (
              <li key={s} className="flex-1 rounded px-2 py-1 text-center"
                style={{
                  background: scan[s === 'BIN' ? 'bin' : s === 'PALLET' ? 'lpn' : 'sku'] ? 'var(--o-surface-2)' : 'transparent',
                  border: `1px solid ${stage === s ? 'var(--o-primary)' : 'var(--o-border)'}`,
                }}>
                {SCAN_STAGES[s]}
              </li>
            ))}
          </ol>

          {stage !== 'QTY' ? (
            <form onSubmit={acceptScan}>
              <div className="flex gap-2 mb-2">
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={SCAN_STAGES[stage]} autoFocus autoComplete="off" enterKeyHint="go"
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }} />
                <ScanCameraButton camera={camera} compact />
              </div>
              <ScanCameraPanel camera={camera} hint={`وجّه العدسة — المرحلة الآن: ${SCAN_STAGES[stage]}`} />
              <button type="submit" className="btn btn-primary w-full py-3" disabled={!input.trim()}>{SCAN_STAGES[stage]}</button>
            </form>
          ) : (
            <div>
              {/* ★★★ الخانةُ الكبيرةُ تبقى واحدةً — ومعها وحدتُها فقط. المحضّرُ
                  يمشي وهو يحمل بضاعةً، فلا يُعطى جدولًا يقرأه بيدٍ واحدة. */}
              <div className="flex gap-2 mb-1">
                <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="0" step="any"
                  placeholder={`الكمّيّة (${stepRemaining(step)})`} autoFocus
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)' }} />
                {panel.mode === 'uom' && (panel.choices.length > 1 ? (
                  <select
                    value={entryUom}
                    onChange={(e) => setEntryUom(e.target.value)}
                    aria-label="وحدة الإدخال"
                    className="rounded-lg border px-3 py-4 text-base"
                    style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
                  >
                    {panel.choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <span className="self-center px-3 text-ink-2 text-sm">{panel.label}</span>
                ))}
              </div>

              {/* معاينةٌ حيّة: «= ٢٤ قطعة» تُقرأ قبل الضغط لا بعد شهر. */}
              {preview && <div className="text-ink-2 text-sm mb-2 tabular-nums">{preview}</div>}

              {/* ★★ المسار (ب) — صنفٌ لا وحدةَ له أصلًا (وهو حالُ ألفٍ وأربعين
                  صنفًا). الخانةُ العاريةُ تبقى كما كانت حرفًا، وهذه حاسبةٌ
                  اختياريّةٌ فوقها: يُعلن الوعاءَ ومحتواه فيُملأ الرقمُ صحيحًا. */}
              {panel.mode === 'pack' && (
                <details className="mb-2">
                  <summary className="text-sm text-ink-2 cursor-pointer">عددتَ صناديق؟ احسبها هنا</summary>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <input value={pack.label} onChange={(e) => setPack({ ...pack, label: e.target.value })}
                      placeholder="صندوق / شدّة" className="rounded-lg border px-2 py-3 text-sm"
                      style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }} />
                    <input value={pack.containers} onChange={(e) => setPack({ ...pack, containers: e.target.value })}
                      type="number" min="0" step="any" placeholder="كم وعاءً" className="rounded-lg border px-2 py-3 text-sm"
                      style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }} />
                    <input value={pack.per} onChange={(e) => setPack({ ...pack, per: e.target.value })}
                      type="number" min="0" step="any" placeholder="كم في الواحد" className="rounded-lg border px-2 py-3 text-sm"
                      style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }} />
                  </div>
                  {packVerdict.ok ? (
                    <button type="button" className="btn btn-secondary w-full py-2 mt-2 tabular-nums"
                      onClick={() => setQty(String(packVerdict.entry.baseQty))}>
                      = {packVerdict.entry.baseQty} — استعملها
                    </button>
                  ) : (
                    (pack.label || pack.containers || pack.per) && (
                      <p className="text-ink-2 text-xs mt-2">{packVerdict.problem}</p>
                    )
                  )}
                </details>
              )}

              <button type="button" className="btn btn-primary w-full py-3" onClick={submitPick} disabled={busy}>
                تسجيل السحبة
              </button>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button type="button" className="btn btn-secondary flex-1 text-sm" onClick={() => setScan({})} disabled={busy}>
              إعادة المسح من الرفّ
            </button>
            <button type="button" className="btn btn-secondary flex-1 text-sm" onClick={skipCurrent} disabled={busy}>
              تخطّي الخطوة بسبب
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** ‹LPN-309› بدّالُ الطور — التحضيرُ والتجهيزُ خطوتان متتاليتان لعاملٍ واحد. */
/** ‹LPN-511› شريطُ الصلاحية — يُعلِم ولا يحجب من لا يُعرَف. */
function RoleGate({ gate }) {
  if (!gate || gate.allowed) return null;
  return (
    <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>
      {gate.message}
    </div>
  );
}

function StageSwitch({ mode, setMode, disabled, tr }) {
  return (
    <div className="flex gap-2 mb-4">
      {[['picking', tr('mode_picking')], ['staging', tr('mode_staging')], ['loading', tr('mode_loading')], ['inbound', tr('mode_inbound')]].map(([id, label]) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => setMode(id)}
          aria-pressed={mode === id}
          className={mode === id ? 'btn btn-primary text-sm flex-1' : 'btn btn-secondary text-sm flex-1'}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * رابطُ المستند — من الميدان إلى الورقة التي أمرت به.
 *
 * ★★ **نمطٌ واحدٌ في شاشات الميدان كلّها**: الصنفُ `o_field_link` ونصُّ
 * العنوان `افتح المستند` مكرّران حرفيًّا في `GovernanceBoard.jsx` — فما
 * يتعلّمه الموظّفُ في شاشةٍ يعمل في الأخرى بلا أن يُعلَّم مرّتين.
 *
 * ⚠️ **والمعرّفُ شرطُ الرابط لا الرقم.** مستندٌ يحمل رقمًا بلا `id` (أو بلا
 * `type`) يبقى نصًّا كما كان — لأنّ `/dashboard/document` بلا معرّفٍ يفتح
 * شاشةً فارغة، ورابطٌ يكذب أسوأ من نصٍّ صامت.
 *
 * ★★★ **وهدفُ لمسٍ لا نصٌّ مسطور.** قِيس بالمِشحذ على هاتفٍ ٣٧٥ بكسل فكان
 * **٢٤ × ٣٩ بكسل** — وإبهامُ عاملٍ في ممرٍّ لا يُصيبه. والحدُّ المتعارَف ٤٤،
 * فأُعطي حشوًا وارتفاعًا أدنى: الرابطُ الذي لا يُضغط رابطٌ غيرُ موجود.
 *
 * @param {{type?:string,id?:string,number?:string}|null} source مصدرُ المهمّة
 *   كما يكتبه `pickingTask.js` — وهو نفسُ شكل `session.order` في الاستلام.
 */
function DocLink({ source }) {
  const number = String(source?.number ?? '').trim();
  const id = String(source?.id ?? '').trim();
  const type = String(source?.type ?? '').trim();
  if (!id || !type) return <>{number}</>;
  return (
    <a
      href={`${getBasePath()}/dashboard/document?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`}
      className="o_field_link decoration-bf"
      title="افتح المستند"
      // ★ هدفُ لمسٍ ٤٤ بكسل — قِيس فكان ٢٤ (انظر الترويسة).
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '0 8px' }}
    >
      {number || id}
    </a>
  );
}

function Flash({ flash }) {
  return (
    <div className="mb-3 rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)' }}>
      {flash.text}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--o-border)' }}>
      <div className="text-xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-xs text-ink-2">{label}</div>
    </div>
  );
}
