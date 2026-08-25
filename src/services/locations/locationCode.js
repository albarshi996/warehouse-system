/**
 * نحو كود موقع التخزين — منطق خالص بلا Firebase، قابل للاختبار وحده.
 *
 * المشكلة التي يحلّها: `bin` كان نصًّا حرًّا في مخطّطات التخزين والسحب والجرد،
 * فالرفّ الواحد يُكتب «R01-09-F» و«r01 09 f» و«R1-9-F» — ثلاثة مواقع في نظر
 * الحاسوب وموقعٌ واحد في نظر العامل. ومفتاحُ رصيدٍ يُبنى من نصٍّ حرٍّ يعني
 * مفاتيح بعدد أخطاء الطباعة.
 *
 * الهويّة الكاملة يحفظها النظام:
 *   MAIN-A01-R01-B09-LF-P01
 *    │    │   │   │   │   └── الموضع داخل المستوى
 *    │    │   │   │   └────── المستوى F
 *    │    │   │   └────────── الخانة الأفقية (Bay) 09
 *    │    │   └────────────── الرفّ (Rack) 01
 *    │    └────────────────── المنطقة أو الممرّ A01
 *    └─────────────────────── المستودع
 *
 * والمختصر يراه العامل: `R01-09-F` — **يُشتقّ من الكود ولا يُكتب يدويًّا**،
 * فلا يفترق الاسمان بعد اليوم.
 *
 * المقاطع **قابلة للاختصار من الآخر**: `MAIN-A01` منطقةٌ كاملة موقعٌ صالح،
 * والمقطع الغائب يُحذف ولا يُصفَّر (قرار المالك معلَّق — LOC-O01، وهذا سلوكه
 * الافتراضيّ المعلَن حتى يُحسم).
 */

import { isReservedCode, isSystemLocation } from '../ledger/locations.js';

/** ترتيب المقاطع بعد المستودع — الترتيب نفسه هو المعنى. */
export const CODE_SEGMENTS = ['warehouse', 'zone', 'rack', 'bay', 'level', 'position'];

/** الفاصل بين المقاطع. */
export const SEGMENT_SEPARATOR = '-';

/** أقلّ عدد مقاطع مقبول: المستودع ومقطعٌ واحد على الأقلّ بعده. */
export const MIN_SEGMENTS = 2;

/**
 * محارف المقطع المسموحة: لاتينيّ كبير وأرقام غربية فقط.
 *
 * ⚠️ هذا الحصر ليس تجميلًا: كود الموقع سيصير **معرّف مستند Firestore** وجزءًا
 * من مفتاح الرصيد. فـ`/` و`.` و`#` و`$` و`[` و`]` تكسر المعرّف، و`:` تصطدم
 * ببادئتَي `VAN:` و`CUST:` المحجوزتين، والمسافة تُنتج مفتاحين لموقعٍ واحد.
 */
const SEGMENT_RE = /^[A-Z0-9]+$/;

/** أطول مقطعٍ مقبول — حدٌّ يمنع لصق فقرةٍ كاملة في خانة رفّ. */
export const MAX_SEGMENT_LEN = 12;

/** أرقام عربية-هندية إلى غربية — الشيت والملصق قد يحملان أيًّا منهما. */
function westernDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

/**
 * الصيغة القياسية لكود الموقع: أرقام غربية · حروف كبيرة · بلا فراغات ·
 * الفواصل المتكرّرة تُطوى · والفواصل الطرفيّة تُقصّ.
 *
 * يُطبَّق على **كل** مدخل قبل المقارنة أو التخزين، فيلتقي ما كتبه العامل بما
 * طُبع على الملصق.
 */
export function normalizeLocationCode(raw) {
  if (raw === null || raw === undefined) return '';
  return westernDigits(String(raw))
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, SEGMENT_SEPARATOR)
    .replace(/-{2,}/g, SEGMENT_SEPARATOR)
    .replace(/^-+|-+$/g, '');
}

/**
 * يفكّ الكود إلى مقاطعه المسمّاة.
 *
 * @returns {{code:string, warehouse:string, zone:string, rack:string, bay:string,
 *            level:string, position:string, depth:number, segments:string[]}|null}
 *          `null` إن كان الكود غير صالح — والسبب يُطلب من `locationCodeProblem`.
 */
export function parseLocationCode(raw) {
  const code = normalizeLocationCode(raw);
  if (locationCodeProblem(code)) return null;

  const segments = code.split(SEGMENT_SEPARATOR);
  const out = { code, depth: segments.length, segments };
  CODE_SEGMENTS.forEach((name, i) => {
    out[name] = segments[i] ?? '';
  });
  return out;
}

/**
 * سبب رفض الكود — نصٌّ عربيّ يقوله للمستخدم، أو `''` إن كان صالحًا.
 *
 * منفصلٌ عن `parseLocationCode` عمدًا: الشاشة تحتاج **السبب** لتعرضه،
 * والمنطق يحتاج **النتيجة** فقط. ودالّةٌ تُعيد الاثنين معًا تُستعمل خطأً.
 */
export function locationCodeProblem(raw) {
  const code = normalizeLocationCode(raw);
  if (!code) return 'كود الموقع مطلوب.';

  // ⚠️ الحارس الحقيقيّ، **ويسبق كلّ فحصٍ آخر عمدًا**: `balances.warehouse`
  // يحمل أكواد المستودعات ومواقع النظام الثمانية وبادئتَي المركبة والعميل في
  // حقلٍ واحد. فكودُ موقعٍ يصطدم بأحدها يخلط رصيد الرحلة برصيد الرفّ **بلا
  // صوت**. ولو تأخّر هذا الفحص خلف عدد المقاطع لَما أُطلق أبدًا — إذ كلّ رمزٍ
  // محجوز إمّا مقطعٌ واحد (`RECEIVING`) أو يحمل «:» (`VAN:`)، فيُرفض بسببٍ
  // آخر ويقرأ المستخدم رسالةً لا تصف عطبه.
  if (isReservedCode(code)) {
    return `«${code}» رمزٌ محجوز لمواقع النظام أو المركبات أو العملاء — اختر كودًا آخر.`;
  }

  const segments = code.split(SEGMENT_SEPARATOR);
  if (segments.length < MIN_SEGMENTS) {
    return `كود الموقع يحتاج مقطعين على الأقلّ (المستودع ثمّ المنطقة) — مثال: MAIN${SEGMENT_SEPARATOR}A01`;
  }
  if (segments.length > CODE_SEGMENTS.length) {
    return `كود الموقع لا يتجاوز ${CODE_SEGMENTS.length} مقاطع: ${CODE_SEGMENTS.join(' ← ')}`;
  }
  for (const seg of segments) {
    if (!SEGMENT_RE.test(seg)) {
      return `المقطع «${seg}» يحمل محرفًا غير مسموح — حروفٌ لاتينية كبيرة وأرقامٌ فقط (لا مسافات ولا رموز).`;
    }
    if (seg.length > MAX_SEGMENT_LEN) {
      return `المقطع «${seg}» أطول من ${MAX_SEGMENT_LEN} محرفًا.`;
    }
  }

  // ولا يصلح موقعُ نظامٍ **مستودعًا** في كود موقع: `RECEIVING-A01` يقرؤه
  // القارئ رفًّا في ساحة الاستلام، وساحةُ الاستلام مرحلةٌ لا مبنًى.
  if (isSystemLocation(segments[0])) {
    return `«${segments[0]}» موقعُ نظامٍ محجوز فلا يصلح مستودعًا في كود موقع.`;
  }
  return '';
}

/** هل الكود صالح؟ */
export function isValidLocationCode(raw) {
  return locationCodeProblem(raw) === '';
}

/**
 * يبني الكود من مقاطعه. المقاطع الغائبة **تُحذف من الآخر** ولا تُصفَّر —
 * فـ`{warehouse:'MAIN', zone:'A01'}` يُنتج `MAIN-A01` لا `MAIN-A01----`.
 *
 * وفجوةٌ في الوسط (رفٌّ بلا منطقة) خطأٌ صريح: تُعاد `''` لأنّ الترتيب هو
 * المعنى، وكودٌ يقفز مستوًى يكذب على قارئه.
 */
export function formatLocationCode(parts) {
  const values = CODE_SEGMENTS.map((name) => normalizeLocationCode(parts?.[name]));
  const lastFilled = values.reduce((last, v, i) => (v ? i : last), -1);
  if (lastFilled < MIN_SEGMENTS - 1) return '';
  const kept = values.slice(0, lastFilled + 1);
  if (kept.some((v) => !v)) return ''; // فجوة في الوسط — لا يُسكت عنها
  return kept.join(SEGMENT_SEPARATOR);
}

/** يُسقط بادئة حرفٍ واحد إن تلاه شيء: `B09`→`09` · `LF`→`F` · `9`→`9`. */
function trimOnePrefix(seg) {
  return /^[A-Z]./.test(seg) ? seg.slice(1) : seg;
}

/**
 * التسمية المختصرة التي يراها العامل — `MAIN-A01-R01-B09-LF-P01` ⟵ `R01-09-F`.
 *
 * لماذا مشتقّة لا مخزَّنة؟ لأنّ حقلًا يدويًّا بجانب الكود يفترق عنه أوّل تعديل،
 * فيقرأ العامل رفًّا ويمسح آخر.
 */
export function shortLabelOf(raw) {
  const parsed = parseLocationCode(raw);
  if (!parsed) return normalizeLocationCode(raw);

  const { rack, bay, level, zone } = parsed;
  const head = rack || zone;
  const parts = [head, bay ? trimOnePrefix(bay) : '', level ? trimOnePrefix(level) : ''].filter(Boolean);
  return parts.length ? parts.join(SEGMENT_SEPARATOR) : parsed.code;
}

/**
 * كود الأب في الشجرة — `MAIN-A01-R01` ⟵ `MAIN-A01`، والجذر يُعيد `''`.
 * يُستعمل لبناء الشجرة ولحساب السعة الصاعدة.
 */
export function parentCodeOf(raw) {
  const code = normalizeLocationCode(raw);
  const segments = code.split(SEGMENT_SEPARATOR);
  // أبٌ بمقطعٍ واحد ليس موقعًا (المستودع وحده) — فالمنطقة جذرُ الشجرة.
  if (segments.length <= MIN_SEGMENTS) return '';
  return segments.slice(0, -1).join(SEGMENT_SEPARATOR);
}

/** هل `descendant` واقعٌ تحت `ancestor` في الشجرة؟ (الموقع ليس سليل نفسه) */
export function isDescendantOf(descendant, ancestor) {
  const d = normalizeLocationCode(descendant);
  const a = normalizeLocationCode(ancestor);
  if (!d || !a || d === a) return false;
  return d.startsWith(a + SEGMENT_SEPARATOR);
}
