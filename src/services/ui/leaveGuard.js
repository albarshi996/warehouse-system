/**
 * لا مغادرةَ في منتصف كتابة — منطقٌ خالص.
 *
 * الكتابةُ على دفعاتٍ تبني الدفعةَ التالية بعد إقرار السابقة، فمن غادر الصفحة بينهما لم تُبنَ
 * الدفعةُ التالية أصلًا — **ولا يُرمى خطأ**. هكذا ضاع ٦٤ رصيدَ عبورٍ من ٥٦٤ (2026-10-22): كُتبت
 * الخمسمئة الأولى ثمّ غُودرت الصفحة والزرُّ يقول «جارٍ الاستيراد…»، ولم يكشفه إلّا شاشةُ المطابقة.
 *
 * والحارسُ تحذيرُ المتصفّح قبل المغادرة ما دامت الكتابةُ جارية، ومعه نصُّ تقدّمٍ يقول ما كُتب فعلًا.
 */

export const LEAVE_MESSAGE = 'الكتابة لم تكتمل — مغادرةُ الصفحة الآن تُسقط ما لم يُكتب بعد.';

/** يربط التحذير بالهدف (`window`) ويُعيد دالّةَ فكّه. بلا هدفٍ (تصييرٌ على الخادم) لا يفعل شيئًا. */
export function guardLeave(target, message = LEAVE_MESSAGE) {
  if (!target?.addEventListener) return () => {};
  const onBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = message;
    return message;
  };
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => target.removeEventListener('beforeunload', onBeforeUnload);
}

/** نصُّ التقدّم أثناء الكتابة — «كُتب» تعني أقرّه الخادم، لا أنّه أُرسل. */
export function writeProgressLabel({ written = 0, total = 0 } = {}) {
  return `جارٍ الكتابة… ${written} من ${total} — لا تغادر الصفحة`;
}
