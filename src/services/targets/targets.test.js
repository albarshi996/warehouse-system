import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSIONS,
  METRICS,
  SALES_DOC_TYPES,
  blankTarget,
  targetVerdict,
  isWithinPeriod,
  inclusiveDays,
  lineInScope,
  docMatchesDimension,
  visitMatchesDimension,
} from './targetModel.js';
import {
  computeAchievement,
  salesRollup,
  visitsRollup,
  periodPace,
  docDay,
  lineValue,
  computeAll,
  summarize,
  leaderboard,
  STATUS_LABELS,
} from './achievement.js';

const target = (over = {}) => ({
  ...blankTarget(),
  id: 'T1',
  name: 'مستهدف',
  dimension: 'rep',
  dimensionValue: 'u1',
  metric: 'value',
  amount: 1000,
  from: '2026-08-01',
  to: '2026-08-30',
  ...over,
});

const doc = (over = {}) => ({
  id: 'D1',
  type: 'VSI',
  number: 'VSI-1',
  state: 'done',
  header: { createdByUid: 'u1', customerCode: 'C-01', saleDate: '2026-08-05', vehiclePlate: '12-3456' },
  lines: [{ sku: 'A', qty: 10, unitPrice: 50, discount: 0 }],
  ...over,
});

const visit = (over = {}) => ({ state: 'checked_out', day: '2026-08-05', repUid: 'u1', outcome: 'sale', ...over });

/* ═══════════ التواريخ والمدّة ═══════════ */

test('المدّة شاملة الطرفين: يومٌ واحد = ١ لا ٠', () => {
  assert.equal(inclusiveDays('2026-08-01', '2026-08-01'), 1);
  assert.equal(inclusiveDays('2026-08-01', '2026-08-30'), 30);
  assert.equal(inclusiveDays('2026-08-30', '2026-08-01'), null, 'مقلوبة');
});

test('حدود المدّة شاملة', () => {
  const t = target();
  assert.equal(isWithinPeriod(t, '2026-08-01'), true);
  assert.equal(isWithinPeriod(t, '2026-08-30'), true);
  assert.equal(isWithinPeriod(t, '2026-07-31'), false);
  assert.equal(isWithinPeriod(t, '2026-08-31'), false);
});

test('يوم المستند يُقرأ من أوّل حقل تاريخٍ معتبَر', () => {
  assert.equal(docDay(doc()), '2026-08-05');
  assert.equal(docDay({ header: { deliveryDate: '2026-08-09' } }), '2026-08-09');
  assert.equal(docDay({ header: {} }), '');
});

/* ═══════════ التحقّق ═══════════ */

test('★ مقياس زياراتٍ على بُعد صنفٍ يُمنع — لولاه لظهر الإنجاز صفرًا أبدًا', () => {
  const v = targetVerdict(target({ dimension: 'item', dimensionValue: 'A', metric: 'visits' }));
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /لا يصلح لبُعد/);
});

test('البُعد بلا قيمة يُمنع، و«الشركة كلّها» لا تحتاج قيمة', () => {
  assert.equal(targetVerdict(target({ dimensionValue: '' })).ok, false);
  assert.equal(targetVerdict(target({ dimension: 'all', dimensionValue: '' })).ok, true);
});

test('الرقم والمدّة محروسان', () => {
  assert.match(targetVerdict(target({ amount: 0 })).problems.join(' '), /أكبر من صفر/);
  assert.match(targetVerdict(target({ to: '2026-07-01' })).problems.join(' '), /يسبق/);
  assert.match(targetVerdict(target({ metric: 'strike_rate', amount: 120 })).problems.join(' '), /١٠٠/);
});

/* ═══════════ الإسناد ═══════════ */

test('الإسناد بالرأس، وبُعد الشركة يشمل الجميع', () => {
  assert.equal(docMatchesDimension(target(), doc()), true);
  assert.equal(docMatchesDimension(target({ dimensionValue: 'u2' }), doc()), false);
  assert.equal(docMatchesDimension(target({ dimension: 'all' }), doc()), true);
  assert.equal(docMatchesDimension(target({ dimension: 'customer', dimensionValue: 'c-01' }), doc()), true);
});

test('الزيارة لا تُنسب لبُعدٍ لا تحمله', () => {
  assert.equal(visitMatchesDimension(target(), visit()), true);
  assert.equal(visitMatchesDimension(target({ dimension: 'vehicle', dimensionValue: '12-3456' }), visit()), false);
});

test('النطاق الصنفيّ الفارغ يشمل الكلّ', () => {
  assert.equal(lineInScope(target(), { sku: 'Z' }), true);
  assert.equal(lineInScope(target({ scope: { skus: ['A'] } }), { sku: 'B' }), false);
  assert.equal(lineInScope(target({ scope: { categories: ['شامبو'] } }), { sku: 'B', category: 'شامبو' }), true);
});

/* ═══════════ التجميع ═══════════ */

test('المستند غير المنجَز أو خارج المدّة لا يُحتسب', () => {
  const r = salesRollup(target(), [
    doc(),
    doc({ id: 'D2', state: 'approved' }),
    doc({ id: 'D3', header: { ...doc().header, saleDate: '2026-09-05' } }),
  ]);
  assert.equal(r.value, 500);
  assert.equal(r.docs.length, 1);
});

test('★ INV ليست في أنواع المبيعات — وإلّا تضاعف الإيراد', () => {
  assert.ok(!SALES_DOC_TYPES.includes('INV'));
  assert.deepEqual(SALES_DOC_TYPES, ['VSI', 'POD', 'VCS']);
  const r = salesRollup(target(), [doc(), doc({ id: 'D2', type: 'INV' })]);
  assert.equal(r.value, 500, 'الفاتورة لم تُضِف شيئًا');
});

test('★ المجّانيّ يُحتسب كميّةً لا قيمة، ويُعرَض على حدة', () => {
  const withFree = doc({
    lines: [
      { sku: 'A', qty: 10, unitPrice: 50 },
      { sku: 'A', qty: 1, unitPrice: 0, isFree: true },
    ],
  });
  const r = salesRollup(target({ metric: 'qty' }), [withFree]);
  assert.equal(r.qty, 11, 'خرجت إحدى عشرة وحدة فعلًا');
  assert.equal(r.value, 500, 'والقيمة خمسمئة لا خمسمئة وخمسون');
  assert.equal(r.freeQty, 1);
  assert.equal(r.freeCount, 1);
});

test('الخصم يُنقص القيمة ولا يجعلها سالبة', () => {
  assert.equal(lineValue({ qty: 10, unitPrice: 50, discount: 100 }), 400);
  assert.equal(lineValue({ qty: 1, unitPrice: 10, discount: 999 }), 0);
});

test('عدد المتاجر يُحتسب مرّةً لكلّ عميل', () => {
  const r = salesRollup(target({ metric: 'outlets' }), [
    doc(),
    doc({ id: 'D2' }),
    doc({ id: 'D3', header: { ...doc().header, customerCode: 'C-02' } }),
  ]);
  assert.equal(r.outlets, 2);
});

test('بُعد الصنف يُفلتر البنود لا المستندات', () => {
  const mixed = doc({ lines: [{ sku: 'A', qty: 2, unitPrice: 100 }, { sku: 'B', qty: 5, unitPrice: 10 }] });
  const r = salesRollup(target({ dimension: 'item', dimensionValue: 'A' }), [mixed]);
  assert.equal(r.value, 200, 'بند B مستبعَد');
});

test('الزيارات: المنفّذة والمنتجة ونسبة النجاح', () => {
  const r = visitsRollup(target({ metric: 'visits' }), [
    visit(),
    visit({ outcome: 'no_order' }),
    visit({ state: 'planned' }),
    visit({ repUid: 'u2' }),
  ]);
  assert.equal(r.visits, 2);
  assert.equal(r.productive_visits, 1);
  assert.equal(r.strike_rate, 50);
});

/* ═══════════ الإيقاع ═══════════ */

test('★ الإيقاع يفرّق بين ٤٠٪ في اليوم الثالث و٤٠٪ في الثامن والعشرين', () => {
  const t = target({ amount: 1000 });
  const docs = [doc({ lines: [{ sku: 'A', qty: 8, unitPrice: 50 }] })]; // 400

  const early = computeAchievement({ target: t, documents: docs, asOf: '2026-08-03' });
  assert.equal(early.pct, 40);
  assert.ok(early.pacePct > 100, 'متقدّم على الإيقاع');
  assert.equal(early.status, 'on_track');

  const late = computeAchievement({ target: t, documents: docs, asOf: '2026-08-28' });
  assert.equal(late.pct, 40, 'النسبة نفسها');
  assert.ok(late.pacePct < 80, 'لكنّ الإيقاع كارثيّ');
  assert.equal(late.status, 'behind');
});

test('الإيقاع محصور بين البداية والنهاية', () => {
  const t = target();
  assert.equal(periodPace(t, '2026-07-01').elapsedDays, 0, 'قبل البداية');
  assert.equal(periodPace(t, '2026-09-30').elapsedDays, 30, 'بعد النهاية لا يتجاوز المدّة');
  assert.equal(periodPace(t, '2026-08-15').elapsedDays, 15);
});

test('المطلوب يوميًّا والإسقاط يُحسبان من المتبقّي', () => {
  const r = computeAchievement({
    target: target({ amount: 1000 }),
    documents: [doc({ lines: [{ sku: 'A', qty: 4, unitPrice: 50 }] })], // 200
    asOf: '2026-08-10',
  });
  assert.equal(r.achieved, 200);
  assert.equal(r.remaining, 800);
  assert.equal(r.remainingDays, 20);
  assert.equal(r.requiredPerDay, 40);
  assert.equal(r.projection, 600, '٢٠٠ في ثلث المدّة ⇒ ٦٠٠ في كلّها');
});

test('بلوغ الهدف يُنهي الحكم مهما كان الإيقاع', () => {
  const r = computeAchievement({
    target: target({ amount: 100 }),
    documents: [doc()],
    asOf: '2026-08-02',
  });
  assert.equal(r.status, 'achieved');
  assert.ok(r.pct >= 100);
});

test('انتهاء المدّة دون بلوغه = مُفوَّت', () => {
  const r = computeAchievement({ target: target({ amount: 5000 }), documents: [doc()], asOf: '2026-08-30' });
  assert.equal(r.status, 'missed');
  assert.equal(r.remainingDays, 0);
});

test('★ نسبة النجاح لا تُقاس بإيقاعٍ زمنيّ — حالةٌ لا رصيد', () => {
  const t = target({ metric: 'strike_rate', amount: 60 });
  const visits = [visit(), visit({ outcome: 'no_order' })]; // 50%
  const r = computeAchievement({ target: t, visits, asOf: '2026-08-02' });
  assert.equal(r.achieved, 50);
  assert.equal(r.expected, 60, 'المتوقّع هو الهدف نفسه لا نسبةً منه');
  assert.equal(r.requiredPerDay, 0, 'لا يُطالَب بنسبةٍ يوميّة');
});

/* ═══════════ الجمع والترتيب ═══════════ */

test('الحساب الشامل يرتّب الأسوأ إيقاعًا أوّلًا', () => {
  const rows = computeAll({
    targets: [target({ id: 'A', amount: 100 }), target({ id: 'B', amount: 100000 })],
    documents: [doc()],
    asOf: '2026-08-15',
  });
  assert.equal(rows[0].targetId, 'B', 'المتأخّر أوّلًا');
  assert.equal(rows.length, 2);
});

test('المعطّل لا يُحسب', () => {
  const rows = computeAll({ targets: [target({ active: false })], documents: [doc()], asOf: '2026-08-15' });
  assert.equal(rows.length, 0);
});

test('الملخّص يعدّ الحالات', () => {
  const rows = computeAll({
    targets: [target({ id: 'A', amount: 100 }), target({ id: 'B', amount: 100000 })],
    documents: [doc()],
    asOf: '2026-08-15',
  });
  const s = summarize(rows);
  assert.equal(s.total, 2);
  assert.equal(s.achieved, 1);
  assert.equal(s.behind, 1);
  assert.ok(Object.keys(STATUS_LABELS).length === 5);
});

test('لوحة الترتيب تقارن بين متساوين وترتّب بالنسبة', () => {
  const rows = leaderboard({
    baseTarget: target({ amount: 1000 }),
    values: [{ value: 'u1', label: 'مندوب ١' }, { value: 'u2', label: 'مندوب ٢' }],
    documents: [doc(), doc({ id: 'D2', header: { ...doc().header, createdByUid: 'u2' }, lines: [{ sku: 'A', qty: 20, unitPrice: 50 }] })],
    asOf: '2026-08-15',
  });
  assert.equal(rows[0].name, 'مندوب ٢', 'الأعلى إنجازًا أوّلًا');
  assert.equal(rows[0].achieved, 1000);
  assert.equal(rows[1].achieved, 500);
});

test('الأبعاد والمقاييس معرّفة كاملةً', () => {
  assert.ok(Object.keys(DIMENSIONS).length >= 9, 'أبعاد مواصفة المالك كلّها');
  assert.ok(Object.keys(METRICS).length >= 6);
  assert.equal(DIMENSIONS.item.forVisits, false);
  assert.equal(METRICS.visits.source, 'visits');
});

test('مستهدفٌ بلا بيانات لا يكسر شيئًا', () => {
  const r = computeAchievement({ target: target(), asOf: '2026-08-15' });
  assert.equal(r.achieved, 0);
  assert.equal(r.pct, 0);
  assert.equal(computeAll({}).length, 0);
  assert.equal(summarize().total, 0);
});
