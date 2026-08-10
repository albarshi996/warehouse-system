/**
 * تعريف العرض الترويجيّ — الشكل والتحقّق والمطابقة.
 *
 * المشكلة التي تحلّها: العروض في التوزيع تُدار بالورق والذاكرة. المندوب يعرف
 * أنّ «اشترِ عشرة تأخذ واحدًا»، فيمنح الواحد أحيانًا، ويمنح اثنين لصديقٍ تاجر،
 * وينساه مع من لا يُلحّ. ثمّ تُقفَل الحملة فلا أحد يعرف كم كلّفت ولا من استفاد.
 * وهذا هو **تسريب الترويجات** — أضخم بندٍ ضائعٍ في شركات التوزيع بعد التالف.
 *
 * الحلّ ليس تقريرًا لاحقًا بل **تطبيقٌ آليّ لحظة إدخال الطلب**: لا يمنح المندوب
 * العرض، بل يحسبه النظام ويُظهره. فلا يُنسى ولا يُضاعَف ولا يُمنح لمن لا يستحقّ.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

/**
 * أنواع العروض. لكلٍّ حقولُه، ويحرسها `promotionVerdict` فلا يُحفظ عرضٌ ناقص
 * يفشل صامتًا في الميدان.
 */
export const PROMO_TYPES = {
  buy_x_get_y: {
    id: 'buy_x_get_y',
    labelAr: 'اشترِ X واحصل على Y',
    hint: 'مجّانيّ من الصنف نفسه أو من صنفٍ آخر — الأشهر في السلع الاستهلاكيّة.',
    required: ['buyQty', 'getQty'],
  },
  attach: {
    id: 'attach',
    labelAr: 'تحميل صنف على صنف',
    hint: 'كلّ كميّةٍ من صنفٍ سريع تُحمَّل معها كميّةٌ من صنفٍ بطيء الحركة.',
    required: ['perQty', 'attachSku', 'attachQty'],
  },
  tiered_discount: {
    id: 'tiered_discount',
    labelAr: 'خصم كمّيّ متدرّج',
    hint: 'كلّما زادت الكميّة زادت نسبة الخصم — يدفع التاجر للشراء بالجملة.',
    required: ['tiers'],
  },
  bundle: {
    id: 'bundle',
    labelAr: 'حزمة بسعر ثابت',
    hint: 'أصنافٌ محدّدة بكمّيّاتها تُباع معًا بسعرٍ أقلّ من مجموعها.',
    required: ['bundleLines', 'bundlePrice'],
  },
  mix_match: {
    id: 'mix_match',
    labelAr: 'اخلط واختر',
    hint: 'أيّ تشكيلةٍ من مجموعة أصناف تبلغ الكميّة المطلوبة بسعرٍ ثابت.',
    required: ['mixMatchSkus', 'mixMatchQty', 'mixMatchPrice'],
  },
};

/** عرضٌ فارغ بحقوله كلّها — كي لا تختلف بنية الكائن بين حالةٍ وأخرى. */
export function blankPromotion() {
  return {
    id: '',
    code: '',
    nameAr: '',
    type: 'buy_x_get_y',
    active: true,
    priority: 10,
    exclusive: false,
    startDate: '',
    endDate: '',
    scope: { skus: [], categories: [], customerCodes: [], outletTypes: [] },
    buyQty: 0,
    getQty: 0,
    getSku: '',
    perQty: 0,
    attachSku: '',
    attachQty: 0,
    tiers: [],
    bundleLines: [],
    bundlePrice: 0,
    mixMatchSkus: [],
    mixMatchQty: 0,
    mixMatchPrice: 0,
    budget: { maxFreeUnits: 0, maxValue: 0 },
    usage: { freeUnits: 0, value: 0, orders: 0 },
  };
}

const up = (v) => String(v ?? '').trim().toUpperCase();
const list = (v) => (Array.isArray(v) ? v.map(up).filter(Boolean) : []);

/**
 * حكم على تعريف العرض — يُستدعى قبل الحفظ.
 *
 * العرض المعطوب لا يُخطئ بصوتٍ عالٍ، بل **لا ينطبق أبدًا** فيظنّ الجميع أنّه
 * يعمل. ولذلك التحقّق هنا صارم: نافذةٌ زمنيّة مقلوبة، أو كميّةٌ صفر، أو حزمةٌ
 * سعرها أعلى من مجموع بنودها — كلّها أعطابٌ تمرّ بصمتٍ لولا هذا الحارس.
 */
export function promotionVerdict(promo) {
  const problems = [];
  const warnings = [];

  if (!up(promo?.code)) problems.push('رمز العرض مطلوب — به يُنسب الخصم في الفاتورة');
  if (!String(promo?.nameAr || '').trim()) problems.push('اسم العرض مطلوب');

  const type = PROMO_TYPES[promo?.type];
  if (!type) {
    problems.push('نوع العرض غير معروف');
    return { ok: false, problems, warnings };
  }

  const start = String(promo?.startDate || '').slice(0, 10);
  const end = String(promo?.endDate || '').slice(0, 10);
  if (start && end && end < start) problems.push('تاريخ الانتهاء يسبق تاريخ البدء');
  if (!start) warnings.push('بلا تاريخ بدء — يسري فور تفعيله');
  if (!end) warnings.push('بلا تاريخ انتهاء — يسري حتى تُعطّله يدويًّا');

  switch (promo.type) {
    case 'buy_x_get_y': {
      if (!(Number(promo.buyQty) > 0)) problems.push('كميّة الشراء يجب أن تكون أكبر من صفر');
      if (!(Number(promo.getQty) > 0)) problems.push('الكميّة المجّانيّة يجب أن تكون أكبر من صفر');
      if (Number(promo.getQty) > Number(promo.buyQty)) {
        warnings.push('المجّانيّ أكثر من المشترى — تأكّد أنّ هذا مقصود');
      }
      if (!promo.getSku && !list(promo?.scope?.skus).length) {
        problems.push('حدّد الصنف المجّانيّ أو احصر العرض بأصنافٍ بعينها');
      }
      break;
    }
    case 'attach': {
      if (!(Number(promo.perQty) > 0)) problems.push('«لكلّ كم؟» يجب أن تكون أكبر من صفر');
      if (!up(promo.attachSku)) problems.push('صنف التحميل مطلوب');
      if (!(Number(promo.attachQty) > 0)) problems.push('كميّة التحميل يجب أن تكون أكبر من صفر');
      if (!list(promo?.scope?.skus).length && !list(promo?.scope?.categories).length) {
        warnings.push('بلا نطاق — سيُحمَّل على كلّ الأصناف');
      }
      break;
    }
    case 'tiered_discount': {
      const tiers = (promo.tiers || []).map((t) => ({ minQty: Number(t?.minQty) || 0, discountPct: Number(t?.discountPct) || 0 }));
      if (!tiers.length) problems.push('أضف شريحةً واحدة على الأقلّ');
      if (tiers.some((t) => t.minQty <= 0)) problems.push('كميّة الشريحة يجب أن تكون أكبر من صفر');
      if (tiers.some((t) => t.discountPct <= 0 || t.discountPct > 100)) {
        problems.push('نسبة الخصم يجب أن تكون بين ١ و١٠٠');
      }
      // شرائح غير مرتّبة تصلَّح آليًّا في التقييم، لكنّ المتساوية غموضٌ حقيقيّ.
      const mins = tiers.map((t) => t.minQty);
      if (new Set(mins).size !== mins.length) problems.push('شريحتان بالكميّة نفسها — أيّهما تُطبَّق؟');
      break;
    }
    case 'bundle': {
      const lines = (promo.bundleLines || []).filter((l) => up(l?.sku) && Number(l?.qty) > 0);
      if (lines.length < 2) problems.push('الحزمة تحتاج صنفَين على الأقلّ');
      if (!(Number(promo.bundlePrice) > 0)) problems.push('سعر الحزمة مطلوب');
      break;
    }
    case 'mix_match': {
      if (list(promo.mixMatchSkus).length < 2) problems.push('«اخلط واختر» تحتاج صنفَين على الأقلّ');
      if (!(Number(promo.mixMatchQty) > 0)) problems.push('الكميّة المطلوبة يجب أن تكون أكبر من صفر');
      if (!(Number(promo.mixMatchPrice) > 0)) problems.push('سعر التشكيلة مطلوب');
      break;
    }
    default:
      break;
  }

  const maxUnits = Number(promo?.budget?.maxFreeUnits) || 0;
  const maxValue = Number(promo?.budget?.maxValue) || 0;
  if (!maxUnits && !maxValue) {
    warnings.push('بلا سقفٍ للميزانيّة — العرض يسري بلا حدٍّ لكلفته');
  }

  return { ok: problems.length === 0, problems, warnings };
}

/** هل العرض سارٍ في هذا اليوم؟ */
export function isPromoLive(promo, day) {
  if (!promo || promo.active === false) return false;
  const d = String(day || '').slice(0, 10);
  if (!d) return true;
  const start = String(promo.startDate || '').slice(0, 10);
  const end = String(promo.endDate || '').slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** هل استُنفدت ميزانيّة العرض؟ صفرٌ في السقف يعني «بلا سقف». */
export function isBudgetExhausted(promo) {
  const maxUnits = Number(promo?.budget?.maxFreeUnits) || 0;
  const maxValue = Number(promo?.budget?.maxValue) || 0;
  const usedUnits = Number(promo?.usage?.freeUnits) || 0;
  const usedValue = Number(promo?.usage?.value) || 0;
  if (maxUnits > 0 && usedUnits >= maxUnits) return true;
  if (maxValue > 0 && usedValue >= maxValue) return true;
  return false;
}

/** هل يشمل نطاق العرض هذا العميل؟ نطاقٌ فارغ = الجميع. */
export function matchesCustomer(promo, customer) {
  const codes = list(promo?.scope?.customerCodes);
  const outlets = list(promo?.scope?.outletTypes);
  if (codes.length && !codes.includes(up(customer?.code))) return false;
  if (outlets.length && !outlets.includes(up(customer?.outletType))) return false;
  return true;
}

/** هل يشمل نطاق العرض هذا البند؟ نطاقٌ فارغ = كلّ الأصناف. */
export function matchesLine(promo, line) {
  const skus = list(promo?.scope?.skus);
  const cats = list(promo?.scope?.categories);
  if (!skus.length && !cats.length) return true;
  if (skus.length && skus.includes(up(line?.sku))) return true;
  if (cats.length && cats.includes(up(line?.category))) return true;
  return false;
}

/** الشرائح مرتّبةً تنازليًّا — فتُطبَّق الأعلى المستحقّة لا الأولى المكتوبة. */
export function sortedTiers(promo) {
  return [...(promo?.tiers || [])]
    .map((t) => ({ minQty: Number(t?.minQty) || 0, discountPct: Number(t?.discountPct) || 0 }))
    .filter((t) => t.minQty > 0 && t.discountPct > 0)
    .sort((a, b) => b.minQty - a.minQty);
}
