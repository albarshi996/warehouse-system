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

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { currentStep, stepRemaining, taskTotals, fulfillmentGap } from '../../../services/lpn/pickingTask.js';
import { SCAN_STAGES, nextStage } from '../../../services/lpn/pickingScan.js';
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
  useEffect(() => (taskId ? listenTask(taskId, setTask) : undefined), [taskId]);

  const step = useMemo(() => (task ? currentStep(task) : null), [task]);
  const totals = useMemo(() => (task ? taskTotals(task) : null), [task]);
  const gap = useMemo(() => (task ? fulfillmentGap(task) : []), [task]);
  const stage = useMemo(() => nextStage(scan), [scan]);

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
    applyScan(c);
  };

  const camera = useBarcodeCamera({ onCode: onScanned });
  useWedgeScanner(onScanned, {
    enabled: (Boolean(task) && stage !== 'QTY') || (mode === 'staging' && Boolean(stageUnit)) || (mode === 'loading' && Boolean(loadSession)),
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
    setBusy(true);
    try {
      const r = await executePick(taskId, { ...scan, batch: step?.batch, qty: Number(qty) || stepRemaining(step) }, { actor: actorName });
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
          <div className="font-bold text-ink">{task?.source?.number}</div>
          <div className="text-ink-2 text-xs">{task?.warehouse} · {task?.pathBasis}</div>
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
            <div className="text-ink-2 text-sm mt-1">المطلوب {stepRemaining(step)}</div>
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
              <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="0" step="any"
                placeholder={`الكمّيّة (${stepRemaining(step)})`} autoFocus
                className="w-full rounded-lg border px-4 py-4 text-lg mb-2"
                style={{ borderColor: 'var(--o-border)' }} />
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
      {[['picking', tr('mode_picking')], ['staging', tr('mode_staging')], ['loading', tr('mode_loading')]].map(([id, label]) => (
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
