/**
 * الوصفة ‹FNB-501› — الطبقة الثالثة من نموذج الأصناف — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * النموذج الرباعيّ في خطة القطاع: صنفٌ رئيسيّ ← أصناف موردين ← **مكوّنات
 * وصفات** ← أصناف بيع. الطبقات الأولى والثانية ناضجتان (`itemIdentity` ·
 * `itemPartnerCatalog`)، والرابعة نوعُ تصنيفٍ (`itemType`) — أمّا الثالثة
 * فكانت **معدومة**: لا ذكر لوصفةٍ في المستودع كلّه. وبلا وصفةٍ لا إنتاجَ
 * (ق٤) ولا استهلاكَ نظريًّا (ق٦) ولا جوابَ عن «ماذا يتعطّل لو توقّف صنف؟».
 *
 * ═══ ثلاث قواعد تحكم ما هنا ═══
 *
 * ١. **المكوّن من الماستر المركزيّ لا صنفَ لكلّ براند.** الوصفة تشير إلى
 *    الصنف بكوده المطبَّع (`normalizeItemCode` — قاعدة الهويّة نفسها)، فمادّةٌ
 *    واحدة تخدم كلّ البراندات، وأثرُ نقصها يُقرأ عبرها كلّها.
 *
 * ٢. **الكمّيّة بوحدة الأساس عبر محرّك الوحدات القائم.** الوصفة تكتب
 *    «150 غرام» والمخزون يُقاد بالكيلو — التحويل في `uomModel.toBase` **نفسه**
 *    الذي تستعمله المستندات، لا معاملَ ثانٍ يفترق عنه يومًا. ومعاملٌ مجهول
 *    يعني **لا أعرف** لا صفرًا: البند يُعلَن عطبُه ولا يُحسب من جهل.
 *
 * ٣. **الوصفة نسخٌ لا تعديلٌ في المكان.** تغييرُ وصفةِ اليوم لا يُعيد كتابة
 *    استهلاك الأمس — القراءة التاريخيّة تسأل عن النسخة السارية **في تاريخها**
 *    (`recipeAsOf`)، والتعديل نسخةٌ جديدة تشير إلى سابقتها.
 */
import { normalizeItemCode } from './itemIdentity.js';
import { toBase, baseUomOf, normalizeUom } from './uomModel.js';

const str = (v) => String(v ?? '').trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const day = (v) => str(v).slice(0, 10);

/* ═══════════════ ١. الشكل والتحقّق ═══════════════ */

/**
 * يُسوّي وصفةً خامًا إلى شكلها المخزَّن.
 *
 * `outputSku` صنفُ المخرَج: صنفُ بيعٍ (برجر) أو نصفُ مصنَّعٍ (صوص) — فالوصفة
 * واحدةٌ للاثنين، وتعدّد المستويات يأتي من أنّ مكوّنًا قد يكون هو نفسه مخرَجَ
 * وصفةٍ أخرى.
 *
 * `yieldQty` كم **وحدة أساسٍ** من المخرَج تنتج الدفعة الواحدة من المقادير
 * المكتوبة — وصفة الصوص تكتب مقادير قِدرٍ يُخرج ٤ كيلو، لا مقادير الكيلو.
 */
export function shapeRecipe(raw) {
  const lines = (Array.isArray(raw?.lines) ? raw.lines : [])
    .map((l) => ({
      sku: normalizeItemCode(l?.sku),
      qty: num(l?.qty),
      uom: normalizeUom(l?.uom) || str(l?.uom),
      note: str(l?.note),
    }))
    .filter((l) => l.sku);
  return {
    outputSku: normalizeItemCode(raw?.outputSku),
    nameAr: str(raw?.nameAr),
    version: Math.max(1, Math.trunc(num(raw?.version)) || 1),
    effectiveFrom: day(raw?.effectiveFrom),
    supersedes: str(raw?.supersedes),
    yieldQty: num(raw?.yieldQty) > 0 ? num(raw?.yieldQty) : 1,
    active: raw?.active !== false,
    lines,
  };
}

/** معرّف النسخة — به تُخزَّن وتُشار إليها: `BURGER-CLS@v3`. */
export function recipeId(recipe) {
  return `${normalizeItemCode(recipe?.outputSku)}@v${Math.max(1, Math.trunc(num(recipe?.version)) || 1)}`;
}

/**
 * أعطاب وصفةٍ قبل الحفظ — كلّ عطبٍ جملةٌ تقول الصواب.
 * `itemsBySku` فهرس الماستر: من كوده المطبَّع إلى الصنف.
 */
export function recipeProblems(recipe, itemsBySku = new Map()) {
  const r = shapeRecipe(recipe);
  const problems = [];

  if (!r.outputSku) problems.push('الوصفة بلا صنف مخرَج — ما الذي تصفه؟');
  if (!r.lines.length) problems.push('الوصفة بلا مكوّنات — وصفةٌ فارغة لا تُنتج.');
  if (!r.effectiveFrom) problems.push('الوصفة بلا تاريخ سريان — بدونه لا تُعرف نسخةُ يومٍ مضى.');

  const output = itemsBySku.get(r.outputSku);
  if (r.outputSku && itemsBySku.size && !output) {
    problems.push(`المخرَج «${r.outputSku}» ليس في ماستر الأصناف — الوصفة تشير ولا تخترع.`);
  }

  const seen = new Set();
  for (const line of r.lines) {
    if (seen.has(line.sku)) problems.push(`المكوّن «${line.sku}» مكرّرٌ في الوصفة — اجمع كمّيّته في سطرٍ واحد.`);
    seen.add(line.sku);

    if (line.sku === r.outputSku) problems.push(`المكوّن «${line.sku}» هو المخرَج نفسه — وصفةٌ تأكل نفسها.`);
    if (!(line.qty > 0)) problems.push(`المكوّن «${line.sku}» بكمّيّة ${line.qty} — المقدار موجبٌ أو لا يُكتب.`);

    const item = itemsBySku.get(line.sku);
    if (itemsBySku.size && !item) {
      problems.push(`المكوّن «${line.sku}» ليس في ماستر الأصناف.`);
    } else if (item && line.qty > 0) {
      // التحويل بمحرّك الوحدات القائم — والمجهول يُعلَن لا يُحسب صفرًا.
      const converted = toBase(item, line.qty, line.uom);
      if (!converted.ok) {
        problems.push(`المكوّن «${line.sku}»: ${converted.problem || `لا معامل يحوّل «${line.uom || '—'}» إلى وحدة أساسه «${baseUomOf(item) || '—'}»`}`);
      }
    }
  }
  return problems;
}

/* ═══════════════ ٢. الفهرسة والنسخ ═══════════════ */

/**
 * فهرس الوصفات: مخرَجٌ ← نسخُه مرتّبةً من الأحدث سريانًا.
 * الترتيب بتاريخ السريان ثمّ برقم النسخة — فنسختان بيومٍ واحد تُحسمان بالرقم.
 */
export function indexRecipes(recipes = []) {
  const map = new Map();
  for (const raw of Array.isArray(recipes) ? recipes : []) {
    const r = shapeRecipe(raw);
    if (!r.outputSku) continue;
    if (!map.has(r.outputSku)) map.set(r.outputSku, []);
    map.get(r.outputSku).push(r);
  }
  for (const versions of map.values()) {
    versions.sort((a, b) => (day(b.effectiveFrom) || '').localeCompare(day(a.effectiveFrom) || '') || b.version - a.version);
  }
  return map;
}

/**
 * النسخة السارية لمخرَجٍ **في تاريخٍ ما** — قلبُ قاعدة «النسخ لا التعديل»:
 * بيعُ الأمس يُفسَّر بوصفة الأمس ولو تغيّرت اليوم. بلا تاريخٍ تُعاد الأحدث.
 * النسخ المعطَّلة لا تُختار — لكنّ التاريخيّ يبقى مقروءًا لأنّ النسخ لا تُمحى.
 */
export function recipeAsOf(index, outputSku, onDate) {
  const versions = index?.get?.(normalizeItemCode(outputSku)) || [];
  const at = day(onDate);
  for (const r of versions) {
    if (!r.active) continue;
    if (!at || !r.effectiveFrom || r.effectiveFrom <= at) return r;
  }
  return null;
}

/* ═══════════════ ٣. انفجار المكوّنات (BOM) ═══════════════ */

/**
 * كم مادّةً خامًا تحتاج كمّيّةٌ من مخرَج؟ — **متعدّد المستويات بحلقاتٍ محروسة.**
 *
 * مكوّنٌ له وصفتُه هو (صوصٌ داخل برجر) **يُفجَّر بدوره** حتى الوصول إلى موادَّ
 * لا وصفة لها — فهي الخام. ومكوّنٌ يعود إلى سلفه في السلسلة حلقةٌ: تُعلَن
 * عطبًا ويُقطع النزول، فبياناتٌ فاسدة يجب ألّا تُعلّق الحساب إلى الأبد.
 *
 * @param {Map} index فهرس الوصفات (من `indexRecipes`)
 * @param {Map} itemsBySku فهرس الماستر
 * @param {string} outputSku المخرَج المطلوب
 * @param {number} qty كم وحدة أساسٍ منه
 * @param {{onDate?:string, maxDepth?:number}} [opts]
 * @returns {{ok:boolean, lines:object[], problems:string[]}}
 *   `lines`: موادُّ خامٌ مجمّعةٌ بوحدة أساس كلٍّ منها `{sku, qty, uom, via}`.
 */
export function explodeRecipe(index, itemsBySku, outputSku, qty, opts = {}) {
  const problems = [];
  const raw = new Map(); // sku ← {qty بوحدة الأساس, via مسار الوصول}
  const maxDepth = opts.maxDepth ?? 12;

  const walk = (sku, need, trail) => {
    const code = normalizeItemCode(sku);
    if (trail.includes(code)) {
      problems.push(`حلقةٌ في الوصفات: ${[...trail, code].join(' ← ')} — الوصفة لا تدور على نفسها.`);
      return;
    }
    if (trail.length >= maxDepth) {
      problems.push(`تجاوز عمق التفجير ${maxDepth} عند «${code}» — راجع تسلسل الوصفات.`);
      return;
    }

    const recipe = recipeAsOf(index, code, opts.onDate);
    if (!recipe) {
      // خامٌ: لا وصفة له — يُجمَع.
      const at = raw.get(code) || { qty: 0, via: trail[trail.length - 1] || '' };
      at.qty = round6(at.qty + need);
      raw.set(code, at);
      return;
    }

    // مصنَّع: بنوده لدفعةٍ تُخرج `yieldQty` — فالحاجة تُقاس نسبةً منها.
    const batches = need / (recipe.yieldQty || 1);
    for (const line of recipe.lines) {
      const item = itemsBySku?.get?.(line.sku);
      const converted = item ? toBase(item, line.qty, line.uom) : { ok: false, qty: 0, problem: `المكوّن «${line.sku}» ليس في الماستر.` };
      if (!converted.ok) {
        problems.push(`«${code}» ← «${line.sku}»: ${converted.problem || 'معاملُ تحويلٍ مجهول.'}`);
        continue; // يُعلَن ولا يُحسب من جهل — والمجموع ناقصٌ معلَنُ النقص.
      }
      walk(line.sku, round6(converted.qty * batches), [...trail, code]);
    }
  };

  walk(outputSku, num(qty), []);

  const lines = [...raw.entries()]
    .map(([sku, at]) => ({
      sku,
      qty: round6(at.qty),
      uom: baseUomOf(itemsBySku?.get?.(sku)) || '',
      via: at.via,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return { ok: problems.length === 0, lines, problems };
}

/* ═══════════════ ٤. أثر النقص ═══════════════ */

/**
 * «الصنف يؤثّر على ٦ براندات و١٤ فرعًا و٩ Menu Items» — الجواب من الوصفات.
 *
 * يصعد من المادّة إلى كلّ مخرَجٍ تدخل فيه — **مباشرةً أو عبر نصف مصنَّع** —
 * فحين يتوقّف الدجاج يظهر البرجر (مباشر) والسلطة التي فيها صوصٌ من الدجاج
 * (عبر مستوى). و`branchMenus` اختياريّ: `{branchCode: [menuSku,…]}` — حين
 * يتوفّر (من ملفّ الفرع FNB-201) يُجاب أيضًا بالفروع؛ وحين لا، بالمخرَجات وحدها
 * — جوابٌ ناقصٌ معلَنُ النقص خيرٌ من جوابٍ مخترَع.
 *
 * و`orgIndex` (من `orgLocations.indexLocations`) يرفع الفروعَ إلى برانداتها —
 * فالجواب الكامل: «يؤثّر على س صنف منيو، في ص براند، وع فرعًا».
 *
 * @returns {{sku, menuItems:string[], intermediates:string[], branches:string[], brands:string[]}}
 */
export function impactOfShortage(index, sku, { branchMenus = null, orgIndex = null, onDate } = {}) {
  const code = normalizeItemCode(sku);
  const affected = new Set();

  // من يستعمل هذه المادّة مباشرةً؟ ثمّ من يستعمل مستعمِلها؟ — صعودٌ محروس.
  const queue = [code];
  const seen = new Set([code]);
  while (queue.length) {
    const current = queue.shift();
    for (const [outputSku] of index) {
      if (seen.has(outputSku)) continue;
      const recipe = recipeAsOf(index, outputSku, onDate);
      if (recipe?.lines.some((l) => l.sku === current)) {
        affected.add(outputSku);
        seen.add(outputSku);
        queue.push(outputSku); // نصفُ مصنَّعٍ متأثّر يجرّ من فوقه.
      }
    }
  }

  // المخرَج النهائيّ ما لا يدخل هو نفسه مكوّنًا في متأثّرٍ آخر.
  const intermediates = [...affected].filter((out) =>
    [...affected].some((other) => other !== out && recipeAsOf(index, other, onDate)?.lines.some((l) => l.sku === out))
  );
  const menuItems = [...affected].filter((out) => !intermediates.includes(out));

  const branches = branchMenus
    ? Object.entries(branchMenus)
        .filter(([, menu]) => (menu || []).some((m) => affected.has(normalizeItemCode(m))))
        .map(([branch]) => branch)
    : [];

  // البراندات من الشجرة: أبو كلّ فرعٍ متأثّر — الوصفة تسمّي الفرع والشجرة ترفعه.
  const brands = orgIndex
    ? [...new Set(branches.map((b) => {
        let node = orgIndex.get?.(String(b).toUpperCase());
        while (node && node.level !== 'brand') node = node.parentCode ? orgIndex.get(String(node.parentCode).toUpperCase()) : null;
        return node?.code || '';
      }).filter(Boolean))]
    : [];

  return { sku: code, menuItems: menuItems.sort(), intermediates: intermediates.sort(), branches: branches.sort(), brands: brands.sort() };
}

/**
 * «صنف بيعٍ غير مربوطٍ بوصفة» — مادّة الاستثناء في لوحة القطاع (FNB-802):
 * يُباع ولا يُعرف ما يستهلك، فتكلفته النظريّة صفرٌ كاذب.
 */
export function unlinkedSaleItems(index, items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => (it?.itemType || 'sale') === 'sale' && it?.isMenuItem === true)
    .map((it) => normalizeItemCode(it.sku))
    .filter((sku) => sku && !index.has(sku))
    .sort();
}
