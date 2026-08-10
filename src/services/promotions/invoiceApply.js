/**
 * تطبيق نتيجة العروض على بنود الفاتورة — منطق خالص يُختبَر في Node.
 *
 * فُصل عن `PromotionsPanel.jsx` لأنّ قاعدة البيت واحدة: المنطق في الخدمات
 * والعرض في المكوّنات. وليست القاعدة شكليّة — Node لا يستورد `.jsx` أصلًا،
 * فما بقي في المكوّن لا يُختبَر، وما لا يُختبَر لا يُوثَق به.
 *
 * ═══ ضمانتان ═══
 * ① **المجّانيّ لا يُنتج مجّانيًّا.** التقييم يقع على البنود المدفوعة وحدها،
 *    وإلّا توالدت الهدايا: عشرون تُنتج اثنين، فيصير المجموع اثنين وعشرين
 *    فيقترب من عتبةٍ جديدة… عطبٌ صامتٌ يظهر في الميزانيّة بعد شهر.
 * ② **التطبيق إيديمبوتنت.** كلّ استدعاءٍ يُزيل ما أضافه العرض سابقًا ثمّ يعيد
 *    البناء من الأصل. فالضغط مرّتين كالضغط مرّة — والمندوب يضغط مرّتين.
 */

/** البنود المدفوعة — ما ليس مجّانيًّا من عرض. */
export function paidLines(lines) {
  return (lines || []).filter((l) => !l?.isFree);
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * يُعيد بناء بنود الفاتورة من نتيجة التقييم.
 *
 * يُزيل المجّانيّات السابقة، ويمحو الخصوم **المنسوبة لعرض** (لا الخصوم اليدويّة
 * الخالصة)، ثمّ يطبّق النتيجة الجديدة. المجّانيّ يخرج بندًا يحمل رمز عرضه فلا
 * يُوسَم «بلا سند» في حارس التسريب.
 */
export function applyPromoResult(lines, result) {
  const base = paidLines(lines).map((l) =>
    l?.promoCode ? { ...l, discount: 0, promoCode: '' } : { ...l }
  );

  for (const d of result?.lineDiscounts || []) {
    const line = base[d.lineIndex];
    if (!line) continue;
    line.discount = money((Number(line.discount) || 0) + d.amount);
    line.promoCode = d.promoCode || line.promoCode || '';
  }

  const free = (result?.freeLines || []).map((f) => ({
    sku: f.sku,
    barcode: '',
    description: f.description || '',
    qty: f.qty,
    uom: '',
    batch: '',
    expiry: '',
    unitPrice: 0,
    discount: 0,
    promoCode: f.promoCode || '',
    isFree: true,
    notes: f.reason || '',
  }));

  return [...base, ...free];
}

/**
 * هل بنود الفاتورة تطابق ما تستحقّه من عروض؟
 * تُستعمل لتحذير المندوب قبل الحفظ: أدخل بندًا ثمّ نسي إعادة التطبيق.
 */
export function isInSync(lines, result) {
  const currentFree = (lines || []).filter((l) => l?.isFree).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const suggestedFree = (result?.freeLines || []).reduce((s, f) => s + (Number(f.qty) || 0), 0);
  if (currentFree !== suggestedFree) return false;

  const currentDiscount = paidLines(lines).reduce(
    (s, l) => s + (l?.promoCode ? Number(l.discount) || 0 : 0),
    0
  );
  return Math.abs(currentDiscount - (result?.totals?.discount || 0)) < 0.01;
}
