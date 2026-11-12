/**
 * ‹زرّ الرجوع› حكمُ زرّ «رجوع» في أعلى كلّ شاشة — منطقٌ خالص (طلب المالك 2026-11-12).
 *
 * لماذا وُجد؟ تطبيقا المكتب والهاتف **بلا شريط متصفّح**: لا سهمَ رجوعٍ فيهما، فمن فتح
 * شاشةً لم يجد طريقًا إلى ما قبلها إلّا القائمة. والزرُّ يعيده خطوةً — وإن لم يكن
 * قبل الشاشة شيءٌ من البوّابة (فُتحت مباشرةً، أو جاء من صفحة الدخول) أعاده إلى
 * الرئيسيّة بدل أن يقذفه خارج التطبيق أو إلى صفحة دخولٍ تُعيد توجيهه.
 */

/** المسارُ بلا شَرطةٍ ختاميّة — فـ`/dashboard` و`/dashboard/` شاشةٌ واحدة. */
export function trimPath(path) {
  return String(path == null ? '' : path).replace(/\/+$/, '');
}

/**
 * ماذا يفعل زرُّ الرجوع الآن؟
 *   'none' — نحن في الرئيسيّة: لا رجوعَ منها، والزرُّ لا يُعرض.
 *   'back' — قبل هذه الشاشة شاشةٌ من البوّابة نفسِها: ارجع خطوةً في التاريخ.
 *   'home' — لا سابقَ يُؤمَن (فتحٌ مباشر · مصدرٌ خارجيّ · صفحةُ الدخول): إلى الرئيسيّة.
 *
 * @param {{pathname:string, home:string, referrer?:string, origin?:string, historyLength?:number}} ctx
 * @returns {'none'|'back'|'home'}
 */
export function backAction({ pathname, home, referrer, origin, historyLength } = {}) {
  if (trimPath(pathname) === trimPath(home)) return 'none';
  const ref = String(referrer || '');
  const fromApp = Boolean(origin) && ref.startsWith(String(origin));
  const fromLogin = /\/login\/?(?:[?#]|$)/.test(ref);
  return fromApp && !fromLogin && Number(historyLength) > 1 ? 'back' : 'home';
}
