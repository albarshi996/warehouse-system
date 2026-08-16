/**
 * صيغة الرقم الرسمي — منطق خالص بلا شبكة ولا Firebase.
 *
 * مفصول عن `numberingService.js` عمدًا: صيغة الرقم هي العقد الذي يراه المدقّق على
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

/**
 * قاعدة الزيادة: التسلسل التالي من العدّاد الحاليّ.
 *
 * نُقلت من طبقة التخزين إلى هنا (EXE-002): **القاعدة في الكود والقاعدة مخزنٌ
 * لا حاكم.** والزيادة قاعدةُ عملٍ لا تفصيلَ شبكة — عدّادٌ مفقود أو تالف يبدأ
 * من 1 ولا يتوقّف، وعدّادٌ سالبٌ أو نصٌّ لا يُنتج رقمًا سالبًا يكسر التدقيق.
 */
export function nextSeq(current) {
  const n = Number(current);
  return (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0) + 1;
}

/** يفكّ الرقم إلى أجزائه، أو null إن لم يطابق الصيغة. */
export function parseNumber(number) {
  const m = /^([A-Z]+)-(\d{4})-(\d+)$/.exec(String(number || ''));
  if (!m) return null;
  return { type: m[1], year: Number(m[2]), seq: Number(m[3]) };
}
