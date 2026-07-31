import React, { useRef, useState } from 'react';
import {
  analyzeBalancesFile,
  commitBalancesImport,
} from '../../../services/balances/balancesService.js';
import Icon from '../../ui/Icon.jsx';
import { int, num } from '../../odoo/format.js';

/**
 * استيراد ورقة الأرصدة — الكميات لكل (صنف × مخزن × تشغيلة).
 *
 * نفس مبدأ استيراد الأصناف: **لا كتابة قبل معاينة**. يقرأ ورقة «Balances» من
 * القالب القياسي (أو أول ورقة في ملفٍّ برقة واحدة). إعادة الرفع تُحدّث الكمية
 * ولا تُكرّر السطر — المفتاح مركّب (الصنف × المخزن × التشغيلة).
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو (o_ds_card + o_filedrop
 * + o_kpi + o_alert + o_form_actions) على نمط PartnerImport — **المنطق (التحليل
 * والالتزام) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2) عبر format.
 * لا يُلَفّ بـ`.o_theme` (الشاشة الحاضنة توفّره).
 */
export default function BalancesImport({ onDone, onCancel }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');

  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setAnalysis(null);
    setError('');
    setAnalyzing(true);
    try {
      setAnalysis(await analyzeBalancesFile(file));
    } catch (err) {
      setError(err?.message ?? 'تعذّر قراءة الملف.');
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleCommit() {
    if (!analysis?.ok) return;
    setCommitting(true);
    setError('');
    try {
      const { created, updated } = await commitBalancesImport(analysis);
      onDone?.({ created, updated });
    } catch (err) {
      setError(err?.message ?? 'تعذّر الاستيراد — لم يُكتب شيء.');
    } finally {
      setCommitting(false);
    }
  }

  const plan = analysis?.plan;
  const blocking = (analysis?.errors ?? []).filter((e) => e.severity !== 'warning');
  const toWrite = plan ? plan.created.length + plan.updated.length : 0;

  return (
    <div className="o_ds_card o_ds_pad" dir="rtl">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="barChart3" size={18} /> استيراد أرصدة المخزون
          </h3>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '2px 0 14px', lineHeight: 1.6 }}>
            من ورقة <b>Balances</b>: كمية لكل مخزن (E5/E2/E3) وتشغيلة وصلاحية. لا كتابة قبل المعاينة.
          </p>
        </div>
        <a href={`${base}/templates/Brandzo-Items-Template.xlsx`} download className="btn btn-secondary">
          <Icon name="arrowDownTray" size={15} /> تنزيل القالب
        </a>
      </div>

      <label className="o_filedrop">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} disabled={analyzing || committing} />
        {analyzing ? 'جارٍ تحليل الملف…' : 'اختر ملف Excel'}
      </label>
      {fileName && <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)', marginInlineStart: '10px', fontFamily: 'monospace' }}>{fileName}</span>}

      {error && <div className="o_alert danger" style={{ marginTop: '14px' }}>{error}</div>}

      {analysis && (
        <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="o_dashboard_kpis" style={{ margin: 0 }}>
            <Stat label="رصيد جديد" value={plan.created.length} />
            <Stat label="سيُحدَّث" value={plan.updated.length} />
            <Stat label="بلا تغيير" value={plan.unchanged.length} />
            <Stat label="تُخطّي (بلا هوية)" value={plan.skipped.length} alert={plan.skipped.length > 0} />
          </div>

          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
            الورقة: <b>{analysis.summary.sheetName}</b> · صفّ العناوين: {analysis.summary.headerRow} ·
            الأعمدة المتعرَّف عليها: {analysis.summary.detectedColumns.length}
          </p>

          {blocking.length > 0 && (
            <div className="o_alert danger">
              <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> {blocking.length} خطأ يمنع الاستيراد:</div>
              <ul>
                {blocking.slice(0, 12).map((e, i) => (
                  <li key={i}>صفّ {e.row} · {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.updated.length > 0 && (
            <div className="o_ds_card" style={{ padding: '12px 14px', boxShadow: 'none' }}>
              <p style={{ fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)', margin: '0 0 8px' }}>كميات ستتغيّر (عيّنة):</p>
              <ul style={{ margin: 0, paddingInlineStart: '18px', maxHeight: '160px', overflowY: 'auto', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                {plan.updated.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <b style={{ color: 'var(--o-action)', fontFamily: 'monospace' }}>{r.sku || r.barcode}</b> @ {r.warehouse}
                    {r.batch ? ` / ${r.batch}` : ''} · الكمية: {num(r._before?.qty ?? 0)} ← <b>{num(r.qty)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="o_form_actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>إغلاق</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCommit}
              disabled={!analysis.ok || toWrite === 0 || committing}
            >
              {committing ? 'جارٍ الاستيراد…' : toWrite === 0 ? 'لا شيء ليُستورد' : `تأكيد استيراد ${toWrite} رصيدًا`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      <span className="o_kpi_value">{int(value)}</span>
      <span className="o_kpi_label">{label}</span>
    </div>
  );
}
