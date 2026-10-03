/**
 * محرّكُ القواعد المُهيَّأ — **أوزانٌ تُعدَّل بلا كوميت، بنسخةٍ وتاريخ.**
 * منطقٌ خالصٌ بلا Firebase وبلا ساعة.
 *
 * ‹WMS-601› · الفجوة و-٧: أوزانُ التسكين (`putawaySuggest.WEIGHTS`) والأولويّة
 * (`priority.WEIGHTS`) والإسناد (`assignEngine.WEIGHTS`) **ثوابتُ
 * `Object.freeze` في الشيفرة.** فمديرُ مستودعٍ أراد أن يُقدّم «تجميعَ الصنف»
 * على «الرفّ الفارغ» يحتاج: طلبًا ⟶ كوميتًا ⟶ مراجعةً ⟶ بناءً ⟶ نشرًا. وهو
 * في منهج Configuration First الذي قارنّا به **تعديلُ خانةٍ**.
 *
 * ★★★ والأهمُّ أنّ **وزنًا واحدًا لا يصلح لمستودعين**: مستودعٌ ضيّقٌ مزدحمٌ
 * يُقدّم السعةَ على القرب، ومستودعٌ واسعٌ قليلُ الأصناف يُقدّم القرب. فثابتٌ
 * واحدٌ في الشيفرة يعني أنّ أحدَ المستودعين يعمل بأوزانٍ خطأً دائمًا.
 *
 * ═══ ستُّ قواعدَ تحكم هذا الملفّ ═══
 *
 * ① ★★★ **غيابُ التهيئة يُعيد الثوابتَ المعلنةَ حرفًا.** والحارسُ يقارن
 *    المُعاد بثوابت المحرّكات **مفتاحًا مفتاحًا** — فلا نسخةٌ ثانيةٌ تنحرف
 *    عن الأولى بترقيةٍ. وهذا نمطُ `itemShape` ↔ `excelSchema` نفسُه: عقدان
 *    في موضعين يفترقان يومًا، **إلّا أن يُقارنا باختبار**.
 *
 * ② **العامُّ أساسٌ يُورَّث والمستودعُ يدهَس جزئيًّا.** تهيئةُ مستودعٍ تحمل
 *    ما بُدِّل وحدَه؛ ولو حملت الكلَّ لصار كلُّ ترقيةٍ تُضيف وزنًا جديدًا
 *    **لا يصل أيَّ مستودعٍ هُيِّئ** — ويبقى معطَّلًا بصمت.
 *
 * ③ **مفتاحٌ مجهولٌ يُرفض.** `distnce` بخطئها الإملائيّ تُكتب فلا تعمل، ولا
 *    رسالةَ — فيُقال «التهيئةُ لا تعمل» والشيفرةُ سليمة.
 *
 * ④ **تهيئةٌ تُعطّل المحرّك تُرفض.** أوزانٌ كلُّها صفرٌ تجعل المرشّحين
 *    متساوين، فيبدو الترتيبُ عشوائيًّا ولا يُشخَّص سببُه أبدًا.
 *
 * ⑤ **كلُّ تعديلٍ بنسخةٍ ومن عدّل ومتى وما كان قبله.** تهيئةٌ بلا تاريخٍ لا
 *    تُراجَع: تتبدّل النتائجُ بين شهرٍ وشهرٍ ولا يُعرف لماذا.
 *
 * ⑥ **لا ساعةَ تُقرأ** — `at` يُمرَّر.
 */

import { WEIGHTS as PUTAWAY_WEIGHTS } from '../locations/putawaySuggest.js';
import { WEIGHTS as PRIORITY_WEIGHTS } from '../tasks/priority.js';
import { WEIGHTS as ASSIGN_WEIGHTS } from '../tasks/assignEngine.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const up = (v) => String(v ?? '').trim().toUpperCase();
const txt = (v) => String(v ?? '').trim();

/** سقفُ سجلّ التعديلات — كسقف `PRINT_LOG_CAP` حرفًا: الأحدثُ يبقى. */
export const HISTORY_CAP = 50;

/**
 * مجموعاتُ القواعد الثلاث — **والثوابتُ تُستورَد من محرّكاتها لا تُنسَخ**
 * (القاعدة ①). فمن أضاف وزنًا في محرّكٍ وجده هنا في اللحظة نفسِها.
 */
export const RULE_SETS = Object.freeze({
  putaway: {
    id: 'putaway',
    labelAr: 'أوزان التسكين',
    hint: 'ترتيبُ مرشَّحي الرفوف عند التخزين — التجميعُ والسعةُ والبُعد.',
    engine: 'src/services/locations/putawaySuggest.js',
    defaults: PUTAWAY_WEIGHTS,
    // ★ `distance` سالبٌ بالتصميم (عقوبةٌ على البُعد) — فلا تُردّ السوالبُ
    // جملةً، ويُقاس كلُّ مفتاحٍ بإشارة أصله.
    sumTo: null,
  },
  priority: {
    id: 'priority',
    labelAr: 'أوزان أولويّة المهامّ',
    hint: 'ترتيبُ طابور العمل — المهلةُ والعمرُ وأهمّيّةُ الطلب والحجم.',
    engine: 'src/services/tasks/priority.js',
    defaults: PRIORITY_WEIGHTS,
    sumTo: 100,
  },
  assign: {
    id: 'assign',
    labelAr: 'أوزان إسناد المهامّ',
    hint: 'ترتيبُ مرشَّحي العمّال — الموضعُ والمهارةُ والحملُ والإنتاجيّة.',
    engine: 'src/services/tasks/assignEngine.js',
    defaults: ASSIGN_WEIGHTS,
    sumTo: 100,
  },
});

/** معرّفاتُ المجموعات — للتكرار في الشاشات والاختبارات. */
export const RULE_SET_IDS = Object.freeze(Object.keys(RULE_SETS));

/** المجموعةُ بمعرّفها — أو `null` لمجهول. */
export function ruleSet(setId) {
  return RULE_SETS[txt(setId)] || null;
}

/**
 * الثوابتُ المعلنةُ لمجموعةٍ — **نسخةٌ قابلةٌ للتعديل** لا الكائنُ المجمَّد،
 * فمن عدّلها لا يُفسد المحرّك.
 */
export function defaultsOf(setId) {
  const set = ruleSet(setId);
  return set ? { ...set.defaults } : null;
}

/**
 * يتحقّق من رقعةِ أوزانٍ قبل كتابتها.
 *
 * @param {string} setId
 * @param {object} patch المفاتيحُ المُبدَّلةُ وحدها
 * @returns {{ok:boolean, problems:string[], clean:object}}
 */
export function validateWeights(setId, patch) {
  const set = ruleSet(setId);
  if (!set) return { ok: false, problems: [`مجموعةُ قواعدَ مجهولة «${setId}» — المسموح: ${RULE_SET_IDS.join(' · ')}.`], clean: {} };

  const problems = [];
  const clean = {};
  const entries = Object.entries(patch || {});
  if (!entries.length) problems.push('رقعةٌ فارغة — لا شيء يُكتب.');

  for (const [key, raw] of entries) {
    // ③ مفتاحٌ مجهولٌ يُرفض بسببه — ولا يُكتب فيُظنّ عاملًا.
    if (!Object.hasOwn(set.defaults, key)) {
      problems.push(`المفتاح «${key}» ليس وزنًا في «${set.labelAr}» — المعرَّفة: ${Object.keys(set.defaults).join(' · ')}.`);
      continue;
    }
    const value = num(raw);
    if (value === null) {
      problems.push(`وزنُ «${key}» ليس رقمًا («${raw}»).`);
      continue;
    }
    // ★ الإشارةُ تُقاس بأصلها: وزنٌ أصلُه موجبٌ لا يُقلب سالبًا بالخطأ —
    // فقلبُه يعكس المعنى كلَّه (تُفضَّل الرفوفُ الممتلئةُ مثلًا) ولا يُشخَّص.
    const def = Number(set.defaults[key]);
    if (def >= 0 && value < 0) {
      problems.push(`وزنُ «${key}» موجبٌ بالتصميم (${def}) — والسالبُ يعكس المعنى. اجعله صفرًا لتعطيله.`);
      continue;
    }
    if (def < 0 && value > 0) {
      problems.push(`وزنُ «${key}» سالبٌ بالتصميم (${def}) — والموجبُ يعكس المعنى (يُفضّل البعيدَ).`);
      continue;
    }
    if (Math.abs(value) > 1000) {
      problems.push(`وزنُ «${key}» (${value}) خارجُ المدى المعقول — الحدُّ ألف.`);
      continue;
    }
    clean[key] = value;
  }

  // ④ تهيئةٌ تُعطّل المحرّك تُرفض.
  if (!problems.length) {
    const merged = { ...set.defaults, ...clean };
    const live = Object.values(merged).filter((v) => Number(v) !== 0).length;
    if (!live) problems.push('كلُّ الأوزان صفرٌ — محرّكٌ بلا وزنٍ يُرتّب عشوائيًّا ولا يُشخَّص سببُه.');
  }

  return { ok: problems.length === 0, problems, clean };
}

/**
 * الأوزانُ الفعليّةُ لمستودعٍ — **العامُّ أساسٌ والمستودعُ يدهَس جزئيًّا**.
 *
 * @param {string} setId
 * @param {object|null} profile ملفُّ التهيئة المخزَّن
 * @param {{warehouse?:string}} [opts]
 * @returns {{weights:object, source:'default'|'global'|'warehouse', overrides:string[],
 *            version:number, warehouse:string, set:object}}
 */
export function resolveWeights(setId, profile, { warehouse } = {}) {
  const set = ruleSet(setId);
  if (!set) return { weights: {}, source: 'default', overrides: [], version: 0, warehouse: '', set: null };

  // ① غيابُ التهيئةِ يُعيد الثوابتَ حرفًا.
  const base = { ...set.defaults };
  const globalPatch = cleanPatchOf(setId, profile?.sets?.[setId]?.global);
  const wh = up(warehouse);
  const whPatch = wh ? cleanPatchOf(setId, profile?.sets?.[setId]?.warehouses?.[wh]) : {};

  const weights = { ...base, ...globalPatch, ...whPatch };
  const overrides = [...new Set([...Object.keys(globalPatch), ...Object.keys(whPatch)])];
  const source = Object.keys(whPatch).length ? 'warehouse' : Object.keys(globalPatch).length ? 'global' : 'default';

  return {
    weights,
    source,
    overrides,
    version: Math.max(0, num(profile?.sets?.[setId]?.version) || 0),
    warehouse: wh,
    set,
  };
}

/**
 * ★★ الرقعةُ المخزَّنةُ تُصفّى عند **القراءة** أيضًا لا عند الكتابة وحدها.
 *
 * ولماذا؟ لأنّ الكتابةَ قد تكون من يدٍ أخرى: المالكُ يعدّل المستندَ من
 * Firebase Console، أو ترقيةٌ أسقطت وزنًا كان معرَّفًا. فمفتاحٌ مجهولٌ في
 * المخزَّن يُتخطّى بصمتٍ ولا يُسقط التهيئةَ كلَّها — **حارسٌ يُسقط كلَّ
 * التهيئة لمفتاحٍ واحدٍ قديمٍ يُعيد المستودعَ إلى الثوابت فجأةً** وهو أسوأ
 * من تجاهل مفتاح.
 */
function cleanPatchOf(setId, stored) {
  const set = ruleSet(setId);
  if (!set || !stored || typeof stored !== 'object') return {};
  const out = {};
  for (const [key, raw] of Object.entries(stored)) {
    if (!Object.hasOwn(set.defaults, key)) continue;
    const value = num(raw);
    if (value === null) continue;
    const def = Number(set.defaults[key]);
    if ((def >= 0 && value < 0) || (def < 0 && value > 0)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * يُطبّق تعديلًا على ملفّ التهيئة — ويُعيد **ملفًّا جديدًا** وقيدَ تدقيق.
 *
 * @param {object|null} profile الملفُّ الحاليّ
 * @param {object} change `{setId, warehouse, patch, actor, actorName, at, reason}`
 * @returns {{ok:boolean, problem:string, problems:string[], profile:object|null, entry:object|null}}
 */
export function applyChange(profile, { setId, warehouse = '', patch, actor, actorName = '', at, reason } = {}) {
  const fail = (problem, problems = []) => ({ ok: false, problem, problems, profile: null, entry: null });

  const set = ruleSet(setId);
  if (!set) return fail(`مجموعةُ قواعدَ مجهولة «${setId}».`);
  if (!txt(actor)) return fail('تعديلٌ بلا فاعلٍ لا يُكتب — تهيئةٌ بلا صاحبٍ لا تُراجَع.');
  // ⑤ السببُ إلزاميّ: تعديلُ وزنٍ يقلب ترتيبَ المستودع كلِّه، وبلا سببٍ لا
  // يُعرف بعد شهرٍ لماذا صار الترتيبُ هكذا.
  if (!txt(reason)) return fail('سببُ التعديل إلزاميّ — وزنٌ يُبدَّل يقلب ترتيبَ المستودع كلِّه.');

  const check = validateWeights(setId, patch);
  if (!check.ok) return fail(check.problems[0], check.problems);

  const wh = up(warehouse);
  const sets = { ...(profile?.sets || {}) };
  const current = sets[setId] || { global: {}, warehouses: {}, version: 0, history: [] };
  const before = wh ? { ...(current.warehouses?.[wh] || {}) } : { ...(current.global || {}) };
  const after = { ...before, ...check.clean };

  const nextSet = {
    ...current,
    version: Math.max(0, num(current.version) || 0) + 1,
    global: wh ? { ...(current.global || {}) } : after,
    warehouses: wh ? { ...(current.warehouses || {}), [wh]: after } : { ...(current.warehouses || {}) },
  };

  const entry = {
    setId,
    setLabel: set.labelAr,
    scope: wh || 'GLOBAL',
    version: nextSet.version,
    // ⑤ ما كان قبله — وإلّا فالسجلُّ يقول «بُدِّل» ولا يقول «من أيّ شيء».
    before,
    after,
    changed: Object.keys(check.clean),
    reason: txt(reason),
    by: txt(actor),
    byName: txt(actorName),
    at: Number.isFinite(at) ? at : null,
  };

  nextSet.history = [entry, ...(Array.isArray(current.history) ? current.history : [])].slice(0, HISTORY_CAP);

  return {
    ok: true,
    problem: '',
    problems: [],
    profile: { ...(profile || {}), sets: { ...sets, [setId]: nextSet } },
    entry,
  };
}

/**
 * يُعيد مجموعةً إلى ثوابتها — **حذفُ تجاوزٍ لا كتابةُ أصفار.**
 *
 * ★★ والفرقُ جوهريّ: كتابةُ الثوابت قيمةً تُجمّدها، فترقيةٌ تُحسّن وزنًا لا
 * تبلغ هذا المستودعَ أبدًا — ويبقى يعمل بأوزان العام الماضي بلا أن يعلم أحد.
 */
export function resetScope(profile, { setId, warehouse = '', actor, actorName = '', at, reason } = {}) {
  const set = ruleSet(setId);
  if (!set) return { ok: false, problem: `مجموعةُ قواعدَ مجهولة «${setId}».`, profile: null, entry: null };
  if (!txt(actor)) return { ok: false, problem: 'إعادةٌ بلا فاعلٍ لا تُكتب.', profile: null, entry: null };
  if (!txt(reason)) return { ok: false, problem: 'سببُ الإعادة إلزاميّ.', profile: null, entry: null };

  const wh = up(warehouse);
  const sets = { ...(profile?.sets || {}) };
  const current = sets[setId] || { global: {}, warehouses: {}, version: 0, history: [] };
  const before = wh ? { ...(current.warehouses?.[wh] || {}) } : { ...(current.global || {}) };
  if (!Object.keys(before).length) {
    return { ok: false, problem: 'لا تجاوزَ على هذا النطاق — هو على الثوابت أصلًا.', profile: null, entry: null };
  }

  const warehouses = { ...(current.warehouses || {}) };
  if (wh) delete warehouses[wh];

  const nextSet = {
    ...current,
    version: Math.max(0, num(current.version) || 0) + 1,
    global: wh ? { ...(current.global || {}) } : {},
    warehouses,
  };
  const entry = {
    setId,
    setLabel: set.labelAr,
    scope: wh || 'GLOBAL',
    version: nextSet.version,
    before,
    after: {},
    changed: Object.keys(before),
    reset: true,
    reason: txt(reason),
    by: txt(actor),
    byName: txt(actorName),
    at: Number.isFinite(at) ? at : null,
  };
  nextSet.history = [entry, ...(Array.isArray(current.history) ? current.history : [])].slice(0, HISTORY_CAP);

  return { ok: true, problem: '', profile: { ...(profile || {}), sets: { ...sets, [setId]: nextSet } }, entry };
}

/** سجلُّ تعديلاتِ مجموعةٍ — الأحدثُ أوّلًا. */
export function changeLog(profile, setId) {
  const history = profile?.sets?.[txt(setId)]?.history;
  return Array.isArray(history) ? history : [];
}

/**
 * المستودعاتُ التي لها تهيئةٌ خاصّة — كي تُعرض في الشاشة ولا تُكتشَف بالمفاجأة.
 */
export function tunedWarehouses(profile, setId) {
  const map = profile?.sets?.[txt(setId)]?.warehouses || {};
  return Object.keys(map).filter((wh) => Object.keys(cleanPatchOf(setId, map[wh])).length);
}

/**
 * لقطةٌ للعرض — ما هو الوزنُ الآن، وما أصلُه، وهل بُدِّل.
 */
export function weightsView(setId, profile, { warehouse } = {}) {
  const resolved = resolveWeights(setId, profile, { warehouse });
  if (!resolved.set) return null;
  const rows = Object.keys(resolved.set.defaults).map((key) => ({
    key,
    value: resolved.weights[key],
    original: resolved.set.defaults[key],
    overridden: resolved.overrides.includes(key),
  }));
  const sum = rows.reduce((s, r) => s + Number(r.value || 0), 0);
  return {
    ...resolved,
    rows,
    sum: Math.round(sum * 100) / 100,
    // ★ المجموعُ يُقال ولا يُفرض: مجموعةٌ عقدُها مئةٌ تُنبّه إن خرجت عنها،
    // **ولا تُردّ** — فالمالكُ قد يقصد مقياسًا آخر، والمنعُ يُوقف عملًا.
    sumNote:
      resolved.set.sumTo && Math.round(sum) !== resolved.set.sumTo
        ? `مجموعُ الأوزان ${Math.round(sum * 100) / 100} وعقدُ هذه المجموعة ${resolved.set.sumTo} — الدرجةُ لن تُقرأ نسبةً.`
        : '',
  };
}
