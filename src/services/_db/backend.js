/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  اختيارُ المحوَّل — منطقٌ خالص، بلا Firebase وبلا شبكة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ ولماذا هو ملفٌّ وحدَه: القرارُ «أيُّ قاعدةٍ نكتب فيها؟» هو **أخطرُ قرارٍ
 *     في المشروع كلِّه** — وخطأٌ فيه يوم التحويل يُبقي البوّابةَ على القاعدة
 *     القديمة وهي تظنّ نفسها انتقلت. فيجب أن يُختبَر عنصرًا عنصرًا في Node
 *     بلا سحابةٍ ولا حساب. والقاعدةُ نفسُها التي في `scanQueue.js`:
 *     «الحكمُ خالصٌ عمدًا، والشاشةُ تعرض ما يحكم به ولا تُعيد بناءه».
 *
 * ولذلك لا يستورد هذا الملفّ شيئًا. حرفيًّا.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** الاسمُ الحاكمُ حين لا يُذكر شيء. */
export const DEFAULT_BACKEND = 'firestore';

/**
 * يقرأ اسمَ المحوَّل من بيئة البناء.
 *
 * ★ المفتاحُ يُقرأ من الحزمة المبنيّة لا من إعدادات المستودع — لأنّ البوّابتين
 *   (الشخصيّة ومستودع الشركة) على **قاعدةٍ واحدة**، ومستودعُ الشركة يسحب من
 *   الشخصيّ. فإعدادٌ في GitHub يبقى مع كلّ بوّابةٍ على حالها ⇒ **انقسامُ دماغ**:
 *   واحدةٌ تكتب هنا وأخرى هناك، والكتابتان لا تلتقيان أبدًا.
 *
 * @param {Record<string, unknown>} [env]
 * @returns {string}
 */
export function backendNameFrom(env) {
  const raw = env && env.PUBLIC_DB_BACKEND;
  const name = String(raw ?? '').trim();
  return name || DEFAULT_BACKEND;
}

/**
 * يختار المحوَّل من جدول المحوّلات.
 *
 * ★★ الاسمُ المجهول **يسقط بصوتٍ عالٍ** ولا يرجع صامتًا إلى الافتراض. وهذا
 *    ليس تشدّدًا: `PUBLIC_DB_BACKEND=postgress` (بحرفٍ زائد) يوم التحويل كان
 *    سيُبقي كلَّ كتابةٍ في Firestore **بينما يظنّ الجميعُ أنّها انتقلت** —
 *    ولا يُكتشف إلّا حين يُسأل المخزنُ عن رصيدٍ لا يجده. والتوقّفُ يُرى،
 *    وهذا لا يُرى.
 *
 * @param {string} name
 * @param {Record<string, object>} table
 */
export function pickBackend(name, table) {
  const known = Object.keys(table || {});
  if (table && Object.prototype.hasOwnProperty.call(table, name)) return table[name];
  throw new Error(
    `محوَّل قاعدة بيانات مجهول: «${name}». المتاح: ${known.join(' · ') || '(لا شيء)'}`
  );
}

/**
 * الرموزُ التي يجب أن يُصدّرها كلُّ محوَّل — **مقيسةٌ من الخدمات لا مفترَضة**
 * (مسحُ 2026-09-02: ٦٢ خدمةً تستعمل هذه وحدَها من مكتبة Firestore).
 *
 * وهي **عقدٌ**: محوَّلُ PostgreSQL لا يُعدّ جاهزًا حتّى يُصدّرها كلَّها،
 * ويفحص ذلك `backend.test.js` — فلا يُكتشف نقصٌ في شاشةٍ عند مستخدم.
 */
export const REQUIRED_SYMBOLS = Object.freeze([
  // المراجع
  'doc',
  'collection',
  // الاستعلام
  'query',
  'where',
  'orderBy',
  'limit',
  'startAfter',
  'documentId',
  // القراءة
  'getDoc',
  'getDocs',
  'getDocFromServer',
  'onSnapshot',
  // الكتابة
  'setDoc',
  'updateDoc',
  'addDoc',
  'deleteDoc',
  'writeBatch',
  'runTransaction',
  // القيم الخادميّة
  'serverTimestamp',
  'increment',
  'arrayUnion',
  'arrayRemove',
]);

/**
 * يفحص محوَّلًا مقابل العقد. يُعيد أسماءَ ما ينقصه — والفارغُ يعني تمامًا.
 * @param {object} impl
 * @returns {string[]}
 */
export function missingSymbols(impl) {
  if (!impl) return [...REQUIRED_SYMBOLS];
  return REQUIRED_SYMBOLS.filter((n) => typeof impl[n] !== 'function');
}
