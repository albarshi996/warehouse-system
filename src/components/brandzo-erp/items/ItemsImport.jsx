import React, { useRef, useState } from 'react';
import {
  analyzeItemsFile,
  commitItemsImport,
} from '../../../services/items/itemsImportService.js';

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
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-brand-red">📥 استيراد شيت الأصناف</h3>
          <p className="text-xs text-gray-600 mt-1">
            يُقرأ من ورقة <b>Items</b> (الورقة الأولى). لا يُكتب شيء قبل أن تراجع المعاينة وتؤكّد.
          </p>
        </div>
        <a
          href={`${base}/templates/Brandzo-Items-Template.xlsx`}
          download
          className="text-sm font-bold text-brand-red hover:underline whitespace-nowrap"
        >
          ⬇️ تنزيل القالب القياسي
        </a>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:border-brand-red hover:text-brand-red transition-colors">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFile}
            disabled={analyzing || committing}
          />
          {analyzing ? 'جارٍ تحليل الملف…' : '📂 اختر ملف Excel'}
        </label>
        {fileName && <span className="text-xs text-gray-500 font-mono truncate">{fileName}</span>}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {analysis && (
        <div className="mt-5 space-y-4">
          {/* لقطة التحليل */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="صنف جديد" value={plan.created.length} tone="green" />
            <Stat label="سيُحدَّث" value={plan.updated.length} tone="amber" />
            <Stat label="بلا تغيير" value={plan.unchanged.length} tone="gray" />
            <Stat label="باركود جديد" value={plan.newBarcodes} tone="blue" />
          </div>

          <p className="text-xs text-gray-500">
            الورقة: <b>{analysis.summary.sheetName}</b> · صفّ العناوين: {analysis.summary.headerRow} ·
            الأعمدة المتعرَّف عليها: {analysis.summary.detectedColumns.length}
            {analysis.summary.merged > 0 && <> · دُمجت باركودات من {analysis.summary.merged} صفّ مكرّر</>}
          </p>

          {/* الأخطاء المانعة */}
          {blockingErrors.length > 0 && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm font-bold text-red-700 mb-2">
                ❌ {blockingErrors.length} خطأ يمنع الاستيراد — صحّح الملف وأعد اختياره:
              </p>
              <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
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
            <div className="p-3 rounded-lg border border-orange-300 bg-orange-50">
              <p className="text-sm font-bold text-orange-700 mb-2">
                🚫 {plan.skipped.length} صفًّا بلا «كود صنف» — لن يُستورد (الكود هو معرّف الماستر):
              </p>
              <ul className="text-xs text-orange-700 space-y-1 max-h-32 overflow-y-auto">
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
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-sm font-bold text-amber-700 mb-2">⚠️ تنبيهات (لا تمنع الاستيراد):</p>
              <ul className="text-xs text-amber-700 space-y-1 max-h-32 overflow-y-auto">
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
            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
              <p className="text-sm font-bold text-gray-700 mb-2">ما سيتغيّر على أصناف قائمة (عيّنة):</p>
              <ul className="text-xs text-gray-600 space-y-1 max-h-40 overflow-y-auto">
                {plan.updated.slice(0, 6).map((row) => (
                  <li key={row.sku || row.barcodes?.[0]}>
                    <b className="font-mono">{row.sku || row.barcodes?.[0]}</b>
                    {row._diff?.slice(0, 3).map((d) => (
                      <span key={d.field} className="mr-2">
                        · {d.labelAr}: «{String(d.before) || '—'}» ← «{String(d.after)}»
                      </span>
                    ))}
                    {row._addedBarcodes?.length > 0 && (
                      <span className="mr-2 text-blue-600">+ {row._addedBarcodes.length} باركود</span>
                    )}
                  </li>
                ))}
                {plan.updated.length > 6 && <li>… و{plan.updated.length - 6} صنفًا آخر</li>}
              </ul>
            </div>
          )}

          {/* التأكيد */}
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded font-bold text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!analysis.ok || toWrite === 0 || committing}
              className="px-6 py-2 rounded bg-brand-red text-white font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

const TONES = {
  green: 'bg-green-50 border-green-200 text-green-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  gray: 'bg-gray-50 border-gray-200 text-gray-600',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
};

function Stat({ label, value, tone }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${TONES[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-bold mt-0.5">{label}</p>
    </div>
  );
}
