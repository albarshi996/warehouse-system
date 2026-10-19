/**
 * منطقُ **صور أصول مخزن فينسيا** — خالصٌ بلا DOM ولا Firestore.
 *
 * ═══ ★★★ العبءُ قراءاتٌ لا تخزين ═══
 * سؤالُ المالك: صورٌ «دون أن تتأثّر قاعدة البيانات». والظنُّ الأوّل أنّ
 * المشكلة حجمُ التخزين — وهي ليست كذلك. لوحةُ الجرد **تستمع إلى الأصول
 * كلِّها باستمرار**، فكلُّ ما يسكن *سجلَّ الأصل* يُنزَّل في كلّ لقطةٍ لكلّ
 * مستخدم. صورةٌ بسبعِ مئةِ كيلوبايت × ١٠٤ أصولٍ = **٧٣ م.ب في كلّ فتحةِ
 * شاشة** — وهذا ما يحرق حصّةَ Spark، لا الجيجابايتُ المخزَّن.
 *
 * فثلاثُ قواعدَ تُمليها هذه الوحدة:
 *   ① **الصورةُ لا تسكن سجلَّ الأصل أبدًا** — تذهب إلى `entity_attachments`
 *      القائمة، ولا تُقرأ إلّا عند فتح لوح الأصل.
 *   ② **بصمةٌ صغيرةٌ جدًّا على السجلّ للقائمة** — مصغَّرةٌ بحدٍّ **ثمانيةِ
 *      كيلوبايت**، وما تجاوزه **يُرفض ولا يُخزَّن**: مصغَّرةٌ متضخّمةٌ
 *      تُعيد العطبَ الذي فررنا منه من بابٍ أضيق.
 *   ③ **الضغطُ قبل الرفع لا بعده** — والحدُّ القائم (٧٠٠ ك.ب) يبقى **سقفًا
 *      يرفض** لا هدفًا نقترب منه.
 *
 * وكلُّ ما يُعاد استعمالُه هنا مبنيٌّ ومختبَرٌ في `attachmentFile`:
 * `validateSource` و`validateEncoded` و`dataUrlBytes` و`sha256Hex`.
 */
import {
  MAX_ATTACHMENT_BYTES,
  dataUrlBytes,
  isImageType,
  validateEncoded,
  validateSource,
} from '../documents/attachmentFile.js';

/** صنفُ الكيان في `entity_attachments` — أصلُ مخزن فينسيا. */
export const VENECIA_ENTITY_KIND = 'venecia_asset';

/** تصنيفُ المرفق: «صورة البضاعة» — قائمٌ في `ATTACHMENT_KINDS`. */
export const PHOTO_KIND = 'goods';

/**
 * الحدود. `thumbMaxBytes` أهمُّها: المصغَّرةُ تُقرأ مع **كلّ** أصلٍ في كلّ
 * لقطة، فثمانيةُ كيلوبايت × ١٠٤ ≈ ٨٣٠ ك.ب للوحة كلِّها — تُحسّ ولا تؤذي.
 */
export const PHOTO_LIMITS = Object.freeze({
  maxPerAsset: 6,
  maxEdge: 1280,
  quality: 0.72,
  thumbEdge: 96,
  thumbQuality: 0.62,
  thumbMaxBytes: 8 * 1024,
  maxBytes: MAX_ATTACHMENT_BYTES,
});

/**
 * أبعادٌ تُدخَل في مربّعٍ ضلعُه `maxEdge` مع حفظ النسبة.
 * وما كان أصغرَ من الحدّ **لا يُكبَّر**: تكبيرُ صورةٍ يزيد بايتاتِها ولا
 * يزيد ما فيها.
 */
export function fitWithin(width, height, maxEdge) {
  const w = Math.max(0, Math.round(Number(width) || 0));
  const h = Math.max(0, Math.round(Number(height) || 0));
  const edge = Math.max(1, Math.round(Number(maxEdge) || 1));
  if (!w || !h) return { width: 0, height: 0 };
  const longest = Math.max(w, h);
  if (longest <= edge) return { width: w, height: h };
  const scale = edge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * حكمٌ على الملفّ المختار **قبل** قراءته: صيغةٌ مقبولة، وصورةٌ لا PDF،
 * والسقفُ لم يُبلَغ. يُعيد `{ ok, problems }` ويجمعها مرّةً واحدة.
 */
export function photoVerdict(file, { count = 0 } = {}) {
  const problems = [];
  const src = validateSource(file);
  if (!src.ok) problems.push(src.error);
  else if (!isImageType(file.type)) problems.push('الصورُ فقط — وPDF يُرفق بالمستندات لا بالأصل.');
  if (count >= PHOTO_LIMITS.maxPerAsset) {
    problems.push(`سقفُ الصور ${PHOTO_LIMITS.maxPerAsset} للأصل الواحد — احذف واحدةً أو أضفها إلى أصلٍ آخر.`);
  }
  return { ok: problems.length === 0, problems };
}

/** حكمٌ على الصورة **بعد** الضغط — بسقف المرفقات القائم. */
export function encodedVerdict(dataUrl) {
  const bytes = dataUrlBytes(dataUrl);
  if (!bytes) return { ok: false, bytes: 0, problems: ['الصورةُ فارغة.'] };
  const v = validateEncoded(bytes, { isImage: true });
  // ★ والحجمُ يُعاد مع الحكم: الشاشةُ تقوله للمستخدم، وبدونه كانت تعرض
  //   «٠ ك.ب بعد الضغط» — رقمٌ مخترَعٌ يُفقد الثقةَ بكلّ ما سواه.
  return v.ok ? { ok: true, bytes, problems: [] } : { ok: false, bytes, problems: [v.error] };
}

/**
 * ★★★ حكمٌ على **المصغَّرة** — وهو الحارسُ الذي يحمي القاعدة كلَّها.
 * المصغَّرةُ تُقرأ مع كلّ أصلٍ في كلّ لقطة؛ فإن تضخّمت عادت المشكلةُ من
 * بابٍ أضيق. فما تجاوز الحدَّ **يُرفض ويُترك السجلُّ بلا مصغَّرة** —
 * والصورةُ الكاملةُ محفوظةٌ على أيّ حال.
 */
export function thumbVerdict(dataUrl) {
  const bytes = dataUrlBytes(dataUrl);
  if (!bytes) return { ok: false, bytes: 0, problems: ['لا مصغَّرة.'] };
  if (bytes > PHOTO_LIMITS.thumbMaxBytes) {
    return {
      ok: false,
      bytes,
      problems: [
        `المصغَّرة ${Math.round(bytes / 1024)} ك.ب والحدّ ${Math.round(PHOTO_LIMITS.thumbMaxBytes / 1024)} ك.ب`,
      ],
    };
  }
  return { ok: true, bytes, problems: [] };
}

/** الصورةُ المطابقةُ بالبصمة إن وُجدت — فلا تُخزَّن مرّتين. */
export function duplicateOf(hash, photos) {
  const h = String(hash || '');
  if (!h) return null;
  return (photos ?? []).find((p) => p.hash === h) || null;
}

/** جسمُ مستند الصورة كما يُمرَّر إلى `addEntityAttachment`. */
export function photoPayload({ dataUrl, name = '', mime = '', width = 0, height = 0, note = '', profile }) {
  return {
    kind: PHOTO_KIND,
    name: String(name || '').trim(),
    mime: String(mime || '').trim(),
    dataUrl,
    note: String(note || '').trim(),
    width: Math.max(0, Math.round(Number(width) || 0)),
    height: Math.max(0, Math.round(Number(height) || 0)),
    bytes: dataUrlBytes(dataUrl),
    profile,
  };
}

/** ملخّصُ صورِ أصلٍ: العددُ والحجمُ الإجماليّ. */
export function photoSummary(photos) {
  const list = photos ?? [];
  return {
    count: list.length,
    bytes: list.reduce((s, p) => s + (Number(p.bytes) || dataUrlBytes(p.dataUrl)), 0),
    remaining: Math.max(0, PHOTO_LIMITS.maxPerAsset - list.length),
  };
}

/**
 * ما يُدمَج في سجلّ الأصل بعد تغيّر صوره: المصغَّرةُ والعدد.
 * ★ ومصغَّرةٌ ترفضها `thumbVerdict` تُكتب **فراغًا** لا تُترك على حالها —
 * فبقاءُ مصغَّرةٍ قديمةٍ لصورةٍ حُذفت يكذب على القائمة.
 */
export function assetPhotoPatch(photos, thumbDataUrl = '') {
  const { count } = photoSummary(photos);
  const thumb = thumbVerdict(thumbDataUrl);
  return { thumbPhoto: thumb.ok ? String(thumbDataUrl) : '', photoCount: count };
}

/**
 * حسابُ الحصّة — يُعرض للمالك في الشاشة ليرى الكلفةَ قبل أن يُراكم.
 * @returns {{ photos:number, bytes:number, percentOfGb:number, listBytes:number }}
 */
export function quotaEstimate({ assets = 0, perAsset = PHOTO_LIMITS.maxPerAsset, avgBytes = 130 * 1024 } = {}) {
  const photos = Math.max(0, assets) * Math.max(0, perAsset);
  const bytes = photos * Math.max(0, avgBytes);
  return {
    photos,
    bytes,
    percentOfGb: Math.round((bytes / (1024 * 1024 * 1024)) * 1000) / 10,
    // ما تقرؤه القائمةُ في كلّ لقطة — المصغَّراتُ وحدَها لا الصور.
    listBytes: Math.max(0, assets) * PHOTO_LIMITS.thumbMaxBytes,
  };
}
