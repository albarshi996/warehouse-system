/**
 * التخزين والسحب الموجّه — صندوق الاستيراد والمعاينة.
 *
 * الشاشة الجديدة الوحيدة في المنظومة (وظيفةٌ لا نظير لها). الدورة هنا:
 *   ارفع الشيت ← عاين ← صحّح ← اعتمد ← يُنشأ المستند مرتبطًا بمرجع المصدر.
 *
 * ولا كتابةَ قبل الاعتماد: المعاينة تُرى كاملةً أوّلًا — كم مستندًا، وكم بندًا،
 * وما المكرّر، وما الخطأ، وأين. فمن يضغط «اعتمد» يعرف ما سيقع.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import Badge from '../../odoo/Badge.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { analyzeSourceFile, commitSourceImport, canImportSource } from '../../../services/locations/sourceImportService.js';
import {
  addManualDocument,
  addManualLine,
  applyEdit,
  deviationReport,
  isEditable,
  manualPreview,
  qtyDeviation,
  recomputePreview,
  removeManualLine,
} from '../../../services/locations/sourceImport.js';
import { normalizeBarcode } from '../../../services/excel/excelSchema.js';
import { exportTemplate } from '../../../services/excel/excelExport.js';

const KINDS = [
  { id: 'receipt', label: 'أمر استلام ← تخزين', icon: 'arrowDownTray', dataset: 'receipt' },
  { id: 'delivery', label: 'أمر تسليم ← سحب', icon: 'arrowUpTray', dataset: 'delivery' },
];

export default function DirectedStorage() {
  const [profile, setProfile] = useState(null);
  const [kind, setKind] = useState('receipt');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [term, setTerm] = useState('');
  const fileRef = useRef(null);

  useEffect(
    () =>
      subscribeAuth(async (user) => {
        if (!user) return setProfile(null);
        setProfile(await fetchUserProfile(user).catch(() => null));
      }),
    []
  );

  const canImport = canImportSource(profile?.role);
  const deviations = useMemo(() => deviationReport(preview?.documents), [preview]);

  /** قراءةٌ واحدة للملفّ — يستدعيها النقر والإفلات معًا فلا يتفرّع المسار. */
  const readFile = useCallback(
    async (file) => {
      if (!file) return;
      setBusy('يقرأ الملفّ…');
      setMsg({ type: '', text: '' });
      setResult(null);
      setFileName(file.name || '');
      setTerm('');
      try {
        setPreview(await analyzeSourceFile(file, kind));
      } catch (err) {
        setPreview(null);
        setMsg({ type: 'error', text: err.message || 'تعذّرت قراءة الملفّ.' });
      } finally {
        setBusy('');
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [kind]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      if (!canImport || busy) return;
      readFile(e.dataTransfer?.files?.[0]);
    },
    [canImport, busy, readFile]
  );

  const onPick = useCallback(
    async (e) => {
      await readFile(e.target.files?.[0]);
    },
    [readFile]
  );

  function editLine(docIdx, lineIdx, field, value) {
    setPreview((prev) => {
      if (!prev) return prev;
      const verdict = applyEdit(prev.documents[docIdx].lines[lineIdx], field, value);
      if (!verdict.ok) {
        setMsg({ type: 'error', text: verdict.problem });
        return prev;
      }
      const documents = prev.documents.map((d, i) =>
        i !== docIdx ? d : { ...d, lines: d.lines.map((l, j) => (j === lineIdx ? verdict.line : l)) }
      );
      // إعادة الحساب تُبقي الأخطاء والملخّص مطابقَين لما يُرى الآن.
      return recomputePreview({ ...prev, documents });
    });
  }

  /** تحرير رأس المستند — للمسودّة اليدويّة (المرجع · المستودع · المورّد…). */
  function editHeader(docIdx, field, value) {
    setPreview((prev) => {
      if (!prev) return prev;
      if (!isEditable(field) && !prev.documents[docIdx]?.manual) {
        setMsg({ type: 'error', text: `«${field}» جزءٌ من هويّة المستند المستورَد ولا يُحرَّر.` });
        return prev;
      }
      const documents = prev.documents.map((d, i) => (i !== docIdx ? d : { ...d, [field]: value }));
      return recomputePreview({ ...prev, documents });
    });
  }

  /** يبدأ مسودّةً بلا ملفّ — البضاعة تصل الرصيف ولو تأخّر الشيت. */
  function startManual() {
    setMsg({ type: '', text: '' });
    setResult(null);
    setFileName('');
    setTerm('');
    setPreview(manualPreview(kind));
  }

  /**
   * المسح يبني سطرًا. والباركود يُطبَّع بالدالّة نفسها التي يطبّع بها الشيت
   * (`normalizeBarcode`) — وإلّا صار الممسوح صنفًا ثانيًا للمكتوب.
   */
  function scanInto(docIdx, raw) {
    const code = normalizeBarcode(raw);
    if (!code) return;
    setPreview((prev) => (prev ? addManualLine(prev, docIdx, { barcode: code, qty: 1 }) : prev));
    setMsg({ type: 'success', text: `أُضيف سطرٌ للباركود ${code} — اضبط الكمّيّة.` });
  }

  function addLine(docIdx) {
    setPreview((prev) => (prev ? addManualLine(prev, docIdx) : prev));
  }

  function addDocument() {
    setPreview((prev) => (prev ? addManualDocument(prev, {}) : manualPreview(kind)));
  }

  function dropLine(docIdx, lineIdx) {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = removeManualLine(prev, docIdx, lineIdx);
      if (next.problem) setMsg({ type: 'error', text: next.problem });
      return next;
    });
  }

  async function commit() {
    setBusy('يعتمد…');
    setMsg({ type: '', text: '' });
    try {
      const out = await commitSourceImport(preview, profile);
      setResult(out);
      setPreview(null);
      setMsg({ type: 'success', text: `أُنشئ ${out.documents} مستندًا. الموقع يختاره العامل عند التنفيذ.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'تعذّر الاعتماد.' });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل">
            <span className="o_active">التخزين والسحب الموجّه</span>
          </nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={() => exportTemplate(kind)}>
            <Icon name="arrowDownTray" size={15} /> تنزيل القالب
          </button>
        </div>
      </div>

      <div className="o_ds">
        <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          البوابة لا تتّصل بأيّ نظامٍ خارجيّ — الشيت هو المدخل الوحيد. ارفع الملفّ لتُعاينه كاملًا قبل أن يُكتب شيء،
          ثمّ صحّح ما يلزم واعتمد فيُنشأ المستند مرتبطًا بمرجع المصدر.
        </p>

        <div role="tablist" aria-label="نوع الاستيراد" style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: '1px solid var(--o-border-color)' }}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={kind === k.id}
              className="btn btn-link"
              onClick={() => { setKind(k.id); setPreview(null); setResult(null); setMsg({ type: '', text: '' }); }}
              style={{
                borderBottom: kind === k.id ? '2px solid var(--o-brand-primary)' : '2px solid transparent',
                fontWeight: kind === k.id ? 700 : 500,
                borderRadius: 0,
              }}
            >
              <Icon name={k.icon} size={15} /> {k.label}
            </button>
          ))}
        </div>

        {msg.text && (
          <div className={`o_alert ${msg.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '14px' }}>
            {msg.text}
          </div>
        )}

        {!canImport && profile && (
          <div className="o_alert warning" style={{ marginBottom: '14px' }}>
            <div className="o_alert_title">
              <Icon name="alertTriangle" size={16} /> الاستيراد مقصورٌ على المدير العام ومدير المستودع ومدقّق الجرد — ودورك الحاليّ لا يملكه
            </div>
          </div>
        )}

        {/* منطقة الإفلات: الشيت يُسحب من المجلّد إلى الصفحة مباشرةً — خطوتان
            تُختصران إلى واحدة. والزرّ باقٍ لمن يفضّل النقر. */}
        <div
          className="o_ds_card o_ds_pad"
          style={{
            marginBottom: '18px',
            border: dragging ? '2px dashed var(--o-brand-primary)' : '2px dashed transparent',
            background: dragging ? 'var(--o-badge-draft-bg)' : undefined,
            transition: 'background .15s',
          }}
          onDragOver={(e) => {
            if (!canImport || busy) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <label className="btn btn-primary" style={{ cursor: canImport ? 'pointer' : 'not-allowed', opacity: canImport ? 1 : 0.5 }}>
            <Icon name="fileUp" size={15} /> {busy || 'اختر ملفّ الشيت'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" disabled={!canImport || Boolean(busy)} onChange={onPick} style={{ display: 'none' }} />
          </label>
          <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)', marginRight: '12px' }}>
            {dragging ? 'أفلِت الملفّ هنا' : 'أو اسحب الملفّ وأفلِته هنا'} · الورقة المقروءة:{' '}
            <strong>{kind === 'receipt' ? 'Receipt' : 'Delivery'}</strong>
          </span>
          {/* الشيت مصدرٌ خارجيّ قد يتأخّر أو يصل ناقصًا، والبضاعة تصل الرصيف
              في موعدها. فالمسودّة اليدويّة ليست تسهيلًا بل استمرارُ عمل. */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginInlineStart: '8px' }}
            disabled={!canImport || Boolean(busy)}
            onClick={startManual}
          >
            <Icon name="plus" size={15} /> ابدأ مستندًا يدويًّا
          </button>
          {fileName && (
            <div style={{ fontSize: '12px', color: 'var(--o-main-color-muted)', marginTop: '8px' }}>
              الملفّ المقروء: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{fileName}</strong>
            </div>
          )}
        </div>

        {result && (
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
            <h3 className="o_form_title" style={{ marginTop: 0 }}>ما أُنشئ</h3>
            <ul style={{ fontSize: '13px', lineHeight: 1.9, margin: 0, paddingInlineStart: '18px' }}>
              {result.created.map((c) => (
                <li key={c.documentId}>
                  <span style={{ direction: 'ltr', display: 'inline-block' }}>{c.docRef}</span> — {c.lines} بندًا ·{' '}
                  <a href={`${getBasePath()}/dashboard/document?id=${c.documentId}`}>افتح المستند</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview && (
          <Preview
            preview={preview}
            deviations={deviations}
            onEdit={editLine}
            onHeader={editHeader}
            onScan={scanInto}
            onAddLine={addLine}
            onAddDoc={addDocument}
            onDropLine={dropLine}
            onCommit={commit}
            busy={busy}
            canImport={canImport}
            term={term}
            onTerm={setTerm}
          />
        )}
      </div>
    </div>
  );
}

/**
 * خانة المسح — تُفرَّغ بعد كلّ قراءة فيتوالى المسح بلا نقر.
 * وقارئ الباركود يُرسل Enter في آخر القراءة، فالإرسال على المفتاح لا على زرّ.
 */
function ScanBox({ onScan }) {
  const [code, setCode] = useState('');
  return (
    <input
      className="o_input"
      value={code}
      onChange={(e) => setCode(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onScan(code);
        setCode('');
      }}
      placeholder="امسح الباركود ثمّ Enter"
      style={{ width: '190px', direction: 'ltr' }}
    />
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="o_kpi">
      <div className="o_kpi_label">{label}</div>
      <div className="o_kpi_value" style={tone === 'warn' ? { color: 'var(--o-warning, #b45309)' } : undefined}>{value}</div>
    </div>
  );
}

/**
 * ترشيحُ المعاينة بكلمة — على الرقم أو الصنف أو الاسم أو الدفعة.
 *
 * والمهمّ فيه أنّه **يحفظ فهرس المستند والبند الأصليَّين**: التحرير يكتب
 * بالفهرس (`onEdit(docIdx, lineIdx, …)`)، فترشيحٌ يُعيد الترقيم يجعل العامل
 * يصحّح بندًا ويُكتب التصحيح في بندٍ آخر — وهو عطبٌ صامت.
 */
function filterDocuments(documents, term) {
  const t = String(term || '').trim().toUpperCase();
  const indexed = (documents || []).map((doc, di) => ({ doc, di }));
  if (!t) return indexed.map(({ doc, di }) => ({ doc, di, lines: doc.lines.map((line, li) => ({ line, li })) }));

  const hit = (v) => String(v ?? '').toUpperCase().includes(t);
  return indexed
    .map(({ doc, di }) => {
      const docHit = hit(doc.docRef) || hit(doc.warehouse) || hit(doc.supplier) || hit(doc.customer);
      const lines = doc.lines
        .map((line, li) => ({ line, li }))
        .filter(({ line }) => docHit || hit(line.sku) || hit(line.barcode) || hit(line.nameAr) || hit(line.batch));
      return { doc, di, lines };
    })
    .filter(({ lines }) => lines.length > 0);
}

function Preview({ preview, deviations, onEdit, onHeader, onScan, onAddLine, onAddDoc, onDropLine, onCommit, busy, canImport, term, onTerm }) {
  const s = preview.summary;
  const shown = filterDocuments(preview.documents, term);
  const shownLines = shown.reduce((n, d) => n + d.lines.length, 0);
  return (
    <>
      <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
        <Stat label="مستندات" value={s.documents} />
        <Stat label="بنود" value={s.lines} />
        <Stat label="إجمالي الكميات" value={s.qty} />
        <Stat label="مكرّر (لن يُستورد)" value={s.duplicate} tone={s.duplicate ? 'warn' : undefined} />
      </div>

      {preview.errors.length > 0 && (
        <div className="o_alert danger" style={{ marginBottom: '14px' }}>
          <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> {preview.errors.length} خطأ يمنع الاعتماد</div>
          <ul style={{ fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 }}>
            {preview.errors.slice(0, 12).map((e, i) => (
              <li key={i}>صفّ {e.row} · {e.column} — {e.message}</li>
            ))}
          </ul>
          {preview.errors.length > 12 && <p style={{ fontSize: '12px', margin: '6px 0 0' }}>…و{preview.errors.length - 12} خطأً آخر.</p>}
        </div>
      )}

      {preview.conflicts.length > 0 && (
        <div className="o_alert danger" style={{ marginBottom: '14px' }}>
          <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> تعارض في رأس المستند</div>
          <ul style={{ fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 }}>
            {preview.conflicts.map((c, i) => (
              <li key={i}>{c.docRef} — «{c.field}» جاء بقيمتين: {c.values.join(' ≠ ')}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.warnings.length > 0 && (
        <div className="o_alert warning" style={{ marginBottom: '14px' }}>
          <div className="o_alert_title">{preview.warnings.length} تنبيهًا — لا تمنع الاعتماد</div>
          <ul style={{ fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 }}>
            {preview.warnings.slice(0, 6).map((w, i) => <li key={i}>صفّ {w.row} — {w.message}</li>)}
          </ul>
        </div>
      )}

      {deviations.length > 0 && (
        <div className="o_alert warning" style={{ marginBottom: '14px' }}>
          <div className="o_alert_title">{deviations.length} بندًا حُرّرت كمّيّته — يُحفظ الأصل ويظهر الفرق</div>
          <ul style={{ fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 }}>
            {deviations.map((d, i) => (
              <li key={i}>{d.docRef} · {d.sku} — من {d.original} إلى {d.current} ({d.diff > 0 ? '+' : ''}{d.diff})</li>
            ))}
          </ul>
        </div>
      )}

      {/* بحثٌ حيّ — شيتٌ بمئتي بندٍ لا يُراجَع بالتمرير. */}
      <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <Icon name="search" size={15} />
        <input
          className="o_input"
          value={term}
          onChange={(e) => onTerm(e.target.value)}
          placeholder="ابحث في رقم المستند أو الصنف أو الباركود أو الدفعة"
          style={{ flex: '1 1 260px' }}
        />
        {term && (
          <>
            <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)' }}>
              {shown.length} مستندًا · {shownLines} بندًا من {s.lines}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onTerm('')}>
              أزِل البحث
            </button>
          </>
        )}
      </div>

      {term && shown.length === 0 && (
        <div className="o_alert" style={{ marginBottom: '14px' }}>لا بندَ يطابق «{term}».</div>
      )}

      {shown.map(({ doc, di, lines: shownRows }) => (
        <div key={doc.docRef} className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {doc.manual ? (
              <>
                <input
                  className="o_input"
                  value={doc.docRef}
                  onChange={(e) => onHeader(di, 'docRef', e.target.value)}
                  placeholder="مرجع المستند"
                  style={{ width: '150px', direction: 'ltr' }}
                />
                <input
                  className="o_input"
                  value={doc.warehouse}
                  onChange={(e) => onHeader(di, 'warehouse', e.target.value)}
                  placeholder="المستودع"
                  style={{ width: '110px' }}
                />
              </>
            ) : (
              <>
                <strong style={{ direction: 'ltr' }}>{doc.docRef}</strong>
                <Badge tone="muted">{doc.warehouse}</Badge>
              </>
            )}
            {doc.supplier && <span style={{ fontSize: '12px' }}>{doc.supplier}</span>}
            {doc.customer && <span style={{ fontSize: '12px' }}>{doc.customer}</span>}
            <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)' }}>
              {shownRows.length === doc.lines.length ? `${doc.lines.length} بندًا` : `${shownRows.length} من ${doc.lines.length} بندًا`}
            </span>
            <div style={{ flex: 1 }} />
            {/* المسح يبني سطرًا: العامل يقرأ الملصق ولا يكتب ثلاثة عشر محرفًا. */}
            <ScanBox onScan={(code) => onScan(di, code)} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddLine(di)}>
              <Icon name="plus" size={14} /> سطر
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="w-full" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'var(--o-chip, #f4f4f5)' }}>
                  {['الصنف', 'الباركود', 'الاسم', 'الوحدة', 'الكمية', 'الدفعة', 'الصلاحية', 'ملاحظات', ''].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map(({ line, li }) => {
                  const dev = qtyDeviation(line);
                  return (
                    <tr key={li} style={{ borderTop: '1px solid var(--o-border-color)' }}>
                      {line.manual ? (
                        <>
                          <Editable value={line.sku} onChange={(v) => onEdit(di, li, 'sku', v)} width="120px" />
                          <Editable value={line.barcode} onChange={(v) => onEdit(di, li, 'barcode', v)} width="130px" />
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '4px 8px', direction: 'ltr' }}>{line.sku}</td>
                          <td style={{ padding: '4px 8px', direction: 'ltr' }}>{line.barcode}</td>
                        </>
                      )}
                      <Editable value={line.description} onChange={(v) => onEdit(di, li, 'description', v)} />
                      <Editable value={line.uom} onChange={(v) => onEdit(di, li, 'uom', v)} width="70px" />
                      <Editable
                        value={line.qty}
                        type="number"
                        width="80px"
                        title={dev ? `الأصل من المصدر: ${dev.original}` : undefined}
                        marked={Boolean(dev)}
                        onChange={(v) => onEdit(di, li, 'qty', Number(v) || 0)}
                      />
                      <Editable value={line.batch} onChange={(v) => onEdit(di, li, 'batch', v)} width="90px" />
                      <Editable value={line.expiry} type="date" onChange={(v) => onEdit(di, li, 'expiry', v)} width="130px" />
                      <Editable value={line.notes} onChange={(v) => onEdit(di, li, 'notes', v)} />
                      <td style={{ padding: '4px 8px' }}>
                        {line.manual && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            title="احذف هذا السطر اليدويّ"
                            onClick={() => onDropLine(di, li)}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--o-main-color-muted)', margin: '8px 0 0' }}>
            مرجع المستند ومعرّف السطر وتاريخ المصدر لا تُحرَّر — فهي بصمة منع التكرار.
            وموقع التخزين يختاره <strong>العامل</strong> عند التنفيذ.
          </p>
        </div>
      ))}

      <div className="o_form_actions">
        <button type="button" className="btn btn-secondary" onClick={onAddDoc} style={{ marginInlineEnd: '8px' }}>
          <Icon name="plus" size={15} /> مستند آخر
        </button>
        <button type="button" className="btn btn-primary" disabled={!preview.ok || !canImport || Boolean(busy)} onClick={onCommit}>
          <Icon name="checkCircle" size={15} /> اعتمد وأنشئ {preview.documents.length} مستندًا
        </button>
        {!preview.ok && (
          <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)' }}>
            {preview.documents.length === 0 ? 'لا جديدَ في هذا الملفّ — كلّ سطوره مستوردةٌ سلفًا.' : 'صحّح الأخطاء والتعارض أوّلًا.'}
          </span>
        )}
      </div>
    </>
  );
}

function Editable({ value, onChange, type = 'text', width, title, marked }) {
  return (
    <td style={{ padding: '2px 4px' }}>
      <input
        type={type}
        className="o_input"
        title={title}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: width || '100%',
          minWidth: width || '110px',
          padding: '3px 6px',
          fontSize: '13px',
          ...(marked ? { boxShadow: 'inset 0 0 0 1px rgba(245,158,11,.8)' } : {}),
          ...(type === 'text' ? {} : { direction: 'ltr' }),
        }}
      />
    </td>
  );
}

/** الحقول غير القابلة للتحرير تُعرض نصًّا — يحرسها `isEditable` في المنطق. */
export const NON_EDITABLE_NOTE = isEditable;
