/**
 * عرض الطباعة — الورقة الرسمية، مبنيّة من البيانات **المحفوظة**.
 *
 * لماذا عرض مستقلّ بدل طباعة شاشة التحرير؟
 * الورق القديم كان يخفي الحقول عند الطباعة (`input { display:none }`) ثم يزرع
 * «span مرآة» بجانب كل حقل لينسخ قيمته — حيلة هشّة: تُنسى المزامنة فتُطبع ورقة
 * فارغة. هنا لا توجد حقول أصلًا في عرض الطباعة، بل نصّ من المستند المحفوظ.
 * لا شيء يمكن أن يتبخّر.
 *
 * الترتيب والعناوين تتبع `public/forms/form_GRN.html` — الورقة تبقى كما عرفها الناس.
 */
import { useEffect, useRef } from 'react';
import { fieldValue, tableSection } from '../../../services/documents/schemaUtils.js';
import { getState } from '../../../services/documents/states.js';

/** يرسم باركود CODE128 للرقم الرسمي — كما في الورق الأصلي. */
function useBarcode(number, basePath) {
  const ref = useRef(null);

  useEffect(() => {
    if (!number || !ref.current) return;
    let cancelled = false;

    async function draw() {
      try {
        if (!window.JsBarcode) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `${basePath}/lib/JsBarcode.all.min.js`;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        if (cancelled || !ref.current || !window.JsBarcode) return;
        window.JsBarcode(ref.current, number, {
          format: 'CODE128',
          width: 2,
          height: 45,
          displayValue: true,
          fontSize: 13,
          margin: 6,
        });
      } catch {
        // تعذّر تحميل المكتبة — الرقم مطبوع نصًّا فوقه على أي حال.
      }
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [number, basePath]);

  return ref;
}

function show(v) {
  return v === '' || v == null ? '—' : String(v);
}

export default function DocumentPrint({ schema, doc, basePath }) {
  const barcodeRef = useBarcode(doc?.number, basePath);
  const table = tableSection(schema);
  const state = getState(doc?.state);
  const checklist = doc?.header?._checklist || {};

  return (
    <div className="doc-print" dir="rtl">
      <style>{PRINT_CSS}</style>

      <header className="dp-head">
        <div className="dp-brand">
          <span className="dp-logo">BFP</span>
          <div>
            <strong>Brandzo</strong>
            <small>Franchise Partners</small>
          </div>
        </div>
        <div className="dp-title">
          <h1>
            {schema.titleAr} — {schema.titleEn}
          </h1>
          <p className="dp-meta">
            النموذج رقم: <span className="dp-code">{schema.formCode}</span>
          </p>
        </div>
        <div className="dp-number">
          {doc?.number ? (
            <svg ref={barcodeRef} />
          ) : (
            <span className="dp-draft">مسودّة — بلا رقم رسمي</span>
          )}
        </div>
      </header>

      {/* شريط الحالة الرسمي — لا يوجد في الورق، وهو أهم ما يُضاف إليه */}
      <div className="dp-status">
        <span>
          الحالة: <strong>{state.label}</strong>
        </span>
        <span>
          أنشأه: <strong>{show(doc?.createdByName)}</strong>
        </span>
        <span>
          اعتمده: <strong>{show(doc?.approvedByName)}</strong>
        </span>
      </div>

      {(schema.sections || []).map((section) => {
        if (section.kind === 'fields') {
          const fields = [...(section.fields || []), ...(section.extraFields || [])];
          return (
            <section key={section.key}>
              <h2 className="dp-section">{section.title}</h2>
              {section.note && <p className="dp-note">{section.note}</p>}
              <div className="dp-grid" style={{ '--cols': section.columns || 3 }}>
                {fields.map((f) => (
                  <div key={f.key} className="dp-field">
                    <span className="dp-label">{f.label}</span>
                    <span className="dp-value">
                      {f.kind === 'boolean'
                        ? doc?.header?.[f.key]
                          ? '☑ نعم'
                          : '☐ لا'
                        : show(fieldValue(f, doc))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (section.kind === 'table' && table) {
          return (
            <section key={section.key}>
              <h2 className="dp-section">{section.title}</h2>
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {table.columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(doc?.lines || []).map((line, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      {table.columns.map((c) => (
                        <td key={c.key} style={c.ltr ? { direction: 'ltr' } : undefined}>
                          {show(line[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        }

        if (section.kind === 'checklist') {
          return (
            <section key={section.key}>
              <h2 className="dp-section">{section.title}</h2>
              <div className="dp-grid" style={{ '--cols': 2 }}>
                {(section.items || []).map((item) => {
                  const s = checklist[item.key] || {};
                  return (
                    <div key={item.key} className="dp-check">
                      <span className="dp-mark">{s.checked ? '☑' : s.na ? '⊘' : '☐'}</span>
                      <span>{item.label}</span>
                      {s.na && <em className="dp-na">لا ينطبق</em>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }
        return null;
      })}

      <div className="dp-signs">
        {(schema.signatures || []).map((s) => (
          <div key={s.key} className="dp-sign">
            <div className="dp-sign-name">
              {s.source === 'creator'
                ? show(doc?.createdByName)
                : s.source === 'approver'
                  ? show(doc?.approvedByName)
                  : ' '}
            </div>
            <div className="dp-sign-line" />
            <div className="dp-sign-label">{s.label}</div>
          </div>
        ))}
      </div>

      <footer className="dp-foot">
        <span>Brandzo — نادي الأهلي، بنغازي، ليبيا</span>
        <span dir="ltr">0912203770 · www.brandzo.com</span>
      </footer>
    </div>
  );
}

/**
 * أنماط الورقة. مكتوبة هنا لا في Tailwind لأنها أنماط طباعة بحتة
 * (مقاسات mm وحدود سوداء) لا معنى لها على الشاشة.
 */
const PRINT_CSS = `
.doc-print { display: none; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body { background: #fff !important; }
  .doc-screen, .no-print { display: none !important; }
  /* في التدفّق الطبيعي لا مطلقًا: الطباعة المطلقة/الثابتة تقصّ الصفحات التالية. */
  .doc-print {
    display: block !important;
    background: #fff; color: #000; font-family: Cairo, sans-serif; font-size: 9pt;
    padding: 0; width: 100%;
  }
  .doc-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .dp-head { display: flex; align-items: center; justify-content: space-between;
    gap: 8mm; border-bottom: 2px solid #c41e3a; padding-bottom: 3mm; margin-bottom: 3mm; }
  .dp-brand { display: flex; align-items: center; gap: 3mm; }
  .dp-logo { background: #c41e3a; color: #fff; font-weight: 800; padding: 2mm 3mm;
    border-radius: 2mm; letter-spacing: .5px; }
  .dp-brand strong { display: block; font-size: 12pt; }
  .dp-brand small { color: #666; font-size: 7pt; }
  .dp-title { text-align: center; flex: 1; }
  .dp-title h1 { font-size: 13pt; font-weight: 800; margin: 0; }
  .dp-meta { font-size: 7.5pt; color: #555; margin: 1mm 0 0; }
  .dp-code { font-family: monospace; color: #DAAA3C; font-weight: 700; }
  .dp-number { min-width: 45mm; text-align: left; }
  .dp-draft { color: #c41e3a; font-weight: 700; font-size: 9pt; border: 1px dashed #c41e3a;
    padding: 2mm 3mm; border-radius: 2mm; }

  .dp-status { display: flex; gap: 6mm; background: #f5f5f5; border: 1px solid #ddd;
    padding: 1.5mm 3mm; border-radius: 1.5mm; font-size: 8pt; margin-bottom: 3mm; }

  .dp-section { font-size: 9.5pt; font-weight: 800; background: #1e3a5f; color: #fff;
    padding: 1.5mm 3mm; border-radius: 1.5mm; margin: 3mm 0 2mm; break-after: avoid; }
  .dp-note { font-size: 7.5pt; color: #c41e3a; margin: 0 0 2mm; font-weight: 600; }

  .dp-grid { display: grid; grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 2mm 4mm; }
  .dp-field { display: flex; flex-direction: column; border-bottom: 1px dotted #999; padding-bottom: 1mm; }
  .dp-label { font-size: 7pt; color: #666; }
  .dp-value { font-size: 9pt; font-weight: 700; min-height: 4mm; }

  .dp-check { display: flex; align-items: center; gap: 2mm; font-size: 8pt; }
  .dp-mark { font-size: 11pt; line-height: 1; }
  .dp-na { color: #888; font-size: 7pt; }

  .dp-table { width: 100%; border-collapse: collapse; break-inside: auto; }
  .dp-table th, .dp-table td { border: 1px solid #333; padding: 1.2mm 1.5mm;
    font-size: 7.5pt; text-align: right; }
  .dp-table th { background: #eee; font-weight: 800; font-size: 7pt; }
  .dp-table tr { break-inside: avoid; }

  .dp-signs { display: flex; gap: 8mm; margin-top: 6mm; break-inside: avoid; }
  .dp-sign { flex: 1; text-align: center; }
  .dp-sign-name { font-size: 8.5pt; font-weight: 700; min-height: 5mm; }
  .dp-sign-line { border-top: 1px solid #333; margin: 1mm 0; }
  .dp-sign-label { font-size: 7.5pt; color: #555; }

  .dp-foot { display: flex; justify-content: space-between; margin-top: 5mm;
    border-top: 1px solid #ddd; padding-top: 1.5mm; font-size: 7pt; color: #666; }
}
`;
