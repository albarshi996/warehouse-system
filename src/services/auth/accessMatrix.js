/**
 * مصفوفة الصلاحيات القابلة للتحرير — «العملية الجراحية» المحور ٢-ب.
 *
 * طبقة **اختيارية** تركب فوق كتالوج القائمة (`navCatalog.js`)، تُحرَّر من
 * شاشة «الصلاحيات والأدوار» وتُحفظ في `access_control/matrix` بـFirestore:
 *
 *     { overrides: { [roleId]: { allow: [مسارات], deny: [مسارات] } } }
 *
 * الدلالة الحاكمة (يفرضها `pageAccess.canOpenPath`):
 *   • الافتراضي يبقى الكتالوج — المصفوفة استثناءات فوقه لا بديلًا عنه.
 *   • `deny` يغلب `allow` عند التعارض (يُشطب من allow في التطبيع).
 *   • `admin` فوق المصفوفة دائمًا — **يستحيل قفل المدير العام عن البوابة**.
 *   • تعذُّر جلب المصفوفة (قاعدة غير منشورة/انقطاع) ⇒ العمل بالكتالوج وحده
 *     (سقوطٌ آمن لا يوسّع صلاحية أحد).
 *
 * حدود صادقة: هذه طبقة **شاشات وتنقّل**. حماية البيانات تبقى بقواعد
 * `firestore.rules` على الخادم — سماحُ شاشةٍ هنا لا يمنح كتابةً لم تُجزها القواعد.
 */

export const EMPTY_MATRIX = Object.freeze({ overrides: {} });

/** يوحّد المسار: نص، يبدأ بـ`/`، بلا شرطة ختامية. يعيد null لغير الصالح. */
function cleanPath(p) {
  if (typeof p !== 'string') return null;
  const s = p.trim();
  if (!s.startsWith('/')) return null;
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;
}

/**
 * يطبّع أي شكل خام (من Firestore أو من محرر) إلى الشكل القانوني.
 * متسامح مع العطب: الشكل التالف يُسقَط بصمت لا يُفجّر الحارس.
 */
export function normalizeMatrix(raw) {
  const out = { overrides: {} };
  const src = raw && typeof raw === 'object' ? raw.overrides : null;
  if (!src || typeof src !== 'object') return out;

  for (const [roleId, o] of Object.entries(src)) {
    if (!o || typeof o !== 'object') continue;
    const deny = [
      ...new Set((Array.isArray(o.deny) ? o.deny : []).map(cleanPath).filter(Boolean)),
    ];
    const allow = [
      ...new Set((Array.isArray(o.allow) ? o.allow : []).map(cleanPath).filter(Boolean)),
    ].filter((p) => !deny.includes(p)); // deny يغلب — لا ازدواج
    if (allow.length || deny.length) out.overrides[roleId] = { allow, deny };
  }
  return out;
}

/** حالة التجاوز لمسارٍ ودور: 'allow' | 'deny' | null (افتراضي الكتالوج). */
export function overrideFor(matrix, roleId, path) {
  const o = matrix?.overrides?.[roleId];
  const p = cleanPath(path);
  if (!o || !p) return null;
  if (o.deny?.includes(p)) return 'deny';
  if (o.allow?.includes(p)) return 'allow';
  return null;
}

/**
 * يعيد مصفوفة جديدة (بلا مسّ الأصل) بحالة تجاوز محدّدة:
 * state = 'allow' | 'deny' | null (إزالة التجاوز).
 */
export function setOverride(matrix, roleId, path, state) {
  const p = cleanPath(path);
  if (!p || !roleId) return normalizeMatrix(matrix);
  const base = normalizeMatrix(matrix);
  const cur = base.overrides[roleId] || { allow: [], deny: [] };
  const allow = cur.allow.filter((x) => x !== p);
  const deny = cur.deny.filter((x) => x !== p);
  if (state === 'allow') allow.push(p);
  if (state === 'deny') deny.push(p);
  if (allow.length || deny.length) base.overrides[roleId] = { allow, deny };
  else delete base.overrides[roleId];
  return base;
}

/** عدد التجاوزات الكلي — لعرض «تعديلات غير محفوظة» في المحرر. */
export function countOverrides(matrix) {
  return Object.values(matrix?.overrides || {}).reduce(
    (n, o) => n + (o.allow?.length || 0) + (o.deny?.length || 0),
    0
  );
}
