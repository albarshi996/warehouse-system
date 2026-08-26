/**
 * دورة حالات الطبلية — مصفوفة الانتقالات وحارسها. منطق خالص بلا Firebase.
 *
 * المشكلة التي يحلّها: حمولةٌ بلا دورة حياةٍ تُصرف قبل أن تُعتمد، وتُحمَّل
 * قبل أن تُفحص، وتقف «في موقعين» لأنّ أحدًا لم يقل أين هي في الدورة أصلًا.
 * خطة ٧ نصّت الدورتين نصًّا — وهذا الملف يجعل النصّ مصفوفةً يستحيل خرقها
 * بلا أثر.
 *
 * ═══ القاعدتان الحاكمتان (docs/خطة-طبقة-الطبالي.md §٦) ═══
 *
 * ١· **الحالة قيمةٌ واحدة، والاستثنائيّة وسمٌ منفصل لا يمحو موضع الدورة.**
 *    طبليةٌ «تحت الفحص» وهي بانتظار التخزين تبقى بانتظار التخزين — يُرفع
 *    الفحص فتُكمل من حيث وقفت، لا من أوّل الدورة. حالةٌ تُداس بالوسم تعني
 *    ضياع الموضع عند رفع الوسم — وهو عين «حالتين متعارضتين» الممنوع.
 *
 * ٢· **الانتقال خارج المصفوفة يمرّ بصلاحية استثنائية تُسجَّل — لا يُمنع صمتًا
 *    ولا يمرّ صمتًا.** عرف البيت (ق-٣ في الالتقاط): الحارس يمرّر بسبب إلزامي
 *    يُقيَّد، لا بوّابة توقف العامل. والقفزة بلا سببٍ مرفوضة برسالةٍ تقول
 *    الصواب: أين تقف الطبلية وما المسموح منها.
 *
 * الكتابة الفعليّة (حفظ الحالة والحدث) في `lpnService.js` — هنا الحكم وحده.
 */

/**
 * حالات الدورة — من التكوين إلى الصرف. القيمة هي المخزَّن والعنوان للعرض.
 *
 * ★ «متاحة» في نصّ خطة ٧ **ليست حالةً مخزَّنة بل مشتقّة**: متاحة = `STORED`
 * بلا وسمٍ حاجب (`isAvailable` أدناه). حالةٌ مخزَّنة باسم «متاحة» كانت
 * ستفترق عن الأوسمة أوّلَ وسمٍ — عرف «يُشتقّ ولا يُكتب».
 *
 * و`CANCELLED` تسدّ وعد «الإلغاء حالةٌ وحدثٌ لا محو»: طبليةٌ جُسّدت خطأً
 * تُلغى بقرار حوكمةٍ استثنائيٍّ بسبب (لا انتقال عاديّ إليها — override
 * وحده يبلغها فيُقيَّد قراره)، وهي ختاميّةٌ كالمصروفة.
 */
export const LPN_STATES = Object.freeze({
  DRAFT: 'قيد الإنشاء',
  SCANNING: 'قيد القراءة',
  PENDING_GOVERNANCE: 'بانتظار الحوكمة',
  APPROVED: 'معتمدة',
  LABEL_PRINTED: 'طُبع الملصق',
  PENDING_PUTAWAY: 'بانتظار التخزين',
  STORED: 'مخزَّنة',
  RESERVED: 'محجوزة لأمر',
  PICKING: 'قيد التحضير',
  ISSUE_CLOSED: 'طبلية صرف مغلقة',
  STAGED: 'في منطقة التجهيز',
  LOADING: 'قيد التحميل',
  LOADED: 'محمَّلة',
  ISSUED: 'مصروفة',
  CANCELLED: 'ملغاة',
});

/**
 * الأوسمة الاستثنائيّة (خطة ٧ عاشرًا) — تدخل من أيّ حالة بسببٍ إلزاميّ وتُرفع
 * بقرار حوكمة. «محجوزة» هنا حجزُ حوكمةٍ رقابيّ — غير `RESERVED` الحجز لأمرٍ
 * في دورة الصرف: الأوّل يوقف والثاني يَعِد.
 */
export const LPN_FLAGS = Object.freeze({
  ON_HOLD: 'موقوفة',
  GOVERNANCE_HOLD: 'محجوزة حوكميًّا',
  INSPECTION: 'تحت الفحص',
  DAMAGED: 'تالفة',
  REJECTED: 'مرفوضة',
  EXPIRED: 'منتهية الصلاحية',
  UNDER_COUNT: 'تحت الجرد',
  MISSING: 'مفقودة',
  UNDER_INVESTIGATION: 'بانتظار التحقيق',
});

/**
 * مصفوفة الانتقالات المسموحة — دورتا خطة ٧ حرفيًّا، مع رجوعين مقصودين:
 * الحوكمة تُرجع للتصحيح (القراءة)، والحجز لأمرٍ يُفكّ (للمخزَّنة).
 *
 * `STORED → PICKING` مباشرةً مقصودة أيضًا: طبليةٌ كاملة تؤخذ للتحضير دون
 * حجزٍ مسبق — الحجز وعدٌ سابق، والسحب المباشر واقعُ مستودعٍ لا يُمنع.
 */
export const LPN_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['SCANNING']),
  SCANNING: Object.freeze(['PENDING_GOVERNANCE']),
  PENDING_GOVERNANCE: Object.freeze(['APPROVED', 'SCANNING']),
  APPROVED: Object.freeze(['LABEL_PRINTED']),
  LABEL_PRINTED: Object.freeze(['PENDING_PUTAWAY']),
  PENDING_PUTAWAY: Object.freeze(['STORED']),
  STORED: Object.freeze(['RESERVED', 'PICKING']),
  RESERVED: Object.freeze(['PICKING', 'STORED']),
  PICKING: Object.freeze(['ISSUE_CLOSED']),
  ISSUE_CLOSED: Object.freeze(['STAGED']),
  STAGED: Object.freeze(['LOADING']),
  LOADING: Object.freeze(['LOADED']),
  LOADED: Object.freeze(['ISSUED']),
  ISSUED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

/**
 * حالات الميلاد المشروعة: `DRAFT` للاستلام، و`PICKING` لطبلية صرفٍ أو نقلٍ
 * تُكوَّن أثناء التحضير — تولد وهي قيد التحضير لا قبل الدورة.
 */
export const LPN_INITIAL_STATES = Object.freeze(['DRAFT', 'PICKING']);

/**
 * الحالات الختاميّة — بعدها لا انتقال، والهويّة لا يُعاد استخدامها أبدًا.
 * `ISSUED` نهايةُ الدورة الطبيعيّة، و`CANCELLED` إغلاقٌ إداريٌّ بقرار حوكمة.
 */
export const LPN_TERMINAL_STATES = Object.freeze(['ISSUED', 'CANCELLED']);

/** توافقًا: الختاميّة الأولى — الدورة الطبيعيّة. */
export const LPN_TERMINAL_STATE = 'ISSUED';

/**
 * الأوسمة التي تمنع دورة الصرف: طبليةٌ تحمل أحدها لا تُحجز ولا تُسحب ولا
 * تُحمَّل حتى يُرفع بقرار حوكمة. (`UNDER_COUNT` لا يمنع — «لا مهمّة تحجب
 * العادّ» ولا العكس: الجردُ يلتقط والعملُ يمضي، والفرق يظهر في المطابقة.)
 */
export const ISSUE_BLOCKING_FLAGS = Object.freeze([
  'ON_HOLD',
  'GOVERNANCE_HOLD',
  'INSPECTION',
  'DAMAGED',
  'REJECTED',
  'EXPIRED',
  'MISSING',
  'UNDER_INVESTIGATION',
]);

/** الانتقالات التي هي قراراتُ صرفٍ — عليها يقع منع الأوسمة الحاجبة. */
const ISSUE_TRANSITIONS = new Set(['RESERVED', 'PICKING', 'ISSUE_CLOSED', 'STAGED', 'LOADING', 'LOADED', 'ISSUED']);

/** عنوان الحالة للعرض — من المصفوفة لا من نصٍّ حرّ. */
export function stateLabel(state) {
  return LPN_STATES[state] ?? '';
}

/** أوسمة الطبلية الفعّالة — القراءة متسامحة مع الغائب. */
export function activeFlags(unit) {
  // `hasOwn` لا `in`: سجلٌّ فاسد يحمل «toString» كان يمرّ عبر سلسلة النموذج
  // الأوّليّ فيُقرأ وسمًا معروفًا — والحارس وُجد ليلطف مع الفاسد لا ليُخدع به.
  return (unit?.flags ?? []).filter((f) => Object.hasOwn(LPN_FLAGS, f));
}

/**
 * ★ «متاحة» في نصّ خطة ٧ — مشتقّةٌ لا مخزَّنة: مخزَّنةٌ بلا وسمٍ حاجب.
 * (القرار مقيَّد في docs/خطة-طبقة-الطبالي.md §٦ كما قُيّد قرار الفحص-وسمًا.)
 */
export function isAvailable(unit) {
  return unit?.state === 'STORED' && !isBlockedForIssue(unit);
}

/** أتحمل الطبلية وسمًا يحجب الصرف؟ (LPN-302 سيبني عليها موانعه.) */
export function isBlockedForIssue(unit) {
  return activeFlags(unit).some((f) => ISSUE_BLOCKING_FLAGS.includes(f));
}

/**
 * سبب رفض الانتقال نصًّا عربيًّا — أو '' إن كان مشروعًا.
 *
 * الترتيب هو الحارس: (١) حالةٌ معروفة، (٢) لا انتقال بعد الختام، (٣) وسمٌ
 * حاجب يمنع قرارات الصرف، (٤) المصفوفة — والقفزة خارجها تمرّ **فقط** بسببٍ
 * استثنائيٍّ مكتوب (`override` مع `overrideNote`).
 */
export function transitionProblem(current, next, { override = false, overrideNote = '' } = {}) {
  if (!Object.hasOwn(LPN_TRANSITIONS, current)) return `حالة الطبلية «${current}» غير معروفة — سجلّها يحتاج مراجعة لا انتقالًا.`;
  if (!Object.hasOwn(LPN_STATES, next)) return `الحالة المطلوبة «${next}» غير معروفة.`;
  if (LPN_TERMINAL_STATES.includes(current)) {
    return `الطبلية «${stateLabel(current)}» — دورةُ هذه الهويّة انتهت ولا يُعاد استخدامها؛ الحمولة الجديدة تأخذ هويّةً جديدة.`;
  }

  const allowed = LPN_TRANSITIONS[current];
  if (allowed.includes(next)) return '';

  if (override) {
    if (!String(overrideNote ?? '').trim()) {
      return 'الانتقال الاستثنائيّ يحتاج سببًا مكتوبًا — يُقيَّد باسم صاحبه ويبقى في السجلّ.';
    }
    return '';
  }
  const options = allowed.length ? allowed.map((s) => `«${stateLabel(s)}»`).join(' أو ') : 'لا شيء';
  return `الطبلية «${stateLabel(current)}» والمسموح منها: ${options} — لا «${stateLabel(next)}». القفزة تحتاج صلاحية استثنائية بسبب.`;
}

/**
 * سبب رفض انتقال **طبليةٍ** بعينها — يضمّ إلى المصفوفة منعَ الأوسمة الحاجبة
 * عن قرارات الصرف. (منفصلة عن `transitionProblem` لأنّ الأولى تحكم المصفوفة
 * المجرّدة وهذه تحكم الحمولة بواقعها.)
 */
export function unitTransitionProblem(unit, next, opts = {}) {
  const base = transitionProblem(unit?.state, next, opts);
  if (base) return base;
  if (ISSUE_TRANSITIONS.has(next) && isBlockedForIssue(unit) && !opts.override) {
    const flags = activeFlags(unit)
      .filter((f) => ISSUE_BLOCKING_FLAGS.includes(f))
      .map((f) => `«${LPN_FLAGS[f]}»`)
      .join(' و');
    return `الطبلية موسومة ${flags} — لا تدخل دورة الصرف حتى يُرفع الوسم بقرار حوكمة.`;
  }
  return '';
}

/**
 * ★★ سبب رفض **تغيير محتوى** طبلية — أو '' إن كان مشروعًا.
 *
 * ثغرةٌ كشفتها المراجعة العدائية: حارس `ISSUE_BLOCKING_FLAGS` يحمي
 * **الانتقالات** وحدها، والسحبُ الجزئيّ والتقسيمُ والدمج **لا تغيّر حالةً**
 * — فطبليةٌ تالفةٌ أو مصروفةٌ كانت تُقسَّم فتولد بنتٌ نظيفةُ الأوسمة تدخل
 * دورة الصرف: **الوسم يُغسل بالتقسيم**. فكلّ ما يمسّ الحمولة يمرّ من هنا.
 */
export function contentChangeProblem(unit, { override = false, overrideNote = '' } = {}) {
  if (LPN_TERMINAL_STATES.includes(unit?.state)) {
    return `الطبلية «${stateLabel(unit.state)}» — دورتها انتهت فلا تُمسّ حمولتها؛ ما خرج يُصحَّح بحركةٍ عكسيةٍ معتمدة لا بتعديل الحمولة.`;
  }
  if (isBlockedForIssue(unit)) {
    if (!override) {
      const flags = activeFlags(unit)
        .filter((f) => ISSUE_BLOCKING_FLAGS.includes(f))
        .map((f) => `«${LPN_FLAGS[f]}»`)
        .join(' و');
      return `الطبلية موسومة ${flags} — لا تُقسَّم ولا تُدمَج ولا يُسحب منها حتى يُرفع الوسم بقرار حوكمة.`;
    }
    if (!String(overrideNote ?? '').trim()) {
      return 'مسّ حمولةٍ موسومةٍ يحتاج سببًا مكتوبًا — يُقيَّد باسم صاحبه ويبقى في السجلّ.';
    }
  }
  return '';
}

/** حكم الانتقال للشاشات: `{ok, message}` — عرف `xVerdict` القائم. */
export function transitionVerdict(unit, next, opts = {}) {
  const problem = unitTransitionProblem(unit, next, opts);
  return problem ? { ok: false, message: problem } : { ok: true, message: '' };
}

/**
 * تطبيق الانتقال — يعيد طبليةً **جديدة** ولا يعدّل الأصل (عرف الدوال الخالصة).
 *
 * @returns {{unit:object}|{problem:string}} الطبلية بعد الانتقال، أو سبب الرفض.
 */
export function applyTransition(unit, next, { actor, at, override = false, overrideNote = '' } = {}) {
  const problem = unitTransitionProblem(unit, next, { override, overrideNote });
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'الانتقال بلا فاعلٍ لا يُسجَّل — من نقل الطبلية؟' };
  return {
    unit: {
      ...unit,
      state: next,
      stateChangedAt: at ?? unit?.stateChangedAt ?? null,
      stateChangedBy: actor,
      ...(override ? { lastOverride: { from: unit?.state, to: next, note: overrideNote, actor, at: at ?? null } } : {}),
    },
  };
}

/** سبب رفض الوسم — الوسم يدخل بسببٍ إلزاميّ من فاعلٍ معلوم. */
export function flagProblem(unit, flag, { reason, actor } = {}) {
  if (!Object.hasOwn(LPN_FLAGS, flag)) return `الوسم «${flag}» غير معروف.`;
  if (!String(reason ?? '').trim()) return `وسم «${LPN_FLAGS[flag]}» يحتاج سببًا مكتوبًا — يبقى في السجلّ للأبد.`;
  if (!String(actor ?? '').trim()) return 'الوسم بلا فاعلٍ لا يُسجَّل.';
  if (activeFlags(unit).includes(flag)) return `الطبلية موسومة «${LPN_FLAGS[flag]}» أصلًا — لا يُكرَّر الوسم.`;
  return '';
}

/** وسم الطبلية — يعيد نسخةً جديدة، والحالة لا تُمسّ (القاعدة الحاكمة ١). */
export function applyFlag(unit, flag, ctx = {}) {
  const problem = flagProblem(unit, flag, ctx);
  if (problem) return { problem };
  return { unit: { ...unit, flags: [...activeFlags(unit), flag] } };
}

/** رفع الوسم — بقرار حوكمةٍ مكتوب، والطبلية تُكمل من موضعها لا من أوّلها. */
export function clearFlag(unit, flag, { decision, actor } = {}) {
  if (!activeFlags(unit).includes(flag)) return { problem: `الطبلية ليست موسومة «${LPN_FLAGS[flag] ?? flag}».` };
  if (!String(decision ?? '').trim()) return { problem: 'رفع الوسم قرارُ حوكمةٍ يحتاج نصًّا — ماذا تقرّر ولماذا؟' };
  if (!String(actor ?? '').trim()) return { problem: 'رفع الوسم بلا فاعلٍ لا يُسجَّل.' };
  return { unit: { ...unit, flags: activeFlags(unit).filter((f) => f !== flag) } };
}

/** سبب رفض حالة الميلاد — الطبلية تولد `DRAFT` استلامًا أو `PICKING` صرفًا. */
export function initialStateProblem(state) {
  if (LPN_INITIAL_STATES.includes(state)) return '';
  return `الطبلية لا تولد «${stateLabel(state) || state}» — الميلاد ${LPN_INITIAL_STATES.map((s) => `«${stateLabel(s)}»`).join(' أو ')}.`;
}
