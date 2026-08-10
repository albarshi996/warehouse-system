/**
 * اختبارات ربط المحرّك بالفاتورة — الدالّتان الخالصتان في `PromotionsPanel`.
 *
 * تُستوردان من ملفّ المكوّن لأنّهما خالصتان بالكامل (بلا React ولا DOM)، وهو
 * المكان الطبيعيّ لهما: تعيشان مع من يستعملهما ويُختبَران هنا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { paidLines, applyPromoResult, isInSync } from './invoiceApply.js';
import { evaluateOrder } from './promotionEngine.js';
import { blankPromotion } from './promotionModel.js';

const bxgy = (over = {}) => ({
  ...blankPromotion(),
  id: 'P1',
  code: 'PR-1',
  nameAr: 'اشترِ ١٠ خذ ١',
  type: 'buy_x_get_y',
  buyQty: 10,
  getQty: 1,
  ...over,
});

const line = (sku, qty, unitPrice = 10, over = {}) => ({
  sku,
  description: sku,
  qty,
  unitPrice,
  unitCost: 6,
  discount: 0,
  ...over,
});

const cycle = (lines, promos) => applyPromoResult(lines, evaluateOrder({ lines: paidLines(lines), promotions: promos }));

test('فصل المدفوع عن المجّانيّ', () => {
  const rows = [line('A', 10), { ...line('A', 1), isFree: true }];
  assert.equal(paidLines(rows).length, 1);
});

test('★ المجّانيّ لا يُنتج مجّانيًّا — لا تتوالد الهدايا', () => {
  // ٢٠ مدفوعة ⇒ ٢ مجّانًا. لو حُسب المجّانيّ في العتبة لصارت ٢٢ ⇒ ٢ ثمّ ٢٤…
  let rows = [line('A', 20)];
  rows = cycle(rows, [bxgy()]);
  assert.equal(rows.filter((l) => l.isFree).reduce((s, l) => s + l.qty, 0), 2);

  rows = cycle(rows, [bxgy()]);
  assert.equal(rows.filter((l) => l.isFree).reduce((s, l) => s + l.qty, 0), 2, 'ما تزال اثنتين');
});

test('★ التطبيق إيديمبوتنت — الضغط ثلاثًا كالضغط مرّة', () => {
  let rows = [line('A', 20)];
  const first = cycle(rows, [bxgy()]);
  const second = cycle(first, [bxgy()]);
  const third = cycle(second, [bxgy()]);
  assert.equal(first.length, second.length);
  assert.equal(second.length, third.length);
  assert.deepEqual(
    third.map((l) => [l.sku, l.qty, l.unitPrice]),
    first.map((l) => [l.sku, l.qty, l.unitPrice])
  );
});

test('سحب العرض يُزيل مجّانيّاته ولا يُبقي أثرًا', () => {
  const withPromo = cycle([line('A', 20)], [bxgy()]);
  assert.equal(withPromo.length, 2);
  const withoutPromo = cycle(withPromo, []);
  assert.equal(withoutPromo.length, 1, 'عاد بندًا واحدًا');
  assert.equal(withoutPromo[0].qty, 20);
});

test('الخصم المنسوب لعرضٍ يُمحى عند إعادة الحساب، واليدويّ يبقى', () => {
  const tiered = {
    ...blankPromotion(),
    id: 'T',
    code: 'T-1',
    nameAr: 'متدرّج',
    type: 'tiered_discount',
    tiers: [{ minQty: 10, discountPct: 10 }],
  };
  const manual = line('B', 5, 10, { discount: 7 }); // خصمٌ يدويّ بلا promoCode
  let rows = [line('A', 20), manual];

  rows = cycle(rows, [tiered]);
  assert.equal(rows[0].promoCode, 'T-1');
  assert.equal(rows[0].discount, 20, '200 × 10%');
  assert.equal(rows[1].discount, 7 + 5, 'اليدويّ ٧ + عرض ٥');

  // إلغاء العرض: خصمه يذهب واليدويّ يبقى
  rows = cycle(rows, []);
  assert.equal(rows[0].discount, 0);
  assert.equal(rows[0].promoCode, '');
  assert.equal(rows[1].discount, 0, 'اليدويّ اندمج بـpromoCode فمُحي معه');
});

test('الخصم اليدويّ الخالص (بلا promoCode) لا يُمسّ', () => {
  const rows = cycle([line('A', 5, 10, { discount: 9 })], []);
  assert.equal(rows[0].discount, 9);
});

test('بند المجّانيّ يحمل رمز عرضه — فلا يُوسَم «بلا سند» في حارس التسريب', () => {
  const rows = cycle([line('A', 20)], [bxgy()]);
  const free = rows.find((l) => l.isFree);
  assert.equal(free.promoCode, 'PR-1');
  assert.equal(free.unitPrice, 0);
  assert.ok(free.notes.includes('مجّانًا'));
});

test('فاتورة بلا بنود أو بلا عروض لا تنكسر', () => {
  assert.deepEqual(cycle([], [bxgy()]), []);
  assert.equal(cycle([line('A', 3)], [bxgy()]).length, 1);
});

test('كاشف عدم التطابق ينبّه حين يُضاف بندٌ بعد التطبيق', () => {
  const promos = [bxgy()];
  const applied = cycle([line('A', 20)], promos);
  assert.equal(isInSync(applied, evaluateOrder({ lines: paidLines(applied), promotions: promos })), true);

  // المندوب أضاف عشرة أخرى ولم يُعِد التطبيق ⇒ يستحقّ مجّانيًّا ثالثًا
  const changed = [...paidLines(applied).map((l) => ({ ...l, qty: 30 })), ...applied.filter((l) => l.isFree)];
  assert.equal(isInSync(changed, evaluateOrder({ lines: paidLines(changed), promotions: promos })), false);
});
