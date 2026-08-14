/**
 * ماستر المندوبين — النموذج الخالص (SAP-21 · طلب المالك 2026-08-14).
 *
 * ═══ لماذا ماستر؟ ═══
 * المندوب كان **اسمًا حرًّا** يُكتب في رؤوس المستندات (repName) — فسالم
 * وسَالم وسالم أحمد ثلاثةُ مندوبين عند التقارير وهم واحد. والقارئ الوحيد
 * لدليل المستخدمين محصورٌ بالمديرَين فلا تنبثق قائمةٌ لغيرهم. الماستر
 * يعطي المندوبَ هويّةً واحدة تنبثق منها القوائم (SAP-20) وتُنسب إليها
 * الرحلات والعُهد والمستهدفات.
 *
 * ═══ وما ليس هو ═══
 * ليس حسابَ دخولٍ (تلك حسابات الأدوار CC-602 على مسارها) — بل سجلُّ
 * موظّفٍ ميدانيّ: اسمه وهاتفه ومركبته المعتادة وحالته. مندوبٌ له حسابٌ
 * لاحقًا يُربط بحقل `uid` الاختياريّ — لا ازدواج.
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */

const text = (v) => String(v ?? '').trim();

/**
 * حكم إدخال مندوب: الاسم وحده إلزاميّ (هو الهويّة التي تُكتب في المستندات)،
 * والباقي اختياريّ لا يُخترع (§10.6). كلّ ناقصٍ يُقال باسمه.
 * @returns {{ok:boolean, problems:string[], rep:object|null}}
 */
export function repVerdict(raw = {}, existingNames = []) {
  const problems = [];
  const name = text(raw.name);
  if (!name) problems.push('اسم المندوب مطلوب — هو هويّته في المستندات والرحلات.');

  // الاسم المكرّر يصنع مندوبَين وهما واحد — يُرفض بالاسم الموجود.
  const normalized = name.toLowerCase();
  if (name && existingNames.some((n) => text(n).toLowerCase() === normalized)) {
    problems.push(`الاسم «${name}» مسجَّل بالفعل — عدّل السجلّ القائم بدل إنشاء توأم.`);
  }

  const phone = text(raw.phone);
  if (phone && !/^[+\d][\d\s-]{5,}$/.test(phone)) {
    problems.push('رقم الهاتف لا يشبه رقمًا — أرقامٌ (مع + اختيارية) لا أقلّ من ستّ خانات.');
  }

  if (problems.length) return { ok: false, problems, rep: null };
  return {
    ok: true,
    problems: [],
    rep: {
      name,
      phone,
      vehiclePlate: text(raw.vehiclePlate),
      notes: text(raw.notes),
      active: raw.active !== false,
    },
  };
}

/** من يدير المندوبين؟ المديران ومشرف المبيعات — تطابق قاعدة Firestore. */
export const REP_MANAGER_ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];
export function canManageReps(role) {
  return REP_MANAGER_ROLES.includes(role);
}
