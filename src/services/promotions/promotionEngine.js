/**
 * محرّك تقييم العروض — يُستدعى لحظة إدخال الطلب، لا بعده.
 *
 * ═══ القرار المعماريّ الحاكم: المجّانيّ بضاعةٌ لا خصم ═══
 * أشيع خطأٍ في أنظمة التوزيع أن تُعالَج «اشترِ ١٠ خذ ١» بخصمٍ قيمته كرتونة.
 * والنتيجة كارثيّة على المخزون: الكرتونة الحادية عشرة **خرجت من المركبة فعلًا**
 * ولم يُقيَّد خروجها، فيظهر عجزٌ في تسوية نهاية الرحلة لا يفهمه أحد، ويُنسب
 * للمندوب سرقةً وهو بريء.
 *
 * فالمجّانيّ هنا يخرج **بندًا كامل الأهليّة** (`isFree: true`, `unitPrice: 0`)
 * يمرّ في دفتر الحركات كأيّ بند، فيُخصم من رصيد المركبة ويُحسب في التسوية.
 * قيمته صفرٌ في الفاتورة، وتكلفته حقيقيّةٌ في المخزون — وهذا هو الصواب.
 *
 * ═══ الحتميّة ═══
 * نفس الطلب + نفس العروض = نفس النتيجة، دائمًا. العروض تُرتَّب بالأولويّة ثمّ
 * بالرمز (لا بترتيب وصولها من قاعدة البيانات)، فلا يتغيّر ما يناله التاجر لأنّ
 * استعلامًا عاد بترتيبٍ مختلف.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import {
  isPromoLive,
  isBudgetExhausted,
  matchesCustomer,
  matchesLine,
  sortedTiers,
  PROMO_TYPES,
} from './promotionModel.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const qtyOf = (l) => Number(l?.qty) || 0;
const priceOf = (l) => Number(l?.unitPrice) || 0;

/** حين يقترب الطلب من عتبة المجّانيّ بهذه النسبة أو أقلّ، نُنبّه المندوب. */
const NUDGE_RATIO = 0.5;

/**
 * يقيّم طلبًا مقابل العروض السارية.
 *
 * @param {object} args
 * @param {Array}  args.lines بنود الطلب `[{sku, category, qty, unitPrice, description}]`
 * @param {Array}  args.promotions تعريفات العروض
 * @param {object} [args.customer] `{code, outletType}`
 * @param {string} [args.day] اليوم `YYYY-MM-DD` لفحص نافذة السريان
 * @returns {{freeLines:Array, lineDiscounts:Array, applied:Array, skipped:Array,
 *            nudges:Array, totals:object}}
 */
export function evaluateOrder({ lines = [], promotions = [], customer = null, day = '' } = {}) {
  const rows = (lines || []).filter((l) => up(l?.sku) && qtyOf(l) > 0);
  const freeLines = [];
  const lineDiscounts = [];
  const applied = [];
  const skipped = [];
  const nudges = [];

  /** البنود التي احتكرها عرضٌ حصريّ فلا يمسّها ما بعده. */
  const locked = new Set();

  // الترتيب حتميّ: الأولويّة أوّلًا ثمّ الرمز — لا ترتيب قاعدة البيانات.
  const ordered = [...(promotions || [])].sort(
    (a, b) => (Number(a?.priority) || 0) - (Number(b?.priority) || 0) || up(a?.code).localeCompare(up(b?.code))
  );

  for (const promo of ordered) {
    const skip = (reason) => skipped.push({ promoId: promo?.id || '', code: promo?.code || '', reason });

    if (!isPromoLive(promo, day)) {
      skip(promo?.active === false ? 'معطّل' : 'خارج نافذة السريان');
      continue;
    }
    if (isBudgetExhausted(promo)) {
      skip('استُنفدت ميزانيّة العرض');
      continue;
    }
    if (!matchesCustomer(promo, customer)) {
      skip('العميل خارج نطاق العرض');
      continue;
    }

    const eligible = rows
      .map((l, i) => ({ line: l, index: i }))
      .filter(({ line, index }) => !locked.has(index) && matchesLine(promo, line));

    if (!eligible.length) {
      skip('لا بند في الطلب يطابق نطاق العرض');
      continue;
    }

    const result = applyPromotion(promo, eligible);
    if (!result.matched) {
      if (result.nudge) nudges.push({ promoId: promo.id, code: promo.code, ...result.nudge });
      skip(result.reason || 'لم تتحقّق شروط العرض');
      continue;
    }

    freeLines.push(...result.freeLines);
    lineDiscounts.push(...result.discounts);
    applied.push({
      promoId: promo.id || '',
      code: promo.code || '',
      nameAr: promo.nameAr || '',
      type: promo.type,
      typeLabel: PROMO_TYPES[promo.type]?.labelAr || promo.type,
      description: result.description,
      freeUnits: result.freeLines.reduce((s, f) => s + f.qty, 0),
      discount: money(result.discounts.reduce((s, d) => s + d.amount, 0)),
    });
    if (result.nudge) nudges.push({ promoId: promo.id, code: promo.code, ...result.nudge });

    if (promo.exclusive) for (const { index } of eligible) locked.add(index);
  }

  // الخصم لا يتجاوز قيمة البند مهما تراكمت العروض — ولا فاتورة بقيمةٍ سالبة.
  const capped = capDiscounts(lineDiscounts, rows);

  const totalDiscount = money(capped.reduce((s, d) => s + d.amount, 0));
  const freeUnits = freeLines.reduce((s, f) => s + f.qty, 0);
  const freeCost = money(freeLines.reduce((s, f) => s + f.qty * (Number(f.unitCost) || 0), 0));

  return {
    freeLines,
    lineDiscounts: capped,
    applied,
    skipped,
    nudges,
    totals: { discount: totalDiscount, freeUnits, freeCost, promosApplied: applied.length },
  };
}

/** يحدّ الخصم عند قيمة البند — تراكم عرضين لا يجوز أن يُنتج قيمةً سالبة. */
function capDiscounts(discounts, rows) {
  const byLine = new Map();
  for (const d of discounts) {
    byLine.set(d.lineIndex, [...(byLine.get(d.lineIndex) || []), d]);
  }
  const out = [];
  for (const [lineIndex, group] of byLine) {
    const line = rows[lineIndex];
    let remaining = money(qtyOf(line) * priceOf(line));
    for (const d of group) {
      const amount = money(Math.min(d.amount, Math.max(0, remaining)));
      remaining = money(remaining - amount);
      if (amount > 0) out.push({ ...d, amount });
    }
  }
  return out.sort((a, b) => a.lineIndex - b.lineIndex);
}

/** يوزّع التطبيق على دوالّ الأنواع. */
function applyPromotion(promo, eligible) {
  switch (promo.type) {
    case 'buy_x_get_y':
      return applyBuyXGetY(promo, eligible);
    case 'attach':
      return applyAttach(promo, eligible);
    case 'tiered_discount':
      return applyTiered(promo, eligible);
    case 'bundle':
      return applyBundle(promo, eligible);
    case 'mix_match':
      return applyMixMatch(promo, eligible);
    default:
      return { matched: false, reason: 'نوع عرضٍ غير مدعوم' };
  }
}

/** يبني بند المجّانيّ — بضاعةٌ تخرج، لا سطرٌ في ورقة. */
function freeLine({ sku, description, qty, unitCost, promo, reason }) {
  return {
    sku: up(sku),
    description: description || '',
    qty,
    unitPrice: 0,
    unitCost: Number(unitCost) || 0,
    isFree: true,
    promoId: promo.id || '',
    promoCode: promo.code || '',
    reason,
  };
}

/**
 * اشترِ X خذ Y.
 * بلا `getSku` يُمنح المجّانيّ **من الصنف نفسه لكلّ بندٍ على حدة** — فمن اشترى
 * عشرين من صنفٍ لا يأخذ مجّانيّه من صنفٍ آخر لم يطلبه.
 * وبـ`getSku` يُجمَّع المؤهَّل كلّه ويُمنح المجّانيّ من الصنف المحدّد.
 */
function applyBuyXGetY(promo, eligible) {
  const buyQty = Number(promo.buyQty) || 0;
  const getQty = Number(promo.getQty) || 0;
  if (buyQty <= 0 || getQty <= 0) return { matched: false, reason: 'إعداد العرض ناقص' };

  const freeLines = [];
  const getSku = up(promo.getSku);

  if (getSku) {
    const total = eligible.reduce((s, e) => s + qtyOf(e.line), 0);
    const sets = Math.floor(total / buyQty);
    if (sets < 1) return { matched: false, reason: `الكميّة ${total} أقلّ من عتبة العرض (${buyQty})`, nudge: nudgeFor(total, buyQty, promo) };
    const donor = eligible.find((e) => up(e.line.sku) === getSku)?.line;
    freeLines.push(
      freeLine({
        sku: getSku,
        description: donor?.description || promo.getSkuName || '',
        qty: sets * getQty,
        unitCost: donor?.unitCost,
        promo,
        reason: `${buyQty} ← ${getQty} مجّانًا (${sets} مرّة)`,
      })
    );
    return {
      matched: true,
      freeLines,
      discounts: [],
      description: `${total} وحدة ⇐ ${sets * getQty} مجّانًا من ${getSku}`,
      nudge: nudgeFor(total, buyQty, promo),
    };
  }

  let totalSets = 0;
  let nudge = null;
  for (const { line } of eligible) {
    const q = qtyOf(line);
    const sets = Math.floor(q / buyQty);
    if (sets < 1) {
      if (!nudge) nudge = nudgeFor(q, buyQty, promo, line);
      continue;
    }
    totalSets += sets;
    freeLines.push(
      freeLine({
        sku: line.sku,
        description: line.description,
        qty: sets * getQty,
        unitCost: line.unitCost,
        promo,
        reason: `${buyQty} ← ${getQty} مجّانًا (${sets} مرّة)`,
      })
    );
  }

  if (!freeLines.length) {
    return { matched: false, reason: `لا بند يبلغ عتبة العرض (${buyQty})`, nudge };
  }
  return {
    matched: true,
    freeLines,
    discounts: [],
    description: `${totalSets} مرّة × ${getQty} مجّانًا`,
    nudge,
  };
}

/** تلميح البيع الإضافيّ: كم يلزم لبلوغ العتبة؟ يظهر للمندوب أثناء الإدخال. */
function nudgeFor(qty, threshold, promo, line) {
  const need = threshold - (qty % threshold);
  if (need <= 0 || need > threshold * NUDGE_RATIO) return null;
  return {
    need,
    message: `أضف ${need} ${line?.description ? `من «${line.description}» ` : ''}ليستحقّ العميل عرض «${promo.nameAr || promo.code}»`,
  };
}

/**
 * تحميل صنف على صنف — الطريقة التي تُصرَّف بها الأصناف بطيئة الحركة.
 * المحمَّل مجّانيّ (يخرج من المركبة) ولا يُطلب من العميل شراؤه.
 */
function applyAttach(promo, eligible) {
  const perQty = Number(promo.perQty) || 0;
  const attachQty = Number(promo.attachQty) || 0;
  const attachSku = up(promo.attachSku);
  if (perQty <= 0 || attachQty <= 0 || !attachSku) return { matched: false, reason: 'إعداد التحميل ناقص' };

  const total = eligible.reduce((s, e) => s + qtyOf(e.line), 0);
  const sets = Math.floor(total / perQty);
  if (sets < 1) {
    return { matched: false, reason: `الكميّة ${total} أقلّ من ${perQty}`, nudge: nudgeFor(total, perQty, promo) };
  }

  return {
    matched: true,
    freeLines: [
      freeLine({
        sku: attachSku,
        description: promo.attachSkuName || '',
        qty: sets * attachQty,
        unitCost: promo.attachUnitCost,
        promo,
        reason: `تحميل: لكلّ ${perQty} وحدة ⇐ ${attachQty}`,
      }),
    ],
    discounts: [],
    description: `${total} وحدة ⇐ تحميل ${sets * attachQty} من ${attachSku}`,
    nudge: nudgeFor(total, perQty, promo),
  };
}

/** خصم كمّيّ متدرّج — الشريحة الأعلى المستحقّة، لا الأولى المكتوبة. */
function applyTiered(promo, eligible) {
  const tiers = sortedTiers(promo);
  if (!tiers.length) return { matched: false, reason: 'لا شرائح معرّفة' };

  const total = eligible.reduce((s, e) => s + qtyOf(e.line), 0);
  const tier = tiers.find((t) => total >= t.minQty);
  if (!tier) {
    const lowest = tiers[tiers.length - 1];
    return {
      matched: false,
      reason: `الكميّة ${total} دون أدنى شريحة (${lowest.minQty})`,
      nudge: nudgeFor(total, lowest.minQty, promo),
    };
  }

  const discounts = eligible.map(({ line, index }) => ({
    lineIndex: index,
    amount: money(qtyOf(line) * priceOf(line) * (tier.discountPct / 100)),
    promoId: promo.id || '',
    promoCode: promo.code || '',
    reason: `خصم ${tier.discountPct}% عند ${tier.minQty} فأكثر`,
  }));

  const nextTier = [...tiers].reverse().find((t) => t.minQty > total);
  return {
    matched: true,
    freeLines: [],
    discounts,
    description: `${total} وحدة ⇐ خصم ${tier.discountPct}%`,
    nudge: nextTier
      ? {
          need: nextTier.minQty - total,
          message: `أضف ${nextTier.minQty - total} ليرتفع الخصم إلى ${nextTier.discountPct}%`,
        }
      : null,
  };
}

/** حزمة بسعرٍ ثابت — الخصم فرق مجموع البنود عن سعر الحزمة، موزّعًا بالنسبة. */
function applyBundle(promo, eligible) {
  const spec = (promo.bundleLines || [])
    .map((l) => ({ sku: up(l?.sku), qty: Number(l?.qty) || 0 }))
    .filter((l) => l.sku && l.qty > 0);
  if (spec.length < 2) return { matched: false, reason: 'الحزمة ناقصة التعريف' };

  const bySku = new Map();
  for (const { line, index } of eligible) {
    const k = up(line.sku);
    const prev = bySku.get(k) || { qty: 0, price: priceOf(line), index };
    bySku.set(k, { ...prev, qty: prev.qty + qtyOf(line) });
  }

  let sets = Infinity;
  for (const s of spec) {
    const have = bySku.get(s.sku);
    if (!have) return { matched: false, reason: `الحزمة تحتاج الصنف ${s.sku}` };
    sets = Math.min(sets, Math.floor(have.qty / s.qty));
  }
  if (!Number.isFinite(sets) || sets < 1) return { matched: false, reason: 'لم تكتمل حزمةٌ واحدة' };

  const listValue = money(sets * spec.reduce((s, l) => s + l.qty * (bySku.get(l.sku)?.price || 0), 0));
  const bundleValue = money(sets * (Number(promo.bundlePrice) || 0));
  const saving = money(listValue - bundleValue);
  if (saving <= 0) return { matched: false, reason: 'سعر الحزمة لا يقلّ عن مجموع بنودها' };

  // التوزيع بالنسبة كي يُنسب الخصم لبنوده لا لبندٍ واحدٍ اعتباطًا.
  const discounts = spec
    .map((l) => {
      const have = bySku.get(l.sku);
      const share = listValue > 0 ? (sets * l.qty * have.price) / listValue : 0;
      return {
        lineIndex: have.index,
        amount: money(saving * share),
        promoId: promo.id || '',
        promoCode: promo.code || '',
        reason: `حزمة «${promo.nameAr || promo.code}» × ${sets}`,
      };
    })
    .filter((d) => d.amount > 0);

  return {
    matched: true,
    freeLines: [],
    discounts,
    description: `${sets} حزمة ⇐ توفير ${saving}`,
  };
}

/**
 * اخلط واختر — أيّ تشكيلةٍ تبلغ الكميّة بسعرٍ ثابت.
 * الوحدات تُخصَّص **من الأعلى سعرًا أوّلًا**: هذا ما يختاره العميل بطبعه، وهو
 * القراءة التي لا تُنتج خلافًا عند الحساب.
 */
function applyMixMatch(promo, eligible) {
  const skus = new Set((promo.mixMatchSkus || []).map(up).filter(Boolean));
  const setQty = Number(promo.mixMatchQty) || 0;
  const setPrice = Number(promo.mixMatchPrice) || 0;
  if (skus.size < 2 || setQty <= 0 || setPrice <= 0) return { matched: false, reason: 'إعداد «اخلط واختر» ناقص' };

  const pool = eligible.filter(({ line }) => skus.has(up(line.sku)));
  const total = pool.reduce((s, e) => s + qtyOf(e.line), 0);
  const sets = Math.floor(total / setQty);
  if (sets < 1) {
    return { matched: false, reason: `الكميّة ${total} أقلّ من ${setQty}`, nudge: nudgeFor(total, setQty, promo) };
  }

  let toAllocate = sets * setQty;
  const sorted = [...pool].sort((a, b) => priceOf(b.line) - priceOf(a.line));
  const alloc = [];
  let listValue = 0;
  for (const { line, index } of sorted) {
    if (toAllocate <= 0) break;
    const take = Math.min(qtyOf(line), toAllocate);
    toAllocate -= take;
    listValue = money(listValue + take * priceOf(line));
    alloc.push({ index, value: money(take * priceOf(line)) });
  }

  const saving = money(listValue - sets * setPrice);
  if (saving <= 0) return { matched: false, reason: 'سعر التشكيلة لا يقلّ عن سعر أصنافها' };

  const discounts = alloc
    .map((a) => ({
      lineIndex: a.index,
      amount: money(listValue > 0 ? saving * (a.value / listValue) : 0),
      promoId: promo.id || '',
      promoCode: promo.code || '',
      reason: `اخلط واختر ${setQty} بسعر ${setPrice} × ${sets}`,
    }))
    .filter((d) => d.amount > 0);

  return {
    matched: true,
    freeLines: [],
    discounts,
    description: `${sets} تشكيلة ⇐ توفير ${saving}`,
    nudge: nudgeFor(total, setQty, promo),
  };
}

/**
 * يدمج المجّانيّات في بنود الفاتورة — هذه هي الخطوة التي تجعلها بضاعةً
 * تُقيَّد في الدفتر لا رقمًا في ورقة. تُستدعى قبل حفظ `VSI`.
 */
export function mergeFreeLines(lines, freeLines) {
  return [...(lines || []), ...(freeLines || []).map((f) => ({ ...f, qty: f.qty, unitPrice: 0, discount: 0 }))];
}

/** استهلاك الميزانيّة الناتج عن هذا الطلب — يُضاف إلى `usage` بعد الاعتماد. */
export function budgetConsumption(result) {
  const byPromo = new Map();
  for (const f of result?.freeLines || []) {
    const e = byPromo.get(f.promoId) || { freeUnits: 0, value: 0 };
    e.freeUnits += f.qty;
    e.value = money(e.value + f.qty * (Number(f.unitCost) || 0));
    byPromo.set(f.promoId, e);
  }
  for (const d of result?.lineDiscounts || []) {
    const e = byPromo.get(d.promoId) || { freeUnits: 0, value: 0 };
    e.value = money(e.value + d.amount);
    byPromo.set(d.promoId, e);
  }
  return [...byPromo.entries()].map(([promoId, v]) => ({ promoId, ...v }));
}
