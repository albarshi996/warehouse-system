/**
 * آلة حالات المستند — من يملك تحريكه، وإلى أين.
 *
 * لماذا ملف مستقلّ؟ لأن هذه القواعد تُفرَض في **ثلاث طبقات**:
 *   1. الواجهة (تُخفي الزرّ) — من هنا.
 *   2. الخدمة (ترفض النقلة) — من هنا.
 *   3. قواعد أمان Firestore (لا تُتجاوَز حتى برمجيًّا) — انظر firestore.rules.
 * الطبقتان الأوليان تجربةُ مستخدم؛ الثالثة هي الحارس. تبقى الثلاث متسقة
 * لأنها تقرأ نفس الجدول أدناه.
 *
 * الرسم:
 *   مسودّة ⇄ مرفوض
 *      ↓
 *   مُرسَل → معتمَد → منجَز → مغلق
 *      ↓         ↓
 *   مرفوض      ملغى
 *
 * ═══ لماذا حالتان جديدتان؟ (SAP-4 · قرار المالك 2026-08-13 · يسدّ ف‑١٤) ═══
 * كانت الخمس تصف **رحلة الاعتماد** ولا تصف **مصير التنفيذ**. فأمرُ شراءٍ
 * طُلب فيه ١٠٠ ووصل ٩٥ وقُرّر ألّا يُنتظر الباقي، لم يكن له قولٌ في النظام:
 * يبقى وكأنّ خمسًا في الطريق أبدًا. ومستندٌ أُنشئ خطأً لم يكن له إلا الحذف
 * — والحذف يفقد الأثر.
 *
 * §11.2 ‹272› يمنع صراحةً المساواة بين `Closed` و`Canceled`، فهما مختلفان:
 *   **مغلق**  = المستند صحيح، ولن نُنفّذ المتبقّي.
 *   **ملغى**  = المستند لم يعد عمليّةً صحيحة، **ولا يُحذف من التاريخ**.
 *
 * ═══ ولماذا لا يُلغى المنجَز؟ ═══
 * لأنّ `done` رحّلت حركاتٍ في دفترٍ **ملحق-فقط**. فقلبُ حالته يترك أثرًا
 * مخزنيًّا بلا مستندٍ يبرّره — وهو ما تمنعه §14 ‹378›. التصحيح بعد الإنجاز
 * يكون **بمستندٍ عكسيّ** لا بحالة (§16.9 ‹660› · المرجع ‹4148›).
 *
 * ═══ وثلاث حالاتٍ لا تُخزَّن ═══
 * «مفتوح» و«منفَّذ جزئيًّا» و«مكتمل» **تُحسب** من الرصيد المفتوح في
 * `documentFlow`، ولا تُحفظ حقلًا. المخزَّن يتقادم ويتعارض؛ والمحسوب لا
 * يكذب أبدًا. انظر `executionStatus` أدناه.
 */

export const STATES = {
  draft: { id: 'draft', label: 'مسودّة', color: '#6b7280', icon: 'draft' },
  submitted: { id: 'submitted', label: 'بانتظار الاعتماد', color: '#8a6d1b', icon: 'clock' },
  approved: { id: 'approved', label: 'معتمَد', color: '#1e7e34', icon: 'check' },
  rejected: { id: 'rejected', label: 'مرفوض', color: '#b02a37', icon: 'x' },
  done: { id: 'done', label: 'منجَز', color: '#146c43', icon: 'flag' },
  // ── الجديدتان ──
  closed: { id: 'closed', label: 'مغلق', color: '#5f5668', icon: 'lock', hint: 'صحيحٌ، ولن يُنفَّذ المتبقّي' },
  canceled: { id: 'canceled', label: 'ملغى', color: '#8a6d1b', icon: 'ban', hint: 'لم يعد عمليّةً صحيحة — ويبقى في السجلّ' },
};

/**
 * الحالات المنتهية: لا نقلة بعدها ولا اشتقاق منها.
 * `done` ليست منها — المنجَز يبقى مصدرًا للاشتقاق حتى يُغلق.
 */
export const TERMINAL_STATES = ['closed', 'canceled'];

/** هل الحالة منتهية؟ */
export function isTerminal(stateId) {
  return TERMINAL_STATES.includes(stateId);
}

/**
 * هل يجوز الاشتقاق من مستندٍ في هذه الحالة؟
 *
 * المغلق أُوقف تنفيذه عمدًا، والملغى لم يعد صحيحًا — فلا يُجلب منهما.
 * وهذا ما يجعل «جلب من مستند سابق» يعرض المؤهّل فقط (§12.2 ‹301›).
 */
export function canDeriveFrom(stateId) {
  return stateId === 'approved' || stateId === 'done';
}

export const INITIAL_STATE = 'draft';

/** الحالات التي يجوز فيها تعديل الحقول. ما عداها مقروء فقط. */
export const EDITABLE_STATES = ['draft', 'rejected'];

/**
 * النقلات المسموحة. لكل نقلة:
 *   to        — الحالة الهدف
 *   label     — نصّ الزرّ
 *   by        — من يملكها: 'creator' (من أنشأ) أو مفتاح أدوار في مخطّط النموذج
 *   needsNote — هل تُلزِم بسبب مكتوب (الرفض يلزم دائمًا)
 *
 * 🥇 حارس الجودة: لا سبيل من `submitted` إلى `done` مباشرة — لا بدّ من
 * المرور بـ`approved`. أي أن «تمّ الاستلام» مستحيل قبل اعتماد الجودة،
 * وهذا هو نفس منطق `stock.picking.button_validate` في الموديول.
 */
export const TRANSITIONS = {
  draft: [
    { to: 'submitted', label: 'إرسال للاعتماد', by: 'creator' },
    { to: 'canceled', label: 'إلغاء', by: 'creator', needsNote: true },
  ],
  rejected: [
    { to: 'submitted', label: 'تصحيح وإعادة الإرسال', by: 'creator' },
    { to: 'canceled', label: 'إلغاء', by: 'creator', needsNote: true },
  ],
  // **لا إلغاء من «مُرسَل».** حاولتُ إتاحته أوّلًا فأسقط اختبارًا قائمًا كان
  // يحرس قاعدةً صريحة: «لا يرى أمين المخزن أيّ إجراء على مستندٍ ينتظر الجودة».
  // والقاعدة صحيحة: ما خرج من يد صاحبه إلى المراجعة لا يُسحب من تحت المراجع.
  // ومخرجُ الخطأ موجودٌ أصلًا: يرفضه المراجع فيعود «مرفوضًا»، وعندها يُلغيه
  // صاحبه. وإتاحة الإلغاء هنا كانت **سلطةً جديدة** لا مصدر لها — §3-٩ ‹48›.
  submitted: [
    { to: 'approved', label: 'اعتماد', by: 'approve' },
    { to: 'rejected', label: 'رفض', by: 'approve', needsNote: true },
  ],
  approved: [
    { to: 'done', label: 'إنهاء المستند', by: 'complete' },
    // الإلغاء متاحٌ هنا لأنّ المعتمَد **لم يُرحّل بعد**: الترحيل عند `done` حصرًا
    // (`postingRules.js`). فالإلغاء قبله لا يترك أثرًا يتيمًا.
    { to: 'canceled', label: 'إلغاء', by: 'approve', needsNote: true },
    // ويجوز إغلاقه دون إنجاز: التزامٌ لن يُنفَّذ.
    { to: 'closed', label: 'إغلاق — لن يُنفَّذ المتبقّي', by: 'complete', needsNote: true },
  ],
  done: [
    // **الإغلاق وحده بعد الإنجاز.** لا إلغاء: المنجَز رحّل حركاتٍ في دفترٍ
    // ملحق-فقط، فقلبُ حالته يترك أثرًا بلا مستندٍ يبرّره. التصحيح بمستندٍ
    // عكسيّ لا بحالة (§16.9 ‹660›).
    { to: 'closed', label: 'إغلاق — لن يُنفَّذ المتبقّي', by: 'complete', needsNote: true },
  ],
  closed: [],
  canceled: [],
};

/** يُعيد كائن الحالة، أو المسودّة إن كان المعرّف غير معروف. */
export function getState(stateId) {
  return STATES[stateId] || STATES[INITIAL_STATE];
}

/** هل يجوز تعديل حقول مستند في هذه الحالة؟ */
export function isEditable(stateId) {
  return EDITABLE_STATES.includes(stateId);
}

/**
 * هل يملك هذا المستخدم هذه النقلة؟
 * الأدمن يملك كل شيء (المدير العام يرى ويفعل كل شيء — ROADMAP §8 ركيزة 1).
 */
export function canDo(transition, { role, uid }, schema, docData) {
  if (role === 'admin') return true;
  if (transition.by === 'creator') return docData?.createdByUid === uid;
  const allowed = schema?.roles?.[transition.by] || [];
  return allowed.includes(role);
}

/** النقلات المتاحة فعليًّا لهذا المستخدم على هذا المستند. */
export function availableTransitions(docData, user, schema) {
  const list = TRANSITIONS[docData?.state] || [];
  return list.filter((t) => canDo(t, user, schema, docData));
}

/** هل النقلة من→إلى مسموحة أصلًا في الجدول؟ (تحقّق مستقلّ عن الدور) */
export function isLegalTransition(from, to) {
  return (TRANSITIONS[from] || []).some((t) => t.to === to);
}

/* ═══════════════ حالة التنفيذ — محسوبةٌ لا مخزَّنة ═══════════════ */

/** حالات التنفيذ الثلاث. تُشتقّ ولا تُحفظ حقلًا. */
export const EXECUTION_STATUS = {
  none: { id: 'none', label: 'بلا تنفيذ', color: '#5f5668' },
  open: { id: 'open', label: 'مفتوح', color: '#8a6d1b' },
  partial: { id: 'partial', label: 'منفَّذ جزئيًّا', color: '#8a6d1b' },
  fulfilled: { id: 'fulfilled', label: 'مكتمل', color: '#146c43' },
  closed: { id: 'closed', label: 'مغلق قبل الاكتمال', color: '#5f5668' },
};

/**
 * حالة تنفيذ مستند: كم طُلب وكم نُفِّذ وكم بقي مفتوحًا.
 *
 * **لا تُخزَّن.** تُحسب من الرصيد المفتوح الذي يبنيه `documentFlow` من روابط
 * الأسطر. والسبب مبدئيّ لا تقنيّ: الرقم المخزَّن يتقادم لحظةَ يُنشأ مستندٌ
 * لاحق، ثمّ يتعارض مع الروابط ولا يُعرف أيّهما الصادق. أمّا المحسوب فيقول
 * الحقيقة دائمًا لأنّه لا يملك تاريخًا خاصًّا به.
 *
 * والحالة المخزَّنة تحكم أوّلًا: المغلق مغلقٌ ولو بقيت كمّيّة، والملغى لا
 * تنفيذ له أصلًا — فرقمُ المتبقّي فيهما لا معنى له.
 *
 * @param {string} stateId حالة المستند المخزَّنة
 * @param {{capacity:number, executed:number}|null} totals إجماليّات الرصيد المفتوح
 * @returns {{id:string, label:string, color:string, capacity:number, executed:number, open:number, ratio:number}}
 */
export function executionStatus(stateId, totals = null) {
  const capacity = Math.max(0, Number(totals?.capacity) || 0);
  const executed = Math.max(0, Number(totals?.executed) || 0);
  const open = Math.round(Math.max(0, capacity - executed) * 1e9) / 1e9;
  const ratio = capacity > 0 ? Math.min(1, executed / capacity) : 0;
  const shape = (s) => ({ ...s, capacity, executed, open, ratio });

  if (stateId === 'canceled') return shape({ ...EXECUTION_STATUS.none, label: 'ملغى — لا تنفيذ' });
  if (stateId === 'closed') {
    return shape(open > 0 ? EXECUTION_STATUS.closed : EXECUTION_STATUS.fulfilled);
  }
  if (!capacity) return shape(EXECUTION_STATUS.none);
  if (executed <= 0) return shape(EXECUTION_STATUS.open);
  if (open > 0) return shape(EXECUTION_STATUS.partial);
  return shape(EXECUTION_STATUS.fulfilled);
}

/**
 * هل يبقى للمستند رصيدٌ مفتوح يستحقّ الظهور في «المستندات المفتوحة»؟
 *
 * المغلق والملغى يخرجان مهما بقي فيهما رقم — وهذا هو معنى الإغلاق: أن يخرج
 * من صندوق العمل اليوميّ. وبلا هذه الحالة كان الصندوق يمتلئ بما انتهى فعلًا.
 */
export function hasOpenWork(stateId, totals = null) {
  if (isTerminal(stateId)) return false;
  if (!canDeriveFrom(stateId)) return false;
  return executionStatus(stateId, totals).open > 0;
}
