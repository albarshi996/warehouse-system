import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import {
  analyzeBalancesFile,
  canEditBalances,
  commitBalancesImport,
} from '../../../services/balances/balancesService.js';
import { exportTemplate } from '../../../services/excel/excelExport.js';
import {
  assignmentNotes,
  assignmentReport,
  directablePct,
} from '../../../services/locations/binAssignment.js';

/**
 * إسناد الأصناف إلى مواقعها — قالبٌ يُرفع فيُعرف أين كلّ صنف (طلب المالك).
 *
 * ═══ ولماذا شاشةٌ ولم يكن الاستيراد قائمًا؟ ═══
 * كان قائمًا: ورقة الأرصدة تحمل عمود الموقع منذ ‹LOC-106›، وشاشةُ استيرادها
 * في «الأصناف». **والناقصُ حارسٌ**: كودُ الموقع يُطبَّع عند الحفظ ولا
 * يُتحقَّق أنّه **موقعٌ معرَّف**. فمن كتب رفًّا لا وجود له يُقبل صفُّه ويُكتب
 * رصيده، ثمّ يذهب العامل إلى رفٍّ لا يجده — والرصيدُ في مكانٍ لا يعرفه أحد.
 *
 * فهذه الشاشة تقرأ الورقة نفسها بالمستورد نفسه (`analyzeBalancesFile` ·
 * `commitBalancesImport`) — **بلا منطقِ حفظٍ جديد** — لكنّها تقرؤها **بعين
 * الموقع**: تُصنّف الصفوف ثلاثًا، وتمنع الاعتماد على المجهول وحده.
 *
 * ═══ ثلاث حالاتٍ لا حالتان ═══
 *   · **قابلٌ للتوجيه** — موقعٌ معرَّفٌ في البانية. هذا وحده يدخل مسار السحب.
 *   · **بلا موقع** — رصيدُ مستودعٍ مجمَل: مشروعٌ، وغيرُ موجَّه. يُعدّ ولا يُمنع.
 *   · **موقعٌ مجهول** — رفٌّ لا وجود له. **هذا وحده يمنع الاعتماد.**
 */

const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);

export default function BinAssignment() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    return listenLocations(setLocations, (e) => setError(e?.message || 'تعذّرت قراءة المواقع.'));
  }, [me]);

  const knownCodes = useMemo(
    () => (locations || []).filter((l) => l?.active !== false).map((l) => l.code),
    [locations]
  );

  const report = useMemo(
    () => (analysis ? assignmentReport(analysis.rows || [], knownCodes) : null),
    [analysis, knownCodes]
  );
  const notes = useMemo(() => (report ? assignmentNotes(report) : []), [report]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setDone(null); setAnalysis(null);
    setBusy('يقرأ الورقة…');
    try {
      const result = await analyzeBalancesFile(file);
      setFileName(file.name);
      setAnalysis(result);
      if (!result.rows?.length) setError('لا صفوف صالحة — راجع الأخطاء أدناه أو نزّل القالب.');
    } catch (err) {
      setError(err?.message || 'تعذّرت قراءة الملف.');
    } finally {
      setBusy('');
      e.target.value = '';
    }
  }

  async function commit() {
    if (!analysis || !report?.ok) return;
    setBusy('يعتمد…'); setError('');
    try {
      const out = await commitBalancesImport(analysis);
      setDone({ created: out?.created ?? 0, updated: out?.updated ?? 0 });
      setAnalysis(null);
    } catch (err) {
      setError(err?.message || 'تعذّر الاعتماد.');
    } finally {
      setBusy('');
    }
  }

  function downloadTemplate() {
    setError('');
    try {
      exportTemplate('balances');
    } catch (err) {
      setError(err?.message || 'تعذّر توليد القالب.');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!canEditBalances(me.role)) return <Notice>إسناد المواقع لمن يملك تحرير الأرصدة.</Notice>;

  const plan = analysis?.plan;

  return (
    <div dir="rtl" className="space-y-6">
      {/* ═══ الطبقة ١ — القالب والرفع ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
            <Icon name="fileUp" size={18} />
          </span>
          <div className="flex-1 min-w-[220px]">
            <div className="font-bold text-ink">ورقة الأصناف ومواقعها</div>
            <div className="text-xs text-muted leading-relaxed">
              أعمدةٌ لازمة: <span className="font-mono">Warehouse</span> و<span className="font-mono">Qty</span>.
              والموقع <span className="font-mono">Location</span> هو ما يجعل الصنف قابلًا للتوجيه.
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={downloadTemplate}>نزّل القالب</button>
          <label className="btn btn-primary btn-sm cursor-pointer">
            اختر ملفًّا
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" disabled={!!busy} />
          </label>
        </div>
        <div className="text-[11px] text-muted">
          {knownCodes.length
            ? `${num(knownCodes.length)} موقعًا معرَّفًا في البوابة — وبها يُتحقَّق من كلّ رفٍّ في ورقتك.`
            : 'لا موقعَ معرَّفًا بعد — عرّفها في «بانية مواقع التخزين» أوّلًا، وإلّا قُبل كلُّ رفٍّ بلا تحقّق.'}
        </div>
        {fileName && <div className="text-xs text-muted">آخر ملف: {fileName}</div>}
        {busy && <div className="text-xs text-accent font-bold">{busy}</div>}
        {error && <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-xs p-2.5">{error}</div>}
      </section>

      {done && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 flex items-center gap-2">
          <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
          <span className="text-ink-2">
            اعتُمد الإسناد — أُنشئ {num(done.created)} رصيدًا وحُدّث {num(done.updated)}.
          </span>
        </div>
      )}

      {report && (
        <>
          {/* ═══ الطبقة ٢ — بعين الموقع ═══ */}
          <section className="o_ds o_ds_card">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
              <Kpi label="صفوف الورقة" value={num(report.total)} hint={`${directablePct(report)}٪ قابلٌ للتوجيه`} />
              <Kpi label="مُسنَدٌ ومعروف" value={num(report.assigned)} hint="يدخل مسار السحب" />
              <Kpi label="بلا موقع" value={num(report.unassigned)} hint="رصيدٌ مجمَل — غيرُ موجَّه" />
              <Kpi label="رفٌّ مجهول" value={num(report.unknown)} hint="يمنع الاعتماد" tone={report.unknown ? 'red' : ''} />
            </div>
          </section>

          {notes.length > 0 && (
            <section className={`o_ds o_ds_card o_ds_pad ${report.ok ? '' : 'border border-brand-red/40 bg-brand-red/5'}`}>
              <ul className="text-xs leading-relaxed space-y-1.5 list-none p-0 m-0 text-ink-2">
                {notes.map((n, i) => <li key={i}>• {n}</li>)}
              </ul>
            </section>
          )}

          {/* ═══ الرفوف المجهولة — تُسمّى بأكوادها ═══ */}
          {report.unknownRows.length > 0 && (
            <section className="o_ds o_ds_card overflow-x-auto">
              <div className="px-4 py-3 border-b border-line font-bold text-ink text-sm">
                رفوفٌ لا وجود لها ({num(report.unknownRows.length)})
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-line">
                    <Th>الصنف</Th><Th>الرفّ المكتوب</Th><Th>المستودع</Th><Th align="left">الكمّيّة</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.unknownRows.slice(0, 60).map((r, i) => (
                    <tr key={`${r.sku}-${r.bin}-${i}`} className="border-b border-line/60">
                      <Td className="font-mono">{r.sku || '—'}</Td>
                      <Td className="font-mono text-brand-red">{r.bin}</Td>
                      <Td>{r.warehouse}</Td>
                      <Td align="left">{num(r.qty)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.unknownRows.length > 60 && (
                <div className="px-4 py-2 text-[11px] text-muted border-t border-line">
                  يُعرض 60 من {num(report.unknownRows.length)}.
                </div>
              )}
            </section>
          )}

          {/* ═══ الطبقة ٣ — التوزيع والاعتماد ═══ */}
          <section className="o_ds o_ds_card o_ds_pad space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              {plan && (
                <span className="text-xs text-ink-2">
                  جديد <b>{num(plan.created.length)}</b> · محدَّث <b>{num(plan.updated.length)}</b> ·
                  بلا تغيير <b>{num(plan.unchanged.length)}</b>
                  {plan.skipped.length ? ` · متخطًّى ${num(plan.skipped.length)}` : ''}
                </span>
              )}
              <div className="flex-1" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!!busy || !report.ok || !analysis?.ok}
                onClick={commit}
                title={!report.ok ? 'عرِّف الرفوف المجهولة أوّلًا' : ''}
              >
                اعتمد الإسناد
              </button>
            </div>
            {report.byWarehouse.length > 0 && (
              <div className="text-[11px] text-muted flex flex-wrap gap-x-4 gap-y-1">
                {report.byWarehouse.map((w) => (
                  <span key={w.warehouse}>
                    <b className="text-ink-2">{w.warehouse}</b>: {num(w.assigned)} مُسنَد
                    {w.unassigned ? ` · ${num(w.unassigned)} بلا موقع` : ''}
                    {w.unknown ? ` · ${num(w.unknown)} مجهول` : ''}
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <p className="text-[11px] text-muted text-center leading-relaxed">
        تُقرأ الورقة بالمستورد القائم نفسه — لا مخزنَ ثانٍ للأرصدة. والذي أُضيف هنا
        حارسُ الموقع: رفٌّ لا وجود له يُوقف الاعتماد قبل أن يصير رصيدًا لا يجده أحد.
      </p>
    </div>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

const Th = ({ children, align }) => (
  <th className={`px-3 py-2 font-bold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);
const Td = ({ children, align, className = '' }) => (
  <td className={`px-3 py-2 ${align === 'left' ? 'text-left font-mono' : 'text-right'} ${className}`}>{children}</td>
);

function Notice({ children }) {
  return <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>;
}
