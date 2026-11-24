/**
 * ‹EXP-CLS› كشفُ إقفال المصروفات مع الماليّة — **المنطقُ الخالص** (طلب المالك 2026-11-24).
 *
 * ═══ الإشكال ═══
 * أُدخلت فواتيرُ وسُوّيت مع الماليّة، ثمّ تُدخل فواتيرُ جديدةٌ في القائمة نفسِها. فلا شيءَ
 * يفصل «ما سُوّي» عمّا لم يُسوَّ، والتقريرُ يطبع الكلَّ — فيُطبع المُقفَلُ مرّةً ثانية.
 *
 * ═══ الحلّ ═══
 * **كشفُ إقفالٍ مرقَّم** (`CLS-2026-0001`): سجلٌّ مستقلٌّ **يُضاف ولا يُعدَّل** يحمل قائمةَ
 * المصاريف التي سُوّيت — تُحدَّد **يدويًّا** (قرارُ المالك) — ولقطةً منها لحظةَ الإقفال.
 * فالتقريرُ يطبع افتراضيًّا «غير المُقفَل»، والكشفُ القديمُ يُعاد طبعُه من لقطته.
 *
 * ★★★ **المصروفُ نفسُه لا يُمسّ:** الإقفالُ لا يكتب على مستند EXP حرفًا — المستندُ المنجَزُ
 *     يبقى كما قُيّد، وعضويّتُه في كشفٍ تُشتقّ من الكشوف. فلا إفسادَ لدفترٍ ولا لتقرير.
 *
 * ★★ **قائمةٌ لا تاريخٌ فاصل:** التاريخُ الفاصلُ لا يحتمل الاستثناء (مصروفٌ رفضته الماليّة
 *    أو أُجّل)، والقائمةُ تحتمله — فما لم يُحدَّد يبقى مفتوحًا للكشف التالي.
 *
 * ★★ **واللقطةُ هي الوثيقة:** كشفُ الإقفال يُطبع ممّا حُفظ فيه لا ممّا في المستندات الآن —
 *    فلو عُدِّل مصروفٌ بعد إقفاله بقي الكشفُ شاهدًا على ما سُوّي، ويُنبَّه إلى الفرق.
 *
 * خالص: بلا قاعدة بياناتٍ وبلا DOM. الأثرُ الحيّ في `expenseClosingService.js`.
 */
import { summarizeLines } from './expenseReport.js';

/** من يُقفل مع الماليّة — تطابق قاعدةَ `expense_closings` في `firestore.rules` (عدّلهما معًا). */
export const CLOSING_ROLES = Object.freeze(['admin', 'warehouse_manager', 'finance_manager']);

export function canCloseExpenses(role) {
  return CLOSING_ROLES.includes(role);
}

/** سقفُ مصاريف الكشف الواحد — اللقطةُ تُحفظ في مستندٍ واحد، فلا يُترك بلا حدّ. */
export const CLOSING_MAX_ITEMS = 400;

/** وضعا التقرير الثابتان (والثالثُ معرّفُ كشفٍ بعينه). */
export const SETTLE_OPEN = 'open';
export const SETTLE_ALL = 'all';

const str = (v) => String(v ?? '').trim();
const money = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const list = (v) => (Array.isArray(v) ? v : []);
/** عزلُ معرّفٍ لاتينيٍّ داخل جملةٍ عربيّة (FSI…PDI) — فلا يلتصق به ما بعده فينقلب موضعُه. */
const iso = (s) => `⁨${s}⁩`;

/** معرّفاتُ مصاريف كشفٍ — من `expenseIds`، واحتياطًا من لقطته. */
function idsOf(closing) {
  const ids = list(closing?.expenseIds).map(String).filter(Boolean);
  if (ids.length) return ids;
  return list(closing?.items).map((it) => String(it?.id || '')).filter(Boolean);
}

/**
 * فهرسُ المُقفَل: معرّفُ المصروف ⟵ كشفُه. إن ورد مصروفٌ في كشفين (لا يُفترض) فالأقدمُ
 * يفوز — فلا يتبدّل انتماؤه بترتيب القراءة.
 * @returns {Map<string,{closingId:string, number:string, closedAtMs:number}>}
 */
export function closedIndex(closings) {
  const ordered = list(closings)
    .slice()
    .sort((a, b) => (Number(a?.closedAtMs) || 0) - (Number(b?.closedAtMs) || 0));
  const index = new Map();
  for (const c of ordered) {
    const entry = { closingId: str(c?.id), number: str(c?.number), closedAtMs: Number(c?.closedAtMs) || 0 };
    for (const id of idsOf(c)) if (!index.has(id)) index.set(id, entry);
  }
  return index;
}

/**
 * حكمُ وضع التقرير على السطر: «الكلّ» وحدَه لا يُسقط شيئًا، وكلُّ ما سواه يُسقط المُقفَل.
 *
 * ★ **«الكلّ» وحدَه يُعيد null — لا «كلُّ ما ليس غير-المُقفَل»:** وضعُ «كشفٍ بعينه» يُبنى
 *   من لقطته بـ`closingReport` فلا يمرّ من هنا عادةً؛ لكن إن تسرّب معرّفُ كشفٍ يتيمٍ
 *   (بُدّل المحلّ فسقط الكشفُ من قائمة محلّه، فصار `activeClosing=null` والوضعُ ما زال
 *   معرّفَه لإطارٍ واحدٍ قبل أن يُصفّره الأثر) فالمرشّحُ «غير المُقفَل» يطابق الوسمَ
 *   المعروضَ ويمنع إجماليًّا متضخّمًا لحظيًّا — بدل null الذي يجمع المُقفَلَ والمفتوح.
 */
export function settlementFilter(mode, index) {
  if (mode === SETTLE_ALL) return null;
  const closed = index instanceof Map ? index : new Map();
  return (line) => !closed.has(String(line?.id));
}

/** الرقمُ التالي لكشوف سنةٍ: `CLS-2026-0001` — أكبرُ الموجود + ١ (لا العدّ، فالثغرةُ لا تكرّر رقمًا). */
export function nextClosingNumber(closings, year) {
  const prefix = `CLS-${year}-`;
  let max = 0;
  for (const c of list(closings)) {
    const n = str(c?.number);
    if (!n.startsWith(prefix)) continue;
    const seq = Number.parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/**
 * يبني كشفَ إقفالٍ من المصاريف المحدَّدة يدويًّا — أو يقول لماذا لا يُبنى.
 *
 * @param {object} input
 * @param {string[]} input.selectedIds معرّفاتُ المصاريف التي حدّدها المستخدم.
 * @param {Array} input.lines سطورُ المصاريف **المنجَزة** (من `expenseReport`) — منها تُؤخذ اللقطة.
 * @param {Array} input.closings الكشوفُ القائمة (لمنع الإقفال مرّتين وللترقيم).
 * @param {number} input.nowMs لحظةُ الإقفال (تُمرَّر، فالمنطقُ خالص).
 * @param {string} [input.note] ملاحظةٌ على الكشف.
 * @returns {{closing:object}|{problem:string}}
 */
export function buildClosing({ selectedIds, lines, closings, nowMs, note } = {}) {
  const ids = [...new Set(list(selectedIds).map(String).filter(Boolean))];
  if (!ids.length) return { problem: 'لم تُحدِّد أيَّ مصروف — حدِّد ما سُوّي مع الماليّة ثمّ أقفِل.' };
  if (ids.length > CLOSING_MAX_ITEMS) {
    return { problem: `حدّدتَ ${ids.length} مصروفًا والحدُّ ${CLOSING_MAX_ITEMS} للكشف الواحد — أقفِلها على كشفين.` };
  }
  const ms = Number(nowMs) || 0;
  if (!(ms > 0)) return { problem: 'لحظةُ الإقفال مجهولة — أعِد المحاولة.' };

  const byId = new Map(list(lines).map((l) => [String(l?.id), l]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    return { problem: `${missing.length} من المحدَّد ليس مصروفًا منجَزًا معروضًا الآن — حدِّث الشاشةَ وأعِد التحديد.` };
  }

  // ★ لا يُقفَل مصروفٌ مرّتين: كشفان يحملانه يعنيان تسويتَه مرّتين مع الماليّة.
  const index = closedIndex(closings);
  const already = ids.filter((id) => index.has(id));
  if (already.length) {
    const first = byId.get(already[0]);
    const name = first?.invoiceNo || first?.number || already[0];
    return {
      problem: `«${iso(name)}» مُقفَلٌ من قبل في الكشف ${iso(index.get(already[0]).number || '—')}${
        already.length > 1 ? ` (ومعه ${already.length - 1} غيرُه)` : ''
      } — لا يُقفَل مصروفٌ مرّتين.`,
    };
  }

  const items = ids
    .map((id) => byId.get(id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.number).localeCompare(String(b.number)))
    .map((l) => ({
      id: String(l.id),
      number: str(l.number),
      date: str(l.date),
      invoiceNo: str(l.invoiceNo),
      categoryKey: str(l.categoryKey),
      categoryLabel: str(l.categoryLabel),
      beneficiary: str(l.beneficiary),
      method: str(l.method),
      amount: money(l.amount),
      createdAtMs: Number(l.createdAtMs) || 0,
      shop: str(l.shop),
    }));

  // محلُّ الكشف: محلُّ مصاريفه إن اتّحد، وإلّا فارغٌ (كشفٌ يعبر المحلّات).
  const shops = [...new Set(items.map((it) => it.shop))];
  const total = money(items.reduce((s, it) => s + it.amount, 0));

  return {
    closing: {
      number: nextClosingNumber(closings, new Date(ms).getFullYear()),
      shop: shops.length === 1 ? shops[0] : '',
      expenseIds: items.map((it) => it.id),
      items,
      count: items.length,
      total,
      note: str(note),
      closedAtMs: ms,
    },
  };
}

/**
 * تقريرُ كشف إقفالٍ **من لقطته** — بالشكل نفسِه الذي يُخرجه `expenseReport`، فيُعرض ويُطبع
 * ويُصدَّر بالمسار نفسِه. الترتيب: الأقدمُ فاتورةً أوّلًا (ترتيبُ كشفٍ يُراجَع مع الماليّة).
 */
export function closingReport(closing) {
  const lines = list(closing?.items).map((it) => ({
    id: String(it?.id || ''),
    number: str(it?.number),
    date: str(it?.date),
    invoiceNo: str(it?.invoiceNo),
    categoryKey: str(it?.categoryKey),
    categoryLabel: str(it?.categoryLabel),
    beneficiary: str(it?.beneficiary),
    method: str(it?.method),
    amount: money(it?.amount),
    note: '',
    shop: str(it?.shop),
    createdAtMs: Number(it?.createdAtMs) || 0,
  }));
  return summarizeLines(lines);
}

/**
 * ما تغيّر بعد الإقفال: مصروفٌ في الكشف لم يَعُد منجَزًا (`missing`)، أو تغيّر مبلغُه
 * (`changed`). الكشفُ يبقى شاهدًا على ما سُوّي — وهذا تنبيهٌ يُعرض لا تصحيحٌ يُجرى.
 *
 * @param {object} closing
 * @param {Array} lines سطورُ المصاريف المنجَزة الآن (كلُّ المحلّات).
 * @returns {{ok:boolean, missing:Array, changed:Array}}
 */
export function closingDrift(closing, lines) {
  const now = new Map(list(lines).map((l) => [String(l?.id), l]));
  const missing = [];
  const changed = [];
  for (const it of list(closing?.items)) {
    const cur = now.get(String(it?.id));
    if (!cur) missing.push({ id: String(it?.id), invoiceNo: str(it?.invoiceNo), number: str(it?.number) });
    else if (money(cur.amount) !== money(it?.amount)) {
      changed.push({ id: String(it?.id), invoiceNo: str(it?.invoiceNo), was: money(it?.amount), now: money(cur.amount) });
    }
  }
  return { ok: missing.length === 0 && changed.length === 0, missing, changed };
}

/** كشوفُ محلٍّ: كشوفُه وكشوفُ ما عبر المحلّات (`shop:''`) — وبلا محلٍّ فعّالٍ الكلّ. الأحدثُ أوّلًا. */
export function closingsForShop(closings, shop) {
  const scoped = shop !== undefined && shop !== null && shop !== '';
  return list(closings)
    .filter((c) => !scoped || str(c?.shop) === shop || str(c?.shop) === '')
    .slice()
    .sort((a, b) => (Number(b?.closedAtMs) || 0) - (Number(a?.closedAtMs) || 0));
}
