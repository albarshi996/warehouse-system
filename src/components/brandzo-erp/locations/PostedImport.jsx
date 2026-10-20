/**
 * ‹SRC-POST› مستندٌ منجَزٌ في المصدر ← يُرحَّل — تبويبٌ في «التخزين والسحب الموجّه».
 *
 * الدورة: ارفع ورقة SourcePosted ← عاين كلَّ مستندٍ بنوعه وطرفيه وحالته ← رحِّل.
 * والترحيلُ يمرّ بالمسار الرسميّ (رقمٌ ⟵ اعتمادٌ ⟵ إنجازٌ يقيّد الأثر)، فكلُّ حارسٍ
 * يحرس المستندَ اليدويّ يحرس هذا. ولا كتابةَ قبل الضغط.
 *
 * ولا يُحرَّر هنا شيء عمدًا: مستندٌ أُنجز في أودو يُرحَّل كما وقع — وتصحيحُه في أودو
 * ثمّ ورقةٌ جديدة، لا يدٌ تعدّل الكمّيّة فيفترق النظامان بصمت.
 */
import { useCallback, useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import Badge from '../../odoo/Badge.jsx';
import { getBasePath } from '../../../services/auth/authService.js';
import { analyzePostedFile, canPostImport, commitPostedImport } from '../../../services/locations/postedImportService.js';
import { POSTED_TYPES, routeLabel } from '../../../services/locations/postedImport.js';

const STATUS = {
  new: { label: 'يُرحَّل', variant: 'progress' },
  resume: { label: 'يُستأنف', variant: 'warn' },
  posted: { label: 'مُرحَّل سلفًا', variant: 'done' },
  skip: { label: 'بلا أثر', variant: 'draft' },
  error: { label: 'محجوب', variant: 'danger' },
};

const muted = { fontSize: '12px', color: 'var(--o-main-color-muted)' };
const listStyle = { fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 };

function Stat({ label, value, tone }) {
  return (
    <div className="o_kpi">
      <div className="o_kpi_label">{label}</div>
      <div className="o_kpi_value" style={tone === 'warn' ? { color: 'var(--o-warning, #b45309)' } : undefined}>{value}</div>
    </div>
  );
}

export default function PostedImport({ profile }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const canPost = canPostImport(profile?.role);

  const readFile = useCallback(async (file) => {
    if (!file) return;
    setBusy('يقرأ الورقة…');
    setMsg({ type: '', text: '' });
    setResult(null);
    try {
      setPreview(await analyzePostedFile(file));
    } catch (err) {
      setPreview(null);
      setMsg({ type: 'error', text: err.message || 'تعذّرت قراءة الورقة.' });
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  async function commit() {
    setMsg({ type: '', text: '' });
    try {
      const out = await commitPostedImport(preview, profile, {
        onProgress: ({ index, total, docRef, step }) => setBusy(`${step} ${index + 1}/${total} — ${docRef}`),
      });
      setResult(out);
      setPreview(null);
      setMsg(
        out.failed.length
          ? { type: 'error', text: `رُحّل ${out.posted.length} وتعذّر ${out.failed.length} — أسبابُها أدناه، وإعادةُ رفع الورقة نفسِها تستأنف من حيث وقفت.` }
          : { type: 'success', text: `رُحّل ${out.posted.length} مستندًا وتحرّك الرصيد بأثرها.` }
      );
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'تعذّر الترحيل.' });
    } finally {
      setBusy('');
    }
  }

  const s = preview?.summary;
  const todo = s ? s.new + s.resume : 0;

  return (
    <>
      <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.7 }}>
        مستندٌ أُنجز في أودو يُرحَّل هنا كما وقع: يُرقَّم ويُعتمد ويُحرّك الرصيد من موقعه إلى موقعه. الرصيد الافتتاحيّ لقطة
        19 أكتوبر، فلا يُقبل مستندٌ أُنجز قبل {preview?.cutoff || '2026-10-20'}. <strong>ولا تُرفع بعدها ورقةُ أرصدة</strong> — وإلّا
        تضاعف كلُّ نقص.
      </p>

      {msg.text && (
        <div className={`o_alert ${msg.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '14px' }}>
          {msg.text}
        </div>
      )}

      {!canPost && profile && (
        <div className="o_alert warning" style={{ marginBottom: '14px' }}>
          <div className="o_alert_title">
            <Icon name="alertTriangle" size={16} /> الترحيل مقصورٌ على المدير العامّ ومدير المستودع — فهو يعتمد ويُنجز معًا
          </div>
        </div>
      )}

      <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
        <label className="btn btn-primary" style={{ cursor: canPost ? 'pointer' : 'not-allowed', opacity: canPost ? 1 : 0.5 }}>
          <Icon name="fileUp" size={15} /> {busy || 'اختر ورقة المستندات المنجَزة'}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={!canPost || Boolean(busy)}
            onChange={(e) => readFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </label>
        <span style={{ ...muted, marginRight: '12px' }}>
          الورقة المقروءة: <strong>SourcePosted</strong>
          {preview?.fileName && (
            <> · الملفّ: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{preview.fileName}</strong></>
          )}
        </span>
      </div>

      {result && <Result result={result} />}

      {preview && (
        <>
          <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
            <Stat label="يُرحَّل" value={todo} />
            <Stat label="بنود" value={s.lines} />
            <Stat label="إجمالي الكمّيّات" value={s.qty} />
            <Stat label="مُرحَّل سلفًا" value={s.posted} />
            <Stat label="محجوب" value={s.error} tone={s.error ? 'warn' : undefined} />
            <Stat label="بلا أثر" value={s.skip} />
          </div>

          {preview.errors.length > 0 && (
            <div className="o_alert danger" style={{ marginBottom: '14px' }}>
              <div className="o_alert_title">
                <Icon name="alertTriangle" size={16} /> {preview.errors.length} خطأً في الورقة — تُحجب كلُّها، فصفٌّ معطوبٌ يُسقط بندًا من مستنده
              </div>
              <ul style={listStyle}>
                {preview.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>صفّ {e.row} · {e.column} — {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--o-border-color)' }}>
                  {['المرجع', 'النوع', 'من', 'إلى', 'أُنجز', 'بنود', 'الكمّيّة', 'الحالة'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.documents.map((d) => {
                  const route = routeLabel(d);
                  const st = STATUS[d.status];
                  const note = d.problems.length ? d.problems.join(' · ') : d.skipReason;
                  return (
                    <tr key={d.docRef} style={{ borderBottom: '1px solid var(--o-border-color)', verticalAlign: 'top' }}>
                      <td style={{ padding: '6px 8px', direction: 'ltr', textAlign: 'right' }}>{d.docRef}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {POSTED_TYPES[d.type]?.labelAr || '—'}
                        {d.isReturn && <span style={muted}> · مرتجع</span>}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{route.from || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{route.to || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{d.doneDay || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{d.lines.length}</td>
                      <td style={{ padding: '6px 8px' }}>{d.lines.reduce((n, l) => n + l.qty, 0)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {note && <div style={{ ...muted, marginTop: '4px', maxWidth: '320px' }}>{note}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!preview.ok || !canPost || Boolean(busy)} onClick={commit}>
              <Icon name="checkCircle" size={15} /> {busy || `رحِّل ${todo} مستندًا`}
            </button>
            <span style={muted}>
              يُرقَّم كلُّ مستندٍ ويُعتمد ويُنجز فيتحرّك الرصيد. وفشلُ مستندٍ لا يوقف إخوتَه — يبقى معتمَدًا ويُستأنف بإعادة رفع الورقة.
            </span>
          </div>
        </>
      )}
    </>
  );
}

function Result({ result }) {
  const base = getBasePath();
  return (
    <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
      <h3 className="o_form_title" style={{ marginTop: 0 }}>ما رُحّل</h3>
      <ul style={{ fontSize: '13px', lineHeight: 1.9, margin: 0, paddingInlineStart: '18px' }}>
        {result.posted.map((p) => (
          <li key={p.documentId}>
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{p.docRef}</span> ⟵{' '}
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{p.number || '—'}</span> · {p.lines} بندًا ·{' '}
            <a href={`${base}/dashboard/document?id=${p.documentId}`}>افتح المستند</a>
          </li>
        ))}
        {result.already.map((p) => (
          <li key={p.documentId} style={muted}>
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{p.docRef}</span> — مُرحَّلٌ سلفًا، لم يُمسّ
          </li>
        ))}
      </ul>
      {result.failed.length > 0 && (
        <div className="o_alert danger" style={{ marginTop: '12px' }}>
          <div className="o_alert_title">
            <Icon name="alertTriangle" size={16} /> {result.failed.length} لم يُرحَّل — باقٍ في حالته ويُستأنف بإعادة رفع الورقة
          </div>
          <ul style={listStyle}>
            {result.failed.map((f) => (
              <li key={f.docRef}>
                <span style={{ direction: 'ltr', display: 'inline-block' }}>{f.docRef}</span> — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
