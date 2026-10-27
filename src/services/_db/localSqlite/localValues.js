/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  قيمُ المحوَّل المحلّيّ — منطقٌ خالصٌ يُختبَر في Node بلا قاعدةٍ ولا جهاز
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * يحمل ما لا يمسّ SQL ولا Tauri: تشكيلُ الطوابع الزمنيّة، وقيمُ الحقول الخادميّة
 * (`serverTimestamp` · `increment` · `arrayUnion` · `arrayRemove`)، ودمجُ الكتابة
 * مع حلّ تلك القيم، ومساراتُ المراجع. لا ساعةَ تُقرأ هنا — الوقتُ يُمرَّر دائمًا.
 *
 * ★ الطابعُ الزمنيّ يُخزَّن ISO موسومًا `{"__ts__": "..."}` داخل الـJSON، فيعود
 *   كائنَ Timestamp عند القراءة (round-trip تامّ)، ويظلّ `json_extract` قادرًا
 *   على ترتيبه وترشيحه (انظر `sqlQuery.js`).
 */

/* ═══════════════════ المسارات والمعرّفات ═══════════════════ */

/** يصل القطعَ بمسارٍ واحدٍ ويطوي الفواصلَ المكرّرة. */
export function joinPath(parts) {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .map((p) => String(p))
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

/** مسارُ وثيقةٍ ⟵ { col, id, path }. آخرُ قطعةٍ معرّفٌ، وما قبلها مجموعة. */
export function splitDocPath(path) {
  const segs = joinPath([path]).split('/').filter(Boolean);
  const id = segs[segs.length - 1] || '';
  const col = segs.slice(0, -1).join('/');
  return { col, id, path: segs.join('/') };
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * معرّفٌ تلقائيٌّ بعشرين حرفًا — على نمط Firestore. عشوائيٌّ وحدَه (بلا ساعة)
 * كي يبقى هذا الملفُّ خالصًا؛ واحتمالُ التصادم لكاتبٍ واحدٍ لا يُذكر.
 */
export function genId(random = Math.random) {
  let out = '';
  for (let i = 0; i < 20; i += 1) {
    out += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
  }
  return out;
}

/* ═══════════════════ الطابعُ الزمنيّ ═══════════════════ */

/** كائنُ طابعٍ زمنيٍّ متوافقٌ مع ما تتوقّعه الشاشات من Firestore. */
export function makeTimestamp(ms) {
  const millis = Number(ms) || 0;
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: (((millis % 1000) + 1000) % 1000) * 1e6,
    toMillis: () => millis,
    toDate: () => new Date(millis),
    valueOf: () => millis,
    isEqual: (o) => !!o && typeof o.toMillis === 'function' && o.toMillis() === millis,
  };
}

/** هل القيمةُ طابعًا زمنيًّا (لنا أو من Firestore) أو تاريخًا؟ */
export function isTimestampLike(v) {
  return !!v && typeof v === 'object' && typeof v.toDate === 'function';
}

/** واجهةُ `Timestamp` — تُبنى بساعةٍ محقونةٍ فلا تُقرأ هنا. */
export function makeTimestampApi(now) {
  return {
    fromDate: (d) => makeTimestamp(d instanceof Date ? d.getTime() : Number(d) || 0),
    fromMillis: (ms) => makeTimestamp(ms),
    now: () => makeTimestamp(now()),
  };
}

/* ═══════════════════ القيمُ الخادميّة (sentinels) ═══════════════════ */

const SENTINEL = '__bz_sentinel__';

export const serverTimestampSentinel = () => ({ [SENTINEL]: 'serverTimestamp' });
export const incrementSentinel = (n) => ({ [SENTINEL]: 'increment', n: Number(n) || 0 });
export const arrayUnionSentinel = (vals) => ({ [SENTINEL]: 'arrayUnion', vals });
export const arrayRemoveSentinel = (vals) => ({ [SENTINEL]: 'arrayRemove', vals });

export function isSentinel(v) {
  return !!v && typeof v === 'object' && typeof v[SENTINEL] === 'string';
}

/** تسلسلٌ قانونيٌّ بترتيب مفاتيحٍ ثابت — فالمساواةُ لا تتأثّر بترتيب الإدخال. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * مساواةٌ بالقيمة (لإزالة التكرار في المصفوفات) — بعد التشفير كي يتساوى طابعان،
 * وبترتيبٍ قانونيٍّ كي يتساوى كائنان اختلف ترتيبُ مفاتيحهما (كـFirestore).
 */
export function valueEquals(a, b) {
  return canonical(encodeValue(a)) === canonical(encodeValue(b));
}

function resolveSentinel(current, s, now) {
  switch (s[SENTINEL]) {
    case 'serverTimestamp':
      return makeTimestamp(now());
    case 'increment':
      return (typeof current === 'number' ? current : 0) + s.n;
    case 'arrayUnion': {
      const base = Array.isArray(current) ? current.slice() : [];
      for (const v of s.vals) if (!base.some((x) => valueEquals(x, v))) base.push(v);
      return base;
    }
    case 'arrayRemove': {
      const base = Array.isArray(current) ? current : [];
      return base.filter((x) => !s.vals.some((v) => valueEquals(x, v)));
    }
    default:
      return undefined;
  }
}

/* ═══════════════════ التشفير والفكّ ═══════════════════ */

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !isTimestampLike(v);
}

/** قيمةٌ حيّةٌ ⟵ JSON قابلٌ للتخزين (الطوابعُ تُوسَم). */
export function encodeValue(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return { __ts__: v.toISOString() };
  if (isTimestampLike(v)) {
    const d = v.toDate();
    return { __ts__: (d instanceof Date ? d : new Date(d)).toISOString() };
  }
  if (Array.isArray(v)) return v.map(encodeValue);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = encodeValue(v[k]);
    return out;
  }
  return v;
}

/** JSON المخزَّن ⟵ قيمةٌ حيّة (الوسمُ `__ts__` يعود طابعًا). */
export function decodeValue(v, mkTimestamp = makeTimestamp) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, mkTimestamp));
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__ts__' && typeof v.__ts__ === 'string') {
      return mkTimestamp(Date.parse(v.__ts__));
    }
    const out = {};
    for (const k of keys) out[k] = decodeValue(v[k], mkTimestamp);
    return out;
  }
  return v;
}

/* ═══════════════════ دمجُ الكتابة ═══════════════════ */

function clonePlain(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(clonePlain);
  if (isTimestampLike(v) || v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clonePlain(v[k]);
    return o;
  }
  return v;
}

function getDeep(obj, segs) {
  let cur = obj;
  for (const s of segs) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[s];
  }
  return cur;
}

function setDeep(obj, segs, value) {
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const s = segs[i];
    if (!isPlainObject(cur[s])) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

/**
 * يمنع وضعَ قيمةٍ خادميّةٍ (sentinel) داخل مصفوفة — كـFirestore يرمي، لا يخزّنها
 * حرفيًّا. يُفحص عمقًا: مصفوفةٌ، أو كائنٌ داخل مصفوفة.
 */
function assertNoSentinelInArray(v) {
  if (isSentinel(v)) throw new Error('لا يجوز وضعُ قيمةٍ خادميّةٍ (sentinel) داخل مصفوفة');
  if (Array.isArray(v)) {
    for (const x of v) assertNoSentinelInArray(x);
  } else if (isPlainObject(v)) {
    for (const k of Object.keys(v)) assertNoSentinelInArray(v[k]);
  }
}

function resolveField(current, incoming, now, deep) {
  if (isSentinel(incoming)) return resolveSentinel(current, incoming, now);
  if (Array.isArray(incoming)) {
    assertNoSentinelInArray(incoming);
    return incoming;
  }
  if (isPlainObject(incoming)) {
    // ★ دمجٌ عميقٌ (setDoc merge) ⟵ `deep`؛ واستبدالُ الخريطة كاملةً
    //   (updateDoc بخريطةٍ) ⟵ غيرُه — فالدمجُ العميقُ للخرائط في الدمج وحدَه،
    //   وفي التحديث تُستبدَل الخريطةُ (نمطُ Firestore؛ المسارُ بالنقاط للدمج الجزئيّ).
    const base = deep && isPlainObject(current) ? current : {};
    return applyData(base, incoming, { now, deep });
  }
  return incoming;
}

/**
 * يدمج `data` في نسخةٍ من `base`، حالًّا القيمَ الخادميّة في موضعها، مع دعم
 * مفاتيح المسار بالنقاط (`updateDoc('a.b', x)`). والأساسُ `{}` يعني الكتابةَ
 * الكاملة (`setDoc` بلا دمج) حيث تُحلّ `increment` على صفرٍ و`serverTimestamp`
 * على الآن.
 *
 * `deep=true` (الافتراض، للدمج): الخرائطُ المتداخلةُ تُدمج عميقًا. و`deep=false`
 * (للتحديث `updateDoc`): الخريطةُ المتداخلةُ تُستبدَل كاملةً كـFirestore.
 */
export function applyData(base, data, { now, deep = true }) {
  const out = clonePlain(base) || {};
  for (const rawKey of Object.keys(data)) {
    const segs = rawKey.split('.').filter(Boolean);
    const current = getDeep(out, segs);
    setDeep(out, segs, resolveField(current, data[rawKey], now, deep));
  }
  return out;
}
