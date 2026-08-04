/**
 * التحقّق من مرفقات المستندات — منطق خالص قابل للاختبار (بلا شبكة ولا متصفّح).
 *
 * لماذا مرفقات أصلًا؟ لأن الورق كان يُدبَّس معه فاتورة المورّد وصورة توقيع
 * المندوب، فإذا رُقمن المستند ضاع هذا الإثبات. المرفق هو الدليل الماديّ الذي
 * يُطابَق عليه المستند الصادر — وهو نصف «طبقة الرقابة».
 *
 * القيود (نفس قرار سِيَر التوظيف 2026-07-16: الحفظ في قاعدة البيانات لا Storage):
 *  · كل مرفق **مستندٌ مستقلّ** في مجموعة فرعية — لا في رأس المستند. فسقف
 *    Firestore ميغابايت واحد للمستند، وصورةٌ في الرأس تكسره وتُجمّد الحقول.
 *  · الحدّ 700KB **بعد الضغط** — لأن base64 يضخّم بالثلث (700KB ≈ 933KB مرمّزًا
 *    + هامش الحقول < 1MB). واللوحة تضغط الصور قبل الرفع فلا يقع الموظّف في الحدّ.
 *  · الصيغ: صور (JPG · PNG · WEBP) وPDF (لفاتورة المورّد). لا Word.
 */

/** الحدّ الأقصى للمرفق **بعد الضغط/الترميز** — دون سقف مستند Firestore. */
export const MAX_ATTACHMENT_BYTES = 700 * 1024;

/** سقف الملف الخام المختار **قبل الضغط** — نرفض العملاق فورًا قبل قراءته. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** الصيغ المقبولة: صورةٌ تُضغط، أو PDF يُرفع كما هو. */
export const ACCEPTED_ATTACHMENT_TYPES = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'application/pdf': 'PDF',
};

/**
 * تصنيفات المرفق — تُملي على اللوحة أزرار «نوع المرفق»، وتوصف بها الأدلّة في
 * سجلّ التدقيق. المخطّط قد يقترح خانات بعينها (فاتورة · توقيع)، والباقي «أخرى».
 */
export const ATTACHMENT_KINDS = {
  invoice: 'فاتورة المورّد',
  signature: 'توقيع المندوب/المستلم',
  goods: 'صورة البضاعة',
  signedCopy: 'نسخة موقّعة من المستند',
  packing: 'صورة التعبئة/التحميل',
  other: 'أخرى',
};

/** هل هذا النوع صورةٌ (تُضغط) لا PDF؟ */
export function isImageType(type) {
  return String(type || '').startsWith('image/');
}

/** الاسم العربي للتصنيف، أو التصنيف نفسه إن كان غير معروف. */
export function kindLabel(kind) {
  return ATTACHMENT_KINDS[kind] || String(kind || 'مرفق');
}

/**
 * يفحص الملف المختار **قبل** الضغط: الصيغة، وأنه ليس فارغًا ولا عملاقًا.
 * يقبل أي كائن فيه { name, size, type } — فلا يحتاج متصفّحًا للاختبار.
 * يُعيد { ok, error?, kind? } حيث kind = 'JPG' | 'PDF' | …
 */
export function validateSource(file) {
  if (!file) return { ok: false, error: 'لم يُختر ملف.' };
  const kind = ACCEPTED_ATTACHMENT_TYPES[file.type];
  if (!kind) {
    return { ok: false, error: 'الصيغة غير مدعومة — المقبول: صورة (JPG/PNG/WEBP) أو PDF.' };
  }
  if (file.size === 0) return { ok: false, error: 'الملف فارغ.' };
  if (file.size > MAX_SOURCE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return { ok: false, error: `الملف ${mb}م.ب — أكبر من أن يُعالَج. صوّره بدقّة أقل.` };
  }
  return { ok: true, kind };
}

/**
 * يفحص الحجم **بعد** الضغط/الترميز مقابل سقف المرفق. الصورة تمرّ من الضغط أولًا؛
 * وPDF يُفحص كما هو (لا يُضغط) فإن تجاوز طُلب تصغيره.
 * @param {number} encodedBytes حجم النص المرمّز (طول dataURL تقريبًا)
 */
export function validateEncoded(encodedBytes, { isImage = true } = {}) {
  if (encodedBytes <= MAX_ATTACHMENT_BYTES) return { ok: true };
  const kb = Math.round(encodedBytes / 1024);
  return {
    ok: false,
    error: isImage
      ? `الصورة ${kb}KB بعد الضغط والحدّ 700KB — التقطها بدقّة أقل.`
      : `الـPDF ${kb}KB والحدّ 700KB — اضغطه أو صوّر صفحاته.`,
  };
}

/** حجم النصّ بعد ترميز base64 (لتقدير الحجم قبل الكتابة). */
export function base64Size(rawBytes) {
  return Math.ceil(rawBytes / 3) * 4;
}

/**
 * حجم الحمولة الفعليّة من سلسلة dataURL: نطرح ترويسة `data:...;base64,` ثم نحسب
 * البايتات من طول جزء base64 (٤ أحرف = ٣ بايت، مع حسم حشو `=`).
 */
export function dataUrlBytes(dataUrl) {
  const s = String(dataUrl || '');
  const comma = s.indexOf(',');
  const b64 = comma >= 0 ? s.slice(comma + 1) : s;
  if (!b64) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}
