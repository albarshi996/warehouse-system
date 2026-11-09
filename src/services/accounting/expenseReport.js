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
 * يبني تقريرَ المصروفات: سطرٌ لكلّ مصروف، وتجميعٌ لكلّ فئة، وإجماليّ.
 *
 * @param {Array} documents مستنداتُ المصاريف (يُرشَّح منها EXP المنجَز).
 * @param {{shop?:string, from?:string, to?:string, category?:string, states?:string[]}} [opts]
 *   shop     محلٌّ بعينه (null/'' = كلُّ المحلّات).
 *   from/to  مدًى شاملٌ الحدّين على «yyyy-mm-dd» (فارغٌ = بلا حدّ).
 *   category مفتاحُ فئةٍ مُطبّع (فارغٌ = كلُّ الفئات).
 *   states   الحالاتُ المقبولة (الافتراض: منجَز وحدَه — القيدُ يقع عند `done`).
 * @returns {{lines:Array, byCategory:Array, grandTotal:number, count:number}}
 *
 * ★ «منجَز» وحدَه: `closed` مبهمةٌ — done→closed صُرف وقُيّد، لكن approved→closed
 *   التزامٌ أُلغي قبل الصرف ولم يُقيَّد؛ واحتسابُها يضخّم المصروفَ بما لم يُصرَف
 *   ويخالف الدفترَ (مراجعةٌ عدائيّة 2026-11-09).
 */
export function expenseReport(documents = [], { shop, from, to, category, states = ['done'] } = {}) {
  const scoped = shop !== undefined && shop !== null && shop !== '';
  const lo = from ? String(from).slice(0, 10) : '';
  const hi = to ? String(to).slice(0, 10) : '';
  const wantCat = str(category);

  const lines = (Array.isArray(documents) ? documents : [])
    .filter((d) => d?.type === 'EXP' && states.includes(d?.state))
    .filter((d) => !scoped || shopOf(d) === shop)
    .map((d) => ({
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
    }))
    .filter((r) => (!lo || r.date >= lo) && (!hi || r.date <= hi))
    .filter((r) => !wantCat || r.categoryKey === wantCat)
    // الأحدثُ أوّلًا، وعند تساوي اليوم يثبت الترتيب برقم المستند.
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

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
 * الترتيبُ نفسُه المعروض، والإجماليُّ في ذيلٍ مُسمًّى.
 */
export function expenseReportAoa(report) {
  const header = ['التاريخ', 'رقم الفاتورة', 'الفئة', 'المستفيد', 'طريقة الصرف', 'المبلغ (د.ل)', 'البيان', 'رقم المستند'];
  const body = (report?.lines || []).map((r) => [
    r.date || '—',
    r.invoiceNo || '—',
    r.categoryLabel,
    r.beneficiary || '—',
    r.method || '—',
    r.amount,
    r.note || '',
    r.number || '—',
  ]);
  const footer = ['الإجمالي', '', '', '', '', money(report?.grandTotal), `${report?.count || 0} مصروفًا`, ''];
  return [header, ...body, footer];
}
