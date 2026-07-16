/**
 * بطاقة طباعة المرشح — ورقة رسمية تُطبع بعد إنشاء البطاقة أو تعديلها.
 *
 * مخفية على الشاشة، تظهر وحدها عند الطباعة (نفس نمط DocumentPrint في
 * محرّك المستندات): لا حقول ولا أزرار — نصّ من البيانات المحفوظة.
 */
import { candidateState } from '../../../services/recruitment/candidatesService.js';

function fmtDate(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });
}

function show(v) {
  return v === '' || v == null || v === 0 ? '—' : String(v);
}

export default function CandidatePrint({ candidate: c, job }) {
  const st = candidateState(c.state);

  return (
    <div className="candidate-print" dir="rtl">
      <style>{PRINT_CSS}</style>

      <header className="cp-head">
        <div className="cp-brand">
          <span className="cp-logo">BFP</span>
          <div>
            <strong>Brandzo</strong>
            <small>Franchise Partners</small>
          </div>
        </div>
        <div className="cp-title">
          <h1>بطاقة مرشّح للتوظيف</h1>
          <p>Candidate Card — إدارة الموارد البشرية</p>
        </div>
        <div className="cp-state" style={{ color: st.color, borderColor: st.color }}>
          {st.label}
        </div>
      </header>

      <section className="cp-hero">
        <h2>{show(c.name)}</h2>
        <p className="cp-job">
          {job?.icon} {show(c.jobTitle)}
          {job?.layer ? ` — ${job.layer}` : ''}
        </p>
      </section>

      <section className="cp-grid">
        <Field label="الهاتف" value={show(c.phone)} ltr />
        <Field label="البريد الإلكتروني" value={show(c.email)} ltr />
        <Field label="المؤهل العلمي" value={show(c.qualification)} />
        <Field label="سنوات الخبرة" value={c.experienceYears ? `${c.experienceYears} سنة` : '—'} />
        <Field label="الراتب المتوقّع" value={c.expectedSalary ? `${Number(c.expectedSalary).toLocaleString('ar-LY')} د.ل` : '—'} />
        <Field label="السيرة الذاتية" value={c.hasCv ? `مرفقة (${c.cvMeta?.kind || 'ملف'})` : 'غير مرفقة'} />
        <Field label="تاريخ التقديم" value={fmtDate(c.createdAt)} />
        <Field label="أضافه" value={show(c.byName)} />
      </section>

      {job?.duties?.length > 0 && (
        <section>
          <h3 className="cp-section">الوصف الوظيفي للمنصب</h3>
          <p className="cp-sub">التبعية: {show(job.reportingTo)} · المؤشرات: {show(job.kpis)}</p>
          <ul className="cp-duties">
            {job.duties.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {c.notes && (
        <section>
          <h3 className="cp-section">ملاحظات</h3>
          <p className="cp-notes">{c.notes}</p>
        </section>
      )}

      <div className="cp-signs">
        <div className="cp-sign">
          <div className="cp-sign-line" />
          <span>مسؤول التوظيف</span>
        </div>
        <div className="cp-sign">
          <div className="cp-sign-line" />
          <span>المدير المختصّ</span>
        </div>
        <div className="cp-sign">
          <div className="cp-sign-line" />
          <span>الاعتماد النهائي</span>
        </div>
      </div>

      <footer className="cp-foot">
        <span>Brandzo — نادي الأهلي، بنغازي، ليبيا</span>
        <span dir="ltr">0912203770 · www.brandzo.com</span>
      </footer>
    </div>
  );
}

function Field({ label, value, ltr }) {
  return (
    <div className="cp-field">
      <span className="cp-label">{label}</span>
      <span className="cp-value" style={ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}>
        {value}
      </span>
    </div>
  );
}

const PRINT_CSS = `
.candidate-print { display: none; }
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  body { background: #fff !important; min-height: 0 !important; }
  /* نُخفي أطراف البوابة بأسمائها — لا بـ body>*:not() فبطاقة الطباعة
     متداخلة داخل <main> لا ابنًا مباشرًا للـ body. */
  #bz-auth-overlay, #brandzo-mobile-header, aside, .recruit-screen, .no-print {
    display: none !important;
  }
  main { margin: 0 !important; padding: 0 !important; }

  .candidate-print {
    display: block !important; background: #fff; color: #111;
    font-family: Cairo, sans-serif; font-size: 10pt;
  }
  .candidate-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .cp-head { display: flex; align-items: center; justify-content: space-between;
    gap: 8mm; border-bottom: 2px solid #c41e3a; padding-bottom: 3mm; margin-bottom: 4mm; }
  .cp-brand { display: flex; align-items: center; gap: 3mm; }
  .cp-logo { background: #c41e3a; color: #fff; font-weight: 800; padding: 2mm 3mm; border-radius: 2mm; }
  .cp-brand strong { display: block; font-size: 13pt; }
  .cp-brand small { color: #666; font-size: 7.5pt; }
  .cp-title { text-align: center; flex: 1; }
  .cp-title h1 { font-size: 15pt; font-weight: 800; margin: 0; }
  .cp-title p { font-size: 8pt; color: #555; margin: 1mm 0 0; }
  .cp-state { border: 1.5px solid; border-radius: 999px; padding: 1.5mm 4mm; font-weight: 800; font-size: 9pt; white-space: nowrap; }

  .cp-hero { text-align: center; margin: 4mm 0; }
  .cp-hero h2 { font-size: 18pt; font-weight: 800; margin: 0; color: #1e3a5f; }
  .cp-job { font-size: 10pt; color: #444; margin: 1.5mm 0 0; }

  .cp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm 8mm; margin: 4mm 0; }
  .cp-field { display: flex; justify-content: space-between; gap: 3mm;
    border-bottom: 1px dotted #bbb; padding-bottom: 1.5mm; }
  .cp-label { color: #666; font-size: 9pt; }
  .cp-value { font-weight: 700; font-size: 10pt; }

  .cp-section { font-size: 10pt; font-weight: 800; background: #1e3a5f; color: #fff;
    padding: 1.5mm 3mm; border-radius: 1.5mm; margin: 4mm 0 2mm; }
  .cp-sub { font-size: 8pt; color: #555; margin: 0 0 2mm; }
  .cp-duties { margin: 0; padding-right: 6mm; }
  .cp-duties li { font-size: 8.5pt; margin-bottom: 1mm; }
  .cp-notes { font-size: 9pt; white-space: pre-wrap; }

  .cp-signs { display: flex; gap: 10mm; margin-top: 12mm; break-inside: avoid; }
  .cp-sign { flex: 1; text-align: center; }
  .cp-sign-line { border-top: 1px solid #333; margin-bottom: 1.5mm; }
  .cp-sign span { font-size: 8.5pt; color: #555; }

  .cp-foot { display: flex; justify-content: space-between; margin-top: 8mm;
    border-top: 1px solid #ddd; padding-top: 2mm; font-size: 7.5pt; color: #666; }
}
`;
