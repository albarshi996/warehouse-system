/**
 * نموذج اشتقاق سجلّ المطابقة — دوال خالصة فوق `src/data/reference-crosswalk.json`.
 *
 * لماذا خالص (بلا DOM/Firestore)؟ ليُختبَر في Node، ولأن صفحتَي «المطابقة
 * والاستلام» و«الشرح التفاعلي» تعرضان فوقه فحسب. المصدر الواحد للأرقام هو
 * الملفّ لا رقمٌ مكتوب هنا (مبدأ «تحقّق قبل الثقة»).
 */

/** ترتيب عرض الحالات وألوانها المنطقية (تُترجَم لتوكِنز في الصفحة). */
export const STATUS_ORDER = ['match', 'dev', 'add-ref', 'building', 'odoo-scope'];

/** يعدّ عناصر مصفوفة حسب حقل `status`. */
export function countByStatus(items) {
  const out = {};
  for (const key of STATUS_ORDER) out[key] = 0;
  for (const it of items || []) {
    if (it && it.status) out[it.status] = (out[it.status] || 0) + 1;
  }
  return out;
}

/** إجمالي عناصر مجموعةٍ ما. */
const total = (items) => (items || []).length;

/**
 * الملخّص التنفيذي — كل الأرقام محسوبة من الملفّ.
 * `alignedPct` = نسبة ما لا يحتاج تدخّلًا (مطابق + مطوَّر + نطاق أودو) من الإجمالي
 * القابل للمحاذاة (نماذج + أدوار + حرّاس + خدمات).
 */
export function crosswalkSummary(data) {
  const forms = data.forms || [];
  const roles = data.roles || [];
  const guards = data.guards || [];
  const services = data.services || [];
  const all = [...forms, ...roles, ...guards, ...services];

  const counts = countByStatus(all);
  const settled = counts['match'] + counts['dev'] + counts['odoo-scope'];
  const totalItems = all.length || 1;

  return {
    formsTotal: total(forms),
    portalGovernedForms: forms.filter((f) => f.portalCode).length,
    rolesTotal: total(roles),
    guardsTotal: total(guards),
    servicesTotal: total(services),
    chainsTotal: total(data.chains),
    gapsTotal: total(data.gaps),
    gapsOpen: (data.gaps || []).filter((g) => g.status !== 'done').length,
    building: counts['building'],
    addToRef: counts['add-ref'],
    counts,
    alignedPct: Math.round((settled / totalItems) * 100),
  };
}

/** يجمع عناصر مصفوفة في مجموعاتٍ حسب حقلٍ ما (مثل `chain` أو `area`). */
export function groupBy(items, field) {
  const map = new Map();
  for (const it of items || []) {
    const key = it[field] ?? '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  return [...map.entries()].map(([key, list]) => ({ key, items: list }));
}

/** الفجوات مقسّمة باتجاهها (المرجع متأخّر / البوابة تنقصها خدمة). */
export function gapsByDirection(gaps) {
  return {
    refBehind: (gaps || []).filter((g) => g.direction === 'ref-behind'),
    portalMissing: (gaps || []).filter((g) => g.direction === 'portal-missing'),
  };
}

/**
 * حارس بنية — يُسقط الاختبار لو انحرفت بنية الملفّ (نفس درس studyVerdict).
 * يتحقّق أن كل عنصرٍ يحمل حالةً معروفة وأن الأقسام غير فارغة.
 */
export function crosswalkVerdict(data) {
  const problems = [];
  const known = new Set(STATUS_ORDER);
  // `checkStatus` يُفحص فقط في أقسام مفردات المحاذاة؛ الفجوات تستخدم
  // مفردات إجراءٍ خاصّة (planned/done) والسلاسل بلا حقل status.
  const check = (name, items, checkStatus) => {
    if (!Array.isArray(items) || items.length === 0) {
      problems.push(`قسم «${name}» فارغ أو مفقود`);
      return;
    }
    if (!checkStatus) return;
    items.forEach((it, i) => {
      if (it.status && !known.has(it.status)) problems.push(`حالة غير معروفة في ${name}[${i}]: ${it.status}`);
    });
  };
  check('forms', data.forms, true);
  check('roles', data.roles, true);
  check('guards', data.guards, true);
  check('services', data.services, true);
  check('cycle', data.cycle, true);
  check('chains', data.chains, false);
  check('gaps', data.gaps, false);
  return { ok: problems.length === 0, problems };
}
