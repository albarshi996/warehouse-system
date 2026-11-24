/**
 * تقريرُ المصروفات بالفاتورة (‹EXP-INV› · طلب المالك 2026-11-09) — منطقٌ خالصٌ
 * يُبنى فوق مستندات المصروف المبوّب (EXP) المنجَزة، مُرشَّحًا بالمحلّ والمدى والفئة.
 *
 * ═══ لماذا EXP وحده؟ ═══
 * «نظامُ تسجيل المصروفات وفق رقم الفاتورة» يُنشئ مستندَ EXP (المصروفُ العامّ
 * المبوّب). الرواتبُ (SAL) والسلفُ (ADV) مستنداتٌ أخرى بحساباتها ولا فاتورةَ لها،
 * فلا تدخل هذا التقرير — تقريرُها في لوحة «المصاريف المبوّبة» الشاملة.
 *
 * ═══ لماذا خالص؟ ═══
 * الشاشةُ تجلب المستندات (بابٌ واحد) وتمرّرها هنا — فالتصفيةُ والتجميعُ يُختبران
 * وحدهما، والزرُّ يستدعي لا يُعيد البناء (درسُ «البناء قبل الوصل»). بلا Firestore
 * وبلا DOM.
 */
import { normalizeCategory, categoryLabel } from './expenseCategories.js';

const num = (v) => Number(v) || 0;
/** تقريبٌ إلى ثلاث منازل (الدرهم) — فلا يتسرّب خطأُ العائم إلى مجموعٍ ماليّ. */
const money = (n) => Math.round(num(n) * 1000) / 1000;

/** رمزُ محلّ المستند (وسمُ المرحلة ص) — من الجذر أو الترويسة، أو null. */
const shopOf = (d) => d?.shop ?? d?.header?.shop ?? null;
/** مبلغُ مستند المصروف من رأسه (قيمةٌ مفردةٌ لا بنود). */
const amountOf = (d) => num(d?.header?.amount ?? d?.header?.total ?? d?.header?.amountPaid);
/** تاريخُ المصروف مقصوصًا «yyyy-mm-dd» (يُرتَّب نصًّا ترتيبًا زمنيًّا سليمًا). */
const dateOf = (d) => String(d?.header?.expenseDate || d?.header?.date || '').slice(0, 10);
const str = (v) => String(v ?? '').trim();

/**
 * ‹وقت التسجيل› طابعٌ زمنيٌّ ⟵ ميلّي ثانية، أيًّا كانت صيغتُه: `Timestamp` القاعدتين
 * (له `toMillis`) · كائنٌ بـ`seconds` · رقمٌ · تاريخٌ · نصٌّ ISO. والمجهولُ صفر.
 */
export function toMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v.toMillis === 'function') return Number(v.toMillis()) || 0;
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.round((Number(v.nanoseconds) || 0) / 1e6);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 0 : v.getTime();
  const parsed = Date.parse(String(v));
  return Number.isNaN(parsed) ? 0 : parsed;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** يومُ التسجيل **بالتوقيت المحليّ** «yyyy-mm-dd» — أو '' لطابعٍ مجهول. */
export function stampDay(ms) {
  if (!(ms > 0)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** وقتُ التسجيل للعرض «yyyy-mm-dd hh:mm» بالتوقيت المحليّ — أو '' لطابعٍ مجهول. */
export function formatStamp(ms) {
  if (!(ms > 0)) return '';
  const d = new Date(ms);
  return `${stampDay(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * يبني تقريرَ المصروفات: سطرٌ لكلّ مصروف، وتجميعٌ لكلّ فئة، وإجماليّ.
 *
 * @param {Array} documents مستنداتُ المصاريف (يُرشَّح منها EXP المنجَز).
 * @param {{shop?:string, from?:string, to?:string, category?:string, states?:string[],
 *          createdFrom?:string, createdTo?:string, include?:Function}} [opts]
 *   shop     محلٌّ بعينه (null/'' = كلُّ المحلّات).
 *   from/to  مدًى شاملٌ الحدّين على «yyyy-mm-dd» **بتاريخ الفاتورة** (فارغٌ = بلا حدّ).
 *   createdFrom/createdTo  مدًى شاملٌ الحدّين **بيوم التسجيل في النظام** (‹وقت التسجيل›):
 *            فاتورةٌ قديمةُ التاريخ أُدخلت اليوم تُلتقط بيوم إدخالها لا بتاريخها.
 *   category مفتاحُ فئةٍ مُطبّع (فارغٌ = كلُّ الفئات).
 *   states   الحالاتُ المقبولة (الافتراض: منجَز وحدَه — القيدُ يقع عند `done`).
 *   include  حكمٌ إضافيٌّ على السطر (مثل «غير المُقفَل مع الماليّة») — يُطبَّق قبل التجميع.
 *   sortBy   'date' (الافتراض: الأحدثُ فاتورةً أوّلًا) أو 'created' (الأحدثُ **تسجيلًا** أوّلًا —
 *            فما أُدخل للتوّ يتصدّر ولو كان تاريخُ فاتورته قديمًا؛ وما بلا طابعٍ في الذيل).
 * @returns {{lines:Array, byCategory:Array, grandTotal:number, count:number}}
 *
 * ★ «منجَز» وحدَه: `closed` مبهمةٌ — done→closed صُرف وقُيّد، لكن approved→closed
 *   التزامٌ أُلغي قبل الصرف ولم يُقيَّد؛ واحتسابُها يضخّم المصروفَ بما لم يُصرَف
 *   ويخالف الدفترَ (مراجعةٌ عدائيّة 2026-11-09).
 */
export function expenseReport(
  documents = [],
  { shop, from, to, category, states = ['done'], createdFrom, createdTo, include, sortBy = 'date' } = {}
) {
  // الأحدثُ أوّلًا، وعند تساوي اليوم يثبت الترتيب برقم المستند.
  const byDate = (a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number);
  const byCreated = (a, b) => b.createdAtMs - a.createdAtMs || byDate(a, b);
  const scoped = shop !== undefined && shop !== null && shop !== '';
  const lo = from ? String(from).slice(0, 10) : '';
  const hi = to ? String(to).slice(0, 10) : '';
  const cLo = createdFrom ? String(createdFrom).slice(0, 10) : '';
  const cHi = createdTo ? String(createdTo).slice(0, 10) : '';
  const wantCat = str(category);
  const keep = typeof include === 'function' ? include : null;

  const lines = (Array.isArray(documents) ? documents : [])
    .filter((d) => d?.type === 'EXP' && states.includes(d?.state))
    .filter((d) => !scoped || shopOf(d) === shop)
    .map((d) => {
      const createdAtMs = toMs(d?.createdAt);
      return {
        id: d.id,
        number: str(d?.number),
        date: dateOf(d),
        invoiceNo: str(d?.header?.invoiceNo),
        categoryKey: normalizeCategory(d?.header?.category),
        categoryLabel: categoryLabel(d?.header?.category),
        beneficiary: str(d?.header?.beneficiary),
        method: str(d?.header?.paymentMethod || d?.header?.method),
        amount: money(amountOf(d)),
        note: str(d?.header?.note || d?.header?.notes),
        shop: shopOf(d) ?? '',
        // ‹وقت التسجيل› متى دخل المصروفُ النظامَ — لا تاريخُ فاتورته.
        createdAtMs,
        createdDay: stampDay(createdAtMs),
      };
    })
    .filter((r) => (!lo || r.date >= lo) && (!hi || r.date <= hi))
    // ★ مصروفٌ بلا طابعِ تسجيلٍ (قديمٌ جدًّا) لا يدخل مدى التسجيل متى حُدّد مدًى —
    //   فلا يُدَّعى له يومُ تسجيلٍ لم يُعرف؛ وبلا مدًى يبقى ظاهرًا كما كان.
    .filter((r) => (!cLo || (r.createdDay && r.createdDay >= cLo)) && (!cHi || (r.createdDay && r.createdDay <= cHi)))
    .filter((r) => !wantCat || r.categoryKey === wantCat)
    .filter((r) => !keep || keep(r))
    .sort(sortBy === 'created' ? byCreated : byDate);

  return summarizeLines(lines);
}

/**
 * تجميعُ سطورٍ جاهزةٍ إلى تقرير (لكلّ فئة + إجماليّ) — يُستعمل للتقرير الحيّ
 * ولكشف الإقفال المحفوظ معًا، فالتجميعُ واحدٌ لا نسختان تفترقان.
 */
export function summarizeLines(lines = []) {
  const byMap = new Map();
  for (const r of lines) {
    const cur = byMap.get(r.categoryKey) || { key: r.categoryKey, label: r.categoryLabel, total: 0, count: 0 };
    cur.total = money(cur.total + r.amount);
    cur.count += 1;
    byMap.set(r.categoryKey, cur);
  }
  const byCategory = [...byMap.values()].sort((a, b) => b.total - a.total);
  const grandTotal = money(lines.reduce((s, r) => s + r.amount, 0));

  return { lines, byCategory, grandTotal, count: lines.length };
}

/**
 * صفوفُ تصدير إكسل (مصفوفةُ مصفوفات: عناوين ثمّ صفوف) — للزرّ في الشاشة.
 * الترتيبُ نفسُه المعروض، والإجماليُّ في ذيلٍ مُسمًّى. الأعمدةُ الثمانيةُ الأولى
 * كما كانت، و«سُجّل في» و«الإقفال» **في الآخر** فلا ينزاح ما اعتاده قارئُ الملفّ.
 *
 * @param {object} report ناتجُ `expenseReport`.
 * @param {{settlementLabel?:Function}} [opts] `settlementLabel(line)` يُعيد «مفتوح»
 *        أو رقمَ كشف الإقفال — وبغيابه لا يُضاف عمودُ «الإقفال».
 */
export function expenseReportAoa(report, { settlementLabel } = {}) {
  const label = typeof settlementLabel === 'function' ? settlementLabel : null;
  const header = ['التاريخ', 'رقم الفاتورة', 'الفئة', 'المستفيد', 'طريقة الصرف', 'المبلغ (د.ل)', 'البيان', 'رقم المستند', 'سُجّل في'];
  if (label) header.push('الإقفال');
  const body = (report?.lines || []).map((r) => {
    const row = [
      r.date || '—',
      r.invoiceNo || '—',
      r.categoryLabel,
      r.beneficiary || '—',
      r.method || '—',
      r.amount,
      r.note || '',
      r.number || '—',
      formatStamp(r.createdAtMs) || '—',
    ];
    if (label) row.push(label(r) || '');
    return row;
  });
  const footer = ['الإجمالي', '', '', '', '', money(report?.grandTotal), `${report?.count || 0} مصروفًا`, '', ''];
  if (label) footer.push('');
  return [header, ...body, footer];
}
