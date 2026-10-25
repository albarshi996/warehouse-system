/**
 * المال بوحدات العملة الصغرى — عددٌ صحيحٌ لا كسرٌ عائم (نصّ الخطة §6).
 *
 * الدينار الليبيّ ثلاث منازل، فوحدتُه الصغرى الدرهم: 1 د.ل = 1000 وحدة.
 * القيدُ المزدوج يُحسب ويُوازَن بالوحدة الصغرى الصحيحة — فلا يتسرّب خطأُ العائم
 * (0.1 + 0.2 ≠ 0.3) إلى ميزانٍ يجب أن يُطبق إلى الصفر بالضبط.
 *
 * سياسةُ تقريبٍ **واحدة** للكلّ: نصفٌ بعيدًا عن الصفر. منطق خالص.
 */

/** الوحدةُ الصغرى للدينار الليبيّ — ثلاث منازل. */
export const LYD_MINOR = 1000;

/** تقريبٌ واحدٌ معتمد: النصفُ بعيدًا عن الصفر (متماثلٌ للموجب والسالب). */
export function roundHalfAwayFromZero(n) {
  const x = Number(n) || 0;
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** عددٌ عشريّ ← وحدةٌ صغرى صحيحة. */
export function toMinor(amount, minor = LYD_MINOR) {
  return roundHalfAwayFromZero((Number(amount) || 0) * minor);
}

/** وحدةٌ صغرى ← عددٌ عشريّ. */
export function fromMinor(units, minor = LYD_MINOR) {
  return (Number(units) || 0) / minor;
}

/** هل القيمةُ وحدةٌ صغرى صحيحة؟ (لا كسرَ في الدفتر) */
export function isWholeMinor(units) {
  return Number.isInteger(units);
}
