/**
 * حارس إعادة التوازن ‹FNB-804›.
 *
 * أخطر ما يحرسه القيود الثلاثة: **لا يُفرَّغ فرعٌ تحت حدّه** (علاجُ نقصٍ
 * بخلق نقصٍ ليس علاجًا)، و**FEFO يُحترم** فيُنقل الأقرب صلاحيّةً، و**ما لا
 * يكفي مدّة الطريق لا يُنقل** — نقلٌ ينتهي قبل أن يصل هدرٌ مُتعمَّد.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rebalanceSuggestions, rebalanceVerdict, toRebalanceTransfer,
  forecastVsComputed, MIN_SHELF_DAYS_TO_MOVE,
} from './rebalance.js';
import { getSchema } from '../documents/schemas/index.js';

const TODAY = '2026-08-18';

test('★ الفائض ينتقل إلى الناقص — والمقترح يحمل سببه', () => {
  const s = rebalanceSuggestions([
    { branch: 'BR01', sku: 'SAUCE', onHand: 5, minQty: 20, parLevel: 40 },
    { branch: 'BR02', sku: 'SAUCE', onHand: 90, minQty: 20, parLevel: 40, expiry: '2026-09-30' },
  ], { today: TODAY });
  assert.equal(s.length, 1);
  assert.equal(s[0].from, 'BR02');
  assert.equal(s[0].to, 'BR01');
  assert.equal(s[0].qty, 35, 'يُبلّغه سقفه لا حدّه فقط');
  assert.match(s[0].why, /فوق سقفه/);
  assert.match(s[0].why, /تحت حدّه/);
});

test('★★ القيد ①: لا يُفرَّغ فرعٌ تحت حدّه — والمانحُ لا يهبط عن سقفه', () => {
  const positions = [
    { branch: 'BR01', sku: 'X', onHand: 0, minQty: 50, parLevel: 50 },
    { branch: 'BR02', sku: 'X', onHand: 60, minQty: 50, parLevel: 50, expiry: '2026-12-01' },
  ];
  const s = rebalanceSuggestions(positions, { today: TODAY });
  assert.equal(s[0].qty, 10, 'نُقل الفائض فوق السقف وحده');

  // وحارسٌ يرفض نقلًا يخرق الحدّ لو حُرّر يدويًّا.
  const bad = rebalanceVerdict({ sku: 'X', from: 'BR02', to: 'BR01', qty: 30 }, positions, { today: TODAY });
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /تحت حدّه/);
  assert.match(bad.problems[0], /خلق نقصٍ/);
  assert.equal(rebalanceVerdict(s[0], positions, { today: TODAY }).ok, true);
});

test('★★ القيد ②: FEFO — الأقرب صلاحيّةً يُنقل أوّلًا', () => {
  const s = rebalanceSuggestions([
    { branch: 'BR01', sku: 'Y', onHand: 0, minQty: 10, parLevel: 10 },
    { branch: 'BR02', sku: 'Y', onHand: 30, minQty: 5, parLevel: 5, expiry: '2027-01-01' },
    { branch: 'BR03', sku: 'Y', onHand: 30, minQty: 5, parLevel: 5, expiry: '2026-09-05' },
  ], { today: TODAY });
  assert.equal(s[0].from, 'BR03', 'نُقل الأبعد صلاحيّةً أوّلًا فخالف FEFO');
  assert.equal(s[0].expiry, '2026-09-05');
});

test('★★ القيد ③: ما لا يكفي مدّة الطريق لا يُنقل — هدرٌ مُتعمَّد', () => {
  const positions = [
    { branch: 'BR01', sku: 'Z', onHand: 0, minQty: 10, parLevel: 10 },
    { branch: 'BR02', sku: 'Z', onHand: 30, minQty: 5, parLevel: 5, expiry: '2026-08-19' }, // يومٌ واحد
  ];
  assert.deepEqual(rebalanceSuggestions(positions, { today: TODAY, transitDays: 2 }), []);
  const v = rebalanceVerdict({ sku: 'Z', from: 'BR02', to: 'BR01', qty: 5 }, positions, { today: TODAY, transitDays: 2 });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /هدرٌ مُتعمَّد/);
  assert.equal(MIN_SHELF_DAYS_TO_MOVE, 3);
});

test('بلا فائضٍ أو بلا ناقصٍ لا اقتراح — ولا يُخترع نقل', () => {
  assert.deepEqual(rebalanceSuggestions([
    { branch: 'BR01', sku: 'A', onHand: 30, minQty: 10, parLevel: 30 },
    { branch: 'BR02', sku: 'A', onHand: 25, minQty: 10, parLevel: 30 },
  ], { today: TODAY }), []);
  assert.deepEqual(rebalanceSuggestions([], { today: TODAY }), []);
});

test('★ المقترح يخرج طلب نقلٍ بالسلسلة القائمة — لا مسارَ ثانٍ', () => {
  const s = rebalanceSuggestions([
    { branch: 'BR01', sku: 'SAUCE', onHand: 0, minQty: 10, parLevel: 10 },
    { branch: 'BR02', sku: 'SAUCE', onHand: 30, minQty: 5, parLevel: 5, expiry: '2026-12-01' },
  ], { today: TODAY })[0];
  const tr = toRebalanceTransfer(s, { requestDate: TODAY });
  assert.equal(tr.type, 'TR');
  assert.ok(getSchema('TR'), 'المستند مبنيٌّ لا مخترَع');
  assert.equal(tr.header.costCenter, 'BR01', 'الصرف على المستفيد (FNB-103)');
  assert.equal(tr.header.purpose, 'إعادة توازن');
  assert.ok(tr.lines[0].notes, 'المقترح يحمل سببه إلى المستند');
});

test('★ توقّع القطاع مدخلٌ يُقبل ويُقارَن — لا حسابٌ نبتكره', () => {
  const r = forecastVsComputed({ forecastQty: 140, computedRate: 10, days: 7 });
  assert.equal(r.computed, 70);
  assert.equal(r.variancePct, 100);
  assert.match(r.why, /توقّع القطاع 140/);

  // وبلا توقّعٍ يُعمَل بالمحسوب، وبلا تاريخٍ يُعمَل بالتوقّع.
  assert.match(forecastVsComputed({ computedRate: 10 }).why, /يُعمَل بالمحسوب/);
  assert.match(forecastVsComputed({ forecastQty: 50 }).why, /يُعمَل بتوقّع القطاع/);
});
