/**
 * صيغة الرقم الرسمي — منطق خالص بلا شبكة ولا Firebase.
 *
 * مفصول عن `numbering.js` عمدًا: صيغة الرقم هي العقد الذي يراه المدقّق على
 * الورق، فيجب أن تُختبر وحدها دون الحاجة إلى سحابة ولا متصفّح.
 *
 * الصيغة المعتمدة (قرار المالك 2026-07-15): `GRN-2026-0001`
 *   النوع · السنة · تسلسل من أربع خانات يبدأ من 0001 ويُصفَّر مع كل سنة.
 */

/** عدد خانات التسلسل. */
export const SEQ_PAD = 4;

/** معرّف عدّاد النوع في سنة بعينها: `GRN-2026`. */
export function counterId(type, year) {
  return `${type}-${year}`;
}

/** يبني الرقم الرسمي: ('GRN', 2026, 1) ⇒ 'GRN-2026-0001' */
export function formatNumber(type, year, seq) {
  return `${type}-${year}-${String(seq).padStart(SEQ_PAD, '0')}`;
}

/** يفكّ الرقم إلى أجزائه، أو null إن لم يطابق الصيغة. */
export function parseNumber(number) {
  const m = /^([A-Z]+)-(\d{4})-(\d+)$/.exec(String(number || ''));
  if (!m) return null;
  return { type: m[1], year: Number(m[2]), seq: Number(m[3]) };
}
