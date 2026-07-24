/**
 * صندوق المستندات (F5) — منطق خالص، بلا Firestore وبلا DOM.
 *
 * ما يحلّه: الورقة المطبوعة تُوضع على مكتبٍ **فتُنسى**. ولا أحد يعرف كم
 * بقيت هناك. هذا الملف يجعل الانتظار **مرئيًّا ومقيسًا**: كم يومًا مضى على
 * المستند في حالته، ومتى يصير «متأخّرًا»، وما الذي ينتظر اعتماد هذا
 * المستخدم تحديدًا لا كلَّ ما أُرسل.
 *
 * ولماذا خالص؟ ليُختبَر في Node بلا متصفّح — والشاشة محميّة بالدخول.
 */
import { getSchema } from './schemas/index.js';
import { getState } from './states.js';

/**
 * حدود التأخّر بالأيام لكل حالة.
 * الأرقام اجتهادية قابلة للضبط، لكن المبدأ ثابت: **المُرسَل ينتظر اعتمادًا
 * فهو الأحرج**، والمعتمَد ينتظر إنهاءً فمهلته أوسع، والمسودّة قد تُترك عمدًا
 * لكنها بعد أسبوعين غالبًا نُسيت.
 */
export const STALE_DAYS = {
  submitted: 2,
  approved: 5,
  draft: 14,
  rejected: 7,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * يحوّل طابع Firestore (أو Date أو رقمًا) إلى ميلي-ثانية.
 * يُعيد null لما لا يُقرأ — فلا نخترع تاريخًا.
 */
export function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * كم يومًا مضى على المستند في حالته الحالية.
 * المرجع `updatedAt` لأنه يتغيّر مع كل نقلة — فهو عمر **الحالة** لا عمر
 * المستند. يُعيد null إن لم يُعرف التاريخ (لا نفترض صفرًا فنُخفي تأخّرًا).
 */
export function ageInState(doc, nowMs) {
  const at = toMillis(doc?.updatedAt) ?? toMillis(doc?.createdAt);
  if (at == null || !nowMs) return null;
  return Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

/** هل تجاوز المستند مهلة حالته؟ (المنجَز لا يتأخّر — انتهى) */
export function isStale(doc, nowMs, limits = STALE_DAYS) {
  if (!doc || doc.state === 'done') return false;
  const limit = limits[doc.state];
  if (limit == null) return false;
  const age = ageInState(doc, nowMs);
  return age != null && age > limit;
}

/**
 * ما ينتظر اعتماد **هذا المستخدم** تحديدًا.
 * الأدمن يرى كل مُرسَل؛ وغيره يرى ما يملك دور اعتماده في مخطّطه — فلا
 * يُغرَق مفتّش الجودة بأوامر شراءٍ لا شأن له بها.
 */
export function awaitingMyApproval(docs, me) {
  return (docs || []).filter((d) => {
    if (d?.state !== 'submitted') return false;
    if (me?.role === 'admin') return true;
    const approvers = getSchema(d.type)?.roles?.approve || [];
    return approvers.includes(me?.role);
  });
}

/** يرتّب: المتأخّر أولًا، ثم الأقدم انتظارًا — لا الأحدث. */
export function sortByUrgency(docs, nowMs) {
  return [...(docs || [])].sort((a, b) => {
    const sa = isStale(a, nowMs) ? 0 : 1;
    const sb = isStale(b, nowMs) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const aa = ageInState(a, nowMs) ?? -1;
    const ab = ageInState(b, nowMs) ?? -1;
    return ab - aa;
  });
}

/** تطبيع عربي للبحث — نفس قاعدة بحث القائمة الجانبية. */
export function normalizeAr(text) {
  return String(text ?? '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .toLowerCase();
}

/**
 * تصفية القائمة: نصّ حرّ (رقم · نوع · اسم المُنشئ) + نوع + حالة.
 * البحث يشمل **عنوان النوع العربي** لا رمزه فقط — فالموظّف يكتب «استلام»
 * لا `GRN`.
 */
export function filterDocs(docs, { q = '', type = '', state = '' } = {}) {
  const needle = normalizeAr(q).trim();
  return (docs || []).filter((d) => {
    if (type && d.type !== type) return false;
    if (state && d.state !== state) return false;
    if (!needle) return true;
    const title = getSchema(d.type)?.titleAr || '';
    const hay = normalizeAr([d.number, d.type, title, d.createdByName].filter(Boolean).join(' '));
    return hay.includes(needle);
  });
}

/** لقطة الصندوق: كم في كل حالة، وكم متأخّر. */
export function inboxStats(docs, nowMs) {
  const all = docs || [];
  return {
    total: all.length,
    draft: all.filter((d) => d.state === 'draft').length,
    submitted: all.filter((d) => d.state === 'submitted').length,
    approved: all.filter((d) => d.state === 'approved').length,
    rejected: all.filter((d) => d.state === 'rejected').length,
    done: all.filter((d) => d.state === 'done').length,
    stale: all.filter((d) => isStale(d, nowMs)).length,
    unnumbered: all.filter((d) => !d.number).length,
  };
}

/* ═══════════════ التصدير ═══════════════ */

/** يهرّب خلية CSV: يلفّها بعلامتَي اقتباس ويُضاعف ما بداخلها. */
function csvCell(value) {
  const s = String(value ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * يصدّر المستندات إلى CSV بعناوين عربية.
 *
 * ⚠️ **BOM في المقدّمة مقصود**: إكسل على ويندوز يقرأ CSV بترميز النظام لا
 * UTF-8 ما لم يجد BOM — وبدونها تصل العربية كلّها رموزًا مشوّهة. هذا خطأٌ
 * شائع يُفسد كل تصدير عربي.
 */
export function toCsv(docs, nowMs) {
  const headers = ['الرقم', 'النوع', 'الحالة', 'أنشأه', 'أيام في الحالة', 'متأخّر', 'آخر تحديث'];
  const rows = (docs || []).map((d) => {
    const age = ageInState(d, nowMs);
    const at = toMillis(d.updatedAt || d.createdAt);
    return [
      d.number || 'مسودّة',
      getSchema(d.type)?.titleAr || d.type,
      getState(d.state).label,
      d.createdByName || '',
      age == null ? '' : age,
      isStale(d, nowMs) ? 'نعم' : 'لا',
      at ? new Date(at).toISOString().slice(0, 16).replace('T', ' ') : '',
    ];
  });
  const body = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM بكود الهروب لا بالمحرف نفسه: المحرف غير مرئي في المحرّر فيسهل
  // حذفه سهوًا (وقد حدث)، ولينت يرفضه كمسافة غير نظامية بحقّ.
  return `\uFEFF${body}`;
}

/** اسم ملف التصدير — بالتبويب والتاريخ، فلا تتراكم ملفات متشابهة. */
export function csvFileName(tabLabel, nowMs) {
  const d = nowMs ? new Date(nowMs) : null;
  const stamp = d ? d.toISOString().slice(0, 10) : 'export';
  return `Brandzo-مستندات-${tabLabel}-${stamp}.csv`;
}
