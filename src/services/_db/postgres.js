/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المحوَّلُ الهجين — يقرأ المنسوخَ من قاعدتنا، ويمرّر ما سواه إلى Firebase
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **فكرتُه كلُّها في سطر: المراجعُ تبقى مراجعَ Firestore حقيقيّة.**
 *
 *     `doc()` و`collection()` و`query()` هنا تُنادي Firestore فعلًا وتُعيد
 *     كائناتِه نفسَها؛ وكلُّ ما نضيفه **وسمٌ جانبيٌّ في `WeakMap`** يحمل
 *     المسارَ والقيود. ولهذا ثلاثةُ آثارٍ لا يُستغنى عن واحدٍ منها:
 *
 *       ١ · **السقوطُ مجّانيّ.** تعذّرت قاعدتُنا؟ نُنادي `firestore.getDocs`
 *           **بالكائن نفسِه** الذي بين أيدينا. لا إعادةَ بناءٍ ولا ترجمةَ
 *           عكسيّة، فلا فرصةَ لخطأٍ في طريق النجاة.
 *
 *       ٢ · **الكتابةُ تبقى في مكانها بلا سطرٍ واحد.** `snap.ref` مرجعُ
 *           Firestore، فـ`updateDoc(snap.ref, …)` بعد قراءةٍ من قاعدتنا
 *           تكتب في Firebase كما كانت دائمًا — ولو كان المرجعُ من صنعنا
 *           لانكسرت كلُّ شاشةٍ تقرأ ثمّ تكتب.
 *
 *       ٣ · **لا نمسّ داخلَ Firestore.** لا قراءةَ لحقلٍ خاصٍّ ولا تعديلَ
 *           لكائنٍ من المكتبة — فترقيةُ الحزمة لا تكسر شيئًا هنا.
 *
 * ═══ وما يُقرأ من قاعدتنا وما لا يُقرأ — بقرارٍ لا بصدفة ═══
 *
 *   · **القراءةُ المفردةُ والاستعلام** (`getDoc` · `getDocs`) ⟵ هجينة.
 *   · **المستمعون** (`onSnapshot`) ⟵ Firebase دائمًا. البثُّ الحيُّ أثقلُ
 *     خطوةٍ في المشروع، ولمستخدمَين اثنين لا يستحقّها. وهو أيضًا ما يجعل
 *     الشاشةَ تتحدّث نفسَها بلا تحديث — ولا نُضحّي به مقابل قراءةٍ أرخص.
 *   · **`getDocFromServer`** ⟵ Firebase دائمًا. معناه «تجاوزِ المخبوءَ
 *     وائتِني بالأحدث»، ومرآتُنا متأخّرةٌ دقيقةً بحكم التصميم. فإجابتُها
 *     هنا **نقضٌ لغرض الدالّة نفسِه**.
 *   · **الكتابةُ كلُّها** (`setDoc` · `updateDoc` · `addDoc` · `deleteDoc` ·
 *     `writeBatch` · `runTransaction`) ⟵ Firebase. ولا سطرَ هنا يكتب في
 *     قاعدتنا — **فمصدرُ الحقيقة واحدٌ، ولا تصادمَ ولا حلقةَ صدًى.**
 * ═══════════════════════════════════════════════════════════════════════════
 */
import * as fs from './firestore.js';
import { auth } from '../../config/firebase.js';
import { routeFor, headOf, MIRRORED, isQuotaError } from './routing.js';
import { translate, DOC_ID } from './pgQuery.js';
import { rowToDoc } from './pgShape.js';
import { createClient } from './pgClient.js';

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** مفتاحُ إطفاءٍ مستقلٌّ عن اختيار المحوَّل — يُطفئ القراءةَ الهجينة وحدَها. */
const HYBRID_ON = String(ENV.PUBLIC_DB_HYBRID ?? 'on').toLowerCase() !== 'off';

const client = createClient({
  apiUrl: ENV.PUBLIC_PG_API_URL || '',
  authUrl: ENV.PUBLIC_PG_AUTH_URL || '',
  getIdToken: async () => {
    const u = auth && auth.currentUser;
    return u ? u.getIdToken() : null;
  },
  options: {
    staleSeconds: Number(ENV.PUBLIC_PG_STALE_SECONDS) || undefined,
  },
});

/* ═══════════════════ الوسمُ الجانبيّ ═══════════════════ */

/** وصفُ كلِّ قيدٍ ومرجع — خارجَ كائنات Firestore، لا بداخلها. */
const DESC = new WeakMap();
/** وسمُ `documentId()` — كي يُعرف حين يُمرَّر حقلًا. */
const DOC_ID_FIELDS = new WeakSet();

/** مسارُ مرجعٍ أو استعلامٍ موسوم. */
function pathOf(target) {
  const tag = DESC.get(target);
  if (tag && typeof tag.path === 'string') return tag.path;
  return target && typeof target.path === 'string' ? target.path : '';
}

/** قيودُ استعلامٍ موسوم — والفارغةُ تعني «المجموعةُ كلُّها». */
function constraintsOf(target) {
  const tag = DESC.get(target);
  return tag && Array.isArray(tag.constraints) ? tag.constraints : [];
}

/* ═══════════════════ المراجع ═══════════════════ */

export function doc(...args) {
  return fs.doc(...args);
}

export function collection(...args) {
  return fs.collection(...args);
}

/* ═══════════════════ الاستعلام ═══════════════════ */

export function where(field, op, value) {
  const key = DOC_ID_FIELDS.has(field) ? DOC_ID : field;
  const c = fs.where(field, op, value);
  DESC.set(c, { kind: 'where', field: key, op, value });
  return c;
}

export function orderBy(field, dir) {
  const key = DOC_ID_FIELDS.has(field) ? DOC_ID : field;
  const c = fs.orderBy(field, dir);
  DESC.set(c, { kind: 'orderBy', field: key, dir: dir === 'desc' ? 'desc' : 'asc' });
  return c;
}

export function limit(n) {
  const c = fs.limit(n);
  DESC.set(c, { kind: 'limit', n });
  return c;
}

export function startAfter(...args) {
  const c = fs.startAfter(...args);
  // ★ يُوسم مجهولًا عمدًا: `pgQuery` يرفض ترجمتَه فيسقط الاستعلامُ كلُّه
  //   إلى Firebase — وهو الصواب، لا تقريبَ له.
  DESC.set(c, { kind: 'startAfter' });
  return c;
}

export function documentId() {
  const f = fs.documentId();
  if (f && typeof f === 'object') DOC_ID_FIELDS.add(f);
  return f;
}

export function query(ref, ...constraints) {
  const q = fs.query(ref, ...constraints);
  // ★ الاستعلامُ قد يُبنى فوق استعلامٍ موسوم، فتُضمّ قيودُ الطبقتين.
  const inherited = constraintsOf(ref);
  const added = constraints.map((c) => DESC.get(c) || { kind: 'unknown' });
  DESC.set(q, { path: pathOf(ref), constraints: [...inherited, ...added] });
  return q;
}

/* ═══════════════════ تشكيلُ اللقطات ═══════════════════ */

/** وقتُ القاعدة ⟵ `Timestamp` كما تتوقّعه الشاشات. */
const tsOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : fs.Timestamp.fromDate(d);
};

/** قيمةُ وقتٍ في شرطٍ ⟵ ISO. */
const isoOf = (v) => {
  if (v && typeof v.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  return null;
};

/** بياناتُ اللقطة ثابتةٌ: نسخةٌ واحدةٌ تُعاد في كلّ نداء، كما يفعل Firestore. */
function docSnap(id, data, ref) {
  const exists = data !== null && data !== undefined;
  return {
    id,
    ref,
    exists: () => exists,
    data: () => (exists ? data : undefined),
    get: (field) => (exists ? data[field] : undefined),
    // ★ ثلاثةَ عشرَ موضعًا في البوّابة يقرأ `metadata.hasPendingWrites`.
    //   وغيابُه يرمي `TypeError` في أوّل شاشة. والقراءةُ من المرآة ليست
    //   كتابةً معلّقةً ولا مخبوءًا محلّيًّا — فكلاهما `false` بصدق.
    metadata: { hasPendingWrites: false, fromCache: false },
  };
}

function querySnap(docs) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb, thisArg) => docs.forEach((d, i) => cb.call(thisArg, d, i)),
    docChanges: () => docs.map((d, i) => ({ type: 'added', doc: d, newIndex: i, oldIndex: -1 })),
    metadata: { hasPendingWrites: false, fromCache: false },
  };
}

/* ═══════════════════ القرارُ والقراءة ═══════════════════ */

/**
 * هل نقرأ هذا المسارَ من قاعدتنا الآن؟ ويُحسم بالحالة الحيّة لا بالنيّة.
 * @returns {Promise<{ source: string, table?: string, idColumn?: string }>}
 */
async function decide(path) {
  const base = routeFor(path, { enabled: HYBRID_ON && client.configured, healthy: client.healthy() });
  if (base.source !== 'postgres') return base;
  // ★ الطزاجةُ تُسأل **بعد** أن يثبت أنّ المسارَ منسوخٌ ومسموح — فلا سؤالَ
  //   جانبيٌّ يُدفع ثمنُه على مسارٍ ذاهبٍ إلى Firebase أصلًا.
  const fresh = await client.freshPaths();
  return routeFor(path, { enabled: true, healthy: client.healthy(), fresh });
}

/** صفوفٌ ⟵ لقطاتٌ بمراجعِ Firestore. */
function rowsToSnaps(head, rows) {
  const out = [];
  for (const row of rows) {
    const mapped = rowToDoc(head, row, { ts: tsOf });
    if (!mapped) continue;
    out.push(docSnap(mapped.id, mapped.data, fs.doc(fs.db, head, mapped.id)));
  }
  return out;
}

/* ═══════════════════ «العملُ لا يتوقّف» ═══════════════════ */

/**
 * ★★★ **أمرُ المالك الحاكم (2026-10-21): «أهمُّ شيءٍ ألّا يتوقّف العملُ أبدًا».**
 *
 *     وحصّةُ Firebase المجّانيّةُ نفدت مرّةً فعلًا (2026-09-05) فتوقّفت
 *     البوّابةُ ساعاتٍ والجردُ في الغد. وما دامت الكتابةُ والقراءةُ كلتاهما
 *     عليها، فيومُ نفادِ الحصّة **يوقف العمل** مهما بنينا.
 *
 *     ⇒ فإذا ردّت Firebase «نفدت الحصّة»، **لا يُرمى الخطأُ إلى الشاشة**:
 *       تُقرأ البياناتُ من مرآة الجهاز ولو كانت متأخّرةً ساعة. **لأنّ رقمًا
 *       عمرُه ساعةٌ خيرٌ من شاشةٍ لا تفتح.**
 *
 * ★★ **ولا يُفعل هذا صامتًا:** تُرفع رايةُ `degraded` فتعرض الشاشةُ أنّ
 *    البياناتِ من النسخة المحلّيّة. والسكوتُ هنا أسوأُ من التوقّف، لأنّ
 *    المستخدمَ يقرّر على رقمٍ يظنّه الآن.
 *
 * ★ والكتابةُ **لا تُحوَّل**: تبقى على Firebase وتفشل إن فشلت. فمصدرُ
 *   الحقيقة واحدٌ، ولا نكتب في مكانين يومَ الأزمة.
 */
/** حالةُ التدهور — تُقرأ في الواجهة لعرض راية. */
const degraded = { since: 0, lastPath: '' };

function markDegraded(path) {
  degraded.since = Date.now();
  degraded.lastPath = path;
}

/** توجيهٌ قسريٌّ يتجاوز الطزاجةَ والصحّة — لا يُستعمل إلّا في الطوارئ. */
function forcedRoute(head) {
  const entry = MIRRORED[head];
  return entry ? { source: 'postgres', table: entry.table, idColumn: entry.idColumn } : null;
}

/** قراءةُ مستندٍ واحدٍ من المرآة. و`null` تعني «لم أستطع». */
async function pgGetDoc(head, id, route, ref) {
  const plan = translate(
    head,
    [{ kind: 'where', field: DOC_ID, op: '==', value: id }, { kind: 'limit', n: 1 }],
    { isoOf }
  );
  if (!plan.ok) return null;
  const res = await client.select(route.table, plan.search);
  if (!res.ok || res.rows.length === 0) return null;
  const mapped = rowToDoc(head, res.rows[0], { ts: tsOf });
  return mapped ? docSnap(mapped.id, mapped.data, ref) : null;
}

/** قراءةُ استعلامٍ من المرآة. و`null` تعني «لم أستطع». */
async function pgGetDocs(head, constraints, route) {
  const plan = translate(head, constraints, { isoOf });
  if (!plan.ok) return null;
  const res = await client.select(route.table, plan.search);
  if (!res.ok) return null;
  return querySnap(rowsToSnaps(head, res.rows));
}

export async function getDoc(ref) {
  const path = pathOf(ref);
  const { head } = headOf(path);
  const id = head ? path.slice(head.length + 1) : '';
  const route = await decide(path);

  if (route.source === 'postgres') {
    const snap = await pgGetDoc(head, id, route, ref);
    // ★ و«لا صفَّ» لا يعني «لا مستند»: قد يكون أُنشئ بعد آخر مزامنة.
    //   فالغيابُ في المرآة يُراجَع في Firebase ولا يُعلَن حذفًا.
    if (snap) return snap;
  }

  try {
    return await fs.getDoc(ref);
  } catch (err) {
    const forced = isQuotaError(err) ? forcedRoute(head) : null;
    if (!forced) throw err;
    const rescue = await pgGetDoc(head, id, forced, ref);
    if (!rescue) throw err;
    markDegraded(path);
    return rescue;
  }
}

export async function getDocs(target) {
  const path = pathOf(target);
  const { head } = headOf(path);
  const constraints = constraintsOf(target);
  const route = await decide(path);

  if (route.source === 'postgres') {
    const snap = await pgGetDocs(head, constraints, route);
    if (snap) return snap;
  }

  try {
    return await fs.getDocs(target);
  } catch (err) {
    const forced = isQuotaError(err) ? forcedRoute(head) : null;
    if (!forced) throw err;
    const rescue = await pgGetDocs(head, constraints, forced);
    if (!rescue) throw err;
    markDegraded(path);
    return rescue;
  }
}

/**
 * ★ دائمًا من Firebase — والسببُ في ترويسة الملفّ: «الأحدث» لا يُطلب من مرآة.
 */
export function getDocFromServer(ref) {
  return fs.getDocFromServer(ref);
}

/**
 * ★★ **عدٌّ من Firebase دائمًا — وهو الأرخصُ أصلًا.** `getCountFromServer`
 *    تُحاسَب قراءةً لكلّ ألف مستند، فعدُّ ثمانية آلافٍ ثمانيةُ قراءات. ولو
 *    أجبناه من المرآة لربحنا ثمانيًا وخسرنا الدقّة: رقمٌ متأخّرٌ دقيقةً
 *    يُعرض كأنّه الآن. **والرخيصُ الصادقُ خيرٌ من المجّانيّ المتأخّر.**
 */
export function getCountFromServer(...args) {
  return fs.getCountFromServer(...args);
}

/** ★ المستمعون على Firebase — البثُّ الحيُّ لم يُنقل، ولا يُدّعى أنّه نُقل. */
export function onSnapshot(...args) {
  return fs.onSnapshot(...args);
}

/* ═══════════════════ الكتابة — كلُّها إلى Firebase ═══════════════════ */

export const setDoc = fs.setDoc;
export const updateDoc = fs.updateDoc;
export const addDoc = fs.addDoc;
export const deleteDoc = fs.deleteDoc;
export const writeBatch = fs.writeBatch;
export const runTransaction = fs.runTransaction;

/* ═══════════════════ القيمُ الخادميّة والأنواع ═══════════════════ */

export const serverTimestamp = fs.serverTimestamp;
export const increment = fs.increment;
export const arrayUnion = fs.arrayUnion;
export const arrayRemove = fs.arrayRemove;
export const Timestamp = fs.Timestamp;
export const db = fs.db;

/** اسمُ المحوَّل — يُقرأ في التشخيص. */
export const BACKEND_NAME = 'postgres';

/** نافذةُ تشخيصٍ لا يُبنى عليها قرار. */
export const __hybrid = {
  enabled: HYBRID_ON,
  status: () => client.status(),
  decide,
  /** رايةُ «البياناتُ من النسخة المحلّيّة» — تعرضها الواجهة. */
  degraded: () => ({ ...degraded, active: degraded.since > 0 }),
};
