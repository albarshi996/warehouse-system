/**
 * سجلّ الاستثناءات ‹EXE-201› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * `operationExceptions()` في [`operationsDashboard.js`](./operationsDashboard.js)
 * تكشف ستّة أنواعٍ من الخلل وتبني مصفوفةً **في الذاكرة عند كلّ رسم**: بلا رقم،
 * ولا مالك، ولا قرار، ولا إغلاق، ولا دليل. فتختفي بمجرّد أن يتغيّر الرصيد،
 * ولا يُعرف من عالجها ولا متى ولا بأيّ نتيجة. والاختلاف الذي يختفي بلا أثرٍ
 * يتكرّر — لأنّ أحدًا لم يعرف أنّه وقع.
 *
 * فهذا الملفّ يحوّله من **حسابٍ عابر** إلى **حالةٍ قابلة للتتبّع والإغلاق**،
 * بالحقول الثلاثة عشر التي نصّ عليها المرجع حرفيًّا.
 *
 * ═══ ثلاث قواعد تحكم ما هنا ═══
 *
 * ١. **الإغلاق يحتاج قرارًا مكتوبًا · والدليل يُعلَن نقصه ولا يمنع.** إغلاقٌ
 *    بلا سببٍ مكتوب يُنتج سجلًّا يقول «أُغلق» ولا يقول لماذا — وهو أسوأ من
 *    عدمه. أمّا الدليل (مستند إرجاعٍ أو صورة تسليم) فقد لا يكون بيد من يُغلق
 *    في اللحظة، ومنعُه يوقف الدورة — فيُعلَن نقصه في السجلّ نفسه.
 *    (السلوك المعلَن لقرار المالك ت-O02 حتى يُحسم.)
 *
 * ٢. **لا حذف ولا تعديلَ أثر.** المغلَق لا يُفتح ولا يُصحَّح — التصحيح
 *    **استثناءٌ جديد** يشير إلى الأوّل (`correctsRef`). وإلّا صار السجلّ
 *    قابلًا لإعادة الكتابة فسقطت قيمته كلّها.
 *
 * ٣. **الوقت المتبقّي يُحسب ولا يُخزَّن.** حقلٌ محفوظٌ للوقت المتبقّي يكذب
 *    بعد دقيقة. و`nowMs` يُمرَّر ولا يُقرأ.
 */

import { formatNumber, nextSeq } from '../documents/numberFormat.js';
import { remainingFrom, toMillis as dueMillis } from '../tasks/dueTime.js';

/** بادئة ترقيم الاستثناءات — تمرّ بمولّد الترقيم القائم لا بمولّدٍ ثانٍ. */
export const EXCEPTION_PREFIX = 'EXC';

/**
 * حالات الاستثناء. `escalated` ليست نهايةً بل **رفعٌ لمستوًى أعلى** يعود منه
 * إلى المعالجة أو إلى الإغلاق.
 */
export const EXCEPTION_STATUS = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  AWAITING_APPROVAL: 'awaiting_approval',
  ESCALATED: 'escalated',
  CLOSED: 'closed',
});

export const STATUS_LABELS = Object.freeze({
  open: 'مفتوح',
  in_progress: 'قيد المعالجة',
  awaiting_approval: 'بانتظار الاعتماد',
  escalated: 'مُصعَّد',
  closed: 'مُغلق',
});

/**
 * الانتقالات المسموحة.
 *
 * ولا انتقالَ **من** `closed`: القاعدة ٢. ومن أراد تصحيح مغلَقٍ فتح استثناءً
 * جديدًا يشير إليه.
 */
const TRANSITIONS = Object.freeze({
  open: ['in_progress', 'escalated'],
  in_progress: ['awaiting_approval', 'escalated'],
  awaiting_approval: ['closed', 'in_progress', 'escalated'],
  escalated: ['in_progress', 'awaiting_approval', 'closed'],
  closed: [],
});

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** الحالات التي يبقى فيها الاستثناء مفتوحًا (تُعدّ في اللوحة). */
export function isOpenStatus(status) {
  return status !== EXCEPTION_STATUS.CLOSED && Boolean(STATUS_LABELS[status]);
}

/** درجات الخطورة — والأحمر لـ`high` وحدها في الشاشة. */
export const SEVERITY = Object.freeze({ HIGH: 'high', MED: 'med', LOW: 'low' });
export const SEVERITY_LABELS = Object.freeze({ high: 'مرتفعة', med: 'متوسطة', low: 'منخفضة' });
const SEVERITY_RANK = { high: 0, med: 1, low: 2 };

/**
 * أنواع الاستثناء — ولكلٍّ **الإجراء المطلوب** مكتوبًا معه.
 *
 * لماذا الإجراء في التعريف لا في الشاشة؟ لأنّ تنبيهًا يقول «حدث كذا» ولا يقول
 * «افعل كذا» يُقرأ ويُترك. والمفاتيح تُطابق ما تكشفه `operationExceptions`
 * اليوم كي يربط بينهما `EXE-202` بلا ترجمة.
 */
export const EXCEPTION_TYPES = Object.freeze({
  approval_stale: { id: 'approval_stale', label: 'مستند تأخّر عن مهلة الاعتماد', action: 'اعتمِد أو ارفض بسبب', owner: 'المعتمِد' },
  transit_variance: { id: 'transit_variance', label: 'فرق نقلٍ غير مسوّى', action: 'سوِّ الفرق بسند تسوية أو أثبت الاستلام', owner: 'أمين المخزن' },
  no_stock: { id: 'no_stock', label: 'أمر بيعٍ بلا رصيد', action: 'وفّر الرصيد أو عدّل الأمر', owner: 'مدير المستودع' },
  stuck_balance: { id: 'stuck_balance', label: 'رصيدٌ عالقٌ في موقع نظام', action: 'انقله إلى موقعه أو أغلق الحركة', owner: 'أمين المخزن' },
  expired: { id: 'expired', label: 'رصيدٌ منتهي الصلاحية', action: 'اسحبه وأتلفه بمستند — لا يُباع ولا يُنقل', owner: 'مدقّق الجرد' },
  near_expiry: { id: 'near_expiry', label: 'رصيدٌ قريب الانتهاء', action: 'قدّمه في الصرف (FEFO)', owner: 'أمين المخزن' },
  below_min: { id: 'below_min', label: 'صنفٌ تحت الحدّ الأدنى', action: 'أدرجه في أمر الشراء القادم', owner: 'موظف المشتريات' },
  pick_shortfall: { id: 'pick_shortfall', label: 'نقصٌ في السحب', action: 'أعِد التعبئة من الاحتياطيّ أو عدّل الكمّيّة', owner: 'مشرف المناولة' },
  putaway_blocked: { id: 'putaway_blocked', label: 'تعذّر التخزين — لا موقعَ يقبل', action: 'حرّر موقعًا أو خزّن بتجاوزٍ معلَّل', owner: 'مدير المستودع' },
  qc_reject: { id: 'qc_reject', label: 'رفض جودة', action: 'أرجِع للمورّد أو اقبل استثناءً بقرار', owner: 'مسؤول الجودة' },
  // ‹FNB-701› قطاع المطاعم: صنفُ منيو يُباع ولا وصفةَ له ⇒ استهلاكه النظريّ
  // صفرٌ كاذبٌ وتكلفته مجهولة. الكاشف `recipe.unlinkedSaleItems` — وبقيّة
  // أنواع القطاع العشرة تُضاف في FNB-802 لا هنا.
  recipe_unlinked: { id: 'recipe_unlinked', label: 'صنف منيو غير مربوط بوصفة', action: 'اربطه بوصفةٍ ساريةً أو أخرجه من المنيو', owner: 'مدير المستودع' },
});

export function exceptionType(id) {
  return EXCEPTION_TYPES[id] || null;
}

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** رقم الاستثناء الرسميّ — `EXC-2026-0041` من مولّد الترقيم القائم. */
export function exceptionNumber(year, seq) {
  return formatNumber(EXCEPTION_PREFIX, year, nextSeq(num(seq) - 1));
}

/**
 * بصمة التفرّد — **مفتاح `EXE-202`**: الكاشف يعمل عند كلّ رسم، فبلا بصمةٍ
 * يفتح الاستثناء نفسه مئة مرّة. وتركيبها (النوع · المرجع · الصنف) لأنّ هذه
 * الثلاثة هي ما يجعل حادثتين حادثةً واحدة.
 */
export function fingerprint(input) {
  return [up(input?.type), up(input?.docRef?.number || input?.docRef?.id), up(input?.sku || input?.barcode)]
    .join('::');
}

/** يُسوّي مدخل الاستثناء إلى شكل المستند المخزَّن — الحقول الثلاثة عشر. */
export function shapeException(input) {
  const type = EXCEPTION_TYPES[input?.type] ? input.type : '';
  return {
    number: up(input?.number), // ١ الرقم
    type, // ٢ النوع
    severity: SEVERITY_LABELS[input?.severity] ? input.severity : SEVERITY.MED, // ٣ الخطورة
    docRef: { type: up(input?.docRef?.type), number: s(input?.docRef?.number), id: s(input?.docRef?.id) }, // ٤ المستند
    sku: up(input?.sku), // ٥ الصنف
    barcode: s(input?.barcode),
    nameAr: s(input?.nameAr),
    qty: num(input?.qty), // ٦ الكمّيّة المتأثّرة
    reason: s(input?.reason), // ٧ السبب
    location: up(input?.location), // ٨ الموقع الحاليّ
    ownerRole: s(input?.ownerRole), // ٩ المسؤول
    dueAt: s(input?.dueAt), // ١٠ الموعد — والمتبقّي يُحسب منه ولا يُخزَّن
    action: s(input?.action) || exceptionType(type)?.action || '', // ١١ الإجراء المطلوب
    status: STATUS_LABELS[input?.status] ? input.status : EXCEPTION_STATUS.OPEN, // ١٢ حالة القرار
    decision: s(input?.decision), // ١٣ القرار ودليله
    evidenceRef: s(input?.evidenceRef),
    fingerprint: fingerprint({ ...input, type }),
    correctsRef: s(input?.correctsRef),
    detectedAt: s(input?.detectedAt),
  };
}

/** ما يمنع الحفظ — قائمةٌ عربيّة فارغةٌ تعني «صالح». */
export function exceptionProblems(input) {
  const e = shapeException(input);
  const out = [];
  if (!e.type) out.push('نوع الاستثناء غير معروف — اختر من الأنواع المعتمدة.');
  if (!e.reason) out.push('السبب مطلوب — استثناءٌ بلا سببٍ شكوى لا معلومة.');
  if (!e.docRef.number && !e.location && !e.sku) {
    out.push('الاستثناء بلا مرجع — لا مستند ولا موقع ولا صنف، فلا يُتتبَّع.');
  }
  return out;
}

/**
 * الوقت المتبقّي حتى الموعد — **يُحسب ولا يُخزَّن** (القاعدة ٣).
 * @returns {{ms:number|null, hours:number|null, overdue:boolean, label:string}}
 */
export function remainingTime(exception, nowMs) {
  // ‹EXE-301› الحساب انتقل إلى `tasks/dueTime.js` لمّا احتاجته المهامّ
  // والطلبات أيضًا — وهذه إحالةٌ لا نسخة، فلا يفترق الوقتان.
  return remainingFrom(dueMillis(exception?.dueAt), nowMs);
}

/**
 * حكم الإغلاق (القاعدة ١).
 *
 * @returns {{ok:boolean, problem:string, gaps:string[]}}
 *          `problem` يمنع · و`gaps` تُعلَن في السجلّ ولا تمنع.
 */
export function closeVerdict(exception, { decision, evidenceRef } = {}) {
  const gaps = [];
  if (!canTransition(exception?.status, EXCEPTION_STATUS.CLOSED)) {
    const from = STATUS_LABELS[exception?.status] || '—';
    return {
      ok: false,
      problem:
        exception?.status === EXCEPTION_STATUS.CLOSED
          ? 'مُغلقٌ أصلًا — والتصحيح استثناءٌ جديد يشير إليه لا تعديلٌ لهذا.'
          : `لا يُغلق من «${from}» — يمرّ بالاعتماد أوّلًا.`,
      gaps,
    };
  }
  if (!s(decision)) {
    return { ok: false, problem: 'الإغلاق يحتاج قرارًا مكتوبًا — «أُغلق» بلا سببٍ أسوأ من عدمه.', gaps };
  }
  if (!s(evidenceRef)) gaps.push('أُغلق بلا دليلٍ مرفق — يُعلَن ولا يمنع.');
  return { ok: true, problem: '', gaps };
}

/**
 * استثناءُ تصحيحٍ لمغلَق (القاعدة ٢) — جديدٌ يشير إلى الأوّل ولا يمسّه.
 */
export function correctionDraft(closed, { reason, ...rest } = {}) {
  return shapeException({
    ...closed,
    ...rest,
    number: '',
    status: EXCEPTION_STATUS.OPEN,
    decision: '',
    evidenceRef: '',
    reason: s(reason) || `تصحيحٌ لاستثناءٍ مغلَق ${s(closed?.number)}`,
    correctsRef: s(closed?.number),
  });
}

/** ترتيب العرض: الخطورة أوّلًا ثمّ الأقرب موعدًا — ما يحتاج تدخّلًا الآن. */
export function sortForBoard(list, nowMs) {
  return (list || []).slice().sort((a, b) => {
    const ra = SEVERITY_RANK[a?.severity] ?? 9;
    const rb = SEVERITY_RANK[b?.severity] ?? 9;
    if (ra !== rb) return ra - rb;
    const ma = remainingTime(a, nowMs).ms;
    const mb = remainingTime(b, nowMs).ms;
    if (ma === null && mb === null) return 0;
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma - mb;
  });
}

/* ═══════════════ مصالحة الكشف مع السجلّ ‹EXE-202› ═══════════════ */

/** يحوّل هويّات الكشف من `operationExceptions` إلى مسودّات استثناءات. */
export function detectionsToDrafts(detections) {
  return (detections || [])
    .filter((d) => d?.identity?.type && EXCEPTION_TYPES[d.identity.type])
    .map((d) =>
      shapeException({
        ...d.identity,
        severity: d.severity === 'high' ? SEVERITY.HIGH : d.severity === 'med' ? SEVERITY.MED : SEVERITY.LOW,
        reason: d.identity.reason || d.detail || d.title,
        ownerRole: exceptionType(d.identity.type)?.owner || '',
      })
    );
}

/**
 * ★★ مصالحة ما يكشفه المحرّك الآن مع ما هو مسجَّلٌ سلفًا.
 *
 * ═══ الخطران اللذان تدفعهما ═══
 *
 * ١. **التكرار.** الكاشف يعمل عند كلّ رسم، فبلا مصالحةٍ يفتح الاستثناء نفسه
 *    مئة مرّة. فالبصمة تُقارَن بالمفتوح، والموجود يُترك.
 *
 * ٢. **الاختفاء الصامت — وهو الأخطر.** لو أُغلق الاستثناء تلقائيًّا حين يزول
 *    سببه لَمُحي الأثر: بضاعةٌ عالقة نُقلت، ورصيدٌ منتهٍ بِيع، ومستندٌ اعتُمد
 *    بعد تأخّرٍ طويل — كلّها تختفي كأنّها لم تقع، فلا يُعرف كم مرّة تكرّرت
 *    ولا من عالجها. **فالزوال يُعلَّم ولا يُغلق**، وينتظر قرارًا.
 *
 * @returns {{toOpen:Array, active:Array, vanished:Array}}
 */
export function reconcileDetections(drafts, existing) {
  const open = (existing || []).filter((e) => isOpenStatus(e?.status));
  const openByPrint = new Map(open.map((e) => [String(e.fingerprint || ''), e]));
  const detectedPrints = new Set((drafts || []).map((d) => d.fingerprint));

  const toOpen = [];
  const active = [];
  for (const draft of drafts || []) {
    const found = openByPrint.get(draft.fingerprint);
    if (found) active.push({ existing: found, draft });
    else toOpen.push(draft);
  }

  const vanished = open.filter((e) => !detectedPrints.has(String(e.fingerprint || '')));
  return { toOpen, active, vanished };
}

/**
 * ‹EXE-204› صفوف صندوق القرار — المسجَّل والمكشوف في قائمةٍ واحدة.
 *
 * لماذا معًا؟ لأنّ المشرف لا يعنيه أيّهما «مسجَّل»: يعنيه **ما يحتاج تدخّلًا
 * الآن**. فالمسجَّل يظهر برقمه وحالته، والمكشوف الذي لم يُسجَّل بعد يظهر
 * موسومًا `unregistered` مع زرّ تسجيله — ولا يختفي بحجّة أنّه ليس في السجلّ.
 *
 * ولكلّ صفٍّ **إجراؤه ومسؤوله** من تعريف نوعه: قراءةٌ بلا «افعل كذا» تُترك.
 */
export function boardRows(detections, registry, nowMs) {
  const drafts = detectionsToDrafts(detections);
  const { toOpen, active } = reconcileDetections(drafts, registry);

  const rows = [
    ...(registry || [])
      .filter((e) => isOpenStatus(e?.status))
      .map((e) => ({
        ...e,
        registered: true,
        stillDetected: active.some((a) => a.existing?.id === e.id),
        typeLabel: exceptionType(e.type)?.label || e.type,
        action: e.action || exceptionType(e.type)?.action || '',
        ownerRole: e.ownerRole || exceptionType(e.type)?.owner || '',
        remaining: remainingTime(e, nowMs),
      })),
    ...toOpen.map((d) => ({
      ...d,
      id: null,
      registered: false,
      stillDetected: true,
      typeLabel: exceptionType(d.type)?.label || d.type,
      remaining: remainingTime(d, nowMs),
    })),
  ];

  return sortForBoard(rows, nowMs);
}

/** ترشيحٌ للصندوق — بالخطورة والنوع والحالة، وكلٌّ اختياريّ. */
export function filterRows(rows, { severity, type, onlyUnregistered, onlyOverdue } = {}) {
  return (rows || []).filter((r) => {
    if (severity && r.severity !== severity) return false;
    if (type && r.type !== type) return false;
    if (onlyUnregistered && r.registered) return false;
    if (onlyOverdue && !r.remaining?.overdue) return false;
    return true;
  });
}

/** نصُّ ما يقوله السجلّ حين يزول السبب — تعليمٌ لا إغلاق. */
export const VANISHED_NOTE = 'زال سببه في آخر فحص — يبقى مفتوحًا حتى يُبتّ فيه بقرار.';

/** ملخّصٌ للوحة — المفتوح وما تأخّر وما هو مرتفع الخطورة. */
export function summarize(list, nowMs) {
  const rows = list || [];
  const open = rows.filter((e) => isOpenStatus(e?.status));
  return {
    total: rows.length,
    open: open.length,
    closed: rows.length - open.length,
    high: open.filter((e) => e?.severity === SEVERITY.HIGH).length,
    overdue: open.filter((e) => remainingTime(e, nowMs).overdue).length,
    byType: open.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] || 0) + 1 }), {}),
  };
}
