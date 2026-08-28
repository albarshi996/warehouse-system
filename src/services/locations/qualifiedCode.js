/**
 * الكود الكامل للعرض ‹LPN-706› — ثمانيةٌ على الملصق وستّةٌ في المعرّف. منطق خالص.
 *
 * ═══ التعارض الذي يحلّه (تعارض ② في وثيقة المطابقة) ═══
 * نصّ الطلب كتب كود الموقع هكذا: `BR-RH-W01-Z01-A01-R01-L03-B05` — شركةٌ وفرعٌ
 * ومستودعٌ ومنطقةٌ وممرٌّ ورفٌّ ومستوًى وخانة. وكود الموقع في هذا النظام ستّةُ
 * مقاطع، والفرعُ **مدموجٌ في كود المستودع** بقرارٍ مكتوبٍ في ترويسة
 * [`locationScheme.js`](./locationScheme.js).
 *
 * ولماذا لا يُغيَّر المعرّف؟ لأنّه **ليس اسمًا للعرض**: هو معرّفُ مستند
 * Firestore وجزءٌ من **مفتاح الرصيد**. وإدراج مقطعين في المقدّمة يزيح دلالة كلّ
 * مقطعٍ بعده، فيصير `MAIN-A01` القائم مقروءًا «موقعًا ثمّ مستودعًا» — ويُكسر
 * كلّ رصيدٍ ومستندٍ سابق.
 *
 * ═══ ★★ والحلّ: بادئةٌ **تُعرض وتُقبل ولا تُخزَّن** ═══
 *   · الملصق يُطبع بالصورة الكاملة كما أرادها النصّ حرفيًّا.
 *   · والمسح يقبل **الصورتين**: الكاملةُ تُقصّ بادئتُها المعروفة فتعود للمعرّف.
 *   · وقاعدة البيانات لا ترى البادئة أصلًا — صفرُ تغييرٍ في الرصيد.
 *
 * ═══ والبادئة الغريبة تُردّ ولا تمرّ صامتة ═══
 * ملصقٌ من فرعٍ آخر (`BR-BEN-W01-A01`) لو مرّ لَقُيّدت حركةٌ على موقعٍ ليس
 * عندنا. فيُقرأ ويُقال: «هذا ملصق فرع BEN وأنت في RH» — وهي رسالةٌ تُنهي
 * الموقف في ثانية بدل «كود غير معروف».
 */

import { SEGMENT_SEPARATOR, normalizeLocationCode } from './locationCode.js';

/**
 * رمز الشركة الافتراضيّ — `BR` كما في مثال النصّ (Brandzo).
 * يُمرَّر من الإعدادات حين تُعرَّف، وهذا الافتراض يجعل الملصق صحيحًا اليوم.
 */
export const DEFAULT_COMPANY_CODE = 'BR';

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * سياقُ التأهيل من سجلّ المستودع — الشركةُ والفرع.
 *
 * يقبل صورًا شتّى لأنّ السجلّات القديمة كتبت الفرع بأسماءٍ مختلفة
 * (`branchCode` · `branch` · `site`) — وقارئٌ متسامحٌ هنا أنفعُ من ترحيل
 * بياناتٍ لأجل عرضٍ على ملصق.
 */
export function qualifierOf(warehouse, { company = DEFAULT_COMPANY_CODE } = {}) {
  return {
    company: up(warehouse?.companyCode ?? warehouse?.company ?? company) || DEFAULT_COMPANY_CODE,
    branch: up(warehouse?.branchCode ?? warehouse?.branch ?? warehouse?.site ?? ''),
  };
}

/** البادئة نصًّا — `BR-RH` أو `BR` وحدها إن لم يُعرَّف فرع. */
export function qualifierPrefix({ company = DEFAULT_COMPANY_CODE, branch = '' } = {}) {
  return [up(company) || DEFAULT_COMPANY_CODE, up(branch)].filter(Boolean).join(SEGMENT_SEPARATOR);
}

/**
 * الكود الكامل للعرض والطباعة — `BR-RH-W01-STG-Z01`.
 *
 * يعيد الكود القانونيّ كما هو إن لم يكن ثمّ بادئةٌ تُذكر، ولا يُضيف بادئةً
 * مرّتين لكودٍ مؤهَّلٍ أصلًا.
 */
export function buildQualifiedCode(code, qualifier = {}) {
  const canonical = normalizeLocationCode(code);
  if (!canonical) return '';
  const prefix = qualifierPrefix(qualifier);
  if (!prefix) return canonical;
  if (canonical.startsWith(`${prefix}${SEGMENT_SEPARATOR}`)) return canonical;
  return `${prefix}${SEGMENT_SEPARATOR}${canonical}`;
}

/**
 * ★★ يردّ أيّ صورةٍ إلى المعرّف القانونيّ.
 *
 * @returns {{code:string, wasQualified:boolean, problem:string}}
 *          `problem` يُملأ حين تكون البادئة **معروفةً لفرعٍ آخر** — وهو الوحيد
 *          الذي يستحقّ الرفض: بادئةٌ مجهولةٌ تمامًا تُترك للمصنّف يحكم عليها،
 *          فقد تكون كودًا قانونيًّا لا بادئةً أصلًا.
 */
export function stripQualifier(raw, qualifier = {}) {
  const value = normalizeLocationCode(raw);
  if (!value) return { code: '', wasQualified: false, problem: '' };

  const company = up(qualifier?.company) || DEFAULT_COMPANY_CODE;
  const branch = up(qualifier?.branch);
  const segments = value.split(SEGMENT_SEPARATOR);

  if (segments[0] !== company) {
    return { code: value, wasQualified: false, problem: '' };
  }

  // البادئة تحمل رمز شركتنا — فالصورة مؤهَّلة. يبقى الفرع.
  if (branch) {
    if (segments[1] === branch) {
      return { code: segments.slice(2).join(SEGMENT_SEPARATOR), wasQualified: true, problem: '' };
    }
    return {
      code: value,
      wasQualified: true,
      problem: `هذا ملصق فرع «${segments[1] ?? ''}» وأنت في فرع «${branch}» — لا تُقيَّد حركةٌ على موقعٍ ليس عندنا.`,
    };
  }

  return { code: segments.slice(1).join(SEGMENT_SEPARATOR), wasQualified: true, problem: '' };
}

/**
 * حلُّ مسحةٍ إلى المعرّف — الصورةُ الكاملة والقانونيّة كلتاهما مقبولة.
 *
 * تُستدعى **قبل** أيّ مقارنةٍ بموقعٍ مخزَّن: فلو قورنت الصورة الكاملة مباشرةً
 * لَما طابقت شيئًا، ولوقف العامل أمام ملصقٍ صحيحٍ يقول له النظام «غير موجود».
 *
 * @returns {{code:string, qualified:string, wasQualified:boolean, problem:string}}
 */
export function resolveLocationScan(raw, qualifier = {}) {
  const out = stripQualifier(raw, qualifier);
  return {
    ...out,
    qualified: out.problem ? normalizeLocationCode(raw) : buildQualifiedCode(out.code, qualifier),
  };
}

/**
 * يبني سياق التأهيل من قائمة المستودعات وكودِ موقعٍ — المستودعُ هو المقطع
 * الأوّل من الكود القانونيّ.
 *
 * ولماذا هنا لا في الشاشة؟ لأنّ الملصق والمسح والتقرير ثلاثتُها تحتاجه،
 * وثلاثةُ حساباتٍ للبادئة تعني ثلاثَ صورٍ للملصق الواحد.
 */
export function qualifierForCode(code, warehouses = [], { company = DEFAULT_COMPANY_CODE } = {}) {
  const canonical = normalizeLocationCode(code);
  const head = canonical.split(SEGMENT_SEPARATOR)[0] ?? '';
  const wh = (warehouses ?? []).find((w) => up(w?.code) === head) ?? null;
  return qualifierOf(wh, { company });
}

/** الصورة المعروضة لموقعٍ ما بحسب مستودعاته — سطرٌ واحدٌ للشاشة والملصق. */
export function displayCodeOf(code, warehouses = [], options = {}) {
  return buildQualifiedCode(code, qualifierForCode(code, warehouses, options));
}
