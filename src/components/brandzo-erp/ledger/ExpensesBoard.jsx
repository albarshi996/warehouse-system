/**
 * لوحةُ المصاريف المبوّبة (ذ · «تقريرٌ نظيفٌ لكلّ فئة») + **الإدخالُ السريع بالفاتورة**
 * (‹EXP-INV› · طلب المالك 2026-11-09): «نظامُ تسجيل مصروفات وفق رقم الفاتورة سهلٌ
 * ويطبع تقريرًا — فالحاليُّ متعقّد».
 *
 * خمسُ طبقات:
 *   ① تدخّلٌ الآن   — إجماليُّ المصروف والسلفُ القائمة للمحلّ الفعّال.
 *   ② إدخالٌ سريع  — تسجيلُ مصروفٍ بالفاتورة بخطوةٍ واحدة (يُنشئ EXP ويُقيَّده فورًا).
 *   ③ فهرسٌ        — المصروفُ لكلّ فئة (كلُّ أنواع المصاريف).
 *   ④ تقريرٌ       — مصاريفُ الفواتير (EXP) بتصفيةِ مدًى وفئة، تُطبع A4 وتُصدَّر إكسل.
 *   ⑤ إقفالٌ       — ‹EXP-CLS› (طلب المالك 2026-11-24): تحديدٌ **يدويٌّ** لما سُوّي مع
 *                    الماليّة ⟵ كشفُ إقفالٍ مرقَّم. والتقريرُ يطبع افتراضيًّا **غيرَ المُقفَل**
 *                    فلا يُطبع ما أُقفل مرّتين؛ والكشفُ القديمُ يُعاد طبعُه من لقطته.
 *                    ولكلّ مصروفٍ «سُجّل في»: متى دخل النظامَ لا تاريخُ فاتورته.
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
import { expenseReport, expenseReportAoa, formatStamp } from '../../../services/accounting/expenseReport.js';
import {
  SETTLE_OPEN,
  SETTLE_ALL,
  canCloseExpenses,
  closedIndex,
  settlementFilter,
  buildClosing,
  closingReport,
  closingDrift,
  closingsForShop,
} from '../../../services/accounting/expenseClosing.js';
import { subscribeExpenseClosings, addExpenseClosing } from '../../../services/accounting/expenseClosingService.js';
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

const btnCls =
  'rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink hover:border-accent/60 disabled:opacity-50';
const linkBtnCls = 'text-[13px] font-bold text-accent hover:underline disabled:opacity-50';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const todayIso = () => new Date().toISOString().slice(0, 10);
const isDenied = (e) => String(e?.code || e?.message || '').includes('permission-denied');
/** عزلُ معرّفٍ لاتينيٍّ (رقم كشف) داخل جملةٍ عربيّة — وإلّا التصق به العددُ التالي فانقلب موضعُه. */
const iso = (s) => `⁨${s ?? ''}⁩`;

export default function ExpensesBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [shop, setShop] = useState(getActiveShop());

  // تصفيةُ التقرير.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [printing, setPrinting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  // ‹EXP-CLS› الإقفالُ مع الماليّة: الكشوف · وضعُ التقرير · مدى التسجيل · التحديدُ اليدويّ.
  const [closings, setClosings] = useState([]);
  const [closingsLoaded, setClosingsLoaded] = useState(false);
  const [closingsErr, setClosingsErr] = useState('');
  const [mode, setMode] = useState(SETTLE_OPEN);
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [picked, setPicked] = useState(() => new Set());
  const [closeNote, setCloseNote] = useState('');
  const [pending, setPending] = useState(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeMsg, setCloseMsg] = useState('');
  const [closeErr, setCloseErr] = useState('');

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
    return listenDocumentsByTypes(
      EXPENSE_TYPES,
      (rows) => {
        setDocs(rows);
        setDocsLoaded(true);
      },
      DOCS_CAP
    );
  }, [me]);

  // كشوفُ الإقفال. ★ تعذّرُ قراءتها يُقال صراحةً ويُعطّل الإقفال — فكشوفٌ لم تُقرأ تجعل
  //   كلَّ مُقفَلٍ يبدو مفتوحًا، وذاك عينُ ما جاءت الميزةُ لتمنعه.
  useEffect(() => {
    if (!me || !VIEWER_ROLES.includes(me.role)) return undefined;
    return subscribeExpenseClosings(
      (rows) => {
        setClosings(rows);
        setClosingsLoaded(true);
        setClosingsErr('');
      },
      (e) => {
        setClosingsErr(
          isDenied(e)
            ? 'كشوفُ الإقفال لم تُقرأ: قاعدةُ الأمان لمجموعة «expense_closings» لم تُنشر بعد على نسخة الويب.'
            : e?.message || 'تعذّرت قراءةُ كشوف الإقفال.'
        );
      }
    );
  }, [me]);

  // بلوغُ السقف: المجموعةُ قد تكون مقصوصةً فالتقريرُ جزئيّ — يُحذَّر وتُمنع الطباعة.
  const saturated = docs.length >= DOCS_CAP;

  const summary = useMemo(() => expenseSummary(docs, { shop }), [docs, shop]);

  /** فهرسُ المُقفَل: معرّفُ المصروف ⟵ كشفُه (من كلّ الكشوف — المعرّفُ فريدٌ عبر المحلّات). */
  const index = useMemo(() => closedIndex(closings), [closings]);
  /** كلُّ المصاريف المنجَزة (كلُّ المحلّات): منها لقطةُ الكشف، وعليها يُقاس ما تغيّر بعد الإقفال. */
  const allDone = useMemo(() => expenseReport(docs, {}).lines, [docs]);
  const shopClosings = useMemo(() => closingsForShop(closings, shop), [closings, shop]);
  const activeClosing = useMemo(
    () => (mode === SETTLE_OPEN || mode === SETTLE_ALL ? null : shopClosings.find((c) => c.id === mode) || null),
    [mode, shopClosings]
  );

  // وضعٌ يشير إلى كشفٍ ليس في هذا المحلّ (بُدّل المحلّ) ⟵ يعود إلى «غير المُقفَل»
  // بدل تقريرٍ فارغٍ مبهم.
  useEffect(() => {
    if (mode === SETTLE_OPEN || mode === SETTLE_ALL || !closingsLoaded) return;
    if (!shopClosings.some((c) => c.id === mode)) setMode(SETTLE_OPEN);
  }, [mode, closingsLoaded, shopClosings]);

  // ★ أيُّ تغييرٍ في التصفية أو المحلّ يُبطل الكشفَ المؤقّت (pending) — فلا يُحفظ كشفٌ
  //   بناه المستخدمُ على رؤيةٍ ثمّ أخفت التصفيةُ بعضَ محدَّده (نقضٌ للضمان المعروض).
  //   أوّلُ رسمٍ لا يؤذي لأنّ pending يبدأ null.
  useEffect(() => {
    setPending(null);
  }, [shop, from, to, fCategory, createdFrom, createdTo, sortBy]);

  // ★ كشفٌ بعينه يُعرض ويُطبع **من لقطته** — لا تمسّه تصفيةُ المدى والفئة، فكشفُ
  //   التسوية وثيقةٌ كاملةٌ لا يُقتطع منها.
  const report = useMemo(
    () =>
      activeClosing
        ? closingReport(activeClosing)
        : expenseReport(docs, {
            shop,
            from,
            to,
            category: fCategory,
            createdFrom,
            createdTo,
            sortBy,
            include: settlementFilter(mode, index),
          }),
    [activeClosing, docs, shop, from, to, fCategory, createdFrom, createdTo, sortBy, mode, index]
  );

  /** ما يصحّ تحديدُه للإقفال: الظاهرُ في التقرير الحيّ ولم يُقفَل بعد. */
  const selectable = useMemo(
    () => (activeClosing ? [] : report.lines.filter((l) => !index.has(String(l.id)))),
    [activeClosing, report, index]
  );
  /** المحدَّدُ **الظاهرُ الآن** وحدَه — ما أخفته التصفيةُ لا يُقفَل وهو غيرُ مرئيّ. */
  const pickedLines = useMemo(() => selectable.filter((l) => picked.has(String(l.id))), [selectable, picked]);
  const pickedTotal = useMemo(
    () => Math.round(pickedLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 1000) / 1000,
    [pickedLines]
  );
  /**
   * ما تغيّر بعد الإقفال لكلّ كشف — تنبيهٌ يُعرض والكشفُ يبقى شاهدًا على ما سُوّي.
   * ★ لا يُحكم قبل اكتمال قراءة المستندات ولا عند بلوغ السقف: قائمةٌ ناقصةٌ تجعل
   *   كلَّ مصروفٍ «مفقودًا» زورًا.
   */
  const driftById = useMemo(() => {
    if (!docsLoaded || saturated) return new Map();
    return new Map(shopClosings.map((c) => [c.id, closingDrift(c, allDone)]));
  }, [docsLoaded, saturated, shopClosings, allDone]);

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
      const stamp = activeClosing ? activeClosing.number : `${from || 'الكل'}_${to || 'الكل'}`;
      const settlementLabel = (line) => index.get(String(line.id))?.number || 'مفتوح';
      exportAoaSheets(
        [{ name: activeClosing ? 'كشف الإقفال' : 'تقرير المصروفات', aoa: expenseReportAoa(report, { settlementLabel }) }],
        `${activeClosing ? 'كشف-إقفال' : 'تقرير-المصروفات'}-${stamp}.xlsx`
      );
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
  // الإقفالُ لمن يملكه، وبعد أن تُقرأ الكشوفُ وتكتمل المستندات: قبل ذلك قد يُقفَل
  // مُقفَلٌ دون علم، أو تُلتقط لقطةٌ من قائمةٍ مقصوصة.
  const canClose = canCloseExpenses(me.role) && closingsLoaded && !closingsErr && docsLoaded && !saturated;
  const rangeText = from || to ? `${from || '…'} ← ${to || '…'}` : 'كامل المدّة';
  const createdText = createdFrom || createdTo ? `${createdFrom || '…'} ← ${createdTo || '…'}` : 'كلُّ الأوقات';
  const catText = fCategory ? categoryLabel(fCategory) : 'كلُّ الفئات';
  const modeText = activeClosing
    ? `كشف الإقفال ${iso(activeClosing.number)}`
    : mode === SETTLE_ALL
      ? 'الكلّ (مُقفَلٌ ومفتوح)'
      : 'غير المُقفَل مع الماليّة';
  const showPick = canClose && !activeClosing;
  const showSettle = mode === SETTLE_ALL && !activeClosing;
  const hiddenPicked = picked.size - pickedLines.length;
  const allPicked = selectable.length > 0 && pickedLines.length === selectable.length;
  // ★ كشفُ الإقفال يُطبع من لقطته المكتفية بذاتها فلا يُعطَّل. أمّا التقريرُ الحيّ فيُحجب
  //   متى لم يُقرأ المستنداتُ/الكشوفُ بعد أو تعذّرت قراءتُها أو بُلغ السقف — فلا يُطبع
  //   «غير المُقفَل» وحكمُ الإقفال غيرُ موثوق (كشوفٌ لم تُقرأ تُظهر المُقفَلَ مفتوحًا).
  const outputBlocked =
    report.count === 0 || (!activeClosing && (saturated || !closingsLoaded || Boolean(closingsErr)));

  function changeMode(next) {
    setMode(next);
    setPicked(new Set());
    setPending(null);
    setCloseErr('');
  }

  function togglePick(id) {
    setPending(null);
    setPicked((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pickAll(on) {
    setPending(null);
    setPicked(on ? new Set(selectable.map((l) => String(l.id))) : new Set());
  }

  /** الخطوة ١: يبني الكشفَ من المحدَّد الظاهر ويعرضه للتأكيد — لا يكتب شيئًا بعد. */
  function askClose() {
    setCloseErr('');
    setCloseMsg('');
    const built = buildClosing({
      selectedIds: pickedLines.map((l) => String(l.id)),
      lines: allDone,
      closings,
      nowMs: Date.now(),
      note: closeNote,
    });
    if (built.problem) {
      setPending(null);
      setCloseErr(built.problem);
      return;
    }
    setPending(built.closing);
  }

  /** الخطوة ٢: يحفظ الكشفَ المؤكَّد — والكشفُ لا يُعدَّل ولا يُحذف بعد حفظه. */
  async function confirmClose() {
    if (!pending || closeBusy) return;
    // ★ دفاعٌ في العمق: لا يُحفظ إلّا ما يراه المستخدمُ ويحدّده الآن. لو غيّر تصفيةً أو
    //   بدّل المحلّ بعد بناء الكشف فأخفى صفًّا محدَّدًا، لا نُقفل ما لا يُرى (الأثرُ يُصفّر
    //   pending عادةً، وهذا يحرس لو سبق التأكيدُ إعادةَ الرسم).
    const visible = new Set(pickedLines.map((l) => String(l.id)));
    const slipped = pending.expenseIds.filter((id) => !visible.has(String(id)));
    if (slipped.length) {
      setPending(null);
      setCloseErr('تغيّرت التصفيةُ أو المحلُّ فأخفت بعضَ المحدَّد — أُلغي الكشفُ المؤقّت، أعِد التحديدَ ممّا تراه ثمّ أقفِل.');
      return;
    }
    setCloseBusy(true);
    setCloseErr('');
    try {
      const saved = await addExpenseClosing(pending, me);
      setMsgAfterClose(saved?.number || pending.number, pending);
    } catch (ex) {
      setCloseErr(
        isDenied(ex)
          ? 'لم يُحفظ الكشف: قاعدةُ الأمان لكشوف الإقفال لم تُنشر بعد على نسخة الويب.'
          : ex?.message || 'تعذّر حفظُ كشف الإقفال.'
      );
    } finally {
      setCloseBusy(false);
    }
  }

  function setMsgAfterClose(number, c) {
    setPicked(new Set());
    setPending(null);
    setCloseNote('');
    setCloseMsg(
      `أُنشئ كشفُ الإقفال ${iso(number)} — ${c.count} مصروفًا بإجماليّ ${fmt(c.total)} د.ل. خرجت من «غير المُقفَل»، والكشفُ في «كشوف الإقفال» أدناه للعرض والطباعة.`
    );
  }

  function printClosing(id) {
    changeMode(id);
    setPrinting(true);
  }

  const printSpec = activeClosing
    ? {
        title: `كشف إقفال مصروفات — ${iso(activeClosing.number)}`,
        meta: [
          `المحلّ: ${activeClosing.shop || 'كلُّ المحلّات'}`,
          `أُقفل في: ${activeClosing.closedAtMs ? iso(formatStamp(activeClosing.closedAtMs)) : '—'}`,
          `بواسطة: ${activeClosing.createdByName || '—'}`,
          `تاريخ الطباعة: ${iso(todayIso())}`,
        ],
        note: activeClosing.note || '',
        signs: ['المُعِدّ', 'الإدارة الماليّة'],
      }
    : {
        title: mode === SETTLE_OPEN ? 'تقرير المصروفات — غير المُقفَل مع الماليّة' : 'تقرير المصروفات',
        meta: [
          `المحلّ: ${shop || 'كلُّ المحلّات'}`,
          `تاريخ الفاتورة: ${iso(rangeText)}`,
          `التسجيل: ${iso(createdText)}`,
          `الفئة: ${catText}`,
          `تاريخ الطباعة: ${iso(todayIso())}`,
        ],
        note: '',
        signs: ['المُعِدّ', 'المعتمِد'],
      };

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
              <Field label="يعرض">
                <select className={inputCls} value={mode} onChange={(e) => changeMode(e.target.value)}>
                  <option value={SETTLE_OPEN} className="bg-surface">
                    غير المُقفَل مع الماليّة
                  </option>
                  <option value={SETTLE_ALL} className="bg-surface">
                    الكلّ (مُقفَلٌ ومفتوح)
                  </option>
                  {shopClosings.map((c) => (
                    <option key={c.id} value={c.id} className="bg-surface">
                      كشف الإقفال {iso(c.number)}
                    </option>
                  ))}
                </select>
              </Field>
              {!activeClosing && (
                <>
                  <Field label="تاريخ الفاتورة من">
                    <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="تاريخ الفاتورة إلى">
                    <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                  <Field label="سُجّل في النظام من">
                    <input
                      type="date"
                      className={inputCls}
                      value={createdFrom}
                      onChange={(e) => setCreatedFrom(e.target.value)}
                    />
                  </Field>
                  <Field label="سُجّل في النظام إلى">
                    <input
                      type="date"
                      className={inputCls}
                      value={createdTo}
                      onChange={(e) => setCreatedTo(e.target.value)}
                    />
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
                  <Field label="الترتيب">
                    <select className={inputCls} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                      <option value="date" className="bg-surface">
                        الأحدثُ فاتورةً أوّلًا
                      </option>
                      <option value="created" className="bg-surface">
                        الأحدثُ تسجيلًا أوّلًا
                      </option>
                    </select>
                  </Field>
                </>
              )}
              <button type="button" className={btnCls} onClick={() => setPrinting(true)} disabled={outputBlocked}>
                {activeClosing ? 'طباعة الكشف' : 'طباعة التقرير'}
              </button>
              <button type="button" className={btnCls} onClick={onExcel} disabled={outputBlocked}>
                تصدير إكسل
              </button>
            </div>
          </div>

          {saturated && (
            <p className="text-[12px] text-red-300 mb-2">
              حُمِّل الحدُّ الأقصى من المستندات ({DOCS_CAP}) — قد يكون التقريرُ جزئيًّا، فالطباعةُ والتصديرُ والإقفالُ معطَّلةٌ حتّى
              لا يُؤرشَف إجماليٌّ ناقص. تواصل لرفع السقف أو تصفيةِ المدى على الخادم.
            </p>
          )}
          {exportErr && <p className="text-[12px] text-red-300 mb-2">{exportErr}</p>}
          {closingsErr && <p className="text-[12px] text-red-300 mb-2">{closingsErr}</p>}

          {activeClosing && (
            <p className="text-[13px] text-ink-2 mb-2">
              يُعرض كشفُ الإقفال{' '}
              <strong className="text-ink">
                <bdi>{activeClosing.number}</bdi>
              </strong>{' '}
              كما حُفظ لحظةَ الإقفال —
              التصفيةُ لا تمسّه.{' '}
              <button type="button" className={linkBtnCls} onClick={() => changeMode(SETTLE_OPEN)}>
                عُد إلى غير المُقفَل
              </button>
            </p>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-ink-2 mb-3">
            <span>
              الإجماليّ: <strong className="text-ink">{fmt(report.grandTotal)} د.ل</strong>
            </span>
            <span>
              عددُ المصاريف: <strong className="text-ink">{report.count}</strong>
            </span>
            <span>يعرض: {modeText}</span>
            {!activeClosing && (
              <>
                <span>تاريخ الفاتورة: {rangeText}</span>
                <span>التسجيل: {createdText}</span>
                <span>الفئة: {catText}</span>
              </>
            )}
          </div>

          {closeMsg && <p className="text-[13px] text-emerald-300 mb-2">{closeMsg}</p>}

          {/* ═══ شريطُ الإقفال اليدويّ — لمن يملكه، وعلى التقرير الحيّ وحدَه ═══ */}
          {showPick && selectable.length > 0 && (
            <div className="rounded-lg border border-line bg-chip p-3 mb-3">
              <p className="text-[13px] text-ink-2 mb-2">
                حدِّد بالخانات ما سُوّي مع الماليّة ثمّ أقفِله في كشفٍ مرقَّم — فيخرج من «غير المُقفَل» ولا يُطبع مرّةً ثانية.
                ما لم تُحدِّده يبقى مفتوحًا للكشف التالي.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="text-sm text-ink pb-2">
                  المحدَّد: <strong>{pickedLines.length}</strong> مصروفًا · <strong>{fmt(pickedTotal)} د.ل</strong>
                </div>
                <button type="button" className={btnCls} onClick={() => pickAll(!allPicked)}>
                  {allPicked ? 'ألغِ تحديدَ الكلّ' : `حدِّد كلَّ الظاهر (${selectable.length})`}
                </button>
                <div className="grow min-w-[12rem]">
                  <Field label="ملاحظة على الكشف (اختياريّ)">
                    <input
                      className={inputCls}
                      value={closeNote}
                      maxLength={200}
                      onChange={(e) => {
                        setCloseNote(e.target.value);
                        setPending(null);
                      }}
                      placeholder="مثل: تسويةُ شهر أكتوبر مع الإدارة الماليّة"
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  onClick={askClose}
                  disabled={pickedLines.length === 0 || closeBusy || Boolean(pending)}
                >
                  أقفِل المحدَّد مع الماليّة
                </button>
              </div>
              {hiddenPicked > 0 && (
                <p className="text-[12px] text-ink-2 mt-2">
                  {hiddenPicked} محدَّدٌ أخفته التصفيةُ الحاليّة — لا يُقفَل إلّا ما تراه في الجدول.
                </p>
              )}
              {closeErr && <p className="text-[13px] text-red-300 mt-2">{closeErr}</p>}
              {pending && (
                <div className="mt-3 rounded-lg border border-accent/50 bg-surface p-3">
                  <p className="text-sm text-ink mb-2">
                    سيُنشأ كشفُ الإقفال{' '}
                    <strong>
                      <bdi>{pending.number}</bdi>
                    </strong>{' '}
                    وفيه <strong>{pending.count}</strong> مصروفًا بإجماليّ <strong>{fmt(pending.total)} د.ل</strong>. الكشفُ لا يُعدَّل ولا يُحذف بعد حفظه — راجع
                    التحديدَ قبل التأكيد.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      onClick={confirmClose}
                      disabled={closeBusy}
                    >
                      {closeBusy ? 'جارٍ الحفظ…' : 'تأكيد الإقفال'}
                    </button>
                    <button type="button" className={btnCls} onClick={() => setPending(null)} disabled={closeBusy}>
                      تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {report.count === 0 ? (
            <p className="text-sm text-ink-2">
              {mode === SETTLE_OPEN && index.size > 0
                ? 'لا مصاريفَ مفتوحةً بهذه التصفية — كلُّ ما يطابقها أُقفل مع الماليّة. اختَر «الكلّ» أو كشفًا بعينه لرؤيته.'
                : 'لا مصاريفَ بهذه التصفية — سجّل مصروفًا أو وسّع المدى.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 text-xs border-b border-line">
                    {showPick && <th className="text-right font-bold py-2 px-2">إقفال</th>}
                    <th className="text-right font-bold py-2 px-2">التاريخ</th>
                    <th className="text-right font-bold py-2 px-2">رقم الفاتورة</th>
                    <th className="text-right font-bold py-2 px-2">الفئة</th>
                    <th className="text-right font-bold py-2 px-2">المستفيد</th>
                    <th className="text-right font-bold py-2 px-2">الطريقة</th>
                    <th className="text-right font-bold py-2 px-2">المبلغ (د.ل)</th>
                    <th className="text-right font-bold py-2 px-2">المستند</th>
                    <th className="text-right font-bold py-2 px-2">سُجّل في</th>
                    {showSettle && <th className="text-right font-bold py-2 px-2">الإقفال</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((r) => {
                    const closedIn = index.get(String(r.id));
                    const isPicked = picked.has(String(r.id));
                    return (
                      <tr key={r.id} className={`border-b border-line/60 ${isPicked && !closedIn ? 'bg-accent/10' : ''}`}>
                        {showPick && (
                          <td className="py-2 px-2">
                            {closedIn ? (
                              <span className="text-ink-2">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                className="h-4 w-4 align-middle"
                                checked={isPicked}
                                onChange={() => togglePick(r.id)}
                                aria-label={`حدِّد للإقفال: فاتورة ${r.invoiceNo || r.number || ''}`}
                              />
                            )}
                          </td>
                        )}
                        <td className="py-2 px-2 text-ink whitespace-nowrap">{r.date || '—'}</td>
                        <td className="py-2 px-2 text-ink">{r.invoiceNo || '—'}</td>
                        <td className="py-2 px-2 text-ink">{r.categoryLabel}</td>
                        <td className="py-2 px-2 text-ink">{r.beneficiary || '—'}</td>
                        <td className="py-2 px-2 text-ink-2">{r.method || '—'}</td>
                        <td className="py-2 px-2 text-ink">{fmt(r.amount)}</td>
                        <td className="py-2 px-2 text-ink-2 whitespace-nowrap">
                          <span dir="ltr">{r.number || '—'}</span>
                        </td>
                        <td className="py-2 px-2 text-ink-2 whitespace-nowrap">
                          <span dir="ltr">{formatStamp(r.createdAtMs) || '—'}</span>
                        </td>
                        {showSettle && (
                          <td className="py-2 px-2 whitespace-nowrap">
                            {closedIn ? (
                              <span className="text-ink-2" dir="ltr">
                                {closedIn.number || 'مُقفَل'}
                              </span>
                            ) : (
                              <span className="text-ink">مفتوح</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ═══ الطبقة ٥: كشوفُ الإقفال مع الماليّة ═══ */}
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-1">كشوفُ الإقفال مع الماليّة</h2>
          <p className="text-sm text-ink-2 mb-3">
            كلُّ كشفٍ يحفظ ما سُوّي لحظةَ الإقفال — يُعرض ويُعاد طبعُه كما هو، ولا يُعدَّل ولا يُحذف.
          </p>
          {closingsErr ? (
            <p className="text-sm text-red-300">{closingsErr}</p>
          ) : !closingsLoaded ? (
            <p className="text-sm text-ink-2">جارٍ قراءةُ الكشوف…</p>
          ) : shopClosings.length === 0 ? (
            <p className="text-sm text-ink-2">
              لا كشوفَ إقفالٍ بعد — حدِّد في التقرير أعلاه ما سُوّي مع الماليّة ثمّ «أقفِل المحدَّد مع الماليّة».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 text-xs border-b border-line">
                    <th className="text-right font-bold py-2 px-2">رقم الكشف</th>
                    <th className="text-right font-bold py-2 px-2">أُقفل في</th>
                    <th className="text-right font-bold py-2 px-2">عددُ المصاريف</th>
                    <th className="text-right font-bold py-2 px-2">الإجماليّ (د.ل)</th>
                    <th className="text-right font-bold py-2 px-2">بواسطة</th>
                    <th className="text-right font-bold py-2 px-2">ملاحظة</th>
                    <th className="text-right font-bold py-2 px-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {shopClosings.map((c) => {
                    const drift = driftById.get(c.id);
                    return (
                      <tr key={c.id} className={`border-b border-line/60 ${c.id === mode ? 'bg-accent/10' : ''}`}>
                        <td className="py-2 px-2 text-ink whitespace-nowrap">
                          <span dir="ltr">{c.number || '—'}</span>
                        </td>
                        <td className="py-2 px-2 text-ink-2 whitespace-nowrap">
                          <span dir="ltr">{formatStamp(c.closedAtMs) || '—'}</span>
                        </td>
                        <td className="py-2 px-2 text-ink">{c.count ?? (c.items || []).length}</td>
                        <td className="py-2 px-2 text-ink">{fmt(c.total)}</td>
                        <td className="py-2 px-2 text-ink-2">{c.createdByName || '—'}</td>
                        <td className="py-2 px-2 text-ink-2">
                          {c.note || '—'}
                          {drift && !drift.ok && (
                            <div className="text-[12px] text-red-300 mt-1">
                              تنبيه: تغيّر بعد الإقفال —
                              {drift.missing.length > 0 ? ` ${drift.missing.length} مصروفًا لم يَعُد منجَزًا` : ''}
                              {drift.missing.length > 0 && drift.changed.length > 0 ? ' و' : ''}
                              {drift.changed.length > 0 ? ` ${drift.changed.length} تغيّر مبلغُه` : ''}. الكشفُ يبقى كما
                              سُوّي.
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <button type="button" className={linkBtnCls} onClick={() => changeMode(c.id)}>
                            عرض
                          </button>
                          <span className="text-ink-2 mx-2">·</span>
                          <button type="button" className={linkBtnCls} onClick={() => printClosing(c.id)}>
                            اطبع الكشف
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {printing && <ExpenseReportPrint report={report} spec={printSpec} index={index} showSettle={showSettle} />}
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
 *
 * ‹EXP-CLS› الورقةُ واحدةٌ لثلاثة أوضاع، و`spec` يحمل ما يفترق: العنوانُ وسطورُ
 * الترويسة وملاحظةُ الكشف وخانتا التوقيع (كشفُ الإقفال يوقّعه «الإدارة الماليّة»).
 *
 * ★★ الترويسةُ `div` لا `header`: قاعدةُ الطباعة العامّة في `global.css` تُخفي كلَّ
 *    `header`، فكانت الورقةُ تخرج بلا عنوانٍ ولا مدّة (العطبُ نفسُه في كشف العهدة).
 */
function ExpenseReportPrint({ report, spec, index, showSettle }) {
  const cols = showSettle ? 9 : 8;
  return (
    <div className="exp-print" dir="rtl">
      <style>{PRINT_CSS}</style>
      <div className="exp-head">
        <h1>{spec.title}</h1>
        <div className="exp-meta">
          {spec.meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        {spec.note && <div className="exp-note">ملاحظة: {spec.note}</div>}
      </div>

      <table className="exp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>التاريخ</th>
            <th>رقم الفاتورة</th>
            <th>الفئة</th>
            <th>المستفيد</th>
            <th>الطريقة</th>
            <th>سُجّل في</th>
            {showSettle && <th>الإقفال</th>}
            <th>المبلغ (د.ل)</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td className="exp-ltr">{r.date || '—'}</td>
              <td>{r.invoiceNo || '—'}</td>
              <td>{r.categoryLabel}</td>
              <td>{r.beneficiary || '—'}</td>
              <td>{r.method || '—'}</td>
              <td className="exp-ltr">{formatStamp(r.createdAtMs) || '—'}</td>
              {showSettle && (
                <td className={index.get(String(r.id)) ? 'exp-ltr' : undefined}>
                  {index.get(String(r.id))?.number || 'مفتوح'}
                </td>
              )}
              <td className="exp-num">{fmt(r.amount)}</td>
            </tr>
          ))}
          {report.lines.length === 0 && (
            <tr>
              <td colSpan={cols} className="exp-empty">
                لا مصاريفَ في هذه التصفية.
              </td>
            </tr>
          )}
          <tr className="exp-total">
            <td colSpan={cols - 1}>الإجماليّ العامّ ({report.count} مصروفًا)</td>
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
        {spec.signs.map((s) => (
          <div className="exp-sign" key={s}>
            <div className="exp-sign-line" />
            <div className="exp-sign-label">{s}</div>
          </div>
        ))}
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
  .exp-note { font-size: 9pt; text-align: center; margin-top: 2mm; }

  .exp-table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  .exp-table th, .exp-table td { border: 1px solid #333; padding: 1.6mm 2mm; font-size: 8.5pt; text-align: right; }
  .exp-table th { background: #eee; font-weight: 800; }
  .exp-table tr { break-inside: avoid; }
  .exp-num { font-family: monospace; direction: ltr; unicode-bidi: isolate; text-align: left; white-space: nowrap; }
  .exp-ltr { direction: ltr; unicode-bidi: isolate; text-align: right; white-space: nowrap; }
  .exp-total td { background: #f3f3f3; font-weight: 800; }
  .exp-empty { text-align: center; color: #666; }
  .exp-cats { width: 60%; }

  .exp-signs { display: flex; gap: 10mm; margin-top: 12mm; break-inside: avoid; }
  .exp-sign { flex: 1; text-align: center; }
  .exp-sign-line { border-top: 1px solid #333; margin-bottom: 1.5mm; }
  .exp-sign-label { font-size: 9pt; color: #333; }
}
`;
