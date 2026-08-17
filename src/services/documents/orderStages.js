/**
 * سلسلة حالات الطلب ‹EXE-502› — مرحلةٌ بزمنٍ متوقّع وفعليّ. منطق خالص.
 *
 * ═══ العطب (ت‑١١) ═══
 * حالة الطلب اليوم **كلمةٌ عامّة**: «معتمَد» أو «منجَز». و`documentLineProgress`
 * يقيس تقدّم البند كمّيًّا فيقول «نُفّذ ٩٧ من ١٢٠» — ولا يقول **أين وقف**:
 * أفي التخصيص أم في السحب أم ينتظر شاحنةً على الباب. فالمشرف الذي يُسأل «أين
 * طلب الفرع؟» يفتح ثلاث شاشاتٍ ليجمع الجواب بنفسه.
 *
 * ═══ ما هذا الملفّ ═══
 * **جمعٌ لثلاث نوًى قائمة في سلسلةٍ زمنيّة**، لا محرّكٌ رابع:
 *   · `documentLineProgress.js` — كمّيّة السطر المطلوبة (`sourceLineQuantity`)
 *   · `chain.js`                — `OUTBOUND_CHAIN`: SO ← PICK ← PACK ← DN ← GP
 *   · `states.js`               — `canDeriveFrom` و`executionStatus`: أيّ حالةٍ
 *                                  تُعدّ إنجازًا، وكم بقي مفتوحًا
 * ويُضاف إليها الميدانُ بالإحالة: `taskProgress` من `laborModel` و`RELEASE_STATE`
 * من `priority.js` — بلا نسخِ سطرٍ من أيٍّ منها.
 *
 * ═══ ثلاث قواعد ═══
 *
 * ١. **المرحلة تُشتقّ ولا تُكتب.** لا حقلَ `stage` يُحفظ على الطلب. والسبب هو
 *    سبب `executionStatus` نفسه (states.js:166): الحقل المخزَّن يتقادم لحظةَ
 *    يُنشأ مستندٌ لاحق، ثمّ يتعارض مع الروابط ولا يُعرف أيّهما الصادق. أمّا
 *    المشتقّ فلا يملك تاريخًا خاصًّا به فلا يكذب.
 *
 * ٢. **«متوقّع» يُعلَن أساسَه.** الزمن المعياريّ لم يُبنَ بعد (ت٧)، فالمتوقّع
 *    اليوم **توزيعٌ معلَنٌ لمهلة الشحن** على المراحل بأنصبةٍ مبدئيّة في مصدرٍ
 *    واحد — ويحمل `expectedBasis: 'deadline-share'` كي لا يُقرأ تقديرٌ كأنّه
 *    مقيس. ومتى جاء ت٧ بدقائقه مُرّرت في `standardMinutes` فانقلب الأساس إلى
 *    `'standard'` بلا تغيير شكل المخرج ولا الشاشة.
 *
 * ٣. **ما لم يُبنَ يُعلَن ولا يُدَّعى.** «يحتاج تعبئة» مرحلةٌ حقيقيّة يكشفها
 *    نقصُ السحب، والتعبئة الداخليّة نفسها لم تُبنَ (ت٩ · EXE-903). فتقول
 *    المرحلة نقصَها وتتوقّف صراحةً، ولا تُعرض «منجَزة» ولا تُحذف من السلسلة.
 *
 * والوقت **يُمرَّر** (`nowMs`) ولا يُقرأ.
 */

import { ROLES } from '../auth/roles.js';
import { sourceLineQuantity } from '../documentLineProgress.js';
import { taskProgress } from '../labor/laborModel.js';
import { documentDeadline, remainingFrom, toMillis } from '../tasks/dueTime.js';
import { RELEASE_STATE } from '../tasks/priority.js';
import { OUTBOUND_CHAIN } from './chain.js';
import { getSchema } from './schemas/index.js';
import { canDeriveFrom, executionStatus } from './states.js';

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();
const num = (v) => Math.max(0, Number(v) || 0);
const round = (v) => Math.round((Number(v) + Number.EPSILON) * 1e9) / 1e9;

const HOUR = 3600000;

/** بعدها تُوصف المرحلة الجارية بأنّها متوقّفة — ساعاتٌ بلا حركة. */
export const STALL_HOURS = 6;

/**
 * حالات المرحلة في الزمن — **غير** حالة الامتلاء الكمّيّ.
 * الأولى تقول «أين نحن»، والثانية (`executionStatus`) تقول «كم منها تمّ».
 * وخلطُهما في حقلٍ واحد يُخفي مرحلةً بدأت وتوقّفت عند ٩٠٪.
 */
export const STAGE_FLOW = Object.freeze({
  waiting: { id: 'waiting', label: 'لم تبدأ' },
  active: { id: 'active', label: 'جارية' },
  stalled: { id: 'stalled', label: 'متوقّفة' },
  done: { id: 'done', label: 'تمّت' },
  skipped: { id: 'skipped', label: 'لا تنطبق' },
});

/**
 * ما يُعدّ إنجازًا في حالة المستند — بالإحالة إلى `states.js` لا بجدولٍ ثانٍ.
 *   `exists`   — وُجد المستند (ولو مسودّة): البضاعة صار لها ورقة
 *   `approved` — بلغ الاعتماد (`canDeriveFrom`): صار يصلح أبًا لما بعده
 *   `done`     — بلغ الإنجاز أو أُغلق: رُحّل أثره المخزنيّ
 */
function stateQualifies(requires, state) {
  const id = s(state);
  if (requires === 'done') return id === 'done' || id === 'closed';
  if (requires === 'approved') return canDeriveFrom(id);
  return id !== 'canceled' && Boolean(id);
}

/**
 * المراحل التسع.
 *
 * `docType` كلّه من `OUTBOUND_CHAIN` — ولا نوعَ خارجها (يحرسه الاختبار). و`share`
 * نصيب المرحلة من مهلة الشحن، ومجموعها ١٠٠ كي يُقرأ المتوقّع نسبةً لا رقمًا.
 * أنصبةٌ **مبدئيّة معلَنة** في مصدرٍ واحد (نمط `WEIGHTS` في محرّك الأولويّة)،
 * تُضبط بالتجربة أو يُلغيها الزمنُ المعياريّ حين يأتي.
 *
 * ولماذا حقل كمّيّةٍ صريحٌ لكلّ مرحلة ولا يُؤخذ من `targetLineQuantity`؟ لأنّ
 * ذاك يجيب سؤالًا آخر: «كم نفّذ هذا الابن من أبيه» — فيُقدّم `qtyPicked` على
 * `qtyRequested`. ولو أُخذ هنا لَتقلّص «خُصّص» كلّما تقدّم السحب: أمرُ سحبٍ
 * خُصّص فيه مئةٌ وسُحب منه عشرون يصير مخصَّصُه عشرين — وهو عكسُ الحقيقة.
 */
export const ORDER_STAGES = Object.freeze([
  { id: 'new', label: 'جديد', docType: 'SO', qtyField: 'qty', requires: 'approved', share: 5 },
  { id: 'allocated', label: 'خُصّص', docType: 'PICK', qtyField: 'qtyRequested', requires: 'exists', share: 10 },
  { id: 'replenish', label: 'يحتاج تعبئة', docType: null, share: 10, conditional: true, ownerRole: 'storekeeper' },
  { id: 'released', label: 'أُطلقت المهامّ', docType: null, share: 5, fromRelease: true, ownerRole: 'labor_supervisor' },
  { id: 'pick', label: 'سحب', docType: 'PICK', qtyField: 'qtyPicked', requires: 'exists', work: 'pick', share: 30 },
  { id: 'pack', label: 'تعبئة', docType: 'PACK', qtyField: 'qty', requires: 'exists', share: 15 },
  { id: 'stage', label: 'تجهيز', docType: 'DN', qtyField: 'qty', requires: 'approved', share: 10 },
  { id: 'load', label: 'تحميل', docType: 'DN', qtyField: 'qty', requires: 'done', work: 'delivery', share: 10 },
  { id: 'ship', label: 'شُحن', docType: 'GP', qtyField: 'qty', requires: 'done', share: 5 },
]);

/** الطلب رأسُ السلسلة — أوّل `OUTBOUND_CHAIN` لا اسمٌ مكتوبٌ ثانيةً. */
export const ORDER_TYPE = OUTBOUND_CHAIN[0];

/* ═══════════════ جمع المادّة ═══════════════ */

/**
 * أحفاد الطلب — لا أبناؤه وحدهم.
 *
 * الاشتقاق يورّث `links` تراكميًّا (chain.js:424)، فالحفيد يحمل رقم جدّه.
 * ولذلك يُلتقط PACK وDN وGP بسطرٍ واحد بلا تسلّقٍ حلقةً حلقة — ومن تسلّق
 * فقَدَ السلسلةَ كلَّها عند أوّل حلقةٍ مفقودة.
 */
export function descendantsOf(order, documents = []) {
  const id = s(order?.id);
  const type = up(order?.type);
  const number = up(order?.number);
  const byType = new Map();
  for (const doc of documents || []) {
    if (!doc || s(doc.id) === id) continue;
    const link = doc.links?.[type];
    const linked = (id && s(link?.id) === id) || (number && up(link?.number) === number);
    if (!linked) continue;
    const key = up(doc.type);
    if (byType.has(key)) byType.get(key).push(doc);
    else byType.set(key, [doc]);
  }
  return byType;
}

/** مجموع حقلٍ كمّيٍّ في مستنداتٍ استوفت حالتُها الشرط. */
function docQuantity(docs, qtyField, requires) {
  let total = 0;
  for (const doc of docs || []) {
    if (!stateQualifies(requires, doc?.state)) continue;
    for (const line of doc.lines || []) total += num(line?.[qtyField]);
  }
  return round(total);
}

/** أوّل لحظةٍ في قائمة — الفارغُ لا يُزاحم. */
function earliest(values) {
  const list = (values || []).map(toMillis).filter((v) => Number.isFinite(v));
  return list.length ? Math.min(...list) : null;
}

/** آخر لحظةٍ — تُستعمل لـ«آخر حركة» في كشف التوقّف. */
function latest(values) {
  const list = (values || []).map(toMillis).filter((v) => Number.isFinite(v));
  return list.length ? Math.max(...list) : null;
}

/**
 * لحظة بلوغ المستند حالةً بعينها — من سجلّ التدقيق الملحق-فقط إن توفّر.
 *
 * ★ ولماذا لا يكفي `updatedAt`؟ لأنّه **آخر تعديل** لا لحظةَ الإنجاز: تعليقٌ
 * يُضاف بعد الشحن بيومين يدفع «الفعليّ» يومين إلى الأمام. فيُقرأ `audit` أوّلًا
 * (`{action, to, at, byName}`) ويُعلَن الاحتياط حين يُقرأ `updatedAt`.
 */
function reachedAt(doc, requires, auditByDoc = {}) {
  const entries = auditByDoc?.[s(doc?.id)] || [];
  // مراتب البحث: أقوى نقلةٍ تُثبت اكتمال المرحلة أوّلًا، ثمّ ما دونها. ولا
  // يُقفز إلى الإنشاء إلّا حين لا نقلةَ أصلًا — فلحظةُ فتح الورقة ليست لحظةَ
  // إتمام العمل عليها.
  const ladder = requires === 'done'
    ? [['done', 'closed']]
    : requires === 'approved'
      ? [['approved'], ['done', 'closed']]
      : [['done', 'closed'], ['approved']];

  for (const wanted of ladder) {
    const hit = entries.find((e) => wanted.includes(s(e?.to)));
    if (hit) return { ms: toMillis(hit.at), source: 'audit', by: s(hit.byName), role: s(hit.byRole) };
  }
  const created = requires === 'exists' ? entries.find((e) => s(e?.action) === 'create') : null;
  if (created) return { ms: toMillis(created.at), source: 'audit', by: s(created.byName), role: s(created.byRole) };

  const ms = toMillis(doc?.updatedAt) ?? toMillis(doc?.createdAt);
  return { ms, source: ms === null ? '' : 'updatedAt', by: s(doc?.approvedByName || doc?.createdByName), role: s(doc?.approvedByRole) };
}

/** مهامّ الميدان التي تخصّ مستندات هذه المرحلة. */
function laborFor(work, docs, laborTasks = []) {
  if (!work) return [];
  const numbers = new Set((docs || []).map((d) => up(d?.number)).filter(Boolean));
  return (laborTasks || []).filter((t) => {
    if (s(t?.orderType || t?.workType) !== work) return false;
    const ref = up(t?.docRef?.number);
    return ref ? numbers.has(ref) : false;
  });
}

/* ═══════════════ المتوقّع ═══════════════ */

/**
 * يوزّع مهلة الشحن على المراحل المنطبقة.
 *
 * الأنصبة تُطبَّع على المنطبق وحده: مرحلةٌ لا تنطبق (لا نقص ⇒ لا تعبئة) لا
 * تحجز نصيبًا من النافذة فتُقصّر ما بعدها بلا سبب.
 */
function backSchedule(stages, { startMs, deadlineMs }) {
  const applicable = stages.filter((st) => st.flow !== STAGE_FLOW.skipped.id);
  const total = applicable.reduce((sum, st) => sum + st.share, 0);
  if (!Number.isFinite(startMs) || !Number.isFinite(deadlineMs) || deadlineMs <= startMs || !total) return;

  const window = deadlineMs - startMs;
  let cumulative = 0;
  for (const st of stages) {
    if (st.flow === STAGE_FLOW.skipped.id) continue;
    cumulative += st.share;
    st.expectedAt = Math.round(startMs + (window * cumulative) / total);
    st.expectedBasis = 'deadline-share';
    st.expectedHint = 'تقديرٌ موزَّعٌ على مهلة الشحن — لا زمنٌ معياريّ مقيس (ينتظر ت٧).';
  }
}

/** الزمن المعياريّ حين يأتي: دقائق لكلّ مرحلة تُجمع من بدايتها لا من المهلة. */
function forwardSchedule(stages, { startMs, standardMinutes }) {
  let cursor = Number.isFinite(startMs) ? startMs : null;
  for (const st of stages) {
    if (st.flow === STAGE_FLOW.skipped.id) continue;
    const minutes = Number(standardMinutes?.[st.id]);
    if (!Number.isFinite(minutes) || minutes < 0) continue;
    const from = Number.isFinite(st.startedAt) ? st.startedAt : cursor;
    if (!Number.isFinite(from)) continue;
    st.expectedAt = Math.round(from + minutes * 60000);
    st.expectedBasis = 'standard';
    st.expectedHint = '';
    cursor = st.expectedAt;
  }
}

/* ═══════════════ السلسلة ═══════════════ */

/**
 * سلسلة مراحل الطلب.
 *
 * @param {object} order أمر البيع (رأسٌ وبنودٌ وحالة)
 * @param {object} [ctx]
 * @param {Array}  [ctx.documents]  المستندات المرتبطة (أبناءٌ وأحفاد)
 * @param {Array}  [ctx.tasks]      بطاقات الإسناد — منها `releaseState`
 * @param {Array}  [ctx.laborTasks] سجلّات التنفيذ الميدانيّ (بنودٌ وأزمنة)
 * @param {Array}  [ctx.shortages]  نقص السحب من مصنع المهامّ
 * @param {Array}  [ctx.exceptions] استثناءاتٌ مفتوحة على مستندات الطلب
 * @param {object} [ctx.audit]      `{ [docId]: [{action,to,at,byName,byRole}] }`
 * @param {object} [ctx.standardMinutes] دقائق معياريّة لكلّ مرحلة (ت٧)
 * @param {number} [ctx.stallHours] ساعات السكون قبل وصف المرحلة بالتوقّف
 * @param {number} [ctx.nowMs]      الوقت يُمرَّر ولا يُقرأ
 * @returns {{stages:Array, current:object|null, required:number, deadline:object, problem:string}}
 */
export function orderStageChain(order, ctx = {}) {
  const {
    documents = [],
    tasks = [],
    laborTasks = [],
    shortages = [],
    exceptions = [],
    audit = {},
    standardMinutes = null,
    stallHours = STALL_HOURS,
    nowMs,
  } = ctx;

  const empty = { stages: [], current: null, required: 0, deadline: null, problem: '' };
  if (!order?.id && !order?.number) return { ...empty, problem: 'لا طلبَ — السلسلة تبدأ من مستندٍ له هويّة.' };
  if (up(order?.type) !== ORDER_TYPE) {
    return { ...empty, problem: `سلسلة الطلب تبدأ من «${ORDER_TYPE}» لا من «${up(order?.type) || '—'}».` };
  }

  const byType = descendantsOf(order, documents);
  const required = round((order.lines || []).reduce((sum, l) => sum + sourceLineQuantity(ORDER_TYPE, l), 0));
  const orderStart = toMillis(order.createdAt);
  const deadline = documentDeadline(order);

  // النقص: من مصنع المهامّ صراحةً، أو من أسطرٍ وُسمت `shortfall` في الميدان.
  const fieldShortfall = (laborTasks || [])
    .flatMap((t) => t?.lines || [])
    .filter((l) => l?.shortfall)
    .map((l) => ({ sku: s(l.sku), nameAr: s(l.nameAr), qty: num(l.qtyRequired) }));
  const allShortages = [...(shortages || []), ...fieldShortfall].filter((x) => num(x?.qty) > 0);
  const shortQty = round(allShortages.reduce((sum, x) => sum + num(x.qty), 0));

  const openExceptions = (exceptions || []).filter((e) => s(e?.docRef?.number));

  const stages = ORDER_STAGES.map((def) => {
    const docs = def.docType === ORDER_TYPE ? [order] : byType.get(def.docType) || [];
    const live = docs.filter((d) => s(d?.state) !== 'canceled');
    const labor = laborFor(def.work, live, laborTasks);
    const laborSum = labor.length ? taskProgress(labor.flatMap((t) => t.lines || [])) : null;

    // ── الكمّيّات الثلاث ──────────────────────────────────────────────
    // الميدان يقول **الجاري** والمستند يقول **المثبَّت**: فما لم يُرحَّل بعد
    // يُقرأ من المهمّة، وما رُحّل يُقرأ من المستند. ورقمان لحقيقةٍ واحدة بلا
    // قاعدةٍ تحكم أيّهما يُعرض هو الطريق إلى شاشتين تتناقضان.
    let done = 0;
    let basis = '';
    if (def.fromRelease) {
      const released = (tasks || []).filter((t) => s(t?.releaseState) === RELEASE_STATE.RELEASED);
      const ids = new Set(released.map((t) => s(t.laborTaskId)).filter(Boolean));
      const releasedLabor = (laborTasks || []).filter((t) => ids.has(s(t.id)));
      done = releasedLabor.length ? round(taskProgress(releasedLabor.flatMap((t) => t.lines || [])).totalRequired) : 0;
      basis = released.length ? 'release' : '';
    } else if (def.conditional) {
      done = 0;
      basis = 'shortage';
    } else {
      const posted = live.some((d) => stateQualifies('done', d?.state));
      const fromDoc = docQuantity(live, def.qtyField, def.requires);
      if (labor.length && !posted) {
        done = round(laborSum.totalDone);
        basis = 'field';
      } else {
        done = fromDoc;
        basis = live.length ? 'document' : '';
      }
    }

    const stageRequired = def.conditional ? shortQty : required;
    const remaining = round(Math.max(0, stageRequired - done));

    // ── الزمن ────────────────────────────────────────────────────────
    const startedAt = def.docType === ORDER_TYPE
      ? orderStart
      : earliest([...live.map((d) => d.createdAt), ...labor.map((t) => t.startedAt)]);
    const movedAt = latest([...live.map((d) => d.updatedAt), ...labor.map((t) => t.finishedAt || t.startedAt)]);

    // مرحلةٌ بلا مستندٍ خاصٍّ بها (الإطلاق · التعبئة) تُحكم بكمّيّتها وحدها —
    // ولا تُطالَب بورقةٍ لا وجود لها فتبقى مفتوحةً إلى الأبد.
    const filled = stageRequired > 0 && done >= stageRequired;
    const satisfied = def.docType
      ? live.some((d) => stateQualifies(def.requires, d?.state)) && (stageRequired <= 0 || filled)
      : filled;
    const reached = satisfied && live.length ? reachedAt(live[live.length - 1], def.requires, audit) : null;
    const actualAt = satisfied ? (reached?.ms ?? movedAt) : null;

    // ── المسؤول: من المخطّط لا من جدولٍ ثانٍ ──────────────────────────
    const role = def.ownerRole || getSchema(def.docType)?.roles?.complete?.[0] || '';
    const owner = {
      role,
      roleLabel: ROLES[role]?.label || '',
      name: s(reached?.by) || s(labor[0]?.assigneeName || labor[0]?.crewName),
    };

    return {
      ...def,
      docs: live.map((d) => ({ id: s(d.id), type: up(d.type), number: s(d.number), state: s(d.state) })),
      required: stageRequired,
      done,
      remaining,
      basis,
      startedAt,
      movedAt,
      actualAt,
      expectedAt: null,
      expectedBasis: '',
      expectedHint: deadline.ms === null ? 'بلا مهلة شحنٍ معلنة — لا متوقّع يُقاس عليه.' : '',
      owner,
      satisfied,
      flow: '',
      stall: '',
      /** تمّت استدلالًا بمرحلةٍ بعدها لا بأثرٍ مباشر — يُعلَن ولا يُدسّ. */
      impliedBy: '',
      // امتلاء المرحلة كمّيًّا — بالإحالة إلى `executionStatus` لا بحسابٍ ثانٍ.
      // وحالةُ آخر مستنداتها هي المدخل: المغلق يقول «مغلقٌ قبل الاكتمال»
      // ولو بقيت كمّيّة، وما دونه يُحكم بالكمّيّات وحدها.
      execution: executionStatus(live.length ? s(live[live.length - 1].state) : 'approved', {
        capacity: stageRequired,
        executed: done,
      }),
      laborTasks: labor.map((t) => s(t.id)).filter(Boolean),
    };
  });

  // ── حال المرحلة في الزمن ───────────────────────────────────────────
  for (const st of stages) {
    if (st.conditional && shortQty <= 0) {
      st.flow = STAGE_FLOW.skipped.id;
      st.stall = '';
      continue;
    }
    if (st.satisfied) {
      st.flow = STAGE_FLOW.done.id;
      continue;
    }
    st.flow = Number.isFinite(st.startedAt) || st.done > 0 ? STAGE_FLOW.active.id : STAGE_FLOW.waiting.id;
  }

  // ★★ الأثرُ يشهد لما قبله — مرحلةٌ تلَتها مرحلةٌ تمّت لا تبقى مفتوحة.
  //
  // بلا هذه المرّة العكسيّة تصير كلّ شحنةٍ سابقة عالقةً في «أُطلقت المهامّ»
  // إلى الأبد، لأنّ سجلّ المهامّ نفسه لم يُولد إلّا في ت١ — فتقول اللوحة إنّ
  // مئة طلبٍ شُحنت واقفةٌ عند مرحلةٍ لم تكن موجودةً يوم شُحنت. والاستدلال
  // **يُعلَن** في `impliedBy` ولا يُدسّ: كمّيّاتها تبقى كما هي فلا يُختلق رقم.
  let witness = '';
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const st = stages[i];
    if (st.flow === STAGE_FLOW.skipped.id) continue;
    if (st.flow === STAGE_FLOW.done.id) {
      witness = st.label;
      continue;
    }
    if (!witness) continue;
    st.flow = STAGE_FLOW.done.id;
    st.impliedBy = witness;
  }

  // ── سبب التوقّف — يُقال أو لا يُدَّعى توقّف ────────────────────────
  for (const st of stages) {
    if (st.flow === STAGE_FLOW.done.id || st.flow === STAGE_FLOW.skipped.id) continue;
    st.stall = stallReason(st, {
      nowMs,
      stallHours,
      shortages: allShortages,
      shortQty,
      tasks,
      exceptions: openExceptions,
    });
    if (st.stall) st.flow = STAGE_FLOW.stalled.id;
  }

  // ── المتوقّع: توزيعُ المهلة أوّلًا، ثمّ يعلوه المعياريّ إن وُجد ────
  backSchedule(stages, { startMs: orderStart, deadlineMs: deadline.ms });
  if (standardMinutes) forwardSchedule(stages, { startMs: orderStart, standardMinutes });

  for (const st of stages) {
    st.variance = varianceOf(st, nowMs);
    st.late = st.variance !== null && st.variance > 0;
  }

  const current = stages.find((st) => st.flow !== STAGE_FLOW.done.id && st.flow !== STAGE_FLOW.skipped.id) || null;
  return {
    order: { id: s(order.id), number: s(order.number), state: s(order.state) },
    stages,
    current,
    required,
    deadline: { ...deadline, remaining: remainingFrom(deadline.ms, nowMs) },
    shipped: stages[stages.length - 1].flow === STAGE_FLOW.done.id,
    problem: '',
  };
}

/**
 * سبب توقّف المرحلة — نصٌّ أو فراغ.
 *
 * ★ والفراغ حكمٌ لا كسل: مرحلةٌ بدأت قبل ساعةٍ ليست متوقّفة، ووسمُها كذلك
 * يُغرق الشاشة بتوقّفاتٍ كاذبة حتى يُهمَل اللون الأحمر كلّه.
 */
export function stallReason(stage, { nowMs, stallHours = STALL_HOURS, shortages = [], shortQty = 0, tasks = [], exceptions = [] } = {}) {
  // ١ نقص الرصيد أوّلًا — وهو السبب الذي يُوقف ما بعده كلَّه.
  if (stage.conditional && shortQty > 0) {
    return `نقص رصيدٍ في موقع الالتقاط: ${shortQty} وحدة في ${shortages.length} بندًا — والتعبئة الداخليّة لم تُبنَ بعد (EXE-903).`;
  }

  // ٢ استثناءٌ مفتوح على أحد مستنداتها — سببٌ مسجَّلٌ بمالكٍ ورقم.
  const numbers = new Set((stage.docs || []).map((d) => up(d.number)).filter(Boolean));
  const hit = (exceptions || []).find((e) => numbers.has(up(e?.docRef?.number)));
  if (hit) return `استثناءٌ مفتوح ${s(hit.number) || ''}: ${s(hit.reason)}`.trim();

  // ٣ مهامّ حُسبت ولم تُطلق — قرار المشرف لا عطلُ نظام (ت-O01).
  if (stage.fromRelease) {
    const suggested = (tasks || []).filter((t) => s(t?.releaseState) === RELEASE_STATE.SUGGESTED).length;
    if (suggested > 0) return `${suggested} مهمّةً مقترحةً لم تُطلق بعد — الإطلاق قرارُ المشرف.`;
  }

  // ٤ بدأت ثمّ سكنت — ساعاتٌ بلا حركةٍ واحدة.
  if (!Number.isFinite(nowMs)) return '';
  const since = Number.isFinite(stage.movedAt) ? stage.movedAt : stage.startedAt;
  if (Number.isFinite(since) && stage.flow === STAGE_FLOW.active.id) {
    const idle = Math.floor((nowMs - since) / HOUR);
    if (idle >= stallHours) return `لم تتحرّك منذ ${idle} ساعة — آخر أثرٍ عليها قبل ذلك.`;
  }
  return '';
}

/**
 * فرق المرحلة عن متوقّعها بالميلي-ثانية — موجبٌ يعني تأخّرًا.
 * المنتهية تُقاس بفعليّها، والجارية تُقاس **بالآن**: مرحلةٌ فات موعدها ولم
 * تُنجَز متأخّرةٌ الآن لا حين تنتهي.
 */
export function varianceOf(stage, nowMs) {
  if (!Number.isFinite(stage?.expectedAt)) return null;
  if (stage.flow === STAGE_FLOW.skipped.id) return null;
  if (Number.isFinite(stage.actualAt)) return stage.actualAt - stage.expectedAt;
  // تمّت ولا لحظةَ لها (استُدلّ عليها): لا فرقَ يُقاس — ووسمُها متأخّرةً بالآن
  // يقلب شهادةَ الاستدلال إلى اتّهام.
  if (stage.flow === STAGE_FLOW.done.id) return null;
  if (!Number.isFinite(nowMs)) return null;
  // الجارية التي لم يفت موعدها بعد **لا فرقَ لها** — لا فرقٌ سالبٌ يوحي بتقدّمٍ
  // لم يقع: العمل لم ينتهِ أصلًا فلا يُقاس سبقُه.
  return nowMs > stage.expectedAt ? nowMs - stage.expectedAt : null;
}

/** ملخّصٌ لسطرٍ واحد في الشاشة — بلا إعادة حسابٍ في الواجهة. */
export function stageSummary(chain) {
  const stages = chain?.stages || [];
  const counted = stages.filter((st) => st.flow !== STAGE_FLOW.skipped.id);
  const done = counted.filter((st) => st.flow === STAGE_FLOW.done.id).length;
  const stalled = counted.filter((st) => st.flow === STAGE_FLOW.stalled.id);
  return {
    done,
    total: counted.length,
    pct: counted.length ? Math.round((done / counted.length) * 100) : 0,
    current: chain?.current?.label || '',
    stalled: stalled.length,
    late: counted.filter((st) => st.late).length,
    /** أوّل سببِ توقّفٍ — هو ما يُقرأ في السطر الواحد. */
    reason: stalled.length ? stalled[0].stall : '',
  };
}
