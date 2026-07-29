/**
 * منطق حزمة الاستعداد لمقابلة التقييم — خالص بلا Firestore وبلا DOM.
 *
 * مصادرها الثلاثة:
 *   - `src/data/interview-readiness.json` — الأجزاء المؤلَّفة (مسار العرض،
 *     الأسئلة والأجوبة، الاعتراضات، خارطة الأدلّة، الرؤية).
 *   - `src/data/comparative-study.json` — الأرقام الحرجة (النضج، الفجوات،
 *     التوصيات) تُشتقّ منه لا تُكتب يدويًّا.
 *   - `navCatalog.js` — مرجع الصفحات: كل رابط دليلٍ يجب أن يشير إلى صفحةٍ
 *     مسجَّلةٍ فعلًا، فلا يَعِد المدير بشاشةٍ لا وجود لها.
 *
 * 🔒 حارس الاستعداد `readinessVerdict`: لا ادّعاء بلا دليلٍ قابلٍ للعرض، ولا
 * اعتراضٍ بلا بُعد نضجٍ حقيقيٍّ وموجةٍ تُغلقه. يمنع الحزمة إن أشار أيّ رابطٍ إلى
 * صفحةٍ غير موجودة، أو ربط اعتراضٌ نضجًا/أفقًا مخترعًا. تُشغَّل الاختبارات على
 * الملفات الحقيقية فيسقط البناء قبل الموقع الحيّ.
 */

import { internalPaths } from '../auth/navCatalog.js';
import { REC_HORIZONS, maturityAverage } from '../studies/studiesModel.js';

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;
const hasItems = (v, n) => Array.isArray(v) && v.length >= n;

/** مجموعة مسارات الصفحات الداخلية — مرجع التحقّق من روابط الأدلّة. */
function pathSet() {
  return new Set(internalPaths());
}

/**
 * 🔒 حارس حزمة الاستعداد: يمنع أيّ رابطٍ يشير لصفحةٍ غير مسجَّلة، وأيّ اعتراضٍ
 * يربط نضجًا أو أفقًا غير موجود، وأيّ قسمٍ ناقصٍ أو حقلٍ فارغ.
 * تنبيه: بُعد نضجٍ ضعيف (< 2) لا يعالجه أيّ اعتراض.
 */
export function readinessVerdict(prep, study) {
  const blockers = [];
  const warnings = [];
  const paths = pathSet();
  const scoreIds = new Set((study?.scores?.dimensions ?? []).map((d) => d.id));

  const checkPage = (p, where) => {
    if (!isFilled(p)) blockers.push(`${where}: رابط الصفحة فارغ`);
    else if (!paths.has(p)) blockers.push(`${where}: صفحةٌ غير مسجَّلة في القائمة: ${p}`);
  };

  // ── الترويسة ──
  for (const f of ['title', 'refNumber', 'version', 'issued', 'purpose']) {
    if (!isFilled(prep?.meta?.[f])) blockers.push(`الترويسة تنقصها ${f}`);
  }

  // ── مسار العرض ──
  const stations = prep?.pitch?.stations ?? [];
  if (!hasItems(stations, 3)) blockers.push(`مسار العرض أقل من ثلاث محطّات (${stations.length})`);
  if (!isFilled(prep?.pitch?.opening)) blockers.push('مسار العرض بلا افتتاحية');
  if (!isFilled(prep?.pitch?.closing)) blockers.push('مسار العرض بلا خاتمة');
  for (const s of stations) {
    const label = s?.phase || s?.step || '؟';
    if (!isFilled(s?.phase)) blockers.push(`محطّة «${label}» بلا مرحلة`);
    if (!isFilled(s?.say)) blockers.push(`محطّة «${label}» بلا نصّ عرض`);
    checkPage(s?.page, `محطّة «${label}»`);
  }

  // ── الأسئلة والأجوبة ──
  const qa = prep?.qa ?? [];
  if (!hasItems(qa, 6)) blockers.push(`بنك الأسئلة أقل من ستّة (${qa.length})`);
  for (const q of qa) {
    const label = q?.id || q?.question || '؟';
    if (!isFilled(q?.question)) blockers.push(`سؤال «${label}» فارغ`);
    if (!isFilled(q?.answer)) blockers.push(`سؤال «${label}» بلا جواب نموذجيّ`);
    checkPage(q?.evidencePage, `سؤال «${label}»`);
  }

  // ── الاعتراضات ──
  const objections = prep?.objections ?? [];
  if (!hasItems(objections, 3)) blockers.push(`الاعتراضات أقل من ثلاثة (${objections.length})`);
  const addressedScores = new Set();
  for (const o of objections) {
    const label = o?.id || o?.objection || '؟';
    if (!isFilled(o?.objection)) blockers.push(`اعتراض «${label}» فارغ`);
    if (!isFilled(o?.rebuttal)) blockers.push(`اعتراض «${label}» بلا ردّ`);
    if (!scoreIds.has(o?.linkedScoreId)) blockers.push(`اعتراض «${label}» يربط بُعد نضجٍ غير موجود: ${o?.linkedScoreId}`);
    else addressedScores.add(o.linkedScoreId);
    if (!REC_HORIZONS.includes(o?.linkedWaveHorizon)) blockers.push(`اعتراض «${label}» يربط أفقًا غير معتمد: ${o?.linkedWaveHorizon}`);
    checkPage(o?.proofPage, `اعتراض «${label}»`);
  }
  for (const d of study?.scores?.dimensions ?? []) {
    if (typeof d.score === 'number' && d.score < 2 && !addressedScores.has(d.id)) {
      warnings.push(`بُعدٌ ضعيف «${d.nameAr || d.id}» (${d.score}) لا يعالجه أيّ اعتراض`);
    }
  }

  // ── خارطة الأدلّة ──
  const evidence = prep?.evidenceMap ?? [];
  if (!hasItems(evidence, 5)) blockers.push(`خارطة الأدلّة أقل من خمسة (${evidence.length})`);
  for (const e of evidence) {
    const label = e?.claim || '؟';
    if (!isFilled(e?.claim)) blockers.push('بند أدلّةٍ بلا ادّعاء');
    if (!isFilled(e?.whatToShow)) blockers.push(`بند «${label}» بلا وصفٍ لما يُعرَض`);
    checkPage(e?.page, `بند «${label}»`);
  }

  // ── الرؤية ──
  if (!isFilled(prep?.vision?.thirtySec)) blockers.push('بطاقة الرؤية بلا نصّ الثلاثين ثانية');
  if (!isFilled(prep?.vision?.closingLine)) blockers.push('بطاقة الرؤية بلا جملةٍ ختامية');

  return { ok: blockers.length === 0, blockers, warnings };
}

/**
 * الأرقام الحرجة للبطاقة الأولى — كلّها مشتقّةٌ من الدراسة، لا رقم يُكتب يدويًّا:
 * إحصاءات النظام الأربع، ومتوسط النضج، وأضعف بُعدين وأقواهما، وإحصاء الفجوات
 * والتوصيات والمؤشرات، وعدد الموجات.
 */
export function criticalNumbers(study, tom) {
  const dims = [...(study?.scores?.dimensions ?? [])].sort((a, b) => a.score - b.score);
  const gaps = study?.gaps ?? [];
  const recs = study?.recommendations ?? [];
  const kpis = study?.kpis ?? [];
  return {
    systemStats: study?.ourSystem?.stats ?? [],
    maturity: maturityAverage(study?.scores),
    dimensionsTotal: dims.length,
    weakest: dims.slice(0, 2),
    strongest: dims.slice(-2).reverse(),
    gapsTotal: gaps.length,
    gapsCritical: gaps.filter((g) => g.severity === 'حرجة').length,
    kpisTotal: kpis.length,
    kpisMeasurable: kpis.filter((k) => k.measurableToday).length,
    recsTotal: recs.length,
    quickWins: recs.filter((r) => r.horizon === 'مكسب سريع').length,
    waves: (tom?.waves ?? []).length,
  };
}

/**
 * الاعتراضات محلولةً: كل اعتراضٍ موصولٌ ببُعد نضجه (الاسم والدرجة) وبنافذة
 * الموجة التي تُغلقه — فيقرأ المدير الضعف وخطة إغلاقه في سطرٍ واحد.
 */
export function objectionsResolved(prep, study, tom) {
  const scoreById = new Map((study?.scores?.dimensions ?? []).map((d) => [d.id, d]));
  const waveByHorizon = new Map((tom?.waves ?? []).map((w) => [w.horizon, w]));
  return (prep?.objections ?? []).map((o) => {
    const score = scoreById.get(o.linkedScoreId);
    const wave = waveByHorizon.get(o.linkedWaveHorizon);
    return {
      ...o,
      dimensionName: score?.nameAr ?? o.linkedScoreId,
      dimensionScore: score?.score ?? null,
      waveWindow: wave?.window ?? null,
    };
  });
}

/** أرقام ملخّص الحزمة — مشتقّةٌ لعرضها في الترويسة. */
export function readinessSummary(prep) {
  return {
    pitchMinutes: prep?.pitch?.durationMin ?? null,
    stations: (prep?.pitch?.stations ?? []).length,
    questions: (prep?.qa ?? []).length,
    objections: (prep?.objections ?? []).length,
    evidence: (prep?.evidenceMap ?? []).length,
  };
}
