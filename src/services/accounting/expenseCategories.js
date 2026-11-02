/**
 * فئاتُ المصاريف — التبويبُ الهجينُ (قرارُ المالك 2026-11-01): فئةٌ من قائمةٍ
 * ثابتةٍ **وملاحظةٌ حرّة**. الفئةُ تُسرّع الإدخالَ وتُنقّي التقرير، والملاحظةُ
 * تحفظ التفصيلَ الذي لا تسعه فئةٌ («غداء الورديّة» · «صيانة المكيّف»).
 *
 * ★ القائمةُ الـ١١ أقرّها المالك (الخطة §3 · §8/٢) — مُشتقّةٌ من إكسل الخزينة
 *   وقائمته. وهي **التصنيفُ المرجعيُّ الكامل**: الرواتبُ وسلفُ العمّال فئتان
 *   فيه ليكتمل التقرير، لكنّهما تُسجَّلان بمستندَيهما (SAL · ADV) اللذين يمسّان
 *   حسابَيهما (SALARIES · WORKER_ADV) ودفترَ العامل — فلا تُسجَّلان مصروفًا عامًّا.
 *   أمّا مستندُ المصروف العامّ (EXP) فيعرض **التسع** الباقية التي تُقيَّد في
 *   حساب المصروفات المبوّب (`EXPENSE:<فئة>`).
 *
 * ★★ المفتاحُ لاتينيٌّ ثابت: هو اسمُ الحساب الفرعيّ (`EXPENSE:RENT`) ومفتاحُ
 *    التجميع في التقرير — فلو كان عربيًّا لتغيّر بتغيّر النصّ وانكسر التجميع.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

/** الحسابُ الذي تُقيَّد فيه كلُّ فئة — التسعُ التشغيليّةُ مبوّبةٌ تحت `EXPENSE`. */
export const EXPENSE_CATEGORIES = Object.freeze([
  { key: 'salaries', labelAr: 'رواتب موظّفين', account: 'SALARIES' },
  { key: 'worker_advance', labelAr: 'سلف ومستحقّات عمّال', account: 'WORKER_ADV' },
  { key: 'rent', labelAr: 'إيجار', account: 'EXPENSE' },
  { key: 'maintenance', labelAr: 'صيانة', account: 'EXPENSE' },
  { key: 'licenses', labelAr: 'رسوم تراخيص', account: 'EXPENSE' },
  { key: 'cleaning', labelAr: 'نظافة', account: 'EXPENSE' },
  { key: 'transport', labelAr: 'نقل وتوصيل', account: 'EXPENSE' },
  { key: 'handling', labelAr: 'مناولة وعمالة يوميّة', account: 'EXPENSE' },
  { key: 'catering', labelAr: 'إعاشة وضيافة', account: 'EXPENSE' },
  { key: 'operating', labelAr: 'تشغيل عامّ', account: 'EXPENSE' },
  { key: 'other', labelAr: 'أخرى', account: 'EXPENSE' },
]);

const BY_KEY = new Map(EXPENSE_CATEGORIES.map((c) => [c.key, c]));
const BY_LABEL = new Map(EXPENSE_CATEGORIES.map((c) => [c.labelAr, c]));

/** فئاتُ مستند المصروف العامّ (EXP): ما يُقيَّد في `EXPENSE` دون الرواتب والسلف. */
export const EXP_DOC_CATEGORIES = Object.freeze(EXPENSE_CATEGORIES.filter((c) => c.account === 'EXPENSE'));

/** الفئةُ الافتراضيّة حين لا تُذكر أو تكون مجهولة — «أخرى» لا تُسقِط القيد. */
export const DEFAULT_CATEGORY = 'other';

const str = (v) => String(v ?? '').trim();

/**
 * يُطبّع مفتاحَ فئةٍ: يقبل المفتاحَ اللاتينيَّ أو النصَّ العربيّ (من قائمةٍ قديمة
 * أو إدخالٍ حرّ)، ويردّ المجهولَ إلى «أخرى» — فلا يضيع قيدٌ لفئةٍ لم تُعرَف.
 */
export function normalizeCategory(value) {
  const v = str(value);
  if (!v) return DEFAULT_CATEGORY;
  if (BY_KEY.has(v)) return v;
  if (BY_LABEL.has(v)) return BY_LABEL.get(v).key;
  const lower = v.toLowerCase();
  if (BY_KEY.has(lower)) return lower;
  return DEFAULT_CATEGORY;
}

/** هل المفتاحُ فئةٌ معرَّفة؟ (قبل التطبيع) */
export function isCategory(key) {
  return BY_KEY.has(str(key));
}

/** الاسمُ العربيُّ لفئةٍ (بمفتاحها أو نصّها)، أو «أخرى» إن جُهلت. */
export function categoryLabel(key) {
  return (BY_KEY.get(normalizeCategory(key)) || BY_KEY.get(DEFAULT_CATEGORY)).labelAr;
}

/** الحسابُ الذي تُقيَّد فيه فئةٌ — `SALARIES`/`WORKER_ADV`/`EXPENSE`. */
export function categoryAccount(key) {
  return (BY_KEY.get(normalizeCategory(key)) || BY_KEY.get(DEFAULT_CATEGORY)).account;
}

/** خيارُ قائمةٍ منسّق «المفتاح|العربيّة» لمخطّط المستند (select). */
export function categoryOptions(list = EXP_DOC_CATEGORIES) {
  return list.map((c) => ({ value: c.key, label: c.labelAr }));
}
