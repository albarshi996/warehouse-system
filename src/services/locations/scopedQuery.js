/**
 * ‹DS-READS› أدواتُ الاستعلام المقصور — منطقٌ خالصٌ لا يستورد شيئًا.
 *
 * منفصلٌ في ملفٍّ لا يستورد شيئًا عمدًا: تستعمله خدماتُ الخانات والأرصدة والأصناف
 * وبصمات الاستيراد، فلا يجرّ إلى أيٍّ منها محرّكَ الاقتراح ولا غيرَه. ويستعمله
 * الاختبارُ نفسُه، فحدودُ المدى المختبَرة هي حدودُ الاستعلام المُرسَل حرفًا.
 */

/** حدُّ Firestore لقيم `in` و`array-contains-any` في الاستعلام الواحد. */
export const IN_LIMIT = 30;

/** يقسم القائمة دفعاتٍ بحدّ `in`. */
export function chunksOf(list, size = IN_LIMIT) {
  const out = [];
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * مدى البادئة لاستعلام `>= start` و`< end` — خاناتُ المستودع `RH` كلُّها تبدأ بـ`RH-`،
 * و`.` هو المحرفُ التالي لـ`-` فلا يدخل `RHX-…` ولا `RH2-…`.
 */
export function binPrefixRange(prefix) {
  const p = String(prefix ?? '').trim().toUpperCase();
  return { start: `${p}-`, end: `${p}.` };
}
