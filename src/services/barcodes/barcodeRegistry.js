/**
 * سجلّ الباركود الملحق-فقط ‹LPN-703› — من ولّده ولماذا وكم مرّةً طُبع. منطق خالص.
 *
 * ═══ الفجوة التي يسدّها (ف-١١) ═══
 * كلُّ نوعٍ من الباركود كان يُولَّد **في مكانه**: الطبلية في خدمة الطبالي،
 * والموقع في بانية المواقع، والباب في سجلّ الأبواب. فإذا سُئل النظام سؤالًا
 * بسيطًا — «من ولّد هذا الملصق؟ ولماذا؟ وكم نسخةً منه في المستودع؟» — لم يكن
 * له جواب. وهذا السؤال بالذات هو ما يُسأل حين تُوجد **حمولتان بهويّةٍ واحدة**.
 *
 * ═══ الحقول الأحد عشر — كما عدّدها النصّ حرفيًّا ═══
 * النوع · القيمة · من أنشأه · صلاحية منشئه · سبب الإنشاء · العمليّة أو المستند
 * المرتبط · وقت الإنشاء · عدد مرّات الطباعة · من أعاد طباعته وسببه · الحالة.
 *
 * ═══ ★★ والقاعدة التي تُبنى هنا لا في الواجهة ═══
 * **لا يُعاد استخدام قيمةٍ أُغلقت أو أُلغيت.** والنصّ قالها في الطبلية
 * («عدم إعادة استخدام رقم طبلية مغلقة») — وهي في الموقع والباب والطرد أخطر:
 * ملصقٌ قديمٌ لم يُنزع من الحديد + قيمةٌ أُعيد استعمالها = حركةٌ تُقيَّد على
 * الشيء الخطأ ولا يشكّ فيها أحد.
 *
 * ═══ والزمن يُمرَّر ولا يُقرأ ═══
 * كنمط `lpnEvents` و`labelModel`: هذا الملفّ لا يعرف ساعةً ولا شبكة — `at`
 * يأتي من المستدعي، والخدمة تكتبه بختم الخادم.
 */

import { BARCODE_KINDS, classifyScan, kindLabel, normalizeScan } from './barcodeCode.js';
import { BARCODE_CLASSES, classOf, originLabel } from './barcodeKinds.js';

/**
 * حالات الباركود الخمس — بأسمائها في النصّ.
 *
 * `terminal` تعني: لا تعود منها القيمةُ إلى الخدمة أبدًا. والتالف **ليس**
 * ختاميًّا: ملصقٌ تلف يُعاد طبعُه فيعود الشيءُ نفسه إلى الخدمة — وهذا صريحٌ
 * في النصّ: «إعادة طباعة ملصق تالف دون إنشاء موقع جديد».
 */
export const BARCODE_STATUSES = Object.freeze({
  ACTIVE: { id: 'ACTIVE', labelAr: 'فعّال', terminal: false, hint: 'موجودٌ وصالحٌ للمسح.' },
  IN_USE: { id: 'IN_USE', labelAr: 'مستخدَم', terminal: false, hint: 'عليه حمولةٌ أو عملٌ جارٍ.' },
  CLOSED: { id: 'CLOSED', labelAr: 'مغلق', terminal: true, hint: 'انتهت دورته — ولا تُعاد قيمتُه لشيءٍ جديد.' },
  VOID: { id: 'VOID', labelAr: 'ملغى', terminal: true, hint: 'أُبطل بقرارٍ بسبب — والقيمة محروقةٌ للأبد.' },
  DAMAGED: { id: 'DAMAGED', labelAr: 'تالف', terminal: false, hint: 'الملصق تلف — يُعاد طبعُه ويعود فعّالًا.' },
});

/** الانتقالات المسموحة — والفراغ يعني حالةً ختاميّة. */
export const STATUS_TRANSITIONS = Object.freeze({
  ACTIVE: Object.freeze(['IN_USE', 'CLOSED', 'VOID', 'DAMAGED']),
  IN_USE: Object.freeze(['ACTIVE', 'CLOSED', 'VOID', 'DAMAGED']),
  DAMAGED: Object.freeze(['ACTIVE', 'VOID', 'CLOSED']),
  CLOSED: Object.freeze([]),
  VOID: Object.freeze([]),
});

/** الحالات التي تُلزم سببًا مكتوبًا — ما يُبطل أو يُعطب لا يمرّ صامتًا. */
const STATUS_REASON_REQUIRED = new Set(['VOID', 'DAMAGED']);

/** سقفُ سجلّ الطباعات المحفوظ على القيد — الأقدمُ يُطوى عدًّا ولا يُمحى معنًى. */
export const PRINT_LOG_CAP = 50;

const s = (v) => String(v ?? '').trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** عنوانُ الحالة للعرض — من الجدول لا من نصٍّ حرّ. */
export function statusLabel(status) {
  return BARCODE_STATUSES[status]?.labelAr ?? s(status);
}

/** هل الحالة ختاميّة (لا تعود القيمة للخدمة)؟ */
export function isTerminalStatus(status) {
  return Boolean(BARCODE_STATUSES[status]?.terminal);
}

/**
 * قيدٌ مسوًّى — الصورة الوحيدة التي تُخزَّن وتُقارَن.
 *
 * `value` يمرّ بالمصنّف فيُطبَّع: قيمةٌ تدخل السجلّ بصورةٍ وتُمسح بأخرى تعني
 * قيدًا لا يجده أحد.
 */
export function shapeEntry(input) {
  const scan = classifyScan(input?.value);
  const kind = s(input?.kind) || scan.kind;
  return {
    value: scan.code,
    kind,
    class: s(input?.class) || classOf(kind),
    status: BARCODE_STATUSES[input?.status] ? input.status : BARCODE_STATUSES.ACTIVE.id,
    createdBy: s(input?.createdBy),
    createdByName: s(input?.createdByName),
    createdAt: s(input?.createdAt),
    reason: s(input?.reason),
    docRef: s(input?.docRef),
    taskId: s(input?.taskId),
    warehouse: s(input?.warehouse).toUpperCase(),
    printCount: Math.max(0, Math.trunc(num(input?.printCount))),
    prints: Array.isArray(input?.prints) ? input.prints.slice(-PRINT_LOG_CAP) : [],
    // ★ آخرُ طباعةٍ محفوظةٌ على القيد نفسه: السجلُّ الكامل يعيش في مجموعةٍ
    // فرعيّةٍ ملحقة-فقط (`prints/`)، والشاشةُ تعرض الأخيرة بلا قراءةٍ ثانية.
    lastPrint: input?.lastPrint ?? (Array.isArray(input?.prints) ? (input.prints.at(-1) ?? null) : null),
    statusReason: s(input?.statusReason),
    statusBy: s(input?.statusBy),
    statusAt: s(input?.statusAt),
    notes: s(input?.notes),
  };
}

/**
 * ما يمنع قيدًا من دخول السجلّ — قائمةٌ لا رسالةٌ واحدة، فالشاشة تعرضها كلَّها
 * ولا يُصحّح المستخدم عطبًا ليُفاجأ بالذي بعده.
 */
export function entryProblems(input) {
  const e = shapeEntry(input);
  const out = [];

  if (!e.value) out.push('قيدٌ بلا قيمة — أيّ باركودٍ يوصف؟');
  else if (e.kind === BARCODE_KINDS.UNKNOWN.id) {
    out.push(classifyScan(input?.value).problem || `«${e.value}» صورةٌ لا يعرفها النظام.`);
  }
  if (!e.class) out.push(`النوع «${kindLabel(e.kind)}» بلا فئة صلاحيّة — بنيةٌ أم تشغيل؟`);
  if (!e.createdBy) out.push('قيدٌ بلا منشئٍ لا يُسجَّل — سجلٌّ فيه «مجهول أنشأ شيئًا» أسوأ من لا سجلّ.');
  if (!e.createdAt) out.push('قيدٌ بلا وقتٍ لا يُرتَّب في السجلّ — مرّر الوقت من المستدعي.');
  if (!e.reason && !e.docRef && !e.taskId) {
    out.push('قيدٌ بلا سببٍ ولا مستندٍ ولا مهمّة — ولا يُعرف بعد سنةٍ لماذا وُلد.');
  }
  return out;
}

/**
 * بناء قيدٍ مكتمل. يعيد `{entry}` أو `{problems}`.
 *
 * القيد **مجمَّد**: ما دخل السجلّ لا تعدّله يدٌ بعدها ولو بالسهو (نمط
 * `lpnEvents.buildEvent`).
 */
export function buildEntry(input) {
  const problems = entryProblems(input);
  if (problems.length) return { problems };
  const entry = shapeEntry(input);
  return { entry: Object.freeze({ ...entry, prints: Object.freeze([...entry.prints]) }) };
}

/**
 * ★★ سببُ منع إعادة استخدام قيمةٍ قائمة — أو `''` إن كانت القيمة حرّة.
 *
 * `existing` هو القيد القائم بهذه القيمة (أو `null` إن لم يوجد). وأيُّ قيدٍ
 * قائمٍ يمنع — ولو كان فعّالًا: **القيمة هي الهويّة**، ووجودُها مرّتين يعني
 * شيئين بهويّةٍ واحدة.
 */
export function reuseProblem(value, existing) {
  const code = normalizeScan(value);
  if (!code || !existing) return '';
  const e = shapeEntry(existing);
  if (e.value !== code) return '';
  if (isTerminalStatus(e.status)) {
    return `«${code}» ${statusLabel(e.status)} منذ ${e.statusAt || e.createdAt || 'قيدٍ سابق'} — ولا تُعاد قيمةٌ أُغلقت لشيءٍ جديد.`;
  }
  return `«${code}» مسجَّلٌ سلفًا (${statusLabel(e.status)}) — القيمة هي الهويّة فلا تتكرّر.`;
}

/* ═══════════════ الطباعة وإعادتها ═══════════════ */

/**
 * ما يمنع تسجيل طباعة. إعادةُ الطباعة (النسخة الثانية فصاعدًا) **تُلزم سببًا**
 * — لأنّ ملصقين متطابقين على شيئين هو أسوأ ما يقع في مستودعٍ يعمل بالباركود
 * (القاعدة نفسها في `labelModel.printJobProblem`).
 */
export function printProblem(entry, { actor, at, reason = '' } = {}) {
  const e = shapeEntry(entry);
  if (!e.value) return 'لا باركود — ماذا يُطبع؟';
  if (!s(actor)) return 'طباعةٌ بلا فاعلٍ لا تُسجَّل.';
  if (!s(at)) return 'طباعةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.';
  if (e.status === BARCODE_STATUSES.VOID.id) {
    return `«${e.value}» ملغى — ملصقٌ ملغًى يُطبع فيعود إلى الحديد ويُمسح بعد شهر.`;
  }
  if (e.printCount > 0 && !s(reason)) {
    return `هذه النسخة رقم ${e.printCount + 1} — اكتب سبب إعادة الطباعة، فهو ما يُقرأ حين تُوجد نسختان.`;
  }
  return '';
}

/**
 * يُلحق طباعةً بالقيد: يزيد العدّاد ويقيّد من طبع ولماذا.
 *
 * والتالف **يعود فعّالًا** بإعادة الطباعة — وهو ما طلبه النصّ: يُعاد ملصقُ
 * الموقع التالف دون إنشاء موقعٍ جديد.
 *
 * @returns {{entry:object}|{problem:string}}
 */
export function applyPrint(entry, { actor, actorName = '', at, reason = '', printer = 'PDF' } = {}) {
  const problem = printProblem(entry, { actor, at, reason });
  if (problem) return { problem };

  const e = shapeEntry(entry);
  const copy = e.printCount + 1;
  const record = Object.freeze({
    copy,
    actor: s(actor),
    actorName: s(actorName),
    at: s(at),
    reason: s(reason),
    printer: s(printer) || 'PDF',
    reprint: copy > 1,
  });

  return {
    entry: Object.freeze({
      ...e,
      printCount: copy,
      prints: Object.freeze([...e.prints, record].slice(-PRINT_LOG_CAP)),
      lastPrint: record,
      status: e.status === BARCODE_STATUSES.DAMAGED.id ? BARCODE_STATUSES.ACTIVE.id : e.status,
    }),
    record,
  };
}

/** خلاصةُ إعادات الطباعة — للتقرير الرقابيّ: كم نسخةً زائدة وعلى أيّ قيمة. */
export function reprintSummary(entries) {
  const rows = (entries ?? []).map(shapeEntry).filter((e) => e.printCount > 1);
  return {
    values: rows.length,
    extraCopies: rows.reduce((total, e) => total + (e.printCount - 1), 0),
    top: rows
      .slice()
      .sort((a, b) => b.printCount - a.printCount)
      .slice(0, 10)
      .map((e) => ({ value: e.value, kind: e.kind, copies: e.printCount, last: e.lastPrint })),
  };
}

/* ═══════════════ الحالة ═══════════════ */

/** سببُ منع انتقال حالة — أو `''` إن جاز. */
export function statusProblem(entry, next, { reason = '' } = {}) {
  const e = shapeEntry(entry);
  if (!BARCODE_STATUSES[next]) return `حالةٌ غير معروفة «${next ?? ''}» — المسموح: ${Object.keys(BARCODE_STATUSES).join(' · ')}`;
  if (e.status === next) return `«${e.value}» ${statusLabel(next)} أصلًا.`;
  const allowed = STATUS_TRANSITIONS[e.status] ?? [];
  if (!allowed.includes(next)) {
    return allowed.length
      ? `لا انتقال من «${statusLabel(e.status)}» إلى «${statusLabel(next)}» — المتاح: ${allowed.map(statusLabel).join(' · ')}.`
      : `«${statusLabel(e.status)}» حالةٌ ختاميّة — لا انتقال بعدها.`;
  }
  if (STATUS_REASON_REQUIRED.has(next) && !s(reason)) {
    return `«${statusLabel(next)}» يحتاج سببًا مكتوبًا — يبقى في السجلّ للأبد.`;
  }
  return '';
}

/** ينقل الحالة ويقيّد من نقلها ولماذا. `{entry}` أو `{problem}`. */
export function applyStatus(entry, next, { actor, at, reason = '' } = {}) {
  const problem = statusProblem(entry, next, { reason });
  if (problem) return { problem };
  if (!s(actor)) return { problem: 'تغييرُ حالةٍ بلا فاعلٍ لا يُسجَّل.' };
  if (!s(at)) return { problem: 'تغييرُ حالةٍ بلا وقتٍ لا يُرتَّب — مرّر الوقت من المستدعي.' };

  const e = shapeEntry(entry);
  return {
    entry: Object.freeze({
      ...e,
      status: next,
      statusReason: s(reason),
      statusBy: s(actor),
      statusAt: s(at),
      prints: Object.freeze([...e.prints]),
    }),
  };
}

/* ═══════════════ القراءة ═══════════════ */

/** بطاقةُ عرضٍ للقيد — كلُّ ما تعرضه الشاشة مشتقٌّ هنا لا في JSX. */
export function entryCard(entry) {
  const e = shapeEntry(entry);
  if (!e.value) return null;
  return {
    ...e,
    kindLabel: kindLabel(e.kind),
    statusLabel: statusLabel(e.status),
    classLabel: BARCODE_CLASSES[e.class]?.labelAr ?? '',
    origin: originLabel(e),
    reprinted: e.printCount > 1,
    lastPrint: e.lastPrint,
    terminal: isTerminalStatus(e.status),
  };
}

/** عدّادات السجلّ — للوحة: كم من كلّ نوعٍ وكم في كلّ حالة. */
export function registryCounters(entries) {
  const rows = (entries ?? []).map(shapeEntry).filter((e) => e.value);
  const byKind = {};
  const byStatus = {};
  for (const e of rows) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  }
  return {
    total: rows.length,
    byKind,
    byStatus,
    structure: rows.filter((e) => e.class === BARCODE_CLASSES.STRUCTURE.id).length,
    operation: rows.filter((e) => e.class === BARCODE_CLASSES.OPERATION.id).length,
    neverPrinted: rows.filter((e) => e.printCount === 0).length,
  };
}

/**
 * تصفيةُ السجلّ — نوعٌ وحالةٌ ومنشئٌ ونصٌّ حرّ. تُستدعى من الشاشة، والمنطق
 * هنا فيُختبر بلا DOM.
 */
export function filterEntries(entries, { kind = '', status = '', createdBy = '', term = '' } = {}) {
  const q = normalizeScan(term);
  return (entries ?? [])
    .map(shapeEntry)
    .filter((e) => e.value)
    .filter((e) => !kind || e.kind === kind)
    .filter((e) => !status || e.status === status)
    .filter((e) => !createdBy || e.createdBy === createdBy)
    .filter((e) => !q || e.value.includes(q) || normalizeScan(e.docRef).includes(q));
}
