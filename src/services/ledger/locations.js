/**
 * مواقع النظام — المخازن التي لا يملكها أحد ولا تُبنى بالطوب.
 *
 * المشكلة التي تحلّها: البضاعة لا تقفز من المورّد إلى الرفّ دفعةً واحدة. بينهما
 * لحظاتٌ هي مصدر كل الخلاف في المستودعات: «وصلت ولم تُخزَّن»، «خرجت ولم تُسلَّم»،
 * «غادرت الرئيسي ولم تصل الفرع». المستودع الورقي يُنكر هذه اللحظات فيضيع فيها
 * الفرق؛ ونحن نمنحها **مواقع صريحة** فيصير الفرق رصيدًا ظاهرًا لا سؤالًا معلّقًا.
 *
 * القاعدة الحاكمة: كل موقع نظام **يجب أن يعود إلى الصفر**. رصيدٌ باقٍ في
 * `TRANSIT` يعني شحنة لم تُستلم؛ وفي `RECEIVING` يعني بضاعة لم تُخزَّن. الرقم
 * غير الصفري هنا ليس خطأً في النظام — بل هو التقرير نفسه.
 *
 * لماذا لا تُخزَّن في مجموعة `warehouses`؟ لأنها ليست مستودعات يديرها موظّف،
 * بل مراحل في رحلة الصنف. لو صارت صفوفًا في قاعدة البيانات لأمكن حذفها أو
 * إعادة تسميتها، فينهار المعنى. هنا في الكود لا تُمسّ.
 */

/**
 * مواقع النظام المحجوزة. `mustZero` تعني: رصيدٌ باقٍ فيها = استثناء يُلاحَق.
 *
 * ⚠️ هذه الرموز **محجوزة**: لا يجوز أن يحمل مستودع حقيقي أحدها كودًا، وإلا
 * اختلط رصيد الرحلة برصيد الرفّ. يحرسها `isReservedCode` عند إنشاء المستودعات.
 */
export const SYSTEM_LOCATIONS = {
  RECEIVING: {
    code: 'RECEIVING',
    labelAr: 'ساحة الاستلام',
    labelEn: 'Receiving Dock',
    emoji: '📥',
    mustZero: true,
    hint: 'وصلت من المورّد ولم تُخزَّن بعد — رصيدٌ هنا يعني أمر تخزين متأخّرًا.',
  },
  QUARANTINE: {
    code: 'QUARANTINE',
    labelAr: 'الحجر الصحّي',
    labelEn: 'Quarantine',
    emoji: '🔬',
    mustZero: false,
    hint: 'مرفوض جودةً — ينتظر الإرجاع للمورّد أو الإتلاف. لا يُباع ولا يُخزَّن.',
  },
  STAGING: {
    code: 'STAGING',
    labelAr: 'ساحة التجهيز',
    labelEn: 'Staging Area',
    emoji: '📦',
    mustZero: true,
    hint: 'سُحبت من الرفّ ولم تُسلَّم بعد — رصيدٌ هنا يعني تسليمًا متأخّرًا.',
  },
  TRANSIT: {
    code: 'TRANSIT',
    labelAr: 'مخزن النقل',
    labelEn: 'Transit Warehouse',
    emoji: '🚚',
    mustZero: true,
    hint: 'غادرت الرئيسي ولم يستلمها الفرع — رصيدٌ هنا هو تقرير الشحنات المعلّقة.',
  },
  SCRAP: {
    code: 'SCRAP',
    labelAr: 'الإتلاف',
    labelEn: 'Scrap',
    emoji: '🗑️',
    mustZero: false,
    hint: 'تالف أو منتهٍ خرج من المخزون — يُحتفظ به كأثرٍ للقيمة المشطوبة.',
  },
  ADJUSTMENT: {
    code: 'ADJUSTMENT',
    labelAr: 'مقابل التسوية',
    labelEn: 'Inventory Adjustment',
    emoji: '⚖️',
    mustZero: false,
    hint: 'الطرف المقابل لكل تسوية جرد — رصيده هو صافي فروقات الجرد التاريخية.',
  },
};

/**
 * خارج المنشأة — المورّد والعميل. نمثّله بـ`null` لا برمزٍ نصّي، لأنه ليس
 * موقعًا نملك رصيده: ما خرج إلى العميل لم يعد لنا، وما جاء من المورّد لم يكن.
 */
export const EXTERNAL = null;

/** تسمية «خارج المنشأة» حين تُعرض في كشف الحركة. */
export const EXTERNAL_LABEL = 'خارج المنشأة';

/** هل هذا الرمز موقع نظام؟ */
export function isSystemLocation(code) {
  return Boolean(code) && Object.hasOwn(SYSTEM_LOCATIONS, String(code).toUpperCase());
}

/**
 * هل هذا الرمز محجوز فلا يجوز لمستودع حقيقي أن يحمله؟
 * يُستدعى قبل إنشاء مستودع جديد — الاصطدام هنا يُفسد الأرصدة بلا صوت.
 */
export function isReservedCode(code) {
  return isSystemLocation(code);
}

/** تسمية الموقع للعرض: موقع نظام، أو كود مستودع حقيقي، أو الخارج. */
export function locationLabel(code) {
  if (code === null || code === undefined || code === '') return EXTERNAL_LABEL;
  const sys = SYSTEM_LOCATIONS[String(code).toUpperCase()];
  return sys ? `${sys.emoji} ${sys.labelAr}` : String(code);
}

/** المواقع التي يجب أن تعود إلى الصفر — مصدر لوحة الاستثناءات. */
export function zeroingLocations() {
  return Object.values(SYSTEM_LOCATIONS)
    .filter((l) => l.mustZero)
    .map((l) => l.code);
}

/**
 * أرصدة عالقة في موقعٍ كان يجب أن يفرغ.
 * منطق خالص: يأخذ الأرصدة ويُخرج ما لا ينبغي أن يكون.
 *
 * @param {Array} balances صفوف الأرصدة (لكلٍّ `warehouse` و`qty`)
 * @returns {Array} الصفوف العالقة، مع `locationLabel` و`hint` جاهزَين للعرض
 */
export function stuckBalances(balances) {
  const watched = new Set(zeroingLocations());
  return (balances || [])
    .filter((b) => watched.has(String(b?.warehouse || '').toUpperCase()))
    .filter((b) => Math.abs(Number(b?.qty) || 0) > 0.0001)
    .map((b) => {
      const sys = SYSTEM_LOCATIONS[String(b.warehouse).toUpperCase()];
      return { ...b, locationLabel: locationLabel(b.warehouse), hint: sys?.hint || '' };
    });
}
