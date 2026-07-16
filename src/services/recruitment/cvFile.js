/**
 * التحقّق من ملف السيرة الذاتية — منطق خالص قابل للاختبار.
 *
 * القيود (قرار المالك 2026-07-16: الحفظ داخل قاعدة البيانات، لا Storage):
 *  · الحد 700KB للملف الخام — لأن الترميز base64 يضخّمه بالثلث، وسقف مستند
 *    Firestore ميغابايت واحد بالضبط. 700KB خام ≈ 933KB مرمّزًا + هامش الحقول.
 *  · الأنواع: PDF والصور فقط — ملفات Word تُرفض (تتفاوت أحجامها وعارضها).
 */

export const MAX_CV_BYTES = 700 * 1024;

export const ACCEPTED_CV_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};

/**
 * يفحص ملفًا مرشّحًا للرفع. يُعيد { ok, error?, kind? }.
 * يقبل أي كائن فيه { name, size, type } — فلا يحتاج متصفّحًا للاختبار.
 */
export function validateCv(file) {
  if (!file) return { ok: false, error: 'لم يُختر ملف.' };
  const kind = ACCEPTED_CV_TYPES[file.type];
  if (!kind) {
    return { ok: false, error: 'الصيغة غير مدعومة — المقبول: PDF أو JPG أو PNG.' };
  }
  if (file.size > MAX_CV_BYTES) {
    const kb = Math.round(file.size / 1024);
    return {
      ok: false,
      error: `الملف ${kb}KB والحد الأقصى 700KB — اضغط الـPDF أو صوّره بدقة أقل.`,
    };
  }
  if (file.size === 0) return { ok: false, error: 'الملف فارغ.' };
  return { ok: true, kind };
}

/** حجم النص بعد ترميز base64 (للاختبار وللتقدير قبل الكتابة). */
export function base64Size(rawBytes) {
  return Math.ceil(rawBytes / 3) * 4;
}
