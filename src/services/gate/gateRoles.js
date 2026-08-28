/**
 * أدوارُ بوابة الأمن ‹GATE-501› — منطق خالص.
 *
 * ═══ ★★★ ولا نظامَ أدوارٍ ثانٍ ═══
 * درسُ ‹LPN-511› الذي يحرسه هذا الملفّ: قائمةُ أدوارٍ في الكود لا تطابق
 * `firestore.rules` تعني شاشةً تسمح لمن تمنعه القاعدة — فيعمل الموظّف ثمّ
 * يرتدّ عملُه من الخادم وهو لا يفهم لماذا. فالقائمةُ هنا **نسخةُ**
 * `isYardWriter` في القواعد حرفيًّا، ويحرس الاختبارُ تطابقَهما.
 *
 * ═══ ★★★ ولا يُحجَب من لا نعرفه ═══
 * `fetchUserProfile` يحمل تحذيرًا من عطبٍ وقع فعلًا: قراءةٌ فشلت فابتلعها
 * `catch` فعاد الدورُ `viewer` — **فمُنع المديرُ العامّ نفسه بلا رسالة**.
 * فالدورُ المجهول **يمرّ**، والمنعُ الحقيقيّ على الخادم. ومنعٌ بُني على جهلٍ
 * بالهويّة أسوأ من سماحٍ يردّه الخادمُ برسالةٍ واضحة.
 */

/**
 * ★ مَن يكتب في الساحة — **نسخةُ `isYardWriter` في `firestore.rules`**.
 * أيُّ تعديلٍ هنا يلزمه تعديلٌ هناك، ويسقط الاختبارُ إن افترقا.
 */
export const GATE_WRITERS = Object.freeze([
  'admin',
  'warehouse_manager',
  'gate_officer',
  'labor_supervisor',
  'fleet',
]);

/** مَن يقرأ بياناتِ الزائر — ق-٧: أضيقُ من الكتابة عمدًا. */
export const VISITOR_READERS = Object.freeze(['admin', 'warehouse_manager', 'gate_officer']);

/** الأدوارُ التي نعرفها — وما عداها مجهولٌ يمرّ ولا يُحجَب. */
const KNOWN = new Set([
  ...GATE_WRITERS,
  'storekeeper',
  'inventory_auditor',
  'qc_inspector',
  'purchase_officer',
  'finance_manager',
  'return_manager',
  'viewer',
  'department_user',
  'treasury',
  'sales_rep',
  'sales_supervisor',
]);

export function canWriteGate(role) {
  const r = String(role ?? '').trim();
  if (!r || !KNOWN.has(r)) return true; // مجهولٌ يمرّ — والخادمُ هو الحارس.
  return GATE_WRITERS.includes(r);
}

export function canReadVisitor(role) {
  const r = String(role ?? '').trim();
  if (!r || !KNOWN.has(r)) return true;
  return VISITOR_READERS.includes(r);
}

/**
 * بوّابةُ الشاشة — نصُّ المنع يقول **من يملكها** فيذهب الممنوعُ إليه.
 *
 * @returns {{allowed:boolean, known:boolean, message:string}}
 */
export function gateUiGate(role) {
  const r = String(role ?? '').trim();
  const known = Boolean(r) && KNOWN.has(r);
  if (!known) return { allowed: true, known: false, message: '' };
  if (GATE_WRITERS.includes(r)) return { allowed: true, known: true, message: '' };
  return {
    allowed: false,
    known: true,
    message: 'تسجيلُ الدخول والخروج ليس من صلاحيّتك — يملكه ضابطُ البوابة ومشرفُ المناولة والمديران. وما تراه هنا للقراءة.',
  };
}
