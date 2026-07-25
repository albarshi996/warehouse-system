/**
 * منطق مركز الدراسات والمقارنات — خالص بلا Firestore وبلا DOM.
 *
 * مصدرا الحقيقة اللذان يحرسهما هذا الملف:
 *   - `src/data/global-doc-cycles.json` — الشركات العالمية الثمانية.
 *   - `src/data/comparative-study.json` — الدراسة المقارنة (فجوات · مؤشرات ·
 *     مخاطر · أسئلة · ممارسات · توصيات · درجات نضج).
 *
 * 🔒 حارس الدراسة `studyVerdict`: منهجيةٌ لا تُنشر بلا دليل — كل فجوة تحمل
 * دليلها من نظامنا وشركتها المرجعية، وكل توصية تربط فجوةً موجودة فعلًا،
 * وكل مؤشر يحمل صيغته ومصدر بياناته. الاختبارات تُشغّل الحارسَين على ملفَي
 * البيانات الحقيقيين، فأي عبثٍ بالبنية يُسقط البناء قبل أن يصل الموقع الحي.
 */

/** حالات تطبيق الممارسة عندنا — تُعرض شارات في الدراسة. */
export const PRACTICE_STATUSES = ['مطبَّق', 'جزئي', 'غائب'];

/** درجات خطورة الفجوات مرتّبة من الأشد. */
export const GAP_SEVERITIES = ['حرجة', 'عالية', 'متوسطة', 'منخفضة'];

/** آفاق التوصيات مرتّبة زمنيًّا. */
export const REC_HORIZONS = ['مكسب سريع', 'متوسط المدى', 'استراتيجي'];

/** الحقول التي لا شركة عالمية بدونها في المكتبة. */
const COMPANY_REQUIRED = ['id', 'nameAr', 'nameEn', 'sector', 'modelLabel', 'triangle', 'keyTakeaway'];

/** حقول بطاقة التصنيف (profile) الأربعة — أساس مصفوفة النماذج. */
const PROFILE_REQUIRED = ['inventoryOwner', 'demandSignal', 'coreDocument', 'network'];

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;
const hasItems = (v, n) => Array.isArray(v) && v.length >= n;

/**
 * حارس مكتبة الشركات: لا شركة بلا هوية كاملة ولا بأقسام فارغة.
 * يعيد { ok, blockers, warnings } — الحاجب يمنع، والتنبيه يُسجَّل ولا يمنع.
 */
export function companiesVerdict(data) {
  const blockers = [];
  const warnings = [];
  const companies = data?.companies;

  if (!hasItems(companies, 1)) {
    return { ok: false, blockers: ['لا شركات في الملف إطلاقًا'], warnings };
  }
  if (data.meta?.companiesCount !== companies.length) {
    blockers.push(`العدد المعلن (${data.meta?.companiesCount}) لا يطابق الفعلي (${companies.length})`);
  }

  const seen = new Set();
  for (const c of companies) {
    const label = c?.nameAr || c?.id || '؟';
    for (const f of COMPANY_REQUIRED) {
      if (!isFilled(c?.[f])) blockers.push(`«${label}»: الحقل ${f} فارغ`);
    }
    if (seen.has(c?.id)) blockers.push(`معرّف مكرر: ${c?.id}`);
    seen.add(c?.id);
    for (const f of PROFILE_REQUIRED) {
      if (!isFilled(c?.profile?.[f])) blockers.push(`«${label}»: بطاقة التصنيف تنقصها ${f}`);
    }
    if (!hasItems(c?.philosophy, 2)) blockers.push(`«${label}»: أقل من ركيزتين في الفلسفة`);
    if (!hasItems(c?.stages, 3)) blockers.push(`«${label}»: أقل من ثلاث مراحل في الدورة`);
    if (!hasItems(c?.documents, 3)) blockers.push(`«${label}»: أقل من ثلاثة مستندات`);
    if (!hasItems(c?.odooMapping, 3)) blockers.push(`«${label}»: إسقاط Odoo أقل من ثلاثة بنود`);
    if (!hasItems(c?.lessons, 2)) blockers.push(`«${label}»: أقل من درسين قابلين للنقل`);
    if (!hasItems(c?.departments, 3)) warnings.push(`«${label}»: أقل من ثلاث إدارات`);
    if (!hasItems(c?.stats, 1)) warnings.push(`«${label}»: بلا أرقام دالة`);
  }

  return { ok: blockers.length === 0, blockers, warnings };
}

/**
 * 🔒 حارس الدراسة المقارنة: يمنع نشر دراسةٍ بلا أدلة أو بروابط مكسورة.
 *
 * حواجب: فجوة بلا دليل من نظامنا أو بلا شركة مرجعية · توصية تربط فجوة
 * غير موجودة · مؤشر بلا صيغة أو مصدر بيانات · درجة نضج خارج [0..5]
 * أو أبعاد أقل من المتوقع · قيم تصنيف خارج القوائم المعتمدة.
 * تنبيهات: فجوة حرجة/عالية لا تغطيها أي توصية · مخاطرة بلا ربط بفجوة.
 */
export function studyVerdict(study) {
  const blockers = [];
  const warnings = [];
  const gaps = study?.gaps ?? [];
  const kpis = study?.kpis ?? [];
  const risks = study?.risks ?? [];
  const questions = study?.questions ?? [];
  const practices = study?.practices ?? [];
  const recs = study?.recommendations ?? [];
  const dims = study?.scores?.dimensions ?? [];

  for (const [name, arr, min] of [
    ['الفجوات', gaps, 8],
    ['المؤشرات', kpis, 12],
    ['المخاطر', risks, 8],
    ['الأسئلة', questions, 12],
    ['الممارسات', practices, 10],
    ['التوصيات', recs, 8],
  ]) {
    if (!hasItems(arr, min)) blockers.push(`قسم ${name} أقل من حدّه الأدنى (${arr.length} < ${min})`);
  }

  const gapIds = new Set(gaps.map((g) => g.id));
  for (const g of gaps) {
    if (!isFilled(g.ourEvidence)) blockers.push(`فجوة «${g.title || g.id}» بلا دليل من نظامنا`);
    if (!hasItems(g.worldCompanies, 1)) blockers.push(`فجوة «${g.title || g.id}» بلا شركة مرجعية`);
    if (!GAP_SEVERITIES.includes(g.severity)) blockers.push(`فجوة «${g.title || g.id}» بخطورة غير معتمدة: ${g.severity}`);
  }

  for (const k of kpis) {
    if (!isFilled(k.formula)) blockers.push(`مؤشر «${k.nameAr || k.id}» بلا صيغة حسابية`);
    if (!isFilled(k.dataSource)) blockers.push(`مؤشر «${k.nameAr || k.id}» بلا مصدر بيانات`);
  }

  const coveredGaps = new Set();
  for (const r of recs) {
    if (!REC_HORIZONS.includes(r.horizon)) blockers.push(`توصية «${r.title || r.id}» بأفق غير معتمد: ${r.horizon}`);
    for (const gid of r.linkedGapIds ?? []) {
      if (!gapIds.has(gid)) blockers.push(`توصية «${r.title || r.id}» تربط فجوة غير موجودة: ${gid}`);
      coveredGaps.add(gid);
    }
  }
  for (const g of gaps) {
    if ((g.severity === 'حرجة' || g.severity === 'عالية') && !coveredGaps.has(g.id)) {
      warnings.push(`فجوة ${g.severity} «${g.title}» لا تغطيها أي توصية`);
    }
  }

  for (const p of practices) {
    if (!PRACTICE_STATUSES.includes(p.ourStatus)) blockers.push(`ممارسة «${p.title || p.id}» بحالة غير معتمدة: ${p.ourStatus}`);
    if (!isFilled(p.ourEvidence)) blockers.push(`ممارسة «${p.title || p.id}» بلا دليل لحكمها`);
  }

  for (const r of risks) {
    const score = (r.probability ?? 0) * (r.impact ?? 0);
    if (!(score >= 1 && score <= 25)) blockers.push(`مخاطرة «${r.title || r.id}» بتقدير خارج المدى`);
    if (!hasItems(r.linkedGapIds, 1)) warnings.push(`مخاطرة «${r.title}» بلا ربط بأي فجوة`);
  }

  if (!hasItems(dims, 8)) blockers.push(`أبعاد النضج أقل من ثمانية (${dims.length})`);
  for (const d of dims) {
    if (typeof d.score !== 'number' || d.score < 0 || d.score > 5) {
      blockers.push(`بُعد «${d.nameAr || d.id}» بدرجة خارج [0..5]: ${d.score}`);
    }
  }

  return { ok: blockers.length === 0, blockers, warnings };
}

/** فجوات مجمّعة بالخطورة وبترتيبها المعتمد — للعرض والتصفية. */
export function gapsBySeverity(gaps) {
  const out = GAP_SEVERITIES.map((severity) => ({ severity, gaps: [] }));
  for (const g of gaps ?? []) {
    const bucket = out.find((b) => b.severity === g.severity);
    if (bucket) bucket.gaps.push(g);
  }
  return out.filter((b) => b.gaps.length > 0);
}

/**
 * مصفوفة المخاطر: score = احتمال × أثر، والنطاقات:
 * مرتفع ≥ 15 · متوسط ≥ 8 · ما دونها منخفض. الترتيب داخل كل نطاق تنازلي.
 */
export function riskMatrix(risks) {
  const banded = { 'مرتفع': [], 'متوسط': [], 'منخفض': [] };
  for (const r of risks ?? []) {
    const score = (r.probability ?? 0) * (r.impact ?? 0);
    const band = score >= 15 ? 'مرتفع' : score >= 8 ? 'متوسط' : 'منخفض';
    banded[band].push({ ...r, score });
  }
  for (const band of Object.values(banded)) band.sort((a, b) => b.score - a.score);
  return banded;
}

/** التوصيات في أعمدتها الثلاثة بترتيب الأفق ثم الأثر (التحويلي أولًا). */
export function recsByHorizon(recs) {
  const impactRank = { 'تحويلي': 0, 'مرتفع': 1, 'متوسط': 2 };
  return REC_HORIZONS.map((horizon) => ({
    horizon,
    recommendations: (recs ?? [])
      .filter((r) => r.horizon === horizon)
      .sort((a, b) => (impactRank[a.impact] ?? 9) - (impactRank[b.impact] ?? 9)),
  }));
}

/** المؤشرات مجمّعة بمجموعاتها مع إحصاء القابل للقياس اليوم. */
export function kpiGroups(kpis) {
  const order = [];
  const byGroup = new Map();
  for (const k of kpis ?? []) {
    if (!byGroup.has(k.group)) {
      byGroup.set(k.group, []);
      order.push(k.group);
    }
    byGroup.get(k.group).push(k);
  }
  return order.map((group) => {
    const items = byGroup.get(group);
    return { group, kpis: items, measurableNow: items.filter((k) => k.measurableToday).length };
  });
}

/** الأسئلة مجمّعة بإداراتها — لعرضها تبويبًا في الدراسة وطباعتها لاجتماع بعينه. */
export function questionsByDepartment(questions) {
  const order = [];
  const byDept = new Map();
  for (const q of questions ?? []) {
    if (!byDept.has(q.department)) {
      byDept.set(q.department, []);
      order.push(q.department);
    }
    byDept.get(q.department).push(q);
  }
  return order.map((department) => ({ department, questions: byDept.get(department) }));
}

/** عدّادات حالات الممارسات — بطاقات الملخص التنفيذي. */
export function practiceCounts(practices) {
  const counts = { 'مطبَّق': 0, 'جزئي': 0, 'غائب': 0 };
  for (const p of practices ?? []) {
    if (counts[p.ourStatus] !== undefined) counts[p.ourStatus] += 1;
  }
  return counts;
}

/** متوسط درجات النضج مقرَّبًا لمنزلة واحدة — 0 عند غياب الأبعاد. */
export function maturityAverage(scores) {
  const dims = scores?.dimensions ?? [];
  if (dims.length === 0) return 0;
  const sum = dims.reduce((acc, d) => acc + (typeof d.score === 'number' ? d.score : 0), 0);
  return Math.round((sum / dims.length) * 10) / 10;
}

/** أرقام الملخص التنفيذي دفعةً واحدة — تُحسب من الدراسة لا تُكتب يدويًّا. */
export function executiveSummary(study) {
  const gaps = study?.gaps ?? [];
  return {
    gapsTotal: gaps.length,
    gapsCritical: gaps.filter((g) => g.severity === 'حرجة' || g.severity === 'عالية').length,
    kpisTotal: (study?.kpis ?? []).length,
    kpisMeasurable: (study?.kpis ?? []).filter((k) => k.measurableToday).length,
    risksHigh: riskMatrix(study?.risks)['مرتفع'].length,
    questionsTotal: (study?.questions ?? []).length,
    recsQuickWins: (study?.recommendations ?? []).filter((r) => r.horizon === 'مكسب سريع').length,
    recsTotal: (study?.recommendations ?? []).length,
    practices: practiceCounts(study?.practices),
    maturity: maturityAverage(study?.scores),
  };
}
