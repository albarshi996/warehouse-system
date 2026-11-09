/**
 * لوحةُ المصاريف المبوّبة (ذ · «تقريرٌ نظيفٌ لكلّ فئة») + **الإدخالُ السريع بالفاتورة**
 * (‹EXP-INV› · طلب المالك 2026-11-09): «نظامُ تسجيل مصروفات وفق رقم الفاتورة سهلٌ
 * ويطبع تقريرًا — فالحاليُّ متعقّد».
 *
 * أربعُ طبقات:
 *   ① تدخّلٌ الآن   — إجماليُّ المصروف والسلفُ القائمة للمحلّ الفعّال.
 *   ② إدخالٌ سريع  — تسجيلُ مصروفٍ بالفاتورة بخطوةٍ واحدة (يُنشئ EXP ويُقيَّده فورًا).
 *   ③ فهرسٌ        — المصروفُ لكلّ فئة (كلُّ أنواع المصاريف).
 *   ④ تقريرٌ       — مصاريفُ الفواتير (EXP) بتصفيةِ مدًى وفئة، تُطبع A4 وتُصدَّر إكسل.
 *
 * التسجيلُ يبني على مستند EXP نفسِه (مصدرٌ واحد: يُقيَّد في دفتر الجهاز ويظهر في
 * الفهرس والتقرير) — لا دفترَ موازٍ. أرقامٌ لاتينيّة، بلا إيموجي، الأحمرُ للتحذير.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { getActiveShop, subscribeActiveShop } from '../../../services/shops/shopStore.js';
import { expenseSummary } from '../../../services/accounting/expenseSummary.js';
import { EXP_DOC_CATEGORIES, categoryLabel } from '../../../services/accounting/expenseCategories.js';
import { expenseReport, expenseReportAoa } from '../../../services/accounting/expenseReport.js';
import { recordExpense } from '../../../services/accounting/expenseEntryService.js';
import { canRecordExpense, EXPENSE_METHODS } from '../../../services/accounting/expenseEntry.js';
import { exportAoaSheets } from '../../../services/excel/excelExport.js';
import ShopSwitcher from '../shops/ShopSwitcher.jsx';

// الاطّلاعُ أوسعُ من التسجيل: أمينُ الخزينة يرى التقاريرَ ولا يُسجّل بخطوةٍ واحدة
// (لا يملك الاعتماد) — فيُطابق رسالةَ الحجب و`EXPENSE_RECORD_ROLES`.
const VIEWER_ROLES = ['admin', 'warehouse_manager', 'finance_manager', 'treasury'];
const EXPENSE_TYPES = ['EXP', 'SAL', 'ADV', 'ADVR', 'TAXI', 'LABOR', 'CLEAN'];
// سقفُ القراءة: تقريرٌ ماليٌّ لا يصحّ أن يُسقط بندًا صامتًا. السقفُ مرفوعٌ فالعتبةُ
// بعيدةٌ (سنواتُ تشغيلٍ لموقع)، وعند بلوغه يُحذَّر وتُعطَّل الطباعةُ والتصدير فلا
// يُؤرشَف إجماليٌّ جزئيٌّ كأنّه كامل (مراجعةٌ عدائيّة 2026-11-09).
const DOCS_CAP = 1500;

const card = 'rounded-xl border border-line bg-surface p-4';
const inputCls =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent/60';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ExpensesBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [shop, setShop] = useState(getActiveShop());

  // تصفيةُ التقرير.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [printing, setPrinting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => subscribeActiveShop((s) => setShop(s)), []);

  useEffect(() => {
    if (!me || !VIEWER_ROLES.includes(me.role)) return undefined;
    return listenDocumentsByTypes(EXPENSE_TYPES, setDocs, DOCS_CAP);
  }, [me]);

  // بلوغُ السقف: المجموعةُ قد تكون مقصوصةً فالتقريرُ جزئيّ — يُحذَّر وتُمنع الطباعة.
  const saturated = docs.length >= DOCS_CAP;

  const summary = useMemo(() => expenseSummary(docs, { shop }), [docs, shop]);
  const report = useMemo(
    () => expenseReport(docs, { shop, from, to, category: fCategory }),
    [docs, shop, from, to, fCategory]
  );

  // الطباعةُ بعد رسمِ العرض المخفيّ، وتُمسح عند الانتهاء.
  useEffect(() => {
    if (!printing) return undefined;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* الطباعةُ غيرُ متاحة. */
      }
    }, 60);
    const after = () => setPrinting(false);
    window.addEventListener('afterprint', after);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [printing]);

  function onExcel() {
    setExportErr('');
    try {
      const stamp = `${from || 'الكل'}_${to || 'الكل'}`;
      exportAoaSheets([{ name: 'تقرير المصروفات', aoa: expenseReportAoa(report) }], `تقرير-المصروفات-${stamp}.xlsx`);
    } catch (e) {
      setExportErr(e?.message || 'تعذّر توليد ملفّ إكسل.');
    }
  }

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!VIEWER_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">لوحةُ المصاريف محصورةٌ بالمديرَين والمالي والخزينة.</p>;
  }

  const canRecord = canRecordExpense(me.role);
  const rangeText = from || to ? `${from || '…'} ← ${to || '…'}` : 'كامل المدّة';
  const catText = fCategory ? categoryLabel(fCategory) : 'كلُّ الفئات';

  return (
    <>
      <div className="space-y-5 exp-screen">
        {/* ═══ الطبقة ١: تدخّل الآن ═══ */}
        <section className={card}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <ShopSwitcher />
            <span className="text-xs text-ink-2">المصاريفُ معزولةٌ بالمحلّ — بدّل المحلَّ ليتغيّر التقرير.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <Tile label="إجماليّ المصروف (منجَز)" value={`${fmt(summary.expenseTotal)} د.ل`} />
            <Tile label="سلفٌ قائمة (لم تُسترَدّ)" value={`${fmt(summary.advancesOut)} د.ل`} />
            <Tile label="مستنداتٌ محسوبة" value={summary.docs} />
          </div>
        </section>

        {/* ═══ الطبقة ٢: إدخالٌ سريع بالفاتورة ═══ */}
        {canRecord ? (
          <QuickExpense profile={me} />
        ) : (
          <section className={card}>
            <h2 className="text-base font-bold text-ink mb-1">تسجيلُ المصروفات</h2>
            <p className="text-sm text-ink-2">
              التسجيلُ السريعُ للمدير العامّ والمدير الماليّ ومدير المستودعات. حسابُك للاطّلاع والتقارير.
            </p>
          </section>
        )}

        {/* ═══ الطبقة ٣: المصروف لكلّ فئة ═══ */}
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-3">المصروف لكلّ فئة</h2>
          {summary.rows.length === 0 ? (
            <p className="text-sm text-ink-2">لا مصاريفَ بعد — تظهر هنا حين يُسجَّل أوّلُ مصروف.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 text-xs border-b border-line">
                    <th className="text-right font-bold py-2 px-2">الفئة</th>
                    <th className="text-right font-bold py-2 px-2">الإجماليّ (د.ل)</th>
                    <th className="text-right font-bold py-2 px-2">عددُ المستندات</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.key} className="border-b border-line/60">
                      <td className="py-2 px-2 text-ink">
                        {r.labelAr}
                        {r.key === 'worker_advance' ? ' (صافٍ)' : ''}
                      </td>
                      <td className="py-2 px-2 text-ink">{fmt(r.total)}</td>
                      <td className="py-2 px-2 text-ink">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ═══ الطبقة ٤: تقريرُ المصروفات بالفاتورة ═══ */}
        <section className={card}>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <h2 className="text-base font-bold text-ink">تقريرُ المصروفات بالفاتورة</h2>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="من تاريخ">
                <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="إلى تاريخ">
                <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <Field label="الفئة">
                <select className={inputCls} value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                  <option value="">كلُّ الفئات</option>
                  {EXP_DOC_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key} className="bg-surface">
                      {c.labelAr}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink hover:border-accent/60 disabled:opacity-50"
                onClick={() => setPrinting(true)}
                disabled={report.count === 0 || saturated}
              >
                طباعة التقرير
              </button>
              <button
                type="button"
                className="rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink hover:border-accent/60 disabled:opacity-50"
                onClick={onExcel}
                disabled={report.count === 0 || saturated}
              >
                تصدير إكسل
              </button>
            </div>
          </div>

          {saturated && (
            <p className="text-[12px] text-red-300 mb-2">
              حُمِّل الحدُّ الأقصى من المستندات ({DOCS_CAP}) — قد يكون التقريرُ جزئيًّا، فالطباعةُ والتصديرُ معطَّلان حتّى لا
              يُؤرشَف إجماليٌّ ناقص. تواصل لرفع السقف أو تصفيةِ المدى على الخادم.
            </p>
          )}
          {exportErr && <p className="text-[12px] text-red-300 mb-2">{exportErr}</p>}

          <div className="flex flex-wrap gap-4 text-sm text-ink-2 mb-3">
            <span>
              الإجماليّ: <strong className="text-ink">{fmt(report.grandTotal)} د.ل</strong>
            </span>
            <span>
              عددُ المصاريف: <strong className="text-ink">{report.count}</strong>
            </span>
            <span>المدّة: {rangeText}</span>
            <span>الفئة: {catText}</span>
          </div>

          {report.count === 0 ? (
            <p className="text-sm text-ink-2">لا مصاريفَ بهذه التصفية — سجّل مصروفًا أو وسّع المدى.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 text-xs border-b border-line">
                    <th className="text-right font-bold py-2 px-2">التاريخ</th>
                    <th className="text-right font-bold py-2 px-2">رقم الفاتورة</th>
                    <th className="text-right font-bold py-2 px-2">الفئة</th>
                    <th className="text-right font-bold py-2 px-2">المستفيد</th>
                    <th className="text-right font-bold py-2 px-2">الطريقة</th>
                    <th className="text-right font-bold py-2 px-2">المبلغ (د.ل)</th>
                    <th className="text-right font-bold py-2 px-2">المستند</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((r) => (
                    <tr key={r.id} className="border-b border-line/60">
                      <td className="py-2 px-2 text-ink">{r.date || '—'}</td>
                      <td className="py-2 px-2 text-ink">{r.invoiceNo || '—'}</td>
                      <td className="py-2 px-2 text-ink">{r.categoryLabel}</td>
                      <td className="py-2 px-2 text-ink">{r.beneficiary || '—'}</td>
                      <td className="py-2 px-2 text-ink-2">{r.method || '—'}</td>
                      <td className="py-2 px-2 text-ink">{fmt(r.amount)}</td>
                      <td className="py-2 px-2 text-ink-2">{r.number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {printing && <ExpenseReportPrint report={report} rangeText={rangeText} catText={catText} shop={shop} />}
    </>
  );
}

/* ═══════════════════ المكوّنات ═══════════════════ */

function Tile({ label, value }) {
  return (
    <div className="rounded-lg bg-chip border border-line p-3">
      <div className="text-ink-2 text-xs mb-1">{label}</div>
      <div className="text-ink text-lg">{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-ink-2">{label}</span>
      {children}
    </label>
  );
}

/** نموذجُ المصروف السريع — خطوةٌ واحدةٌ تُنشئ EXP وتُقيّده. */
function QuickExpense({ profile }) {
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [category, setCategory] = useState(EXP_DOC_CATEGORIES[0].labelAr);
  const [beneficiary, setBeneficiary] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(EXPENSE_METHODS[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const { number } = await recordExpense(
        { expenseDate, invoiceNo, category, beneficiary, paymentMethod, amount, note },
        profile
      );
      // محايدةٌ عبر الخلفيّتين: القيدُ المزدوجُ يقع على سطح المكتب (local-sqlite)،
      // وعلى الويب لا دفترَ محلّيّ — فلا نَعِد بقيدٍ قد لا يقع. التقريرُ يُثبته دومًا.
      setMsg(`سُجّل المصروفُ ${number || ''} ويظهر في التقرير.`);
      setInvoiceNo('');
      setBeneficiary('');
      setAmount('');
      setNote('');
      setExpenseDate(todayIso());
      setTimeout(() => setMsg(''), 5000);
    } catch (ex) {
      setErr(ex?.message || 'تعذّر تسجيل المصروف.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={card}>
      <h2 className="text-base font-bold text-ink mb-1">تسجيلُ مصروفٍ بالفاتورة</h2>
      <p className="text-sm text-ink-2 mb-3">
        اكتب رقمَ الفاتورة والمبلغ واختَر الفئة — يُسجَّل المصروفُ ويُقيَّد بخطوةٍ واحدة، معزولًا بالمحلّ الفعّال.
      </p>
      {msg && <p className="text-[13px] text-emerald-300 mb-2">{msg}</p>}
      {err && <p className="text-[13px] text-red-300 mb-2">{err}</p>}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="رقم الفاتورة *">
          <input
            className={inputCls}
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            required
            placeholder="رقمُ الفاتورة أو السند"
          />
        </Field>
        <Field label="المبلغ (د.ل) *">
          <input
            type="number"
            min="0"
            step="0.001"
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="الفئة *">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXP_DOC_CATEGORIES.map((c) => (
              <option key={c.key} value={c.labelAr} className="bg-surface">
                {c.labelAr}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المستفيد / الجهة">
          <input
            className={inputCls}
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            placeholder="اسمُ المورّد أو الجهة"
          />
        </Field>
        <Field label="طريقة الصرف *">
          <select className={inputCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {EXPENSE_METHODS.map((m) => (
              <option key={m} value={m} className="bg-surface">
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التاريخ *">
          <input type="date" className={inputCls} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="البيان (ملاحظة)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="بيانُ المصروف…" />
          </Field>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'جارٍ التسجيل…' : 'سجّل المصروف'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ═══════════════════ عرضُ الطباعة — ورقةٌ محايدةٌ بلا هويّةِ شركة ═══════════════════ */

/**
 * ★★★ **بلا اسمٍ أو شعارٍ أو صفةِ شركة** (شرطُ المالك في المطبوعات المحايدة).
 *     ورقةٌ نظيفة: عنوان · المدّة والفئة والمحلّ · جدولُ المصاريف بالفواتير ·
 *     إجماليُّ كلّ فئة · الإجماليُّ العامّ · خاناتُ توقيع.
 *
 * الكساءُ مخفيٌّ على الشاشة ويظهر في الطباعة وحدَها، ويُخفى كلُّ ما سواه
 * بـ`visibility` — فلا يُطبع هيكلُ الصفحة معه مهما كان.
 */
function ExpenseReportPrint({ report, rangeText, catText, shop }) {
  return (
    <div className="exp-print" dir="rtl">
      <style>{PRINT_CSS}</style>
      <header className="exp-head">
        <h1>تقرير المصروفات</h1>
        <div className="exp-meta">
          <span>المحلّ: {shop || 'كلُّ المحلّات'}</span>
          <span>المدّة: {rangeText}</span>
          <span>الفئة: {catText}</span>
          <span>تاريخ الطباعة: {todayIso()}</span>
        </div>
      </header>

      <table className="exp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>التاريخ</th>
            <th>رقم الفاتورة</th>
            <th>الفئة</th>
            <th>المستفيد</th>
            <th>الطريقة</th>
            <th>المبلغ (د.ل)</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>{r.date || '—'}</td>
              <td>{r.invoiceNo || '—'}</td>
              <td>{r.categoryLabel}</td>
              <td>{r.beneficiary || '—'}</td>
              <td>{r.method || '—'}</td>
              <td className="exp-num">{fmt(r.amount)}</td>
            </tr>
          ))}
          {report.lines.length === 0 && (
            <tr>
              <td colSpan={7} className="exp-empty">
                لا مصاريفَ في هذه التصفية.
              </td>
            </tr>
          )}
          <tr className="exp-total">
            <td colSpan={6}>الإجماليّ العامّ ({report.count} مصروفًا)</td>
            <td className="exp-num">{fmt(report.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      {report.byCategory.length > 0 && (
        <table className="exp-table exp-cats">
          <thead>
            <tr>
              <th>الفئة</th>
              <th>عددُ المصاريف</th>
              <th>الإجماليّ (د.ل)</th>
            </tr>
          </thead>
          <tbody>
            {report.byCategory.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td>{c.count}</td>
                <td className="exp-num">{fmt(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="exp-signs">
        <div className="exp-sign">
          <div className="exp-sign-line" />
          <div className="exp-sign-label">المُعِدّ</div>
        </div>
        <div className="exp-sign">
          <div className="exp-sign-line" />
          <div className="exp-sign-label">المعتمِد</div>
        </div>
      </div>
    </div>
  );
}

/**
 * أنماطُ الطباعة — بلا شَوْلَةٍ مائلة في التعليقات (الكتلةُ قالبٌ نصّيّ). نُخفي شاشةَ
 * البوّابة (`.exp-screen`) وما وُسم `no-print` بـ`display:none` (وglobal.css يُخفي
 * هيكلَ الصفحة أصلًا)، ونُبقي عرضَ التقرير في **التدفّق الطبيعيّ لا مطلقًا** —
 * فالطباعةُ المطلقة/الثابتة تقصّ الصفحات التالية (نمطُ `DocumentPrint` المُجرَّب).
 */
const PRINT_CSS = `
.exp-print { display: none; }
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  body { background: #fff !important; }
  .exp-screen, .no-print { display: none !important; }
  .exp-print {
    display: block !important;
    width: 100%;
    background: #fff; color: #000;
    font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; font-size: 10pt;
  }
  .exp-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .exp-head { border-bottom: 2px solid #333; padding-bottom: 3mm; margin-bottom: 4mm; }
  .exp-head h1 { font-size: 15pt; font-weight: 800; margin: 0 0 2mm; text-align: center; }
  .exp-meta { display: flex; flex-wrap: wrap; gap: 2mm 8mm; font-size: 9pt; justify-content: center; }

  .exp-table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  .exp-table th, .exp-table td { border: 1px solid #333; padding: 1.6mm 2mm; font-size: 8.5pt; text-align: right; }
  .exp-table th { background: #eee; font-weight: 800; }
  .exp-num { font-family: monospace; direction: ltr; unicode-bidi: isolate; text-align: left; }
  .exp-total td { background: #f3f3f3; font-weight: 800; }
  .exp-empty { text-align: center; color: #666; }
  .exp-cats { width: 60%; }

  .exp-signs { display: flex; gap: 10mm; margin-top: 12mm; break-inside: avoid; }
  .exp-sign { flex: 1; text-align: center; }
  .exp-sign-line { border-top: 1px solid #333; margin-bottom: 1.5mm; }
  .exp-sign-label { font-size: 9pt; color: #333; }
}
`;
