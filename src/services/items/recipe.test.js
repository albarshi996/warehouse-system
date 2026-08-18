/**
 * حارس الوصفة ‹FNB-501› — الطبقة الثالثة من نموذج الأصناف.
 *
 * أخطر ما يحرسه ثلاثة: التحويل بمحرّك الوحدات القائم (لا معاملَ ثانٍ)،
 * والحلقة لا تُعلّق الحساب، والنسخ لا تُعيد كتابة تاريخ الاستهلاك.
 * ومثال المستند الحرفيّ مثبَّتٌ اختبارًا: ١٠٠٠ برجر × ١٥٠ غرامًا = ١٥٠ كيلو.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shapeRecipe, recipeId, recipeProblems, indexRecipes, recipeAsOf,
  explodeRecipe, impactOfShortage, unlinkedSaleItems, approvedMenuProblems, itemChain,
} from './recipe.js';
import { ITEM_TYPES, isExplodable, isStocked, isSellable, normalizeItemType, itemTypeStats } from './itemType.js';

/** ماستر مصغّر: دجاجٌ بالكيلو وخبزٌ بالحبّة وصوصٌ بالكيلو وبرجرٌ بالحبّة. */
const ITEMS = new Map([
  ['CHICKEN', { sku: 'CHICKEN', baseUom: 'KG' }],
  ['BUN', { sku: 'BUN', baseUom: 'PCS' }],
  ['OIL', { sku: 'OIL', baseUom: 'L' }],
  ['SAUCE', { sku: 'SAUCE', baseUom: 'KG' }],
  ['BURGER', { sku: 'BURGER', baseUom: 'PCS' }],
]);

/** وصفة البرجر: ١٥٠ غرام دجاج + حبّة خبز + ٢٠ غرام صوص — للحبّة الواحدة. */
const BURGER_V1 = {
  outputSku: 'BURGER',
  nameAr: 'برجر دجاج',
  version: 1,
  effectiveFrom: '2026-01-01',
  yieldQty: 1,
  lines: [
    { sku: 'CHICKEN', qty: 150, uom: 'G' },
    { sku: 'BUN', qty: 1, uom: 'PCS' },
    { sku: 'SAUCE', qty: 20, uom: 'G' },
  ],
};

/** وصفة الصوص (نصف مصنَّع): دفعةٌ تُخرج ٤ كيلو من ٣ كيلو دجاج ولترِ زيت. */
const SAUCE_V1 = {
  outputSku: 'SAUCE',
  version: 1,
  effectiveFrom: '2026-01-01',
  yieldQty: 4,
  lines: [
    { sku: 'CHICKEN', qty: 3, uom: 'KG' },
    { sku: 'OIL', qty: 1, uom: 'L' },
  ],
};

test('التسوية: الأكواد تُطبَّع والمعرّف يحمل النسخة', () => {
  const r = shapeRecipe({ outputSku: ' burger ', version: '2', lines: [{ sku: 'chicken', qty: '150', uom: 'g' }] });
  assert.equal(r.outputSku, 'BURGER');
  assert.equal(r.lines[0].sku, 'CHICKEN');
  assert.equal(recipeId(r), 'BURGER@v2');
});

test('التحقّق يسمّي العطب: مخرَجٌ مجهول · مكوّنٌ مكرّر · وصفةٌ تأكل نفسها · وحدةٌ بلا معامل', () => {
  assert.ok(recipeProblems({ outputSku: 'GHOST', effectiveFrom: '2026-01-01', lines: [{ sku: 'CHICKEN', qty: 1, uom: 'KG' }] }, ITEMS)
    .some((p) => p.includes('GHOST')));
  assert.ok(recipeProblems({ ...BURGER_V1, lines: [...BURGER_V1.lines, { sku: 'CHICKEN', qty: 1, uom: 'KG' }] }, ITEMS)
    .some((p) => p.includes('مكرّر')));
  assert.ok(recipeProblems({ ...BURGER_V1, lines: [{ sku: 'BURGER', qty: 1, uom: 'PCS' }] }, ITEMS)
    .some((p) => p.includes('نفسه')));
  // «كرتون» بلا معاملٍ معرَّفٍ للدجاج ⇒ يُعلَن لا يُحسب صفرًا.
  assert.ok(recipeProblems({ ...BURGER_V1, lines: [{ sku: 'CHICKEN', qty: 2, uom: 'CTN' }] }, ITEMS).length > 0);
  // والوصفة السليمة تمرّ صامتة.
  assert.deepEqual(recipeProblems(BURGER_V1, ITEMS), []);
});

test('★ مثال المستند حرفيًّا: بيع ١٠٠٠ برجر × ١٥٠ غرام دجاج = ١٥٠ كيلو استهلاكًا نظريًّا', () => {
  const index = indexRecipes([BURGER_V1]);
  const { ok, lines } = explodeRecipe(index, ITEMS, 'BURGER', 1000);
  assert.equal(ok, true);
  const chicken = lines.find((l) => l.sku === 'CHICKEN');
  assert.equal(chicken.qty, 150); // ١٥٠ كجم — بوحدة أساس الصنف.
  assert.equal(chicken.uom, 'kg'); // المعرّف القياسيّ من سيّد الوحدات
  assert.equal(lines.find((l) => l.sku === 'BUN').qty, 1000);
});

test('متعدّد المستويات: صوصُ البرجر يُفجَّر بدوره حتى الخام — والدفعة تُقاس نسبةً من مخرَجها', () => {
  const index = indexRecipes([BURGER_V1, SAUCE_V1]);
  const { ok, lines } = explodeRecipe(index, ITEMS, 'BURGER', 1000);
  assert.equal(ok, true);
  // الصوص لم يعد سطرًا — انفجر إلى دجاجٍ وزيت.
  assert.equal(lines.find((l) => l.sku === 'SAUCE'), undefined);
  // ١٠٠٠ برجر تحتاج ٢٠ كجم صوص = ٥ دفعات (كلٌّ ٤ كجم) ⇒ ١٥ كجم دجاجًا لها.
  const chicken = lines.find((l) => l.sku === 'CHICKEN');
  assert.equal(chicken.qty, 165); // ١٥٠ مباشرًا + ١٥ عبر الصوص.
  assert.equal(lines.find((l) => l.sku === 'OIL').qty, 5);
});

test('الحلقة تُعلَن عطبًا ولا تُعلّق الحساب إلى الأبد', () => {
  const index = indexRecipes([
    { outputSku: 'A', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1, lines: [{ sku: 'B', qty: 1, uom: 'KG' }] },
    { outputSku: 'B', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1, lines: [{ sku: 'A', qty: 1, uom: 'KG' }] },
  ]);
  const items = new Map([['A', { sku: 'A', baseUom: 'KG' }], ['B', { sku: 'B', baseUom: 'KG' }]]);
  const { ok, problems } = explodeRecipe(index, items, 'A', 10);
  assert.equal(ok, false);
  assert.ok(problems.some((p) => p.includes('حلقة')));
});

test('★ النسخ لا التعديل: بيعُ الأمس يُفسَّر بوصفة الأمس ولو تغيّرت اليوم', () => {
  const v2 = {
    ...BURGER_V1,
    version: 2,
    effectiveFrom: '2026-06-01',
    supersedes: 'BURGER@v1',
    lines: [{ sku: 'CHICKEN', qty: 200, uom: 'G' }, { sku: 'BUN', qty: 1, uom: 'PCS' }],
  };
  const index = indexRecipes([BURGER_V1, v2]);

  // اليوم (بعد السريان): النسخة الثانية — ٢٠٠ غرام.
  assert.equal(recipeAsOf(index, 'BURGER', '2026-07-01').version, 2);
  assert.equal(explodeRecipe(index, ITEMS, 'BURGER', 1000, { onDate: '2026-07-01' }).lines.find((l) => l.sku === 'CHICKEN').qty, 200);

  // والأمس (قبل السريان): الأولى كما كانت — التاريخ لا يُعاد حسابه.
  assert.equal(recipeAsOf(index, 'BURGER', '2026-03-15').version, 1);
  assert.equal(explodeRecipe(index, ITEMS, 'BURGER', 1000, { onDate: '2026-03-15' }).lines.find((l) => l.sku === 'CHICKEN').qty, 150);
});

test('أثر النقص: توقُّف الدجاج يُظهر البرجر مباشرةً والصوص وسيطًا — وبقوائم الفروع يجيب بالفروع', () => {
  const index = indexRecipes([BURGER_V1, SAUCE_V1]);
  const impact = impactOfShortage(index, 'CHICKEN');
  assert.deepEqual(impact.menuItems, ['BURGER']);
  assert.deepEqual(impact.intermediates, ['SAUCE']);
  assert.deepEqual(impact.branches, []); // بلا قوائمَ جوابٌ ناقصٌ معلَن، لا مخترَع.

  const orgIndex = new Map([
    ['BRD1', { code: 'BRD1', level: 'brand', parentCode: 'FNB' }],
    ['BRD2', { code: 'BRD2', level: 'brand', parentCode: 'FNB' }],
    ['BR01', { code: 'BR01', level: 'branch', parentCode: 'BRD1' }],
    ['BR03', { code: 'BR03', level: 'branch', parentCode: 'BRD2' }],
  ]);
  const withMenus = impactOfShortage(index, 'CHICKEN', {
    branchMenus: { 'BR01': ['BURGER'], 'BR02': ['PIZZA'], 'BR03': ['burger'] },
    orgIndex,
  });
  assert.deepEqual(withMenus.branches, ['BR01', 'BR03']);
  // والشجرة ترفع الفروع إلى برانداتها — الجواب من الوصفة والشجرة معًا.
  assert.deepEqual(withMenus.brands, ['BRD1', 'BRD2']);
});

test('صنف بيعٍ غير مربوطٍ بوصفة يُسمّى — مادّة استثناء القطاع', () => {
  const index = indexRecipes([BURGER_V1]);
  const items = [
    { sku: 'BURGER', itemType: 'sale', isMenuItem: true },
    { sku: 'PIZZA', itemType: 'sale', isMenuItem: true },
    { sku: 'CHICKEN', itemType: 'sale' }, // مادّةٌ لا صنفَ منيو — لا يُطالَب بوصفة.
  ];
  assert.deepEqual(unlinkedSaleItems(index, items), ['PIZZA']);
});

/* ═══════════ ‹FNB-701› صنف المنيو — الطبقة الرابعة ═══════════ */

test('صنف المنيو نوعٌ في السيّد القائم: يُباع ولا يُخزَّن — وينفجر وحده', () => {
  assert.ok(ITEM_TYPES.menu, 'النوع الرابع في السيّد نفسه لا في سيّدٍ ثانٍ');
  assert.equal(isSellable('menu'), true);
  assert.equal(isStocked('menu'), false); // مخزونه مكوّناته لا رصيده.
  assert.equal(isExplodable('menu'), true);
  assert.equal(isExplodable('service'), false); // ما يفرقه عن الخدمة سلوكًا.
  // المرادفات: أمين البيانات يكتب «منيو» فلا يسقط صامتًا إلى «بيع».
  assert.equal(normalizeItemType('منيو'), 'menu');
  assert.equal(normalizeItemType('menu item'), 'menu');
});

test('itemTypeStats يُحصي النوع الرابع كما يُحصي الثلاثة', () => {
  const s = itemTypeStats([
    { sku: 'BURGER', itemType: 'menu' },
    { sku: 'CHICKEN', itemType: 'sale' },
  ]);
  assert.equal(s.counts.menu, 1);
  assert.equal(s.counts.sale, 1);
});

test('المنيو المعتمَد للفرع قائمةٌ محكومة لا نصٌّ حرّ — وكلّ خرقٍ يسمّي صنفه', () => {
  const index = indexRecipes([BURGER_V1]);
  const master = new Map([
    ['BURGER', { sku: 'BURGER', itemType: 'menu' }],
    ['PIZZA', { sku: 'PIZZA', itemType: 'menu' }],
    ['CHICKEN', { sku: 'CHICKEN', itemType: 'sale' }],
  ]);
  // سليم: صنف منيو له وصفة.
  assert.deepEqual(approvedMenuProblems(['BURGER'], master, index), []);
  // الخروق الثلاثة: ليس في الماستر · ليس نوع منيو · بلا وصفة.
  const problems = approvedMenuProblems(['GHOST', 'CHICKEN', 'PIZZA', 'pizza'], master, index);
  assert.ok(problems.some((p) => p.includes('GHOST') && p.includes('ليس في ماستر')));
  assert.ok(problems.some((p) => p.includes('CHICKEN') && p.includes('ليس صنف منيو')));
  assert.ok(problems.some((p) => p.includes('PIZZA') && p.includes('بلا وصفة')));
  assert.ok(problems.some((p) => p.includes('مكرّر')));
});

test('★ السلسلة الستّة من طرفٍ إلى طرف: مورّد → صنف → وصفة → صنف بيع → براند → فرع — والعميل طرفٌ', () => {
  const orgIndex = new Map([
    ['BRD1', { code: 'BRD1', level: 'brand', parentCode: 'FNB' }],
    ['BR01', { code: 'BR01', level: 'branch', parentCode: 'BRD1' }],
  ]);
  const chain = itemChain('chicken', {
    catalogEntries: [
      { partnerType: 'supplier', partnerCode: 'SUP-9', sku: 'CHICKEN' },
      { partnerType: 'customer', partnerCode: 'CATER-1', sku: 'CHICKEN' }, // قناة Catering
      { partnerType: 'supplier', partnerCode: 'SUP-2', sku: 'OIL' }, // صنفٌ آخر — لا يتسرّب
    ],
    recipes: [BURGER_V1, SAUCE_V1],
    branchMenus: { BR01: ['BURGER'] },
    orgIndex,
  });
  assert.deepEqual(chain.suppliers, ['SUP-9']);
  assert.deepEqual(chain.customers, ['CATER-1']);
  assert.deepEqual(chain.menuItems, ['BURGER']);
  assert.deepEqual(chain.branches, ['BR01']);
  assert.deepEqual(chain.brands, ['BRD1']);
  // وساقٌ غائبة تُعاد فارغةً معلَنة — لا مخترَعة.
  const bare = itemChain('CHICKEN', { recipes: [BURGER_V1] });
  assert.deepEqual(bare.suppliers, []);
  assert.deepEqual(bare.branches, []);
});

test('صنف منيو بلا وصفة يفتح استثناءً معرَّفًا في السجلّ القائم — لا سجلَّ ثانٍ', async () => {
  const { EXCEPTION_TYPES, shapeException, fingerprint } = await import('../ledger/exceptions.js');
  assert.ok(EXCEPTION_TYPES.recipe_unlinked, 'النوع في سجلّ الاستثناءات القائم');

  const index = indexRecipes([BURGER_V1]);
  const [sku] = unlinkedSaleItems(index, [{ sku: 'PIZZA', itemType: 'menu' }]);
  const exc = shapeException({ type: 'recipe_unlinked', sku, reason: 'يُباع ولا يُعرف ما يستهلك' });
  assert.equal(exc.type, 'recipe_unlinked');
  assert.equal(exc.sku, 'PIZZA');
  assert.equal(exc.action, EXCEPTION_TYPES.recipe_unlinked.action); // الإجراء من السجلّ لا من الكاشف.
  // وبصمة التفرّد تمنع فتحه مئة مرّة عند كلّ رسم.
  assert.equal(fingerprint(exc), fingerprint({ type: 'recipe_unlinked', sku: 'PIZZA' }));
});

test('★ أثر النقص يقبل خريطةً أو كائنًا ‹FNB-601› — لا صمتَ خاطئ', () => {
  const index = indexRecipes([{
    outputSku: 'BURGER', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1,
    lines: [{ sku: 'CHICKEN', qty: 150, uom: 'G' }],
  }]);
  const asObject = impactOfShortage(index, 'CHICKEN', { branchMenus: { BR01: ['BURGER'] } });
  const asMap = impactOfShortage(index, 'CHICKEN', { branchMenus: new Map([['BR01', ['BURGER']]]) });
  assert.deepEqual(asMap.branches, asObject.branches);
  assert.deepEqual(asMap.branches, ['BR01'], 'الخريطة كانت تُعيد فراغًا بصمت');
});
