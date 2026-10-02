/**
 * استيرادُ بنودِ المستند من إكسل وتصديرُها (طلب المالك ٤ · 2026-10-02).
 *
 * ★★★ **الاستيرادُ يُعرَض قبل أن يُطبَّق.** ملفُّ إكسلٍ من الخارج يحمل أخطاءً
 * حتمًا: عمودٌ ناقص · كمّيّةٌ نصّيّة · صنفٌ مجهول. ومستورِدٌ يكتب ثمّ يُبلّغ
 * قد كتب نصفَ بياناتٍ فاسدة. فالقراءةُ تُعطي **صفوفًا وأخطاءً**، وتُعرَض
 * على المستخدم، ثمّ يقرّر.
 *
 * ★★ و«إضافة» هو الافتراض لا «استبدال»: من استورد ملفًّا خطأً وجد عملَ ساعةٍ
 * مُمحًى، ولا تراجعَ في مسودّةٍ لم تُحفظ بعد.
 *
 * ⚠️ ولا يظهر إلّا على ما يُحرَّر: `saveDocument` لا تقبل غيرَ مسودّةٍ أو
 * مرفوض، و`firestore.rules` تفرضه على الخادم — فاستيرادُ بنودٍ إلى مستندٍ
 * معتمَدٍ **مستحيلٌ بالبناء** لا بالأدب.
 *
 * وكلُّ الحكم في `services/documents/docExcel.js` الخالص المُختبَر (٣٦ اختبارًا).
 */
import { useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { int } from '../../odoo/format.js';
import {
  parseLinesMatrix,
  mergeImportedLines,
  importSummaryLine,
  lineTemplateMatrix,
  linesSheetMatrix,
  lineTemplateHeaders,
  supportsLineImport,
} from '../../../services/documents/docExcel.js';

export default function LinesExcelPanel({ schema, lines, disabled, onChange, onFlash }) {
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!supportsLineImport(schema)) return null;

  /** `xlsx` تُحمَّل عند الطلب — المكتبةُ ~900 ك.ب ولا تلزم أغلبَ الزوّار. */
  const loadXlsx = () => import('xlsx');

  async function readFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      // `cellDates` كي تصل التواريخُ كائناتٍ لا أرقامًا تسلسليّة حين أمكن —
      // و`normalizeDateCell` تتكفّل بالباقي على أيّ حال.
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      setResult(parseLinesMatrix(matrix, schema));
    } catch (e) {
      onFlash?.(`تعذّرت قراءةُ الملفّ: ${e?.message || e}`, 'err');
      setResult(null);
    } finally {
      setBusy(false);
      // تصفيرُ الحقل كي يُقبل الملفُّ نفسُه ثانيةً بعد تصحيحه.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function apply(mode) {
    if (!result?.rows?.length) return;
    onChange(mergeImportedLines(lines, result.rows, mode));
    onFlash?.(`أُضيف ${int(result.rows.length)} بندًا من إكسل.`);
    setResult(null);
  }

  async function download(matrix, name) {
    try {
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws['!cols'] = lineTemplateHeaders(schema).map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'البنود');
      XLSX.writeFile(wb, name);
    } catch (e) {
      onFlash?.(`تعذّر التوليد: ${e?.message || e}`, 'err');
    }
  }

  const code = schema?.formCode || schema?.type || 'doc';

  return (
    <div className="o_theme" dir="rtl" style={{ marginTop: '12px' }}>
      <div className="o_ds_card o_ds_pad" style={{ background: 'var(--o-gray-100)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)' }}>
            <Icon name="arrowDownTray" size={14} /> بنودٌ من إكسل
          </span>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => download(lineTemplateMatrix(schema), `Brandzo-قالب-بنود-${code}.xlsx`)}
          >
            تنزيلُ القالب
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => download(linesSheetMatrix(schema, lines), `Brandzo-بنود-${code}.xlsx`)}
            disabled={!(lines || []).some((l) => l && Object.values(l).some((v) => String(v ?? '').trim()))}
          >
            تصديرُ البنود الحاليّة
          </button>

          {/* ⚠️ الاستيرادُ على ما يُحرَّر وحدَه — ولا يُرسَم زرٌّ يرتدّ من الخادم. */}
          {!disabled && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => readFile(e.target.files?.[0])}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? 'جارٍ القراءة…' : 'استيرادُ ملفّ'}
              </button>
            </>
          )}

          <span style={{ marginInlineStart: 'auto', fontSize: '10.5px', color: 'var(--o-gray-500)' }}>
            العناوينُ المقبولة: {lineTemplateHeaders(schema).slice(0, 4).join(' · ')}…
          </span>
        </div>

        {/* ── المعاينة: ما قُرئ وما سقط ولماذا — قبل أن يُطبَّق ── */}
        {result && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--o-gray-300)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', lineHeight: 1.7 }}>
              {importSummaryLine(result)}
            </p>

            {result.errors.length > 0 && (
              <ul style={{ margin: '0 0 10px', paddingInlineStart: '18px', fontSize: 'var(--o-font-size-xs)', lineHeight: 1.9, color: '#8a6d1b' }}>
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={`${e.row}-${e.column}-${i}`}>
                    {/* رقمُ الصفّ كما يراه المستخدم في إكسل — فيجده ويُصلحه. */}
                    الصفّ <span style={{ fontFamily: 'monospace' }}>{int(e.row)}</span>
                    {e.column ? ` · ${e.column}` : ''} — {e.message}
                  </li>
                ))}
                {result.errors.length > 10 && <li>… و{int(result.errors.length - 10)} خطأً آخر</li>}
              </ul>
            )}

            {result.rows.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => apply('append')}>
                  إضافةُ {int(result.rows.length)} بندًا إلى الجدول
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply('replace')}>
                  استبدالُ البنود كلِّها
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResult(null)}>
                  إلغاء
                </button>
              </div>
            )}
            {result.rows.length === 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResult(null)}>
                إغلاق
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
