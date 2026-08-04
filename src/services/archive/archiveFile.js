/**
 * التحقّق من ملفّات الأرشيف الدوريّ — منطق خالص قابل للاختبار (بلا شبكة ولا DOM).
 *
 * القيد (نفس قرار سِيَر التوظيف والمرفقات: الحفظ في قاعدة البيانات لا Storage):
 *  · كل مستندٍ مرفوع يُخزَّن **مستقلًّا** في مجموعة `archive_documents`، وحمولته
 *    (base64) دون سقف مستند Firestore (1MB). الحدّ 900KB للخام لأن الترميز
 *    يضخّم بالثلث (900KB ≈ 1.17MB… لذا الحدّ الفعليّ أدقّ = 700KB للـPDF/الصورة
 *    كنمط السِّير، و900KB للـHTML النصّيّ الخفيف الذي لا يقترب من السقف عمليًّا).
 *  · الصيغ: **HTML** (نصّ التقرير الخفيف يُعرَض ويُطبع حيًّا) · **PDF** · صورة.
 *  · الملفّات الكبيرة (PDF متعدّد الميغابايت) تُحال إلى Firebase Storage لاحقًا
 *    (حقل `storageUrl` محجوز) — أمّا اليوم فتُضغط أو تُرفع نسخة HTML الخفيفة.
 */

/** حدّ الـPDF/الصورة الخام (بعد أيّ ضغط) — دون سقف مستند Firestore بعد الترميز. */
export const MAX_BINARY_BYTES = 700 * 1024;

/** حدّ ملفّ HTML الخام — نصٌّ خفيف يظلّ دون السقف حتى بعد الترميز. */
export const MAX_HTML_BYTES = 900 * 1024;

/** سقف الملفّ الخام المختار مطلقًا — نرفض العملاق فورًا قبل قراءته. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** الصيغ المقبولة ونوعها المعروض. */
export const ACCEPTED_ARCHIVE_TYPES = {
  'text/html': 'HTML',
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};

/** يوحّد النوع إلى وسم العرض `format` (html | pdf | image). */
export function formatOf(mime) {
  if (mime === 'text/html') return 'html';
  if (mime === 'application/pdf') return 'pdf';
  if (String(mime || '').startsWith('image/')) return 'image';
  return 'other';
}

/**
 * يفحص ملفًّا مرشّحًا للرفع **قبل** الترميز. يقبل أيّ كائن فيه
 * { name, size, type } فلا يحتاج متصفّحًا للاختبار. يُعيد { ok, error?, kind? }.
 */
export function validateArchiveFile(file) {
  if (!file) return { ok: false, error: 'لم يُختر ملف.' };
  const kind = ACCEPTED_ARCHIVE_TYPES[file.type];
  if (!kind) {
    return { ok: false, error: 'الصيغة غير مدعومة — المقبول: HTML أو PDF أو صورة (JPG/PNG).' };
  }
  if (file.size === 0) return { ok: false, error: 'الملف فارغ.' };
  if (file.size > MAX_SOURCE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return { ok: false, error: `الملف ${mb}م.ب — أكبر من أن يُعالَج.` };
  }
  const isHtml = file.type === 'text/html';
  const cap = isHtml ? MAX_HTML_BYTES : MAX_BINARY_BYTES;
  if (file.size > cap) {
    const kb = Math.round(file.size / 1024);
    const capkb = Math.round(cap / 1024);
    return {
      ok: false,
      error: isHtml
        ? `ملف HTML ${kb}KB والحدّ ${capkb}KB.`
        : `الملف ${kb}KB والحدّ ${capkb}KB — ارفع نسخة HTML الخفيفة أو اضغط الـPDF (رفع الملفّات الكبيرة مباشرةً يحتاج تفعيل Storage لاحقًا).`,
    };
  }
  return { ok: true, kind, format: formatOf(file.type) };
}

/** حجم النصّ بعد ترميز base64 (للتقدير قبل الكتابة). */
export function base64Size(rawBytes) {
  return Math.ceil(rawBytes / 3) * 4;
}

/**
 * صيغة الرقم الإشاريّ الرسميّ المعتمد: بادئةٌ من مقاطع كبيرة (BFP-SCM-PR)
 * ثمّ السنة (أربع خانات) ثمّ التسلسل. مثال: `BFP-SCM-PR-2026-005`.
 * لا يمرّ بعدّاد السحابة — يُسنده المالك من مساره الرسميّ الورقيّ.
 */
export const REF_NUMBER_RE = /^[A-Z]{2,}(?:-[A-Z]{2,})*-\d{4}-\d{1,5}$/;

/** هل الرقم الإشاريّ بصيغةٍ رسميّة؟ الفراغ مقبول (الرقم اختياريّ لبعض الوثائق). */
export function isValidRefNumber(ref) {
  const s = String(ref || '').trim();
  return s === '' || REF_NUMBER_RE.test(s);
}
