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

/* ═══════════ SAP-11: البصمة والإصدارات (ف‑٢٦ · ف‑٢٧ · §17 ‹881-883›) ═══════════ */

/**
 * بصمة SHA-256 لمحتوى المرفق (ف‑٢٧ · SR-57) — تُحسب من نصّ dataURL نفسه:
 * المحتوى المتطابق يعطي البصمة نفسها، فتنكشف النسخة المكرّرة ويُثبَت أنّ
 * الدليل لم يُبدَّل. تعمل في المتصفّح وNode معًا (WebCrypto).
 * @returns {Promise<string>} البصمة ستّون خانةً سداسيّة، أو '' إن غاب المحتوى.
 */
export async function sha256Hex(content) {
  const s = String(content ?? '');
  if (!s) return '';
  const bytes = new TextEncoder().encode(s);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * عقد «إنشاء إصدار جديد» (ف‑٢٦ · §17 ‹882›): الإصدار الجديد **مستندٌ جديد**
 * يشير إلى سابقه (`supersedes`) ويرث تصنيفه — والسابق لا يُمحى ولا يُعدَّل
 * (نموذج الإلحاق-فقط نفسه: التاريخ كامل، والأحدث يتصدّر العرض).
 */
export function newVersionPayload(previous) {
  return {
    kind: previous?.kind || 'other',
    label: previous?.label || kindLabel(previous?.kind),
    version: (Number(previous?.version) || 1) + 1,
    supersedes: previous?.id || null,
  };
}

/**
 * سلاسل الإصدارات للعرض: يُجمَع كلّ مرفقٍ مع أسلافه (عبر `supersedes`)
 * فيُعرض **الأحدث** وتحته تاريخه — لا قائمةٌ مسطّحة تُظهر القديم والجديد
 * ندَّين. الحلقة المكسورة (سلفٌ محذوفٌ نظريًّا) لا تُسقط السلسلة.
 *
 * @param {Array} attachments بترتيب الإرفاق (الأقدم أوّلًا كما تعيده الخدمة)
 * @returns {Array<{latest:object, history:object[], count:number}>}
 */
export function versionChains(attachments) {
  const list = attachments || [];
  const superseded = new Set(list.map((a) => a?.supersedes).filter(Boolean));
  const byId = new Map(list.filter((a) => a?.id).map((a) => [a.id, a]));

  // رؤوس السلاسل: ما لم يُشِر إليه أحدٌ بـ`supersedes` — أي أحدث إصدار.
  return list
    .filter((a) => a?.id && !superseded.has(a.id))
    .map((latest) => {
      const history = [];
      let cursor = latest;
      const seen = new Set([latest.id]);
      while (cursor?.supersedes && byId.has(cursor.supersedes) && !seen.has(cursor.supersedes)) {
        cursor = byId.get(cursor.supersedes);
        seen.add(cursor.id);
        history.push(cursor);
      }
      return { latest, history, count: history.length + 1 };
    });
}
