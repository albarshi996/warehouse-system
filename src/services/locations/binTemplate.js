/**
 * قوالبُ ترقيم المستودعات — «وصفٌ يُعاد استعماله» (طلب المالك 2026-09-02). منطقٌ خالص.
 *
 * ═══ الفجوة التي تسدّها ═══
 * البانيةُ تطلب وصفَ خمسة مستوياتٍ بحقولها: بادئةٌ ومدًى وحشوٌ وقائمةُ قيم —
 * أربعةَ عشرَ حقلًا لمستودعٍ واحد. فمن يعرّف مستودعًا جديدًا يعيد اكتشافَ
 * الترميز من أوّله، وقد يخطئ حرفًا فيولّد ٢٦٠٠ كودٍ لا يطابق ملصقًا واحدًا.
 *
 * والقالبُ يقلب المسألة: الترميزُ يُوصف **مرّةً** ويُسمّى، ثمّ يُختار ويُملأ
 * بثلاثة أرقام — كم ممرًّا · كم رفًّا · كم خانة.
 *
 * ═══ ولماذا القالبُ بياناتٌ لا شيفرة ═══
 * لأنّ ترميزَ مستودعٍ ثالثٍ لا يجوز أن يحتاج نشرةَ برنامج. فالقالبُ في
 * `src/data/warehouse-schemes.json`، وهذا الملفّ يحلّه إلى `locationScheme`
 * القائم — فلا مولّدَ ثانٍ ولا حارسَ ثانٍ، والتوليدُ يمرّ بالطريق المُختبَر نفسِه.
 *
 * ═══ ★★ والتوليدُ إضافيٌّ لا استبداليّ ═══
 * `generationPlan` يحسب **الناقص** لا الكلّ. فمن وسّع مستودعَه من ٢٦ ممرًّا
 * إلى ٣٠ يغيّر رقمًا ويضغط الزرَّ نفسَه: تُضاف الأربعمئةُ الجديدةُ وحدَها،
 * ولا يُمسّ كودٌ قائمٌ قد تشير إليه حركة. والضغطةُ الثانيةُ بلا أثر.
 */

import { binPrefixOf } from './binAnatomy.js';
import { normalizeLocationCode } from './locationCode.js';
import { countScheme, expandScheme, schemeProblems } from './locationScheme.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const int = (v, dflt = 0) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : dflt;
};

/** أقصى عددِ حروفٍ لمستوًى حرفيّ — `A`…`Z`، فبعدها يلزم مقطعٌ آخر. */
export const MAX_LETTERS = 26;

/** حروفٌ متتابعة: `letterValues(3)` ⟵ `['A','B','C']`. */
export function letterValues(count) {
  const n = Math.min(MAX_LETTERS, Math.max(0, int(count)));
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

/** القالبُ بمعرّفه — و`null` لمعرّفٍ مجهول (ولا يُخمَّن أوّلُ قالب). */
export function templateById(templates, id) {
  return (templates || []).find((t) => str(t?.id) === str(id)) || null;
}

/** القيمُ الافتراضيّة لوسائط القالب. */
export function paramDefaults(template) {
  const out = {};
  for (const p of template?.params || []) out[str(p.key)] = int(p.default, int(p.min, 1));
  return out;
}

/** قيمةُ وسيطٍ محصورةً بحدَّيه — فلا يُنتج رقمٌ مطبوعٌ سهوًا مليونَ كود. */
function paramValue(template, params, key) {
  const spec = (template?.params || []).find((p) => str(p.key) === str(key));
  if (!spec) return int(params?.[key], 0);
  const raw = params?.[key] === undefined || params?.[key] === '' ? spec.default : params[key];
  return Math.min(int(spec.max, 9999), Math.max(int(spec.min, 0), int(raw, int(spec.default, 0))));
}

/**
 * مستوياتُ القالب محلولةً بالوسائط — بصيغة `locationScheme` حرفًا بحرف.
 *
 * ثلاثةُ أنواعٍ لا رابع: `letters` (حروفٌ متتابعة) · `list` (قيمٌ ثابتة) ·
 * `range` (مدًى مرقّمٌ بحشو). وما عداها مستوًى معطَّل.
 */
export function resolveLevels(template, params = {}) {
  return (template?.levels || []).map((l) => {
    const key = str(l.key);
    if (l.enabled === false) return { key, enabled: false };

    if (l.kind === 'letters') {
      return { key, enabled: true, values: letterValues(paramValue(template, params, str(l.count))) };
    }
    if (l.kind === 'list') {
      return { key, enabled: true, values: (l.values || []).map(up).filter(Boolean) };
    }
    if (l.kind === 'range') {
      const to = typeof l.to === 'string' ? paramValue(template, params, l.to) : int(l.to, 0);
      return {
        key,
        enabled: true,
        prefix: up(l.prefix),
        from: int(l.from, 1),
        to,
        pad: int(l.pad, 2),
      };
    }
    return { key, enabled: false };
  });
}

/** القالبُ محلولًا إلى مخطّطٍ كاملٍ لمستودعٍ بعينه. */
export function schemeFromTemplate(template, { binPrefix, params } = {}) {
  return { warehouse: up(binPrefix), levels: resolveLevels(template, params) };
}

/** كم كودًا يُنتج هذا القالب بهذه الوسائط؟ — يُحسب قبل التوليد لا بعده. */
export function countForTemplate(template, { binPrefix = 'X', params } = {}) {
  return countScheme(schemeFromTemplate(template, { binPrefix, params }));
}

/**
 * أعطابُ القالب بوسائطه — كلٌّ جملةٌ تقول الصواب.
 *
 * تُبنى على `schemeProblems` القائم (سقفُ التوليد والمحارف والفجوات) ويُضاف
 * إليها ما يخصّ القالب وحدَه: وسيطٌ خارج حدّه، ومستوًى حرفيٌّ يتجاوز الأبجديّة.
 */
export function templateProblems(template, { binPrefix, params } = {}) {
  const problems = [];
  if (!template) return ['اختر قالبَ ترقيمٍ أوّلًا.'];

  for (const spec of template.params || []) {
    const key = str(spec.key);
    const raw = params?.[key];
    if (raw === undefined || raw === '') continue;
    const n = int(raw, NaN);
    if (!Number.isFinite(n)) {
      problems.push(`«${spec.labelAr || key}» يحتاج رقمًا.`);
      continue;
    }
    if (n < int(spec.min, 0) || n > int(spec.max, 9999)) {
      problems.push(`«${spec.labelAr || key}» بين ${int(spec.min, 0)} و${int(spec.max, 9999)} — والمكتوب ${n}.`);
    }
  }

  problems.push(...schemeProblems(schemeFromTemplate(template, { binPrefix, params })));
  return problems;
}

/**
 * قراءةُ ترقيمِ مستودعٍ من وثيقته. مستودعٌ بلا ترقيمٍ يعود بـ`null` ولا يُخمَّن له.
 *
 * ★★ **والمخطّطُ المحفوظ يتقدّم على القالب**: المحفوظُ هو ما وُلِّد فعلًا وما
 * تشير إليه الأكواد القائمة، والقالبُ وصفٌ قد يُعدَّل في المكتبة بعد التوليد.
 * فلو غُيّر قالبٌ يومًا، لا تتحوّل خانات مستودعٍ قائمٍ إلى «ناقصة» فجأةً
 * فيُكتب فوقها ترميزٌ آخر.
 */
export function numberingOf(warehouse) {
  const templateId = str(warehouse?.templateId);
  const scheme = warehouse?.scheme && Array.isArray(warehouse.scheme.levels) ? warehouse.scheme : null;
  if (!templateId && !scheme) return null;
  return { templateId, params: warehouse?.templateParams || {}, scheme };
}

/**
 * الإسنادُ المعتمدُ لهذا المستودع — من مكتبة البذرة، بمطابقة كود البوّابة.
 *
 * ★★★ ولماذا يُقرأ أصلًا؟ لأنّ الزرَّ **يجب أن يعمل في المرّة الأولى**:
 * المستودعُ في البوّابة لا قالبَ محفوظًا عليه بعد، والإسنادُ المعتمد يعرف
 * قالبَه وبادئتَه ومقاسَه (وقد قِيس بالملصقات المطبوعة). فبلا هذا الرجوع
 * يقول الزرُّ «بلا قالب» لكلّ مستودعٍ في أوّل يوم — وهو أسوأ ما يمكن أن
 * يقوله زرٌّ وُجد ليختصر الطريق.
 */
export function assignmentFor(warehouse, assignments) {
  const code = up(warehouse?.code);
  if (!code) return null;
  return (assignments || []).find((a) => up(a.warehouseCode) === code) || null;
}

/**
 * ★★ خطّةُ التوليد لمستودعٍ واحد — **الناقصُ لا الكلّ**.
 *
 * @returns {{warehouseCode, nameAr, binPrefix, templateId, total, have, missing:string[],
 *            problems:string[], ready:boolean}}
 */
export function warehousePlan(warehouse, { templates = [], existingCodes = [], assignments = [] } = {}) {
  const assignment = assignmentFor(warehouse, assignments);
  // المحفوظُ على الوثيقة يتقدّم، ثمّ الإسنادُ المعتمد، ثمّ كودُ المستودع نفسُه.
  const binPrefix = up(warehouse?.binPrefix) || up(assignment?.binPrefix) || binPrefixOf(warehouse);
  const saved = numberingOf(warehouse);
  const numbering =
    saved || (assignment ? { templateId: assignment.templateId, params: assignment.params, scheme: null } : null);
  const base = {
    warehouseCode: str(warehouse?.code),
    nameAr: str(warehouse?.nameAr || warehouse?.name),
    binPrefix,
    templateId: numbering?.templateId || '',
    templateParams: numbering?.params || {},
    // مِن أين جاء القالب — فالشاشةُ تقول «معتمدٌ غير محفوظٍ بعد» ولا تدّعي حفظًا.
    source: saved ? 'saved' : assignment ? 'assignment' : '',
    total: 0,
    have: 0,
    missing: [],
    // ★ أكوادٌ قائمةٌ لا يصفها القالب — تقع حين يُصغَّر القالبُ بعد التوليد.
    //   تُعلَن ولا تُحذف: قد تشير إليها حركاتٌ ماضية، والخروجُ من الخدمة
    //   يكون بأرشفة الموقع لا بمحوه (قاعدةُ bin_locations: لا حذف).
    extra: 0,
    problems: [],
    ready: false,
  };

  const have = [...(existingCodes || [])]
    .map((c) => normalizeLocationCode(c))
    .filter((c) => binPrefix && c.startsWith(`${binPrefix}-`));
  base.have = have.length;

  if (!numbering) {
    base.problems = ['هذا المستودع بلا قالب ترقيم — اخترْ له قالبًا في بانية المواقع.'];
    return base;
  }

  let scheme = numbering.scheme;
  if (!scheme) {
    const template = templateById(templates, numbering.templateId);
    if (!template) {
      base.problems = [`القالب «${numbering.templateId}» غير معروف — لعلّه حُذف من مكتبة القوالب.`];
      return base;
    }
    const problems = templateProblems(template, { binPrefix, params: numbering.params });
    if (problems.length) return { ...base, problems };
    scheme = schemeFromTemplate(template, { binPrefix, params: numbering.params });
  }

  const schemeIssues = schemeProblems({ ...scheme, warehouse: binPrefix });
  if (schemeIssues.length) return { ...base, problems: schemeIssues };

  const { codes } = expandScheme({ ...scheme, warehouse: binPrefix });
  const known = new Set(have);
  const described = new Set(codes);
  const missing = codes.filter((c) => !known.has(c));
  const extra = have.filter((c) => !described.has(c)).length;

  return { ...base, total: codes.length, missing, extra, ready: missing.length > 0 };
}

/**
 * خطّةُ التوليد للمستودعات كلّها — ما يقرؤه الزرُّ الواحد.
 *
 * تُعيد صفًّا لكلّ مستودعٍ حتّى الذي لا ينقصه شيء، فالشاشةُ تعرض الحالةَ
 * كاملةً: «٢٦٠٠/٢٦٠٠» أوضحُ من صمتٍ يعني النجاح.
 */
export function generationPlan({ warehouses = [], templates = [], existingCodes = [], assignments = [] } = {}) {
  const rows = warehouses.map((w) => warehousePlan(w, { templates, existingCodes, assignments }));
  return {
    rows,
    totalMissing: rows.reduce((s, r) => s + r.missing.length, 0),
    readyCount: rows.filter((r) => r.ready).length,
    blocked: rows.filter((r) => r.problems.length),
  };
}
