/**
 * مفاتيح الأرصدة ومنطق FEFO — منطق خالص بلا Firebase، قابل للاختبار وحده.
 *
 * الرصيد مفتاحه مركّب: **(الصنف × المخزن × التشغيلة)**. الصنف الواحد له رصيد
 * مستقلّ في كل مخزن (E5/E2/E3)، ولكل تشغيلة صلاحيتها — وعلى الصلاحية يقوم
 * حارس FEFO (القاعدة الذهبية الثالثة). هذا الملف يبني المفتاح ويرتّب FEFO.
 */

/** يُنظّف جزءًا من المفتاح: يُزيل ما يكسر معرّف مستند Firestore («/» و«.»). */
function safe(part) {
  return String(part ?? '')
    .trim()
    .replace(/[/.#$[\]]/g, '-')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

/**
 * المعرّف الفريد للرصيد — يجعل إعادة الاستيراد **تحديثًا لا تكرارًا**.
 * هوية الصنف: الكود إن وُجد، وإلا الباركود («حاوية الكود» تُملأ من أودو لاحقًا).
 * التشغيلة الفارغة تصير `NOBATCH` كي لا ينهار المفتاح على «--».
 *
 * @returns {string|null} المعرّف، أو null إن غاب المخزن أو هوية الصنف معًا.
 */
export function balanceId({ sku, barcode, warehouse, batch }) {
  const item = safe(sku) || safe(barcode);
  const wh = safe(warehouse);
  if (!item || !wh) return null;
  const lot = safe(batch) || 'NOBATCH';
  return `${item}__${wh}__${lot}`;
}

/**
 * ترتيب FEFO: الأقرب انتهاءً أولًا. الرصيد بلا صلاحية يُدفع للآخر (لا نُقدّم
 * مجهول الصلاحية على معلومها). يُعيد نسخة مرتّبة — لا يعدّل الأصل.
 */
export function fefoSort(balances) {
  return [...(balances || [])].sort((a, b) => {
    const ea = expiryValue(a.expiry);
    const eb = expiryValue(b.expiry);
    return ea - eb;
  });
}

/** يحوّل تاريخ الصلاحية إلى رقم للترتيب؛ الفارغ/غير الصالح = ما لا نهاية. */
function expiryValue(raw) {
  if (!raw) return Infinity;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Infinity : t;
}

/**
 * حالة الصلاحية بالنسبة لتاريخ مرجعي (افتراضه يُمرَّر — لا نقرأ الساعة هنا
 * كي يبقى المنطق خالصًا قابلًا للاختبار).
 *   منتهٍ | قريب (خلال nearDays) | سليم | غير محدَّد
 */
export function expiryStatus(expiry, nowMs, nearDays = 30) {
  if (!expiry) return 'unknown';
  const t = Date.parse(expiry);
  if (Number.isNaN(t)) return 'unknown';
  if (t < nowMs) return 'expired';
  if (t - nowMs <= nearDays * 86400000) return 'near';
  return 'ok';
}

/** إجمالي الكمية عبر مجموعة أرصدة. */
export function totalQty(balances) {
  return (balances || []).reduce((s, b) => s + (Number(b.qty) || 0), 0);
}

/** قيمة المخزون = Σ(كمية × تكلفة التشغيلة) — أساس تقييم S12. */
export function stockValue(balances) {
  return (balances || []).reduce((s, b) => s + (Number(b.qty) || 0) * (Number(b.unitCost) || 0), 0);
}
