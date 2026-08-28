/**
 * مركزُ البوابة ‹GATE-201/203/204› — الشاشةُ التي يفتحها الحارسُ على الحاجز.
 *
 * ═══ ولماذا شاشةٌ لا تبويبٌ خامسٌ في «عمليات الأسطول»؟ (ق-٢) ═══
 * تبويبُ «الساحة والأبواب» قائمٌ ويبقى — لكنّه **منظارُ مدير**: لوحةٌ
 * مكتبيّةٌ بأربعة تبويباتٍ وجداولَ عريضة. والحارسُ واقفٌ بهاتفٍ في يدٍ
 * وأوراقِ سائقٍ في الأخرى. وهذا عينُ العطب الذي أصلحه ‹LOC-402›: «شاشةُ
 * العامل مدفونةً داخل لوحةٍ إداريّة».
 *
 * ═══ ★ والشاشةُ تعرض ولا تقرّر ═══
 * لا شرطَ إظهارٍ مكتوبٌ في JSX: `fieldsFor` تقول ما يظهر، و`nextStepFor`
 * تقول ما الزرّ التالي، و`loadGaps` تقول ما ينقص، و`exitVerdict` يمنع.
 * كلُّها في المنطق الخالص المختبَر — فما تراه هنا ترتيبٌ وعرضٌ فقط.
 *
 * ═══ ولا رقمَ يُحسب هنا ═══
 * «دخلت بـ١٥ · خرجت بـ٦» تأتي من `loadSummary` — فلا يفترق ما يُعرض على
 * الحاجز عمّا يُقرأ في السجلّ.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  GATE_REASONS,
  LOAD_STATES,
  EXIT_STATES,
  PALLET_TYPES,
  PALLET_OWNERSHIP,
  PALLET_CONDITIONS,
  fieldsFor,
  exitFieldsFor,
  loadGaps,
  visitorGaps,
  loadSummary,
  palletTotal,
  reasonLabel,
  normalizePlate,
} from '../../../services/gate/gateModel.js';
import {
  checkIn,
  checkOut,
  verify,
  listenYardVisits,
  nextStepFor,
  isOnSite,
} from '../../../services/gate/gateService.js';
import { yardStage, visitTimers } from '../../../services/fleet/yardModel.js';
import { canWriteGate, gateUiGate } from '../../../services/gate/gateRoles.js';
import { useBarcodeCamera, ScanCameraButton, ScanCameraPanel } from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';
import { FieldLangSwitch, useFieldLang } from '../lpn/useFieldLang.jsx';

/** تسميةُ حقلِ حمولةٍ — مصدرٌ واحدٌ تقرؤه شاشتا الدخول والخروج. */
const FIELD_LABELS = {
  cargoType: 'نوع الحمولة',
  party: 'الجهة (المورّد / المرسِل / المستلِم)',
  poRef: 'رقم أمر الشراء (PO)',
  invoiceRef: 'رقم الفاتورة',
  dnRef: 'رقم إذن التسليم (DN)',
  transferRef: 'رقم التحويل المخزنيّ',
  containerNo: 'رقم الحاوية',
  sealNo: 'رقم الختم (Seal)',
  packages: 'عدد الطرود المتوقّعة',
  destination: 'الوجهة',
  doRef: 'رقم أمر التسليم (DO)',
  soRef: 'رقم أمر البيع (SO)',
  issueRef: 'رقم طلب الصرف',
  receivedBy: 'اسم المستلِم أو الجهة',
  handedBy: 'الموظّف المسلِّم',
  notes: 'ملاحظات موظّف الأمن',
};

const NUMERIC = new Set(['packages']);

const emptyPalletLine = () => ({ count: '', type: 'STD', ownership: 'company', condition: 'sound' });

const box = { borderColor: 'var(--o-border)', background: 'var(--o-surface)' };

export default function GatePost() {
  const { lang, dir, setLang, tr } = useFieldLang();
  const [me, setMe] = useState(null);
  const [visits, setVisits] = useState([]);
  const [tab, setTab] = useState('entry');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  // ── نموذجُ الدخول ──
  const [plate, setPlate] = useState('');
  const [reason, setReason] = useState('');
  const [loadState, setLoadState] = useState('loaded');
  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [cargo, setCargo] = useState({});
  const [pallets, setPallets] = useState([emptyPalletLine()]);
  const [visitor, setVisitor] = useState({ name: '', phone: '', host: '' });

  // ── نموذجُ الخروج ──
  const [openVisitId, setOpenVisitId] = useState('');
  const [exitStateId, setExitStateId] = useState('empty');
  const [exitCargo, setExitCargo] = useState({});
  const [exitPallets, setExitPallets] = useState([emptyPalletLine()]);
  const [permitRef, setPermitRef] = useState('');

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(
    () =>
      listenYardVisits(
        (list) => setVisits(list),
        () => setVisits([])
      ),
    []
  );

  const gate = gateUiGate(me?.role);
  const canWrite = canWriteGate(me?.role);
  const shown = useMemo(() => fieldsFor(reason, loadState), [reason, loadState]);
  const exitShown = useMemo(() => exitFieldsFor(exitStateId), [exitStateId]);
  const onSite = useMemo(() => visits.filter(isOnSite), [visits]);
  const selected = useMemo(() => onSite.find((v) => v.id === openVisitId) || null, [onSite, openVisitId]);

  const gaps = useMemo(
    () =>
      reason
        ? [...loadGaps(reason, { ...cargo, state: loadState, pallets }), ...(shown.visitor ? visitorGaps(visitor) : [])]
        : [],
    [reason, cargo, loadState, pallets, shown.visitor, visitor]
  );

  function say(kind, text) {
    setFlash({ kind, text });
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
  }

  const onScanned = (code) => setPlate(normalizePlate(normalizeScanned(code)));
  const camera = useBarcodeCamera({ onCode: onScanned, closeOnCode: true });
  useWedgeScanner(onScanned, { enabled: tab === 'entry' });

  function resetEntry() {
    setPlate('');
    setReason('');
    setLoadState('loaded');
    setDriverName('');
    setDriverId('');
    setCarrier('');
    setCargo({});
    setPallets([emptyPalletLine()]);
    setVisitor({ name: '', phone: '', host: '' });
  }

  async function submitEntry(e) {
    e?.preventDefault?.();
    if (!plate.trim()) { say('err', tr('gate_plate_required')); return; }
    if (!reason) { say('err', tr('gate_reason_required')); return; }
    setBusy(true);
    try {
      await checkIn(
        {
          plate,
          carrier,
          driverName,
          driverId,
          reason,
          load: { ...cargo, state: loadState, pallets },
          visitor,
        },
        me
      );
      say('ok', `${tr('gate_saved')} ${normalizePlate(plate)} — ${reasonLabel(reason)}`);
      resetEntry();
      setTab('site');
    } catch (err) {
      say('err', err?.message || tr('connection_problem'));
    } finally {
      setBusy(false);
    }
  }

  async function advance(visit) {
    const step = nextStepFor(visit);
    if (!step?.stage) return;
    setBusy(true);
    try {
      if (step.stage === 'verified') await verify(visit.id, me);
      else if (step.stage === 'permitted' || step.stage === 'exited') {
        setOpenVisitId(visit.id);
        setTab('exit');
        return;
      } else await verify(visit.id, me);
      say('ok', tr('gate_saved'));
    } catch (err) {
      say('err', err?.message || tr('connection_problem'));
    } finally {
      setBusy(false);
    }
  }

  async function submitExit(e) {
    e?.preventDefault?.();
    if (!selected) { say('err', 'اختر مركبةً من قائمة الموقع أوّلًا.'); return; }
    setBusy(true);
    try {
      await checkOut(
        selected.id,
        { out: { ...exitCargo, state: exitStateId, pallets: exitPallets }, permitRef },
        me
      );
      say('ok', `${tr('gate_saved')} ${selected.plate}`);
      setOpenVisitId('');
      setExitStateId('empty');
      setExitCargo({});
      setExitPallets([emptyPalletLine()]);
      setPermitRef('');
      setTab('site');
    } catch (err) {
      say('err', err?.message || tr('connection_problem'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="o_theme" dir={dir}>
      <FieldLangSwitch lang={lang} setLang={setLang} />

      {!gate.allowed && (
        <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>{gate.message}</div>
      )}

      {flash && (
        <div
          className="mb-3 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)' }}
          role="status"
        >
          {flash.text}
        </div>
      )}

      {/* التبويبات — ثلاثةُ أزرارٍ كبيرةٍ للإبهام لا شريطُ تبويباتٍ دقيق. */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button type="button" onClick={() => setTab('entry')} aria-pressed={tab === 'entry'}
          className={tab === 'entry' ? 'btn btn-primary py-3' : 'btn btn-secondary py-3'}>
          {tr('gate_new_entry')}
        </button>
        <button type="button" onClick={() => setTab('site')} aria-pressed={tab === 'site'}
          className={tab === 'site' ? 'btn btn-primary py-3' : 'btn btn-secondary py-3'}>
          {tr('gate_on_site')} ({onSite.length})
        </button>
        <button type="button" onClick={() => setTab('exit')} aria-pressed={tab === 'exit'}
          className={tab === 'exit' ? 'btn btn-primary py-3' : 'btn btn-secondary py-3'}>
          {tr('gate_exit')}
        </button>
      </div>

      {tab === 'entry' && (
        <form onSubmit={submitEntry}>
          <label className="block mb-3">
            <span className="text-xs text-ink-2">{tr('gate_plate')}</span>
            <div className="flex gap-2 mt-1">
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="27-123456"
                className="flex-1 rounded-lg border px-4 py-4 text-lg font-bold"
                style={{ ...box, direction: 'ltr', textAlign: 'center' }}
                autoComplete="off"
                inputMode="text"
                disabled={!canWrite}
              />
              <ScanCameraButton camera={camera} compact />
            </div>
          </label>
          <ScanCameraPanel camera={camera} hint={tr('gate_camera_hint')} />

          {/* ★ ج‑١: السببُ أوّلًا — وهو ما يقرّر كلَّ ما يظهر بعده. */}
          <fieldset className="mb-4">
            <legend className="text-xs text-ink-2 mb-2">{tr('gate_reason')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {GATE_REASONS.map((r) => (
                <button key={r.id} type="button" onClick={() => setReason(r.id)} aria-pressed={reason === r.id}
                  className={reason === r.id ? 'btn btn-primary text-sm py-3' : 'btn btn-secondary text-sm py-3'}>
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>

          {reason && !shown.visitor && (
            <fieldset className="mb-4">
              <legend className="text-xs text-ink-2 mb-2">{tr('gate_load_state')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {LOAD_STATES.map((st) => (
                  <button key={st.id} type="button" onClick={() => setLoadState(st.id)} aria-pressed={loadState === st.id}
                    className={loadState === st.id ? 'btn btn-primary text-sm py-3' : 'btn btn-secondary text-sm py-3'}>
                    {st.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {reason && (
            <>
              <TextField label={tr('gate_driver')} value={driverName} onChange={setDriverName} disabled={!canWrite} />
              <TextField label={tr('gate_driver_id')} value={driverId} onChange={setDriverId} disabled={!canWrite} ltr />
              {!shown.visitor && (
                <TextField label={tr('gate_carrier')} value={carrier} onChange={setCarrier} disabled={!canWrite} />
              )}

              {shown.visitor && (
                <section className="rounded-lg border px-3 py-3 mb-3" style={box}>
                  <h3 className="text-sm font-bold text-ink mb-2">{tr('gate_visitor')}</h3>
                  <TextField label={tr('gate_visitor_name')} value={visitor.name}
                    onChange={(v) => setVisitor((s) => ({ ...s, name: v }))} disabled={!canWrite} />
                  <TextField label={tr('gate_visitor_host')} value={visitor.host}
                    onChange={(v) => setVisitor((s) => ({ ...s, host: v }))} disabled={!canWrite} />
                  <TextField label={tr('gate_visitor_phone')} value={visitor.phone}
                    onChange={(v) => setVisitor((s) => ({ ...s, phone: v }))} disabled={!canWrite} ltr />
                  <p className="text-xs text-ink-2 mt-1">لا يُطلب رقمُ هويّةٍ ولا صورةٌ — قرار المالك ق-٧.</p>
                </section>
              )}

              {/* ★ ج‑٤: الحقولُ من fieldsFor لا من شرطٍ مكتوبٍ هنا. */}
              {shown.fields.map((key) => (
                <TextField
                  key={key}
                  label={FIELD_LABELS[key] || key}
                  value={cargo[key] ?? ''}
                  onChange={(v) => setCargo((s) => ({ ...s, [key]: v }))}
                  disabled={!canWrite}
                  numeric={NUMERIC.has(key)}
                  ltr={['poRef', 'invoiceRef', 'dnRef', 'transferRef', 'containerNo', 'sealNo', 'doRef', 'soRef', 'issueRef'].includes(key)}
                  multiline={key === 'notes'}
                />
              ))}

              {shown.pallets && (
                <PalletLines lines={pallets} setLines={setPallets} tr={tr} disabled={!canWrite} />
              )}

              {gaps.length > 0 && (
                <section className="rounded-lg border px-3 py-2 mb-3" style={box}>
                  <h3 className="text-xs font-bold text-ink mb-1">{tr('gate_missing_declared')}</h3>
                  <ul className="text-xs text-ink-2 space-y-1">
                    {gaps.map((g) => <li key={g}>· {g}</li>)}
                  </ul>
                </section>
              )}

              <button type="submit" className="btn btn-primary w-full py-4 text-base"
                disabled={busy || !canWrite || !plate.trim()}>
                {tr('gate_new_entry')}
              </button>
            </>
          )}
        </form>
      )}

      {tab === 'site' && (
        <section>
          {onSite.length === 0 && <p className="text-ink-2 text-sm">{tr('gate_none_on_site')}</p>}
          <ul className="space-y-2">
            {onSite.map((v) => {
              const step = nextStepFor(v);
              const summary = loadSummary(v.load);
              const timers = visitTimers(v, Date.now());
              return (
                <li key={v.id} className="rounded-lg border px-3 py-3" style={box}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink tabular-nums" style={{ direction: 'ltr' }}>{v.plate}</span>
                    <span className="text-xs text-ink-2">{yardStage(v.stage)?.label || v.stage}</span>
                  </div>
                  <div className="text-xs text-ink-2 mt-1">
                    {reasonLabel(v.reason) || '—'} · {tr('gate_entered_with')} {summary.in.text}
                  </div>
                  {timers.turnaround.minutes !== null && (
                    <div className="text-xs text-ink-2 mt-1">{timers.turnaround.label}</div>
                  )}
                  {step?.stage ? (
                    <button type="button" onClick={() => advance(v)} className="btn btn-secondary w-full mt-2 py-2 text-sm"
                      disabled={busy || !canWrite}>
                      {step.label}
                    </button>
                  ) : (
                    <p className="text-xs text-ink-2 mt-2">{step?.label || tr('gate_in_yard')}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'exit' && (
        <form onSubmit={submitExit}>
          <label className="block mb-3">
            <span className="text-xs text-ink-2">{tr('gate_on_site')}</span>
            <select value={openVisitId} onChange={(e) => setOpenVisitId(e.target.value)}
              className="w-full rounded-lg border px-4 py-3 mt-1" style={box} disabled={!canWrite}>
              <option value="">—</option>
              {onSite.map((v) => (
                <option key={v.id} value={v.id}>{v.plate} · {reasonLabel(v.reason)}</option>
              ))}
            </select>
          </label>

          {selected && (
            <>
              {/* ★★ ج‑٦: حمولةُ الدخول معروضةٌ أمام الحارس وهو يصف الخروج. */}
              <div className="rounded-lg border px-3 py-2 mb-3" style={box}>
                <div className="text-xs text-ink-2">{tr('gate_entered_with')}</div>
                <div className="text-sm text-ink font-bold">{loadSummary(selected.load).in.text}</div>
              </div>

              <fieldset className="mb-4">
                <legend className="text-xs text-ink-2 mb-2">{tr('gate_exit_state')}</legend>
                <div className="grid grid-cols-1 gap-2">
                  {EXIT_STATES.map((st) => (
                    <button key={st.id} type="button" onClick={() => setExitStateId(st.id)} aria-pressed={exitStateId === st.id}
                      className={exitStateId === st.id ? 'btn btn-primary text-sm py-3' : 'btn btn-secondary text-sm py-3'}>
                      {st.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {exitStateId === 'empty' && (
                <p className="text-xs text-ink-2 mb-3">{tr('gate_exit_empty_hint')}</p>
              )}

              {exitShown.fields.map((key) => (
                <TextField
                  key={key}
                  label={FIELD_LABELS[key] || key}
                  value={exitCargo[key] ?? ''}
                  onChange={(v) => setExitCargo((s) => ({ ...s, [key]: v }))}
                  disabled={!canWrite}
                  numeric={NUMERIC.has(key)}
                  ltr={['doRef', 'transferRef', 'invoiceRef', 'soRef', 'issueRef'].includes(key)}
                  multiline={key === 'notes'}
                />
              ))}

              {exitShown.pallets && (
                <PalletLines lines={exitPallets} setLines={setExitPallets} tr={tr} disabled={!canWrite} />
              )}

              <TextField label={tr('gate_permit_ref')} value={permitRef} onChange={setPermitRef} disabled={!canWrite} ltr />

              <button type="submit" className="btn btn-primary w-full py-4 text-base" disabled={busy || !canWrite}>
                {tr('gate_exit')}
              </button>
              <p className="text-ink-2 text-xs mt-3 leading-relaxed">{tr('gate_load_differs')}</p>
            </>
          )}
        </form>
      )}
    </div>
  );
}

/** حقلُ نصٍّ واحد — لتوحيد المقاس واللمسة، ولئلّا يتكرّر الأسلوبُ عشرين مرّة. */
function TextField({ label, value, onChange, disabled, numeric, ltr, multiline }) {
  const common = {
    value,
    onChange: (e) => onChange(e.target.value),
    disabled,
    className: 'w-full rounded-lg border px-4 py-3 mt-1',
    style: { ...box, ...(ltr ? { direction: 'ltr', textAlign: 'left' } : null) },
    autoComplete: 'off',
  };
  return (
    <label className="block mb-3">
      <span className="text-xs text-ink-2">{label}</span>
      {multiline ? <textarea rows={2} {...common} /> : <input inputMode={numeric ? 'numeric' : 'text'} {...common} />}
    </label>
  );
}

/** أسطرُ الطبليات العائدة — عددٌ ونوعٌ وملكيّةٌ وحال (ق-١: لا «طبليات» مجرّدة). */
function PalletLines({ lines, setLines, tr, disabled }) {
  const total = palletTotal(lines.map((l) => ({ ...l, count: Number(l.count) || 0 })));
  const patch = (i, key, v) => setLines(lines.map((l, k) => (k === i ? { ...l, [key]: v } : l)));

  return (
    <section className="rounded-lg border px-3 py-3 mb-3" style={box}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-ink">{tr('gate_returnable_pallets')}</h3>
        <span className="text-xs text-ink-2 tabular-nums">{total}</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 mb-2">
          <label className="block">
            <span className="text-xs text-ink-2">{tr('gate_pallet_count')}</span>
            <input value={l.count} onChange={(e) => patch(i, 'count', e.target.value)} disabled={disabled}
              inputMode="numeric" className="w-full rounded-lg border px-3 py-2 mt-1"
              style={{ ...box, direction: 'ltr', textAlign: 'center' }} />
          </label>
          <label className="block">
            <span className="text-xs text-ink-2">{tr('gate_pallet_ownership')}</span>
            <select value={l.ownership} onChange={(e) => patch(i, 'ownership', e.target.value)} disabled={disabled}
              className="w-full rounded-lg border px-3 py-2 mt-1" style={box}>
              {PALLET_OWNERSHIP.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-ink-2">{tr('gate_pallet_type')}</span>
            <select value={l.type} onChange={(e) => patch(i, 'type', e.target.value)} disabled={disabled}
              className="w-full rounded-lg border px-3 py-2 mt-1" style={box}>
              {PALLET_TYPES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-ink-2">{tr('gate_pallet_condition')}</span>
            <select value={l.condition} onChange={(e) => patch(i, 'condition', e.target.value)} disabled={disabled}
              className="w-full rounded-lg border px-3 py-2 mt-1" style={box}>
              {PALLET_CONDITIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary text-xs" disabled={disabled}
          onClick={() => setLines([...lines, emptyPalletLine()])}>
          {tr('gate_add_pallet_line')}
        </button>
        {lines.length > 1 && (
          <button type="button" className="btn btn-secondary text-xs" disabled={disabled}
            onClick={() => setLines(lines.slice(0, -1))}>
            {tr('gate_remove_line')}
          </button>
        )}
      </div>
    </section>
  );
}
