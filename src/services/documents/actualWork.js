/**
 * ‹ODOO-ORD› العملُ الفعليّ — حدُّ الافتتاح الواحد الذي تحتكم إليه كلُّ شاشةٍ تشغيليّة. منطقٌ خالص.
 *
 * الرصيدُ الافتتاحيُّ لقطةُ أودو مساءَ 19 أكتوبر (الخيار أ)، والعملُ الفعليُّ ما بعدها: مستنداتُ أودو المستورَدة،
 * وما يُنشأ في البوّابة من يوم الافتتاح فصاعدًا. **وقيس 2026-10-22: كلُّ مستندٍ أُنشئ في البوّابة (240) أُنشئ بين يوليو
 * و14 أكتوبر** — تجربةٌ ملأت الرئيسيّة واللوجستيات والمستندات «معلّقةً منذ 88 يومًا» وغطّت أودو كلَّه.
 *
 * فالشاشاتُ التشغيليّة تعرض العملَ الفعليّ وحده، **وتقرأ من الخادم ما بعد الحدّ وحده** (`listenDocumentsSince` ·
 * `listenMovesSince`) — فتنظف وتخفّ معًا. والسجلُّ لا يُمسّ: الأرشيفُ وتقاريرُ المستند ترى كلَّ شيء.
 */
import { OPENING_CUTOFF } from '../locations/postedImport.js';

/** يومُ الافتتاح — أوّلُ يومٍ ليس في اللقطة. */
export const OPENING_DAY = OPENING_CUTOFF;

/** منتصفُ ليل يوم الافتتاح بتوقيت ليبيا (UTC+2) — حدُّ الاستعلام من الخادم. */
export const OPENING_MS = Date.parse(`${OPENING_DAY}T00:00:00+02:00`);

const LIBYA_OFFSET_MS = 2 * 3600 * 1000;

/** مستندٌ مستورَدٌ من أودو؟ */
export function isOdooDoc(doc) {
  return String(doc?.header?.sourceSystem || '').trim().toLowerCase() === 'odoo';
}

/** لحظةُ طابعٍ بالملّي ثانية — طابعُ Firestore أو `{seconds}` أو نصٌّ أو رقمٌ أو Date — وإلّا NaN. */
export function stampMs(stamp) {
  if (stamp == null || stamp === '') return NaN;
  if (typeof stamp.toMillis === 'function') return stamp.toMillis();
  if (typeof stamp.seconds === 'number') return stamp.seconds * 1000;
  if (stamp instanceof Date) return stamp.getTime();
  if (typeof stamp === 'string' || typeof stamp === 'number') return new Date(stamp).getTime();
  return NaN;
}

/** يومُ الطابع بتوقيت ليبيا (`YYYY-MM-DD`) — أو '' إن لم يكن طابعًا. */
export function libyaDayOfStamp(stamp) {
  const ms = stampMs(stamp);
  return Number.isFinite(ms) ? new Date(ms + LIBYA_OFFSET_MS).toISOString().slice(0, 10) : '';
}

/**
 * سجلٌّ (جلسةُ جرد · حركةُ مخزون · استثناء) طابعُه قبل الافتتاح.
 * ★★ وبلا طابعٍ ليس «قبل»: الطابعُ الخادميُّ يصل بعد الكتابة بلحظة، فالسجلُّ الذي كُتب للتوّ يُعرض لا يُخفى.
 */
export function isPreOpeningRecord(record, field = 'createdAt') {
  const day = libyaDayOfStamp(record?.[field]);
  return Boolean(day) && day < OPENING_DAY;
}

/** مستندٌ أُنشئ في البوّابة قبل الافتتاح — بأيّ حالة. ومستندُ أودو عملٌ فعليٌّ أيًّا كان تاريخُه. */
export function isPreOpeningDoc(doc) {
  return !isOdooDoc(doc) && isPreOpeningRecord(doc, 'createdAt');
}

/** المستنداتُ بلا ما قبل الافتتاح. */
export function actualDocs(docs) {
  return (docs || []).filter((d) => !isPreOpeningDoc(d));
}

/** الحركاتُ بلا ما قُيّد قبل الافتتاح (تجاربُ ما قبل اللقطة). */
export function actualMoves(moves) {
  return (moves || []).filter((m) => !isPreOpeningRecord(m, 'postedAt'));
}

/** السجلّاتُ بلا ما أُنشئ قبل الافتتاح. */
export function actualRecords(records, field = 'createdAt') {
  return (records || []).filter((r) => !isPreOpeningRecord(r, field));
}
