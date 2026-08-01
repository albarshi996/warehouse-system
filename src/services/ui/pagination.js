/**
 * ترقيم الصفحات — دوال خالصة (بلا React ولا Firestore) — «العملية الجراحية» المحور ٧.
 *
 * تحلّ محلّ قصّ الذيل الصامت (`items.slice(0, N)`) الذي كان يُخفي بقيّة
 * الصفوف بلا أيّ مؤشّر. الآن: صفحاتٌ بنمط أودو («١–٥٠ / ٢٤٣») يتنقّل بينها
 * المستخدم فلا يضيع صفٌّ بصمت.
 */

/** يحصر رقم الصفحة في المدى الصحيح [0, آخر صفحة]. */
export function clampPage(page, total, size) {
  const pages = pageCount(total, size);
  const p = Number.isFinite(page) ? Math.trunc(page) : 0;
  return Math.max(0, Math.min(p, pages - 1));
}

/** عدد الصفحات لإجماليٍّ وحجمٍ معلومَين (١ على الأقلّ). */
export function pageCount(total, size) {
  const s = Math.max(1, size || 1);
  return Math.max(1, Math.ceil((total || 0) / s));
}

/** شريحة الصفحة الحالية من مصفوفةٍ محمّلةٍ في الذاكرة. */
export function pageSlice(items, page, size) {
  const list = Array.isArray(items) ? items : [];
  const s = Math.max(1, size || 1);
  const p = clampPage(page, list.length, s);
  return list.slice(p * s, p * s + s);
}

/**
 * معلومات العرض لشريط الترقيم:
 *   from/to  — رقم أوّل وآخر عنصر في الصفحة (بدءًا من ١، لا صفر) — 0/0 لو فارغ.
 *   total    — الإجمالي · pages — عدد الصفحات · page — الصفحة المحصورة (0-index)
 *   hasPrev/hasNext — تفعيل السهمين · label — «١–٥٠ / ٢٤٣» (أرقام لاتينية R2).
 */
export function pageInfo(total, page, size) {
  const t = Math.max(0, total || 0);
  const s = Math.max(1, size || 1);
  const pages = pageCount(t, s);
  const p = clampPage(page, t, s);
  const from = t === 0 ? 0 : p * s + 1;
  const to = t === 0 ? 0 : Math.min(t, p * s + s);
  return {
    from,
    to,
    total: t,
    pages,
    page: p,
    hasPrev: p > 0,
    hasNext: p < pages - 1,
    label: `${from}–${to} / ${t}`,
  };
}
