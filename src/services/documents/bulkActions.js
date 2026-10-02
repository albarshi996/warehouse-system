/**
 * الإجراءات الجماعيّة على المستندات — اعتمادٌ وإغلاقٌ وإلغاءٌ بضغطةٍ واحدة
 * (طلب المالك: «الاعتماد الجماعي · إغلاق المستندات الجماعي · تسهيل إجراءات
 * فحص الجودة» · 2026-10-02).
 *
 * ═══ ما يحلّه ═══
 * مفتّشُ الجودة يصل صباحًا فيجد ثلاثين استلامًا ينتظر اعتمادَه. فيفتح
 * المستند، ويقرأ، ويعتمد، ويعود للقائمة، ويفتح الثاني — ثلاثون مرّة. وأكثرُ
 * وقتِه يذهب في **التنقّل** لا في الفحص. وهذه الوحدة تُلغي التنقّل.
 *
 * ═══ ★★★ والقاعدةُ الحاكمة: الجماعيُّ لا يُنشئ سلطةً جديدة ═══
 * هذه أخطرُ وحدةٍ في الطلب كلِّه، لأنّ الإجراء الجماعيَّ مَزلقُ تجاوزِ
 * الحرّاس الطبيعيّ: من كتب حلقةً تكتب في Firestore مباشرةً اعتمد ثلاثين
 * مستندًا **بلا** حارسِ الأثر المخزنيّ، وبلا حارسِ FEFO، وبلا حارسِ
 * السلسلة، وبلا سجلِّ تدقيقٍ لكلِّ واحد — وكلُّها في `transitionDocument`.
 *
 * فالعقدُ هنا صريح: **لا كتابةَ في هذه الوحدة ولا في مُنفِّذها إلّا عبر
 * `transitionDocument` مستندًا مستندًا.** الجماعيُّ **حلقةٌ على الفرديّ**
 * لا طريقٌ ثانٍ إليه. وما يُرفض فرديًّا يُرفض جماعيًّا بنفس الرسالة، وما
 * يُسجَّل فرديًّا يُسجَّل جماعيًّا بنفس القيد.
 *
 * وهذا الملفُّ **خالصٌ**: يخطّط ولا ينفّذ (بلا Firestore وبلا DOM). التنفيذ
 * في `bulkActionsService.js` — والفصلُ مقصود: الخطّةُ تُعرَض على المستخدم
 * قبل أن يقع شيء، فيرى ماذا سيُعتمد وماذا سيُستبعد **ولماذا**.
 */

import { TRANSITIONS, canDo, getState, isLegalTransition } from './states.js';
import { getSchema } from './schemas/index.js';

const text = (v) => String(v ?? '').trim();

/**
 * سقفُ الدفعة الواحدة.
 *
 * ★★ ليس حدًّا تقنيًّا بل **ميزانيّةَ حصّة**: كلُّ نقلةٍ تقرأ المستند، وبعضُها
 * يقرأ أباه وأرصدةَ الدفتر وكشفَ الطرف. فخمسون مستندًا قد تعني مئاتَ
 * القراءات في ضغطةٍ واحدة — والخطّةُ المجانيّة Spark سقفُها خمسون ألف
 * قراءةٍ يوميًّا. ودرسُ المرآة محفوظ: «كلَّ دقيقتين» صارت تسعةَ أضعاف
 * الحصّة. فالسقفُ يُعلَن ويُفرَض، ولا يُكتشف بانقطاع الخدمة ظهرًا.
 */
export const MAX_BULK = 50;

/**
 * الإجراءاتُ الجماعيّة المتاحة — كلٌّ يُترجم إلى نقلةٍ قائمةٍ في
 * `TRANSITIONS`، فلا إجراءَ هنا بلا نقلةٍ تحكمه هناك.
 *
 * ولا `submit` جماعيًّا: الإرسالُ للاعتماد فعلُ **مؤلِّفٍ** يقرأ ما كتبه قبل
 * أن يُرسله، لا فعلَ قائمة. وإرسالُ ثلاثين مسودّةً بضغطةٍ هو ما يُغرق
 * المعتمِدين — فالتيسيرُ هنا يكون في الجهة الخطأ.
 */
export const BULK_ACTIONS = Object.freeze([
  {
    id: 'approve',
    label: 'اعتماد المحدَّد',
    to: 'approved',
    from: ['submitted'],
    icon: 'checkCircle',
    tone: 'primary',
    needsNote: false,
    /** وصفٌ يُقرأ قبل الضغط — لا بعده. */
    hint: 'يعتمد كلَّ مستندٍ محدَّدٍ ينتظر اعتمادك. كلُّ مستندٍ يُسجَّل في سجلّ تدقيقه باسمك.',
  },
  {
    id: 'reject',
    label: 'رفض المحدَّد',
    to: 'rejected',
    from: ['submitted'],
    icon: 'x',
    tone: 'danger',
    needsNote: true,
    hint: 'يُعيد المستندات إلى أصحابها مرفوضةً — بسببٍ مكتوبٍ واحدٍ يُسجَّل على كلٍّ منها.',
  },
  {
    id: 'complete',
    label: 'إنهاء المحدَّد',
    to: 'done',
    from: ['approved'],
    icon: 'flag',
    tone: 'primary',
    needsNote: false,
    hint: 'يُنهي المعتمَد ويُرحّل أثره المخزنيّ. ما تعذّر قيدُه يبقى معتمَدًا ويُسمّى سببُه.',
  },
  {
    id: 'close',
    label: 'إغلاق المحدَّد',
    to: 'closed',
    from: ['approved', 'done'],
    icon: 'lock',
    tone: 'secondary',
    needsNote: true,
    hint: 'يُغلق المستندات التي لن يُنفَّذ متبقّيها — تبقى صحيحةً وتخرج من صندوق العمل المفتوح.',
  },
  {
    id: 'cancel',
    label: 'إلغاء المحدَّد',
    to: 'canceled',
    from: ['draft', 'rejected', 'approved'],
    icon: 'ban',
    tone: 'danger',
    needsNote: true,
    hint: 'يُبطل المستندات ويُبقيها في السجلّ — ولا يحذفها. والمنجَزُ لا يُلغى (أثرُه مُرحَّل).',
  },
]);

/** إجراءٌ بمعرّفه، أو `null`. */
export function bulkActionFor(id) {
  return BULK_ACTIONS.find((a) => a.id === id) || null;
}

/* ═══════════════ أسبابُ الاستبعاد ═══════════════ */

/**
 * لماذا لا يقبل هذا المستندُ هذا الإجراء؟ — `null` إن قَبِله.
 *
 * ★★ والرسالةُ **تُسمّي المستند وسببَه**، ولا تُجمَع في «٣ مستنداتٍ لم
 * تُعتمد». درسُ الجرد محفوظ: صفٌّ فاسدٌ واحدٌ كان يُسقط الدفعةَ كلَّها حتى
 * صار يُعزل ويُسمّى. ومن قرأ «٣ لم تُعتمد» لا يعرف أيَّها ولا يستطيع
 * إصلاحَ شيء.
 */
export function rejectionFor(docData, action, user, schema) {
  if (!action) return 'إجراءٌ غير معروف.';
  if (!docData) return 'المستند غير موجود.';

  const from = text(docData.state);
  const state = getState(from);

  if (!action.from.includes(from)) {
    return `حالته «${state.label}» — وهذا الإجراء لا يقع إلّا على: ${action.from.map((s) => getState(s).label).join(' · ')}.`;
  }
  // الحارسُ الثاني يسأل الجدولَ نفسَه لا قائمةَ `from` أعلاه: لو افترقا يومًا
  // فالجدولُ هو الحاكم (نفسُ ما تفرضه `transitionDocument` والقواعد).
  if (!isLegalTransition(from, action.to)) {
    return `نقلةٌ غير مسموحة: من «${state.label}» إلى «${getState(action.to).label}».`;
  }

  const transition = (TRANSITIONS[from] || []).find((t) => t.to === action.to);
  if (!transition) return `لا نقلةَ من «${state.label}» بهذا الإجراء.`;

  const sc = schema || getSchema(docData.type);
  if (!canDo(transition, user, sc, docData)) {
    return 'لا تملك صلاحية هذا الإجراء على هذا المستند.';
  }

  return null;
}

/* ═══════════════ الخطّة ═══════════════ */

/**
 * خطّةُ تنفيذٍ تُعرَض **قبل** أن يقع شيء.
 *
 * @param {object[]} docs المستنداتُ المحدَّدة (بـ`id`)
 * @param {string} actionId
 * @param {{role:string, uid:string}} user
 * @param {{note?:string, schemas?:Record<string,object>, max?:number}} [opts]
 * @returns {{
 *   action: object|null,
 *   eligible: object[],
 *   blocked: {doc:object, reason:string}[],
 *   deferred: object[],
 *   noteRequired: boolean,
 *   noteMissing: boolean,
 *   canRun: boolean,
 *   summary: string,
 * }}
 */
export function planBulk(docs, actionId, user, opts = {}) {
  const action = bulkActionFor(actionId);
  const note = text(opts.note);
  const max = Number.isFinite(opts.max) ? opts.max : MAX_BULK;
  const list = (docs || []).filter(Boolean);

  const eligible = [];
  const blocked = [];
  for (const d of list) {
    const reason = rejectionFor(d, action, user, opts.schemas?.[d?.type]);
    if (reason) blocked.push({ doc: d, reason });
    else eligible.push(d);
  }

  // ما تجاوز السقفَ لا يُرفض بل **يُؤخَّر**: يُنفَّذ الخمسون الأولى ويبقى
  // الباقي محدَّدًا لدفعةٍ ثانية. والرفضُ هنا كان سيجبر المستخدمَ على
  // التحديد يدويًّا خمسين فخمسين — وهو ما جاء الجماعيُّ ليُلغيه.
  const runnable = eligible.slice(0, max);
  const deferred = eligible.slice(max);

  const noteRequired = Boolean(action?.needsNote) && runnable.length > 0;
  const noteMissing = noteRequired && !note;

  return {
    action,
    eligible: runnable,
    blocked,
    deferred,
    noteRequired,
    noteMissing,
    canRun: Boolean(action) && runnable.length > 0 && !noteMissing,
    summary: planSummary({ action, eligible: runnable, blocked, deferred, noteMissing }),
  };
}

/** سطرُ الخطّة العربيّ — ما سيقع وما لن يقع، بأرقامٍ لاتينيّة (R2). */
export function planSummary({ action, eligible, blocked, deferred, noteMissing }) {
  if (!action) return 'إجراءٌ غير معروف.';
  const parts = [];
  if (eligible.length) parts.push(`${eligible.length} مستندًا سيُنفَّذ عليها «${action.label}»`);
  else parts.push('لا مستندَ مؤهَّلًا في التحديد');
  if (blocked.length) parts.push(`${blocked.length} مستبعَدًا (مسمّىً بسببه أدناه)`);
  if (deferred.length) parts.push(`${deferred.length} مؤخَّرًا إلى دفعةٍ ثانية — سقفُ الدفعة ${MAX_BULK}`);
  if (noteMissing) parts.push('اكتب السببَ أوّلًا — هذا الإجراء لا يقع بلا سبب');
  return parts.join(' · ');
}

/**
 * يجمع المستبعَدَ بسببه — فتُعرض ثلاثةُ أسبابٍ لا ثلاثون سطرًا.
 * وكلُّ سببٍ يحمل **أرقامَ مستنداته** كي يُصلَح، لا عددَها وحده.
 */
export function groupBlocked(blocked) {
  const map = new Map();
  for (const { doc, reason } of blocked || []) {
    const row = map.get(reason) || { reason, count: 0, numbers: [] };
    row.count += 1;
    row.numbers.push(text(doc?.number) || 'مسودّة');
    map.set(reason, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ═══════════════ نتيجةُ التنفيذ ═══════════════ */

/**
 * يلخّص نتيجةَ تنفيذٍ وقع فعلًا.
 *
 * ★★★ والفشلُ الجزئيُّ هو **الحالةُ الغالبة** لا الاستثناء: ثلاثون استلامًا
 * فيها واحدٌ بندُه بلا كمّيّة، فيُنجَز تسعةٌ وعشرون ويسقط واحد. ومن أبلغه
 * النظامُ «تمّ» كذب عليه، ومن أبلغه «فشل» كذب عليه أيضًا. فالصدقُ عددان
 * **واسمُ كلِّ ساقطٍ وسببُه**.
 *
 * @param {{doc:object, ok:boolean, error?:string}[]} outcomes
 */
export function summarizeRun(outcomes) {
  const list = outcomes || [];
  const done = list.filter((o) => o.ok);
  const failed = list.filter((o) => !o.ok);
  return {
    total: list.length,
    doneCount: done.length,
    failedCount: failed.length,
    failures: failed.map((o) => ({
      number: text(o.doc?.number) || 'مسودّة',
      type: text(o.doc?.type),
      reason: text(o.error) || 'سببٌ غير مُبلَّغ',
    })),
    // `partial` تعني: لا تُغلق النافذةَ ولا تمسح التحديد — ثمّة ما يُصلَح.
    partial: done.length > 0 && failed.length > 0,
    message:
      list.length === 0
        ? 'لم يُنفَّذ شيء.'
        : failed.length === 0
          ? `تمّ على ${done.length} مستندًا.`
          : done.length === 0
            ? `لم يُنفَّذ أيٌّ من ${list.length} — راجع الأسباب أدناه.`
            : `تمّ على ${done.length}، وسقط ${failed.length} — راجع الأسباب أدناه.`,
  };
}

/* ═══════════════ طابورُ الجودة ═══════════════ */

/**
 * أنواعُ المستندات التي **فحصُ الجودة** بوّابتُها.
 *
 * ★★ تُشتقّ من المخطّطات لا تُكتب قائمةً: نوعٌ يُضاف غدًا ويُسنَد اعتمادُه
 * لمفتّش الجودة يظهر في طابوره **بلا تعديل حرفٍ هنا**. والقائمةُ المكتوبة
 * تنحرف — وهي العلّةُ التي أوقعت `startGroups` من قبل.
 */
export function qcGovernedTypes(schemas) {
  return Object.values(schemas || {})
    .filter((s) => (s?.roles?.approve || []).includes('qc_inspector'))
    .map((s) => s.type)
    .filter(Boolean)
    .sort();
}

/**
 * طابورُ الجودة: ما ينتظر فحصَ **هذا** المفتّش من المستندات المعروضة.
 *
 * والمديرُ يراه أيضًا (هو معتمِدٌ أعلى في كلّ مخطّطات الجودة) — فلا يتعطّل
 * الفحصُ بغياب المفتّش، وهو ما يقع فعلًا في مستودعٍ يعمل بوردِيّتين.
 */
export function qcQueue(docs, user, schemas) {
  const types = new Set(qcGovernedTypes(schemas));
  if (!types.size) return [];
  return (docs || []).filter((d) => {
    if (d?.state !== 'submitted' || !types.has(d?.type)) return false;
    const sc = schemas?.[d.type];
    const transition = (TRANSITIONS.submitted || []).find((t) => t.to === 'approved');
    return canDo(transition, user, sc, d);
  });
}
