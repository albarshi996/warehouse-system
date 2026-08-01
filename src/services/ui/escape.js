/**
 * تهريب HTML — المصدر الواحد لكل حقن نصّ في `innerHTML`/القوالب.
 *
 * كان مكرَّرًا بعشر نسخ متفرّقة (`meetingsView.esc` · `escapeHtml` في
 * stock-operations · `escHtml` في fleet/maintenance/custody/…)، فوُحِّد هنا
 * ضمن «العملية الجراحية» المحور ٤. أي حقن جديد يستورد من هنا، لا نسخة محليّة.
 *
 *   esc(s)      — لنصّ داخل عنصر: `<p>${esc(x)}</p>`
 *   escAttr(s)  — لقيمة سِمة داخل علامتَي اقتباس: `title="${escAttr(x)}"`
 *   escJsAttr(s)— لنصّ يُحقن داخل onclick='fn("...")' (تهريب مزدوج: JS ثم HTML)
 */

/** تهريب لنصّ عنصر — يمنع `<img onerror>` وإغلاق الوسوم المبكّر. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** تهريب لقيمة سِمة — يضيف تهريب المفردة والخط المائل الخلفي. */
export function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

/**
 * تهريب لنصّ يوضع داخل مُعالِج JS مضمّن مثل `onclick="fn('${...}')"`:
 * أولًا تهريب سلسلة JS (الاقتباس والخط المائل والأسطر)، ثم تهريب HTML.
 */
export function escJsAttr(s) {
  const js = String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
  return escAttr(js);
}

/** يحوّل نصًّا متعدّد الأسطر إلى فقرات مهرَّبة — للحقول الحرّة. */
export function escMultiline(s) {
  return esc(s)
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => `<p>${l}</p>`)
    .join('');
}
