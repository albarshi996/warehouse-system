/**
 * سلّةُ الكاشير — منطقٌ خالصٌ لحساب السلّة (‹POS م٧› · طلب المالك 2026-11-09).
 *
 * نسخةٌ أولى مبسّطة (قرار المالك): **بلا ضريبة** · دفعٌ نقدٌ/بطاقة · **بلا عروضٍ
 * آليّة** (سعرٌ + خصمُ بندٍ/سلّةٍ يدويّ). الرياضياتُ هنا خالصةٌ تُختبر وحدها،
 * والشاشةُ تستدعيها لا تُعيد بناءها (درسُ «البناء قبل الوصل»). بلا DOM وبلا شبكة.
 *
 * العملةُ الدينارُ الليبيّ ثلاثيُّ المنازل (الدرهم) — يُقرّب كلُّ مجموعٍ إلى ثلاث.
 */

const num = (v) => Number(v) || 0;
const money = (n) => Math.round(num(n) * 1000) / 1000;
const str = (v) => String(v ?? '').trim();

/** طرقُ الدفع: نقدًا (صندوق، بباقٍ) · بطاقة/تحويل (بنك، بلا باقٍ). */
export const PAY_METHODS = Object.freeze(['نقدًا', 'بطاقة', 'تحويل']);

/** هل الدفعُ نقديّ؟ (النقدُ وحده له «مدفوع» و«باقٍ»). */
export function isCashPayment(method) {
  return str(method) === 'نقدًا';
}

/** إجماليُّ بندٍ = الكمّيّة × السعر − الخصم، لا يقلّ عن صفر. */
export function lineTotal(line) {
  return money(Math.max(0, num(line?.qty) * num(line?.unitPrice) - num(line?.discount)));
}

/**
 * يبني سطرَ سلّةٍ من صنفٍ (مَمسوحٍ أو مبحوثٍ) بسعرٍ محسوبٍ مسبقًا — الكمّيّةُ ١،
 * والوصفُ من اسم الصنف العربيّ. السعرُ يُمرَّر (من قائمة الأسعار أو سعر الصنف).
 */
export function cartLineFromItem(item = {}, { unitPrice } = {}) {
  return {
    sku: str(item.sku || item.code || item.default_code),
    barcode: str((Array.isArray(item.barcodes) && item.barcodes[0]) || item.barcode),
    description: str(item.nameAr || item.nameEn || item.name || item.sku || item.code),
    qty: 1,
    uom: str(item.unit || item.baseUom || item.sellUom),
    unitPrice: money(unitPrice ?? item.unitPrice ?? 0),
    discount: 0,
  };
}

/**
 * يُضيف سطرًا للسلّة، أو يزيد كمّيّةَ القائم إن كان من نفس الصنف (نفس sku) —
 * فإعادةُ مسحِ الصنف نفسِه تزيد العدّاد لا تُكرّر السطرَ (نمطُ `isRescanOfSame`).
 */
export function addOrIncrement(lines, newLine) {
  const list = Array.isArray(lines) ? lines : [];
  const sku = str(newLine?.sku);
  const i = sku ? list.findIndex((l) => str(l?.sku) === sku) : -1;
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...next[i], qty: num(next[i].qty) + (num(newLine.qty) || 1) };
    return next;
  }
  return [...list, { ...newLine, qty: num(newLine.qty) || 1 }];
}

/**
 * حسابُ السلّة: الأسطرُ بإجمالياتها، المجموعُ، خصمُ السلّة (مسقوفٌ بالمجموع)،
 * الإجماليُّ المستحقّ، والباقي/المتبقّي. النقدُ وحدَه له باقٍ؛ البطاقة/التحويل
 * تُسوّى بالكامل بلا باقٍ.
 *
 * @param {Array} lines أسطرُ السلّة (sku · qty · unitPrice · discount · …)
 * @param {{cartDiscount?:number, paid?:number, method?:string}} [opts]
 * @returns {{rows, count, subtotal, cartDiscount, grandTotal, paid, change, due, settled}}
 */
export function cartTotals(lines, { cartDiscount = 0, paid = 0, method = 'نقدًا' } = {}) {
  const rows = (Array.isArray(lines) ? lines : [])
    .filter((l) => num(l?.qty) > 0)
    .map((l) => ({ ...l, lineTotal: lineTotal(l) }));
  const subtotal = money(rows.reduce((s, l) => s + l.lineTotal, 0));
  const disc = money(Math.min(Math.max(0, num(cartDiscount)), subtotal)); // لا يتجاوز المجموع
  const grandTotal = money(subtotal - disc);

  const cash = isCashPayment(method);
  // النقدُ: المدفوعُ ما أُدخل؛ البطاقة/التحويل: تُسوّى بالكامل (المدفوع = المستحقّ).
  const effectivePaid = cash ? money(paid) : grandTotal;
  const change = cash ? money(Math.max(0, effectivePaid - grandTotal)) : 0;
  const due = money(Math.max(0, grandTotal - effectivePaid));

  return {
    rows,
    count: rows.length,
    subtotal,
    cartDiscount: disc,
    grandTotal,
    paid: effectivePaid,
    change,
    due,
    settled: due <= 0 && grandTotal > 0,
  };
}

/** علل الإدخال قبل البيع — قائمةٌ فارغةٌ إن صحّ (حارسُ خدمةٍ وواجهة). */
export function saleProblems({ lines, warehouse, method, paid } = {}) {
  const out = [];
  const t = cartTotals(lines, { method, paid });
  if (!t.count) out.push('السلّةُ فارغة — أضِف صنفًا واحدًا على الأقلّ.');
  if (!str(warehouse)) out.push('المخزنُ غير محدَّد — اختَر مخزنَ البيع.');
  if (!PAY_METHODS.includes(str(method))) out.push('اختَر طريقةَ الدفع.');
  if (t.grandTotal <= 0) out.push('إجماليُّ البيع صفرٌ — راجِع الأسعار والكمّيّات.');
  if (isCashPayment(method) && num(paid) + 1e-9 < t.grandTotal) {
    out.push(`المدفوعُ (${num(paid)}) أقلُّ من المستحقّ (${t.grandTotal}).`);
  }
  return out;
}
