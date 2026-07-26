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
 * والمنطق نفسه يحكم `STAGING` (سُحب ↔ سُلّم) و`TRANSIT` (شُحن ↔ استُلم).
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
  DN: {
    from: STAGING.code,
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
