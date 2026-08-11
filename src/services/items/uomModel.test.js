/**
 * اختبارات وحدات القياس (م٣-ب · يسدّ ف‑٤).
 *
 * الخطة تشترط **عشرين حالة تحويل** — وهي هنا. لكنّ الاختبار الحاكم أوّلها:
 * **الترحيل لا يغيّر رقمًا واحدًا.**
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UOM_MASTER,
  UOM_FAMILIES,
  normalizeUom,
  familyOf,
  allowsFraction,
  baseUomOf,
  factorToBase,
  toBase,
  fromBase,
  convert,
  checkFraction,
  uomLabel,
  displayQty,
  factorProblems,
  availableUoms,
  hasUomDefinition,
} from './uomModel.js';

/** صنفٌ قديم: وحدةٌ نصّيّة بلا معاملات — حالة الترحيل. */
const LEGACY = { sku: 'OLD', unit: 'piece' };

/** شامبو: الأساس قطعة، والصندوق ١٢ قطعة، والصندوق ٦ كيلوغرامات (عبر العائلات). */
const SHAMPOO = { sku: 'SH', baseUom: 'piece', uomFactors: { box: 12, kg: 0.5 } };

/** أرزّ: الأساس كيلوغرام، والكيس ٢٥ كيلوغرامًا. */
const RICE = { sku: 'RICE', baseUom: 'kg', uomFactors: { pack: 25 } };

/* ═══════════ ١. الترحيل ═══════════ */

test('★★ صنفٌ بلا معاملات: وحدته المدخلة هي الأساس والمعامل ١ — لا يتغيّر رقم', () => {
  assert.equal(baseUomOf(LEGACY), 'piece');
  assert.equal(factorToBase(LEGACY, 'piece'), 1);
  const r = toBase(LEGACY, 240, 'piece');
  assert.equal(r.ok, true);
  assert.equal(r.qty, 240, 'الرقم نفسه لا يتغيّر');
});

test('★★ صنفٌ بلا وحدةٍ أصلًا لا يرمي ولا يُعطّل', () => {
  const bare = { sku: 'X' };
  assert.equal(baseUomOf(bare), '');
  assert.equal(factorToBase(bare, 'box'), 1, 'بلا أساسٍ لا تحويل — المعامل ١');
  assert.equal(toBase(bare, 5, 'box').qty, 5);
  assert.deepEqual(factorProblems(bare), [], 'ولا مشكلة تُبلَّغ');
});

/* ═══════════ ٢. داخل العائلة: المعامل ثابتٌ للجميع ═══════════ */

test('★ كيلوغرامٌ = ١٠٠٠ غرام دائمًا، لكلّ صنف', () => {
  assert.equal(toBase(RICE, 1, 'kg').qty, 1);
  assert.equal(toBase(RICE, 500, 'gram').qty, 0.5);
  assert.equal(toBase(RICE, 2, 'ton').qty, 2000);
  assert.equal(fromBase(RICE, 1, 'gram').qty, 1000);
});

test('★ ولا يملك صنفٌ أن يخالف ثابت عائلته', () => {
  const liar = { baseUom: 'kg', uomFactors: { gram: 0.002 } }; // كيلوغرام = ٥٠٠ غرام؟
  const problems = factorProblems(liar);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ثابتٌ للجميع/);
});

test('اللتر والمليلتر والمتر والسنتيمتر بثوابتها', () => {
  const oil = { baseUom: 'litre' };
  assert.equal(toBase(oil, 250, 'ml').qty, 0.25);
  assert.equal(fromBase(oil, 1.5, 'ml').qty, 1500);
  const rope = { baseUom: 'metre' };
  assert.equal(toBase(rope, 150, 'cm').qty, 1.5);
});

test('الدستة ١٢ بالتعريف — وهي الاستثناء الوحيد في العدّ', () => {
  const pens = { baseUom: 'piece' };
  assert.equal(toBase(pens, 3, 'dozen').qty, 36);
});

/* ═══════════ ٣. عبر العائلات: المعامل خاصٌّ بالصنف ═══════════ */

test('★★ صندوق الشامبو ١٢ قطعة — ولا معنى عامّ لـ«صندوق»', () => {
  assert.equal(toBase(SHAMPOO, 20, 'box').qty, 240, 'عشرون صندوقًا = ٢٤٠ قطعة');
  assert.equal(fromBase(SHAMPOO, 240, 'box').qty, 20, 'والعكس');

  // صنفٌ آخر بصندوقٍ مختلف — وهذا جوهر القاعدة.
  const soap = { baseUom: 'piece', uomFactors: { box: 24 } };
  assert.equal(toBase(soap, 20, 'box').qty, 480);
});

test('★★ صندوقٌ بلا تعريفٍ يُرفض ولا يُحسب من جهل', () => {
  const noBox = { baseUom: 'piece' };
  const r = toBase(noBox, 5, 'box');
  assert.equal(r.ok, false);
  assert.equal(r.qty, 0);
  assert.match(r.problem, /لا معامل تحويل/);
  assert.equal(factorToBase(noBox, 'box'), null, 'null تعني «لا أعرف» لا «صفر»');
});

test('★ الاستلام بالصناديق والبيع بالقطع يتقابلان', () => {
  // العطب الأصليّ: يُستلم ٢٠ صندوقًا ويُباع ٢٤٠ قطعة، فيُظهر الدفتر رقمَين.
  const received = toBase(SHAMPOO, 20, 'box');
  const sold = toBase(SHAMPOO, 240, 'piece');
  assert.equal(received.qty, sold.qty, 'الرصيد بالوحدتين متطابق');
  assert.equal(received.base, sold.base);
});

test('التحويل بين وحدتَين غير الأساس يمرّ عبره', () => {
  assert.equal(convert(SHAMPOO, 2, 'box', 'kg').qty, 48, '٢ صندوق = ٢٤ قطعة = ٤٨ كغم');
  assert.equal(convert(RICE, 2, 'pack', 'gram').qty, 50000, '٢ كيس = ٥٠ كغم = ٥٠٠٠٠ غرام');
});

/* ═══════════ ٤. حارس الكسر ═══════════ */

test('★★ ٢٫٥ قطعة تُرفض و٢٫٥ كيلوغرام تُقبل', () => {
  assert.equal(checkFraction(2.5, 'piece').ok, false);
  assert.match(checkFraction(2.5, 'piece').problem, /لا تقبل الكسور/);
  assert.equal(checkFraction(2.5, 'kg').ok, true);
  assert.equal(checkFraction(2.5, 'litre').ok, true);
  assert.equal(checkFraction(2.5, 'metre').ok, true);
  assert.equal(checkFraction(3, 'piece').ok, true);
});

test('★ والحارس يعمل داخل التحويل لا بجانبه', () => {
  const r = toBase(SHAMPOO, 2.5, 'piece');
  assert.equal(r.ok, false);
  assert.match(r.problem, /لا تقبل الكسور/);

  assert.equal(toBase(RICE, 2.5, 'kg').ok, true, 'والوزن يمرّ');
});

test('نصف صندوقٍ يُرفض — الصندوق من عائلة العدّ', () => {
  assert.equal(checkFraction(0.5, 'box').ok, false);
  assert.equal(allowsFraction('box'), false);
  assert.equal(allowsFraction('kg'), true);
});

/* ═══════════ ٥. التطبيع والتسميات ═══════════ */

test('★ الوحدة تُكتب بالعربيّة والإنجليزيّة فتُفهم', () => {
  assert.equal(normalizeUom('كرتون'), 'carton');
  assert.equal(normalizeUom('KG'), 'kg');
  assert.equal(normalizeUom('كيلو'), 'kg');
  assert.equal(normalizeUom('قطعة'), 'piece');
  assert.equal(normalizeUom('  Box  '), 'box');
  assert.equal(normalizeUom('وحدة غريبة'), '', 'المجهول يُعلن جهله');
  assert.equal(normalizeUom(null), '');
});

test('uomLabel: المجهول يُعرض كما كُتب لا كـ«غير معروف»', () => {
  assert.equal(uomLabel('kg'), 'كيلوغرام');
  assert.equal(uomLabel('وحدة غريبة'), 'وحدة غريبة');
  assert.equal(uomLabel(''), '—');
});

test('familyOf والعائلات الأربع', () => {
  assert.equal(familyOf('box'), 'count');
  assert.equal(familyOf('ton'), 'weight');
  assert.equal(familyOf('ml'), 'volume');
  assert.equal(familyOf('cm'), 'length');
  assert.equal(Object.keys(UOM_FAMILIES).length, 4);
  for (const fam of Object.values(UOM_FAMILIES)) {
    assert.ok(UOM_MASTER[fam.base], `وحدة أساس العائلة ${fam.id} مفقودة من السيّد`);
    assert.equal(UOM_MASTER[fam.base].family, fam.id);
    assert.equal(UOM_MASTER[fam.base].factor, 1, 'وحدة الأساس معاملها ١ بالتعريف');
  }
});

/* ═══════════ ٦. العرض المزدوج ═══════════ */

test('★ «٢٤٠ قطعة، بما يعادل ٢٠ صندوقًا»', () => {
  assert.equal(displayQty(SHAMPOO, 240, 'box'), '240 قطعة، بما يعادل 20 صندوق');
  assert.equal(displayQty(SHAMPOO, 240, 'piece'), '240 قطعة', 'لا تكرار حين تتّحد الوحدة');
  assert.equal(displayQty(SHAMPOO, 240), '240 قطعة');
});

test('★ ولا يخترع مكافئًا حين يعجز', () => {
  const noBox = { baseUom: 'piece' };
  assert.equal(displayQty(noBox, 240, 'box'), '240 قطعة', 'الأساس وحده لا تخمين');
});

/* ═══════════ ٧. تحقّق التعريف ═══════════ */

test('★★ معاملٌ صفرٌ أخطر من غيابه — الغياب يمنع الحساب والصفر يُنتج صفرًا صامتًا', () => {
  assert.match(factorProblems({ baseUom: 'piece', uomFactors: { box: 0 } })[0], /رقمًا موجبًا/);
  assert.match(factorProblems({ baseUom: 'piece', uomFactors: { box: -3 } })[0], /رقمًا موجبًا/);
  assert.match(factorProblems({ baseUom: 'piece', uomFactors: { box: 'كثير' } })[0], /رقمًا موجبًا/);
});

test('معامل وحدة الأساس يجب أن يكون ١', () => {
  assert.match(factorProblems({ baseUom: 'piece', uomFactors: { piece: 5 } })[0], /يجب أن يكون ١/);
});

test('الوحدة المجهولة في التعريف تُبلَّغ', () => {
  assert.match(factorProblems({ baseUom: 'piece', uomFactors: { برميل: 200 } })[0], /غير معروفة/);
});

test('التعريف السليم بلا مشاكل', () => {
  assert.deepEqual(factorProblems(SHAMPOO), []);
  assert.deepEqual(factorProblems(RICE), []);
});

test('availableUoms: الأساس + المعرَّف + ثوابت العائلة', () => {
  const list = availableUoms(SHAMPOO);
  assert.ok(list.includes('piece'), 'الأساس');
  assert.ok(list.includes('box'), 'المعرَّف عبر العائلات');
  assert.ok(list.includes('kg'), 'المعرَّف عبر العائلات');
  assert.ok(list.includes('dozen'), 'ثابت العائلة');
  assert.ok(!list.includes('carton'), 'غير المعرَّف بلا معاملٍ عامّ لا يُعرض');
  assert.deepEqual(availableUoms({}), [], 'صنفٌ بلا أساس');
});

/* ═══════════ ٨. المدخلات الفاسدة ═══════════ */

test('الكمّيّة غير الرقميّة تُرفض بسببٍ مكتوب', () => {
  assert.equal(toBase(SHAMPOO, 'كثير', 'box').ok, false);
  assert.equal(fromBase(SHAMPOO, undefined, 'box').ok, false);
  assert.equal(checkFraction('نصّ', 'kg').ok, false);
});

test('الصفر كمّيّةٌ صالحة — ليس فراغًا', () => {
  const r = toBase(SHAMPOO, 0, 'box');
  assert.equal(r.ok, true);
  assert.equal(r.qty, 0);
});

test('التقريب يمنع تراكم أخطاء العشريّة الثنائيّة', () => {
  const item = { baseUom: 'kg' };
  assert.equal(toBase(item, 0.1, 'kg').qty + toBase(item, 0.2, 'kg').qty, 0.30000000000000004);
  assert.equal(toBase(item, 300, 'gram').qty, 0.3, 'التحويل نفسه مقرَّب');
});

/* ═══════════ ٩. مفتاح الترحيل الآمن ═══════════ */

test('★★ hasUomDefinition: الصنف القديم غير معرَّف — فيمرّ رقمه بلا تحويلٍ ولا حراسة', () => {
  assert.equal(hasUomDefinition(LEGACY), false, 'unit وحده ليس تعريفًا');
  assert.equal(hasUomDefinition({ unit: 'box' }), false);
  assert.equal(hasUomDefinition({}), false);
  assert.equal(hasUomDefinition(null), false);

  assert.equal(hasUomDefinition(SHAMPOO), true, 'من عرّف معاملاته');
  assert.equal(hasUomDefinition({ baseUom: 'kg' }), true, 'أو أساسه');
});

test('★★ ولولا هذا المفتاح لانقلبت الميزة على كلّ الأصناف في لحظة', () => {
  // صنفٌ قديم وحدته «قطعة» وبندٌ بوحدة «صندوق»: لو عددنا `unit` تعريفًا
  // لطلب معاملًا غير موجود فرفض القيد — أي توقُّف كلّ استلامٍ قائم.
  const line = { sku: 'OLD', uom: 'box', qty: 5 };
  assert.equal(hasUomDefinition(LEGACY), false, 'فلا تحويل يُطلب أصلًا');
  assert.equal(toBase(LEGACY, line.qty, 'box').ok, false, 'التحويل نفسه يعجز — لكنّه لا يُستدعى');
});
