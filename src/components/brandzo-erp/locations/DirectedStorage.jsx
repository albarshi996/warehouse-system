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
import { applyEdit, deviationReport, isEditable, qtyDeviation } from '../../../services/locations/sourceImport.js';
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
  const fileRef = useRef(null);

  useEffect(
    () =>
      subscribeAuth(async (user) => {
        if (!user) return setProfile(null);
        setProfile(await fetchUserProfile(user.uid).catch(() => null));
      }),
    []
  );

  const canImport = canImportSource(profile?.role);
  const deviations = useMemo(() => deviationReport(preview?.documents), [preview]);

  const onPick = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy('يقرأ الملفّ…');
      setMsg({ type: '', text: '' });
      setResult(null);
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
      return { ...prev, documents };
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
              <Icon name="alertTriangle" size={16} /> الاستيراد مقصورٌ على مدير المستودع ومدقّق الجرد والأدمن
            </div>
          </div>
        )}

        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
          <label className="btn btn-primary" style={{ cursor: canImport ? 'pointer' : 'not-allowed', opacity: canImport ? 1 : 0.5 }}>
            <Icon name="fileUp" size={15} /> {busy || 'اختر ملفّ الشيت'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" disabled={!canImport || Boolean(busy)} onChange={onPick} style={{ display: 'none' }} />
          </label>
          <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)', marginRight: '12px' }}>
            الورقة المقروءة: <strong>{kind === 'receipt' ? 'Receipt' : 'Delivery'}</strong>
          </span>
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

        {preview && <Preview preview={preview} deviations={deviations} onEdit={editLine} onCommit={commit} busy={busy} canImport={canImport} />}
      </div>
    </div>
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

function Preview({ preview, deviations, onEdit, onCommit, busy, canImport }) {
  const s = preview.summary;
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

      {preview.documents.map((doc, di) => (
        <div key={doc.docRef} className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <strong style={{ direction: 'ltr' }}>{doc.docRef}</strong>
            <Badge tone="muted">{doc.warehouse}</Badge>
            {doc.supplier && <span style={{ fontSize: '12px' }}>{doc.supplier}</span>}
            {doc.customer && <span style={{ fontSize: '12px' }}>{doc.customer}</span>}
            <span style={{ fontSize: '12px', color: 'var(--o-main-color-muted)' }}>{doc.lines.length} بندًا</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="w-full" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'var(--o-chip, #f4f4f5)' }}>
                  {['الصنف', 'الباركود', 'الاسم', 'الوحدة', 'الكمية', 'الدفعة', 'الصلاحية', 'ملاحظات'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line, li) => {
                  const dev = qtyDeviation(line);
                  return (
                    <tr key={li} style={{ borderTop: '1px solid var(--o-border-color)' }}>
                      <td style={{ padding: '4px 8px', direction: 'ltr' }}>{line.sku}</td>
                      <td style={{ padding: '4px 8px', direction: 'ltr' }}>{line.barcode}</td>
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
