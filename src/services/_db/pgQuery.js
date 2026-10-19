/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ترجمةُ الاستعلام — من قيود Firestore إلى معاملات PostgREST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **القاعدةُ الحاكمةُ في هذا الملفّ كلِّه: ما لا يُترجَم تمامًا يُردّ.**
 *
 *     والإغراءُ المقابلُ قويّ: قيدٌ واحدٌ لا نعرف مقابلَه، فنُسقطه ونُنفّذ
 *     الباقي. والنتيجةُ **صفوفٌ أكثرُ ممّا طُلب، بلا رسالةِ خطأٍ واحدة** —
 *     شاشةُ «مستنداتي» تعرض مستنداتِ غيري، وتبدو تعمل. فكلُّ قيدٍ مجهولٍ
 *     أو حقلٍ بلا عمودٍ **يُبطل الترجمةَ كلَّها** ويُعيد الاستعلامَ إلى
 *     Firebase كما هو — وهناك يُنفَّذ بدلالته الصحيحة.
 *
 *     ⇒ فالعجزُ يُعلَن، ولا يُقرَّب.
 *
 * ★★ **وفرقٌ دلاليٌّ قِيس ولم يُفترض:** Firestore **يستبعد** المستندَ الذي
 *    لا يحمل حقلَ الترتيب أصلًا؛ وPostgreSQL يُدرج الصفَّ و`NULL` فيه.
 *    فالترتيبُ على عمودٍ يقبل العدمَ يُرفَق بـ`not.is.null` — وإلّا ظهرت
 *    مستنداتٌ لم تكن تظهر، وهي زيادةٌ صامتةٌ تمامًا كالنقص.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { columnForField, columnsFor, specFor } from './pgShape.js';

/** وسمُ `documentId()` — رمزٌ داخليٌّ لا يصل القاعدةَ باسمه. */
export const DOC_ID = '__name__';

/** مقابلاتُ المعاملات. وما ليس هنا **لا يُترجَم**. */
const OPS = Object.freeze({
  '==': 'eq',
  '!=': 'neq',
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte',
  in: 'in',
  'not-in': 'not.in',
  'array-contains': 'cs',
  'array-contains-any': 'ov',
});

/** الأعمدةُ التي تقبل العدم — يُحسب منها شرطُ الترتيب. */
const NULLABLE_KINDS = new Set(['ts', 'num', 'json']);

/**
 * ★★★ **درسٌ قِيس على PostgREST v12.2.3 ولم يُفترض (2026-10-20):**
 *
 *     `state=eq."approved"` يُعيد **HTTP 200 وصفرَ صفٍّ**. فعلامتا الاقتباس
 *     **لا تُنزعان** في المعاملات المفردة؛ يُبحث عن نصٍّ فيه الاقتباسان.
 *     ولا رسالةَ خطأٍ واحدة — شاشةٌ فارغةٌ تبدو «لا نتائج».
 *     وقُيس على البيانات الحيّة: ٤٢ صفًّا عاريًا · صفرٌ باقتباس.
 *
 *     ⇒ **المفردُ يُرمَّز ولا يُقتبَس.** (و`encodeURIComponent` يكفي: الخادمُ
 *       يفكّ الترميزَ قبل المطابقة، وقِيس على اسمٍ عربيٍّ: ٣١٨ صفًّا.)
 *
 * ★★ **وداخل القوائم العكس:** `in.("a","b")` تُنزع فيه الاقتباسات فعلًا
 *    (قِيس: العاري والمقتبَس يعطيان ٥٨ صفًّا سواءً). فتبقى الاقتباساتُ هناك
 *    لأنّها الوسيلةُ الوحيدةُ لقيمةٍ فيها فاصلة.
 */

/** قيمةٌ مفردةٌ — تُرمَّز ولا تُقتبَس. و`null` تعني «لا تُترجَم». */
function encodeScalar(v, kind, deps) {
  const isoOf = deps && typeof deps.isoOf === 'function' ? deps.isoOf : null;

  if (v === null || v === undefined) return null; // يُعالَج بـ`is.null` خارجًا
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;

  if (typeof v === 'string') {
    // ★★★ وثلاثُ كلماتٍ لا يمكن التعبيرُ عنها نصًّا في عمودٍ نصّيّ: العاري
    //     منها يعني العدمَ أو المنطقَ عند الخادم، والمقتبَسُ لا يُنزع. فالعجزُ
    //     يُعلَن ويذهب الاستعلامُ إلى Firebase — ولا يُطابَق شيءٌ خاطئ.
    if (kind === 'str' && /^(null|true|false)$/i.test(v)) return null;
    return encodeURIComponent(v);
  }

  if (v instanceof Date) return encodeURIComponent(v.toISOString());
  if (isoOf) {
    const iso = isoOf(v);
    if (typeof iso === 'string' && iso) return encodeURIComponent(iso);
  }
  return null;
}

/** قيمةٌ داخل قائمةٍ أو مصفوفة — تُقتبَس ثمّ تُرمَّز. */
function encodeQuoted(v, deps) {
  const isoOf = deps && typeof deps.isoOf === 'function' ? deps.isoOf : null;
  let text = null;

  if (v === null || v === undefined) return null;
  else if (typeof v === 'boolean' || typeof v === 'number') text = String(v);
  else if (typeof v === 'string') text = v;
  else if (v instanceof Date) text = v.toISOString();
  else if (isoOf) {
    const iso = isoOf(v);
    if (typeof iso === 'string' && iso) text = iso;
  }
  if (text === null) return null;

  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return encodeURIComponent(`"${escaped}"`);
}

/** قائمةُ قيمٍ لـ`in` / `ov` / `cs`. */
function encodeList(list, deps, braces) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const parts = [];
  for (const v of list) {
    const e = encodeQuoted(v, deps);
    if (e === null) return null;
    parts.push(e);
  }
  return braces ? `{${parts.join(',')}}` : `(${parts.join(',')})`;
}

/** العجزُ بصيغةٍ واحدةٍ تُقرأ في التشخيص. */
const no = (reason) => ({ ok: false, reason });

/**
 * يترجم قيودَ استعلامٍ إلى سلسلةِ بحثٍ لـPostgREST.
 *
 * @param {string} head اسمُ المجموعة.
 * @param {Array<object>} constraints وصفُ القيود (`where` · `orderBy` · …).
 * @param {object} [deps]
 * @param {(v: unknown) => string | null} [deps.isoOf] تحويلُ وقتٍ إلى ISO.
 * @returns {{ ok: true, search: string } | { ok: false, reason: string }}
 */
export function translate(head, constraints, deps) {
  const spec = specFor(head);
  if (!spec) return no('غير منسوخة');

  const cols = columnsFor(head);
  const parts = [`select=${cols.join(',')}`];
  const orders = [];
  let limitSeen = null;

  for (const c of constraints || []) {
    if (!c || typeof c !== 'object') return no('قيدٌ معطوب');

    switch (c.kind) {
      case 'where': {
        const isDocId = c.field === DOC_ID;
        const target = isDocId
          ? { column: spec.idColumn, kind: 'str' }
          : columnForField(head, c.field);
        if (!target) return no(`حقلٌ بلا عمود: ${c.field}`);

        const op = OPS[c.op];
        if (!op) return no(`معاملٌ لا يُترجَم: ${c.op}`);

        // العدمُ له صيغتُه الخاصّة، ولا يُقارَن بـ`eq`.
        if (c.value === null || c.value === undefined) {
          if (c.op === '==') {
            parts.push(`${target.column}=is.null`);
            break;
          }
          if (c.op === '!=') {
            parts.push(`${target.column}=not.is.null`);
            break;
          }
          return no('مقارنةُ عدمٍ لا تُترجَم');
        }

        if (op === 'in' || op === 'not.in') {
          const list = encodeList(c.value, deps, false);
          if (!list) return no('قائمةٌ لا تُترجَم');
          parts.push(`${target.column}=${op}.${list}`);
          break;
        }

        if (op === 'cs' || op === 'ov') {
          // ★ الاحتواءُ لا معنى له إلّا على عمودٍ مصفوفة.
          if (target.kind !== 'arr') return no('احتواءٌ على عمودٍ ليس مصفوفة');
          const list =
            op === 'cs'
              ? encodeList([c.value], deps, true)
              : encodeList(c.value, deps, true);
          if (!list) return no('قائمةُ احتواءٍ لا تُترجَم');
          parts.push(`${target.column}=${op}.${list}`);
          break;
        }

        const enc = encodeScalar(c.value, target.kind, deps);
        if (enc === null) return no('قيمةٌ لا تُترجَم');
        parts.push(`${target.column}=${op}.${enc}`);
        break;
      }

      case 'orderBy': {
        const isDocId = c.field === DOC_ID;
        const target = isDocId
          ? { column: spec.idColumn, kind: 'str' }
          : columnForField(head, c.field);
        if (!target) return no(`ترتيبٌ على حقلٍ بلا عمود: ${c.field}`);

        const desc = c.dir === 'desc';
        orders.push(`${target.column}.${desc ? 'desc' : 'asc'}.${desc ? 'nullslast' : 'nullsfirst'}`);

        // ★★ مطابقةُ دلالة Firestore: الغائبُ لا يظهر في نتيجةِ ترتيبٍ عليه.
        if (NULLABLE_KINDS.has(target.kind)) parts.push(`${target.column}=not.is.null`);
        break;
      }

      case 'limit': {
        const n = Number(c.n);
        if (!Number.isInteger(n) || n <= 0) return no('حدٌّ غيرُ صحيح');
        limitSeen = n;
        break;
      }

      // ★★★ `startAfter` مؤشّرُ موضعٍ يبنيه Firestore من لقطةٍ سابقة. ولا
      //     مقابلَ أمينًا له هنا: `offset` يُزيح بالعدّ لا بالقيمة، فيُكرّر
      //     صفًّا أو يقفز فوقه إن تغيّرت البيانات بين الصفحتين. فيُعلَن العجز.
      case 'startAfter':
        return no('مؤشّرُ صفحةٍ لا يُترجَم');

      default:
        return no(`قيدٌ مجهول: ${c.kind}`);
    }
  }

  if (orders.length > 0) parts.push(`order=${orders.join(',')}`);
  if (limitSeen !== null) parts.push(`limit=${limitSeen}`);

  return { ok: true, search: parts.join('&') };
}
