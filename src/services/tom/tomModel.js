/**
 * منطق الهيكل التشغيليّ المستهدف وخارطة التحوّل — خالص بلا Firestore وبلا DOM.
 *
 * الوثيقة طبقتا «التصميم» و«خارطة الطريق» من نموذج التشغيل المستهدف (TOM).
 * مصدراها:
 *   - `src/data/comparative-study.json` — التشخيص والتقييم: الفجوات ودرجات
 *     النضج والتوصيات (مُتحقَّق منه ضدّ الكود عبر حارس الدراسة studyVerdict).
 *   - `src/data/target-operating-model.json` — طبقة التصميم المؤلَّفة: الأبعاد
 *     المستهدفة، والهيكل مزدوج الأفق، وموجات التحوّل الثلاث بنوافذها الزمنية.
 *
 * 🔒 حارس الهيكل المستهدف `tomVerdict`: لا تصميمَ بلا سند. كل بُعد تصميم يربط
 * بُعدَ نضجٍ موجودًا وفجواتٍ موجودةً فعلًا، وكل موجةٍ تطابق أفقًا معتمدًا في
 * الدراسة، ولا توصيةَ بلا موجة تحتضنها. الاختبارات تُشغّل الحارس على الملفين
 * الحقيقيين، فأي انحرافٍ في الروابط يُسقط البناء قبل أن يصل الموقع الحيّ.
 *
 * ملاحظة الحوكمة: هذه طبقة عرضٍ للتصميم — لا رقم يُلفَّق هنا. كل الأرقام
 * (النضج، عدد الفجوات، التوصيات) تُقرأ من الدراسة المُتحقَّقة لا تُكتب يدويًّا.
 */

import { REC_HORIZONS, GAP_SEVERITIES, maturityAverage } from '../studies/studiesModel.js';

/** ترتيب أثر التوصية تنازليًّا — التحويليّ أوّلًا داخل كل موجة. */
const IMPACT_RANK = { 'تحويلي': 0, 'مرتفع': 1, 'متوسط': 2 };

/** نطاق درجة النضج: ضعيف (تدخّل الآن) < 2 · متوسط < 3.5 · متين خلافهما. */
export function maturityBand(score) {
  if (typeof score !== 'number') return 'غير مقيَّم';
  if (score < 2) return 'ضعيف';
  if (score < 3.5) return 'متوسط';
  return 'متين';
}

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;
const hasItems = (v, n) => Array.isArray(v) && v.length >= n;

/**
 * 🔒 حارس الهيكل المستهدف: يمنع نشر تصميمٍ بروابط مكسورة أو موجاتٍ ناقصة.
 *
 * حواجب: حقل تعريفيّ فارغ · بُعد تصميم يربط نضجًا أو فجوةً غير موجودة أو بلا
 * حالة حالية/مستهدفة · موجة بأفقٍ غير معتمد أو بلا نافذة/هدف · الآفاق الثلاثة
 * غير مغطّاة بموجاتٍ متفرّدة · ركيزة أساسٍ تربط نضجًا غير موجود · طبقة معماريّة
 * بلا محرّك أو بلا بنود · توصيةٌ في الدراسة بأفقٍ لا موجة له.
 * تنبيهات: فجوة لا يغطّيها أيّ بُعد تصميم · موجة بلا توصيات.
 */
export function tomVerdict(tom, study) {
  const blockers = [];
  const warnings = [];

  const scoreIds = new Set((study?.scores?.dimensions ?? []).map((d) => d.id));
  const gapIds = new Set((study?.gaps ?? []).map((g) => g.id));
  const recs = study?.recommendations ?? [];

  // ── الترويسة ──
  for (const f of ['title', 'refNumber', 'version', 'issued', 'purpose']) {
    if (!isFilled(tom?.meta?.[f])) blockers.push(`الترويسة تنقصها ${f}`);
  }

  // ── أبعاد التصميم ──
  const dims = tom?.designDimensions ?? [];
  if (!hasItems(dims, 1)) blockers.push('لا أبعاد تصميم إطلاقًا');
  const coveredGaps = new Set();
  for (const d of dims) {
    const label = d?.name || d?.id || '؟';
    for (const f of ['id', 'name', 'currentState', 'targetState']) {
      if (!isFilled(d?.[f])) blockers.push(`بُعد التصميم «${label}»: الحقل ${f} فارغ`);
    }
    if (!scoreIds.has(d?.linkedScoreId)) {
      blockers.push(`بُعد التصميم «${label}» يربط بُعد نضجٍ غير موجود: ${d?.linkedScoreId}`);
    }
    if (!hasItems(d?.linkedGapIds, 1)) {
      blockers.push(`بُعد التصميم «${label}» بلا فجوةٍ مربوطة`);
    }
    for (const gid of d?.linkedGapIds ?? []) {
      if (!gapIds.has(gid)) blockers.push(`بُعد التصميم «${label}» يربط فجوةً غير موجودة: ${gid}`);
      coveredGaps.add(gid);
    }
  }
  for (const g of study?.gaps ?? []) {
    if (!coveredGaps.has(g.id)) warnings.push(`فجوة «${g.title || g.id}» لا يغطّيها أيّ بُعد تصميم`);
  }

  // ── الموجات ──
  const waves = tom?.waves ?? [];
  const waveHorizons = waves.map((w) => w?.horizon);
  for (const w of waves) {
    const label = w?.id || w?.horizon || '؟';
    if (!REC_HORIZONS.includes(w?.horizon)) blockers.push(`الموجة «${label}» بأفقٍ غير معتمد: ${w?.horizon}`);
    for (const f of ['window', 'theme', 'goal']) {
      if (!isFilled(w?.[f])) blockers.push(`الموجة «${label}»: الحقل ${f} فارغ`);
    }
  }
  for (const h of REC_HORIZONS) {
    const count = waveHorizons.filter((x) => x === h).length;
    if (count === 0) blockers.push(`الأفق «${h}» بلا موجة`);
    if (count > 1) blockers.push(`الأفق «${h}» مكرَّر في ${count} موجات`);
  }
  // لا توصية بلا موجة تحتضنها.
  for (const r of recs) {
    if (!waveHorizons.includes(r.horizon)) {
      blockers.push(`توصية «${r.title || r.id}» بأفقٍ لا موجة له: ${r.horizon}`);
    }
  }

  // ── الهيكل مزدوج الأفق ──
  const arch = tom?.targetArchitecture ?? {};
  for (const [key, layer] of [['now', arch.now], ['destination', arch.destination], ['bridge', arch.bridge]]) {
    if (!layer) { blockers.push(`الهيكل المستهدف تنقصه طبقة ${key}`); continue; }
    if (!isFilled(layer.engine) && !isFilled(layer.label)) blockers.push(`طبقة ${key} بلا محرّك/عنوان`);
    if (!hasItems(layer.points, 1)) blockers.push(`طبقة ${key} بلا بنود`);
  }

  // ── الأساس المتين ──
  for (const p of tom?.foundation?.pillars ?? []) {
    if (!scoreIds.has(p?.linkedScoreId)) {
      blockers.push(`ركيزة الأساس «${p?.label || '؟'}» تربط نضجًا غير موجود: ${p?.linkedScoreId}`);
    }
  }

  return { ok: blockers.length === 0, blockers, warnings };
}

/**
 * لقطة النضج للطبقة الأولى («أين نحن»): كل بُعدٍ بنطاقه، مرتّبةً تصاعديًّا
 * بالدرجة (الأضعف أوّلًا = تدخّل الآن)، مع المتوسط وعدد أبعاد التدخّل العاجل.
 */
export function maturitySnapshot(study) {
  const dims = (study?.scores?.dimensions ?? [])
    .map((d) => ({ ...d, band: maturityBand(d.score) }))
    .sort((a, b) => a.score - b.score);
  return {
    dimensions: dims,
    average: maturityAverage(study?.scores),
    interveneNow: dims.filter((d) => d.band === 'ضعيف'),
    strong: dims.filter((d) => d.band === 'متين'),
  };
}

/**
 * مصفوفة التصميم: كل بُعدٍ مستهدفٍ موصولٌ ببُعد نضجه (الدرجة والنطاق) وبفجواته
 * المربوطة كاملةً (العنوان والخطورة) — جوهر طبقة «الهيكل المستهدف».
 */
export function designMatrix(tom, study) {
  const scoreById = new Map((study?.scores?.dimensions ?? []).map((d) => [d.id, d]));
  const gapById = new Map((study?.gaps ?? []).map((g) => [g.id, g]));
  return (tom?.designDimensions ?? []).map((d) => {
    const score = scoreById.get(d.linkedScoreId);
    const gaps = (d.linkedGapIds ?? [])
      .map((gid) => gapById.get(gid))
      .filter(Boolean)
      .sort((a, b) => GAP_SEVERITIES.indexOf(a.severity) - GAP_SEVERITIES.indexOf(b.severity));
    return {
      ...d,
      score: score?.score ?? null,
      band: maturityBand(score?.score),
      gaps,
    };
  });
}

/** ركائز الأساس المتين موصولةً بدرجات نضجها الحيّة — تُصان في التحوّل. */
export function foundationPillars(tom, study) {
  const scoreById = new Map((study?.scores?.dimensions ?? []).map((d) => [d.id, d]));
  return (tom?.foundation?.pillars ?? []).map((p) => ({
    ...p,
    score: scoreById.get(p.linkedScoreId)?.score ?? p.score ?? null,
  }));
}

/**
 * موجات التحوّل: كل موجةٍ محمّلةٌ بتوصياتها من الدراسة (بمطابقة الأفق) مرتّبةً
 * بالأثر (التحويليّ أوّلًا)، وكل توصيةٍ محمّلةٌ بفجواتها المربوطة (للخطورة).
 * هذا هو الربط لا الإضافة: التوصيات تبقى في الدراسة، والموجة تعطيها نافذةً زمنية.
 */
export function transformationWaves(tom, study) {
  const gapById = new Map((study?.gaps ?? []).map((g) => [g.id, g]));
  const recs = study?.recommendations ?? [];
  return (tom?.waves ?? []).map((w) => {
    const recommendations = recs
      .filter((r) => r.horizon === w.horizon)
      .map((r) => ({
        ...r,
        gaps: (r.linkedGapIds ?? []).map((gid) => gapById.get(gid)).filter(Boolean),
      }))
      .sort((a, b) => (IMPACT_RANK[a.impact] ?? 9) - (IMPACT_RANK[b.impact] ?? 9));
    return { ...w, recommendations };
  });
}

/** أرقام الملخّص التنفيذيّ — كلّها مشتقّة، لا رقم يُكتب يدويًّا. */
export function tomExecutiveSummary(tom, study) {
  const snapshot = maturitySnapshot(study);
  const gaps = study?.gaps ?? [];
  const recs = study?.recommendations ?? [];
  return {
    maturityNow: snapshot.average,
    dimensionsTotal: snapshot.dimensions.length,
    interveneNow: snapshot.interveneNow.length,
    strongPillars: snapshot.strong.length,
    gapsTotal: gaps.length,
    gapsCritical: gaps.filter((g) => g.severity === 'حرجة').length,
    designPillars: (tom?.designDimensions ?? []).length,
    waves: (tom?.waves ?? []).length,
    recsTotal: recs.length,
    quickWins: recs.filter((r) => r.horizon === 'مكسب سريع').length,
  };
}
