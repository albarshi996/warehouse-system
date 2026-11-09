/**
 * ‹POS م٧› سلّةُ الكاشير — منطقٌ خالص. البيّنةُ تبدأ بالنقض: خصمُ السلّة مسقوفٌ،
 * والبطاقةُ بلا باقٍ، والنقصُ عن المستحقّ يُمنع.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAY_METHODS,
  isCashPayment,
  lineTotal,
  cartLineFromItem,
  addOrIncrement,
  cartTotals,
  saleProblems,
} from './cashierCart.js';

test('‹POS› إجماليُّ البند = كمّيّة×سعر−خصم، لا يقلّ عن صفر', () => {
  assert.equal(lineTotal({ qty: 3, unitPrice: 2.5, discount: 1 }), 6.5);
  assert.equal(lineTotal({ qty: 2, unitPrice: 1, discount: 5 }), 0);
  assert.equal(lineTotal({ qty: 0, unitPrice: 9 }), 0);
});

test('‹POS› بناءُ سطرٍ من صنف: كمّيّةٌ ١ ووصفٌ عربيّ وسعرٌ ممرَّر', () => {
  const l = cartLineFromItem({ sku: 'A1', barcodes: ['6221'], nameAr: 'ماء', unit: 'قطعة', unitPrice: 2 });
  assert.equal(l.sku, 'A1');
  assert.equal(l.barcode, '6221');
  assert.equal(l.description, 'ماء');
  assert.equal(l.qty, 1);
  assert.equal(l.unitPrice, 2);
  // السعرُ المُمرَّر يسبق سعرَ الصنف.
  assert.equal(cartLineFromItem({ sku: 'A1', unitPrice: 2 }, { unitPrice: 3.5 }).unitPrice, 3.5);
});

test('‹POS› الإضافة: نفسُ الصنف يزيد الكمّيّة، والجديدُ يُلحق', () => {
  let lines = [];
  lines = addOrIncrement(lines, cartLineFromItem({ sku: 'A', unitPrice: 2 }));
  lines = addOrIncrement(lines, cartLineFromItem({ sku: 'A', unitPrice: 2 }));
  lines = addOrIncrement(lines, cartLineFromItem({ sku: 'B', unitPrice: 5 }));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].qty, 2, 'A صار كمّيّتَين');
  assert.equal(lines[1].sku, 'B');
});

test('‹POS› حسابُ السلّة: مجموعٌ وخصمٌ مسقوفٌ وإجماليّ', () => {
  const lines = [
    { sku: 'A', qty: 2, unitPrice: 3 }, // 6
    { sku: 'B', qty: 1, unitPrice: 4, discount: 1 }, // 3
  ];
  const t = cartTotals(lines, { cartDiscount: 2, method: 'نقدًا', paid: 10 });
  assert.equal(t.subtotal, 9);
  assert.equal(t.cartDiscount, 2);
  assert.equal(t.grandTotal, 7);
  assert.equal(t.change, 3, 'الباقي = المدفوع − المستحقّ');
  assert.equal(t.settled, true);
  // خصمُ سلّةٍ أكبرُ من المجموع يُسقَف.
  assert.equal(cartTotals(lines, { cartDiscount: 999 }).grandTotal, 0);
});

test('‹POS› النقدُ له باقٍ؛ البطاقةُ تُسوّى بلا باقٍ', () => {
  const lines = [{ sku: 'A', qty: 1, unitPrice: 10 }];
  const cash = cartTotals(lines, { method: 'نقدًا', paid: 15 });
  assert.equal(cash.change, 5);
  const card = cartTotals(lines, { method: 'بطاقة', paid: 0 });
  assert.equal(card.change, 0);
  assert.equal(card.paid, 10, 'البطاقةُ تُسوّى بالكامل');
  assert.equal(card.due, 0);
  assert.equal(card.settled, true);
});

test('‹POS› الكمّيّةُ الصفريّةُ لا تدخل الحساب', () => {
  const t = cartTotals([{ sku: 'A', qty: 0, unitPrice: 9 }, { sku: 'B', qty: 1, unitPrice: 4 }]);
  assert.equal(t.count, 1);
  assert.equal(t.subtotal, 4);
});

test('‹POS› علل البيع: سلّةٌ فارغة · بلا مخزن · نقدٌ ناقص', () => {
  assert.ok(saleProblems({ lines: [], warehouse: 'WH1', method: 'نقدًا', paid: 0 }).some((p) => /فارغة/.test(p)));
  assert.ok(saleProblems({ lines: [{ sku: 'A', qty: 1, unitPrice: 5 }], warehouse: '', method: 'نقدًا', paid: 5 }).some((p) => /المخزن/.test(p)));
  assert.ok(saleProblems({ lines: [{ sku: 'A', qty: 1, unitPrice: 5 }], warehouse: 'WH1', method: 'شيك', paid: 5 }).some((p) => /طريقة/.test(p)));
  assert.ok(saleProblems({ lines: [{ sku: 'A', qty: 1, unitPrice: 5 }], warehouse: 'WH1', method: 'نقدًا', paid: 3 }).some((p) => /أقل/.test(p)));
  // الصحيحُ بلا علل (نقدًا كافٍ).
  assert.deepEqual(saleProblems({ lines: [{ sku: 'A', qty: 1, unitPrice: 5 }], warehouse: 'WH1', method: 'نقدًا', paid: 5 }), []);
  // البطاقةُ لا تحتاج مدفوعًا.
  assert.deepEqual(saleProblems({ lines: [{ sku: 'A', qty: 1, unitPrice: 5 }], warehouse: 'WH1', method: 'بطاقة', paid: 0 }), []);
});

test('‹POS› الثوابت', () => {
  assert.deepEqual([...PAY_METHODS], ['نقدًا', 'بطاقة', 'تحويل']);
  assert.equal(isCashPayment('نقدًا'), true);
  assert.equal(isCashPayment('بطاقة'), false);
});
