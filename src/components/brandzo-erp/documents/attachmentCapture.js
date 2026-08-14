/**
 * التقاط المرفق في المتصفّح — قراءةُ الملفّ وضغطُ الصورة (SAP-11).
 *
 * انتُزعت من `AttachmentsPanel` حرفيًّا لمّا صار للمرفقات موضعان: لوحة
 * المستند وبطاقات الكيانات (ف‑٢٨) — فالضغط قاعدةٌ واحدة لا نسختان
 * تتباعدان. تلمس المتصفّح (FileReader · canvas) فليست منطقًا خالصًا؛
 * الخالص كلّه في `services/documents/attachmentFile.js`.
 */
import { dataUrlBytes, MAX_ATTACHMENT_BYTES } from '../../../services/documents/attachmentFile.js';

/** يقرأ ملفًا كسلسلة dataURL (لِـPDF أو كمصدرٍ للضغط). */
export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('تعذّرت قراءة الملف.'));
    r.readAsDataURL(file);
  });
}

/**
 * يضغط صورةً إلى JPEG داخل حدّ الحجم: يُصغّر أبعادها إلى سقفٍ ثم يُنقّص الجودة
 * تنازليًّا حتى تدخل `MAX_ATTACHMENT_BYTES`. يُعيد dataURL أو يرمي إن استحال.
 */
export async function compressImage(file, maxDim = 1600) {
  const dataUrl = await readAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('تعذّر فتح الصورة.'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // خلفية بيضاء بدل شفافية PNG السوداء عند التحويل لـJPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  for (const quality of [0.72, 0.6, 0.5, 0.4, 0.32]) {
    const out = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(out) <= MAX_ATTACHMENT_BYTES) return out;
  }
  // ما زالت أكبر من الحدّ: نُنصّف البُعد ونعيد الكرّة — والبُعد يتناقص فعلًا
  // (١٦٠٠ ← ٨٠٠) فيبلغ الحدّ ويتوقّف، ثمّ يُسلَّم بأدنى جودة كملاذٍ أخير.
  // (لو مرّرنا رقمًا ثابتًا لَدار التكرار أبدًا — درس المراجعة العدائية.)
  if (maxDim > 900) return compressImage(file, Math.round(maxDim / 2));
  return canvas.toDataURL('image/jpeg', 0.3);
}
