/**
 * مركز الباركود ‹LPN-720› — توليدٌ وطباعةٌ وسجلٌّ وتدقيق في شاشةٍ واحدة.
 *
 * ═══ لماذا شاشةٌ واحدةٌ لكلّ الأنواع ═══
 * لأنّ الباركود **مفهومٌ واحد** وإن اختلفت أنواعه: يُولَّد ويُطبع ويُلصق
 * ويُتتبَّع. وشاشةٌ لكلّ نوعٍ تعني خمسَ شاشاتٍ متشابهة، وأربعةً منها لا يفتحها
 * أحد. والنصّ نفسه عدّ الأنواع في قائمةٍ واحدة تحت عنوانٍ واحد.
 *
 * ═══ والشاشة عرضٌ للحكم لا حَكَم ═══
 * كلُّ زرٍّ هنا يستدعي دالّةً خالصةً مختبَرة (`generateVerdict` · `buildLabelSheet`
 * · `entryCard`)، ولا شرطَ يُكتب في JSX. والصلاحية تُخفي ما لا يملكه الدور —
 * لا تتركه ظاهرًا ليُضغط ثمّ يُرفض.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { BARCODE_KINDS } from '../../../services/barcodes/barcodeCode.js';
import { ownsStructure } from '../../../services/barcodes/barcodeKinds.js';
import {
  BARCODE_STATUSES,
  entryCard,
  filterEntries,
  registryCounters,
  reprintSummary,
} from '../../../services/barcodes/barcodeRegistry.js';
import {
  listenBarcodes,
  recordPrint,
  registerBatch,
  setBarcodeStatus,
} from '../../../services/barcodes/barcodeService.js';
import {
  SERVICE_TYPES,
  SERVICE_TYPE_ORDER,
  buildServiceRange,
} from '../../../services/locations/serviceLocations.js';
import { formatVehicleCode, VEHICLE_TYPES } from '../../../services/barcodes/vehicleCode.js';
import { qualifierOf } from '../../../services/locations/qualifiedCode.js';
import {
  LABEL_SIZES,
  MAX_SHEET_LABELS,
  SELECTION_MODES,
  buildLabelSheet,
  pickSelection,
  reprintSheetProblem,
} from '../../../services/barcodes/labelSheet.js';

/** التبويبات الثلاثة — توليدٌ وسجلٌّ وطباعة. */
const TABS = [
  { id: 'generate', labelAr: 'توليد الباركود', structureOnly: true },
  { id: 'registry', labelAr: 'السجلّ والتدقيق', structureOnly: false },
  { id: 'print', labelAr: 'ورقة الملصقات', structureOnly: false },
];

/** أنواعُ التوليد المتاحة في الشاشة — بنيةٌ كلُّها (التشغيليّ يولد في مساره). */
const GENERATORS = [
  ...SERVICE_TYPE_ORDER.map((id) => ({ id, ...SERVICE_TYPES[id], family: 'service' })),
  { id: 'VEHICLE', kind: BARCODE_KINDS.VEHICLE.id, labelAr: 'مركبة', family: 'vehicle', hint: 'هويّةٌ ثابتةٌ تُلصق داخل السيارة — تُمسح ولا تُختار.' },
];

export default function BarcodeCenter() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('registry');
  const [entries, setEntries] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  // ── التوليد ──
  const [gen, setGen] = useState({ type: 'DOCK_IN', warehouse: '', from: 1, to: 1, reason: '', vehicleType: 'TRK', branch: '' });
  const [preview, setPreview] = useState([]);

  // ── السجلّ ──
  const [filters, setFilters] = useState({ kind: '', status: '', term: '' });

  // ── الطباعة ──
  const [sheetPick, setSheetPick] = useState({ mode: 'all', from: '', to: '', code: '' });
  const [sheetSize, setSheetSize] = useState('');
  const [sheet, setSheet] = useState(null);

  const role = me?.role || '';
  const actor = me?.uid || me?.id || '';
  const actorName = me?.name || me?.displayName || me?.email || '';
  const canStructure = ownsStructure(role);

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(() => listenBarcodes(setEntries, { onError: () => setEntries([]) }), []);
  useEffect(() => subscribeWarehouses(setWarehouses, () => setWarehouses([])), []);

  const say = useCallback((kind, text) => {
    setFlash({ kind, text });
    if (typeof window !== 'undefined') window.clearTimeout(say._t);
    say._t = typeof window !== 'undefined' ? window.setTimeout(() => setFlash(null), 6000) : null;
  }, []);

  const cards = useMemo(
    () => filterEntries(entries, filters).map(entryCard).filter(Boolean),
    [entries, filters]
  );
  const counters = useMemo(() => registryCounters(entries), [entries]);
  const reprints = useMemo(() => reprintSummary(entries), [entries]);
  const qualifier = useMemo(() => {
    const wh = warehouses.find((w) => String(w?.code ?? '').toUpperCase() === String(gen.warehouse).toUpperCase());
    return qualifierOf(wh);
  }, [warehouses, gen.warehouse]);

  /* ═══════════ التوليد ═══════════ */

  function buildPreview() {
    const g = GENERATORS.find((x) => x.id === gen.type);
    if (!g) return;
    if (g.family === 'vehicle') {
      const codes = [];
      for (let i = Number(gen.from) || 1; i <= (Number(gen.to) || 1); i += 1) {
        const code = formatVehicleCode({ branch: gen.branch, vehicleType: gen.vehicleType, seq: i });
        if (!code) { say('err', 'راجع الفرع والنوع والتسلسل — الهويّة لا تُبنى عرجاء.'); setPreview([]); return; }
        codes.push(code);
      }
      setPreview(codes);
      return;
    }
    const out = buildServiceRange({ warehouse: gen.warehouse, type: gen.type, from: gen.from, to: gen.to });
    if (out.problem) { say('err', out.problem); setPreview([]); return; }
    setPreview(out.codes);
  }

  async function commitPreview() {
    if (!preview.length) { say('err', 'عاين الأكواد قبل اعتمادها.'); return; }
    if (!String(gen.reason).trim()) { say('err', 'اكتب سبب الإنشاء — باركود البنية يبقى في المبنى سنين.'); return; }
    setBusy(true);
    try {
      const kind = GENERATORS.find((x) => x.id === gen.type)?.kind ?? SERVICE_TYPES[gen.type]?.kind;
      const out = await registerBatch(
        preview.map((value) => ({ value, kind })),
        { role, actor, actorName, reason: gen.reason, warehouse: gen.warehouse }
      );
      setPreview([]);
      if (out.failed.length) {
        say('err', `سُجّل ${out.ok.length} · وتعذّر ${out.failed.length}: ${out.failed[0].problem}`);
      } else {
        say('ok', `سُجّل ${out.ok.length} باركودًا في السجلّ — اطبع ملصقاتها من تبويب الطباعة.`);
      }
    } catch (e) {
      say('err', e?.message || 'تعذّر التسجيل.');
    } finally { setBusy(false); }
  }

  /* ═══════════ السجلّ ═══════════ */

  async function doReprint(card) {
    const reason = typeof window !== 'undefined' ? window.prompt(`سبب إعادة طباعة «${card.value}» (إلزاميّ):`) : '';
    if (!reason) return;
    setBusy(true);
    try {
      await recordPrint(card.value, { actor, actorName, reason, role });
      say('ok', `سُجّلت النسخة ${card.printCount + 1} — والسبب في السجلّ.`);
    } catch (e) {
      say('err', e?.message || 'تعذّرت إعادة الطباعة.');
    } finally { setBusy(false); }
  }

  async function doStatus(card, next) {
    const needsReason = next === 'VOID' || next === 'DAMAGED';
    const reason = needsReason && typeof window !== 'undefined'
      ? window.prompt(`سبب «${BARCODE_STATUSES[next].labelAr}» لـ«${card.value}» (إلزاميّ):`)
      : '';
    if (needsReason && !reason) return;
    setBusy(true);
    try {
      await setBarcodeStatus(card.value, next, { actor, reason, role });
      say('ok', `صار «${card.value}» ${BARCODE_STATUSES[next].labelAr}.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر تغيير الحالة.');
    } finally { setBusy(false); }
  }

  /* ═══════════ الطباعة ═══════════ */

  function buildSheet() {
    const pool = cards.map((c) => c.value);
    const picked = pickSelection(pool, sheetPick);
    if (picked.problem) { say('err', picked.problem); setSheet(null); return; }
    const records = Object.fromEntries(cards.map((c) => [c.value, c]));
    const out = buildLabelSheet({ codes: picked.codes, records, size: sheetSize, qualifier });
    if (out.problem) say('err', out.problem);
    setSheet(out);
  }

  async function markSheetPrinted() {
    if (!sheet?.labels?.length) return;
    const codes = [...new Set(sheet.labels.map((l) => l.code))];
    const anyPrinted = codes.some((c) => (cards.find((x) => x.value === c)?.printCount ?? 0) > 0);
    let reason = '';
    if (anyPrinted) {
      reason = typeof window !== 'undefined' ? window.prompt('بعض الملصقات طُبعت سلفًا — اكتب سبب إعادة الطباعة:') : '';
      const problem = reprintSheetProblem({ codes, reason });
      if (problem) { say('err', problem); return; }
    }
    setBusy(true);
    let ok = 0;
    for (const code of codes) {
      try {
        await recordPrint(code, { actor, actorName, reason, role });
        ok += 1;
      } catch { /* يُعلَن في الحصيلة */ }
    }
    setBusy(false);
    say(ok === codes.length ? 'ok' : 'err', `قُيّدت طباعة ${ok} من ${codes.length} في السجلّ.`);
  }

  const visibleTabs = TABS.filter((t) => !t.structureOnly || canStructure);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : 'registry';

  return (
    <div className="o_theme" dir="rtl">
      {flash && (
        <div
          className="rounded-lg px-4 py-3 mb-4 text-sm"
          style={{
            background: flash.kind === 'ok' ? 'var(--o-success-bg, #eaf6ee)' : 'var(--o-danger-bg, #fdeceb)',
            color: flash.kind === 'ok' ? 'var(--o-success, #1e7e34)' : 'var(--o-danger, #b52a1d)',
          }}
        >
          {flash.text}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Stat label="في السجلّ" value={counters.total} />
        <Stat label="باركود بنية" value={counters.structure} />
        <Stat label="باركود تشغيل" value={counters.operation} />
        <Stat label="لم يُطبع بعد" value={counters.neverPrinted} hint="باركودٌ لم يُطبع = ملصقٌ ليس على الحديد." />
      </div>

      <nav className="flex gap-2 mb-5 flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`btn text-sm ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t.labelAr}
          </button>
        ))}
      </nav>

      {activeTab === 'generate' && (
        <GeneratePanel
          gen={gen}
          setGen={setGen}
          warehouses={warehouses}
          preview={preview}
          qualifier={qualifier}
          busy={busy}
          onPreview={buildPreview}
          onCommit={commitPreview}
          onClear={() => setPreview([])}
        />
      )}

      {activeTab === 'registry' && (
        <RegistryPanel
          cards={cards}
          filters={filters}
          setFilters={setFilters}
          reprints={reprints}
          canStructure={canStructure}
          busy={busy}
          onReprint={doReprint}
          onStatus={doStatus}
        />
      )}

      {activeTab === 'print' && (
        <PrintPanel
          cards={cards}
          pick={sheetPick}
          setPick={setSheetPick}
          size={sheetSize}
          setSize={setSheetSize}
          sheet={sheet}
          busy={busy}
          onBuild={buildSheet}
          onPrinted={markSheetPrinted}
        />
      )}
    </div>
  );
}

/* ═══════════════ لوحاتٌ فرعيّة ═══════════════ */

function GeneratePanel({ gen, setGen, warehouses, preview, qualifier, busy, onPreview, onCommit, onClear }) {
  const g = GENERATORS.find((x) => x.id === gen.type);
  const isVehicle = g?.family === 'vehicle';

  return (
    <section className="o_ds_card o_ds_pad">
      <h2 className="text-base font-bold text-ink mb-1">توليد باركودات البنية</h2>
      <p className="text-ink-2 text-xs mb-4">{g?.hint}</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Field label="النوع">
          <select className="o_input w-full" value={gen.type} onChange={(e) => { setGen({ ...gen, type: e.target.value }); onClear(); }}>
            {GENERATORS.map((x) => <option key={x.id} value={x.id}>{x.labelAr}</option>)}
          </select>
        </Field>

        {isVehicle ? (
          <>
            <Field label="الفرع">
              <input className="o_input w-full" value={gen.branch} onChange={(e) => setGen({ ...gen, branch: e.target.value })} placeholder="RH" />
            </Field>
            <Field label="نوع المركبة">
              <select className="o_input w-full" value={gen.vehicleType} onChange={(e) => setGen({ ...gen, vehicleType: e.target.value })}>
                {Object.entries(VEHICLE_TYPES).map(([id, labelAr]) => <option key={id} value={id}>{labelAr}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <Field label="المستودع">
            <select className="o_input w-full" value={gen.warehouse} onChange={(e) => { setGen({ ...gen, warehouse: e.target.value }); onClear(); }}>
              <option value="">— اختر —</option>
              {warehouses.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name || w.nameAr || ''}</option>)}
            </select>
          </Field>
        )}

        <Field label="من رقم">
          <input type="number" min="1" className="o_input w-full" value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} />
        </Field>
        <Field label="إلى رقم">
          <input type="number" min="1" className="o_input w-full" value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} />
        </Field>
      </div>

      <Field label="سبب الإنشاء (إلزاميّ — يُقرأ بعد سنة)">
        <input
          className="o_input w-full"
          value={gen.reason}
          onChange={(e) => setGen({ ...gen, reason: e.target.value })}
          placeholder="افتتاح الرصيف الشماليّ · إضافة مركبةٍ جديدة…"
        />
      </Field>

      <div className="o_form_actions mt-4">
        <button type="button" className="btn btn-secondary" onClick={onPreview} disabled={busy}>معاينة الأكواد</button>
        <button type="button" className="btn btn-primary" onClick={onCommit} disabled={busy || !preview.length}>
          اعتماد وتسجيل ({preview.length})
        </button>
      </div>

      {preview.length > 0 && (
        <div className="mt-4">
          <div className="text-ink-2 text-xs mb-2">
            المعاينة — الكود القانونيّ، وبين قوسين ما يُطبع على الملصق:
          </div>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {preview.map((code) => (
              <li key={code} className="rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--o-border)', direction: 'ltr', textAlign: 'left' }}>
                <div className="font-bold">{code}</div>
                {!isVehicle && (
                  <div className="text-xs" style={{ color: 'var(--o-main-color-muted)' }}>
                    {[qualifier.company, qualifier.branch, code].filter(Boolean).join('-')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RegistryPanel({ cards, filters, setFilters, reprints, canStructure, busy, onReprint, onStatus }) {
  return (
    <section>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Field label="النوع">
          <select className="o_input w-full" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
            <option value="">كلّ الأنواع</option>
            {Object.values(BARCODE_KINDS).filter((k) => k.example).map((k) => (
              <option key={k.id} value={k.id}>{k.labelAr}</option>
            ))}
          </select>
        </Field>
        <Field label="الحالة">
          <select className="o_input w-full" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">كلّ الحالات</option>
            {Object.values(BARCODE_STATUSES).map((s) => <option key={s.id} value={s.id}>{s.labelAr}</option>)}
          </select>
        </Field>
        <Field label="بحث بالقيمة أو المستند">
          <input className="o_input w-full" value={filters.term} onChange={(e) => setFilters({ ...filters, term: e.target.value })} placeholder="W01-DOCK · GRN-2026…" />
        </Field>
      </div>

      {reprints.values > 0 && (
        <p className="text-ink-2 text-xs mb-3">
          إعادات الطباعة: {reprints.values} باركودًا بنسخٍ زائدة ({reprints.extraCopies} نسخة) — وكلُّ نسخةٍ زائدةٍ ملصقٌ ثانٍ في الميدان.
        </p>
      )}

      {cards.length === 0 ? (
        <p className="text-ink-2 text-sm">لا قيدَ يطابق التصفية.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.value} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--o-border)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-ink" style={{ direction: 'ltr', textAlign: 'left' }}>{c.value}</div>
                  <div className="text-ink-2 text-xs mt-1">
                    {c.kindLabel} · {c.classLabel} · {c.statusLabel}
                    {c.printCount > 0 && <span> · طُبع {c.printCount} مرّة</span>}
                  </div>
                  <div className="text-ink-2 text-xs">{c.origin}</div>
                  {c.reason && <div className="text-ink-2 text-xs">السبب: {c.reason}</div>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={() => onReprint(c)}>
                    إعادة طباعة
                  </button>
                  {canStructure && !c.terminal && (
                    <>
                      <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={() => onStatus(c, 'DAMAGED')}>
                        ملصقٌ تالف
                      </button>
                      <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={() => onStatus(c, 'VOID')}>
                        إلغاء
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PrintPanel({ cards, pick, setPick, size, setSize, sheet, busy, onBuild, onPrinted }) {
  return (
    <section>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Field label="ما يُطبع">
          <select className="o_input w-full" value={pick.mode} onChange={(e) => setPick({ ...pick, mode: e.target.value })}>
            {Object.values(SELECTION_MODES).map((m) => <option key={m.id} value={m.id}>{m.labelAr}</option>)}
          </select>
        </Field>
        {pick.mode === 'one' && (
          <Field label="الكود">
            <input className="o_input w-full" value={pick.code} onChange={(e) => setPick({ ...pick, code: e.target.value })} />
          </Field>
        )}
        {pick.mode === 'range' && (
          <>
            <Field label="من"><input className="o_input w-full" value={pick.from} onChange={(e) => setPick({ ...pick, from: e.target.value })} /></Field>
            <Field label="إلى"><input className="o_input w-full" value={pick.to} onChange={(e) => setPick({ ...pick, to: e.target.value })} /></Field>
          </>
        )}
        <Field label="مقاس الملصق">
          <select className="o_input w-full" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">مقترَحٌ حسب النوع</option>
            {Object.values(LABEL_SIZES).map((s) => <option key={s.id} value={s.id}>{s.labelAr}</option>)}
          </select>
        </Field>
      </div>

      <p className="text-ink-2 text-xs mb-3">
        المعروض الآن {cards.length} باركودًا (بحسب تصفية السجلّ) — والورقة الواحدة تحمل {MAX_SHEET_LABELS} ملصقًا كحدٍّ أقصى.
      </p>

      <div className="o_form_actions mb-4">
        <button type="button" className="btn btn-secondary" onClick={onBuild} disabled={busy}>بناء الورقة</button>
        {sheet?.labels?.length > 0 && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>طباعة</button>
            <button type="button" className="btn btn-secondary" onClick={onPrinted} disabled={busy}>تقييد الطباعة في السجلّ</button>
          </>
        )}
      </div>

      {sheet?.problem && <p className="text-ink-2 text-xs mb-3">{sheet.problem}</p>}

      {sheet?.labels?.length > 0 && (
        <div id="bz-label-sheet" className="grid gap-3" style={{ gridTemplateColumns: `repeat(${sheet.perRow || 2}, minmax(0, 1fr))` }}>
          {sheet.labels.map((label, i) => <LabelCard key={`${label.code}-${label.copy}-${i}`} label={label} size={sheet.size} />)}
        </div>
      )}
    </section>
  );
}

/**
 * ملصقٌ واحد — `CODE128` بالمكتبة المستضافة ذاتيًّا (نمط `LocationTree` و`DocumentPrint`).
 * والكود مطبوعٌ نصًّا تحته: إن تعذّر تحميل المكتبة يبقى مقروءًا بالعين.
 */
function LabelCard({ label, size }) {
  const ref = useRef(null);
  const basePath = getBasePath();

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      try {
        if (!window.JsBarcode) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `${basePath}/lib/JsBarcode.all.min.js`;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        if (cancelled || !ref.current || !window.JsBarcode) return;
        window.JsBarcode(ref.current, label.barcodeValue, {
          format: 'CODE128', width: 2, height: 48, displayValue: false, margin: 4,
        });
      } catch { /* الكود مطبوعٌ نصًّا على أيّ حال */ }
    }
    draw();
    return () => { cancelled = true; };
  }, [label.barcodeValue, basePath]);

  return (
    <div
      className="rounded border text-center"
      style={{ borderColor: 'var(--o-border)', padding: '10px', minHeight: `${Math.min(size?.heightMm ?? 50, 90)}mm` }}
    >
      <div style={{ fontSize: '15px', fontWeight: 800, direction: 'ltr', letterSpacing: '.5px' }}>{label.headline}</div>
      <svg ref={ref} style={{ maxWidth: '100%' }} />
      <div style={{ fontSize: '11px', direction: 'ltr', color: 'var(--o-main-color-muted)' }}>{label.barcodeValue}</div>
      {label.subline && <div style={{ fontSize: '12px', marginTop: '2px' }}>{label.subline}</div>}
      {label.lines.map((l) => (
        <div key={l} style={{ fontSize: '11px', color: 'var(--o-main-color-muted)' }}>{l}</div>
      ))}
      {label.reprint && <div style={{ fontSize: '10px', marginTop: '2px' }}>نسخة معاد طباعتها ({label.copy})</div>}
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

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--o-border)' }} title={hint || ''}>
      <div className="text-ink-2 text-xs">{label}</div>
      <div className="text-ink font-bold text-lg">{value}</div>
    </div>
  );
}
