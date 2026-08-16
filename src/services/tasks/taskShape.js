/**
 * لغة المهام المُسنَدة السحابيّة — الحالات والأولويّات والانتقالات المسموحة.
 *
 * مصدرٌ واحد يستعمله: الخدمة (`tasksCloudService`) والواجهة (البطاقات/الخيط)
 * وقواعد Firestore (تُكرّر أسماء الحالات نصًّا — عدّلهما معًا كنمط المستندات).
 *
 * فلسفة التنفيذ (آلية التنفيذ): المُسنَد إليه يدفع المهمة للأمام فقط عبر مسارٍ
 * أحاديّ الاتجاه، والمدير وحده يُعيدها للخلف (فتح/إلغاء/إعادة إسناد).
 *
 * ═══ الحمولة الميدانيّة ‹EXE-101› ═══
 * كانت هذه البطاقة تعرف **من ومتى وبأيّ أولويّة** ولا تعرف **من أيّ رفٍّ إلى
 * أيّ رفّ**؛ ومهمّة المناولة (`labor_tasks`) تعرف الميدان والزمن ولا تحمل
 * أولويّةً ولا موعدًا. نصفان لعملٍ واحد. فأُضيفت هنا **الحمولة** وحدها —
 * ولم يُخلق كيانٌ ثالث، ولم تُمسّ الحالات (قواعد Firestore تكرّرها نصًّا).
 *
 * وما كان محسوبًا هناك يبقى هناك: الكمّيّات الثلاث تُقرأ من `lineProgress`
 * في `laborModel.js` **بالإحالة لا بالنسخ** — وإلّا صار للتقدّم حاسبان
 * يفترقان أوّل تعديل.
 */
import { ORDER_TYPES, lineProgress, taskProgress } from '../labor/laborModel.js';

/** الحالات بترتيب دورة الحياة. `canceled` خارج المسار (إنهاءٌ إداريّ لا محو). */
export const TASK_STATUS = {
  ASSIGNED: 'assigned',
  ACKNOWLEDGED: 'acknowledged',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELED: 'canceled',
};

/** المسار الأماميّ الطبيعيّ (يُستعمل لقياس «هل تقدّمت المهمة؟»). */
export const STATUS_ORDER = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.ACKNOWLEDGED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.DONE,
];

export const STATUS_LABELS = {
  assigned: 'مُسندة',
  acknowledged: 'تمّ الاطّلاع',
  in_progress: 'قيد التنفيذ',
  done: 'منجَزة',
  canceled: 'ملغاة',
};

export const PRIORITY_LABELS = { high: 'عاجل', med: 'متوسط', low: 'عادي' };

/** أنواع أحداث سجلّ التوثيق (المجموعة الفرعيّة `events` الملحقة-فقط). */
export const EVENT_TYPE = {
  CREATED: 'created', // أُنشئت وأُسندت
  STATUS: 'status', // تغيّرت الحالة (اطّلاع/تنفيذ/إنجاز/إلغاء/فتح)
  REPLY: 'reply', // ردّ/تعليق في الخيط
  REASSIGNED: 'reassigned', // أعاد المدير الإسناد لمستخدمٍ آخر
  CHECKLIST: 'checklist', // تغيّرت خطوة في قائمة التحقّق
};

/**
 * هل يُسمح للمُسنَد إليه بنقل الحالة من `from` إلى `to`؟
 * أماميّ فقط داخل المسار (لا يتخطّى للخلف، ولا يُلغي). التخطّي للأمام مسموح
 * (مثلًا من «مُسندة» مباشرةً إلى «قيد التنفيذ») تسهيلًا، لكن ليس للوراء.
 */
export function canAssigneeMove(from, to) {
  const i = STATUS_ORDER.indexOf(from);
  const j = STATUS_ORDER.indexOf(to);
  return i !== -1 && j !== -1 && j > i;
}

/**
 * هل يُسمح للمدير بنقل الحالة من `from` إلى `to`؟ المدير يملك المسار كلّه:
 * أمامًا وخلفًا (إعادة فتح) وإلغاءً — لكن لا انتقال من/إلى قيمةٍ مجهولة.
 */
export function canManagerMove(from, to) {
  const known = { ...TASK_STATUS };
  const values = Object.values(known);
  return values.includes(from) && values.includes(to) && from !== to;
}

/** أزرار التنفيذ المتاحة للمُسنَد إليه انطلاقًا من الحالة الراهنة. */
export function assigneeNextActions(status) {
  switch (status) {
    case TASK_STATUS.ASSIGNED:
      return [TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.IN_PROGRESS];
    case TASK_STATUS.ACKNOWLEDGED:
      return [TASK_STATUS.IN_PROGRESS];
    case TASK_STATUS.IN_PROGRESS:
      return [TASK_STATUS.DONE];
    default:
      return [];
  }
}

/** يحوّل قيمة وقت Firestore/ISO/رقم إلى ميلي-ثانية (أو null). نقيّة للاختبار. */
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value.toMillis === 'function') return value.toMillis(); // Firestore Timestamp
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/**
 * لحظة الاستحقاق بالميلي-ثانية من `dueDate` (YYYY-MM-DD) و`dueTime` (HH:MM).
 * غياب الوقت ⇒ نهاية اليوم (23:59) كي لا تُحسب مهمّة اليوم متأخّرةً صباحًا.
 */
export function dueMillis(dueDate, dueTime) {
  if (!dueDate) return null;
  const time = dueTime && /^\d{1,2}:\d{2}$/.test(dueTime) ? dueTime : '23:59';
  const t = Date.parse(`${dueDate}T${time}:00`);
  return Number.isNaN(t) ? null : t;
}

/* ═════════════════ الحمولة الميدانيّة ‹EXE-101› ═════════════════ */

/**
 * أنواع العمل الميدانيّ — **المصدر `ORDER_TYPES` في `laborModel.js`**، وهذه
 * إحالةٌ لا قائمةٌ ثانية. قائمتان بأنواع العمل تعنيان نوعًا يُضاف في إحداهما
 * فيسقط من الأخرى صامتًا.
 */
export const WORK_TYPES = ORDER_TYPES;

/**
 * أيّ طرفٍ يلزم لكلّ نوع.
 *
 * ليست قائمةَ أنواعٍ ثانية بل **سياسةٌ مفاتيحها أنواعُ `ORDER_TYPES` نفسها**:
 * فالتخزين وجهتُه هي القرار (العامل يختار الرفّ)، والسحب مصدرُه هو القرار
 * (من أيّ رفٍّ يأخذ)، والنقل الداخليّ طرفاه معًا.
 *
 * ونوعٌ جديد يُضاف في `laborModel` بلا قرارٍ هنا **يُعلَن ولا يُبتلع** — انظر
 * `unpolicedWorkTypes()`. (نمط حارس `timeFields`: لا يمرّ حقلٌ بلا قرار.)
 */
export const WORK_ENDPOINTS = {
  receipt: { from: false, to: false },
  transfer: { from: true, to: true },
  delivery: { from: true, to: false },
  container: { from: false, to: false },
  putaway: { from: false, to: true },
  pick: { from: true, to: false },
};

/** أنواعٌ في `ORDER_TYPES` بلا سياسة أطراف — يكشفها اختبارُ الحارس. */
export function unpolicedWorkTypes() {
  return Object.keys(WORK_TYPES).filter((id) => !WORK_ENDPOINTS[id]);
}

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();
const qty = (v) => Math.max(0, Number(v) || 0);

/**
 * سطرُ عملٍ واحد: من أين وإلى أين وأيّ صنفٍ وكم.
 *
 * الكمّيّات **ثلاث لا واحدة**: المطلوب والمنفَّذ والمتبقّي. ورقمٌ واحد اسمه
 * «الكمّيّة» يُخفي الفرق — وهو درس LOC-601 نفسه. والمتبقّي **لا يُخزَّن**:
 * يُحسب من `lineProgress` عند القراءة، وإلّا افترق عن طرفيه.
 */
export function shapeWorkLine(input) {
  return {
    sku: up(input?.sku),
    barcode: s(input?.barcode),
    nameAr: s(input?.nameAr),
    batch: up(input?.batch),
    expiry: s(input?.expiry),
    fromBin: up(input?.fromBin),
    toBin: up(input?.toBin),
    uom: s(input?.uom),
    qtyRequired: qty(input?.qtyRequired),
    qtyDone: qty(input?.qtyDone),
  };
}

/**
 * الحمولة الميدانيّة كاملةً. المستند المرجعيّ جزءٌ منها لا زينة:
 * **لا حركة بلا مستند** — وهو مبدأ البوّابة، وأثرُ المهمّة بلا مرجعٍ يتيم.
 */
export function shapeWorkPayload(input) {
  const workType = WORK_TYPES[input?.workType] ? input.workType : '';
  return {
    workType,
    docRef: {
      type: up(input?.docRef?.type),
      number: s(input?.docRef?.number),
      id: s(input?.docRef?.id),
    },
    warehouse: up(input?.warehouse),
    lines: (input?.lines || []).map(shapeWorkLine),
    laborTaskId: s(input?.laborTaskId),
  };
}

/** أمهمّةٌ ميدانيّة؟ الإداريّة القائمة بلا `workType` وتبقى صالحةً كما هي. */
export function isWorkTask(task) {
  return Boolean(WORK_TYPES[task?.work?.workType || task?.workType]);
}

/** الحمولة أينما كانت — تحت `work` أو في جذر المهمّة. */
function payloadOf(task) {
  return task?.work && typeof task.work === 'object' ? task.work : task;
}

/**
 * ما ينقص السطرَ **ولا يمنع إنشاءه**.
 *
 * ★★ الفراغ ليس خطأً: مستندات اليوم كلّها بلا مواقع، ومهمّةٌ تُرفض لفراغ
 * خانةٍ توقف الدورة القائمة في لحظة — وهو فشلٌ أسوأ من الفجوة. فتُنشأ المهمّة
 * بطرفٍ **مفتوح** ويُعلَن نقصه ليملأه العامل بمسحه.
 */
export function lineGaps(line, workType) {
  const need = WORK_ENDPOINTS[workType] || { from: false, to: false };
  const out = [];
  if (need.from && !up(line?.fromBin)) out.push('موقع المصدر مفتوح — يُحدَّد بالمسح');
  if (need.to && !up(line?.toBin)) out.push('موقع الوجهة مفتوح — يختاره العامل');
  if (!up(line?.sku) && !s(line?.barcode)) out.push('الصنف غير معرَّف — لا كودَ ولا باركود');
  return out;
}

/**
 * ما يمنع الحفظ فعلًا — قائمةٌ عربيّة فارغةٌ تعني «صالحة».
 * وما يُعلَن ولا يمنع فمكانه `lineGaps` لا هنا.
 */
export function workPayloadProblems(input) {
  const p = shapeWorkPayload(input);
  const out = [];

  if (!p.workType) out.push('نوع العمل غير معروف — اختر من أنواع المناولة المعتمدة.');
  if (!p.docRef.type || !p.docRef.number) out.push('لا حركة بلا مستند — المهمّة الميدانيّة تحتاج مستندها المرجعيّ.');
  if (!p.lines.length) out.push('لا بنودَ في المهمّة — مهمّةٌ بلا بندٍ لا تُنفَّذ ولا تُقاس.');
  if (p.lines.length && p.lines.every((l) => l.qtyRequired === 0)) {
    out.push('كلّ البنود بكمّيّةٍ مطلوبةٍ صفر — لا عملَ في هذه المهمّة.');
  }
  return out;
}

/**
 * تقدّم المهمّة الميدانيّة — **بالإحالة إلى `taskProgress`** في `laborModel`.
 * ويُضاف إليه ما يخصّ هذه الطبقة: الفجوات المعلَنة في كلّ سطر.
 */
export function workProgress(task) {
  const p = shapeWorkPayload(payloadOf(task));
  const progress = taskProgress(p.lines);
  const gaps = p.lines.flatMap((l, i) => lineGaps(l, p.workType).map((g) => ({ line: i, gap: g })));
  return { ...progress, gaps, openEndpoints: gaps.length };
}

/** حال سطرٍ بعينه — إحالةٌ مباشرة كي لا يستورد المستهلك طبقتين. */
export { lineProgress };

/* ═════════════════ الجسر ‹EXE-103› ═════════════════
 *
 * العمل الواحد له سجلّان قائمان: `tasks` (إسنادٌ وحالةٌ وأولويّةٌ وموعد) و
 * `labor_tasks` (بنودٌ وزمنٌ بأختام الخادم). ولو بقيا منفصلين صار للعمل
 * حقيقتان، ولو دُمجا بالنسخ صار للزمن مصدران.
 *
 * ═══ القسمة الحاكمة ═══
 *   `tasks`        ← **من ومتى وبأيّ أولويّة** · ولا بنودَ فيها ولا زمنَ تنفيذ
 *   `labor_tasks`  ← **أين وكم ومتى بدأ وانتهى** · ولا أولويّةَ فيها ولا موعد
 *   والرابط معرّفٌ واحد: `laborTaskId`.
 *
 * ═══ ولماذا الحالة تُشتقّ ولا تُكتب ═══
 * كان يمكن أن يكتب الميدانُ حالةَ البطاقة عند كلّ تغيّر. ولانفتح بابان: بابٌ
 * أمنيّ (مشرف المناولة ليس `isManager` فلا يملك تعديل `tasks`، فكان الحلّ
 * توسيعَ صلاحيّةٍ لأجل الكتابة وحدها)، وبابُ تباعدٍ (كتابتان لحقيقةٍ واحدة
 * تفترقان أوّل فشلِ شبكة). فالحالة المستنبَطة **تُحسب عند القراءة**، والخلاف
 * يُعلَن ولا يُدهس. ولذلك **لم تُغيَّر `firestore.rules`** في هذه المهمّة.
 */

/**
 * خريطة حالة التنفيذ الميدانيّ إلى حالة الإسناد.
 *
 * ⚠️ ولا تُكتب بيدٍ في مكانٍ آخر: `TASK_STATUS.CANCELED` بلامٍ واحدة
 * (`canceled`) و`TASK_STATES.cancelled` بلامين — اختلافٌ حرفيٌّ صامت يُسقط
 * أيّ مقارنةٍ مباشرة بلا خطأ، فيبقى الملغى «مُسندًا» إلى الأبد.
 */
export const LABOR_TO_TASK_STATUS = Object.freeze({
  pending: TASK_STATUS.ASSIGNED,
  in_progress: TASK_STATUS.IN_PROGRESS,
  paused: TASK_STATUS.IN_PROGRESS, // ★ التوقّف ليس إنجازًا
  done: TASK_STATUS.DONE,
  cancelled: TASK_STATUS.CANCELED, // ★ لامان ⟵ لامٌ واحدة
});

/**
 * الحقول التي يملك الجسر كتابتها على البطاقة.
 * **ليس فيها حقلُ زمنٍ واحد** — الزمن يبقى في `labor_tasks` وحدها.
 */
export const BRIDGE_FIELDS = Object.freeze(['status', 'laborTaskId']);

/**
 * الحالة التي يقولها الميدان.
 *
 * ★★ الإنجاز الجزئيّ لا يُغلق المهمّة (معيار المالك، وهو حكم `finishVerdict`
 * نفسه): مهمّةٌ ميدانيّة «منجزة» وفيها بندٌ ناقص تبقى **قيد التنفيذ** — فمن
 * انتهى دوامه وقد خزّن نصف الشحنة لا يُغلق عليها الباب.
 */
export function impliedStatus(laborState, progress) {
  const mapped = LABOR_TO_TASK_STATUS[laborState];
  if (!mapped) return '';
  if (mapped === TASK_STATUS.DONE && progress && progress.complete === false) {
    return TASK_STATUS.IN_PROGRESS;
  }
  return mapped;
}

/**
 * حكم الجسر — يُحسب عند القراءة ولا يُخزَّن.
 *
 * والرجوع للخلف **لا يقع تلقائيًّا**: بطاقةٌ أُغلقت وميدانٌ يقول «جارية»
 * خلافٌ يُعلَن للمشرف ليبتّه، لا حالةٌ تُدهس — فالمدير وحده يُرجع
 * (`canManagerMove`).
 *
 * @returns {{implied:string, status:string, changed:boolean, forward:boolean, conflict:boolean, message:string}}
 */
export function bridgeVerdict({ task, laborTask, progress } = {}) {
  const current = task?.status || TASK_STATUS.ASSIGNED;
  const implied = impliedStatus(laborTask?.state, progress);
  const none = { implied: '', status: current, changed: false, forward: false, conflict: false, message: '' };

  if (!implied) return none;
  if (implied === current) return { ...none, implied };

  // الإلغاء إنهاءٌ إداريّ خارج المسار — يُعلَن ولا يُطبَّق تلقائيًّا.
  if (implied === TASK_STATUS.CANCELED || current === TASK_STATUS.CANCELED) {
    return {
      implied,
      status: current,
      changed: false,
      forward: false,
      conflict: true,
      message: `الميدان «${STATUS_LABELS[implied]}» والبطاقة «${STATUS_LABELS[current]}» — الإلغاء قرارُ المدير لا أثرٌ تلقائيّ.`,
    };
  }

  if (canAssigneeMove(current, implied)) {
    return { implied, status: implied, changed: true, forward: true, conflict: false, message: '' };
  }

  return {
    implied,
    status: current,
    changed: false,
    forward: false,
    conflict: true,
    message: `الميدان يقول «${STATUS_LABELS[implied]}» والبطاقة «${STATUS_LABELS[current]}» — رجوعٌ للخلف يبتّه المدير.`,
  };
}

/**
 * يقسم مخرَج المصنع إلى سجلَّيه.
 *
 * ★★ الحارس الحقيقيّ ضدّ الازدواج: **البنود لا تُخزَّن في البطاقة** —
 * `WorkerTaskPanel` يكتب `qtyDone` في `labor_tasks` منذ LOC-401، ونسخةٌ ثانية
 * منها في `tasks` تصير رقمًا ثانيًا للمنجَز يفترق أوّل حفظ.
 *
 * @returns {{assignment:object, execution:object}}
 */
export function splitGenerated(generated) {
  const work = shapeWorkPayload(generated?.work || generated);
  return {
    assignment: {
      key: s(generated?.key),
      title: s(generated?.title),
      workType: work.workType,
      docRef: work.docRef,
      warehouse: work.warehouse,
      group: s(generated?.group),
      lineCount: work.lines.length,
      laborTaskId: work.laborTaskId,
    },
    execution: {
      orderType: work.workType,
      docRef: work.docRef,
      lines: work.lines,
    },
  };
}

/**
 * أحقلٌ مكرّرٌ بين السجلَّين؟ يُعيد أسماء ما تكرّر — والفراغ هو السلامة.
 * (يُستدعى في الاختبار حارسًا، وفي المراجعة دليلًا.)
 */
export function duplicatedFields(assignment, execution) {
  const SHARED_BY_DESIGN = new Set(['docRef', 'workType', 'orderType']);
  return Object.keys(assignment || {}).filter((k) => k in (execution || {}) && !SHARED_BY_DESIGN.has(k));
}

/* ═════════════════ «المهمّة التالية» ‹EXE-104› ═════════════════ */

/**
 * ترتيب طابور العامل.
 *
 * ═══ لماذا واحدةٌ في الصدارة لا قائمةٌ طويلة ═══
 * عاملٌ يحمل طردًا بيدٍ وهاتفًا بالأخرى لا يوازن بين اثنتي عشرة مهمّة. فالشاشة
 * تقول **ما التالي** وتُخفي الباقي خلف عدّاد. وهذا نصّ `تطوير.md`: «العامل يرى
 * فقط: المهمّة التالية… أمّا المشرف فيرى سبب منح المهمّة هذه الأولويّة».
 *
 * ═══ وما هذا الترتيب وما ليس هو ═══
 * ليس محرّك الأولويّة — ذاك يأتي في ت٣ بعوامله المعلنة (قرب الشحن · توفّر
 * الرصيد · قابليّة التنفيذ الآن). وحتى يأتي، القاعدة **معلَنة وبسيطة ولا
 * تدّعي ذكاءً**:
 *   ١. ما بدأتَه يُنهى أوّلًا — تركُ عملٍ نصفَ منجزٍ يضاعف المشي.
 *   ٢. ثمّ الأقدم إنشاءً (FIFO) — أعدلُ ما يُقال قبل وجود مقياس.
 * والرتبة تُعيد **سببها** لا رقمها وحده، فما إن يحلّ محرّك الأولويّة حتى
 * يحلّ محلّ السبب سببٌ أغنى بلا تغيير الشاشة.
 */
export const QUEUE_REASONS = Object.freeze({
  resume: 'بدأتَها ولم تنتهِ — إنهاؤها قبل فتح غيرها يُقصّر المشي',
  next: 'التالية بالدور — الأقدم إنشاءً',
});

const QUEUE_RANK = { in_progress: 0, paused: 1, pending: 2 };

/**
 * يرتّب المهامّ الميدانيّة ويُعلّل صدارة الأولى.
 * @returns {{queue:Array<{task:object, reason:string}>, next:object|null}}
 */
export function workQueue(tasks, { createdMillis = (t) => toMillis(t?.createdAt) } = {}) {
  const open = (tasks || []).filter((t) => t && t.state !== 'done' && t.state !== 'cancelled');
  const sorted = open.slice().sort((a, b) => {
    const ra = QUEUE_RANK[a.state] ?? 9;
    const rb = QUEUE_RANK[b.state] ?? 9;
    if (ra !== rb) return ra - rb;
    return (createdMillis(a) ?? Infinity) - (createdMillis(b) ?? Infinity);
  });
  const queue = sorted.map((task) => ({
    task,
    reason: task.state === 'in_progress' || task.state === 'paused' ? QUEUE_REASONS.resume : QUEUE_REASONS.next,
  }));
  return { queue, next: queue.length ? queue[0].task : null };
}
