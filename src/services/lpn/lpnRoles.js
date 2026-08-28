/**
 * الأدوار المخزنيّة الثمانية ومصفوفةُ (دور × عملية). منطق خالص.
 *
 * المشكلة التي تحلّها: خطة ٧ تسمّي ثمانيةَ أدوارٍ للتنفيذ الميدانيّ، والبوابة
 * تملك أدوارَها القائمة. فإمّا أن يُبنى نظامُ أدوارٍ ثانٍ — فيفترق عن الأوّل
 * ويصير للموظّف صلاحيّتان متناقضتان — وإمّا **تُخرَّط** أدوارُ خطة ٧ على
 * أدوار البوابة.
 *
 * والثانية هي المختارة: **دورٌ واحدٌ للموظّف، وخريطةٌ تقول ماذا يفعل ميدانيًّا**.
 *
 * ═══ درس ل-١٨ الذي يحرسه هذا الملفّ ═══
 * قائمةُ أدوارٍ في الكود لا تطابق `firestore.rules` تعني **شاشةً تمنع من
 * تسمح له القاعدة** — أو أسوأ: شاشةً تسمح لمن تمنعه القاعدة، فيعمل الموظّف
 * ثمّ يرتدّ عمله من الخادم وهو لا يفهم لماذا.
 */

/** أدوارُ خطة ٧ الثمانية — بأسمائها كما وردت. */
export const FIELD_ROLES = Object.freeze({
  RECEIVER: 'موظّف الاستلام',
  PUTAWAY: 'موظّف التوجيه والتخزين',
  PICKER: 'محضّر الطلبات',
  LOADER: 'موظّف التجهيز والتحميل',
  COUNTER: 'موظّف الجرد',
  GOVERNANCE: 'موظّف الحوكمة',
  SUPERVISOR: 'مشرف المخزن',
  ADMIN: 'مدير النظام',
});

/**
 * ★ خريطةُ أدوار البوابة القائمة إلى أدوار الميدان.
 *
 * دورٌ واحدٌ قد يحمل أكثر من وظيفةٍ ميدانيّة — وهو واقعُ مستودعٍ صغير:
 * أمينُ المخزن يستلم ويخزّن ويحضّر. والفصلُ يقع حيث يجب: **من يكوّن الطبلية
 * لا يعتمدها**.
 */
export const PORTAL_TO_FIELD = Object.freeze({
  admin: ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER', 'COUNTER', 'GOVERNANCE', 'SUPERVISOR', 'ADMIN'],
  warehouse_manager: ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER', 'COUNTER', 'GOVERNANCE', 'SUPERVISOR'],
  storekeeper: ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER'],
  inventory_auditor: ['COUNTER'],
  qc_inspector: ['GOVERNANCE'],
  gate_officer: ['LOADER'],
  labor_supervisor: ['PUTAWAY', 'LOADER'],
  fleet: ['LOADER'],
});

/** العمليات الميدانيّة التي تحكمها المصفوفة. */
export const FIELD_OPS = Object.freeze({
  RECEIVE: 'الاستلام بالمسح',
  PUTAWAY: 'التوجيه والتخزين',
  PICK: 'التحضير والسحب',
  STAGE: 'التجهيز',
  LOAD: 'التحميل',
  COUNT: 'الجرد',
  APPROVE: 'اعتماد الحوكمة',
  PRINT: 'طباعة الملصق',
  REPRINT: 'إعادة الطباعة',
  OVERRIDE: 'التجاوز بصلاحية',
  ADJUST: 'اعتماد التسوية',
});

/** ★★ مصفوفة (دورٌ ميدانيّ × عملية) — مصدرُ الحقيقة الوحيد للصلاحية. */
export const ROLE_OPS = Object.freeze({
  RECEIVER: ['RECEIVE', 'PRINT'],
  PUTAWAY: ['PUTAWAY'],
  PICKER: ['PICK', 'STAGE'],
  LOADER: ['STAGE', 'LOAD'],
  COUNTER: ['COUNT'],
  // ★ الحوكمة تعتمد وتطبع وتعيد الطباعة — ولا تنفّذ ميدانيًّا: من يعتمد
  // لا ينبغي أن يكون هو من كوّن.
  GOVERNANCE: ['APPROVE', 'PRINT', 'REPRINT'],
  SUPERVISOR: ['OVERRIDE', 'REPRINT', 'ADJUST'],
  ADMIN: Object.keys(FIELD_OPS),
});

/** أدوارُ الميدان لدورِ بوابةٍ ما. */
export function fieldRolesOf(portalRole) {
  return PORTAL_TO_FIELD[portalRole] ?? [];
}

/** العمليات المسموحة لدور بوابةٍ — اتحادُ عملياتِ أدواره الميدانيّة. */
export function opsOf(portalRole) {
  const ops = new Set();
  for (const fr of fieldRolesOf(portalRole)) {
    for (const op of ROLE_OPS[fr] ?? []) ops.add(op);
  }
  return [...ops];
}

/** أيملك هذا الدور هذه العملية؟ */
export function canDo(portalRole, op) {
  return opsOf(portalRole).includes(op);
}

/**
 * سبب المنع نصًّا — أو '' إن جاز.
 *
 * ★ ويقول **من يملكها**: موظّفٌ يُمنع ولا يعرف إلى من يذهب يبحث عمّن يمرّره،
 * وموظّفٌ يُقال له «هذه لمشرف المخزن» يذهب إليه.
 */
export function opProblem(portalRole, op) {
  if (!Object.hasOwn(FIELD_OPS, op)) return `العملية «${op}» غير معروفة.`;
  if (canDo(portalRole, op)) return '';
  const owners = Object.entries(ROLE_OPS)
    .filter(([, ops]) => ops.includes(op))
    .map(([fr]) => FIELD_ROLES[fr]);
  return `«${FIELD_OPS[op]}» ليست من صلاحيّتك — يملكها: ${owners.join(' · ') || 'مدير النظام'}.`;
}

/**
 * 🔒 حصرُ المستودع: الموظّف يعمل في مستودعه لا في غيره (خطة ٧ تاسعًا).
 *
 * والمديران فوق الحصر: يريان المستودعات كلّها.
 */
export function warehouseProblem(portalRole, { userWarehouse, targetWarehouse } = {}) {
  if (['admin', 'warehouse_manager'].includes(portalRole)) return '';
  const mine = String(userWarehouse ?? '').trim().toUpperCase();
  const there = String(targetWarehouse ?? '').trim().toUpperCase();
  if (!mine || !there || mine === there) return '';
  return `أنت مسجَّلٌ في مستودع «${mine}» والعملية في «${there}» — راجع مشرفك لتغيير موقعك.`;
}

/**
 * الجردُ الأعمى: هل يرى هذا الدور الكمّيّة الدفتريّة أثناء العدّ؟
 *
 * ★ الجواب **لا لأحد** — وهو ليس صلاحيّةً بل قاعدةُ الطبقة (ح-٣ · CAP-101):
 * «الالتقاط لا يُحاسِب». فالدالّة موجودةٌ لتقول ذلك صراحةً لمن يسأل، لا
 * لتفتح بابًا.
 */
export function seesBookQtyWhileCounting() {
  return false;
}

/**
 * ★★★ بوّابةُ الشاشة — **لا تحجب من لا تعرفه** ‹LPN-511›.
 *
 * ═══ لماذا هذا القيد بالذات؟ ═══
 * `fetchUserProfile` يحمل تحذيرًا من عطبٍ وقع فعلًا (2026-08-17): قراءةٌ
 * فشلت فابتلعها `catch` فعاد الدورُ `viewer` — **فمُنع المديرُ العام نفسه
 * بلا رسالةِ خطأ**. الشاشةُ قالت «لا صلاحيّة» وهي لم تعرف من هو أصلًا.
 *
 * فالقاعدة هنا: **الدورُ المجهول يمرّ**. لأنّ المنعَ الحقيقيّ في
 * `firestore.rules` على الخادم — والشاشةُ تُحسّن التجربة (لا تعرض زرًّا
 * سيرتدّ) ولا تكون هي الحارس. ومنعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ
 * يردّه الخادمُ برسالةٍ واضحة.
 *
 * (وهو نمطُ `scopeVerdict.ok` في طبقة الالتقاط: «لا يقطع الفريق».)
 *
 * @returns {{allowed:boolean, known:boolean, message:string}}
 */
export function uiGate(portalRole, op) {
  const known = Object.hasOwn(PORTAL_TO_FIELD, portalRole);
  if (!known) return { allowed: true, known: false, message: '' };
  const message = opProblem(portalRole, op);
  return { allowed: !message, known: true, message };
}

/** ملخّصُ ما يستطيعه الموظّف — للعرض لا للمنع. */
export function roleSummary(portalRole) {
  const fields = fieldRolesOf(portalRole);
  return {
    known: Object.hasOwn(PORTAL_TO_FIELD, portalRole),
    fieldLabels: fields.map((f) => FIELD_ROLES[f]).filter(Boolean),
    opLabels: opsOf(portalRole).map((o) => FIELD_OPS[o]).filter(Boolean),
  };
}
