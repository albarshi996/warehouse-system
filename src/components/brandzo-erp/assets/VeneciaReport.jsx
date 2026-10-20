/**
 * ورقةُ تقرير مخزن فينسيا ‹VEN-301› — تُعرض، وتُنزَّل إكسلَ منسَّقًا، وتُطبع PDF.
 *
 * ═══ ★★★ ولا رقمَ يُحسب هنا ═══
 * الجسدُ كلُّه من `buildVeneciaReport` المختبَر (١٦ اختبارًا، ومنها دورةُ
 * المصنَّف ذهابًا وإيابًا). والإكسلُ يُلبسه تنسيقًا، وهذه الورقةُ تُلبسه
 * صفحةً — فلا يفترق المخرجان.
 *
 * ═══ ★★ والـPDF يمرّ بالبوّابة الوحيدة ═══
 * `exportElementToPdf` تشترط **عنصرَ DOM** وترفض نصَّ HTML: مسارُ النصّ
 * داخل `html2pdf` يُحيي DOMPurify 3.3.1 المخبوزةَ في بنائها. فيُمرَّر
 * `ref` العنصرِ المرسوم، ولا يُبنى نصٌّ أبدًا.
 *
 * ═══ ★ والورقةُ مرسومةٌ دائمًا لا عند الضغط ═══
 * `html2canvas` يصوّر ما هو **مرسومٌ فعلًا**؛ وعنصرٌ يُنشأ لحظةَ الضغط قد
 * يُصوَّر قبل أن يُحسب تخطيطُه فيخرج مقصوصًا أو فارغًا. فالورقةُ في الشجرة،
 * وتُخفى بصريًّا حين تُطوى.
 */
import { useMemo, useRef, useState } from 'react';

import Icon from '../../ui/Icon.jsx';
import { exportElementToPdf } from '../../../services/reports/pdfExport.js';
import { buildVeneciaReport } from '../../../services/assets/veneciaReport.js';
import { exportVeneciaReportExcel } from '../../../services/assets/veneciaReportExcel.js';
import { todayLocal } from '../../../services/assets/veneciaService.js';

const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

/** قياساتُ A4 بالمليمتر — الورقةُ تُرسم بعرضها الحقيقيّ فلا تُقصّ عند التصدير. */
const SHEET = { width: '190mm', padding: '0 0 6mm' };

function Section({ title, children }) {
  return (
    <section style={{ marginTop: '6mm', breakInside: 'avoid' }}>
      <h3
        style={{
          fontSize: '11pt',
          fontWeight: 800,
          margin: '0 0 2mm',
          paddingBottom: '1mm',
          borderBottom: '0.6mm solid #714B67',
          color: '#1F2430',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

const th = {
  background: '#714B67',
  color: '#fff',
  fontWeight: 700,
  padding: '1.6mm 1.2mm',
  border: '0.2mm solid #D9DCE1',
  fontSize: '8pt',
  textAlign: 'center',
};
const td = {
  padding: '1.2mm',
  border: '0.2mm solid #D9DCE1',
  fontSize: '8pt',
  color: '#1F2430',
};

function Table({ columns, rows, totals, numeric = [] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} style={th}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? '#F4F5F7' : '#fff', breakInside: 'avoid' }}>
            {columns.map((c) => (
              <td
                key={c}
                style={{
                  ...td,
                  textAlign: numeric.includes(c) ? 'center' : 'right',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                dir={numeric.includes(c) ? 'ltr' : undefined}
              >
                {numeric.includes(c) && typeof r[c] === 'number' ? num(r[c]) : r[c]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totals && (
        <tfoot>
          <tr style={{ background: '#EDEFF2', fontWeight: 800 }}>
            {columns.map((c, i) => (
              <td key={c} style={{ ...td, textAlign: numeric.includes(c) ? 'center' : 'right' }} dir={numeric.includes(c) ? 'ltr' : undefined}>
                {i === 0 ? `المجموع (${num(rows.length)})` : totals[c] === undefined ? '' : num(totals[c])}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/**
 * @param {{ assets: object[], cards: object[], scope?: string,
 *           filters?: Array<{label:string,value:string}>, baseUrl?: string }} props
 */
export default function VeneciaReport({ assets = [], cards = [], scope = '', filters = [], baseUrl = '/' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ tone: '', text: '' });
  const sheetRef = useRef(null);

  const asOf = todayLocal();
  const report = useMemo(
    () => buildVeneciaReport(assets, cards, { asOf, scope, filters }),
    [assets, cards, asOf, scope, filters]
  );

  async function run(label, fn, done) {
    setBusy(label);
    setMsg({ tone: '', text: '' });
    try {
      const out = await fn();
      setMsg({ tone: 'ok', text: typeof done === 'function' ? done(out) : done });
    } catch (e) {
      setMsg({ tone: 'bad', text: e?.message || 'تعذّر التصدير.' });
    } finally {
      setBusy('');
    }
  }

  const stem = `تقرير-مخزن-فينسيا-${asOf}`;

  return (
    <section className="o_ds o_ds_card">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="inline-grid place-items-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
          <Icon name="fileText" size={16} />
        </span>
        <div className="flex-1 min-w-[200px]">
          <div className="font-bold text-ink text-sm">تقريرٌ منسَّق</div>
          <div className="text-[11px] text-muted">
            ملخّصٌ وتصنيفاتٌ وجردٌ كاملٌ وبطاقاتُ حركة — بإكسل منسَّقٍ وبـPDF، من مصدرٍ واحد.
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'اطوِ المعاينة' : 'عاينه'}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!!busy}
          onClick={() =>
            run(
              'يُنسَّق…',
              () => exportVeneciaReportExcel(report, { baseUrl, fileName: stem }),
              (name) => `نُزّل ${name} — ثلاثُ أوراق.`
            )
          }
        >
          إكسل منسَّق
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!!busy}
          onClick={() =>
            run(
              'يُطبع…',
              async () => {
                if (!sheetRef.current) throw new Error('ورقةُ التقرير غير مرسومة.');
                setOpen(true);
                await exportElementToPdf(sheetRef.current, {
                  margin: [10, 10, 12, 10],
                  filename: `${stem}.pdf`,
                  html2canvas: { scale: 2, useCORS: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                  pagebreak: { mode: ['css', 'legacy'] },
                });
                return `${stem}.pdf`;
              },
              (name) => `نُزّل ${name}.`
            )
          }
        >
          PDF
        </button>
        {busy && <span className="text-[11px] font-bold text-accent">{busy}</span>}
      </div>

      {msg.text && (
        <div
          className={`mx-3 mb-3 rounded-lg text-xs p-2.5 border ${
            msg.tone === 'bad'
              ? 'border-brand-red/40 bg-brand-red/5 text-brand-red'
              : 'border-accent/40 bg-accent/5 text-ink-2'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ★ الورقةُ في الشجرة دائمًا — تُخفى بصريًّا لا تُنزع، فـ`html2canvas`
          يصوّر ما هو مرسومٌ فعلًا وإلّا خرج المصوَّرُ فارغًا أو مقصوصًا. */}
      <div
        style={
          open
            ? { overflowX: 'auto', padding: '0 12px 12px' }
            : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }
        }
        aria-hidden={!open}
      >
        <div
          ref={sheetRef}
          dir="rtl"
          style={{
            width: SHEET.width,
            padding: SHEET.padding,
            background: '#fff',
            color: '#1F2430',
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            lineHeight: 1.5,
          }}
        >
          <header style={{ borderBottom: '0.8mm solid #714B67', paddingBottom: '2mm' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '4mm' }}>
              <div>
                <div style={{ fontSize: '15pt', fontWeight: 900 }}>{report.title}</div>
                <div style={{ fontSize: '9pt', color: '#5A6778' }}>{report.scope}</div>
              </div>
              <div style={{ fontSize: '9pt', textAlign: 'left' }} dir="ltr">
                {report.asOf}
              </div>
            </div>
            {!!report.filters.length && (
              <div style={{ fontSize: '8pt', color: '#5A6778', marginTop: '1.5mm' }}>
                التصفية: {report.filters.map((f) => `${f.label} = ${f.value}`).join(' · ')}
              </div>
            )}
          </header>

          <Section title="الملخّص">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2mm' }}>
              {report.summary.map((s) => (
                <div
                  key={s.label}
                  style={{ border: '0.2mm solid #D9DCE1', borderRadius: '1.5mm', padding: '1.8mm' }}
                >
                  <div style={{ fontSize: '12pt', fontWeight: 900 }} dir="ltr">
                    {typeof s.value === 'number' ? num(s.value) : s.value}
                  </div>
                  <div style={{ fontSize: '8pt', fontWeight: 700 }}>{s.label}</div>
                  <div style={{ fontSize: '7pt', color: '#8A95A3' }}>{s.note}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="التصنيفات">
            <Table
              columns={['التصنيف', 'الأصول', 'الوحدات']}
              numeric={['الأصول']}
              rows={report.byCategory.map((c) => ({
                التصنيف: c.label,
                الأصول: c.value,
                الوحدات: c.note,
              }))}
            />
          </Section>

          <Section title="الحالات">
            <Table
              columns={['الحالة', 'العدد']}
              numeric={['العدد']}
              rows={report.byCondition.map((c) => ({ الحالة: c.label, العدد: c.value }))}
            />
          </Section>

          {/* ‹VEN-301 ذيل› المصروفُ والمخرَّد — من **نفس** الجسد الذي يبني
              إكسل، فلا يفترق الملفّان. والترتيبُ هنا قبل البطاقات: القارئُ
              يسأل «ماذا خرج ولمن» قبل «كم بطاقةً كُتبت». */}
          <Section title={`المصروف (${num(report.issuedSheet.rows.length)} بندًا)`}>
            {report.issuedSheet.rows.length ? (
              <Table
                columns={report.issuedSheet.columns}
                numeric={['الكمية']}
                rows={report.issuedSheet.rows}
                totals={report.issuedSheet.totals}
              />
            ) : (
              <div style={{ fontSize: '8pt', color: '#8A95A3' }}>
                لا بندَ مصروفًا في هذا النطاق — والمسودّاتُ لا تُحسب حتّى تُثبَّت.
              </div>
            )}
          </Section>

          <Section title={`المخرَّد (${num(report.scrapSheet.rows.length)})`}>
            {report.scrapSheet.rows.length ? (
              <Table
                columns={report.scrapSheet.columns}
                numeric={['الكمية']}
                rows={report.scrapSheet.rows}
                totals={report.scrapSheet.totals}
              />
            ) : (
              <div style={{ fontSize: '8pt', color: '#8A95A3' }}>لا صنفَ مخرَّدًا — لا شيءَ خرج من الجرد.</div>
            )}
          </Section>

          <Section title={`بطاقات الحركة (${num(report.cardsSheet.rows.length)})`}>
            {report.cardsSheet.rows.length ? (
              <Table
                columns={report.cardsSheet.columns}
                numeric={['بنود', 'الوحدات', 'الأثر']}
                rows={report.cardsSheet.rows}
                totals={report.cardsSheet.totals}
              />
            ) : (
              <div style={{ fontSize: '8pt', color: '#8A95A3' }}>لا بطاقةَ حركةٍ في هذا النطاق.</div>
            )}
          </Section>

          <Section title={`الجرد الكامل (${num(report.assetsSheet.rows.length)})`}>
            <Table
              columns={[
                'رقم الأصل',
                'اسم الأصل',
                'المجموعة',
                'التصنيف',
                'الكمية',
                'المعدود',
                'فرق الجرد',
                'الحالة',
              ]}
              numeric={['الكمية', 'المعدود', 'فرق الجرد']}
              rows={report.assetsSheet.rows.map((r) => ({
                'رقم الأصل': r['رقم الأصل'],
                'اسم الأصل': r['اسم الأصل'],
                المجموعة: r['المجموعة'],
                التصنيف: r['التصنيف'],
                الكمية: r['الكمية'],
                المعدود: r['الكمية المعدودة'],
                'فرق الجرد': r['فرق الجرد'],
                الحالة: r['الحالة'],
              }))}
              totals={{
                الكمية: report.assetsSheet.totals['الكمية'],
                المعدود: report.assetsSheet.totals['الكمية المعدودة'],
                'فرق الجرد': report.assetsSheet.totals['فرق الجرد'],
              }}
            />
          </Section>

          <footer
            style={{ marginTop: '5mm', paddingTop: '2mm', borderTop: '0.2mm solid #D9DCE1', fontSize: '7pt', color: '#8A95A3' }}
          >
            بوّابة براندزو — مخزن فينسيا · أُنتج {report.asOf}
          </footer>
        </div>
      </div>
    </section>
  );
}
