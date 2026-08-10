/**
 * حدّ المال — ما لا يغادر البوابة إلى أودو.
 *
 * ═══ السياسة ═══
 * **اسحب المالي ولا ترفعه.** أودو هو الذي يولّد القيد المحاسبيّ؛ والبوابة تُنتج
 * الواقعة التشغيليّة (كم صنفًا، من أين إلى أين، بأيّ مرجع) ثمّ **تسحب** المرآة
 * الماليّة منه. فإن رفعنا الأسعار والمجاميع صار عندنا مصدران للرقم الواحد،
 * وانحرافُ أحدهما عن الآخر مسألةُ وقت — وهو انحرافٌ لا يظهر إلّا في تقريرٍ
 * ماليٍّ بعد شهور، حين لا يُعرف أيّ الرقمين الصادق.
 *
 * ═══ لماذا أنماطٌ لا قائمةُ أسماء ═══
 * قائمةٌ ثابتة تحرس ما نعرفه اليوم وحده. فمن يضيف `amount_tax` أو `x_cost_total`
 * إلى مخطِّطٍ بعد ستّة أشهر يمرّ بلا اعتراض. الأنماط تلتقط **ما لم يُخترع بعد**،
 * وهذا هو الفرق بين اختبارٍ يوثّق الحاضر وحارسٍ يحمي المستقبل.
 *
 * ═══ الاتّجاه ═══
 * الحدّ على **الدفع** وحده. أمّا السحب (`purchaseOrderToPoSummary` وأخواتها)
 * فيقرأ `amount_total` من أودو ويجب أن يبقى — تلك هي المرآة المقصودة.
 *
 * ═══ ما ليس مالًا ═══
 * الكمّيّات وإن كانت مجاميع (`x_total_received`)، وفروق العدّ (`x_stock_variance`)،
 * وطريقة السداد (`x_payment_mode`)، وعلامة المجّانيّ (`x_is_free`)، والعملة
 * (`currency_id`) — كلّها وقائع تشغيليّة لا مبالغ، فتمرّ.
 *
 * ⚠️ **م٧-ب** يحوّل هذا الحدّ إلى إعدادٍ يُقرأ من لوحة التحكّم بالتكامل، فتملك
 * الشركة تغيير السياسة بلا نشر كود. حتّى ذلك الحين الحدّ مغلق، وهو الافتراض
 * الذي يبقى بعدها.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

/** أسماءٌ صريحة — منها ما هو بمفردات أودو ومنها بمفردات البوابة (بندٌ خام سُرّب كما هو). */
export const MONEY_FIELD_NAMES = new Set([
  'discount',
  'x_discount',
  'x_total_sales',
  // مفردات البوابة: تُلتقط لو مُرّر بند مستندٍ خام بدل بندٍ مخطَّط
  'unitPrice',
  'unitCost',
  'lineTotal',
  'netTotal',
  'amountCollected',
  'totalValue',
]);

/** أنماطٌ تلتقط ما لم يُخترع بعد. */
export const MONEY_FIELD_PATTERNS = [
  /^amount_/, //            amount_total · amount_untaxed · amount_tax
  /^price_/, //             price_unit · price_subtotal · price_total
  /_subtotal$/, //          أيّ مجموعٍ فرعيّ
  /^x_amount/, //           x_amount_collected
  /^x_price/,
  /^x_cash/, //             x_cash_sales · x_cash_deposited · x_cash_variance
  /^x_cost/,
  /^(list|standard)_price$/,
  /^tax_/,
  /^x_tax/,
  /^currency_rate$/,
];

/** هل اسم الحقل حقلَ مال؟ */
export function isMoneyField(name) {
  const key = String(name ?? '');
  if (!key) return false;
  if (MONEY_FIELD_NAMES.has(key)) return true;
  return MONEY_FIELD_PATTERNS.some((re) => re.test(key));
}

/**
 * يمسح القِيَم في العمق — الرأس والبنود والبنود داخل البنود — ويُعيد مسارات
 * حقول المال الموجودة. الفحص العميق ضرورة: `amount_total` في الرأس يُرى بالعين،
 * أمّا `price_unit` في السطر الثاني عشر من `order_line` فلا.
 *
 * @param {*} values قِيَم الدفع
 * @param {string} [path] مسار الأب (داخليّ)
 * @returns {string[]} مسارات مثل `order_line[3].price_unit`
 */
export function findMoneyFields(values, path = '') {
  if (Array.isArray(values)) {
    return values.flatMap((item, i) => findMoneyFields(item, `${path}[${i}]`));
  }
  if (!values || typeof values !== 'object') return [];
  return Object.entries(values).flatMap(([key, val]) => {
    const here = path ? `${path}.${key}` : key;
    if (isMoneyField(key)) return [here];
    return findMoneyFields(val, here);
  });
}

/**
 * حارس الدفع: يرفض إرسال أيّ قيمةٍ تحمل حقل مال.
 * يُستدعى في نقطة الاختناق الواحدة (`pushOnce`) قبل `create`/`write` —
 * فحارسٌ في المخطِّط وحده يسقط أوّل ما يُضاف مخطِّطٌ جديد.
 *
 * @param {object} values قِيَم الدفع
 * @param {string} [context] اسم النموذج أو المستند (للرسالة)
 * @throws {Error} إن وُجد حقل مال
 */
export function assertNoMoneyFields(values, context = '') {
  const found = findMoneyFields(values);
  if (!found.length) return values;
  const where = context ? ` في «${context}»` : '';
  throw new Error(
    `حقول مالٍ تحاول مغادرة البوابة إلى أودو${where}: ${found.join('، ')}. ` +
      'السياسة المعتمدة: اسحب المالي ولا ترفعه — أودو يولّد القيد والبوابة تُنتج الواقعة. ' +
      'أخرِج هذه الحقول من المخطِّط (راجع src/services/odoo/moneyFields.js).'
  );
}
