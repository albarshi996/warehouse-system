/**
 * مبيعات نقطة البيع والاستهلاك النظريّ ‹FNB-702› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * سلسلة خطة القطاع: **POS Sales → Menu Item → Recipe → Theoretical Consumption**
 * كانت معدومةً بطرفها الأوّل والأخير: الوصفة بُنيت (‹FNB-501›) والانفجار يعمل،
 * ولا مُدخلَ مبيعاتٍ يغذّيه ولا مقارنةَ نظريٍّ بفعليّ. فتظلّ «كم كان يجب أن
 * نستهلك؟» بلا جواب، ويظلّ الهدر والسرقة وخطأ الوصفة شيئًا واحدًا لا يتمايز.
 *
 * ═══ مصدر-محايد بقرارٍ معلَن (ق-O06) ═══
 * مصدر المبيعات (Foodics مباشرةً · أودو · ملفّ يوميّ) قرارٌ تقنيّ لم يُحسم —
 * فالطبقة تُبنى على **شكلٍ واحدٍ مطبَّع**: `{date, branch, sku, qty}`. المطبِّع
 * يقبل صفوفًا بأسماء حقولٍ شتّى (كما يفعل `excelSchema` بالمرادفات)، والموصِّل
 * بعينه يُكتب لاحقًا في `integration/` وفق السياسة — فلا يتعطّل الاستهلاك
 * النظريّ على قرارٍ تقنيّ، ولا يُعاد بناء المحرّك حين يُحسم.
 *
 * ═══ والوصفة بنسختها وقت البيع ═══
 * بيعُ يوم ١٥ مارس يُفسَّر بوصفة ١٥ مارس ولو تغيّرت الوصفة بعده — الانفجار
 * يمرّ بـ`recipeAsOf(index, sku, يوم البيع)` لكلّ يومٍ على حدة. فالتقرير
 * التاريخيّ ثابتٌ لا يُعاد حسابه بوصفة اليوم (قاعدة «النسخ لا التعديل»).
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { explodeRecipe } from '../items/recipe.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;
const day = (v) => str(v).slice(0, 10);

/* ═══════════════ ١. المطبِّع ═══════════════ */

/** مرادفات الحقول كما تكتبها المصادر — Foodics وأودو والشيتات اليدويّة. */
const FIELD_ALIASES = Object.freeze({
  date: ['date', 'day', 'business_date', 'businessdate', 'order_date', 'التاريخ', 'اليوم', 'تاريخ البيع'],
  branch: ['branch', 'branch_code', 'branchcode', 'outlet', 'location', 'store', 'الفرع', 'رمز الفرع', 'المطعم'],
  sku: ['sku', 'item', 'item_code', 'itemcode', 'product', 'product_code', 'menu_item', 'default_code', 'الصنف', 'كود الصنف', 'الكود'],
  qty: ['qty', 'quantity', 'count', 'sold', 'units', 'الكمية', 'العدد', 'المباع'],
});

/** قيمة أوّل حقلٍ موجود من مرادفاته — تُقرأ كما كُتبت وتُطبَّع عند الإخراج. */
function pick(row, field) {
  if (row == null || typeof row !== 'object') return undefined;
  if (row[field] !== undefined) return row[field];
  const wanted = FIELD_ALIASES[field];
  for (const key of Object.keys(row)) {
    if (wanted.includes(str(key).toLowerCase())) return row[key];
  }
  return undefined;
}

/**
 * صفُّ بيعٍ من أيّ مصدر ← شكلًا واحدًا، أو سببَ رفضٍ مقروءًا.
 * @returns {{sale:{date,branch,sku,qty}|null, problem:string}}
 */
export function readSaleRow(row) {
  const date = day(pick(row, 'date'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { sale: null, problem: `تاريخٌ غير مقروء «${str(pick(row, 'date')) || '—'}» — الصيغة YYYY-MM-DD.` };
  }
  const sku = normalizeItemCode(pick(row, 'sku'));
  if (!sku) return { sale: null, problem: 'صفٌّ بلا كود صنف — البيع يُنسب لصنفٍ لا لاسمٍ حرّ.' };

  const qty = num(pick(row, 'qty'));
  if (!(qty > 0)) return { sale: null, problem: `«${sku}»: كمّيّة ${qty} — البيع موجبٌ، والمرتجع طريقُه مستندُ إرجاعٍ لا سالبُ مبيعات.` };

  return { sale: { date, branch: up(pick(row, 'branch')), sku, qty }, problem: '' };
}

/**
 * دفعة صفوفٍ ← مبيعاتٍ مطبَّعة مجمَّعة (يوم × فرع × صنف) + مرفوضاتٍ بأسبابها.
 * التجميع هنا مقصود: ألف سطر فاتورةٍ لبرجرٍ واحد انفجارٌ واحد لا ألف.
 */
export function normalizeSales(rows = []) {
  const sales = new Map();
  const rejected = [];
  (Array.isArray(rows) ? rows : []).forEach((row, i) => {
    const { sale, problem } = readSaleRow(row);
    if (!sale) {
      rejected.push({ line: i + 1, problem });
      return;
    }
    const key = `${sale.date}|${sale.branch}|${sale.sku}`;
    const at = sales.get(key) || { ...sale, qty: 0 };
    at.qty = round3(at.qty + sale.qty);
    sales.set(key, at);
  });
  return { sales: [...sales.values()], rejected };
}

/* ═══════════════ ٢. الاستهلاك النظريّ ═══════════════ */

/**
 * مبيعاتٌ مطبَّعة × وصفات ← استهلاكٌ نظريّ **لكلّ فرعٍ ولكلّ يومٍ** بوحدة الأساس.
 *
 * لكلّ (يوم × فرع): كلّ صنف بيعٍ يُفجَّر بوصفته **السارية في ذلك اليوم**،
 * وتُجمع الموادّ. صنفٌ بلا وصفةٍ لا يُخمَّن له استهلاك — يُعلَن في
 * `unlinked` (وهو مادّة استثناء «صنف غير مربوط بوصفة» ‹recipe_unlinked›).
 *
 * @param {object[]} sales من `normalizeSales`
 * @param {Map} recipeIndex من `indexRecipes`
 * @param {Map} itemsBySku فهرس الماستر
 * @returns {{lines:object[], unlinked:object[], problems:string[]}}
 *   `lines`: `{date, branch, sku, qty, uom}` — الاستهلاك النظريّ.
 */
export function theoreticalConsumption(sales = [], recipeIndex, itemsBySku) {
  const out = new Map();
  const unlinked = new Map();
  const problems = [];

  for (const sale of Array.isArray(sales) ? sales : []) {
    const exploded = explodeRecipe(recipeIndex, itemsBySku, sale.sku, sale.qty, { onDate: sale.date });

    // مخرَجٌ بلا وصفةٍ يعود سطرًا واحدًا هو نفسه — أي لم ينفجر: يُعلَن لا يُخمَّن.
    const selfOnly = exploded.lines.length === 1 && exploded.lines[0].sku === sale.sku;
    if (selfOnly) {
      const at = unlinked.get(sale.sku) || { sku: sale.sku, qty: 0, branches: new Set() };
      at.qty = round3(at.qty + sale.qty);
      if (sale.branch) at.branches.add(sale.branch);
      unlinked.set(sale.sku, at);
      continue;
    }

    problems.push(...exploded.problems.map((p) => `${sale.date} · ${sale.branch || '—'}: ${p}`));
    for (const line of exploded.lines) {
      const key = `${sale.date}|${sale.branch}|${line.sku}`;
      const at = out.get(key) || { date: sale.date, branch: sale.branch, sku: line.sku, qty: 0, uom: line.uom };
      at.qty = round3(at.qty + line.qty);
      out.set(key, at);
    }
  }

  return {
    lines: [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.branch.localeCompare(b.branch) || a.sku.localeCompare(b.sku)),
    unlinked: [...unlinked.values()].map((u) => ({ sku: u.sku, qty: u.qty, branches: [...u.branches].sort() })),
    problems,
  };
}

/* ═══════════════ ٣. النظريّ مقابل الفعليّ ═══════════════ */

/**
 * `Ideal vs Actual Consumption` — قلبُ القسم الحادي عشر من خطة القطاع.
 *
 * الفعليّ من دفتر الحركات (حركات الخروج للفرع — نفس مصدر `consumptionRate`
 * القائم)، والنظريّ من المبيعات × الوصفة. والفرق يُصنَّف لا يُطلَق:
 * انحرافٌ فوق العتبة **بالاتّجاهين** يفتح استثناء «انحراف استهلاك مرتفع» —
 * فالاستهلاك الأقلّ من النظريّ بشدّة ليس توفيرًا بل وصفةٌ لا تُتّبع أو
 * مبيعاتٌ بلا صرفٍ حقيقيّ.
 *
 * @param {object[]} theoretical سطور `theoreticalConsumption`
 * @param {object[]} actual سطورٌ `{date?, branch?, sku, qty}` من الدفتر
 * @param {{thresholdPct?:number, minQty?:number}} [opts]
 *   `thresholdPct` عتبة فتح الاستثناء (افتراضًا ٪١٥) ·
 *   `minQty` أدنى كمّيّةٍ نظريّة يُقاس عندها الانحراف — فجرامٌ زائد على
 *   عشرة لا يستحقّ استثناءً.
 * @returns {{rows:object[], exceptions:object[]}}
 */
export function consumptionVariance(theoretical = [], actual = [], opts = {}) {
  const thresholdPct = num(opts.thresholdPct) > 0 ? num(opts.thresholdPct) : 15;
  const minQty = num(opts.minQty) > 0 ? num(opts.minQty) : 1;

  const keyOf = (r) => `${up(r.branch)}|${normalizeItemCode(r.sku)}`;
  const sum = (list) => {
    const map = new Map();
    for (const r of Array.isArray(list) ? list : []) {
      const key = keyOf(r);
      map.set(key, round3((map.get(key) || 0) + num(r.qty)));
    }
    return map;
  };

  const ideal = sum(theoretical);
  const real = sum(actual);
  const rows = [];
  for (const key of new Set([...ideal.keys(), ...real.keys()])) {
    const [branch, sku] = key.split('|');
    const i = ideal.get(key) || 0;
    const a = real.get(key) || 0;
    const variance = round3(a - i);
    // النسبة إلى النظريّ؛ ونظريٌّ صفريّ مع فعليٍّ موجود انحرافٌ كامل معلَن.
    const variancePct = i > 0 ? Math.round((variance / i) * 1000) / 10 : a > 0 ? 100 : 0;
    rows.push({ branch, sku, ideal: i, actual: a, variance, variancePct });
  }
  rows.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));

  const exceptions = rows
    .filter((r) => Math.max(r.ideal, r.actual) >= minQty && Math.abs(r.variancePct) >= thresholdPct)
    .map((r) => ({
      type: 'consumption_variance',
      sku: r.sku,
      qty: Math.abs(r.variance),
      location: r.branch,
      reason:
        r.variance > 0
          ? `استُهلك ${r.actual} والنظريّ ${r.ideal} (+٪${Math.abs(r.variancePct)}) — هدرٌ أو صرفٌ بلا بيع أو وصفةٌ ناقصة`
          : `استُهلك ${r.actual} والنظريّ ${r.ideal} (−٪${Math.abs(r.variancePct)}) — وصفةٌ لا تُتّبع أو مبيعاتٌ بلا صرف`,
    }));

  return { rows, exceptions };
}
