import React, { useRef, useState } from 'react';
import {
  analyzeBalancesFile,
  commitBalancesImport,
} from '../../../services/balances/balancesService.js';

/**
 * استيراد ورقة الأرصدة — الكميات لكل (صنف × مخزن × تشغيلة).
 *
 * نفس مبدأ استيراد الأصناف: **لا كتابة قبل معاينة**. يقرأ ورقة «Balances» من
 * القالب القياسي (أو أول ورقة في ملفٍّ برقة واحدة). إعادة الرفع تُحدّث الكمية
 * ولا تُكرّر السطر — المفتاح مركّب (الصنف × المخزن × التشغيلة).
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
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-brand-red">📊 استيراد أرصدة المخزون</h3>
          <p className="text-xs text-gray-600 mt-1">
            من ورقة <b>Balances</b>: كمية لكل مخزن (E5/E2/E3) وتشغيلة وصلاحية. لا كتابة قبل المعاينة.
          </p>
        </div>
        <a href={`${base}/templates/Brandzo-Items-Template.xlsx`} download className="text-sm font-bold text-brand-red hover:underline whitespace-nowrap">
          ⬇️ تنزيل القالب
        </a>
      </div>

      <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:border-brand-red hover:text-brand-red transition-colors">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={analyzing || committing} />
        {analyzing ? 'جارٍ تحليل الملف…' : '📂 اختر ملف Excel'}
      </label>
      {fileName && <span className="text-xs text-gray-500 font-mono truncate mr-3">{fileName}</span>}

      {error && <div className="mt-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-bold">{error}</div>}

      {analysis && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="رصيد جديد" value={plan.created.length} tone="green" />
            <Stat label="سيُحدَّث" value={plan.updated.length} tone="amber" />
            <Stat label="بلا تغيير" value={plan.unchanged.length} tone="gray" />
            <Stat label="تُخطّي (بلا هوية)" value={plan.skipped.length} tone="red" />
          </div>

          <p className="text-xs text-gray-500">
            الورقة: <b>{analysis.summary.sheetName}</b> · صفّ العناوين: {analysis.summary.headerRow} ·
            الأعمدة المتعرَّف عليها: {analysis.summary.detectedColumns.length}
          </p>

          {blocking.length > 0 && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm font-bold text-red-700 mb-2">❌ {blocking.length} خطأ يمنع الاستيراد:</p>
              <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
                {blocking.slice(0, 12).map((e, i) => (
                  <li key={i}>صفّ {e.row} · {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.updated.length > 0 && (
            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
              <p className="text-sm font-bold text-gray-700 mb-2">كميات ستتغيّر (عيّنة):</p>
              <ul className="text-xs text-gray-600 space-y-1 max-h-40 overflow-y-auto">
                {plan.updated.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <b className="font-mono">{r.sku || r.barcode}</b> @ {r.warehouse}
                    {r.batch ? ` / ${r.batch}` : ''} · الكمية: {r._before?.qty ?? 0} ← <b>{r.qty}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-1">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded font-bold text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors">
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!analysis.ok || toWrite === 0 || committing}
              className="px-6 py-2 rounded bg-brand-red text-white font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {committing ? 'جارٍ الاستيراد…' : toWrite === 0 ? 'لا شيء ليُستورد' : `تأكيد استيراد ${toWrite} رصيدًا`}
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
  red: 'bg-red-50 border-red-200 text-red-700',
};

function Stat({ label, value, tone }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${TONES[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-bold mt-0.5">{label}</p>
    </div>
  );
}
