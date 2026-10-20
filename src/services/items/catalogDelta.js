/**
 * ‹LOC-READS› شاشةُ الأصناف حيّةً بلا قراءة الكتالوج كلِّه — منطقٌ خالص، بلا Firebase.
 *
 * ═══ العطبُ الذي وُجد لأجله (قِيس بالمِشحذ 2026-10-20) ═══
 * `/dashboard/products` تفتح مستمعَين كاملين: الأصنافَ (4,216) والأرصدةَ (1,762) —
 * ≈ 5,978 قراءةً لكلّ فتحة. وأُبقيت حيّةً عن قصد: «هنا تُحرَّر الأصناف، فيجب أن يرى
 * المحرِّرُ تعديلَ زميله لحظتَه». فالمطلوبُ أن تبقى حيّةً **وتكفّ عن قراءة ما لم يتغيّر**.
 *
 * ═══ والعلاج: أساسٌ محفوظٌ + مستمعٌ على ما تغيّر بعده + عدٌّ يُثبت التمام ═══
 *  ① الأساس: الكتالوجُ من ذاكرة المتصفّح إن كان طازجًا (نصفَ يوم)، وإلّا قُرئ مرّةً وحُفظ.
 *  ② المستمعُ الحيّ: `updatedAt >= أحدثِ ختمٍ في الأساس` — وكلُّ كاتبٍ في البوّابة يختم
 *     `updatedAt: serverTimestamp()` (الإنشاء · التحديث · الاستيراد · الأرشفة · القيد).
 *     والختمُ وقتُ الخادم لا وقتُ الجهاز، فساعةُ جهازٍ مقدَّمةٌ لا تُفوّت تعديلًا.
 *     و`>=` لا `>`: ما خُتم في اللحظة نفسِها يُعاد قراءةً لا يفوت.
 *  ③ العدُّ: عددُ الخادم (ألفُ مدخلٍ بقراءة) يُقارَن بعدد المدموج — فإن اختلفا (صنفٌ
 *     حُذف، أو كُتب بلا ختم) قُرئ الأساسُ من جديد. فلا يبقى في الشاشة ما ليس في القاعدة.
 *
 * ⚠️ حدٌّ معلَن: تعديلٌ **من خارج البوّابة** بلا `updatedAt` (أداةُ إدارةٍ مباشرة) لا يراه
 *    المستمع، ويظهر حين يبرد الأساسُ (نصفَ يومٍ على الأكثر) — ومفتاحُ الإطفاء يُعيد البثّ الكامل.
 */

/** ميلّي‌ثانيةُ ختمٍ بأيّ شكلٍ وصل — `Timestamp` حيًّا، أو مخزَّنًا نصًّا (`{seconds, nanoseconds}`). */
export function millisOf(ts) {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (typeof ts.toMillis === 'function') {
    const v = ts.toMillis();
    return Number.isFinite(v) ? v : null;
  }
  if (ts instanceof Date) return Number.isFinite(ts.getTime()) ? ts.getTime() : null;
  const s = Number(ts.seconds ?? ts._seconds);
  const n = Number(ts.nanoseconds ?? ts._nanoseconds ?? 0);
  if (!Number.isFinite(s)) return null;
  return s * 1000 + Math.floor((Number.isFinite(n) ? n : 0) / 1e6);
}

/** المؤشّر — أحدثُ ختمٍ في الأساس، أو صفرٌ (فيُقرأ كلُّ ما خُتم يومًا). */
export function cursorOf(rows) {
  let max = 0;
  for (const r of rows || []) {
    const m = millisOf(r?.updatedAt);
    if (m !== null && m > max) max = m;
  }
  return max;
}

/**
 * الأساسُ مدموجًا بما تغيّر — ما تغيّر يغلب، وبترتيب المستمع القديم.
 *
 * @param {object[]} base
 * @param {object[]} delta
 * @param {{key:(row:object)=>string, order:(row:object)=>string}} how
 */
export function applyDelta(base, delta, { key, order }) {
  const map = new Map();
  for (const r of base || []) {
    const k = key(r);
    if (k) map.set(k, r);
  }
  for (const r of delta || []) {
    const k = key(r);
    if (k) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => {
    const x = String(order(a) ?? '');
    const y = String(order(b) ?? '');
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/**
 * أيُعاد الأساسُ من الخادم؟ — عددٌ مختلفٌ يعني أنّ في القاعدة ما لم يصل (أو أنّ في
 * الشاشة ما حُذف). و`null` (تعذّر العدّ بلا شبكة) لا يُسقط ما في اليد.
 */
export function needsResync(mergedCount, serverCount) {
  if (!Number.isFinite(serverCount)) return false;
  return mergedCount !== serverCount;
}

/** ترتيبُ الأصناف ومفتاحُها — `orderBy('sku')` والكودُ هو المعرّف. */
export const ITEM_ROWS = Object.freeze({
  key: (r) => String(r?.sku ?? '').trim().toUpperCase(),
  order: (r) => r?.sku,
});

/** ترتيبُ الأرصدة ومفتاحُها — المعرّفُ (ترتيبُ Firestore الافتراضيّ). */
export const BALANCE_ROWS = Object.freeze({
  key: (r) => r?.id,
  order: (r) => r?.id,
});

/** مفتاحُ الإطفاء لمتصفّحٍ واحد — `'1'` يُعيد المستمعَين الكاملَين في شاشة الأصناف. */
export const PRODUCTS_FULL_READS_KEY = 'bz.products.fullReads';

/** مفتاحُ الإطفاء للجميع — `false` يُعيد البثَّ الكامل في كلّ متصفّح. */
export const PRODUCTS_DELTA_READS = true;

/** أمُطفأٌ هذا التحسين؟ — ولا يرمي: تخزينٌ محظورٌ يعني «لا مفتاح». */
export function productsFullReads(storage) {
  if (!PRODUCTS_DELTA_READS) return true;
  try {
    return storage?.getItem?.(PRODUCTS_FULL_READS_KEY) === '1';
  } catch {
    return false;
  }
}

/** ذاكرةُ الأرصدة في المتصفّح — بشكل ذاكرة الأصناف (`itemCache.js`) ونسختُها في الاسم. */
export const BALANCES_CACHE_KEY = 'bz.balances.v1';

/** يغلّف الصفوفَ للخزن. */
export function packRows(rows, now) {
  return JSON.stringify({ v: 1, at: now, rows: Array.isArray(rows) ? rows : [] });
}

/** يفكّ ما خُزن، ويرفض كلَّ ما لا يُوثق به — `null` عند أيّ شكّ. */
export function unpackRows(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || parsed.v !== 1 || !Number.isFinite(parsed.at) || !Array.isArray(parsed.rows)) return null;
  return { at: parsed.at, rows: parsed.rows };
}
