/**
 * تكلفة الغذاء المثاليّة مقابل الفعليّة ‹FNB-703› — منطق خالص.
 *
 * ═══ ★ موضع التعارض داخل المستند نفسه ═══
 * التقييم النهائيّ يجعل نهاية السلسلة **«ربحيّة فرع»** (سطر 713)، و«٧. عدم
 * تكرار المحاسبة» تجعل **أودو المصدر الماليّ** (سطر 663). فلو حُسبت الربحيّة
 * هنا لصار للمال دفتران يفترقان، ولو أُهملت لسقط نصف قيمة المرجع.
 *
 * ═══ والحدّ المعلَن (ق-O07 بسلوكه الافتراضيّ) ═══
 *   · **البوابة تُنتج التكلفة التشغيليّة**: كم استُهلك × بكم — من دفترنا.
 *   · **وأودو يُنتج الربحيّة**: إيرادٌ وتكلفةُ مبيعاتٍ وقيدٌ محاسبيّ.
 *   · **والبوابة تعرضها مرآةً** عبر `pullRegistry` ولا تحسبها.
 * وهذا ليس عجزًا بل عقدٌ محروس: `FINANCE_OWNER = 'odoo'` مبنيٌّ منذ الجسر،
 * وهنا حارسٌ يمنع خرقه من داخل حسابات القطاع.
 *
 * ═══ ولماذا الفرق يُنسب لسببه ═══
 * «المثاليّ ١٠٠ والفعليّ ١٢٠» رقمٌ لا يُعالَج. والفرق ثلاثةٌ لا واحد: هدرٌ
 * مسجَّل · فرقُ جردٍ · وانحرافُ وصفةٍ (ما بقي بعدهما). ومن لم يفصلها طارد
 * الهدر بينما العطب في الوصفة.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { FINANCE_OWNER } from '../odoo/financialImpact.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;

/**
 * ★ حدُّ البوابة ‹FNB-703 · ق-O07› — ما تحسبه وما تقرؤه مرآةً.
 * سجلٌّ معلَن يُقرأ بلا فتح الكود، ويحرسه اختبار.
 */
export const COST_SCOPE = Object.freeze({
  computed: ['idealFoodCost', 'actualFoodCost', 'variance', 'consumptionValue'],
  mirrored: ['revenue', 'cogs', 'grossProfit', 'branchProfitability'],
  owner: FINANCE_OWNER,
});

/** أسباب الفرق — ثلاثةٌ لا واحد، ولكلٍّ مصدرٌ يُقرأ منه. */
export const VARIANCE_CAUSES = Object.freeze({
  waste: { id: 'waste', labelAr: 'هدرٌ مسجَّل', source: 'سندات التالف والهدر' },
  count: { id: 'count', labelAr: 'فرقُ جرد', source: 'سندات التسوية' },
  recipe: { id: 'recipe', labelAr: 'انحرافُ وصفةٍ أو تحضير', source: 'الباقي بعد المفسَّر' },
});

/**
 * تكلفة الغذاء المثاليّة والفعليّة لصنفٍ في فرع ‹FNB-703›.
 *
 * @param {{sku, branch}} key
 * @param {object} ctx
 *   `idealQty` الاستهلاك النظريّ (FNB-702) · `actualQty` الفعليّ من الدفتر ·
 *   `unitCost` تكلفة الوحدة · `wasteQty` · `countVarianceQty`
 * @returns {object} بتكلفتَيه وفرقه **منسوبًا لأسبابه**
 */
export function foodCostOf(key, ctx = {}) {
  const sku = normalizeItemCode(key?.sku);
  const branch = up(key?.branch);
  const unitCost = num(ctx.unitCost);

  const idealQty = round3(num(ctx.idealQty));
  const actualQty = round3(num(ctx.actualQty));
  const varianceQty = round3(actualQty - idealQty);

  const wasteQty = round3(num(ctx.wasteQty));
  const countQty = round3(num(ctx.countVarianceQty));
  // الباقي بعد المفسَّر هو انحراف الوصفة/التحضير — **لا يُخمَّن بل يُشتقّ**.
  const recipeQty = round3(varianceQty - wasteQty - countQty);

  const at = (q) => money(q * unitCost);
  const pct = idealQty > 0 ? Math.round((varianceQty / idealQty) * 1000) / 10 : (actualQty > 0 ? 100 : 0);

  return {
    sku,
    branch,
    unitCost: money(unitCost),
    idealQty,
    actualQty,
    idealCost: at(idealQty),
    actualCost: at(actualQty),
    varianceQty,
    varianceCost: at(varianceQty),
    variancePct: pct,
    causes: [
      { ...VARIANCE_CAUSES.waste, qty: wasteQty, cost: at(wasteQty) },
      { ...VARIANCE_CAUSES.count, qty: countQty, cost: at(countQty) },
      { ...VARIANCE_CAUSES.recipe, qty: recipeQty, cost: at(recipeQty) },
    ],
    why:
      `المثاليّ ${idealQty} والفعليّ ${actualQty} (${varianceQty >= 0 ? '+' : '−'}${Math.abs(varianceQty)} · ٪${Math.abs(pct)})` +
      ` — منها هدرٌ ${wasteQty} وفرقُ جردٍ ${countQty} والباقي ${recipeQty} وصفةً أو تحضيرًا.`,
  };
}

/** تكلفة الغذاء لمجموعة أصناف — مرتَّبةً بأثر الفرق الماليّ. */
export function foodCostReport(rows = [], ctx = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => foodCostOf(r, { ...r, unitCost: num(r.unitCost ?? ctx.unitCostBySku?.get?.(normalizeItemCode(r.sku))) }))
    .filter((r) => r.idealQty > 0 || r.actualQty > 0)
    .sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost));
}

/** نسبة تكلفة الغذاء إلى المبيعات — المقياس الذي يقرؤه التشغيل. */
export function foodCostRatio({ cost = 0, sales = 0 } = {}) {
  const s = num(sales);
  if (s <= 0) return { ratio: null, why: 'بلا مبيعاتٍ لا تُحسب نسبة — القسمة على صفرٍ لا تُخمَّن.' };
  const ratio = Math.round((num(cost) / s) * 1000) / 10;
  return { ratio, why: `تكلفةٌ ${money(cost)} من مبيعاتٍ ${money(sales)} = ٪${ratio}.` };
}

/**
 * ★★ حارس حدّ البوابة ‹FNB-703 · ق‑ت١› — **لا يُحسب ما يملكه أودو**.
 *
 * يُستدعى قبل عرض أيّ رقمٍ ماليّ: ما كان في `mirrored` يجب أن يأتي **مقروءًا
 * من المرآة** لا محسوبًا هنا. ومن حسب ربحيّة فرعٍ في البوابة فتح دفترًا
 * ثانيًا للمال — وهو ما نصّ المستند على منعه.
 *
 * @param {string[]} metrics أسماء المقاييس المطلوب عرضها
 * @param {{fromMirror?:string[]}} [opts] ما وصل فعلًا من أودو
 * @returns {{ok:boolean, problems:string[]}}
 */
export function scopeVerdict(metrics = [], { fromMirror = [] } = {}) {
  const mirrored = new Set(COST_SCOPE.mirrored);
  const arrived = new Set((Array.isArray(fromMirror) ? fromMirror : []).map(str));
  const problems = [];

  for (const m of Array.isArray(metrics) ? metrics : []) {
    const name = str(m);
    if (!mirrored.has(name)) continue;
    if (!arrived.has(name)) {
      problems.push(
        `«${name}» يملكه ${COST_SCOPE.owner} — يُقرأ مرآةً ولا يُحسب في البوابة. ` +
          'وحسابُه هنا يفتح للمال دفترًا ثانيًا.'
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

/** أهذا المقياس من عمل البوابة أم من عمل أودو؟ — للعرض والتوثيق. */
export function ownerOf(metric) {
  const name = str(metric);
  if (COST_SCOPE.computed.includes(name)) return { owner: 'portal', labelAr: 'تحسبه البوابة' };
  if (COST_SCOPE.mirrored.includes(name)) return { owner: COST_SCOPE.owner, labelAr: 'يُقرأ مرآةً من أودو' };
  return { owner: 'unknown', labelAr: 'غير مصنَّف — يُعلَن ولا يُعرض رقمًا' };
}
