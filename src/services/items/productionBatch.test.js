/**
 * حارس دفعة الإنتاج والـYield ‹FNB-503›.
 *
 * أخطر ما يحرسه: **لا تاريخَ صلاحيّةٍ يُخترع** (وتاريخٌ مخترَع أخطر من
 * غيابه)، و**الـYield يُقاس بما تكفيه الموادّ المصروفة لا بالمخطَّط وحده**
 * (فلا يُلام التحضير على صرفٍ ناقص)، و**المرفوض جودةً لا يُخصَّص لفرع**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATCH_PREFIX, productionBatchNumber, batchDates, stampBatch,
  yieldOf, expectedFromIssued, yieldException, allocationVerdict, YIELD_EXCEPTION_PCT,
} from './productionBatch.js';
import { indexRecipes } from './recipe.js';
import { balanceId, fefoSort } from '../balances/balanceKey.js';
import { EXCEPTION_TYPES, shapeException } from '../ledger/exceptions.js';

const ITEMS = new Map([
  ['CHICKEN', { sku: 'CHICKEN', baseUom: 'KG' }],
  ['SPICE', { sku: 'SPICE', baseUom: 'KG' }],
  ['SAUCE', { sku: 'SAUCE', baseUom: 'KG' }],
]);

// وصفةٌ لكلّ كيلو صوص: ٨٠٠غ دجاج و٢٠٠غ بهار.
const RECIPES = indexRecipes([{
  outputSku: 'SAUCE', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1,
  lines: [{ sku: 'CHICKEN', qty: 800, uom: 'G' }, { sku: 'SPICE', qty: 200, uom: 'G' }],
}]);

test('رقم الدفعة من المولّد القائم — لا صيغةٌ ثانية', () => {
  assert.equal(BATCH_PREFIX, 'PB');
  assert.match(productionBatchNumber(2026, 41), /^PB-2026-\d+$/);
});

test('★★ لا تاريخَ صلاحيّةٍ يُخترع: بلا مدّةٍ معرَّفة يُعلَن النقص', () => {
  const ok = batchDates({ producedOn: '2026-08-18', shelfLifeDays: 30 });
  assert.equal(ok.mfgDate, '2026-08-18');
  assert.equal(ok.expiry, '2026-09-17');
  assert.equal(ok.problem, '');

  const noShelf = batchDates({ producedOn: '2026-08-18' });
  assert.equal(noShelf.expiry, '', 'اخترع تاريخًا بلا مدّة');
  assert.match(noShelf.problem, /لا تُخترع/);

  assert.match(batchDates({ producedOn: 'أمس', shelfLifeDays: 5 }).problem, /غير مقروء/);
});

test('★ الختم لا يدهس ما مُلئ بيد — فمن كتب أدرى بواقعه', () => {
  const { lines, problems } = stampBatch(
    [
      { sku: 'SAUCE', qtyProduced: 10 },
      { sku: 'SAUCE', qtyProduced: 5, batch: 'يدويّة', expiry: '2026-12-31' },
    ],
    { batchNumber: 'PB-2026-0041', producedOn: '2026-08-18', shelfLifeBySku: new Map([['SAUCE', 30]]) }
  );
  assert.equal(lines[0].batch, 'PB-2026-0041');
  assert.equal(lines[0].expiry, '2026-09-17');
  assert.equal(lines[1].batch, 'يدويّة', 'دُهس إدخالٌ يدويّ');
  assert.equal(lines[1].expiry, '2026-12-31');
  assert.deepEqual(problems, []);
});

test('وبلا مدّةٍ ولا إدخالٍ يدويّ يُعلَن النقص ولا يُخترع', () => {
  const { lines, problems } = stampBatch(
    [{ sku: 'SAUCE', qtyProduced: 10 }],
    { batchNumber: 'PB-1', producedOn: '2026-08-18' }
  );
  assert.equal(lines[0].expiry, '');
  assert.ok(problems.some((p) => p.includes('SAUCE')));
});

test('★★ المتوقَّع من المصروف: الأقلّ هو الحاكم — المادّة المقيِّدة', () => {
  // ٨٠ كجم دجاج تكفي ١٠٠ كجم صوص · و١٠ كجم بهار تكفي ٥٠ فقط ⇒ البهار مقيِّد.
  const issued = new Map([['CHICKEN', 80], ['SPICE', 10]]);
  const r = expectedFromIssued(RECIPES, ITEMS, 'SAUCE', issued);
  assert.equal(r.expected, 50);
  assert.equal(r.limitedBy, 'SPICE');
  assert.deepEqual(r.problems, []);
});

test('وصنفٌ بلا وصفةٍ سارية لا يُحسب له متوقَّع — يُعلَن', () => {
  const r = expectedFromIssued(RECIPES, ITEMS, 'PIZZA', new Map([['CHICKEN', 10]]));
  assert.equal(r.expected, 0);
  assert.ok(r.problems.some((p) => p.includes('بلا وصفةٍ سارية')));
});

test('★★ الـYield مقياسان لا واحد — والنقص من الصرف يُفصَل عن هدر التحضير', () => {
  // خطّةٌ ١٠٠، والموادّ المصروفة تكفي ٥٠ فقط، وأُنتج ٤٨.
  const r = yieldOf({ produced: 48, planned: 100, expected: 50 });
  assert.equal(r.vsPlanned, 48, 'مقابل الخطّة');
  assert.equal(r.vsExpected, 96, 'ومقابل ما تكفيه الموادّ — وهو مقياس الشيف');
  assert.equal(r.shortIssue, true);
  assert.match(r.why, /النقص من الصرف لا من التحضير/);
});

test('★ الاستثناء يُقاس بمقياس التحضير — فلا يُلام الطاهي على صرفٍ ناقص', () => {
  assert.ok(EXCEPTION_TYPES.low_yield, 'النوع في السجلّ القائم');
  const batch = { sku: 'SAUCE', warehouse: 'KITCHEN', batch: 'PB-1' };

  // ٤٨ من ٥٠ ممكنة = ٪٩٦ ⇒ لا استثناء، ولو كانت ٪٤٨ من الخطّة.
  assert.equal(yieldException(batch, yieldOf({ produced: 48, planned: 100, expected: 50 })), null);

  // وهدرُ تحضيرٍ حقيقيّ: ٧٠ من ١٠٠ ممكنة = ٪٧٠ ⇒ استثناء.
  const exc = yieldException(batch, yieldOf({ produced: 70, planned: 100, expected: 100 }));
  assert.ok(exc);
  assert.equal(exc.type, 'low_yield');
  assert.equal(exc.qty, 30);
  assert.match(exc.reason, /دون العتبة/);
  assert.equal(shapeException(exc).action, EXCEPTION_TYPES.low_yield.action);
  assert.equal(YIELD_EXCEPTION_PCT, 85);
});

test('★★ المرفوض جودةً لا يُخصَّص، والمعلَّق كذلك — الجودة قبل التخصيص', () => {
  assert.equal(allocationVerdict({ batch: 'PB-1', qcStatus: 'passed' }).ok, true);

  const rejected = allocationVerdict({ batch: 'PB-2', qcStatus: 'rejected' });
  assert.equal(rejected.ok, false);
  assert.match(rejected.problem, /مرفوضةٌ جودةً/);

  const pending = allocationVerdict({ batch: 'PB-3' });
  assert.equal(pending.ok, false);
  assert.match(pending.problem, /بلا قرار جودة/);
});

test('★ والمصنَّع داخليًّا يدخل FEFO بلا استثناء — نفس بنية الدفعة', () => {
  const produced = { sku: 'SAUCE', warehouse: 'KITCHEN', batch: 'PB-2026-0041', expiry: '2026-09-17', qty: 10 };
  const bought = { sku: 'SAUCE', warehouse: 'KITCHEN', batch: 'SUP-9', expiry: '2026-09-01', qty: 5 };
  // مفتاح الرصيد واحدٌ للاثنين بنيةً — لا مفتاحَ خاصّ بالمصنَّع.
  assert.ok(balanceId(produced));
  assert.notEqual(balanceId(produced), balanceId(bought));
  // والأقرب صلاحيّةً أوّلًا ولو كان مشترًى.
  assert.equal(fefoSort([produced, bought])[0].batch, 'SUP-9');
});
