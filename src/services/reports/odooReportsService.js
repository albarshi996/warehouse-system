/**
 * ‹ODOO-RPT› قراءاتُ تقارير أودو — كلُّ قراءةٍ مقصورةٌ على ما يعرضه التقرير.
 *
 * ═══ ميزانيةُ القراءة (خطّة Spark: ٥٠ ألفًا في اليوم) ═══
 * - الاستلامُ والتوصيلُ والمرتجعُ وأوامرُ البيع: مستنداتُ المدّة وحدها، بمدى على
 *   `header.sourceDoneDate` — فهرسٌ أحاديٌّ يبنيه Firestore تلقائيًّا، فلا فهرسَ مركّبًا ينتظر نشرًا.
 *   قراءةٌ لكلّ مستند مهما كثرت بنودُه.
 * - المخزونُ اليوميّ والشهريّ: المستنداتُ المُرحَّلة منذ أوّل المدّة (مدى على `postedAt`) +
 *   الأرصدةُ الآن مرّةً واحدةً للجلسة. والشاشةُ تعرض كلفةَ كلِّ قراءةٍ بعد وقوعها.
 * ولا مستمعَ حيًّا هنا: التقريرُ لقطةٌ يطلبها القارئ بزرّ، لا قناةٌ مفتوحةٌ تُفوتَر كلَّ تغيير.
 */
import { collection, getDocs, query, where, Timestamp, db } from '../_db/index.js';
// الأرصدةُ بالقارئ القائم (على خطّ أساس الحصّة) لا بقراءةٍ كاملةٍ جديدة.
import { fetchBalancesOnce } from '../balances/balancesService.js';

const DOCS = 'documents';
const BALANCES_CACHE = 'bz.odooReports.balances';

const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : Number.isFinite(v?.seconds) ? v.seconds * 1000 : NaN);
const shape = (d) => {
  const data = d.data();
  return { id: d.id, ...data, postedAtMs: toMs(data.postedAt) };
};

/** مستنداتُ أودو التي أُنجزت في المدّة — ومعها عددُ ما قُرئ. */
export async function fetchOdooDocsInRange(from, to) {
  const snap = await getDocs(query(collection(db, DOCS), where('header.sourceDoneDate', '>=', from), where('header.sourceDoneDate', '<=', to)));
  return { docs: snap.docs.map(shape), reads: Math.max(1, snap.size) };
}

/** منتصفُ ليل يومٍ بتوقيت ليبيا (UTC+2) بالملّي ثانية. */
export function libyaMidnightMs(day) {
  return Date.parse(`${day}T00:00:00Z`) - 2 * 3600 * 1000;
}

/** كلُّ مستندٍ رُحّل منذ أوّل اليوم `fromDay` — من أيّ نوع، فلا يفوت المخزونَ أثر. */
export async function fetchPostedSince(fromDay) {
  const since = Timestamp.fromMillis(libyaMidnightMs(fromDay));
  const snap = await getDocs(query(collection(db, DOCS), where('postedAt', '>=', since)));
  return { docs: snap.docs.map(shape).filter((d) => d.posted), reads: Math.max(1, snap.size) };
}

/**
 * الأرصدةُ الآن — مرّةً للجلسة (`sessionStorage`)، والتحديثُ بطلبٍ صريح.
 * تُحفظ الحقولُ التي يحتاجها التقرير وحدها، فلا تُثقل ذاكرةَ الجلسة.
 */
export async function fetchBalancesForReports({ refresh = false } = {}) {
  if (!refresh) {
    try {
      const cached = JSON.parse(globalThis.sessionStorage?.getItem(BALANCES_CACHE) || 'null');
      if (cached?.rows) return { rows: cached.rows, at: cached.at, reads: 0, cached: true };
    } catch { /* ذاكرةُ الجلسة غير متاحة — تُقرأ من القاعدة */ }
  }
  const all = await fetchBalancesOnce();
  const rows = all.map((b) => ({ sku: b.sku || '', barcode: b.barcode || '', nameAr: b.nameAr || '', warehouse: b.warehouse || '', qty: Number(b.qty) || 0 }));
  const at = Date.now();
  try {
    globalThis.sessionStorage?.setItem(BALANCES_CACHE, JSON.stringify({ rows, at }));
  } catch { /* الحجمُ أكبر من ذاكرة الجلسة — يُعاد في المرّة القادمة */ }
  return { rows, at, reads: Math.max(1, all.length), cached: false };
}

/** مجموعُ رصيد كلّ مستودع من صفوف الأرصدة. */
export function totalsByWarehouse(rows) {
  const out = {};
  for (const r of rows || []) out[r.warehouse] = Math.round(((out[r.warehouse] || 0) + (Number(r.qty) || 0)) * 100) / 100;
  return out;
}
