/**
 * قواعد القيد — أيّ مستندٍ يُحرّك المخزون، ومن أين إلى أين، وبأيّ كمية.
 *
 * هذا الملف هو ترجمة المبدأ الحاكم إلى قانون: **لا حركة بدون مستند، ولا مستند
 * بدون أثر مخزني**. قبله كانت المستندات ورقًا محكومًا والأرصدة جدول إكسل
 * مستوردًا، ولا يلتقيان — يُعتمد استلامٌ فلا يزيد رصيد، ويُعتمد صرفٌ فلا ينقص.
 *
 * لماذا جدولٌ لا شيفرةٌ متفرّقة؟ لأن السؤال «ما أثر هذا المستند؟» يجب أن يُجاب
 * من مكانٍ واحد يُقرأ في دقيقة، لا من `if` مبعثرة في عشرة ملفات. وإضافة نموذج
 * جديد إلى الدورة تصير سطرًا هنا — لا جراحة.
 *
 * ═══ متى يُقيَّد؟ ═══
 * عند بلوغ الحالة **`done` (منجَز)** حصرًا — لا عند الاعتماد.
 * الفرق جوهري: `approved` تعني «أذِنتُ بأن يحدث»، و`done` تعني «حدث فعلًا».
 * البضاعة لا تتحرّك لأن مديرًا وقّع، بل لأن عاملًا حملها. والقيدُ يوثّق الحمل
 * لا التوقيع.
 *
 * ═══ التوازن المحكم ═══
 * لاحظ كيف تُفرَّغ مواقع النظام بذاتها:
 *   `GRN` يُدخل المستلَم كلّه إلى `RECEIVING`
 *   `QC`  يُخرج المرفوض منه إلى `QUARANTINE`
 *   `PUTAWAY` يُخرج المقبول إلى المستودع
 *   ⇒ ويبقى `RECEIVING` صفرًا. أيّ بقيّة فيه = بضاعةٌ وصلت ولم تُخزَّن.
 * والمنطق نفسه يحكم `STAGING` (سُحب ↔ حُمِّل بالمركبة) و`TRANSIT` (شُحن ↔ استُلم)
 * و**موقع المركبة** `VAN:‹لوحة›` (حُمِّل ↔ سُلِّم للعميل — بقيّةٌ = بضاعة على مركبة).
 * فالتقارير الرقابية ليست استعلامات نكتبها، بل نتيجةٌ حسابية لبنية القيد.
 */
import { SYSTEM_LOCATIONS, EXTERNAL } from './locations.js';

const { RECEIVING, QUARANTINE, STAGING, TRANSIT, SCRAP, ADJUSTMENT } = SYSTEM_LOCATIONS;

/**
 * رموز المستودعات المقروءة من رأس المستند وقت التنفيذ (لا مواقع نظامٍ ثابتة).
 *   `WAREHOUSE`      — مستودعٌ واحد في `header.warehouse` (الوارد/الصادر).
 *   `WAREHOUSE_FROM` — مستودع المصدر في `header.fromWarehouse` (النقل).
 *   `WAREHOUSE_TO`   — مستودع الوجهة في `header.toWarehouse` (النقل).
 *
 * النقل وحده يحتاج مستودعَين: الرصيد يخرج من مصدرٍ ويدخل وجهةً، وبينهما مخزن
 * النقل. لذلك لم يعُد رمزٌ واحد يكفي.
 */
export const WAREHOUSE = '@warehouse';
export const WAREHOUSE_FROM = '@warehouseFrom';
export const WAREHOUSE_TO = '@warehouseTo';
/**
 * موقع المركبة المتنقّلة: يُقرأ من `header.vehiclePlate` ويُصاغ `VAN:‹لوحة›` وقت
 * القيد (انظر `resolveLocation` في movements.js). ليس مستودعًا ثابتًا بل موقعٌ
 * لكل مركبةٍ على حدة — رصيدٌ باقٍ فيه = بضاعةٌ حُمِّلت ولم تُسلَّم بعد.
 */
export const VEHICLE = '@vehicle';

/** خريطة الرمز ← حقل رأس المستند الذي يُقرأ منه. */
export const WAREHOUSE_TOKENS = {
  [WAREHOUSE]: 'warehouse',
  [WAREHOUSE_FROM]: 'fromWarehouse',
  [WAREHOUSE_TO]: 'toWarehouse',
};

/** هل هذا الموقع رمزُ مستودعٍ يُقرأ من الرأس (لا موقع نظامٍ ثابت)؟ */
export function isWarehouseToken(slot) {
  return Object.hasOwn(WAREHOUSE_TOKENS, slot);
}

/** هل هذا الموقع رمزُ مركبةٍ يُقرأ من لوحتها في الرأس؟ */
export function isVehicleToken(slot) {
  return slot === VEHICLE;
}

/**
 * جدول القيد. لكل نوعٍ يُحرّك المخزون:
 *   `from` / `to`  — الموقع المصدر والهدف (`EXTERNAL` = خارج المنشأة)
 *   `qtyField`     — حقل البند الذي يحمل الكمية
 *   `expiryField`  — حقل الصلاحية (يختلف: GRN يسمّيه `expiryDate` لا `expiry`)
 *   `costField`    — حقل تكلفة الوحدة، لحساب القيمة الدفترية
 *   `reason`       — تصنيف الحركة في كشف الصنف
 *   `signed`       — الكمية قد تكون سالبة فتنعكس الوجهة (التسويات وحدها)
 *
 * الأنواع الغائبة عن الجدول **لا تُحرّك مخزونًا عمدًا**، ولكلٍّ سببه:
 *   `PR`/`PO` — التزامٌ مستقبلي، لا بضاعة في اليد بعد.
 *   `PACK`    — إعادة تغليف داخل نفس الموقع؛ الكمية لم تنتقل.
 *   `GP`      — رقابة بوابة على ما حرّكه `DN` أصلًا؛ القيد هنا ازدواجٌ.
 *   `CC`      — عَدٌّ لا يُغيّر شيئًا؛ الذي يُغيّر هو `ADJ` المشتقّ منه.
 *   `CN`      — أثرٌ مالي بحت على ذمّة العميل، لا على الرفّ.
 *   `SRN`     — إشعار رفضٍ توثيقيّ؛ فحص الجودة نقل المرفوض للحجر أصلًا (لا قيد ثانٍ).
 *   `VSR`     — تسوية الرحلة **تقرأ** ما قيّدته مستندات الرحلة ولا تقيّد شيئًا.
 *               ولو قيّدت لضاعفت الأثر: البضاعة تحرّكت مرّةً واحدة لا مرّتين.
 *               هي محضر إقفالٍ يُوثّق الميزان ويحمل اعتماد المشرف على فرقه.
 */
export const POSTING_RULES = {
  GRN: {
    from: EXTERNAL,
    to: RECEIVING.code,
    qtyField: 'qtyReceived',
    expiryField: 'expiryDate',
    costField: 'unitPrice',
    reason: 'receipt',
    labelAr: 'استلام من مورّد',
  },
  QC: {
    from: RECEIVING.code,
    to: QUARANTINE.code,
    qtyField: 'qtyRejected',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'quality-reject',
    labelAr: 'عزل مرفوض جودةً',
  },
  PUTAWAY: {
    from: RECEIVING.code,
    to: WAREHOUSE,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'putaway',
    labelAr: 'تخزين على الرفّ',
  },
  PICK: {
    from: WAREHOUSE,
    to: STAGING.code,
    qtyField: 'qtyPicked',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'pick',
    labelAr: 'سحب للتجهيز',
  },
  // ═══ الصرف عبر المركبة (قرار المالك 2026-08-04) ═══
  // إذن التسليم **يُحمّل** الطلب في مركبةٍ بعينها (ساحة التجهيز ← موقع المركبة)،
  // ولا يُخصم الرصيد نهائيًّا بل يبقى «على المركبة المتنقّلة» حتى يؤكّد فريق
  // الحركة تسليمه للعميل بمستند POD (موقع المركبة ← خارج المنشأة). فبين
  // التحميل والتسليم يظهر ما على كل مركبةٍ — وهو تقرير «ما على المركبات الآن».
  DN: {
    from: STAGING.code,
    to: VEHICLE,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'load-van',
    labelAr: 'تحميل بالمركبة',
  },
  POD: {
    from: VEHICLE,
    to: EXTERNAL,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'delivery',
    labelAr: 'تسليم للعميل',
  },
  RET: {
    from: EXTERNAL,
    to: RECEIVING.code,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'return-in',
    labelAr: 'إرجاع وارد',
  },
  DMG: {
    from: WAREHOUSE,
    to: SCRAP.code,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'damage',
    labelAr: 'إتلاف',
  },
  ADJ: {
    from: ADJUSTMENT.code,
    to: WAREHOUSE,
    qtyField: 'variance',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'adjustment',
    labelAr: 'تسوية جرد',
    signed: true,
    // الفارق لا يُكتب بل يُحسب: الفعلي المعدود ناقص الدفتري.
    computeQty: (line) => (Number(line?.actualQty) || 0) - (Number(line?.bookQty) || 0),
  },
  // ═══ النقل بين المستودعات ═══
  // مستند النقل يُخرج المشحون من المصدر إلى **مخزن النقل** (لا إلى الوجهة
  // مباشرةً): فبين المغادرة والاستلام لحظةٌ يقبع فيها الرصيد «في الطريق»،
  // وهي مصدر تقرير الشحنات المعلّقة. واستلام الفرع يُخرجه من مخزن النقل إلى
  // مستودع الوجهة — فيعود مخزن النقل إلى الصفر. أيّ بقيّةٍ فيه = فرق نقلٍ يُلاحَق.
  TRN: {
    from: WAREHOUSE_FROM,
    to: TRANSIT.code,
    qtyField: 'qtyShipped',
    expiryField: 'expiry',
    costField: 'unitCost',
    reason: 'transfer-out',
    labelAr: 'شحن نقل (مغادرة)',
  },
  TRC: {
    from: TRANSIT.code,
    to: WAREHOUSE_TO,
    qtyField: 'qtyReceived',
    expiryField: 'expiry',
    costField: 'unitCost',
    reason: 'transfer-in',
    labelAr: 'استلام نقل (وصول)',
  },
  // ═══ البيع من المركبة — المستودع المتنقّل (2026-08-09) ═══
  // الفرق بين هذه الدورة ودورة الصادر: هناك تُحمَّل المركبة بطلبِ عميلٍ معلوم
  // (`SO → PICK → DN → POD`)، وهنا تُحمَّل **بمخزونٍ للبيع** لا يعرف مشتريه بعد.
  // فالمندوب يخرج ببضاعةٍ في عهدته، ويقرّر السوقُ أين تذهب. ولذلك يلزم:
  //   `VLD` — تحميلٌ مباشر من الرفّ إلى المركبة، بلا ساحة تجهيزٍ ولا أمر بيع.
  //   `VSI` — بيعٌ يقع في الميدان: الفاتورة والخصم يقعان في اللحظة نفسها.
  //   `CRN` — مرتجعٌ يعود **إلى المركبة** لا إلى المستودع؛ فالمندوب ما يزال في
  //           الطريق، والبضاعة في عهدته حتى يُرجعها مساءً.
  //   `VRT` — إرجاع المتبقّي: هو الذي يُصفّر موقع المركبة فتُقفل الرحلة.
  // ولولا `VRT` لبقي رصيدٌ على مركبةٍ أُقفلت رحلتها — بضاعةٌ بلا عهدة، وهي
  // بعينها كيف يُولد العجز الذي لا صاحب له.
  VLD: {
    from: WAREHOUSE,
    to: VEHICLE,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitCost',
    reason: 'van-load',
    labelAr: 'تحميل المركبة',
  },
  VSI: {
    from: VEHICLE,
    to: EXTERNAL,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'van-sale',
    labelAr: 'بيع من المركبة',
  },
  CRN: {
    from: EXTERNAL,
    to: VEHICLE,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitPrice',
    reason: 'van-return-in',
    labelAr: 'مرتجع ميدانيّ',
  },
  VRT: {
    from: VEHICLE,
    to: WAREHOUSE,
    qtyField: 'qty',
    expiryField: 'expiry',
    costField: 'unitCost',
    reason: 'van-return-out',
    labelAr: 'إرجاع المتبقّي للمستودع',
  },
};

/** الأنواع التي تُحرّك المخزون فعلًا. */
export function postingTypes() {
  return Object.keys(POSTING_RULES);
}

/** قاعدة القيد لهذا النوع، أو null إن كان بلا أثر مخزني. */
export function postingRuleFor(type) {
  return POSTING_RULES[type] || null;
}

/** هل يُحرّك هذا النوع مخزونًا؟ */
export function movesStock(type) {
  return Boolean(POSTING_RULES[type]);
}

/**
 * هل يحتاج هذا النوع خانة مستودعٍ في رأسه (واحدة أو أكثر)؟
 * ما عداه يتنقّل بين مواقع نظامٍ معروفة سلفًا فلا يحتاج.
 */
export function needsWarehouse(type) {
  const rule = POSTING_RULES[type];
  return Boolean(rule) && (isWarehouseToken(rule.from) || isWarehouseToken(rule.to));
}

/** رموز المستودعات التي يقرؤها هذا النوع من رأسه (لفحص المخطّطات). */
export function warehouseFieldsFor(type) {
  const rule = POSTING_RULES[type];
  if (!rule) return [];
  return [rule.from, rule.to].filter(isWarehouseToken).map((t) => WAREHOUSE_TOKENS[t]);
}

/** الأنواع التي تلزمها خانة مستودع — لفحص المخطّطات في الاختبارات. */
export function warehouseRequiringTypes() {
  return postingTypes().filter(needsWarehouse);
}

/** الحالة التي يقع عندها القيد. مكانٌ واحد يُغيَّر لو تبدّلت السياسة. */
export const POSTING_STATE = 'done';
