/**
 * الأبواب والبوّابة ‹LPN-722› — تحميلٌ وخروجٌ واستلامٌ في شاشةٍ واحدة.
 *
 * ═══ لماذا شاشةٌ واحدةٌ بثلاثة أوضاع ═══
 * لأنّ **العامل عند الباب واحد** والباب واحد: يقف على الرصيف فيحمّل شاحنةً
 * ثمّ ينزّل أخرى. وثلاثُ شاشاتٍ تعني ثلاثةَ روابطَ يحفظها ويخطئ بينها —
 * والوضعُ يُبدَّل بزرٍّ واحد.
 *
 * ═══ ★★ والقاعدة الحاكمة ظاهرةٌ في الشاشة نفسها ═══
 * أزرارُ العمل **معطَّلةٌ حتى تكتمل البيّنات**، والشاشة تقول ما ينقص بالاسم.
 * فالقاعدة لا تُقرأ في وثيقةٍ بل تُرى في الزرّ: «امسح الباب أوّلًا».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { useBarcodeCamera, ScanCameraButton, ScanCameraPanel } from '../scan/BarcodeCamera.jsx';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { listenDoors } from '../../../services/fleet/yardService.js';
import { qualifierOf } from '../../../services/locations/qualifiedCode.js';
import { DOCK_STEPS, dockCard, dockCounters } from '../../../services/lpn/dockLoading.js';
import { EXIT_STEPS, exitCard } from '../../../services/lpn/exitGate.js';
import { INBOUND_PURPOSES, INBOUND_STEPS, inboundCard } from '../../../services/lpn/inboundDock.js';
import { chainLine, chainSummary } from '../../../services/lpn/custodyChain.js';
import {
  DOCK_MODES,
  beginWork,
  blockSession,
  closeSession,
  custodyChainFor,
  listenSessions,
  openSession,
  scanItem,
  scanItemExtra,
  scanStep,
  stampExitSession,
} from '../../../services/lpn/dockService.js';

const STEPS_BY_MODE = { LOAD: DOCK_STEPS, EXIT: EXIT_STEPS, INBOUND: INBOUND_STEPS };

export default function DockOperations() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('LOAD');
  const [sessions, setSessions] = useState([]);
  const [id, setId] = useState('');
  const [doors, setDoors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [purpose, setPurpose] = useState('SUPPLY');
  const [expected, setExpected] = useState('');
  const [scan, setScan] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState(null);
  const inputRef = useRef(null);

  const actor = me?.uid || me?.id || '';
  const actorName = me?.name || me?.displayName || me?.email || '';

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(() => listenSessions(setSessions, { onError: () => setSessions([]) }), []);
  useEffect(() => listenDoors(setDoors, () => setDoors([])), []);
  useEffect(() => subscribeWarehouses(setWarehouses, () => setWarehouses([])), []);

  const session = useMemo(() => sessions.find((s) => s.id === id) ?? null, [sessions, id]);
  const steps = STEPS_BY_MODE[session?.mode ?? mode] ?? DOCK_STEPS;
  const qualifier = useMemo(() => {
    const wh = warehouses.find((w) => String(w?.code ?? '').toUpperCase() === String(session?.warehouse || warehouse).toUpperCase());
    return qualifierOf(wh);
  }, [warehouses, warehouse, session]);

  const card = useMemo(() => {
    if (!session) return null;
    if (session.mode === 'LOAD') return dockCard(session);
    if (session.mode === 'EXIT') return exitCard(session, {});
    return inboundCard(session);
  }, [session]);

  const gateGap = useMemo(() => {
    if (!session) return null;
    if (session.mode === 'LOAD') return dockCounters(session).gateMissing;
    if (session.mode === 'EXIT') return exitCard(session, {}).problems;
    return inboundCard(session).state === 'GATE' ? ['الباب أو المركبة'] : [];
  }, [session]);

  const say = useCallback((kind, text) => {
    setFlash({ kind, text });
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
  }, []);

  const onScan = useCallback((raw) => {
    const v = normalizeScanned(raw);
    if (v) { setScan(v); setTimeout(() => inputRef.current?.focus(), 20); }
  }, []);
  useWedgeScanner(onScan, { enabled: true });
  const camera = useBarcodeCamera({ onCode: onScan });

  async function start() {
    setBusy(true);
    try {
      const out = await openSession(mode, {
        warehouse,
        purpose,
        expected: expected.split(/[\s,]+/).filter(Boolean),
        actor,
        actorName,
      });
      setId(out.id);
      say('ok', `فُتحت جلسة ${DOCK_MODES[mode]} — ابدأ بالمسح.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح الجلسة.');
    } finally { setBusy(false); }
  }

  async function doStep(stepId) {
    if (!scan) { say('err', 'امسح الباركود أوّلًا.'); return; }
    setBusy(true);
    try {
      await scanStep(id, stepId, scan, { actor, actorName, ctx: { doors, qualifier } });
      say('ok', 'ثبتت البيّنة.');
      setScan('');
    } catch (e) {
      const manual = typeof window !== 'undefined' && window.confirm(`${e?.message}\n\nهل تُدخلها يدويًّا بصلاحيةٍ وسبب؟`)
        ? window.prompt('سبب الإدخال اليدويّ (إلزاميّ — يُوسم في السجلّ):')
        : '';
      if (!manual) { say('err', e?.message || 'تعذّر المسح.'); setBusy(false); return; }
      try {
        await scanStep(id, stepId, scan, { actor, actorName, manual: true, reason: manual, ctx: { doors, qualifier } });
        say('ok', 'أُدخلت يدويًّا — وموسومةٌ في السجلّ.');
        setScan('');
      } catch (e2) { say('err', e2?.message || 'تعذّر الإدخال.'); }
    } finally { setBusy(false); setTimeout(() => inputRef.current?.focus(), 20); }
  }

  async function begin() {
    setBusy(true);
    try {
      await beginWork(id, { expected: expected.split(/[\s,]+/).filter(Boolean), actor, actorName });
      say('ok', 'ابدأ مسح الحمولة.');
    } catch (e) { say('err', e?.message || 'تعذّر البدء.'); } finally { setBusy(false); }
  }

  async function item(condition) {
    if (!scan) { say('err', 'امسح الطبلية أو الطرد.'); return; }
    setBusy(true);
    try {
      const reason = condition === 'DAMAGED' && typeof window !== 'undefined'
        ? window.prompt('وصف الضرر (إلزاميّ — يُقرأ في محضر الفرق):')
        : '';
      if (condition === 'DAMAGED' && !reason) { setBusy(false); return; }
      await scanItem(id, scan, { actor, actorName, condition, reason });
      say('ok', 'سُجّلت.');
      setScan('');
    } catch (e) {
      const extra = typeof window !== 'undefined' && window.confirm(`${e?.message}\n\nهل تُسجّلها زائدةً بقرارٍ وسبب؟`)
        ? window.prompt('سبب تسجيلها زائدة (إلزاميّ):')
        : '';
      if (!extra) { say('err', e?.message || 'تعذّر التسجيل.'); setBusy(false); return; }
      try {
        await scanItemExtra(id, scan, { reason: extra, actor, actorName });
        say('ok', 'سُجّلت زائدةً — والسبب في السجلّ.');
        setScan('');
      } catch (e2) { say('err', e2?.message || 'تعذّر التسجيل.'); }
    } finally { setBusy(false); setTimeout(() => inputRef.current?.focus(), 20); }
  }

  async function close() {
    setBusy(true);
    try {
      const out = await closeSession(id, { actor, actorName });
      say('ok', out.nextLabel ? `أُغلقت — والوجهة التالية: ${out.nextLabel}.` : 'أُغلقت الجلسة.');
    } catch (e) {
      const note = typeof window !== 'undefined' && window.confirm(`${e?.message}\n\nهل تُغلق بصلاحيةٍ وسبب؟`)
        ? window.prompt('سبب الإغلاق الاستثنائيّ (إلزاميّ):')
        : '';
      if (!note) { say('err', e?.message || 'تعذّر الإغلاق.'); setBusy(false); return; }
      try {
        const out = await closeSession(id, { actor, actorName, override: true, overrideNote: note });
        say('ok', out.nextLabel ? `أُغلقت بصلاحيةٍ — والوجهة: ${out.nextLabel}.` : 'أُغلقت بصلاحيةٍ.');
      } catch (e2) { say('err', e2?.message || 'تعذّر الإغلاق.'); }
    } finally { setBusy(false); }
  }

  async function exit() {
    setBusy(true);
    try {
      const out = await stampExitSession(id, {}, { actor, actorName });
      say('ok', out.already ? 'خرجت سلفًا — ولا يُكرَّر الختم.' : 'خُتم الخروج — الرحلة خرجت للتسليم.');
    } catch (e) {
      const note = typeof window !== 'undefined' && window.confirm(`${e?.message}\n\nهل تُخرجها بصلاحيةٍ وسبب؟`)
        ? window.prompt('سبب الخروج الاستثنائيّ (إلزاميّ):')
        : '';
      if (!note) { say('err', e?.message || 'تعذّر الخروج.'); setBusy(false); return; }
      try {
        await stampExitSession(id, {}, { actor, actorName, override: true, overrideNote: note });
        say('ok', 'خُتم الخروج بصلاحيةٍ — والسبب في السجلّ.');
      } catch (e2) { say('err', e2?.message || 'تعذّر الخروج.'); }
    } finally { setBusy(false); }
  }

  async function block() {
    const reason = typeof window !== 'undefined' ? window.prompt('سبب الإيقاف عند البوّابة (إلزاميّ):') : '';
    if (!reason) return;
    setBusy(true);
    try {
      await blockSession(id, { reason, actor, actorName });
      say('ok', 'أُوقفت عند البوّابة — والسبب في السجلّ.');
    } catch (e) { say('err', e?.message || 'تعذّر الإيقاف.'); } finally { setBusy(false); }
  }

  async function traceCode() {
    if (!scan) { say('err', 'امسح ما تريد تتبّعه.'); return; }
    setBusy(true);
    try {
      setTrace(await custodyChainFor(scan));
    } catch (e) { say('err', e?.message || 'تعذّر التتبّع.'); } finally { setBusy(false); }
  }

  if (!id) {
    const open = sessions.filter((s) => s.state !== 'CLOSED' && s.state !== 'EXITED');
    return (
      <div className="o_theme" dir="rtl">
        {flash && <Flash flash={flash} />}

        <section className="o_ds_card o_ds_pad mb-5">
          <h2 className="text-base font-bold text-ink mb-3">افتح جلسةً عند الباب</h2>
          <div className="flex gap-2 flex-wrap mb-3">
            {Object.entries(DOCK_MODES).map(([m, labelAr]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`btn text-sm ${mode === m ? 'btn-primary' : 'btn-secondary'}`}>
                {labelAr}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="المستودع">
              <select className="o_input w-full" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                <option value="">— اختر —</option>
                {warehouses.map((w) => <option key={w.code} value={w.code}>{w.code}</option>)}
              </select>
            </Field>
            {mode === 'INBOUND' && (
              <Field label="غرض الوصول">
                <select className="o_input w-full" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {Object.values(INBOUND_PURPOSES).map((p) => <option key={p.id} value={p.id}>{p.labelAr}</option>)}
                </select>
              </Field>
            )}
            {mode !== 'EXIT' && (
              <Field label={mode === 'LOAD' ? 'الطبالي والطرود المتوقَّعة' : 'قائمة ما أُرسل (إن وُجدت)'}>
                <input className="o_input w-full" value={expected} onChange={(e) => setExpected(e.target.value)}
                  placeholder="LPN-… SHP-…-01" style={{ direction: 'ltr', textAlign: 'left' }} />
              </Field>
            )}
          </div>

          <div className="o_form_actions mt-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>فتح الجلسة</button>
          </div>
        </section>

        <h2 className="text-base font-bold text-ink mb-2">جلساتٌ مفتوحة ({open.length})</h2>
        {open.length === 0 ? <p className="text-ink-2 text-sm">لا جلسةَ مفتوحة.</p> : (
          <ul className="space-y-2 mb-6">
            {open.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => { setId(s.id); setFlash(null); }} className="w-full text-right rounded-lg border px-4 py-3" style={{ borderColor: 'var(--o-border)' }}>
                  <div className="font-bold text-ink">{DOCK_MODES[s.mode]}</div>
                  <div className="text-ink-2 text-xs mt-1" style={{ direction: 'ltr', textAlign: 'left' }}>
                    {[s.door, s.gate, s.vehicle, s.tripRef].filter(Boolean).join(' · ') || 'بلا بيّنةٍ بعد'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <section className="o_ds_card o_ds_pad">
          <h2 className="text-base font-bold text-ink mb-2">سلسلة العهدة — تتبّعٌ من أيّ طرف</h2>
          <p className="text-ink-2 text-xs mb-3">امسح طردًا أو طبليةً أو مركبةً أو رحلة، فتُقرأ السلسلة: باب التحميل ← السيارة ← بوّابة الخروج ← باب الاستلام.</p>
          <div className="flex gap-2 flex-wrap">
            <input ref={inputRef} className="o_input flex-1" value={scan} onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') traceCode(); }} placeholder="امسح للتتبّع…" style={{ direction: 'ltr', textAlign: 'left' }} />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={traceCode}>تتبّع</button>
            <ScanCameraButton camera={camera} />
          </div>
          <ScanCameraPanel camera={camera} />
          {trace && <ChainView trace={trace} />}
        </section>
      </div>
    );
  }

  const working = session?.state === 'LOADING' || session?.state === 'UNLOADING';

  return (
    <div className="o_theme" dir="rtl">
      {flash && <Flash flash={flash} />}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="font-bold text-ink">{DOCK_MODES[session?.mode]}</div>
          <div className="text-ink-2 text-xs" style={{ direction: 'ltr', textAlign: 'left' }}>
            {[session?.door, session?.gate, session?.vehicle, session?.tripRef].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => { setId(''); setTrace(null); }}>رجوع</button>
      </div>

      <div className="mb-4">
        <input ref={inputRef} className="o_input w-full" value={scan} onChange={(e) => setScan(e.target.value)}
          placeholder="امسح هنا…" style={{ direction: 'ltr', textAlign: 'left' }} />
        <div className="flex gap-2 flex-wrap mt-2">
          <ScanCameraButton camera={camera} />
        </div>
        <ScanCameraPanel camera={camera} />
      </div>

      <section className="mb-4">
        <h3 className="font-bold text-ink mb-2">بيّنات البوّابة</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {steps.filter((st) => st.id !== 'ITEMS').map((st) => {
            const done = (session?.proofs ?? []).some((p) => st.kinds.includes(p.kind));
            return (
              <button key={st.id} type="button" disabled={busy} onClick={() => doStep(st.id)}
                className="text-right rounded-lg border px-3 py-3" style={{ borderColor: 'var(--o-border)' }}>
                <div className="font-bold text-ink text-sm">{done ? '✓ ' : ''}{st.labelAr}</div>
                <div className="text-ink-2 text-xs mt-1">{st.hint}</div>
              </button>
            );
          })}
        </div>
        {Array.isArray(gateGap) && gateGap.length > 0 && (
          <p className="text-ink-2 text-xs mt-2">ينقص: {gateGap.join(' · ')}</p>
        )}
      </section>

      {session?.mode !== 'EXIT' && !working && (
        <div className="o_form_actions mb-4">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={begin}>
            {session?.mode === 'LOAD' ? 'ابدأ التحميل' : 'ابدأ التنزيل'}
          </button>
        </div>
      )}

      {working && (
        <section className="o_ds_card o_ds_pad mb-4">
          <h3 className="font-bold text-ink mb-2">{session.mode === 'LOAD' ? 'مسحُ الحمولة قبل إدخالها' : 'مسحُ ما يُنزَّل'}</h3>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => item('INTACT')}>
              {session.mode === 'LOAD' ? 'حُمِّلت' : 'نزلت سليمة'}
            </button>
            {session.mode === 'INBOUND' && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => item('DAMAGED')}>نزلت تالفة</button>
            )}
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>إغلاق الجلسة</button>
          </div>
        </section>
      )}

      {session?.mode === 'EXIT' && (
        <div className="o_form_actions mb-4">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={exit}>ختم الخروج</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={block}>إيقافٌ عند البوّابة</button>
        </div>
      )}

      {card && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {'loaded' in card && <Stat label="المحمَّل" value={`${card.loaded}/${card.expected}`} />}
          {'received' in card && <Stat label="المستلَم" value={`${card.received}/${card.expected}`} />}
          {'missing' in card && <Stat label="ناقص" value={card.missing} />}
          {'damaged' in card && <Stat label="تالف" value={card.damaged} />}
          {'extras' in card && <Stat label="زائد" value={card.extras} />}
          <Stat label="ثقةُ المسح" value={`${card.trust}٪`} />
        </div>
      )}
    </div>
  );
}

function ChainView({ trace }) {
  const sum = chainSummary(trace);
  return (
    <div className="mt-4">
      <div className="text-ink text-sm font-bold mb-1">{trace.kindLabel} «{trace.query}»</div>
      <div className="text-ink-2 text-xs mb-2" style={{ direction: 'ltr', textAlign: 'left' }}>{chainLine(trace)}</div>
      <div className="text-ink-2 text-xs">
        {sum.done}/{sum.total} حلقة · ثقةٌ {sum.trust}٪
        {sum.spanMinutes !== null && <span> · {sum.spanMinutes} دقيقة</span>}
      </div>
      {sum.open && <div className="text-ink text-xs mt-1">{sum.open.message}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-ink-2 text-xs mb-1">{label}</span>
      {children}
    </label>
  );
}

function Flash({ flash }) {
  return (
    <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{
      background: flash.kind === 'ok' ? 'var(--o-success-bg, #eaf6ee)' : 'var(--o-danger-bg, #fdeceb)',
      color: flash.kind === 'ok' ? 'var(--o-success, #1e7e34)' : 'var(--o-danger, #b52a1d)',
    }}>{flash.text}</div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--o-border)' }}>
      <div className="text-ink-2 text-xs">{label}</div>
      <div className="text-ink font-bold text-lg">{value}</div>
    </div>
  );
}
