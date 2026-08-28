/**
 * الاستلام الميدانيّ — من أمر شراءٍ مفتوح إلى طبليةٍ ترفع للحوكمة.
 *
 * ═══ ولماذا شاشةٌ جديدة لا وضعٌ في شاشة المسح؟ ═══
 * قِيس الأمر لا خُمِّن: وضع «استلام» **موجودٌ أصلًا** في `SCAN_MODES`، لكنّه
 * **التقاطٌ عامّ** — يسجّل ما دخل بلا أمرٍ ولا رصيدٍ مفتوح ولا طبلية، وهو
 * صحيحٌ لما وُضع له («الالتقاط لا يُحاسِب» · CAP-101).
 *
 * وهذا الاستلام **مقودٌ بمستند**: يبدأ من أمرٍ معتمد، ويردّ الصنف الغريب،
 * ويعدّ المفتوح تنازليًّا، ويثمر حمولةً تُعتمد. فدسُّه في مكوّنٍ من ١٢١٨
 * سطرًا يعمل جراحةٌ في شاشةٍ تعمل — وتفويض المالك يمنعها. وليست «صفحةً فوق
 * صفحة» لأنّ الوظيفة غير موجودةٍ أصلًا: لا شاشةَ اليوم تستلم من أمر شراء.
 *
 * ═══ القاعدة الحاكمة ═══
 * **الشاشة عرضٌ للحكم لا حَكَم.** كلّ قراءةٍ تمرّ بـ`scanIntoDraft` التي
 * تستدعي `scanVerdict` الخالصة على البيانات الحيّة — فلا شرطَ يُكتب هنا،
 * والصوتُ والاهتزاز يتبعان نتيجة الحكم الفعليّة لا ظنّ الواجهة.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeItems } from '../../../services/items/itemService.js';
import { buildItemIndexes } from '../../../services/items/uomWiring.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { documentLineProgress } from '../../../services/documents/documentLineProgress.js';
import { openOrderCard, remainingOf, sessionCloseProblem, sessionTotals } from '../../../services/lpn/receivingSession.js';
import {
  addDraft,
  closeDraftToGovernance,
  createGrnFromSession,
  finishSession,
  leaveSession,
  listenSession,
  listOpenSessions,
  scanIntoDraft,
  startSession,
} from '../../../services/lpn/receivingService.js';
import { grnPreview } from '../../../services/lpn/grnBridge.js';
import {
  useBarcodeCamera,
  ScanCameraButton,
  ScanCameraPanel,
} from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';
// ‹LPN-214› طورُ التخزين — آخرُ خطوةٍ في الاستلام الميدانيّ لا شاشةٌ رابعة.
import { executePutaway, listPutawayQueue, openTask, previewBin } from '../../../services/lpn/putawayService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
// ‹LPN-511› الصلاحية تُعلَم قبل الضغط لا بعد ارتداد الخادم.
import { uiGate } from '../../../services/lpn/lpnRoles.js';
import { FieldLangSwitch, useFieldLang } from './useFieldLang.jsx';

export default function ReceivingFlow() {
  const { lang, dir, setLang, tr } = useFieldLang();
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState(null);
  const [activeDraft, setActiveDraft] = useState('P1');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // ‹LPN-214› طورُ التخزين: 'receiving' | 'putaway'
  const [mode, setMode] = useState('receiving');
  const [queue, setQueue] = useState([]);
  const [queueCapped, setQueueCapped] = useState(false);
  const [task, setTask] = useState(null);
  const [taskUnit, setTaskUnit] = useState(null);
  const [binCode, setBinCode] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const seqRef = useRef(0);
  const inputRef = useRef(null);

  const indexes = useMemo(() => buildItemIndexes(items), [items]);
  const actorName = me?.name || me?.displayName || me?.email || '';
  // ‹LPN-511› والمجهولُ يمرّ — منعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم.
  const recvGate = uiGate(me?.role, 'RECEIVE');
  const putGate = uiGate(me?.role, 'PUTAWAY');

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(() => subscribeItems(setItems), []);

  /**
   * ★★ **تصحيح 2026-08-27 — جلسةٌ تضيع بإغلاق الهاتف.**
   *
   * `listOpenSessions` مبنيّةٌ في الخدمة وموسومةٌ بتعليقها «لقائمة *تابع
   * جلسةً* على الهاتف» — **وبلا مستدعٍ واحد**. ومعرّفُ الجلسة كان في حالة
   * المكوّن وحدها، فمن نام هاتفُه أو حدّث الصفحة **فقد جلستَه إلى الأبد**:
   * لا يتابعها ولا يغلقها ولا يتركها. وأسوأ من ذلك: نقرةٌ ثانيةٌ على الأمر
   * **تفتح جلسةً ثانية** عليه (`startSession` تُنشئ دائمًا)، فيمسح عاملان
   * على أمرٍ واحدٍ في جلستين لا ترى إحداهما الأخرى — وهو نقيضُ ما بُني له
   * `listenSession` («جهازان على الجلسة نفسها يريان بعضهما»).
   *
   * فالقائمة تُعرض هنا **قبل** أوامر الشراء: من له جلسةٌ يتابعها، ومن لا
   * فيفتح جديدة — والمفتوحُ ظاهرٌ فلا يُفتح فوقه.
   */
  const [openSessions, setOpenSessions] = useState([]);
  const refreshOpenSessions = useCallback(() => {
    listOpenSessions()
      .then(setOpenSessions)
      .catch(() => setOpenSessions([])); // تعذّرُ القراءة لا يمنع فتح جلسةٍ جديدة
  }, []);
  useEffect(() => { if (!sessionId) refreshOpenSessions(); }, [sessionId, refreshOpenSessions]);

  // أوامر الشراء المفتوحة — بطاقتها من `openOrderCard` فما تعرضه القائمة
  // هو ما تقيس عليه الجلسة حرفيًّا.
  const [rawOrders, setRawOrders] = useState([]);
  useEffect(() => listenDocumentsByTypes(['PO'], (docs) => {
    setRawOrders(docs);
    // البطاقة من `openOrderCard` — فما تعرضه القائمة هو ما تقيس عليه
    // الجلسة، والمحجوب يُسقَط بسببه المحسوب لا بظنّ الواجهة.
    setOrders(docs.map((d) => openOrderCard(d, [], [])).filter((c) => c.canReceive));
    setLoading(false);
  }, 50), []);

  useEffect(() => {
    if (!sessionId) return undefined;
    return listenSession(sessionId, setSession);
  }, [sessionId]);

  const totals = useMemo(() => (session ? sessionTotals(session) : null), [session]);
  // معاينةُ المستند قبل توليده — مستندٌ ماليٌّ يُنشأ بلا أن يُرى محتواه
  // توقيعٌ على المجهول (grnBridge).
  const grn = useMemo(() => (session ? grnPreview(session) : null), [session]);
  const draft = useMemo(
    () => (session?.drafts ?? []).find((d) => d.ref === activeDraft) ?? null,
    [session, activeDraft]
  );
  /**
   * ما الذي يمنع إغلاق الجلسة الآن؟ — من `sessionCloseProblem` الخالصة نفسها
   * التي تمنعه في الخدمة. فالزرّ المعروض هو الزرّ الذي سينجح، ولا يُعرض
   * للعامل زرٌّ يُردّ عنه.
   */
  const closeProblem = useMemo(() => (session ? sessionCloseProblem(session) : ''), [session]);

  /**
   * ★ **تصحيح 2026-08-27 — «قارئ الباركود لا يقرأ» في تطبيق الطبالي:**
   * هذه الشاشة لم يكن فيها كاميرا إطلاقًا، وحقلُ القراءة كان `inputMode="none"`
   * — أي أنّ لوحة مفاتيح الهاتف **لا تفتح** عليه. فمن دخل بهاتفٍ بلا جهاز
   * باركودٍ ملحق لم يكن يستطيع لا مسحًا ولا كتابةً: حقلٌ لا يُدخَل فيه شيء.
   *
   * الآن ثلاث طرقٍ تعمل: الكاميرا (المحرّك الموحّد) · جهازُ الباركود مسموعًا
   * في الشاشة كلّها · الكتابةُ بلوحة المفاتيح. والعدسة **تبقى مفتوحة** بعد
   * القراءة لأنّ العمل هنا كرتونةٌ تلو كرتونة.
   */
  /*
   * ‹LPN-214› والقراءةُ **تتبع الطور**: في التخزين الممسوحُ كودُ رفٍّ لا
   * كودُ صنف. فلو ذهبت كلُّ قراءةٍ إلى `runScan` لَبحث النظامُ عن صنفٍ اسمُه
   * «MAIN-A01-R01-B01» وردَّه غريبًا — والعاملُ يرى رفضًا بلا سبب.
   */
  const onScanned = (c) => {
    if (mode === 'putaway') { setBinCode(normalizeScanned(c)); return; }
    runScan(c);
  };

  const camera = useBarcodeCamera({ onCode: onScanned });
  // ★ والجهازُ يُسمع في طور التخزين أيضًا: العاملُ عند الرفّ يمسح ولا يكتب.
  useWedgeScanner(onScanned, {
    enabled: draft?.state === 'SCANNING' || (mode === 'putaway' && Boolean(taskUnit)),
  });

  const say = useCallback((kind, text) => {
    setFlash({ kind, text });
    // الصوت والاهتزاز من **نتيجة الحكم** لا من ظنّ الواجهة (خطة ٧ ثانيًا).
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
    }
  }, []);

  /* ── ‹LPN-214› طورُ التخزين ─────────────────────────────────────
   * المواقعُ والأرصدةُ تُقرأ **في هذا الطور وحده**: شاشةُ الاستلام تُفتح
   * للمسح في أغلب الأحيان، واستماعان دائمان ثمنٌ بلا مقابل على الهاتف. */
  useEffect(() => {
    if (mode !== 'putaway') return undefined;
    const off = [
      listenLocations(setLocations, () => setLocations([])),
      listenBalances(setBalances, () => setBalances([])),
    ];
    return () => off.forEach((f) => typeof f === 'function' && f());
  }, [mode]);

  const refreshQueue = useCallback(async () => {
    try {
      const { units, capped } = await listPutawayQueue({ max: 100 });
      setQueue(units);
      setQueueCapped(capped);
    } catch {
      setQueue([]);
      setQueueCapped(false);
      say('err', 'تعذّرت قراءة قائمة التخزين — تحقّق من الاتّصال.');
    }
  }, [say]);

  useEffect(() => { if (mode === 'putaway') refreshQueue(); }, [mode, refreshQueue]);

  // البندُ الممثّل للطبلية — الاقتراحُ يُحسب على صنفٍ واحد، والمختلطة على
  // أوّلها كما تنصّ `openPutawayTask`.
  const taskItem = useMemo(() => {
    const sku = taskUnit?.lines?.[0]?.sku;
    return sku ? (indexes?.bySku?.get?.(String(sku).toUpperCase()) ?? null) : null;
  }, [taskUnit, indexes]);

  // حكمُ الرفّ الممسوح — **معاينةٌ حيّة بلا كتابة**، فيرى العامل الرفض
  // قبل أن يضغط لا بعده.
  const binVerdict = useMemo(() => {
    if (!taskUnit || !binCode.trim()) return null;
    return previewBin(taskUnit, binCode, { locations, balances, item: taskItem });
  }, [taskUnit, binCode, locations, balances, taskItem]);

  async function pickTask(unit) {
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }
    setBusy(true);
    try {
      const r = await openTask(unit.code, { locations, balances, item: null, actor: actorName });
      if (r.problem) { say('err', r.problem); return; }
      setTask(r.task);
      setTaskUnit(r.unit);
      setBinCode('');
      setOverrideNote('');
      say('ok', r.task.suggestedBin
        ? `المقترح: ${r.task.suggestedBin} — امسح الرفّ الذي وضعتها فيه فعلًا.`
        : 'لا مقترحَ لهذه الطبلية — امسح الرفّ الذي وضعتها فيه.');
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح المهمّة.');
    } finally { setBusy(false); }
  }

  async function finishPutaway(e) {
    e?.preventDefault?.();
    if (!taskUnit || !binCode.trim()) return;
    setBusy(true);
    try {
      const r = await executePutaway(taskUnit.code, binCode, {
        actor: actorName, overrideNote, locations, balances, item: taskItem,
      });
      if (r.problem) { say('err', r.problem); return; }
      say('ok', `${taskUnit.code} → ${r.move.toBin}${r.move.offSuggestion ? ' (خالفت المقترح — سُجّل السبب)' : ''}`);
      setTask(null);
      setTaskUnit(null);
      setBinCode('');
      setOverrideNote('');
      await refreshQueue();
    } catch (err) {
      say('err', err?.message || 'تعذّر إتمام التخزين.');
    } finally { setBusy(false); }
  }

  async function begin(orderCard) {
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }
    setBusy(true);
    try {
      const full = rawOrders.find((d) => d.id === orderCard.id);
      if (!full) throw new Error('تعذّر العثور على الأمر — أعد تحميل الصفحة.');
      const progress = documentLineProgress(full, [], []);
      const { id } = await startSession(full, progress, { actor: actorName, warehouse: orderCard.warehouse, device: 'WEB' });
      setSessionId(id);
      setActiveDraft('P1');
      say('ok', `فُتحت جلسة على ${orderCard.number} — امسح أوّل صنف.`);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح الجلسة.');
    } finally {
      setBusy(false);
    }
  }

  function submitScan(e) {
    e?.preventDefault?.();
    return runScan(code);
  }

  /**
   * مسارُ قراءةٍ واحدٌ لطرق الإدخال الثلاث: الكاميرا · جهاز الباركود ·
   * الكتابة. فالحكم واحدٌ مهما كان الباب — ولا فرعَ يختلف بصمتٍ عن أخيه.
   */
  async function runScan(rawInput) {
    const raw = normalizeScanned(rawInput);
    if (!raw || busy) return;
    setBusy(true);
    try {
      seqRef.current += 1;
      const r = await scanIntoDraft(
        sessionId,
        activeDraft,
        { barcode: raw, qty: qty === '' ? undefined : Number(qty), batch, expiry },
        { indexes, actor: actorName, device: 'WEB', seq: seqRef.current }
      );
      if (r.ok) {
        say('ok', `قُبلت: ${raw}`);
        setCode(''); setQty(''); // الدفعة والصلاحية تبقيان — الكرتونة تلو الكرتونة من دفعةٍ واحدة
      } else {
        say(r.needsSupervisor ? 'warn' : 'err', r.message);
      }
    } catch (err) {
      say('err', err?.message || 'تعذّرت القراءة.');
    } finally {
      setBusy(false);
      // حقل القراءة يبقى نشطًا بلا لمسٍ بعد كلّ مسحة (متطلّب خطة ٧).
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  async function closeDraft() {
    setBusy(true);
    try {
      await closeDraftToGovernance(sessionId, activeDraft, { actor: actorName });
      say('ok', `رُفعت الطبلية ${activeDraft} للحوكمة — لا قراءة عليها بعد الآن.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر الإغلاق.');
    } finally { setBusy(false); }
  }

  async function newDraft() {
    setBusy(true);
    try {
      const ref = await addDraft(sessionId);
      setActiveDraft(ref);
      say('ok', `فُتحت طبلية ${ref}.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح طبلية.');
    } finally { setBusy(false); }
  }

  async function makeGrn() {
    setBusy(true);
    try {
      const r = await createGrnFromSession(sessionId, { profile: me });
      say('ok', `تولّد الاستلام ${r.number || r.docId} مسوّدةً — اعتمده من صندوق المستندات ليتحرّك الرصيد.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر توليد الاستلام.');
    } finally { setBusy(false); }
  }

  /**
   * تركُ جلسةٍ لم تُنتج شيئًا — بسببٍ إلزاميٍّ يبقى في السجلّ.
   *
   * ★ والسبب **مطلوبٌ لا مقترَح**: جلسةٌ فُتحت ثمّ تُركت سؤالٌ تشغيليّ (وصلت
   * الشاحنة فارغة؟ · الأمر خطأ؟ · تعطّل الجهاز؟)، وإسقاطُه يجعل الجلسات
   * المتروكة رقمًا بلا معنى في أيّ قياسٍ لاحق.
   */
  async function leaveWithReason() {
    const reason = typeof window !== 'undefined'
      ? window.prompt(`${closeProblem}

لماذا لم تُنتج هذه الجلسة شيئًا؟ (سببٌ إلزاميّ)`)
      : '';
    if (reason === null) return;
    setBusy(true);
    try {
      await leaveSession(sessionId, { reason, actor: actorName });
      say('ok', 'تُركت الجلسة والسببُ في السجلّ — والمفتوح يبقى على الأمر لجلسةٍ لاحقة.');
      setSessionId(''); setSession(null);
    } catch (e) {
      say('err', e?.message || 'تعذّر ترك الجلسة.');
    } finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true);
    try {
      await finishSession(sessionId, { actor: actorName });
      say('ok', 'أُغلقت الجلسة — والمتبقّي المفتوح يبقى على الأمر لجلسةٍ لاحقة.');
      setSessionId(''); setSession(null);
    } catch (e) {
      say('err', e?.message || 'تعذّر الإغلاق.');
    } finally { setBusy(false); }
  }

  if (loading) return <div className="o_theme"><p className="text-ink-2 text-sm">جارٍ قراءة أوامر الشراء…</p></div>;

  // ── ‹LPN-214› طورُ التخزين ──
  // آخرُ خطوةٍ في الاستلام لا شاشةٌ رابعة (ح-٤): العاملُ نفسه، والجهازُ
  // نفسه، والحمولةُ التي مسحها قبل قليل.
  if (mode === 'putaway') {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <ModeSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={putGate} />
        {flash && <Flash flash={flash} />}

        {!taskUnit ? (
          <>
            <h2 className="text-lg font-bold text-ink mb-1">{tr('awaiting_putaway')} ({queue.length})</h2>
            <p className="text-ink-2 text-xs mb-3">
              {tr('awaiting_putaway_hint')}
              {queueCapped && ` ⚠ ${tr('cap_reached')}`}
            </p>
            {queue.length === 0 ? (
              <p className="text-ink-2 text-sm">{tr('no_pallet_waiting')}</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((u) => (
                  <li key={u.code}>
                    <button
                      type="button"
                      disabled={busy || !putGate.allowed}
                      onClick={() => pickTask(u)}
                      className="w-full text-right rounded-lg border px-4 py-4"
                      style={{ borderColor: 'var(--o-border)' }}
                    >
                      <div className="font-bold text-ink tabular-nums">{u.code}</div>
                      <div className="text-ink-2 text-xs mt-1">
                        {u.warehouse || '—'} · {(u.lines ?? []).length} بندًا
                        {(u.flags ?? []).length > 0 && ' · ⚑ موسومة'}
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
              <div className="font-bold text-ink tabular-nums">{taskUnit.code}</div>
              <div className="text-ink-2 text-xs mt-1">
                {taskUnit.warehouse || '—'} · {(taskUnit.lines ?? []).length} بندًا
              </div>
              <div className="text-sm mt-2 text-ink">
                المقترح: <strong className="tabular-nums">{task?.suggestedBin || '— لا مقترح'}</strong>
              </div>
              {(task?.suggestions ?? []).length > 1 && (
                <div className="text-ink-2 text-xs mt-1">
                  وبدائلُه: {task.suggestions.slice(1).map((c) => c.code).join(' · ')}
                </div>
              )}
              {task?.suggestProblem && (
                <div className="text-ink-2 text-xs mt-1">{task.suggestProblem}</div>
              )}
              {/* ★ المرفوضُ يُعرض بسببه لا يُخفى — قرارُ `putawaySuggest`
                  المعلن: عاملٌ يرى لماذا رُفض رفٌّ يختار البديل بعلم. */}
              {(task?.rejectedBins ?? []).length > 0 && (
                <details className="mt-2">
                  <summary className="text-ink-2 text-xs cursor-pointer">
                    ورفوفٌ استُبعدت ({task.rejectedBins.length}) — ولماذا
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {task.rejectedBins.slice(0, 6).map((r) => (
                      <li key={r.code ?? r.bin ?? JSON.stringify(r)} className="text-ink-2 text-xs">
                        <span className="tabular-nums">{r.code ?? r.bin}</span> — {r.reason ?? '—'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-ink-2 text-xs mt-2">
                الاقتراحُ اقتراحٌ لا أمر — امسح الرفّ الذي وضعتها فيه <strong>فعلًا</strong>.
              </p>
            </div>

            <form onSubmit={finishPutaway}>
              {/* ‹LPN-214› الطرقُ الثلاث نفسها كما في المسح: كاميرا · جهازُ
                  باركودٍ مسموعٌ في الشاشة · كتابة. ولا `inputMode="none"` —
                  هي التي كانت تمنع لوحة المفاتيح فيصير الحقل مسدودًا. */}
              <div className="flex gap-2 mb-2">
                <input
                  value={binCode}
                  onChange={(e) => setBinCode(e.target.value)}
                  placeholder={tr('scan_bin')}
                  className="flex-1 rounded-lg border px-4 py-4 text-lg"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="go"
                />
                <ScanCameraButton camera={camera} compact />
              </div>
              <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى ملصق الرفّ." />

              {binVerdict && !binVerdict.ok && (
                <div
                  className="rounded-lg border px-4 py-3 text-sm mb-2"
                  style={{ borderColor: 'var(--o-danger, #b42318)' }}
                >
                  {binVerdict.message}
                </div>
              )}
              {binVerdict?.ok && binVerdict.message && (
                <div className="rounded-lg border px-4 py-3 text-sm mb-2" style={{ borderColor: 'var(--o-border)' }}>
                  {binVerdict.message}
                </div>
              )}

              {/* ★ «يمرّ بسبب» لا «ممنوع» — درس LOC: العامل يرى ما لا يراه
                  النظام، والسببُ يُقيَّد باسمه لا يُتجاوَز صامتًا. */}
              {binVerdict && !binVerdict.ok && binVerdict.canOverride && (
                <input
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="سببُ التخزين هنا رغم التحذير — يُقيَّد باسمك"
                  className="w-full rounded-lg border px-4 py-3 text-sm mb-2"
                  style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
                />
              )}

              <button
                type="submit"
                className="btn btn-primary w-full py-3"
                disabled={!putGate.allowed || busy || !binCode.trim() || (binVerdict && !binVerdict.ok && !binVerdict.canOverride)}
              >
                {tr('confirm_putaway')}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full py-2 mt-2"
                disabled={busy}
                onClick={() => { setTask(null); setTaskUnit(null); setBinCode(''); setOverrideNote(''); }}
              >
                {tr('back_to_list')}
              </button>
            </form>
          </>
        )}
      </div>
    );
  }

  // ── اختيار الأمر ──
  if (!sessionId) {
    return (
      <div className="o_theme" dir={dir}>
        <FieldLangSwitch lang={lang} setLang={setLang} />
        <ModeSwitch mode={mode} setMode={setMode} disabled={busy} tr={tr} />
        <RoleGate gate={recvGate} />
        {flash && <Flash flash={flash} />}

        {openSessions.length > 0 && (
          <div className="mb-5">
            <h2 className="text-lg font-bold text-ink mb-1">جلساتٌ مفتوحة ({openSessions.length})</h2>
            <p className="text-ink-2 text-xs mb-2">
              تابعْ جلستك بدل فتح ثانيةٍ على الأمر نفسه — فجلستان على أمرٍ واحد لا ترى إحداهما الأخرى.
            </p>
            <ul className="space-y-2">
              {openSessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setSessionId(s.id); setActiveDraft('P1'); }}
                    className="w-full text-right rounded-lg border px-4 py-3"
                    style={{ borderColor: 'var(--o-primary)', background: 'var(--o-surface)' }}
                  >
                    <div className="font-bold text-ink">{s.order?.number || '—'}</div>
                    <div className="text-ink-2 text-xs">
                      فتحها {s.openedBy || '—'} · {(s.pallets ?? []).length} طبليةً · {s.warehouse || '—'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className="text-lg font-bold text-ink mb-3">{tr('open_pos')} ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="text-ink-2 text-sm">
            لا أمر شراءٍ معتمدٌ له رصيدٌ مفتوح. اعتمد أمرًا من صندوق المستندات ثمّ عُد.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={busy || !recvGate.allowed}
                  onClick={() => begin(o)}
                  className="w-full text-right rounded-lg border px-4 py-4"
                  style={{ borderColor: 'var(--o-border)' }}
                >
                  <div className="font-bold text-ink">{o.number}</div>
                  <div className="text-ink-2 text-xs mt-1">
                    {o.supplier || '—'} · {o.warehouse || '—'} · {o.lineCount} صنفًا
                  </div>
                  <div className="text-ink-2 text-xs mt-1">
                    المطلوب {o.ordered} · المستلم {o.received} · <strong className="text-ink">المفتوح {o.open}</strong>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── المسح ──
  return (
    <div className="o_theme" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="font-bold text-ink">{session?.order?.number}</div>
          <div className="text-ink-2 text-xs">{session?.supplier} · {session?.warehouse}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary text-sm" onClick={newDraft} disabled={busy}>{tr('new_pallet')}</button>
          {/*
            ★ **تصحيح 2026-08-27 — طريقٌ مسدود:** كان هنا زرُّ الإنهاء وحده،
            فمن فتح جلسةً بالخطأ ولم يمسح فيها شيئًا يُردّ بـ«اتركها بسببٍ
            مكتوب» — **ولا زرَّ يفعل ذلك**، فتبقى جلستُه مفتوحةً إلى الأبد.
            و`leaveSession` مبنيّةٌ في الخدمة منذ م٥ وبلا مستدعٍ واحد.
            والزرّ يظهر **بحكم `sessionCloseProblem` نفسه** الذي يمنع الإغلاق،
            فلا تختلف الواجهة عن الحَكَم.
          */}
          {closeProblem ? (
            <button type="button" className="btn btn-secondary text-sm" onClick={leaveWithReason} disabled={busy}>
              ترك الجلسة بسبب
            </button>
          ) : (
            <button type="button" className="btn btn-secondary text-sm" onClick={endSession} disabled={busy}>{tr('end_session')}</button>
          )}
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="المفتوح" value={totals.open} />
          <Stat label="المقروء" value={totals.received} />
          <Stat label="المتبقّي" value={totals.remaining} />
        </div>
      )}

      {flash && <Flash flash={flash} />}

      <div className="flex flex-wrap gap-2 mb-3">
        {(session?.drafts ?? []).map((d) => (
          <button
            key={d.ref}
            type="button"
            onClick={() => setActiveDraft(d.ref)}
            className={d.ref === activeDraft ? 'btn btn-primary text-sm' : 'btn btn-secondary text-sm'}
          >
            {d.ref} ({(d.lines ?? []).length})
            {d.state !== 'SCANNING' && ' ✓'}
          </button>
        ))}
      </div>

      {draft?.state === 'SCANNING' ? (
        <form onSubmit={submitScan} className="mb-4">
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="امسح الباركود أو اكتبه"
              className="flex-1 rounded-lg border px-4 py-4 text-lg"
              style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)', direction: 'ltr', textAlign: 'center' }}
              autoFocus
              autoComplete="off"
              enterKeyHint="go"
              /* ⚠ لا `inputMode="none"`: كانت تمنع لوحة مفاتيح الهاتف من الفتح،
                 فحقلٌ لا يُكتب فيه ولا كاميرا بجانبه = «الماسح لا يقرأ». */
            />
            <ScanCameraButton camera={camera} compact />
          </div>
          <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى الباركود — تبقى مفتوحةً كرتونةً تلو كرتونة." />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="الكمّيّة (١)" type="number" min="0" step="any"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="الدفعة"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="الصلاحية" type="date"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1 py-3" disabled={busy || !code.trim()}>تسجيل القراءة</button>
            <button type="button" className="btn btn-secondary py-3" onClick={closeDraft} disabled={busy || (draft?.lines ?? []).length === 0}>
              إغلاق ورفعٌ للحوكمة
            </button>
          </div>
        </form>
      ) : (
        <p className="text-ink-2 text-sm mb-4">
          هذه الطبلية رُفعت للحوكمة — افتح طبليةً جديدة لتُكمل.
        </p>
      )}

      {(draft?.lines ?? []).length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-2 text-xs border-b" style={{ borderColor: 'var(--o-border)' }}>
              <th className="text-right py-2">الصنف</th>
              <th className="text-right py-2">الدفعة</th>
              <th className="text-left py-2">الكمّيّة</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((l, i) => (
              <tr key={`${l.sku}-${l.batch}-${i}`} className="border-b" style={{ borderColor: 'var(--o-border)' }}>
                <td className="py-2 text-ink">{l.name || l.sku}</td>
                <td className="py-2 text-ink-2">{l.batch || '—'}</td>
                <td className="py-2 text-left text-ink tabular-nums">{l.qty} {l.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── الاستلام الرسميّ: حيث تصير الحمولة رصيدًا ── */}
      {grn && (
        <div className="mt-6 rounded-lg border p-4" style={{ borderColor: 'var(--o-border)' }}>
          <h3 className="font-bold text-ink text-sm mb-2">الاستلام الرسميّ (GRN)</h3>
          {session?.grnNumber ? (
            <p className="text-ink-2 text-sm">
              تولّد <strong className="text-ink">{session.grnNumber}</strong> من هذه الجلسة.
              اعتمده من صندوق المستندات ليتحرّك الرصيد — ولا يُشتقّ مرّتين.
            </p>
          ) : grn.problem ? (
            <p className="text-ink-2 text-sm">{grn.problem}</p>
          ) : (
            <>
              <p className="text-ink-2 text-xs mb-2">
                {grn.palletCount} طبليةً معتمدة · {grn.lines.length} بندًا · إجمالي {grn.total}
              </p>
              <ul className="text-sm mb-3 space-y-1">
                {grn.lines.map((l) => (
                  <li key={l.lineId} className="flex justify-between">
                    <span className="text-ink">{l.sku}</span>
                    <span className="text-ink-2 tabular-nums">
                      {l.received} من {l.open}{l.over > 0 && <strong> (+{l.over} فوق المفتوح)</strong>}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary w-full py-3" onClick={makeGrn} disabled={busy}>
                توليد الاستلام الرسميّ
              </button>
              <p className="text-ink-2 text-xs mt-2">
                يولد <strong>مسوّدةً</strong> — والرصيد يتحرّك عند اعتمادها وإنجازها، لا قبله.
              </p>
            </>
          )}
        </div>
      )}

      {(session?.lines ?? []).length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-ink-2 cursor-pointer">المتبقّي المفتوح لكلّ صنف</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {session.lines.map((l) => (
              <li key={l.lineId} className="flex justify-between">
                <span className="text-ink">{l.sku}</span>
                <span className="text-ink-2 tabular-nums">{remainingOf(l)} من {l.open}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** ‹LPN-214› بدّالُ الطور — الاستلامُ والتخزينُ طرفا دورةٍ واحدة. */
/** ‹LPN-511› شريطُ الصلاحية — يُعلِم ولا يحجب من لا يُعرَف. */
function RoleGate({ gate }) {
  if (!gate || gate.allowed) return null;
  return (
    <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>
      {gate.message}
    </div>
  );
}

function ModeSwitch({ mode, setMode, disabled, tr }) {
  return (
    <div className="flex gap-2 mb-4">
      {[['receiving', tr('mode_receiving')], ['putaway', tr('mode_putaway')]].map(([id, label]) => (
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
  const color = flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)';
  return (
    <div className="mb-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: color }}>
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
