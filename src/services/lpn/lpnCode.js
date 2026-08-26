/**
 * نحو هوية الطبلية LPN — منطق خالص بلا Firebase، قابل للاختبار وحده.
 *
 * المشكلة التي يحلّها: الحمولة اليوم بلا هويّة — الرصيد يعرف (صنف×مخزن×دفعة
 * [×موقع×صلاحية×حالة]) ولا يعرف «هذه الكرتونة على أيّ طبليةٍ تقف». عاملٌ
 * يسأل «أين طبلية أمر الشراء ٤٥؟» فلا جواب إلّا الذاكرة والورق.
 *
 * الهويّة: `LPN-<مستودع>-<YYYYMMDD>-<تسلسل ستّ خانات>` — مثل
 * `LPN-MAIN-20260826-000001`. المستودع في الهويّة لأنّ الملصق يُقرأ بعيدًا عن
 * الشاشة، والتاريخ لأنّ التسلسل يُصفَّر يوميًّا فيبقى العدّاد صغيرًا مهما كبر
 * العمل، والتسلسل ستّ خانات فلا يفيض يومٌ واحد مهما ازدحم.
 *
 * ═══ القاعدة الحاكمة (خطة ٧ حرفيًّا) ═══
 * **الهويّة يولّدها النظام عند اعتماد الحوكمة — لا الموظف. ولا يُعاد استخدامها
 * أبدًا** ولو أُغلقت الطبلية نهائيًّا. و**LPN ليس رقم Lot**: الأوّل هويّة
 * الحمولة والثاني هويّة التشغيلة — طبليةٌ تحمل تشغيلاتٍ شتّى وتشغيلةٌ تتوزّع
 * على طبالٍ شتّى.
 *
 * ⚠️ حصر المحارف ليس تجميلًا: الكود سيصير **معرّف مستند Firestore** في
 * مجموعة `handling_units`، فما يكسر المعرّف (/ . # $ [ ]) ممنوعٌ من أصله —
 * نفس قرار `locationCode.js` (الوثيقة الحاكمة: docs/خطة-طبقة-الطبالي.md §٦).
 *
 * التوليد الفعليّ (العدّاد الذرّي) في `lpnService.js` — هذا الملف نحوٌ فقط:
 * يبني ويفكّ ويطبّع ويرفض، ولا يعرف شبكةً ولا ساعة (التاريخ يُمرَّر من الخارج
 * فيبقى المنطق حتميًّا قابلًا للاختبار — عرف البيت §22).
 */

/** بادئة الهويّة الثابتة. */
export const LPN_PREFIX = 'LPN';

/** الفاصل بين المقاطع — فاصل كود الموقع نفسه. */
export const LPN_SEPARATOR = '-';

/** عدد خانات التسلسل اليومي. ستٌّ تكفي مليون طبلية في اليوم الواحد. */
export const LPN_SEQ_DIGITS = 6;

/** أطول مقطع مستودعٍ مقبول — حدّ `MAX_SEGMENT_LEN` في نحو المواقع نفسه. */
export const LPN_MAX_WAREHOUSE_LEN = 12;

/** أرقام عربية-هندية إلى غربية — الملصق والشيت قد يحملان أيًّا منهما. */
function westernDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

/** مقطع المستودع: حروف لاتينية كبيرة وأرقام غربية فقط — كنحو المواقع. */
const WAREHOUSE_RE = /^[A-Z0-9]{1,12}$/;

/** التاريخ داخل الهويّة: ثماني خانات YYYYMMDD. */
const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;

/**
 * الصيغة القياسية لهويّة الطبلية: أرقام غربية · حروف كبيرة · بلا فراغات ·
 * الفواصل المتكرّرة تُطوى والطرفيّة تُقصّ.
 *
 * تُطبَّق على **كل** مدخل قبل المقارنة أو التخزين — فيلتقي ما مسحه العامل
 * بما طُبع على الملصق مهما اختلفت يد الكاتب.
 */
export function normalizeLpnCode(raw) {
  if (raw === null || raw === undefined) return '';
  return westernDigits(String(raw))
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, LPN_SEPARATOR)
    .replace(/-{2,}/g, LPN_SEPARATOR)
    .replace(/^-+|-+$/g, '');
}

/** أيومٌ حقيقيّ هذا؟ «٣٠ فبراير» يجتاز فحص المدى ولا يجتاز هذا. */
function isRealDay(y, m, d) {
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * تاريخ الهويّة من مدخلٍ مرن: `YYYYMMDD` أو `YYYY-MM-DD` أو Date مُمرَّر.
 *
 * ⚠️ من كائن `Date` يُقرأ **اليوم المحلّيّ** لا UTC: ليبيا +٢، فطبليةٌ تولد
 * الواحدة صباحًا كانت تحمل تاريخ أمس وتُحسب على عدّاد أمس — ملصقٌ يكذب عن
 * يومه في كلّ ورديةٍ ليلية.
 */
export function lpnDateStamp(date) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  const s = westernDigits(String(date ?? '')).trim();
  const dashed = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) return `${dashed[1]}${dashed[2]}${dashed[3]}`;
  return DATE_RE.test(s) ? s : '';
}

/**
 * سبب رفض الهويّة نصًّا عربيًّا — أو '' إن كانت سليمة.
 *
 * منفصلة عن `isValidLpnCode` البوليانية عمدًا — عرف البيت: دالةٌ تعيد
 * الاثنين معًا تُستعمل خطأً.
 */
export function lpnCodeProblem(raw) {
  const code = normalizeLpnCode(raw);
  if (!code) return 'هويّة فارغة — امسح ملصق الطبلية أو اكتب رقمها كاملًا.';

  const parts = code.split(LPN_SEPARATOR);
  if (parts[0] !== LPN_PREFIX) {
    return `الهويّة تبدأ بـ«${LPN_PREFIX}» — والممسوح «${parts[0]}». هذا ليس ملصق طبلية.`;
  }
  if (parts.length !== 4) {
    return `هويّة الطبلية أربعة مقاطع: LPN-المستودع-التاريخ-التسلسل — والممسوح ${parts.length} ${parts.length < 4 ? 'ناقص' : 'زائد'}.`;
  }

  const [, warehouse, date, seq] = parts;
  if (!WAREHOUSE_RE.test(warehouse)) {
    return `مقطع المستودع «${warehouse}» غير صالح — حروف لاتينية كبيرة وأرقام فقط، حتى ${LPN_MAX_WAREHOUSE_LEN} محرفًا.`;
  }
  const dm = date.match(DATE_RE);
  if (!dm) return `مقطع التاريخ «${date}» غير صالح — الصيغة YYYYMMDD بثماني خانات.`;
  if (!isRealDay(Number(dm[1]), Number(dm[2]), Number(dm[3]))) {
    return `التاريخ «${date}» ليس يومًا حقيقيًّا — راجع الملصق فقد يكون تالفًا.`;
  }
  if (!new RegExp(`^\\d{${LPN_SEQ_DIGITS}}$`).test(seq)) {
    return `مقطع التسلسل «${seq}» غير صالح — ${LPN_SEQ_DIGITS} خانات رقمية.`;
  }
  if (Number(seq) === 0) return 'التسلسل صفر لا يُصدر — أوّل طبلية في اليوم تحمل 000001.';
  return '';
}

/** أصالحةٌ هذه الهويّة؟ السبب عند الرفض من `lpnCodeProblem`. */
export function isValidLpnCode(raw) {
  return lpnCodeProblem(raw) === '';
}

/**
 * بناء الهويّة من أجزائها — يستعمله المولّد في الخدمة بعد حجز التسلسل ذرّيًّا.
 *
 * @returns {string|null} الهويّة، أو null إن كان جزءٌ فاسدًا — والمولّد الذي
 *          يصل هنا بجزءٍ فاسد عطبُ برمجةٍ لا عطبُ مستخدم، فلا رسالة عربية.
 */
export function formatLpnCode({ warehouse, date, seq }) {
  const wh = normalizeLpnCode(warehouse);
  const stamp = lpnDateStamp(date);
  const n = Number(seq);
  if (!WAREHOUSE_RE.test(wh) || !stamp || !Number.isInteger(n) || n < 1) return null;
  if (n >= 10 ** LPN_SEQ_DIGITS) return null;
  const code = [LPN_PREFIX, wh, stamp, String(n).padStart(LPN_SEQ_DIGITS, '0')].join(LPN_SEPARATOR);
  return isValidLpnCode(code) ? code : null;
}

/**
 * فكّ الهويّة إلى مقاطعها المسمّاة.
 *
 * @returns {{code:string, warehouse:string, date:string, seq:number}|null}
 *          `null` إن كانت غير صالحة — والسبب يُطلب من `lpnCodeProblem`.
 */
export function parseLpnCode(raw) {
  const code = normalizeLpnCode(raw);
  if (lpnCodeProblem(code)) return null;
  const [, warehouse, date, seq] = code.split(LPN_SEPARATOR);
  return { code, warehouse, date, seq: Number(seq) };
}

/**
 * مفتاح عدّاد التسلسل اليومي: `LPN-<مستودع>-<YYYYMMDD>`.
 *
 * حتميٌّ من المستودع واليوم — فجهازان يطلبان هويّةً في اللحظة نفسها يتنازعان
 * **العدّاد نفسه** في معاملةٍ ذرّية (نمط `counters/{TYPE}-{YEAR}` القائم في
 * محرّك المستندات) بدل أن يولّد كلٌّ رقمَه على هواه فيتصادما.
 *
 * @returns {string|null} المفتاح، أو null إن فسد جزء.
 */
export function lpnCounterKey({ warehouse, date }) {
  const wh = normalizeLpnCode(warehouse);
  const stamp = lpnDateStamp(date);
  if (!WAREHOUSE_RE.test(wh) || !stamp) return null;
  return [LPN_PREFIX, wh, stamp].join(LPN_SEPARATOR);
}

/** المختصر المعروض للعامل: آخر ستّ خانات — «الطبلية ٠٠٠١٤٥» تكفي في الممرّ. */
export function shortLpnLabel(raw) {
  const parsed = parseLpnCode(raw);
  if (!parsed) return '';
  return String(parsed.seq).padStart(LPN_SEQ_DIGITS, '0');
}
