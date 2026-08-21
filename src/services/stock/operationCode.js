/**
 * رمز العملية المخزنيّة — مفتاحُ دخول لجان الجرد.
 *
 * **المشكلة التي يحلّها:** الانضمام إلى جلسةٍ جماعيّة كان يتطلّب كتابة معرّف
 * Firestore الخام — عشرين محرفًا عشوائيًّا حسّاسًا لحالة الأحرف
 * (`k3Jd9sLpQm2xY7vB1nRt`). لا لجنةَ جردٍ تُملي ذلك على أعضائها في رحبةٍ
 * صاخبة، ولا عاملَ يكتبه على هاتفٍ بيدٍ واحدة. فبقيت خاصيّة «العمل الجماعيّ»
 * مبنيّةً وغيرَ صالحةٍ للاستعمال.
 *
 * **الحلّ:** ستّة محارف تُملى صوتًا وتُكتب بلا خطأ: `H4K-9TM`.
 *
 * ── لماذا هذه الأبجديّة بالذات ──────────────────────────────────────────
 * أبجديّة Crockford: عشرة أرقامٍ واثنان وعشرون حرفًا، **بلا `I` و`L` و`O`
 * و`U`**. والسببان عمليّان لا جماليّان:
 *   · `O` تُقرأ صفرًا و`I`/`L` تُقرآن واحدًا — وفي رحبةٍ ضوءُها ضعيف يُملى
 *     الرمز صوتًا، فيُكتب غيرَ ما قيل. ولذلك **تُقبل عند الإدخال وتُحوَّل**
 *     إلى ما تشبهه: كاتبُ `O` يقصد صفرًا فيُقرأ صفرًا، ولا يُرفض طلبُه.
 *   · و`U` تُستبعد كي لا يتولّد رمزٌ يحمل كلمةً بذيئة بالمصادفة.
 *
 * والمقارنة تكون بعد التطبيع دائمًا، فيستوي `h4k9tm` و`H4K-9TM`
 * و`H4K 9TM` و`Н4К-9ТМ` بأرقامٍ عربيّة-هنديّة (`٤` و`٩`).
 */

/** أبجديّة Crockford — بلا I و L و O و U. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** طول الرمز: ٣٢⁶ ≈ مليار احتمال، فالتصادم بعيدٌ حتّى مع مئات الجلسات. */
export const CODE_LENGTH = 6;

/** أرقام عربيّة-هنديّة وفارسيّة — تُكتب على لوحات المفاتيح العربيّة. */
const EASTERN_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

/** ما يُقرأ خطأً ⇐ ما يُقصد به. الاتّجاه من المستبعَد إلى المقبول. */
const CONFUSABLES = { O: '0', I: '1', L: '1', U: 'V' };

/**
 * يُوحّد رمزًا مكتوبًا بيد إنسان إلى صيغته المعياريّة.
 *
 * يقبل: الحروف الصغيرة · الشرطات والمسافات · الأرقام العربيّة-الهنديّة ·
 * والمحارف المُشتبَهة. ويُهمل كلّ ما سوى ذلك بدل أن يرفض السطر كلّه — فلاصقُ
 * رمزٍ من رسالة واتساب قد يجرّ معه محرفًا غير مرئيّ.
 *
 * @returns {string} رمزٌ معياريّ (قد يكون أقصر أو أطول من `CODE_LENGTH`)
 */
export function normalizeOperationCode(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  let out = '';
  for (const ch of raw) {
    const digit = EASTERN_DIGITS[ch];
    const c = digit ?? CONFUSABLES[ch] ?? ch;
    if (CODE_ALPHABET.includes(c)) out += c;
  }
  return out;
}

/** هل هذا رمزُ عمليةٍ صالحٌ بعد التطبيع؟ */
export function isValidOperationCode(input) {
  const c = normalizeOperationCode(input);
  return c.length === CODE_LENGTH;
}

/**
 * يعرض الرمز مجزّأً نصفين — فالعين تلتقط `H4K-9TM` أسرع من `H4K9TM`،
 * واللسان يُمليه في نَفَسين.
 */
export function formatOperationCode(input) {
  const c = normalizeOperationCode(input);
  if (c.length !== CODE_LENGTH) return c;
  return `${c.slice(0, 3)}-${c.slice(3)}`;
}

/**
 * يولّد رمزًا غير مستعمَل.
 *
 * `taken` تُطبَّع قبل المقارنة، فرمزٌ قديمٌ كُتب بصيغةٍ أخرى لا يُعاد بالخطأ.
 * وبعد `attempts` محاولة يتوقّف برمي — والصمتُ هنا أسوأ من التوقّف: رمزٌ
 * مكرَّرٌ يعني لجنتين تكتبان في دفترٍ واحد وهما تحسبانه دفترين.
 *
 * @param {() => number} random دالّة عشوائيّة في [0,1) — تُمرَّر كي يُختبر التوليد
 * @param {{taken?: string[], attempts?: number}} [opts]
 */
export function generateOperationCode(random = Math.random, { taken = [], attempts = 50 } = {}) {
  const used = new Set((taken ?? []).map((t) => normalizeOperationCode(t)).filter(Boolean));
  for (let i = 0; i < attempts; i += 1) {
    let code = '';
    for (let j = 0; j < CODE_LENGTH; j += 1) {
      code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
    }
    if (code.length === CODE_LENGTH && !used.has(code)) return code;
  }
  throw new Error(`تعذّر توليد رمز عمليةٍ غير مستعمَل بعد ${attempts} محاولة`);
}

/**
 * يختار العملية التي يقصدها الرمز من بين المرشّحات.
 *
 * منطقٌ خالصٌ عمدًا: القرار «أيّ عمليةٍ يفتحها هذا الرمز» هو موضع الخطأ
 * الحقيقيّ، لا استعلام Firestore. وثلاث قواعد تحكمه:
 *   ① **المفتوحة تسبق المُقفلة** — رمزٌ أُعيد استعماله بعد إقفال جلسةٍ قديمة
 *     يجب أن يفتح الجارية لا التاريخ.
 *   ② **مفتوحتان بالرمز نفسه = توقّف** ولا اختيارَ عشوائيّ: لجنتان تكتبان في
 *     دفترٍ واحد وهما تحسبانه دفترين عطبٌ لا يُكتشف إلّا عند الجرد النهائيّ.
 *   ③ **لا مفتوحة والموجود مُقفل** ⇐ يُقال ذلك صراحةً، فالعامل يعرف أنّ رمزه
 *     صحيحٌ وأنّ الجلسة انتهت — لا أنّه أخطأ الكتابة.
 *
 * @param {object[]} candidates عمليّاتٌ رمزُها مطابق
 * @returns {{ok: true, operation: object} | {ok: false, reason: 'none'|'closed'|'ambiguous', operations?: object[]}}
 */
export function resolveOperationByCode(candidates) {
  const list = candidates ?? [];
  if (!list.length) return { ok: false, reason: 'none' };
  const open = list.filter((o) => o?.status === 'open');
  if (open.length === 1) return { ok: true, operation: open[0] };
  if (open.length > 1) return { ok: false, reason: 'ambiguous', operations: open };
  return { ok: false, reason: 'closed', operations: list };
}
