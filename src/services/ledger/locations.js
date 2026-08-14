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
  /**
   * منطقة فحص المرتجعات (SAP-10 · §15 ‹430› · المرجع ‹3636›): «يُفضَّل ألّا
   * تدخل البضاعة المرتجعة مباشرةً إلى المخزون الصالح للبيع». فمرتجع العميل
   * يهبط هنا أوّلًا، ثمّ يُفرزه الفحص ثلاثًا: صالحٌ للمخزون · يحتاج صيانة ·
   * تالف. ورصيدٌ باقٍ هنا = مرتجعٌ وصل ولم يُفرَز — وهو التقرير نفسه.
   */
  RETURNS: {
    code: 'RETURNS',
    labelAr: 'منطقة فحص المرتجعات',
    labelEn: 'Returns Inspection',
    emoji: '↩️',
    mustZero: true,
    hint: 'مرتجعٌ وصل ولم يُفرز بعد — لا يُباع حتى يُفحص ويُوجَّه (صالح · صيانة · تالف).',
  },
  /**
   * الصيانة (SAP-10): وجهةُ ما يحتاج إصلاحًا من المرتجعات — بضاعةٌ ليست
   * صالحةً للبيع وليست تالفة. `mustZero: false` لأنّ الإصلاح يستغرق وقتًا؛
   * والرصيد هنا هو طابور الورشة لا استثناءً يُلاحَق.
   */
  MAINTENANCE: {
    code: 'MAINTENANCE',
    labelAr: 'الصيانة',
    labelEn: 'Maintenance',
    emoji: '🔧',
    mustZero: false,
    hint: 'يحتاج إصلاحًا — خرج من الصالح للبيع ولم يُتلَف؛ يعود للمخزون بعد الإصلاح.',
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

/**
 * ═══ مواقع المركبات المتنقّلة — رصيدٌ لكل مركبة على حدة ═══
 *
 * قرار المالك (2026-08-04): إذن التسليم يُحمّل الطلب في مركبةٍ بعينها، ويبقى
 * الرصيد **على تلك المركبة المتنقّلة** حتى يؤكّد فريق الحركة تسليمه للعميل
 * فيُخصم. فلكل مركبةٍ موقعُها: `VAN:‹لوحة›`. رصيدٌ باقٍ في أيّ موقع مركبة =
 * بضاعةٌ حُمِّلت ولم تُسلَّم بعد — وهو تقرير «ما على المركبات الآن».
 *
 * تُخزَّن كأيّ مستودعٍ في `balances/{صنف__VAN:لوحة__تشغيلة}` — لا مجموعة جديدة.
 * والبادئة **محجوزة** فلا يحملها مستودعٌ حقيقيّ (يحرسها `isReservedCode`).
 */
export const VEHICLE_PREFIX = 'VAN:';

/** كود موقع مركبةٍ من لوحتها — موحّد الحالة كما يوحّدها مفتاح الرصيد. */
export function vehicleLocationCode(plate) {
  const p = String(plate || '').trim().toUpperCase();
  return p ? `${VEHICLE_PREFIX}${p}` : '';
}

/** هل هذا الكود موقعُ مركبةٍ متنقّلة؟ */
export function isVehicleLocation(code) {
  return String(code || '').toUpperCase().startsWith(VEHICLE_PREFIX);
}

/** لوحة المركبة من كود موقعها (فارغ إن لم يكن موقع مركبة). */
export function vehiclePlateFromCode(code) {
  return isVehicleLocation(code) ? String(code).slice(VEHICLE_PREFIX.length) : '';
}

/**
 * أرصدة «ما على المركبات الآن»: صفوفٌ في موقع مركبةٍ برصيدٍ غير صفريّ = بضاعة
 * حُمِّلت ولم تُسلَّم. منطق خالص كـ`stuckBalances`.
 */
export function onVehicleBalances(balances) {
  return (balances || [])
    .filter((b) => isVehicleLocation(b?.warehouse) && Math.abs(Number(b?.qty) || 0) > 0.0001)
    .map((b) => ({ ...b, plate: vehiclePlateFromCode(b.warehouse), locationLabel: locationLabel(b.warehouse) }));
}

/**
 * ═══ مواقع العملاء — البضاعة المحمية والأمانة ═══
 *
 * قرار المالك (2026-08-09): بعض ما يخرج إلى العميل **لا تخرج ملكيّته**. مستحضرات
 * التجميل والأدوية تُودَع لدى التاجر بحقّ إرجاعٍ كامل أو مشروط: «حماية ٩٠ يومًا»،
 * «حماية حتى انتهاء الصلاحية»، «المنتهي فقط». هذه بضاعتنا وإن كانت على رفّ غيرنا.
 *
 * المشكلة قبل هذا: `EXTERNAL = null` يبتلع كلّ ما يغادر. فما إن يُسلَّم صنفٌ حتى
 * تنقطع عنه الرؤية — لا نعرف تشغيلته ولا صلاحيته عند العميل، ولا نُطابق مرتجعه
 * برصيدٍ لأنّه بلا رصيد. وهي بعينها المشكلة التي بُني عليها هذا النظام: البيع
 * الأوّلي رقمٌ أعمى.
 *
 * الحلّ: موقعٌ لكل عميل `CUST:‹رمزه›` — يُخزَّن كأيّ مستودع في
 * `balances/{صنف__CUST:رمز__تشغيلة}`، فيرث مجّانًا كلّ ما بناه الدفتر: التشغيلة
 * والصلاحية، وحارس الرصيد السالب (فلا يُرجَع ما لم يُسلَّم)، وFEFO، وكشف الحركة.
 *
 * والقاعدة الحاكمة تبقى كما هي: **ما له رصيدٌ في دفترنا فهو ملكنا**. فلا حاجة
 * لبُعد ملكيّةٍ ثالث — الموقع نفسه يحملها:
 *   `VAN:لوحة → EXTERNAL`   بيعٌ قاطع، خرجت الملكية.
 *   `VAN:لوحة → CUST:رمز`   إيداع أمانةٍ محميّة، الملكية باقية.
 *   `CUST:رمز → EXTERNAL`   تحقّق البيع، الآن خرجت الملكية.
 *   `CUST:رمز → VAN:لوحة`   مرتجعٌ محميّ عاد إلى المركبة.
 *
 * `mustZero` لا تنطبق: رصيدٌ عند العميل وضعٌ مشروع مستمرّ لا استثناء يُلاحَق —
 * الاستثناء هو ما **تجاوز مدّة حمايته** أو **قارب صلاحيته**، وذاك تقريرٌ آخر.
 */
export const CUSTOMER_PREFIX = 'CUST:';

/** كود موقع عميلٍ من رمزه (BP Code) — موحّد الحالة كما يوحّدها مفتاح الرصيد. */
export function customerLocationCode(customerCode) {
  const c = String(customerCode || '').trim().toUpperCase();
  return c ? `${CUSTOMER_PREFIX}${c}` : '';
}

/** هل هذا الكود موقعُ عميل؟ */
export function isCustomerLocation(code) {
  return String(code || '').toUpperCase().startsWith(CUSTOMER_PREFIX);
}

/** رمز العميل من كود موقعه (فارغ إن لم يكن موقع عميل). */
export function customerCodeFromLocation(code) {
  return isCustomerLocation(code) ? String(code).toUpperCase().slice(CUSTOMER_PREFIX.length) : '';
}

/**
 * أرصدة «ما لدى العملاء الآن»: بضاعةٌ سُلّمت وما تزال ملكنا — الأمانة والمحميّة.
 * منطق خالص كـ`onVehicleBalances`.
 */
export function atCustomerBalances(balances) {
  return (balances || [])
    .filter((b) => isCustomerLocation(b?.warehouse) && Math.abs(Number(b?.qty) || 0) > 0.0001)
    .map((b) => ({
      ...b,
      customerCode: customerCodeFromLocation(b.warehouse),
      locationLabel: locationLabel(b.warehouse),
    }));
}

/** هل هذا الرمز موقع نظام؟ */
export function isSystemLocation(code) {
  return Boolean(code) && Object.hasOwn(SYSTEM_LOCATIONS, String(code).toUpperCase());
}

/**
 * مواقع «حسابيّة» — طرفٌ مقابلٌ لا رفٌّ مادّيّ، **يُسمح لرصيدها بالسالب**.
 *
 * لماذا الاستثناء؟ حارس الرصيد السالب يمنع أن ينزل رفٌّ ماديّ تحت الصفر (بيعُ ما
 * لا يوجد). لكنّ `ADJUSTMENT` ليس رفًّا بل حساب: رصيده «صافي فروقات الجرد» وقد
 * يكون موجبًا (وُجد فائض) أو سالبًا (وُجد عجز). لولا هذا الاستثناء لعجزت التسوية
 * الموجبة عن القيد — إذ تسحب من `ADJUSTMENT` رصيده صفر فيرفضها الحارس (BZ-SCN-002).
 * المواقع الانتقالية (`RECEIVING`/`STAGING`/`TRANSIT`) تبقى محروسة: تستقبل قبل أن
 * تُخرج، فسالبُها خطأٌ حقيقيّ.
 */
export const ACCOUNT_LOCATIONS = new Set([SYSTEM_LOCATIONS.ADJUSTMENT.code]);

/** هل هذا الموقع حسابيّ (يُعفى من حارس الرصيد السالب)؟ */
export function isAccountLocation(code) {
  return ACCOUNT_LOCATIONS.has(String(code || '').toUpperCase());
}

/**
 * هل هذا الرمز محجوز فلا يجوز لمستودع حقيقي أن يحمله؟
 * يُستدعى قبل إنشاء مستودع جديد — الاصطدام هنا يُفسد الأرصدة بلا صوت.
 */
export function isReservedCode(code) {
  return isSystemLocation(code) || isVehicleLocation(code) || isCustomerLocation(code);
}

/** تسمية الموقع للعرض: موقع نظام، أو مركبة، أو عميل، أو كود مستودع حقيقي، أو الخارج. */
export function locationLabel(code) {
  if (code === null || code === undefined || code === '') return EXTERNAL_LABEL;
  const sys = SYSTEM_LOCATIONS[String(code).toUpperCase()];
  if (sys) return `${sys.emoji} ${sys.labelAr}`;
  if (isVehicleLocation(code)) return `🚚 مركبة ${vehiclePlateFromCode(code)}`;
  if (isCustomerLocation(code)) return `🏪 لدى العميل ${customerCodeFromLocation(code)}`;
  return String(code);
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
