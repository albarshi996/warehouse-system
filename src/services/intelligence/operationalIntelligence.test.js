/**
 * اختبارات الذكاء التشغيليّ (م‑٩).
 *
 * الاختبار الحاكم: **الصمت خيرٌ من التخمين.** اقتراحٌ من عيّنةٍ صغيرة أسوأ من
 * لا اقتراح، لأنّه يُلبَس ثوب الحساب فيُتَّبع.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_HISTORY_DAYS,
  DUPLICATE_RADIUS_M,
  consumptionRate,
  replenishmentFor,
  replenishmentPlan,
  suggestedOrder,
  optimizeRoute,
  repCompanion,
  findDuplicateStores,
} from './operationalIntelligence.js';

/** حركات خروجٍ لصنفٍ على مدى شهر. */
const outMoves = (sku, perDay, days, from = '2026-07-12') =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    return { sku, qty: perDay, from: 'MAIN', to: null, date: d };
  });

/* ═══════════ ١. الصمت خيرٌ من التخمين ═══════════ */

test('★★ تاريخٌ أقصر من الحدّ ⇒ لا اقتراح إطلاقًا', () => {
  const short = outMoves('A', 10, 5); // خمسة أيّام فقط
  assert.equal(consumptionRate(short, 'A', '2026-07-16').enough, false);
  assert.equal(replenishmentFor({ item: { sku: 'A' }, moves: short, onHand: 0, today: '2026-07-16' }), null);
  assert.equal(MIN_HISTORY_DAYS, 14);
});

test('★★ وصنفٌ بلا حركة خروجٍ لا يُقترح له شيء', () => {
  assert.equal(consumptionRate([], 'A', '2026-08-11').enough, false);
  assert.equal(replenishmentFor({ item: { sku: 'A' }, moves: [], onHand: 0, today: '2026-08-11' }), null);
});

test('صنفٌ بلا كودٍ لا يُحسب', () => {
  assert.equal(replenishmentFor({ item: {}, moves: outMoves('A', 10, 30), today: '2026-08-11' }), null);
});

/* ═══════════ ٢. التزويد التلقائيّ ═══════════ */

test('★★ الاقتراح يحمل سببه — ونظامٌ يقول «اطلب» بلا «لماذا» يُتجاهَل', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const r = replenishmentFor({ item: { sku: 'A', nameAr: 'صنف' }, moves, onHand: 50, today: '2026-08-11', leadDays: 14, safetyDays: 7 });
  assert.ok(r);
  assert.ok(r.rate > 0);
  assert.match(r.why, /تبيع/);
  assert.match(r.why, /التوريد 14/);
  assert.match(r.why, /المتبقّي يكفي/);
});

test('★ نقطة إعادة الطلب = (المعدّل × المهلة) + الأمان', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12'); // ~١٠ يوميًّا
  const r = replenishmentFor({ item: { sku: 'A' }, moves, onHand: 1000, today: '2026-08-11', leadDays: 10, safetyDays: 5 });
  assert.ok(Math.abs(r.reorderPoint - r.rate * 15) < 0.5, 'المهلة عشرةٌ والأمان خمسة');
  assert.equal(r.suggestQty, 0, 'ورصيدٌ كافٍ لا يُطلب له شيء');
});

test('★ والاستعجال يُقاس بأيّام التغطية لا بالكمّيّة', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const now = replenishmentFor({ item: { sku: 'A' }, moves, onHand: 20, today: '2026-08-11', leadDays: 14, safetyDays: 7 });
  assert.equal(now.urgency, 'now', 'يكفي يومين والتوريد ١٤');
  const ok = replenishmentFor({ item: { sku: 'A' }, moves, onHand: 5000, today: '2026-08-11', leadDays: 14, safetyDays: 7 });
  assert.equal(ok.urgency, 'ok');
});

test('★ الخطّة تُخرج ما يحتاج طلبًا فقط، والأقرب نفادًا أوّلًا', () => {
  const moves = [...outMoves('A', 10, 30, '2026-07-12'), ...outMoves('B', 2, 30, '2026-07-12')];
  const plan = replenishmentPlan({
    items: [{ sku: 'A' }, { sku: 'B' }, { sku: 'C' }],
    moves,
    balances: [{ sku: 'A', qty: 20 }, { sku: 'B', qty: 500 }],
    today: '2026-08-11',
    leadDays: 14,
    safetyDays: 7,
  });
  assert.equal(plan[0].sku, 'A', 'الأقرب نفادًا');
  assert.ok(!plan.some((p) => p.sku === 'C'), 'وصنفٌ بلا تاريخٍ لا يظهر');
});

/* ═══════════ ٣. الطلب المقترح ═══════════ */

const saleDoc = (id, code, skus, date) => ({
  id, type: 'VSI', number: `VSI-${id}`, state: 'done',
  header: { customerCode: code, saleDate: date },
  lines: skus.map((s) => ({ sku: s, qty: 10 })),
});

test('★★ الاقتراح من عادة العميل هو، لا من متوسّط السوق', () => {
  const docs = [
    saleDoc('1', 'C-1', ['A', 'B'], '2026-07-01'),
    saleDoc('2', 'C-1', ['A', 'B'], '2026-07-15'),
    saleDoc('3', 'C-1', ['A'], '2026-08-01'),
    saleDoc('4', 'C-2', ['Z'], '2026-08-01'),
  ];
  const s = suggestedOrder({ documents: docs, customerCode: 'C-1' });
  assert.equal(s[0].sku, 'A', 'الأكثر تكرارًا');
  assert.equal(s[0].times, 3);
  assert.match(s[0].why, /٣ مرّات|3 مرّات/);
  assert.ok(!s.some((x) => x.sku === 'Z'), 'وصنف عميلٍ آخر لا يُقترح');
});

test('★★ وزيارةٌ واحدة ليست عادة', () => {
  assert.deepEqual(suggestedOrder({ documents: [saleDoc('1', 'C-1', ['A'], '2026-08-01')], customerCode: 'C-1' }), []);
  assert.deepEqual(suggestedOrder({ documents: [], customerCode: 'C-1' }), []);
  assert.deepEqual(suggestedOrder({ documents: [], customerCode: '' }), []);
});

test('★ والحدّ ثلاث مرّاتٍ افتراضًا — وما دونه لا يُقترح', () => {
  const docs = [saleDoc('1', 'C-1', ['A'], '2026-07-01'), saleDoc('2', 'C-1', ['A'], '2026-07-15')];
  assert.equal(suggestedOrder({ documents: docs, customerCode: 'C-1' }).length, 0);
  assert.equal(suggestedOrder({ documents: docs, customerCode: 'C-1', minTimes: 2 }).length, 1);
});

/* ═══════════ ٤. خطّ السير ═══════════ */

const P = (lat, lng, code) => ({ code, coords: { lat, lng } });

test('★★ الترتيب يُقصّر المسافة ويُخرج الفرق — فيُرى المكسب', () => {
  const start = { lat: 32.0, lng: 20.0 };
  // ترتيبٌ سيّئ عمدًا: بعيدٌ ثمّ قريبٌ ثمّ بعيد.
  const stops = [P(32.09, 20.0, 'FAR'), P(32.01, 20.0, 'NEAR'), P(32.05, 20.0, 'MID')];
  const r = optimizeRoute(start, stops);
  assert.deepEqual(r.order.map((s) => s.code), ['NEAR', 'MID', 'FAR']);
  assert.ok(r.savedM > 0);
  assert.ok(r.savedPct > 0);
  assert.match(r.why, /يوفّر/);
});

test('★ وترتيبٌ أمثل أصلًا لا يُقلب به يوم مندوب', () => {
  const start = { lat: 32.0, lng: 20.0 };
  const stops = [P(32.01, 20.0, 'A'), P(32.02, 20.0, 'B')];
  const r = optimizeRoute(start, stops);
  assert.equal(r.savedM, 0);
  assert.match(r.why, /قريبٌ من الأمثل/);
});

test('محطّةٌ بلا إحداثيّات تُستبعد، وأقلّ من اثنتين لا تُرتَّب', () => {
  const start = { lat: 32.0, lng: 20.0 };
  assert.equal(optimizeRoute(start, [{ code: 'X' }]).order.length, 0);
  assert.equal(optimizeRoute(start, []).order.length, 0);
  assert.equal(optimizeRoute(start, [P(32.01, 20.0, 'A')]).order.length, 1);
});

/* ═══════════ ٥. رفيق المندوب ═══════════ */

test('★★ يُخبر قبل الدخول لا بعد الخروج: كم عليه وماذا يشتري وما التنبيه', () => {
  const docs = [
    saleDoc('1', 'C-1', ['A'], '2026-07-01'),
    saleDoc('2', 'C-1', ['A'], '2026-07-15'),
    saleDoc('3', 'C-1', ['A'], '2026-08-01'),
  ];
  const r = repCompanion({
    customerCode: 'C-1',
    customerName: 'بقالة النور',
    exposure: { balance: 900, available: 100, usedPct: 90, verdict: 'warn' },
    documents: docs,
    visits: [{ customerCode: 'C-1', state: 'checked_out', date: '2026-08-01' }],
    today: '2026-08-11',
  });
  assert.equal(r.balance, 900);
  assert.equal(r.suggestions[0].sku, 'A');
  assert.ok(r.alerts.some((a) => /اقترب من سقفه/.test(a)));
});

test('★ ومن تجاوز سقفه يُنبَّه بالمنع قبل أن يعرض بضاعته', () => {
  const r = repCompanion({ customerCode: 'C-1', exposure: { verdict: 'block' }, documents: [], visits: [] });
  assert.ok(r.alerts.some((a) => /ممنوع/.test(a)));
});

test('★ ومتجرٌ لم يُزَر منذ شهرٍ يكاد يُفقَد', () => {
  const r = repCompanion({
    customerCode: 'C-1',
    documents: [],
    visits: [{ customerCode: 'C-1', state: 'checked_out', date: '2026-06-01' }],
    today: '2026-08-11',
  });
  assert.ok(r.alerts.some((a) => /يكاد يُفقَد/.test(a)));
});

/* ═══════════ ٦. المتاجر المكرّرة ═══════════ */

test('★★ يُبلَّغ ولا يُدمَج — دمجٌ خاطئ يخلط ذمّتَين ولا يُفكّ بسهولة', () => {
  const dups = findDuplicateStores([
    { code: 'C-1', nameAr: 'بقالة النور', phone: '0912345678', coords: { lat: 32.0, lng: 20.0 } },
    { code: 'C-2', nameAr: 'بقالة النور', phone: '0912345678', coords: { lat: 32.0, lng: 20.0 } },
    { code: 'C-3', nameAr: 'بقالة أخرى', phone: '0919999999', coords: { lat: 32.5, lng: 20.5 } },
  ]);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].confidence, 'high', 'ثلاثة أسباب');
  assert.match(dups[0].why, /يُراجَع ولا يُدمَج/);
  assert.ok(dups[0].reasons.length >= 2);
});

test('★ وسببٌ واحد يعني ثقةً منخفضة — متجران في مبنًى واحد قد يكونان اثنين حقًّا', () => {
  const dups = findDuplicateStores([
    { code: 'C-1', nameAr: 'أ', phone: '1', coords: { lat: 32.0, lng: 20.0 } },
    { code: 'C-2', nameAr: 'ب', phone: '2', coords: { lat: 32.0001, lng: 20.0 } },
  ]);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].confidence, 'low');
  assert.ok(dups[0].distanceM <= DUPLICATE_RADIUS_M);
});

test('لا مكرّرَ لا بلاغ، والقائمة الفارغة لا ترمي', () => {
  assert.deepEqual(findDuplicateStores([]), []);
  assert.deepEqual(findDuplicateStores(null), []);
  assert.deepEqual(
    findDuplicateStores([
      { code: 'C-1', nameAr: 'أ', phone: '1', coords: { lat: 32.0, lng: 20.0 } },
      { code: 'C-2', nameAr: 'ب', phone: '2', coords: { lat: 33.0, lng: 21.0 } },
    ]),
    []
  );
});

test('★ وعميلٌ بلا رمزٍ لا يدخل المقارنة', () => {
  assert.deepEqual(findDuplicateStores([{ nameAr: 'أ' }, { nameAr: 'أ' }]), []);
});
