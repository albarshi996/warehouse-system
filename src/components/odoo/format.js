/**
 * تنسيق الأرقام والتواريخ — أرقام لاتينية إلزامًا (R2).
 *
 * كل رقم في الواجهة يمرّ من هنا فيُعرَض بالصيغة اللاتينية (0-9) لا العربية-
 * الهندية (٠-٩)، عبر Intl.NumberFormat('ar-LY-u-nu-latn') كما يفرض البند R2.
 * الفاصلة العشرية وفاصل الآلاف يبقيان محلّيين، لكن الأرقام نفسها لاتينية.
 */
const NF = new Intl.NumberFormat('ar-LY-u-nu-latn', { maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('ar-LY-u-nu-latn', { maximumFractionDigits: 0 });

/** رقم عامّ بفاصل آلاف (لاتيني). */
export function num(n) {
  return NF.format(Number(n) || 0);
}

/** عدد صحيح بلا كسور (لاتيني). */
export function int(n) {
  return NF0.format(Number(n) || 0);
}

/** فرق موقّع يظهر بإشارته (مثل «6-» للنقص). */
export function delta(n) {
  const v = Number(n) || 0;
  if (v === 0) return NF0.format(0);
  return `${NF0.format(Math.abs(v))}${v < 0 ? '-' : '+'}`;
}
