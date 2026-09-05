/**
 * اختبارات محتويات الطبلية — البنود التي تجيب «ما على هذه الحمولة؟».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addReading,
  containmentProblems,
  distinctItems,
  isEmpty,
  isMixed,
  lineBalanceRef,
  lineKey,
  readingProblem,
  removeQty,
  totalBaseQty,
} from './lpnContents.js';

const ASOF = '2026-08-26';
const WATER = { sku: 'WNW-001', name: 'ماء نوفا', batch: 'B2408', expiry: '2027-01-01', uom: 'CTN', factor: 12, qty: 1 };

test('القراءة الأولى تفتح بندًا — والثانية بنفس الهويّة تُدمج فيه لا صفًّا ثانيًا', () => {
  const first = addReading([], WATER, { asOf: ASOF });
  assert.equal(first.problem, undefined);
  assert.equal(first.lines.length, 1);
  assert.equal(first.lines[0].baseQty, 12, 'كرتونة الاثني عشر تُحسب اثني عشر يوم القراءة');

  const second = addReading(first.lines, WATER, { asOf: ASOF });
  assert.equal(second.lines.length, 1, 'لا صفوف مكرّرة');
  assert.equal(second.lines[0].qty, 2);
  assert.equal(second.lines[0].baseQty, 24);
});

test('★★ الكمّيّة صفر فما دون ترفض — الحذف والتصحيح قيدُ عكسٍ لا سالب', () => {
  assert.match(readingProblem([], { ...WATER, qty: 0 }, { asOf: ASOF }), /أكبر من صفر/);
  assert.match(readingProblem([], { ...WATER, qty: -3 }, { asOf: ASOF }), /قيدُ عكس/);
});

test('★★ الدفعة المنتهية لا تدخل طبليةً سليمة — والرسالة تسمّي تاريخها', () => {
  const p = readingProblem([], { ...WATER, expiry: '2026-01-01' }, { asOf: ASOF });
  assert.match(p, /منتهية الصلاحية منذ 2026-01-01/);
  assert.match(p, /مرفوضة/, 'تقول الصواب: أين تذهب المنتهية');
  assert.equal(readingProblem([], WATER, {}), '', 'بلا asOf لا حكم على الصلاحية — لا نخمّن اليوم');
});

test('سياسة الخلط: الافتراضي مسموحٌ ويُشتقّ الوسم — والمنع يسمّي ما على الطبلية', () => {
  const lines = addReading([], WATER, { asOf: ASOF }).lines;
  const other = { ...WATER, sku: 'WNW-002', name: 'ماء صغير' };

  const mixed = addReading(lines, other, { asOf: ASOF });
  assert.equal(mixed.problem, undefined, 'الافتراضي حتى حسم LPN-O04: الخلط مسموح');
  assert.ok(isMixed(mixed.lines), 'الوسم يُشتقّ من البنود لا يُكتب');
  assert.ok(!isMixed(lines));

  const strict = readingProblem(lines, other, { asOf: ASOF, policy: { allowMixedItems: false, allowMixedLots: true } });
  assert.match(strict, /WNW-001/, 'الرسالة تسمّي ما على الطبلية');
  assert.match(strict, /طبليةً جديدة/, 'وتقول المخرج');

  const lotStrict = readingProblem(lines, { ...WATER, batch: 'B9999' }, { asOf: ASOF, policy: { allowMixedItems: true, allowMixedLots: false } });
  assert.match(lotStrict, /B2408/);
});

test('السحب ينقص البند ولا يسالِبه — والفارغ يُحذف من القائمة والطبلية تُعلَم فارغة', () => {
  const lines = addReading([], { ...WATER, qty: 3 }, { asOf: ASOF }).lines;
  const taken = removeQty(lines, { ...WATER, qty: 2 });
  assert.equal(taken.lines[0].qty, 1);
  assert.equal(taken.lines[0].baseQty, 12, 'الأساس يتناسب مع المسحوب');

  assert.match(removeQty(taken.lines, { ...WATER, qty: 5 }).problem, /لا يُسالَب/);
  assert.match(removeQty(lines, { ...WATER, sku: 'XX-9' }).problem, /ليس على هذه الطبلية/);

  const emptied = removeQty(taken.lines, { ...WATER, qty: 1 });
  assert.equal(emptied.lines.length, 0);
  assert.ok(isEmpty(emptied.lines), 'فارغةٌ تُعلَم — والهويّة لا تُحذف (LPN-303)');
});

test('المعامل المجهول null لا واحد — والإجمالي يستثنيه ولا يختلقه', () => {
  const noFactor = addReading([], { ...WATER, factor: undefined }, { asOf: ASOF });
  assert.equal(noFactor.lines[0].baseQty, null, 'null تعني «لا أعرف» لا صفرًا ولا واحدًا');
  assert.equal(totalBaseQty(noFactor.lines), 0);
  assert.equal(totalBaseQty(addReading([], WATER, { asOf: ASOF }).lines), 12);
});

test('هويّة الدمج على (صنف×دفعة×صلاحية×وحدة) — اختلاف الوحدة صفٌّ آخر لا دمج', () => {
  const lines = addReading([], WATER, { asOf: ASOF }).lines;
  const unit = addReading(lines, { ...WATER, uom: 'EA', factor: 1, qty: 5 }, { asOf: ASOF });
  assert.equal(unit.lines.length, 2, 'كرتونة ووحدة صفّان');
  assert.notEqual(lineKey(WATER), lineKey({ ...WATER, uom: 'EA' }));
  assert.deepEqual(distinctItems(unit.lines), ['WNW-001']);
});

test('★★ مرجع البند هو balanceId القائم حرفيًّا — المستودع والموقع من الطبلية الحاملة', () => {
  const unit = { code: 'LPN-MAIN-20260826-000001', warehouse: 'MAIN', bin: 'MAIN-A01-R01' };
  const line = { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01' };
  assert.equal(
    lineBalanceRef(unit, line),
    'WNW-001__MAIN__B2408__MAIN-A01-R01__2027-01-01__OK',
    'المفتاح مفتاح الرصيد نفسه — لا مفتاح موازٍ'
  );
  assert.equal(
    lineBalanceRef({ ...unit, bin: '' }, { sku: 'WNW-001', batch: 'B2408' }),
    'WNW-001__MAIN__B2408',
    'بلا موقعٍ ولا صلاحية: المفتاح القديم حرفيًّا — ترحيل صفر الأثر'
  );
});

test('🔒 فاحص الاحتواء يعلن التجاوز ولا يصلحه: المحمول لمفتاحٍ لا يتجاوز رصيده', () => {
  const units = [
    {
      code: 'LPN-MAIN-20260826-000001',
      warehouse: 'MAIN',
      bin: '',
      lines: [{ sku: 'WNW-001', batch: 'B2408', qty: 8, baseQty: 8 }],
    },
    {
      code: 'LPN-MAIN-20260826-000002',
      warehouse: 'MAIN',
      bin: '',
      lines: [{ sku: 'WNW-001', batch: 'B2408', qty: 5, baseQty: 5 }],
    },
  ];
  const balances = [{ id: 'WNW-001__MAIN__B2408', qty: 10 }];

  const { problems } = containmentProblems(units, balances);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].carried, 13);
  assert.equal(problems[0].onBalance, 10);
  assert.deepEqual(problems[0].units, ['LPN-MAIN-20260826-000001', 'LPN-MAIN-20260826-000002'], 'الخرق يسمّي طباليه');

  assert.deepEqual(containmentProblems(units, [{ id: 'WNW-001__MAIN__B2408', qty: 20 }]).problems, [], 'المحمول ≤ الرصيد: لا خرق');
});

test('★★ البند مجهول المعامل لا يُفحص ولا يُحصى — كراتينُ تُجمع مع وحداتٍ تُخفي الخرق', () => {
  // عشرة كراتين بمعاملٍ مجهول = ١٢٠ وحدة فعليًّا. جمعُها «١٠» ومقارنتُها
  // بستّين وحدةً كان يقول «لا خرق» — والخرق واقعٌ ومضاعف.
  const units = [
    {
      code: 'LPN-MAIN-20260826-000001',
      warehouse: 'MAIN',
      bin: '',
      lines: [{ sku: 'WNW-001', batch: 'B2408', uom: 'CTN', factor: null, qty: 10, baseQty: null }],
    },
  ];
  const { problems, uncheckable } = containmentProblems(units, [{ id: 'WNW-001__MAIN__B2408', qty: 60 }]);
  assert.deepEqual(problems, [], 'المجهول لا يُدّعى عليه خرقٌ ولا تُنفى عنه تهمة');
  assert.equal(uncheckable.length, 1, 'بل يخرج قائمةَ عملٍ باسم طبليته');
  assert.deepEqual(uncheckable[0], { unit: 'LPN-MAIN-20260826-000001', sku: 'WNW-001', batch: 'B2408', qty: 10, uom: 'CTN' });
});

test('🔒 ملصق الطبلية في خانة الدفعة يُرفض — «LPN ليس رقم Lot» بالاتّجاهين', () => {
  const p = readingProblem([], { ...WATER, batch: 'LPN-MAIN-20260826-000001' }, { asOf: ASOF });
  assert.match(p, /ملصق طبلية لا رقم تشغيلة/);
  assert.match(p, /من العبوة نفسها/, 'تقول الصواب: أين يُمسح باركود الدفعة');
});

test('★★★ البندُ يحمل هويّةَ سطر الأمر — الكاتبُ كان يُسقطها فينقطع السلك عند أوّله', () => {
  // ★★★ العطبُ الذي مرّ تحت ٣٧٥٨ اختبارًا: `scanVerdict` يُنتج `lineId`
  // ويسلّمه، و`addReading` تبني كائنًا حرفيًّا فترميه — ثمّ `grnBridge`
  // يتخطّى كلَّ بندٍ بلا هويّة. فلا كمّيّةٌ تصل مذكّرةَ الاستلام ولا صلاحية.
  const reading = { ...WATER, lineId: 'L1' };
  const first = addReading([], reading, { asOf: ASOF });
  assert.equal(first.lines[0].lineId, 'L1', 'ما سلّمه الحكمُ يُكتب لا يُرمى');

  const merged = addReading(first.lines, reading, { asOf: ASOF });
  assert.equal(merged.lines.length, 1);
  assert.equal(merged.lines[0].lineId, 'L1', 'والدمجُ يرفع الكمّيّة ولا يمسّ الهويّة');

  const taken = removeQty(merged.lines, { ...reading, qty: 1 });
  assert.equal(taken.lines[0].lineId, 'L1', 'والسحبُ كذلك — البندُ الباقي هو هو');
});

test('⚠️ وبلا هويّةٍ يُكتب نصٌّ فارغ لا `undefined` — فـ`tx.update` ترفض المجهول', () => {
  // القراءةُ بلا `lineId` واقعٌ قائم (مسحٌ خارج جلسةٍ · نداءٌ مباشر)، والحقلُ
  // يُكتب فارغًا ليسقط في مُنقذ الطبالي القديمة بالجسر لا ليُسقط الكتابة كلَّها.
  const line = addReading([], WATER, { asOf: ASOF }).lines[0];
  assert.equal(line.lineId, '');
  assert.ok('lineId' in line, 'الحقلُ حاضرٌ دائمًا — فلا شكلان لبندٍ واحد');
  assert.equal(JSON.stringify(line).includes('undefined'), false, 'ولا `undefined` يعبر إلى Firestore');
});
