/**
 * العمليات المخزنية — شاشةٌ واحدة: امسح فتُعبَّأ، وجدولك تحت يدك (SAP-19).
 *
 * ═══ منطق التنفيذ (تصحيح 2026-08-13 بعد ملاحظة المالك) ═══
 * لا صفحةَ فوق صفحة: **شاشةٌ واحدة ومصدرُ حقيقةٍ واحد.**
 *   · المسح ثلاث خطوات: الوضع ⇒ المسح ⇒ خانة التعبئة ⇒ حفظ.
 *   · الجدول يُشتقّ من قيود العملية السحابيّة الملحقة-فقط مباشرةً — فجهازان
 *     على العمليّة نفسها يريان جدولًا واحدًا حيًّا بلا منطق توفيقٍ خاصّ
 *     (هذا ما احتاج في الأداة القديمة مئات الأسطر).
 *   · الكمّيّة الدفتريّة من **الماستر السحابيّ** لا من استيراد شيتٍ ثانٍ:
 *     الشيت يُستورد مرّةً في شاشة الأصناف، والجرد يقارن بالماستر.
 *   · التصحيح والحذف **قيودُ فرقٍ** لا تعديل — التاريخ كامل: من عدّ ومن
 *     صحّح وبكم (نفس مبدأ دفتر الحركات).
 *
 * ═══ ولماذا لا تتجمّد؟ ═══
 * القديم فكّ الباركود على المعالج إطارًا إطارًا. هنا `BarcodeDetector`
 * العتاديّ (فحصٌ كلّ ٣٠٠م.ث) ولا فكّ برمجيّ — ومن لا دعم عنده (آيفون)
 * يمسح بلوحة المفاتيح أو يكتب.
 *
 * كلّ الحكم في `scanFlow.js` الخالص المُختبَر؛ هذه الشاشة عرضٌ له.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { lookupByBarcode, subscribeItems } from '../../../services/itemService.js';
import { registerPending } from '../../../services/items/pendingService.js';
import { buildItemIndexes } from '../../../services/items/uomWiring.js';
import {
  createOperation,
  appendScan,
  closeOperation,
  getOperation,
  listenScans,
  updateOperationSummary,
} from '../../../services/stock/operationsService.js';
import {
  SCAN_MODES,
  panelForScan,
  scanEntryVerdict,
  sessionSummary,
  aggregateSession,
  correctionEntry,
  exportRows,
} from '../../../services/stock/scanFlow.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';
import { int, num } from '../../odoo/format.js';

const OP_KEY = 'bzCloudOpId'; // مفتاح استئنافٍ واحد للجهاز — عمليةٌ واحدة لا تنقسم

export default function ScanFlow() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('');
  const [opId, setOpId] = useState(null);
  const [scans, setScans] = useState([]);
  const [items, setItems] = useState([]);
  const [panel, setPanel] = useState(null); // خانة التعبئة بعد المسح
  const [panelItem, setPanelItem] = useState(null);
  const [qty, setQty] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraErr, setCameraErr] = useState('');
  const [tableFilter, setTableFilter] = useState('all'); // all | diff | unknown
  const [joinCode, setJoinCode] = useState('');

  const scanInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStopRef = useRef(null);

  const supportsCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
    });
    return () => unsub();
  }, []);

  // الماستر السحابيّ — مصدر الاسم والكمّيّة الدفتريّة (لا استيراد شيتٍ ثانٍ).
  useEffect(() => subscribeItems(setItems, () => setItems([])), []);
  const itemIndexes = useMemo(() => buildItemIndexes(items), [items]);

  // استئناف عمليةٍ مفتوحة محفوظة — العمل الواحد لا ينقسم بين عمليتين.
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(OP_KEY) : null;
    if (!saved) return;
    getOperation(saved)
      .then((op) => {
        if (op && op.status === 'open') {
          setOpId(saved);
          if (op.type) setMode(op.type);
        } else {
          localStorage.removeItem(OP_KEY);
        }
      })
      .catch(() => {});
  }, []);

  // قيود العملية الحيّة — الجدول كلّه يُشتقّ منها، فكلّ جهازٍ يرى عمل البقيّة.
  useEffect(() => {
    if (!opId) {
      setScans([]);
      return undefined;
    }
    return listenScans(opId, setScans);
  }, [opId]);

  // إيقاف الكاميرا عند مغادرة الصفحة — لا تسريب تدفّق فيديو.
  useEffect(() => () => cameraStopRef.current?.(), []);

  const summary = useMemo(() => sessionSummary(scans), [scans]);
  const rows = useMemo(() => aggregateSession(scans, itemIndexes.byBarcode), [scans, itemIndexes]);
  const diffRows = useMemo(() => rows.filter((r) => r.diff !== null && r.diff !== 0), [rows]);
  const unknownRows = useMemo(() => rows.filter((r) => !r.known), [rows]);
  const shownRows = tableFilter === 'diff' ? diffRows : tableFilter === 'unknown' ? unknownRows : rows;

  function flash(kind, text) {
    setNote({ kind, text });
    setTimeout(() => setNote(null), 3500);
  }

  async function ensureOperation(forMode) {
    if (opId) return opId;
    const id = await createOperation({ type: forMode, profile: me });
    localStorage.setItem(OP_KEY, id);
    setOpId(id);
    return id;
  }

  /** المسح اكتمل (كاميرا أو لوحة مفاتيح): يسأل الماستر ويفتح خانة التعبئة. */
  async function handleCode(raw) {
    const code = String(raw ?? '').trim();
    if (!code) return;
    if (!mode) {
      flash('err', 'اختر الوضع أوّلًا: جرد أو استلام أو صرف.');
      return;
    }
    let item = null;
    try {
      item = await lookupByBarcode(code);
    } catch {
      // شبكة/صلاحية — نُكمل كمجهول ولا نوقف العمل.
    }
    setPanel(panelForScan(code, item));
    setPanelItem(item);
    setQty('');
    setNewName('');
    if (scanInputRef.current) scanInputRef.current.value = '';
    // التركيز حيث الفراغ: المعروف ينقص كمّيّته، والمجهول ينقص اسمه.
    setTimeout(() => (item ? qtyInputRef.current : nameInputRef.current)?.focus(), 50);
  }

  /** حفظ القيد: الحكم في scanFlow، والكتابة قيدُ appendScan الملحق-فقط نفسه. */
  async function save() {
    if (!panel || busy) return;
    const verdict = scanEntryVerdict({
      mode,
      barcode: panel.barcode,
      qty,
      name: newName,
      item: panelItem,
    });
    if (!verdict.ok) {
      flash('err', verdict.problems.join(' · '));
      return;
    }
    setBusy(true);
    try {
      const id = await ensureOperation(mode);
      await appendScan(id, { ...verdict.entry, profile: me });
      // المجهول يدخل قائمة الاعتماد القائمة (I-د) باسمه الذي سمّاه الموظّف.
      if (!panelItem) {
        registerPending(
          { barcode: panel.barcode, name: verdict.entry.name, qty: verdict.entry.qty, operationType: mode },
          me
        ).catch(() => {});
      }
      const s = sessionSummary([...scans, verdict.entry]);
      updateOperationSummary(id, { itemCount: s.itemCount, scannedCount: s.scanCount }).catch(() => {});
      flash('ok', `حُفظ: ${verdict.entry.name} × ${num(verdict.entry.qty)}`);
      setPanel(null);
      setPanelItem(null);
      setQty('');
      setNewName('');
      setTimeout(() => scanInputRef.current?.focus(), 50);
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر الحفظ — أعد المحاولة، لا يضيع مسحٌ محفوظ.');
    } finally {
      setBusy(false);
    }
  }

  /** تصحيح كمّيّة صفّ (أو حذفه بكمّيّة ٠): قيدُ فرقٍ في الدفتر لا تعديل. */
  async function correctRow(row, targetQty) {
    const verdict = correctionEntry(row, targetQty, mode || 'جرد');
    if (!verdict.ok) {
      flash('err', verdict.problems.join(' · '));
      return;
    }
    try {
      const id = await ensureOperation(mode || 'جرد');
      await appendScan(id, { ...verdict.entry, profile: me });
      flash('ok', `صُحّح ${row.name || row.barcode}: قيد فرق ${num(verdict.entry.qty)}`);
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر التصحيح');
    }
  }

  function askCorrection(row) {
    const raw = window.prompt(`الكمّيّة الصحيحة لـ«${row.name || row.barcode}»؟ (المعدود الآن ${num(row.countedQty)})`, String(row.countedQty));
    if (raw === null) return;
    correctRow(row, raw);
  }

  function askRemoval(row) {
    if (!window.confirm(`حذف «${row.name || row.barcode}» من الجلسة؟ يُكتب قيدُ عكسٍ (−${num(row.countedQty)}) ويبقى الأثر.`)) return;
    correctRow(row, 0);
  }

  /** تصدير إكسل — نفس قدرة الأداة القديمة، من نفس الجدول الظاهر. */
  async function exportExcel() {
    if (!rows.length) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportRows(shownRows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الجلسة');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Stock_${mode || 'Session'}_${stamp}.xlsx`);
  }

  /** الانضمام لعمليةٍ قائمة برمزها — العمل الجماعيّ: دفترٌ واحد لكلّ الأجهزة. */
  async function joinByCode() {
    const code = joinCode.trim();
    if (!code) return;
    try {
      const op = await getOperation(code);
      if (!op || op.status !== 'open') {
        flash('err', 'لا عملية مفتوحة بهذا الرمز.');
        return;
      }
      localStorage.setItem(OP_KEY, code);
      setOpId(code);
      if (op.type) setMode(op.type);
      setJoinCode('');
      flash('ok', 'انضممت — الجدول أدناه دفتر العملية المشترك.');
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر الانضمام');
    }
  }

  async function finishOperation() {
    if (!opId) return;
    const ok = window.confirm(`إنهاء العملية؟ (${int(summary.scanCount)} قيدًا · ${int(summary.itemCount)} صنفًا)`);
    if (!ok) return;
    try {
      await closeOperation(opId);
      localStorage.removeItem(OP_KEY);
      setOpId(null);
      setPanel(null);
      flash('ok', 'أُقفلت العملية — عملٌ جديد يبدأ عمليةً جديدة.');
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر الإقفال');
    }
  }

  /** كاميرا عتاديّة فقط — فحصٌ كلّ ٣٠٠م.ث، ولا فكّ على المعالج (سبب تجمّد القديم). */
  async function startCamera() {
    setCameraErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraOn(true);
      await new Promise((r) => setTimeout(r, 60));
      const video = videoRef.current;
      if (!video) throw new Error('تعذّر فتح العرض');
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
      });
      const timer = setInterval(async () => {
        try {
          const found = await detector.detect(video);
          if (found?.length) {
            const value = found[0].rawValue;
            stop();
            handleCode(value);
          }
        } catch {
          /* إطارٌ لم يكتمل — نحاول في النبضة التالية */
        }
      }, 300);
      const stop = () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        setCameraOn(false);
        cameraStopRef.current = null;
      };
      cameraStopRef.current = stop;
    } catch (e) {
      setCameraOn(false);
      setCameraErr(
        e?.name === 'NotAllowedError'
          ? 'أذن الكاميرا مرفوض — فعّله من إعدادات المتصفّح، أو امسح بلوحة المفاتيح.'
          : 'تعذّر فتح الكاميرا — امسح بلوحة المفاتيح أو اكتب الباركود.'
      );
    }
  }

  return (
    <div className="o_theme" dir="rtl" style={{ maxWidth: '760px', margin: '0 auto' }}>
      {note && <div className={`o_alert ${note.kind === 'err' ? 'danger' : 'success'}`}>{note.text}</div>}

      {/* ١ — الوضع */}
      <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)' }}>
        ١ — اختر الوضع:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {SCAN_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={mode === m.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '14px 8px', minHeight: '76px' }}
            title={m.hint}
          >
            <Icon name={m.icon} size={22} />
            <span style={{ fontWeight: 'var(--o-font-weight-bold)' }}>{m.label}</span>
          </button>
        ))}
      </div>

      {/* ٢ — المسح */}
      <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)' }}>
        ٢ — امسح الباركود أو اكتبه ثم Enter:
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          ref={scanInputRef}
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          placeholder="الباركود…"
          aria-label="حقل المسح"
          className="o_input"
          disabled={!mode}
          style={{ flex: 1, fontSize: '18px', padding: '12px', direction: 'ltr', textAlign: 'center', fontFamily: 'monospace' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCode(e.currentTarget.value);
            }
          }}
        />
        {supportsCamera && !cameraOn && (
          <button type="button" className="btn btn-secondary" onClick={startCamera} disabled={!mode} title="مسح بالكاميرا">
            <Icon name="target" size={20} />
          </button>
        )}
      </div>
      {!mode && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>اختر الوضع أوّلًا ليُفتح المسح.</p>
      )}
      {!supportsCamera && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
          على آيفون: اضغط داخل الحقل واستخدم زرّ مسح النصوص في لوحة المفاتيح — يكتب الباركود مباشرةً.
        </p>
      )}
      {cameraErr && <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-text-warning, #8a6d1b)' }}>{cameraErr}</p>}

      {cameraOn && (
        <div style={{ position: 'relative', marginBottom: '12px', borderRadius: 'var(--o-border-radius-lg)', overflow: 'hidden', border: '1px solid var(--o-border-color)' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block' }} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => cameraStopRef.current?.()}
            style={{ position: 'absolute', top: '8px', insetInlineEnd: '8px' }}
          >
            <Icon name="close" size={14} /> إيقاف
          </button>
        </div>
      )}

      {/* ٣ — خانة التعبئة */}
      {panel && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', borderInlineStart: '4px solid var(--o-brand-primary, #714B67)' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
            ٣ — خانة التعبئة
            <span style={{ marginInlineStart: '8px', fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' }}>{panel.barcode}</span>
          </p>

          {panel.known ? (
            <p style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 'var(--o-font-weight-bold)' }}>
              {panel.name}
              <span style={{ marginInlineStart: '8px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', fontFamily: 'monospace' }}>
                {panel.sku}
              </span>
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-text-warning, #8a6d1b)', fontWeight: 'var(--o-font-weight-bold)' }}>
                غير معرّف في الماستر — سمِّه ليُحفظ ويُعرض على المدير للاعتماد:
              </p>
              <input
                ref={nameInputRef}
                type="text"
                className="o_input"
                placeholder="اسم الصنف…"
                aria-label="اسم الصنف الجديد"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ marginBottom: '10px', fontSize: '16px', padding: '10px' }}
              />
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              ref={qtyInputRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="o_input"
              placeholder="الكمّيّة"
              aria-label="الكمّيّة"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
              style={{ flex: 1, fontSize: '20px', padding: '12px', textAlign: 'center' }}
            />
            {panel.unitLabel && (
              <span style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', whiteSpace: 'nowrap' }}>
                {panel.unitLabel}
              </span>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy} style={{ padding: '12px 22px', fontSize: '16px' }}>
              {busy ? 'جارٍ…' : 'حفظ'}
            </button>
          </div>

          <button
            type="button"
            className="btn btn-link btn-sm"
            onClick={() => { setPanel(null); setPanelItem(null); setTimeout(() => scanInputRef.current?.focus(), 50); }}
            style={{ marginTop: '6px', padding: 0 }}
          >
            إلغاء هذا المسح
          </button>
        </div>
      )}

      {/* جدول الجلسة — مشتقٌّ من دفتر العملية الملحق-فقط، حيًّا لكلّ الأجهزة */}
      {opId ? (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
              الجلسة الجارية — {int(summary.scanCount)} قيدًا · {int(rows.length)} صنفًا · إجمالي {num(summary.totalQty)}
            </p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportExcel} disabled={!rows.length}>
                <Icon name="fileUp" size={14} /> تصدير إكسل
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={finishOperation}>
                <Icon name="checkCircle" size={14} /> إنهاء العملية
              </button>
            </div>
          </div>

          {/* مرشّحات الجدول — الكلّ / الفروقات / غير المعرّف */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {[
              { id: 'all', label: `الكلّ (${int(rows.length)})` },
              { id: 'diff', label: `الفروقات (${int(diffRows.length)})` },
              { id: 'unknown', label: `غير معرّف (${int(unknownRows.length)})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={tableFilter === f.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setTableFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {shownRows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
              لا صفوف بعد — امسح أوّل باركود.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)' }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--o-main-color-muted)' }}>
                    <th style={{ padding: '4px 6px' }}>الصنف</th>
                    <th style={{ padding: '4px 6px' }}>الدفتريّ</th>
                    <th style={{ padding: '4px 6px' }}>المعدود</th>
                    <th style={{ padding: '4px 6px' }}>الفرق</th>
                    <th style={{ padding: '4px 6px' }} aria-label="إجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r) => (
                    <tr key={r.barcode} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                      <td style={{ padding: '6px' }}>
                        <div style={{ fontWeight: 'var(--o-font-weight-bold)' }}>
                          {r.name || '—'}
                          {!r.known && (
                            <span style={{ marginInlineStart: '6px', fontSize: '10px', color: 'var(--o-text-warning, #8a6d1b)' }}>
                              بانتظار الاعتماد
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'right', color: 'var(--o-main-color-muted)', fontSize: '10px' }}>
                          {r.barcode}
                        </div>
                      </td>
                      <td style={{ padding: '6px', fontVariantNumeric: 'tabular-nums' }}>{r.bookQty === null ? '—' : num(r.bookQty)}</td>
                      <td style={{ padding: '6px', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--o-font-weight-bold)' }}>{num(r.countedQty)}</td>
                      <td
                        style={{
                          padding: '6px',
                          fontVariantNumeric: 'tabular-nums',
                          color: r.diff === null || r.diff === 0 ? 'var(--o-main-color-muted)' : 'var(--o-text-danger, #b3261e)',
                          fontWeight: r.diff ? 'var(--o-font-weight-bold)' : undefined,
                        }}
                      >
                        {r.diff === null ? '—' : num(r.diff)}
                      </td>
                      <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-link btn-sm" style={{ padding: '2px 6px' }} onClick={() => askCorrection(r)}>
                          تصحيح
                        </button>
                        <button type="button" className="btn btn-link btn-sm" style={{ padding: '2px 6px' }} onClick={() => askRemoval(r)}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: '8px 0 0', fontSize: '10px', color: 'var(--o-main-color-muted)' }}>
            الدفتريّ من ماستر الأصناف · التصحيح والحذف قيودُ فرقٍ تبقى في السجلّ · رمز العملية للعمل الجماعيّ:
            <span style={{ fontFamily: 'monospace', direction: 'ltr', display: 'inline-block', marginInlineStart: '4px' }}>{opId}</span>
          </p>
        </div>
      ) : (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا عملية جارية — أوّل حفظٍ يفتح عمليةً جديدة. وللعمل الجماعيّ على عمليةِ زميلٍ مفتوحة، ألصق رمزها:
          </p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              className="o_input"
              placeholder="رمز العملية…"
              aria-label="رمز العملية"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{ flex: 1, direction: 'ltr', textAlign: 'center', fontFamily: 'monospace' }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={joinByCode} disabled={!joinCode.trim()}>
              انضمام
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
