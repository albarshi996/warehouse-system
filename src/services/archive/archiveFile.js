/**
 * التحقّق من ملفّات الأرشيف الدوريّ وتوجيهها — منطق خالص قابل للاختبار
 * (بلا شبكة ولا DOM).
 *
 * ── مساران للحمولة، لا حدٌّ واحد ──
 * الملفّ الصغير يُخزَّن **داخل الوثيقة** base64 كما كان: يعمل بلا خطّةٍ مدفوعة،
 * ويُقرأ في نفس اللقطة الحيّة فلا طلب شبكةٍ ثانٍ. والكبير يُرفع إلى **Firebase
 * Storage** ويُحفظ رابطه في `storageUrl`. القرار آليّ بالحجم والصيغة — لا
 * يختاره المستخدم ولا يُطالَب بضغط ملفّه.
 *
 *   · HTML  ≤ 900KB   → داخل الوثيقة (نصٌّ خفيف لا يقترب من سقف Firestore).
 *   · PDF/صورة ≤ 700KB → داخل الوثيقة (الترميز يضخّم بالثلث فيبقى دون 1MB).
 *   · ما فوق ذلك حتى 50م.ب → Storage.
 *   · ما فوق 50م.ب → مرفوض (ليس أرشيفًا بل نسخةً احتياطية).
 */

/** سقف الحمولة داخل وثيقة Firestore — PDF/صورة (الترميز يضخّم بالثلث). */
export const MAX_BINARY_BYTES = 700 * 1024;

/** سقف الحمولة داخل وثيقة Firestore — HTML نصّيّ خفيف. */
export const MAX_HTML_BYTES = 900 * 1024;

/** السقف المطلق: ما فوقه يُرفض قبل قراءته (Storage أيضًا ليس بلا حدّ). */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

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

/** سقف الحمولة الداخليّة لهذه الصيغة (HTML أوسع لأنّه نصّ). */
export function inlineLimitFor(mime) {
  return mime === 'text/html' ? MAX_HTML_BYTES : MAX_BINARY_BYTES;
}

/**
 * يفحص ملفًّا مرشّحًا للرفع **قبل** قراءته ويقرّر مساره. يقبل أيّ كائن فيه
 * { name, size, type } فلا يحتاج متصفّحًا للاختبار.
 *
 * يُعيد `{ ok:false, error }` أو
 * `{ ok:true, kind, format, route:'inline'|'storage', limit }`.
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
    const capmb = Math.round(MAX_SOURCE_BYTES / (1024 * 1024));
    return { ok: false, error: `الملف ${mb}م.ب والحدّ ${capmb}م.ب — أكبر من أن يُؤرشَف.` };
  }
  const limit = inlineLimitFor(file.type);
  return {
    ok: true,
    kind,
    format: formatOf(file.type),
    route: file.size > limit ? 'storage' : 'inline',
    limit,
  };
}

/**
 * جملةٌ تشرح للمستخدم أين سيُحفظ ملفّه ولماذا — تُعرض بعد الاختيار مباشرةً
 * فلا يُفاجأ بسلوكٍ مختلفٍ بين ملفَّين.
 */
export function routeExplain(result, file) {
  if (!result || !result.ok) return '';
  const kb = Math.round((file?.size || 0) / 1024);
  return result.route === 'storage'
    ? `الملفّ ${kb}KB — يُرفع إلى مخزن الملفّات (Storage) ويُحفظ رابطه في الوثيقة.`
    : `الملفّ ${kb}KB — يُحفظ داخل الوثيقة مباشرةً.`;
}

/** حجم النصّ بعد ترميز base64 (للتقدير قبل الكتابة). */
export function base64Size(rawBytes) {
  return Math.ceil(rawBytes / 3) * 4;
}

/**
 * ينظّف اسم الملفّ ليصلح مفتاحًا في Storage: يُسقط فواصل المسارات ومحارف
 * الاستعلام والتحكّم، ويُبقي العربيّة كما هي. الفارغ يصير `file`.
 */
export function safeFileName(name) {
  // محارف التحكّم تُسقَط بالترشيح لا بنمطٍ نصّيّ — النمط يوقعنا في
  // `no-control-regex`، والترشيح أوضح على كلّ حال.
  const printable = [...String(name || '')].filter((ch) => ch.charCodeAt(0) > 31).join('');
  const cleaned = printable
    .replace(/[\\/#?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'file';
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
