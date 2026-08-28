/**
 * التعبئة والشحن ‹LPN-721› — من طلبٍ محضَّر إلى طرودٍ مغلقةٍ بملصق عميل.
 *
 * ═══ الشاشة تمشي الدورة التي كتبها النصّ ═══
 * مسحُ الطلب ← التحقّق من محتوياته ← عددُ الطرود النهائيّ ← ملصقٌ لكلّ طرد ←
 * تسجيلُ المعبِّئ ← «جاهز للتحميل».
 *
 * ═══ والشاشة عرضٌ للحكم لا حَكَم ═══
 * كلُّ زرٍّ يستدعي `shippingService` التي تستدعي `packingFlow` الخالصة على
 * البيانات الحيّة. ولا شرطَ يُكتب في JSX — والدخيلُ والزائد يردّهما المنطق
 * برسالةٍ تقول الصواب.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { normalizeScanned } from '../../../services/scan/scanEngine.js';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { useBarcodeCamera, ScanCameraButton, ScanCameraPanel } from '../scan/BarcodeCamera.jsx';
import {
  PARCEL_STATES,
  orderStateLabel,
  packingCounters,
  parcelCard,
  remainingLines,
} from '../../../services/shipping/packingFlow.js';
import {
  cancelParcelOn,
  closeParcelOn,
  finishPacking,
  listPackablePicks,
  listenShipments,
  openShipment,
  packIntoParcel,
  printParcelLabel,
  reopenParcelOn,
  setParcels,
} from '../../../services/shipping/shippingService.js';
import { buildAllCustomerLabels, labelGaps } from '../../../services/shipping/customerLabel.js';

export default function PackingFlow() {
  const [me, setMe] = useState(null);
  const [picks, setPicks] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [code, setCode] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [parcelNo, setParcelNo] = useState(1);
  const [scan, setScan] = useState('');
  const [qty, setQty] = useState('');
  const [labels, setLabels] = useState(null);
  const inputRef = useRef(null);

  const role = me?.role || '';
  const actor = me?.uid || me?.id || '';
  const actorName = me?.name || me?.displayName || me?.email || '';

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(() => listenShipments(setShipments, { onError: () => setShipments([]) }), []);

  const loadPicks = useCallback(async () => {
    try { setPicks(await listPackablePicks({})); } catch { setPicks([]); }
  }, []);
  useEffect(() => { loadPicks(); }, [loadPicks]);

  const session = useMemo(() => shipments.find((s) => s.id === code) ?? null, [shipments, code]);
  const counters = useMemo(() => (session ? packingCounters(session) : null), [session]);
  const rows = useMemo(() => (session ? remainingLines(session) : []), [session]);
  const card = useMemo(() => (session ? parcelCard(session, parcelNo) : null), [session, parcelNo]);

  const say = useCallback((kind, text) => {
    setFlash({ kind, text });
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
  }, []);

  const onScan = useCallback((raw) => {
    const v = normalizeScanned(raw);
    if (v) { setScan(v); setTimeout(() => inputRef.current?.focus(), 20); }
  }, []);
  useWedgeScanner(onScan, { enabled: Boolean(session) });
  const camera = useBarcodeCamera({ onCode: onScan });

  async function startPacking(pick) {
    setBusy(true);
    try {
      const out = await openShipment(pick, { actor, actorName, role });
      setCode(out.code);
      say('ok', `فُتحت الشحنة ${out.code} — حدّد عدد الطرود.`);
      await loadPicks();
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح الشحنة.');
    } finally { setBusy(false); }
  }

  async function applyParcelCount(total) {
    setBusy(true);
    try {
      await setParcels(code, total, { actor, actorName, role });
      say('ok', `${total} طردًا — وأُنشئ باركودُ كلٍّ منها في السجلّ.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر تحديد عدد الطرود.');
    } finally { setBusy(false); }
  }

  async function packScanned() {
    if (!scan) { say('err', 'امسح باركود الصنف.'); return; }
    const row = rows.find((r) => r.sku === scan.toUpperCase() || r.barcode === scan);
    setBusy(true);
    try {
      await packIntoParcel(code, parcelNo, {
        sku: row?.sku || scan,
        batch: row?.batch || '',
        uom: row?.uom || '',
        description: row?.description || '',
        qty: Number(qty) || 1,
      }, { actor });
      say('ok', `أُضيف إلى الطرد ${parcelNo}.`);
      setScan(''); setQty('');
    } catch (e) {
      say('err', e?.message || 'تعذّرت التعبئة.');
    } finally { setBusy(false); setTimeout(() => inputRef.current?.focus(), 20); }
  }

  async function closeCurrentParcel() {
    setBusy(true);
    try {
      await closeParcelOn(code, parcelNo, { actor });
      say('ok', `أُغلق الطرد ${parcelNo} — اطبع ملصقه.`);
    } catch (e) { say('err', e?.message || 'تعذّر الإغلاق.'); } finally { setBusy(false); }
  }

  async function reopenCurrentParcel() {
    const reason = typeof window !== 'undefined' ? window.prompt(`سبب إعادة فتح الطرد ${parcelNo} (إلزاميّ — ويُبطل ملصقه):`) : '';
    if (!reason) return;
    setBusy(true);
    try {
      await reopenParcelOn(code, parcelNo, { reason, actor, role });
      say('ok', `أُعيد فتح الطرد ${parcelNo} — وأُبطل ملصقه السابق.`);
    } catch (e) { say('err', e?.message || 'تعذّرت إعادة الفتح.'); } finally { setBusy(false); }
  }

  async function cancelCurrentParcel() {
    const reason = typeof window !== 'undefined' ? window.prompt(`سبب إلغاء الطرد ${parcelNo} (إلزاميّ):`) : '';
    if (!reason) return;
    setBusy(true);
    try {
      await cancelParcelOn(code, parcelNo, { reason, actor, role });
      say('ok', `أُلغي الطرد ${parcelNo} — والقيمة محروقة.`);
    } catch (e) { say('err', e?.message || 'تعذّر الإلغاء.'); } finally { setBusy(false); }
  }

  async function printLabel() {
    setBusy(true);
    try {
      await printParcelLabel(code, parcelNo, { actor, actorName, role });
      say('ok', `قُيّدت طباعة ملصق الطرد ${parcelNo}.`);
    } catch (e) { say('err', e?.message || 'تعذّر تقييد الطباعة.'); } finally { setBusy(false); }
  }

  function previewLabels() {
    const order = {
      state: 'approved',
      number: session?.orderRef,
      customerName: session?.customerName,
      customerCode: session?.customerCode,
      destination: session?.branch,
      route: session?.route,
    };
    const out = buildAllCustomerLabels(session, { order });
    if (out.problem) { say('err', out.problem); setLabels(null); return; }
    setLabels(out.labels);
  }

  async function finish() {
    setBusy(true);
    try {
      await finishPacking(code, { actor });
      say('ok', 'أُتمّت التعبئة — الطلب جاهزٌ للتحميل.');
    } catch (e) {
      const note = typeof window !== 'undefined' && window.confirm(`${e?.message}\n\nهل تُتمّ بصلاحيةٍ وسبب؟`)
        ? window.prompt('سبب الإتمام الاستثنائيّ (إلزاميّ):')
        : '';
      if (!note) { say('err', e?.message || 'تعذّر الإتمام.'); setBusy(false); return; }
      try {
        await finishPacking(code, { actor, override: true, overrideNote: note });
        say('ok', 'أُتمّت التعبئة بصلاحيةٍ — والسبب في السجلّ.');
      } catch (e2) { say('err', e2?.message || 'تعذّر الإتمام.'); }
    } finally { setBusy(false); }
  }

  if (!code) {
    const active = shipments.filter((s) => s.state === 'PACKING');
    return (
      <div className="o_theme" dir="rtl">
        {flash && <Flash flash={flash} />}
        <h2 className="text-lg font-bold text-ink mb-3">شحناتٌ قيد التعبئة ({active.length})</h2>
        {active.length === 0 ? <p className="text-ink-2 text-sm">لا شحنةَ مفتوحة.</p> : (
          <ul className="space-y-2 mb-6">
            {active.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => { setCode(s.id); setParcelNo(1); setFlash(null); }}
                  className="w-full text-right rounded-lg border px-4 py-3" style={{ borderColor: 'var(--o-border)' }}>
                  <div className="font-bold text-ink" style={{ direction: 'ltr', textAlign: 'left' }}>{s.id}</div>
                  <div className="text-ink-2 text-xs mt-1">{s.orderRef} · {s.customerName || '—'} · {packingCounters(s).closed}/{s.parcelTotal || 0} طردًا</div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="text-lg font-bold text-ink mb-3">طلباتٌ محضَّرةٌ تنتظر التعبئة ({picks.length})</h2>
        {picks.length === 0 ? (
          <p className="text-ink-2 text-sm">لا طلبَ محضَّرًا ينتظر — تُقفل مهمّة التحضير أوّلًا فيظهر هنا.</p>
        ) : (
          <ul className="space-y-2">
            {picks.map((p) => (
              <li key={p.taskId}>
                <button type="button" disabled={busy} onClick={() => startPacking(p)}
                  className="w-full text-right rounded-lg border px-4 py-3" style={{ borderColor: 'var(--o-border)' }}>
                  <div className="font-bold text-ink">{p.orderRef}</div>
                  <div className="text-ink-2 text-xs mt-1">{p.customerName || '—'} · {p.lines.length} بندًا · {p.warehouse}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="o_theme" dir="rtl">
      {flash && <Flash flash={flash} />}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="font-bold text-ink" style={{ direction: 'ltr', textAlign: 'left' }}>{code}</div>
          <div className="text-ink-2 text-xs">{session?.orderRef} · {session?.customerName || '—'} · {orderStateLabel(session?.state)}</div>
        </div>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => { setCode(''); setLabels(null); }}>رجوع</button>
      </div>

      {counters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Stat label="الطرود" value={`${counters.closed}/${counters.total}`} />
          <Stat label="مفتوحة" value={counters.open + counters.reopened} />
          <Stat label="بنودٌ لم تكتمل" value={counters.linesLeft} />
          <Stat label="كمّيّةٌ متبقّية" value={counters.qtyLeft} />
        </div>
      )}

      {!session?.parcelTotal && (
        <section className="o_ds_card o_ds_pad mb-4">
          <h3 className="font-bold text-ink mb-2">عدد الطرود النهائيّ</h3>
          <p className="text-ink-2 text-xs mb-3">يولّد النظام باركودًا مستقلًّا لكلّ طرد، وكلُّها ترتبط برقم الشحنة نفسه.</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <button key={n} type="button" className="btn btn-secondary" disabled={busy} onClick={() => applyParcelCount(n)}>{n}</button>
            ))}
          </div>
        </section>
      )}

      {session?.parcelTotal > 0 && (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            {(session.parcels ?? []).map((p) => (
              <button
                key={p.no}
                type="button"
                onClick={() => setParcelNo(p.no)}
                className={`btn text-sm ${parcelNo === p.no ? 'btn-primary' : 'btn-secondary'}`}
              >
                طرد {p.no} · {PARCEL_STATES[p.state]}
              </button>
            ))}
            <button type="button" className="btn btn-secondary text-sm" disabled={busy}
              onClick={() => applyParcelCount((session.parcelTotal || 0) + 1)}>+ طرد</button>
          </div>

          {card && (
            <section className="o_ds_card o_ds_pad mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <div className="font-bold text-ink" style={{ direction: 'ltr', textAlign: 'left' }}>{card.code}</div>
                  <div className="text-ink-2 text-xs">{card.ofTotal} · {card.stateLabel} · {card.qty} وحدة</div>
                  {card.lastReopen && (
                    <div className="text-ink-2 text-xs">أُعيد فتحه: {card.lastReopen.reason}</div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {card.state === 'CLOSED' ? (
                    <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={reopenCurrentParcel}>إعادة فتح</button>
                  ) : (
                    <button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={closeCurrentParcel}>إغلاق الطرد</button>
                  )}
                  <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={printLabel}>تقييد طباعة الملصق</button>
                  {card.state !== 'CANCELLED' && (
                    <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={cancelCurrentParcel}>إلغاء الطرد</button>
                  )}
                </div>
              </div>

              {card.state !== 'CLOSED' && card.state !== 'CANCELLED' && (
                <div className="grid sm:grid-cols-3 gap-2">
                  <input
                    ref={inputRef}
                    className="o_input sm:col-span-2"
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') packScanned(); }}
                    placeholder="امسح باركود الصنف…"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                  />
                  <input className="o_input" type="number" min="1" value={qty}
                    onChange={(e) => setQty(e.target.value)} placeholder="الكمّيّة" />
                  <div className="sm:col-span-3 flex gap-2 flex-wrap">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={packScanned}>إضافة إلى الطرد</button>
                    <ScanCameraButton camera={camera} />
                  </div>
                </div>
              )}
              <ScanCameraPanel camera={camera} />
            </section>
          )}

          <section className="mb-4">
            <h3 className="font-bold text-ink mb-2">بنودُ الطلب — المعبَّأ والمتبقّي</h3>
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={`${r.sku}-${r.batch}`} className="flex justify-between text-sm rounded border px-3 py-2" style={{ borderColor: 'var(--o-border)' }}>
                  <span>{r.sku} {r.description && <span className="text-ink-2">— {r.description}</span>}</span>
                  <span className="text-ink-2">{r.packed}/{r.qty} {r.uom}{r.remaining > 0 ? ` · بقي ${r.remaining}` : ' ✓'}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="o_form_actions mb-4">
            <button type="button" className="btn btn-secondary" onClick={previewLabels}>معاينة ملصقات العميل</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={finish}>إتمام التعبئة</button>
          </div>

          {labels && (
            <div id="bz-customer-labels" className="grid sm:grid-cols-2 gap-3">
              {labels.map((l) => <CustomerLabel key={l.barcodeValue} label={l} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** ملصق العميل — الحقول العشرة، والباركود `CODE128` مستضافٌ ذاتيًّا. */
function CustomerLabel({ label }) {
  const ref = useRef(null);
  const basePath = getBasePath();
  const gaps = labelGaps(label);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      try {
        if (!window.JsBarcode) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `${basePath}/lib/JsBarcode.all.min.js`;
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        if (cancelled || !ref.current || !window.JsBarcode) return;
        window.JsBarcode(ref.current, label.barcodeValue, { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 4 });
      } catch { /* الكود مطبوعٌ نصًّا */ }
    }
    draw();
    return () => { cancelled = true; };
  }, [label.barcodeValue, basePath]);

  return (
    <div className="rounded border px-4 py-3" style={{ borderColor: 'var(--o-border)' }}>
      <div className="font-bold text-ink text-lg">{label.customerName || '—'}</div>
      <div className="text-ink-2 text-xs">طلب {label.orderRef} · شحنة {label.shipment}</div>
      <div className="text-ink-2 text-xs">{label.destination} {label.route && `· خطّ ${label.route}`}</div>
      <div className="text-ink font-bold mt-2">{label.ofTotal}</div>
      <svg ref={ref} style={{ maxWidth: '100%' }} />
      <div style={{ fontSize: '11px', direction: 'ltr', color: 'var(--o-main-color-muted)' }}>{label.barcodeValue}</div>
      <div className="text-ink-2 text-xs mt-1">جُهّز: {label.preparedAt}</div>
      {label.instructions && <div className="text-ink text-xs mt-1">تعليمات: {label.instructions}</div>}
      {label.reprint && <div className="text-ink-2 text-xs">نسخة معاد طباعتها ({label.copy})</div>}
      {gaps.length > 0 && <div className="text-ink-2 text-xs mt-1">ينقص الملصق: {gaps.join(' · ')}</div>}
    </div>
  );
}

function Flash({ flash }) {
  return (
    <div
      className="rounded-lg px-4 py-3 mb-4 text-sm"
      style={{
        background: flash.kind === 'ok' ? 'var(--o-success-bg, #eaf6ee)' : 'var(--o-danger-bg, #fdeceb)',
        color: flash.kind === 'ok' ? 'var(--o-success, #1e7e34)' : 'var(--o-danger, #b52a1d)',
      }}
    >
      {flash.text}
    </div>
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
