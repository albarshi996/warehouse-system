/**
 * شاشة العمليات المخزنية على الهاتف — امسح فتُعبَّأ (SAP-19).
 *
 * ═══ ثلاث خطوات لا أكثر ═══
 * اختر الوضع ⇒ امسح ⇒ خانة التعبئة (الاسم من الماستر أو سمِّه + الكمّيّة)
 * ⇒ حفظ. كلّ الحكم في `scanFlow.js` الخالص المُختبَر؛ هذه الشاشة عرضٌ له.
 *
 * ═══ ولماذا لا تتجمّد؟ ═══
 * الصفحة القديمة كانت تفكّ الباركود على المعالج إطارًا إطارًا («الوضع
 * المتوافق») فيغلي هاتف الموظّف ويتجمّد. هنا: الكاميرا عبر `BarcodeDetector`
 * **العتاديّ** حيث يتوفّر (فحصٌ كلّ ٣٠٠م.ث لا كلّ إطار)، ولا فكّ برمجيّ
 * إطلاقًا — ومن لا كاميرا مدعومة عنده (آيفون) يمسح بلوحة المفاتيح أو يكتب.
 *
 * ═══ ومسار البيانات القائم لا يُمسّ ═══
 * نفس عمليات `stock_operations` وقيود `appendScan` الملحقة-فقط، ونفس مفتاح
 * الاستئناف — فالأداة الكاملة القديمة تقرأ ما نكتب والعكس. والمجهول يدخل
 * `Items_Pending` القائمة بعد تسميته (I-د) فيبتّ فيه المدير.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { lookupByBarcode } from '../../../services/itemService.js';
import { registerPending } from '../../../services/items/pendingService.js';
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
} from '../../../services/stock/scanFlow.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';
import { int, num } from '../../odoo/format.js';

const OP_KEY = 'bzCloudOpId'; // نفس مفتاح الأداة الكاملة — عمليةٌ واحدة للجهاز

export default function ScanFlow() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('');
  const [opId, setOpId] = useState(null);
  const [scans, setScans] = useState([]);
  const [panel, setPanel] = useState(null); // خانة التعبئة بعد المسح
  const [panelItem, setPanelItem] = useState(null);
  const [qty, setQty] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraErr, setCameraErr] = useState('');

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

  // استئناف عمليةٍ مفتوحة محفوظة — نفس سلوك الأداة الكاملة، فلا يُقسم عملٌ واحد.
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

  // قيود العملية الحيّة — القائمة أسفل الشاشة تتحدّث فور كلّ حفظ.
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
  const recent = useMemo(() => [...scans].slice(-12).reverse(), [scans]);

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
      // ننتظر ظهور عنصر الفيديو بعد إعادة الرسم.
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
    <div className="o_theme" dir="rtl" style={{ maxWidth: '560px', margin: '0 auto' }}>
      {/* الحالة */}
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

      {/* الجلسة الجارية */}
      {opId && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
              الجلسة الجارية — {int(summary.scanCount)} قيدًا · {int(summary.itemCount)} صنفًا · إجمالي {num(summary.totalQty)}
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={finishOperation}>
              <Icon name="checkCircle" size={14} /> إنهاء العملية
            </button>
          </div>
          {recent.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)', marginTop: '8px' }}>
              <tbody>
                {recent.map((s, i) => (
                  <tr key={s.id || i} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                    <td style={{ padding: '5px 4px' }}>{s.name || '—'}</td>
                    <td style={{ padding: '5px 4px', fontFamily: 'monospace', direction: 'ltr', color: 'var(--o-main-color-muted)' }}>{s.barcode}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'left', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--o-font-weight-bold)' }}>
                      {num(s.qty ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
