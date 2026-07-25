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

const { RECEIVING, QUARANTINE, STAGING, SCRAP, ADJUSTMENT } = SYSTEM_LOCATIONS;

/**
 * `WAREHOUSE` رمزٌ خاصّ يعني: «اقرأ المستودع من رأس المستند» — لأن الموقع
 * الحقيقي لا يُعرف إلا وقت التنفيذ، بخلاف مواقع النظام الثابتة.
 */
export const WAREHOUSE = '@warehouse';

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
 * هل يحتاج هذا النوع حقل «المستودع» في رأسه؟
 * أربعة فقط — لأن البقيّة تتنقّل بين مواقع نظامٍ معروفة سلفًا.
 */
export function needsWarehouse(type) {
  const rule = POSTING_RULES[type];
  return Boolean(rule) && (rule.from === WAREHOUSE || rule.to === WAREHOUSE);
}

/** الأنواع التي تلزمها خانة مستودع — لفحص المخطّطات في الاختبارات. */
export function warehouseRequiringTypes() {
  return postingTypes().filter(needsWarehouse);
}

/** الحالة التي يقع عندها القيد. مكانٌ واحد يُغيَّر لو تبدّلت السياسة. */
export const POSTING_STATE = 'done';
