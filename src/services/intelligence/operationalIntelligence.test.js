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
import { indexPolicies } from './stockPolicy.js';

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

/* ═══════════ ‹FNB-202› السياسة تقود المقترح ═══════════ */

test('★★ الترحيل صفر الأثر: بلا سياسةٍ الرقم كما كان حرفيًّا', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const args = { item: { sku: 'A' }, moves, onHand: 50, today: '2026-08-11', leadDays: 10, safetyDays: 5 };
  const before = replenishmentFor(args);
  const after = replenishmentFor({ ...args, policy: null });
  assert.equal(after.suggestQty, before.suggestQty);
  assert.equal(after.reorderPoint, before.reorderPoint);
});

test('★ السياسة تتقدّم على الوسيطَين العامَّين — والسبب يسمّي مصدرها', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const r = replenishmentFor({
    item: { sku: 'A' }, moves, onHand: 50, today: '2026-08-11',
    leadDays: 10, safetyDays: 5,
    policy: { leadDays: 20, safetyDays: 5, sources: { leadDays: 'brand' } },
  });
  assert.equal(r.leadDays, 20, 'مهلة السياسة لا الوسيط العامّ');
  assert.match(r.why, /التوريد 20/);
  assert.match(r.why, /سياسة brand/);
});

test('★ Par Level سقفٌ يُحترم — لا يُطلب فوق ما يسع الفرع', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const base = { item: { sku: 'A' }, moves, onHand: 0, today: '2026-08-11', leadDays: 10, safetyDays: 5 };
  const free = replenishmentFor(base);
  const capped = replenishmentFor({ ...base, policy: { parLevel: 60, safetyDays: 5, leadDays: 10 } });
  assert.ok(capped.suggestQty < free.suggestQty, 'السقف خفّض المقترح');
  assert.ok(capped.suggestQty <= 60);
  assert.match(capped.why, /سقف الفرع 60/);
});

test('★ الحدّ الأدنى أرضيّةٌ ترفع نقطة إعادة الطلب ولا تخفضها', () => {
  const moves = outMoves('A', 1, 30, '2026-07-12'); // معدّلٌ منخفض ⇒ نقطةٌ صغيرة
  const bare = replenishmentFor({ item: { sku: 'A' }, moves, onHand: 100, today: '2026-08-11', leadDays: 5, safetyDays: 2 });
  const floored = replenishmentFor({
    item: { sku: 'A' }, moves, onHand: 100, today: '2026-08-11', leadDays: 5, safetyDays: 2,
    policy: { minQty: 200, safetyDays: 2, leadDays: 5 },
  });
  assert.ok(floored.reorderPoint >= 200);
  assert.ok(floored.reorderPoint > bare.reorderPoint);
  assert.ok(floored.suggestQty > 0, 'رصيدٌ تحت الأرضيّة يُقترح له');
});

test('★ «بالطريق» تُطرح: ما هو قادمٌ لا يُطلب ثانيةً', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const base = { item: { sku: 'A' }, moves, onHand: 20, today: '2026-08-11', leadDays: 10, safetyDays: 5 };
  const without = replenishmentFor(base);
  const withTransit = replenishmentFor({ ...base, inTransit: 100 });
  assert.ok(withTransit.suggestQty < without.suggestQty);
  assert.equal(withTransit.inTransit, 100);
  assert.match(withTransit.why, /بالطريق 100/);
  // وشحنةٌ كافيةٌ في الطريق تُسكِت الاقتراح تمامًا.
  assert.equal(replenishmentFor({ ...base, inTransit: 5000 }).suggestQty, 0);
});

test('★ أيّام التغطية بندٌ مستقلّ: تغطيةٌ أطول ⇒ كمّيّةٌ أكبر بنفس المهلة والأمان', () => {
  const moves = outMoves('A', 10, 30, '2026-07-12');
  const base = { item: { sku: 'A' }, moves, onHand: 0, today: '2026-08-11', leadDays: 10, safetyDays: 5 };
  const short = replenishmentFor({ ...base, policy: { coverDays: 7, leadDays: 10, safetyDays: 5 } });
  const long = replenishmentFor({ ...base, policy: { coverDays: 30, leadDays: 10, safetyDays: 5 } });
  assert.ok(long.suggestQty > short.suggestQty);
  assert.match(long.why, /التغطية المطلوبة 30/);
});

/* ═══════════ ‹FNB-301› المعادلة على مستوى الفرع ═══════════ */

/** حركات خروجٍ من فرعٍ بعينه — مختومةٌ ببُعده (ختم FNB-104). */
const branchMoves = (sku, perDay, days, branch, from = '2026-07-12') =>
  outMoves(sku, perDay, days, from).map((m) => ({ ...m, from: branch, orgBranch: branch }));

test('★★ فرعان مختلفا الاستهلاك يُقترح لهما رقمان مختلفان لنفس الصنف', () => {
  const moves = [
    ...branchMoves('A', 20, 30, 'BR01'), // فرعٌ نهم
    ...branchMoves('A', 4, 30, 'BR02'),  // وفرعٌ هادئ
  ];
  const balances = [
    { sku: 'A', warehouse: 'BR01', qty: 10 },
    { sku: 'A', warehouse: 'BR02', qty: 10 },
  ];
  const args = { items: [{ sku: 'A' }], moves, balances, today: '2026-08-11', leadDays: 7, safetyDays: 3 };
  const busy = replenishmentPlan({ ...args, branch: 'BR01' })[0];
  const calm = replenishmentPlan({ ...args, branch: 'BR02' })[0];

  assert.ok(busy && calm);
  assert.equal(busy.branch, 'BR01');
  assert.equal(calm.branch, 'BR02');
  assert.ok(busy.rate > calm.rate, 'كلّ فرعٍ بمعدّله هو');
  assert.ok(busy.suggestQty > calm.suggestQty, 'ورقمان مختلفان لنفس الصنف');
});

test('★ رصيد الفرع لا رصيد المنشأة — مخزونُ جارِه لا يُسكِت اقتراحه', () => {
  const moves = branchMoves('A', 20, 30, 'BR01');
  const balances = [
    { sku: 'A', warehouse: 'BR01', qty: 5 },     // الفرع شبه فارغ…
    { sku: 'A', warehouse: 'MAIN', qty: 100000 }, // …والمخزن المركزيّ ممتلئ.
  ];
  const scoped = replenishmentPlan({ items: [{ sku: 'A' }], moves, balances, today: '2026-08-11', branch: 'BR01' })[0];
  assert.ok(scoped, 'الفرع يحتاج ولو امتلأ المركزيّ');
  assert.equal(scoped.onHand, 5);
});

test('★★ الترحيل صفر الأثر: بلا `branch` السلوك القديم حرفيًّا (المنشأة كلّها)', () => {
  const moves = [...branchMoves('A', 10, 30, 'BR01'), ...branchMoves('A', 10, 30, 'BR02')];
  const balances = [{ sku: 'A', warehouse: 'BR01', qty: 50 }, { sku: 'A', warehouse: 'BR02', qty: 50 }];
  const all = replenishmentPlan({ items: [{ sku: 'A' }], moves, balances, today: '2026-08-11' })[0];
  assert.ok(all);
  assert.equal(all.onHand, 100, 'الأرصدة تُجمع كما كانت');
  assert.equal(all.branch, undefined, 'ولا بُعدَ فرعٍ يُضاف بلا طلب');
});

test('★ السياسة و«بالطريق» تدخلان الخطّة — لا وسيطًا عامًّا وحده', () => {
  const moves = branchMoves('A', 10, 30, 'BR01');
  const balances = [{ sku: 'A', warehouse: 'BR01', qty: 10 }];
  const policies = indexPolicies([{ scope: 'branch', scopeCode: 'BR01', sku: 'A', parLevel: 90, leadDays: 6 }]);
  const base = { items: [{ sku: 'A' }], moves, balances, today: '2026-08-11', branch: 'BR01', policies, dims: { branch: 'BR01' } };

  const plain = replenishmentPlan(base)[0];
  assert.equal(plain.leadDays, 6, 'مهلة السياسة');
  assert.equal(plain.parLevel, 90);

  // وشحنةٌ في الطريق تخفض المقترح — وكافيةٌ تُسكِته.
  const withTransit = replenishmentPlan({ ...base, inTransitBySku: new Map([['A', 50]]) })[0];
  assert.ok(withTransit.suggestQty < plain.suggestQty);
  assert.equal(replenishmentPlan({ ...base, inTransitBySku: new Map([['A', 9000]]) }).length, 0);
});

test('فرعٌ بلا تاريخٍ كافٍ يصمت — والحارس القائم يبقى على مستوى الفرع', () => {
  const moves = branchMoves('A', 10, 5, 'BR01'); // خمسة أيّام فقط
  const balances = [{ sku: 'A', warehouse: 'BR01', qty: 0 }];
  assert.deepEqual(replenishmentPlan({ items: [{ sku: 'A' }], moves, balances, today: '2026-07-16', branch: 'BR01' }), []);
});
