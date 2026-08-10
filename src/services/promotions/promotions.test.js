import test from 'node:test';
import assert from 'node:assert/strict';
import {
  promotionVerdict,
  isPromoLive,
  isBudgetExhausted,
  matchesCustomer,
  matchesLine,
  sortedTiers,
  blankPromotion,
  PROMO_TYPES,
} from './promotionModel.js';
import { evaluateOrder, mergeFreeLines, budgetConsumption } from './promotionEngine.js';

const promo = (over = {}) => ({ ...blankPromotion(), id: 'P1', code: 'PR-1', nameAr: 'عرض', ...over });
const line = (sku, qty, unitPrice = 10, over = {}) => ({ sku, description: sku, qty, unitPrice, unitCost: 6, ...over });

/* ═══════════════ التعريف والتحقّق ═══════════════ */

test('العرض المعطوب يُمنع قبل الحفظ — لا يفشل صامتًا في الميدان', () => {
  const v = promotionVerdict(promo({ type: 'buy_x_get_y', buyQty: 0, getQty: 0, code: '' }));
  assert.equal(v.ok, false);
  assert.ok(v.problems.length >= 3);
});

test('نافذة زمنيّة مقلوبة تُرفض', () => {
  const v = promotionVerdict(promo({ type: 'buy_x_get_y', buyQty: 10, getQty: 1, getSku: 'A', startDate: '2026-09-01', endDate: '2026-08-01' }));
  assert.match(v.problems.join(' '), /الانتهاء يسبق/);
});

test('شريحتان بالكميّة نفسها غموضٌ يُمنع', () => {
  const v = promotionVerdict(promo({ type: 'tiered_discount', tiers: [{ minQty: 10, discountPct: 5 }, { minQty: 10, discountPct: 8 }] }));
  assert.match(v.problems.join(' '), /أيّهما تُطبَّق/);
});

test('بلا سقف ميزانيّة = تحذير لا منع', () => {
  const v = promotionVerdict(promo({ type: 'buy_x_get_y', buyQty: 10, getQty: 1, getSku: 'A' }));
  assert.equal(v.ok, true);
  assert.match(v.warnings.join(' '), /سقفٍ للميزانيّة/);
});

test('السريان: التعطيل والنافذة والميزانيّة', () => {
  assert.equal(isPromoLive(promo({ active: false }), '2026-08-10'), false);
  assert.equal(isPromoLive(promo({ startDate: '2026-08-01', endDate: '2026-08-31' }), '2026-08-10'), true);
  assert.equal(isPromoLive(promo({ endDate: '2026-08-01' }), '2026-08-10'), false);
  assert.equal(isBudgetExhausted(promo({ budget: { maxFreeUnits: 100 }, usage: { freeUnits: 100 } })), true);
  assert.equal(isBudgetExhausted(promo({ budget: { maxFreeUnits: 0 }, usage: { freeUnits: 9999 } })), false, 'صفر = بلا سقف');
});

test('النطاق الفارغ يعني الجميع', () => {
  assert.equal(matchesLine(promo(), line('X', 1)), true);
  assert.equal(matchesCustomer(promo(), { code: 'C1' }), true);
  assert.equal(matchesLine(promo({ scope: { skus: ['A'] } }), line('B', 1)), false);
  assert.equal(matchesLine(promo({ scope: { categories: ['شامبو'] } }), line('B', 1, 10, { category: 'شامبو' })), true);
  assert.equal(matchesCustomer(promo({ scope: { outletTypes: ['صيدلية'] } }), { code: 'C1', outletType: 'بقالة' }), false);
});

test('الشرائح تُرتَّب تنازليًّا مهما كُتبت', () => {
  const t = sortedTiers(promo({ tiers: [{ minQty: 10, discountPct: 5 }, { minQty: 50, discountPct: 12 }] }));
  assert.deepEqual(t.map((x) => x.minQty), [50, 10]);
});

/* ═══════════════ اشترِ X خذ Y ═══════════════ */

const bxgy = (over = {}) => promo({ type: 'buy_x_get_y', buyQty: 10, getQty: 1, ...over });

test('★ المجّانيّ يخرج بندًا يُقيَّد في الدفتر — لا خصمًا في ورقة', () => {
  const r = evaluateOrder({ lines: [line('A', 20)], promotions: [bxgy()] });
  assert.equal(r.freeLines.length, 1);
  const f = r.freeLines[0];
  assert.equal(f.sku, 'A');
  assert.equal(f.qty, 2, 'عشرون ⇐ اثنان');
  assert.equal(f.unitPrice, 0, 'قيمته صفر في الفاتورة');
  assert.equal(f.unitCost, 6, 'وتكلفته حقيقيّة في المخزون');
  assert.equal(f.isFree, true);
  assert.equal(r.totals.discount, 0, 'لا خصم — بضاعةٌ خرجت');
  assert.equal(r.totals.freeCost, 12, 'كلفة المجّانيّ محسوبة');
});

test('المجّانيّ من الصنف نفسه لكلّ بندٍ على حدة', () => {
  const r = evaluateOrder({ lines: [line('A', 20), line('B', 10)], promotions: [bxgy()] });
  assert.deepEqual(r.freeLines.map((f) => [f.sku, f.qty]), [['A', 2], ['B', 1]]);
});

test('بتحديد الصنف المجّانيّ يُجمَّع المؤهَّل كلّه', () => {
  const r = evaluateOrder({ lines: [line('A', 6), line('B', 6)], promotions: [bxgy({ getSku: 'A' })] });
  assert.equal(r.freeLines.length, 1);
  assert.deepEqual([r.freeLines[0].sku, r.freeLines[0].qty], ['A', 1], '12 ⇐ مجّانيّ واحد من A');
});

test('دون العتبة: لا مجّانيّ، وتلميح بيعٍ إضافيّ', () => {
  const r = evaluateOrder({ lines: [line('A', 8)], promotions: [bxgy()] });
  assert.equal(r.freeLines.length, 0);
  assert.equal(r.nudges.length, 1);
  assert.equal(r.nudges[0].need, 2);
  assert.match(r.nudges[0].message, /أضف 2/);
});

test('التلميح لا يظهر حين تكون العتبة بعيدة', () => {
  const r = evaluateOrder({ lines: [line('A', 1)], promotions: [bxgy()] });
  assert.equal(r.nudges.length, 0, 'تسعةٌ ناقصة ليست تلميحًا بل بيعًا جديدًا');
});

/* ═══════════════ تحميل صنف على صنف ═══════════════ */

test('التحميل يُخرج الصنف البطيء مجّانًا مع السريع', () => {
  const r = evaluateOrder({
    lines: [line('FAST', 24)],
    promotions: [promo({ type: 'attach', perQty: 12, attachSku: 'SLOW', attachQty: 1, attachUnitCost: 4, scope: { skus: ['FAST'] } })],
  });
  assert.equal(r.freeLines.length, 1);
  assert.deepEqual([r.freeLines[0].sku, r.freeLines[0].qty], ['SLOW', 2]);
  assert.equal(r.totals.freeCost, 8);
});

/* ═══════════════ الخصم المتدرّج ═══════════════ */

test('الشريحة الأعلى المستحقّة لا الأولى المكتوبة', () => {
  const p = promo({ type: 'tiered_discount', tiers: [{ minQty: 10, discountPct: 5 }, { minQty: 50, discountPct: 20 }] });
  const r = evaluateOrder({ lines: [line('A', 60, 10)], promotions: [p] });
  assert.equal(r.totals.discount, 120, '600 × 20%');
});

test('المتدرّج يُلمّح للشريحة التالية', () => {
  const p = promo({ type: 'tiered_discount', tiers: [{ minQty: 10, discountPct: 5 }, { minQty: 50, discountPct: 20 }] });
  const r = evaluateOrder({ lines: [line('A', 45, 10)], promotions: [p] });
  assert.equal(r.nudges[0].need, 5);
  assert.match(r.nudges[0].message, /20%/);
});

/* ═══════════════ الحزمة واخلط واختر ═══════════════ */

test('الحزمة: الخصم فرق المجموع عن سعرها، موزّعًا بالنسبة', () => {
  const p = promo({ type: 'bundle', bundleLines: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }], bundlePrice: 25 });
  const r = evaluateOrder({ lines: [line('A', 4, 10), line('B', 2, 10)], promotions: [p] });
  // حزمتان: القيمة 2×(2×10 + 1×10) = 60، السعر 2×25 = 50، التوفير 10
  assert.equal(r.totals.discount, 10);
  assert.equal(r.lineDiscounts.length, 2, 'موزّع على بندَيه');
});

test('الحزمة الناقصة لا تُطبَّق', () => {
  const p = promo({ type: 'bundle', bundleLines: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }], bundlePrice: 25 });
  const r = evaluateOrder({ lines: [line('A', 4, 10)], promotions: [p] });
  assert.equal(r.applied.length, 0);
  assert.match(r.skipped[0].reason, /تحتاج الصنف B/);
});

test('حزمةٌ سعرها لا يقلّ عن مجموعها تُرفض بدل خصمٍ سالب', () => {
  const p = promo({ type: 'bundle', bundleLines: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }], bundlePrice: 50 });
  const r = evaluateOrder({ lines: [line('A', 1, 10), line('B', 1, 10)], promotions: [p] });
  assert.equal(r.applied.length, 0);
  assert.match(r.skipped[0].reason, /لا يقلّ/);
});

test('اخلط واختر: التخصيص من الأعلى سعرًا', () => {
  const p = promo({ type: 'mix_match', mixMatchSkus: ['A', 'B'], mixMatchQty: 3, mixMatchPrice: 20 });
  const r = evaluateOrder({ lines: [line('A', 2, 12), line('B', 2, 8)], promotions: [p] });
  // تشكيلة واحدة (3 وحدات): الأعلى سعرًا = A×2 (24) + B×1 (8) = 32، السعر 20، التوفير 12
  assert.equal(r.totals.discount, 12);
});

/* ═══════════════ التراكم والحتميّة والميزانيّة ═══════════════ */

test('العرض الحصريّ يحتكر بنوده فلا يمسّها ما بعده', () => {
  const excl = promo({ id: 'E', code: 'A-EXCL', priority: 1, exclusive: true, type: 'tiered_discount', tiers: [{ minQty: 5, discountPct: 10 }] });
  const other = promo({ id: 'O', code: 'B-OTHER', priority: 2, type: 'tiered_discount', tiers: [{ minQty: 5, discountPct: 50 }] });
  const r = evaluateOrder({ lines: [line('A', 10, 10)], promotions: [other, excl] });
  assert.equal(r.applied.length, 1);
  assert.equal(r.applied[0].code, 'A-EXCL');
  assert.equal(r.totals.discount, 10, '100 × 10% فقط');
});

test('الترتيب حتميّ: النتيجة لا تتغيّر بترتيب وصول العروض', () => {
  const a = promo({ id: 'A', code: 'AA', priority: 5, type: 'tiered_discount', tiers: [{ minQty: 5, discountPct: 10 }] });
  const b = promo({ id: 'B', code: 'BB', priority: 5, type: 'tiered_discount', tiers: [{ minQty: 5, discountPct: 20 }] });
  const r1 = evaluateOrder({ lines: [line('A', 10, 10)], promotions: [a, b] });
  const r2 = evaluateOrder({ lines: [line('A', 10, 10)], promotions: [b, a] });
  assert.deepEqual(r1.applied.map((x) => x.code), r2.applied.map((x) => x.code));
  assert.equal(r1.totals.discount, r2.totals.discount);
});

test('★ الخصم لا يتجاوز قيمة البند مهما تراكمت العروض', () => {
  const a = promo({ id: 'A', code: 'AA', priority: 1, type: 'tiered_discount', tiers: [{ minQty: 1, discountPct: 80 }] });
  const b = promo({ id: 'B', code: 'BB', priority: 2, type: 'tiered_discount', tiers: [{ minQty: 1, discountPct: 80 }] });
  const r = evaluateOrder({ lines: [line('A', 10, 10)], promotions: [a, b] });
  assert.equal(r.totals.discount, 100, 'قيمة البند 100 — لا 160');
  assert.ok(r.totals.discount <= 100);
});

test('الميزانيّة المستنفدة توقف العرض بسببٍ ظاهر', () => {
  const p = bxgy({ budget: { maxFreeUnits: 5 }, usage: { freeUnits: 5 } });
  const r = evaluateOrder({ lines: [line('A', 20)], promotions: [p] });
  assert.equal(r.freeLines.length, 0);
  assert.match(r.skipped[0].reason, /ميزانيّة/);
});

test('أسباب عدم التطبيق تُعرَض ولا تُبتلع', () => {
  const r = evaluateOrder({
    lines: [line('A', 20)],
    promotions: [bxgy({ scope: { skus: ['ZZZ'] } }), bxgy({ id: 'P2', code: 'PR-2', active: false })],
    day: '2026-08-10',
  });
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped.map((s) => s.reason).join(' '), /نطاق العرض/);
  assert.match(r.skipped.map((s) => s.reason).join(' '), /معطّل/);
});

test('العميل خارج النطاق لا ينال العرض', () => {
  const r = evaluateOrder({
    lines: [line('A', 20)],
    promotions: [bxgy({ scope: { customerCodes: ['C-99'] } })],
    customer: { code: 'C-01' },
  });
  assert.equal(r.applied.length, 0);
  assert.match(r.skipped[0].reason, /العميل خارج/);
});

/* ═══════════════ الدمج والاستهلاك ═══════════════ */

test('دمج المجّانيّات يجعلها بنودًا في الفاتورة', () => {
  const r = evaluateOrder({ lines: [line('A', 20)], promotions: [bxgy()] });
  const merged = mergeFreeLines([line('A', 20)], r.freeLines);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].unitPrice, 0);
  assert.equal(merged[1].qty, 2);
});

test('استهلاك الميزانيّة يُحسب لكلّ عرضٍ على حدة', () => {
  const r = evaluateOrder({ lines: [line('A', 20)], promotions: [bxgy()] });
  const c = budgetConsumption(r);
  assert.equal(c.length, 1);
  assert.equal(c[0].freeUnits, 2);
  assert.equal(c[0].value, 12);
});

test('طلبٌ فارغ أو بلا عروض لا يكسر شيئًا', () => {
  assert.deepEqual(evaluateOrder({}).totals, { discount: 0, freeUnits: 0, freeCost: 0, promosApplied: 0 });
  assert.equal(evaluateOrder({ lines: [line('A', 5)], promotions: [] }).applied.length, 0);
  assert.ok(Object.keys(PROMO_TYPES).length >= 5);
});
