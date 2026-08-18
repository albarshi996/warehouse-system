/**
 * حارس الاستهلاك النظريّ ‹FNB-702›.
 *
 * أخطر ما يحرسه: الوصفة تُقرأ **بنسختها وقت البيع** لا بنسخة اليوم،
 * والصنف بلا وصفةٍ يُعلَن لا يُخمَّن، والانحراف يفتح استثناءً بالاتّجاهين.
 * ومثال المستند الحرفيّ يمرّ بالسلسلة كاملةً: مبيعات ← وصفة ← ١٥٠ كجم.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaleRow, normalizeSales, theoreticalConsumption, consumptionVariance } from './posSales.js';
import { indexRecipes } from '../items/recipe.js';
import { EXCEPTION_TYPES, shapeException } from '../ledger/exceptions.js';

const ITEMS = new Map([
  ['CHICKEN', { sku: 'CHICKEN', baseUom: 'KG' }],
  ['BUN', { sku: 'BUN', baseUom: 'PCS' }],
  ['BURGER', { sku: 'BURGER', baseUom: 'PCS' }],
]);

const BURGER_V1 = {
  outputSku: 'BURGER', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1,
  lines: [{ sku: 'CHICKEN', qty: 150, uom: 'G' }, { sku: 'BUN', qty: 1, uom: 'PCS' }],
};

test('المطبِّع مصدر-محايد: Foodics وأودو وشيتٌ عربيّ تخرج شكلًا واحدًا', () => {
  // ثلاثة مصادر بأسماء حقولٍ مختلفة لنفس الواقعة.
  const foodics = { business_date: '2026-08-01', outlet: 'br01', product_code: 'burger', quantity: '3' };
  const odoo = { order_date: '2026-08-01', branch_code: 'BR01', default_code: 'BURGER', qty: 2 };
  const sheet = { 'التاريخ': '2026-08-01', 'الفرع': 'BR01', 'كود الصنف': 'BURGER', 'الكمية': 5 };
  const { sales, rejected } = normalizeSales([foodics, odoo, sheet]);
  assert.equal(rejected.length, 0);
  // وتتجمّع صفًّا واحدًا: نفس اليوم والفرع والصنف.
  assert.equal(sales.length, 1);
  assert.deepEqual(sales[0], { date: '2026-08-01', branch: 'BR01', sku: 'BURGER', qty: 10 });
});

test('المرفوض يُسمّى بسببه: تاريخٌ فاسد · بلا كود · كمّيّة سالبة (المرتجع ليس سالبَ مبيعات)', () => {
  assert.match(readSaleRow({ date: 'أمس', sku: 'X', qty: 1 }).problem, /تاريخ/);
  assert.match(readSaleRow({ date: '2026-08-01', qty: 1 }).problem, /بلا كود/);
  assert.match(readSaleRow({ date: '2026-08-01', sku: 'X', qty: -2 }).problem, /مستندُ إرجاعٍ/);
});

test('★ مثال المستند عبر السلسلة كاملة: مبيعات ١٠٠٠ برجر ← وصفة ← ١٥٠ كجم دجاجًا لليوم والفرع', () => {
  const index = indexRecipes([BURGER_V1]);
  const { sales } = normalizeSales([{ date: '2026-08-01', branch: 'BR01', sku: 'BURGER', qty: 1000 }]);
  const { lines, unlinked, problems } = theoreticalConsumption(sales, index, ITEMS);
  assert.deepEqual(problems, []);
  assert.deepEqual(unlinked, []);
  const chicken = lines.find((l) => l.sku === 'CHICKEN');
  assert.equal(chicken.qty, 150);
  assert.equal(chicken.uom, 'kg');
  assert.equal(chicken.date, '2026-08-01');
  assert.equal(chicken.branch, 'BR01');
});

test('★ الوصفة بنسختها وقت البيع: بيعُ مارس بوصفة مارس وبيعُ يوليو بوصفة يوليو — في دفعةٍ واحدة', () => {
  const v2 = { ...BURGER_V1, version: 2, effectiveFrom: '2026-06-01', lines: [{ sku: 'CHICKEN', qty: 200, uom: 'G' }] };
  const index = indexRecipes([BURGER_V1, v2]);
  const { sales } = normalizeSales([
    { date: '2026-03-15', branch: 'BR01', sku: 'BURGER', qty: 100 },
    { date: '2026-07-15', branch: 'BR01', sku: 'BURGER', qty: 100 },
  ]);
  const { lines } = theoreticalConsumption(sales, index, ITEMS);
  assert.equal(lines.find((l) => l.date === '2026-03-15' && l.sku === 'CHICKEN').qty, 15); // ١٥٠غ × ١٠٠
  assert.equal(lines.find((l) => l.date === '2026-07-15' && l.sku === 'CHICKEN').qty, 20); // ٢٠٠غ × ١٠٠
});

test('صنفٌ بلا وصفة يُعلَن في unlinked بفروعه — ولا يُخمَّن له استهلاك', () => {
  const index = indexRecipes([BURGER_V1]);
  const { sales } = normalizeSales([
    { date: '2026-08-01', branch: 'BR01', sku: 'PIZZA', qty: 7 },
    { date: '2026-08-01', branch: 'BR02', sku: 'PIZZA', qty: 3 },
  ]);
  const { lines, unlinked } = theoreticalConsumption(sales, index, ITEMS);
  assert.deepEqual(lines, []);
  assert.deepEqual(unlinked, [{ sku: 'PIZZA', qty: 10, branches: ['BR01', 'BR02'] }]);
});

test('★ الانحراف بالاتّجاهين يفتح استثناءً معرَّفًا — والصغير تحت العتبة يمرّ صامتًا', () => {
  const theoretical = [
    { branch: 'BR01', sku: 'CHICKEN', qty: 100 },
    { branch: 'BR01', sku: 'BUN', qty: 1000 },
    { branch: 'BR02', sku: 'CHICKEN', qty: 50 },
  ];
  const actual = [
    { branch: 'BR01', sku: 'CHICKEN', qty: 130 }, // ‎+٪٣٠ — هدرٌ أو صرفٌ بلا بيع.
    { branch: 'BR01', sku: 'BUN', qty: 1050 },    // ‎+٪٥ — تحت العتبة، يمرّ.
    { branch: 'BR02', sku: 'CHICKEN', qty: 30 },  // ‎−٪٤٠ — وصفةٌ لا تُتّبع.
  ];
  const { rows, exceptions } = consumptionVariance(theoretical, actual, { thresholdPct: 15 });

  assert.equal(rows.find((r) => r.branch === 'BR01' && r.sku === 'CHICKEN').variancePct, 30);
  assert.equal(exceptions.length, 2);
  assert.ok(exceptions.every((e) => e.type === 'consumption_variance'));
  assert.ok(EXCEPTION_TYPES.consumption_variance, 'النوع في السجلّ القائم لا في سجلٍّ ثانٍ');
  // الزائد والناقص كلاهما يُفسَّر بلغته.
  assert.match(exceptions.find((e) => e.location === 'BR01').reason, /هدر/);
  assert.match(exceptions.find((e) => e.location === 'BR02').reason, /لا تُتّبع/);
  // ويصبّ في سجلّ الاستثناءات بالحقول الثلاثة عشر.
  const shaped = shapeException(exceptions[0]);
  assert.equal(shaped.type, 'consumption_variance');
  assert.equal(shaped.action, EXCEPTION_TYPES.consumption_variance.action);
});

test('نظريٌّ صفريّ مع فعليٍّ موجود انحرافٌ كامل معلَن — لا قسمةَ على صفرٍ تخفيه', () => {
  const { rows } = consumptionVariance([], [{ branch: 'BR01', sku: 'OIL', qty: 9 }]);
  assert.equal(rows[0].variancePct, 100);
});
