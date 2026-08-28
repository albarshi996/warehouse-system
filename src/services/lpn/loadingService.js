/**
 * خدمة التحميل — من منطقة التجهيز إلى شاحنةٍ تخرج. تنقل ولا تقرّر.
 *
 * ═══ الجلسةُ تُشتقّ ولا تُخزَّن ═══
 * أخطرُ ما في التحميل أن تُفقد الجلسةُ في منتصفها: الشاحنةُ تُحمَّل على مدى
 * دقائق، وهاتفٌ يُغلق يعني عدًّا يبدأ من الصفر. والحلُّ ليس مجموعةً جديدةً
 * تنتظر نشرَ قاعدة (درس LPN-O06/O07) بل **الاشتقاق**:
 *
 *   · المتوقَّع = الطبالي في `STAGED` التي تحمل وجهةَ هذه الرحلة.
 *   · المحمَّل  = الطبالي التي بلغت `LOADED` بهذه الوجهة — **والانتقالُ نفسه
 *                هو السجلّ**، لا قائمةٌ ثانيةٌ يمكن أن تفترق عنه.
 *   · الزائد   = محمَّلٌ ليس في المتوقَّع، يُحسب لا يُخزَّن.
 *
 * فتُبنى الجلسةُ من جديدٍ في كلّ فتحةٍ وتكون صادقةً دائمًا، ويستأنف عاملٌ
 * آخرُ من جهازٍ آخر بلا نقلِ شيء.
 *
 * ═══ القاعدتان ٧ و٨ ═══
 * الحكمُ كلُّه في `stagingLoading` الخالصة: لا تُحمَّل طبليةٌ خارج الرحلة،
 * ولا تُحمَّل مرّتين. والإغلاقُ الناقصُ يحتاج صلاحيةً وسببًا مكتوبًا.
 */
import { appendUnitEvent, listUnitsByState, transitionUnit } from './lpnService.js';
import {
  applyExtra,
  applyLoad,
  closeLoading,
  loadScanVerdict,
  loadingCloseProblem,
  loadingCounters,
  openLoading,
} from './stagingLoading.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

/** وجهةُ الطبلية — المسارُ أوّلًا ثمّ الفرع، مطبَّعةً. */
export function routeOf(unit) {
  return up(unit?.route || unit?.branch);
}

/** الوجهاتُ التي عليها حمولةٌ الآن — قائمةُ اختيارٍ للمحمِّل. */
export async function listRoutes({ max = 200 } = {}) {
  const groups = await Promise.all(['STAGED', 'LOADING', 'LOADED'].map((s) => listUnitsByState(s, max)));
  const units = groups.flat();
  const byRoute = new Map();
  for (const u of units) {
    const r = routeOf(u) || '—';
    const e = byRoute.get(r) ?? { route: r, staged: 0, loaded: 0 };
    if (u.state === 'STAGED') e.staged += 1; else e.loaded += 1;
    byRoute.set(r, e);
  }
  return {
    routes: [...byRoute.values()].sort((a, b) => (b.staged + b.loaded) - (a.staged + a.loaded)),
    units,
    capped: groups.some((g) => g.length >= max),
  };
}

/**
 * بناءُ جلسة تحميلٍ لوجهةٍ من الحالة الحيّة — لا قراءةَ من مخزَّن.
 *
 * @returns {{session:object, units:object[]}|{problem:string}}
 */
export function buildSession(units, route, { vehicle = '', driver = '', actor, at } = {}) {
  const want = up(route);
  const mine = (units ?? []).filter((u) => routeOf(u) === want);
  const expected = mine.filter((u) => ['STAGED', 'LOADING', 'LOADED'].includes(u.state)).map((u) => u.code);

  const opened = openLoading({
    // ★ الرحلةُ هنا **هي الوجهة**: منطقةُ التجهيز رُبطت بها في LPN-309،
    // فلا يُخترع معرّفُ رحلةٍ ثانٍ يفترق عن الذي يعرفه العامل.
    tripId: want,
    expected,
    vehicle,
    driver,
    actor,
    at,
  });
  if (opened.problem) return { problem: opened.problem };

  // المحمَّلُ يُستأنف من الحالة نفسها — فجلسةٌ ضاعت تعود كما كانت.
  let session = opened.session;
  for (const u of mine) {
    if (['LOADING', 'LOADED'].includes(u.state)) session = applyLoad(session, u.code);
  }
  return { session, units: mine };
}

/** العدّادُ اللحظيّ — يُمرَّر كما هو من المنطق الخالص. */
export { loadingCounters, loadingCloseProblem };

/**
 * مسحُ طبليةٍ عند التحميل — الحكمُ ثمّ الإثبات.
 *
 * @returns {Promise<{session:object}|{problem:string, kind?:string}>}
 */
export async function scanLoad(session, code, unit, { actor, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const verdict = loadScanVerdict(session, code, unit);
  if (!verdict.ok) return { problem: verdict.message, kind: verdict.kind };

  // الدورةُ صارمة: STAGED → LOADING → LOADED. والخطوتان معًا هنا لأنّ
  // المسحةَ الواحدة تعني «صعدت الشاحنة» — لا حالةَ وسطى يراها العامل.
  if (unit?.state === 'STAGED') {
    await transitionUnit(unit.code, 'LOADING', { actor, at, doc: unit.sourceDoc ?? null });
  }
  if (unit?.state !== 'LOADED') {
    await transitionUnit(unit.code, 'LOADED', { actor, at, doc: unit?.sourceDoc ?? null });
  }
  return { session: applyLoad(session, code) };
}

/**
 * طبليةٌ زائدةٌ تُحمَّل **بقرارٍ وسبب** — تُسجَّل صراحةً ولا تُبتلع.
 */
export async function scanExtra(session, code, unit, { reason, actor, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const applied = applyExtra(session, code, { reason, actor });
  if (applied.problem) return { problem: applied.problem };

  await appendUnitEvent(
    code,
    {
      type: 'EXCEPTION',
      actor,
      at,
      reason: String(reason).trim(),
      details: { kind: 'EXTRA_LOAD', trip: session?.tripId ?? '' },
    },
    { id: `EXTRA__${session?.tripId ?? ''}__${code}` }
  );
  if (unit && unit.state !== 'LOADED') {
    if (unit.state === 'STAGED') await transitionUnit(code, 'LOADING', { actor, at, doc: unit.sourceDoc ?? null });
    await transitionUnit(code, 'LOADED', { actor, at, doc: unit?.sourceDoc ?? null });
  }
  return { session: applied.session };
}

/**
 * إغلاقُ التحميل واعتمادُ الخروج — والختمُ يُقيَّد على كلّ طبليةٍ حُمّلت.
 *
 * ★ ولماذا على كلّ طبليةٍ لا في سجلٍّ واحد؟ لأنّ سؤالَ الوجهة يومَ الوصول
 * هو «هذه الطبلية: بأيّ ختمٍ خرجت؟» — وجوابُه في سجلّها هي، لا في وثيقةٍ
 * قد لا تصل معها.
 */
export async function closeLoad(session, { seal = '', override = false, overrideNote = '', actor, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const closed = closeLoading(session, { actor, at, seal, override, overrideNote });
  if (closed.problem) return { problem: closed.problem };

  for (const lpn of closed.session.loaded ?? []) {
    await appendUnitEvent(
      lpn,
      {
        type: 'LOADED_OUT',
        actor,
        at,
        details: {
          trip: closed.session.tripId ?? '',
          seal: closed.session.seal ?? '',
          vehicle: closed.session.vehicle ?? '',
          ...(override ? { override: true, overrideNote: String(overrideNote).trim() } : {}),
        },
      },
      { id: `OUT__${closed.session.tripId ?? ''}__${lpn}` }
    );
  }
  return { session: closed.session };
}
