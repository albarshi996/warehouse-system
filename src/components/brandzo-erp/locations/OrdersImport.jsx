/**
 * ‹ODOO-ORD› أوامرُ أودو ← تُحدَّث — تبويبٌ في «التخزين والسحب الموجّه».
 *
 * ارفع ورقة SourceOrders ← عاين قرارَ كلِّ أمر (يُنشأ · يُحدَّث · يُلغى · مطابق) ← طبّق.
 * الأمرُ سجلٌّ للاطّلاع: لا يُرحّل ولا يحجز — والتسليمُ والاستلامُ يصلان مستنداتٍ منجَزةً من التبويب المجاور.
 */
import { useCallback, useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import Badge from '../../odoo/Badge.jsx';
import { getBasePath } from '../../../services/auth/authService.js';
import { useLeaveGuard } from '../../../services/ui/useLeaveGuard.js';
import { canPostImport } from '../../../services/locations/postedImportService.js';
import { analyzeOrdersFile, commitOrdersImport } from '../../../services/locations/ordersImportService.js';
import { DONE_STATUS_LABELS, ODOO_STATE_LABELS, ORDER_TYPES } from '../../../services/locations/orderImport.js';

const STATUS = {
  new: { label: 'يُنشأ', variant: 'progress' },
  newCanceled: { label: 'يُسجَّل ملغًى', variant: 'draft' },
  update: { label: 'يُحدَّث', variant: 'warn' },
  cancel: { label: 'يُلغى', variant: 'warn' },
  resume: { label: 'يُستأنف', variant: 'warn' },
  same: { label: 'مطابق', variant: 'done' },
  skip: { label: 'عرض سعر', variant: 'draft' },
  error: { label: 'محجوب', variant: 'danger' },
};

const muted = { fontSize: '12px', color: 'var(--o-main-color-muted)' };
const cell = { padding: '6px 8px', whiteSpace: 'nowrap' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function Stat({ label, value, tone }) {
  return (
    <div className="o_kpi">
      <div className="o_kpi_label">{label}</div>
      <div className="o_kpi_value" style={tone === 'warn' ? { color: 'var(--o-warning, #b45309)' } : undefined}>{value}</div>
    </div>
  );
}

export default function OrdersImport({ profile }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [writing, setWriting] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  useLeaveGuard(writing);
  const canImport = canPostImport(profile?.role);

  const readFile = useCallback(async (file) => {
    if (!file) return;
    setBusy('يقرأ الورقة…');
    setMsg({ type: '', text: '' });
    setResult(null);
    try {
      setPreview(await analyzeOrdersFile(file));
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
    setWriting(true);
    try {
      const out = await commitOrdersImport(preview, profile, {
        onProgress: ({ index, total, docRef }) => setBusy(`${index + 1}/${total} — ${docRef}`),
      });
      setResult(out);
      setPreview(null);
      const done = `أُنشئ ${out.created.length} · حُدِّث ${out.updated.length} · أُلغي ${out.canceled.length}`;
      setMsg(out.failed.length
        ? { type: 'error', text: `${done} — وتعذّر ${out.failed.length}، وإعادةُ رفع الورقة نفسِها تُكمل.` }
        : { type: 'success', text: done });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'تعذّر الاستيراد.' });
    } finally {
      setBusy('');
      setWriting(false);
    }
  }

  const s = preview?.summary;
  const todo = s ? s.new + s.newCanceled + s.update + s.cancel + s.resume : 0;

  return (
    <>
      <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.7 }}>
        أوامرُ البيع والشراء كما هي في أودو: المطلوبُ والمسلَّمُ (أو المستلَم) والمفوتَر. سجلٌّ للاطّلاع لا يُحرّك مخزونًا ولا يحجزه.
        والأمرُ الذي تغيّر في أودو يُحدَّث في مكانه، والملغى هناك يُلغى هنا — والأمرُ المطابقُ لا يُكتب له شيء.
      </p>

      {msg.text && <div className={`o_alert ${msg.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '14px' }}>{msg.text}</div>}

      {!canImport && profile && (
        <div className="o_alert warning" style={{ marginBottom: '14px' }}>
          <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> استيرادُ الأوامر للمدير العامّ ومدير المستودع — وتحديثُ أمرٍ قائمٍ للمدير العامّ وحده</div>
        </div>
      )}

      <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
        <label className="btn btn-primary" style={{ cursor: canImport ? 'pointer' : 'not-allowed', opacity: canImport ? 1 : 0.5 }}>
          <Icon name="fileUp" size={15} /> {busy || 'اختر ورقة الأوامر'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" disabled={!canImport || Boolean(busy)} onChange={(e) => readFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </label>
        <span style={{ ...muted, marginRight: '12px' }}>
          الورقة المقروءة: <strong>SourceOrders</strong>
          {preview?.fileName && <> · الملفّ: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{preview.fileName}</strong></>}
        </span>
      </div>

      {result && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
          <h3 className="o_form_title" style={{ marginTop: 0 }}>ما طُبّق</h3>
          <ul style={{ fontSize: '13px', lineHeight: 1.9, margin: 0, paddingInlineStart: '18px' }}>
            {[...result.created.map((r) => ({ ...r, what: 'أُنشئ' })), ...result.updated.map((r) => ({ ...r, what: 'حُدِّث' })), ...result.canceled.map((r) => ({ ...r, what: 'أُلغي' }))]
              .slice(0, 50)
              .map((r) => (
                <li key={`${r.what}-${r.documentId}`}>
                  {r.what}: <span style={{ direction: 'ltr', display: 'inline-block' }}>{r.docRef}</span>
                  {r.number && <> ⟵ <span style={{ direction: 'ltr', display: 'inline-block' }}>{r.number}</span></>} ·{' '}
                  <a href={`${getBasePath()}/dashboard/document?id=${r.documentId}`}>افتح</a>
                </li>
              ))}
          </ul>
          {result.failed.length > 0 && (
            <div className="o_alert danger" style={{ marginTop: '12px' }}>
              <ul style={{ fontSize: '12px', margin: 0, paddingInlineStart: '18px', lineHeight: 1.8 }}>
                {result.failed.map((f) => <li key={f.docRef}><span style={{ direction: 'ltr', display: 'inline-block' }}>{f.docRef}</span> — {f.error}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {preview && (
        <>
          <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
            <Stat label="يُنشأ" value={s.new + s.newCanceled} />
            <Stat label="يُحدَّث" value={s.update} />
            <Stat label="يُلغى" value={s.cancel} />
            <Stat label="مطابق" value={s.same} />
            <Stat label="محجوب" value={s.error} tone={s.error ? 'warn' : undefined} />
          </div>

          {preview.errors.length > 0 && (
            <div className="o_alert danger" style={{ marginBottom: '14px' }}>
              <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> {preview.errors.length} خطأً في الورقة — تُحجب كلُّها</div>
              <ul style={{ fontSize: '12px', margin: '8px 0 0', paddingInlineStart: '18px', lineHeight: 1.8 }}>
                {preview.errors.slice(0, 12).map((e, i) => <li key={i}>صفّ {e.row} · {e.column} — {e.message}</li>)}
              </ul>
            </div>
          )}

          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--o-border-color)' }}>
                  {['رقم الأمر', 'النوع', 'التاريخ', 'الطرف', 'المستودع', 'الحالة في أودو', 'التسليم/الاستلام', 'البنود', 'المطلوب', 'المنجَز', 'القرار'].map((h) => (
                    <th key={h} style={{ ...cell, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.orders.map((o) => {
                  const st = STATUS[o.status];
                  return (
                    <tr key={`${o.orderType}-${o.docRef}`} style={{ borderBottom: '1px solid var(--o-border-color)', verticalAlign: 'top' }}>
                      <td style={{ ...cell, direction: 'ltr', textAlign: 'right' }}>{o.docRef}</td>
                      <td style={cell}>{ORDER_TYPES[o.orderType] || o.orderType}</td>
                      <td style={cell}>{o.orderDate.slice(0, 10)}</td>
                      <td style={cell}>{o.partner || '—'}</td>
                      <td style={cell}>{o.warehouse || '—'}</td>
                      <td style={cell}>{ODOO_STATE_LABELS[o.docStatus] || o.docStatus}</td>
                      <td style={cell}>{DONE_STATUS_LABELS[o.doneStatus] || o.doneStatus || '—'}</td>
                      <td style={cell}>{o.lines.length}</td>
                      <td style={cell}>{fmt(o.qty)}</td>
                      <td style={cell}>{fmt(o.qtyDone)}</td>
                      <td style={cell}>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {o.problems.length > 0 && <div style={{ ...muted, marginTop: '4px', maxWidth: '300px', whiteSpace: 'normal' }}>{o.problems.join(' · ')}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!preview.ok || !canImport || Boolean(busy)} onClick={commit}>
              <Icon name="checkCircle" size={15} /> {busy || `طبّق على ${todo} أمرًا`}
            </button>
            <span style={muted}>الأمرُ المطابقُ لا يُمسّ. وفشلُ أمرٍ لا يوقف إخوتَه — وإعادةُ رفع الورقة نفسِها تُكمل.</span>
          </div>
        </>
      )}
    </>
  );
}
