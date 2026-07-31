import React, { useRef, useState } from 'react';
import {
  analyzeItemsFile,
  commitItemsImport,
} from '../../../services/items/itemsImportService.js';
import Icon from '../../ui/Icon.jsx';
import { int } from '../../odoo/format.js';

/**
 * استيراد شيت الأصناف من داخل شاشة الأصناف.
 *
 * المبدأ الحاكم: **لا كتابة قبل معاينة** — الملف يُحلَّل ويُعرَض ما سيتغيّر
 * بالضبط (جديد · تحديث · بلا تغيير · أخطاء)، ولا يُكتب حرف إلا بعد تأكيد
 * صريح. الاستيراد يمسّ مرجع البوابة كلّها، فلا يجوز أن يكون زرًّا أعمى.
 *
 * الملف المتوقّع: القالب القياسي `Brandzo-Items-Template.xlsx` (ورقة Items)،
 * لكن المستورد يتقبّل أي شيت بأعمدة معروفة — يكتشف صفّ العناوين بنفسه
 * ويقرأ المرادفات العربية والإنجليزية (بما فيها أعمدة شيت المالك الحرفية).
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو (o_ds_card + o_kpi
 * + o_alert + Icon + format.int) — **منطق التحليل والمعاينة والالتزام لم
 * يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2).
 */
export default function ItemsImport({ onDone, onCancel }) {
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
      setAnalysis(await analyzeItemsFile(file));
    } catch (err) {
      setError(err?.message ?? 'تعذّر قراءة الملف.');
    } finally {
      setAnalyzing(false);
      // يسمح باختيار نفس الملف مجدّدًا بعد تصحيحه خارجيًّا.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleCommit() {
    if (!analysis?.ok) return;
    setCommitting(true);
    setError('');
    try {
      const { created, updated } = await commitItemsImport(analysis);
      onDone?.({ created, updated });
    } catch (err) {
      setError(err?.message ?? 'تعذّر الاستيراد — لم يُكتب شيء.');
    } finally {
      setCommitting(false);
    }
  }

  const plan = analysis?.plan;
  const blockingErrors = (analysis?.errors ?? []).filter((e) => e.severity !== 'warning');
  const warnings = (analysis?.errors ?? []).filter((e) => e.severity === 'warning');
  const toWrite = plan ? plan.created.length + plan.updated.length : 0;

  return (
    <div className="o_ds_card o_ds_pad" dir="rtl">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div>
          <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="arrowDownTray" size={18} /> استيراد شيت الأصناف
          </h3>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: 0, lineHeight: 1.6 }}>
            يُقرأ من ورقة <b>Items</b> (الورقة الأولى). لا يُكتب شيء قبل أن تراجع المعاينة وتؤكّد.
          </p>
        </div>
        <a
          href={`${base}/templates/Brandzo-Items-Template.xlsx`}
          download
          className="btn btn-secondary"
          style={{ whiteSpace: 'nowrap' }}
        >
          <Icon name="fileText" size={15} /> تنزيل القالب القياسي
        </a>
      </div>

      <label className="o_filedrop">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFile}
          disabled={analyzing || committing}
        />
        {analyzing ? 'جارٍ تحليل الملف…' : 'اختر ملف Excel'}
      </label>
      {fileName && <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)', marginInlineStart: '10px', fontFamily: 'monospace' }}>{fileName}</span>}

      {error && <div className="o_alert danger" style={{ marginTop: '14px' }}>{error}</div>}

      {analysis && (
        <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* لقطة التحليل */}
          <div className="o_dashboard_kpis" style={{ margin: 0 }}>
            <Stat label="صنف جديد" value={plan.created.length} />
            <Stat label="سيُحدَّث" value={plan.updated.length} />
            <Stat label="بلا تغيير" value={plan.unchanged.length} />
            <Stat label="باركود جديد" value={plan.newBarcodes} />
          </div>

          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
            الورقة: <b>{analysis.summary.sheetName}</b> · صفّ العناوين: {analysis.summary.headerRow} ·
            الأعمدة المتعرَّف عليها: {analysis.summary.detectedColumns.length}
            {analysis.summary.merged > 0 && <> · دُمجت باركودات من {analysis.summary.merged} صفّ مكرّر</>}
          </p>

          {/* الأخطاء المانعة */}
          {blockingErrors.length > 0 && (
            <div className="o_alert danger">
              <div className="o_alert_title">
                <Icon name="alertTriangle" size={16} /> {blockingErrors.length} خطأ يمنع الاستيراد — صحّح الملف وأعد اختياره:
              </div>
              <ul>
                {blockingErrors.slice(0, 12).map((e, i) => (
                  <li key={i}>
                    صفّ {e.row} · {e.message}
                  </li>
                ))}
                {blockingErrors.length > 12 && <li>… و{blockingErrors.length - 12} أخرى</li>}
              </ul>
            </div>
          )}

          {/* صفوف بلا كود — لن تُستورد (كانت تُسقَط صامتةً قبل هذا الإصلاح) */}
          {plan.skipped && plan.skipped.length > 0 && (
            <div className="o_alert warning">
              <div className="o_alert_title">
                <Icon name="alertTriangle" size={16} /> {plan.skipped.length} صفًّا بلا «كود صنف» — لن يُستورد (الكود هو معرّف الماستر):
              </div>
              <ul>
                {plan.skipped.slice(0, 8).map((row, i) => (
                  <li key={i}>
                    {row.nameAr || row.nameEn || 'صف بلا اسم'}
                    {(row.barcodes || []).length > 0 && <> · باركود: {(row.barcodes || []).join('، ')}</>}
                  </li>
                ))}
                {plan.skipped.length > 8 && <li>… و{plan.skipped.length - 8} أخرى</li>}
              </ul>
            </div>
          )}

          {/* تنبيهات لا تمنع */}
          {warnings.length > 0 && (
            <div className="o_alert warning">
              <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> تنبيهات (لا تمنع الاستيراد):</div>
              <ul>
                {warnings.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    صفّ {e.row} · {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* عيّنة ممّا سيتغيّر على أصناف قائمة */}
          {plan.updated.length > 0 && (
            <div className="o_ds_card" style={{ padding: '12px 14px', boxShadow: 'none' }}>
              <p style={{ fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)', margin: '0 0 8px' }}>ما سيتغيّر على أصناف قائمة (عيّنة):</p>
              <ul style={{ margin: 0, paddingInlineStart: '18px', maxHeight: '160px', overflowY: 'auto', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                {plan.updated.slice(0, 6).map((row) => (
                  <li key={row.sku || row.barcodes?.[0]}>
                    <b style={{ color: 'var(--o-action)', fontFamily: 'monospace' }}>{row.sku || row.barcodes?.[0]}</b>
                    {row._diff?.slice(0, 3).map((d) => (
                      <span key={d.field} style={{ marginInlineStart: '8px' }}>
                        · {d.labelAr}: «{String(d.before) || '—'}» ← «{String(d.after)}»
                      </span>
                    ))}
                    {row._addedBarcodes?.length > 0 && (
                      <span style={{ marginInlineStart: '8px', color: 'var(--o-action)' }}>+ {row._addedBarcodes.length} باركود</span>
                    )}
                  </li>
                ))}
                {plan.updated.length > 6 && <li>… و{plan.updated.length - 6} صنفًا آخر</li>}
              </ul>
            </div>
          )}

          {/* التأكيد */}
          <div className="o_form_actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>إغلاق</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCommit}
              disabled={!analysis.ok || toWrite === 0 || committing}
            >
              {committing
                ? 'جارٍ الاستيراد…'
                : toWrite === 0
                  ? 'لا شيء ليُستورد'
                  : `تأكيد استيراد ${toWrite} صنفًا`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="o_kpi">
      <span className="o_kpi_value">{int(value)}</span>
      <span className="o_kpi_label">{label}</span>
    </div>
  );
}
