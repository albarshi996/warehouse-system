import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCoords,
  haversineMeters,
  withinFence,
  fenceVerdict,
  routeDistanceMeters,
  centroid,
  toKm,
  DEFAULT_FENCE_RADIUS_M,
} from './geo.js';
import {
  isDueOn,
  visitsDueOn,
  planCompliance,
  coverageGaps,
  weekdayOf,
  weeksBetween,
  parseDay,
  FREQUENCIES,
} from './journeyPlan.js';
import {
  canTransitionVisit,
  visitDurationMinutes,
  visitVerdict,
  summarizeVisits,
  invoiceGuard,
  stampMs,
  VISIT_TRANSITIONS,
  VISIT_OUTCOMES,
  VISIT_TYPES,
  DEFAULT_VISIT_TYPE,
  visitTypeOf,
  isVisitProductive,
} from './visitModel.js';

/* ═══════════════════ الجغرافيا ═══════════════════ */

const SHOP = { lat: 32.1167, lng: 20.0667 }; // بنغازي

test('الإحداثيّة الصفريّة مرفوضة — «لا موقع» متنكّرًا', () => {
  assert.equal(isValidCoords({ lat: 0, lng: 0 }), false);
  assert.equal(isValidCoords(SHOP), true);
  assert.equal(isValidCoords({ lat: 91, lng: 20 }), false);
  assert.equal(isValidCoords({ lat: 'x', lng: 20 }), false);
});

test('المسافة تُحسب بهافرساين وتُعيد null لا صفرًا عند الإحداثيّة الفاسدة', () => {
  assert.equal(haversineMeters(SHOP, SHOP), 0);
  assert.equal(haversineMeters(SHOP, null), null);
  // درجة عرضٍ واحدة ≈ 111 كم
  const d = haversineMeters({ lat: 32, lng: 20 }, { lat: 33, lng: 20 });
  assert.ok(d > 110000 && d < 112000, `المسافة ${d} خارج المتوقّع`);
});

test('السياج: داخل وخارج', () => {
  assert.equal(withinFence(SHOP, { lat: 32.1168, lng: 20.0668 }, 150), true);
  assert.equal(withinFence(SHOP, { lat: 32.13, lng: 20.09 }, 150), false);
  assert.equal(withinFence(SHOP, null, 150), null);
});

test('حكم السياج: ثلاث نتائج لا اثنتان', () => {
  const inside = fenceVerdict({ customerCoords: SHOP, position: { lat: 32.1168, lng: 20.0668, accuracy: 10 } });
  assert.equal(inside.status, 'inside');
  assert.equal(inside.blocking, false);

  const outside = fenceVerdict({ customerCoords: SHOP, position: { lat: 32.15, lng: 20.1, accuracy: 10 } });
  assert.equal(outside.status, 'outside');
  assert.equal(outside.blocking, true);

  assert.equal(fenceVerdict({ customerCoords: null, position: SHOP }).status, 'unverified');
  assert.equal(fenceVerdict({ customerCoords: SHOP, position: null }).status, 'unverified');
});

test('قراءةٌ رديئة الدقّة لا تحسم السياج — ولا تُعدّ خرقًا', () => {
  const v = fenceVerdict({
    customerCoords: SHOP,
    position: { lat: 32.15, lng: 20.1, accuracy: 900 },
    radiusM: 150,
  });
  assert.equal(v.status, 'unverified');
  assert.equal(v.blocking, false, 'الجهل ليس إدانة');
  assert.match(v.reason, /دقّة/);
});

test('السياج غير المُلزِم لا يحجب', () => {
  const v = fenceVerdict({ customerCoords: SHOP, position: { lat: 32.2, lng: 20.2, accuracy: 5 }, enforce: false });
  assert.equal(v.status, 'outside');
  assert.equal(v.blocking, false);
});

test('مسافة خطّ السير تتخطّى النقاط الفاسدة ولا تنكسر', () => {
  const d = routeDistanceMeters([{ lat: 32, lng: 20 }, null, { lat: 32.1, lng: 20 }]);
  assert.ok(d > 11000 && d < 11200, `المسافة ${d}`);
  assert.equal(routeDistanceMeters([]), 0);
  assert.equal(toKm(11100), 11.1);
});

test('المركز يُحسب من الصالح وحده', () => {
  assert.deepEqual(centroid([{ lat: 32, lng: 20 }, { lat: 34, lng: 22 }]), { lat: 33, lng: 21 });
  assert.equal(centroid([null, { lat: 0, lng: 0 }]), null);
});

/* ═══════════════════ خطّة الزيارات ═══════════════════ */

// 2026-08-10 إثنين · 2026-08-08 سبت
test('قراءة اليوم بـUTC ثابتة لا تتزحزح بالمنطقة الزمنيّة', () => {
  assert.equal(weekdayOf('2026-08-10'), 1, 'الإثنين');
  assert.equal(weekdayOf('2026-08-08'), 6, 'السبت');
  assert.equal(parseDay('غير-تاريخ'), null);
  assert.equal(weeksBetween('2026-08-01', '2026-08-15'), 2);
});

const plan = (over = {}) => ({
  id: 'P1',
  active: true,
  frequency: 'weekly',
  weekdays: [6, 1], // السبت والإثنين
  startDate: '2026-08-01',
  repUid: 'u1',
  repName: 'مندوب',
  route: 'خط 1',
  customers: [
    { code: 'c-01', name: 'بقالة الأمل', seq: 2 },
    { code: 'C-02', name: 'سوبرماركت النور', seq: 1 },
  ],
  ...over,
});

test('الاستحقاق: اليوم من أيّام الخطّة', () => {
  assert.equal(isDueOn(plan(), '2026-08-10'), true, 'إثنين');
  assert.equal(isDueOn(plan(), '2026-08-11'), false, 'ثلاثاء');
  assert.equal(isDueOn(plan({ active: false }), '2026-08-10'), false);
});

test('الاستحقاق لا يسبق تاريخ البدء', () => {
  assert.equal(isDueOn(plan({ startDate: '2026-09-01' }), '2026-08-10'), false);
});

test('كلّ أسبوعين تستحقّ في الأسابيع الزوجيّة وحدها', () => {
  const p = plan({ frequency: 'biweekly', startDate: '2026-08-01', weekdays: [6] });
  assert.equal(FREQUENCIES.biweekly.weeks, 2);
  assert.equal(isDueOn(p, '2026-08-01'), true, 'الأسبوع 0');
  assert.equal(isDueOn(p, '2026-08-08'), false, 'الأسبوع 1');
  assert.equal(isDueOn(p, '2026-08-15'), true, 'الأسبوع 2');
});

test('زيارات اليوم مرتّبة بتسلسل خطّ السير وموحّدة الرموز', () => {
  const rows = visitsDueOn([plan()], '2026-08-10');
  assert.deepEqual(rows.map((r) => r.customerCode), ['C-02', 'C-01']);
  assert.equal(rows[0].seq, 1);
});

test('العميل المكرّر في خطّتين يظهر مرّة واحدة', () => {
  const rows = visitsDueOn([plan(), plan({ id: 'P2' })], '2026-08-10');
  assert.equal(rows.length, 2);
});

test('الالتزام يفصل المنفَّذ عن الفائت عن الزائد', () => {
  const planned = [{ customerCode: 'C-01' }, { customerCode: 'C-02' }];
  const visits = [
    { customerCode: 'C-01', state: 'checked_out' },
    { customerCode: 'C-09', state: 'checked_out' },
    { customerCode: 'C-02', state: 'checked_in' },
  ];
  const c = planCompliance(planned, visits);
  assert.equal(c.doneCount, 1);
  assert.equal(c.missedCount, 1);
  assert.equal(c.extraCount, 1);
  assert.equal(c.compliancePct, 50);
});

test('فجوات التغطية تكشف المتجر المنسيّ ومن لم يُزَر قطّ', () => {
  const rows = coverageGaps(
    [{ code: 'C-01', nameAr: 'أ' }, { code: 'C-02', nameAr: 'ب' }],
    [{ customerCode: 'C-01', state: 'checked_out', day: '2026-08-09' }],
    { asOf: '2026-08-10', staleDays: 30 }
  );
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
  assert.equal(byCode['C-01'].daysSince, 1);
  assert.equal(byCode['C-01'].stale, false);
  assert.equal(byCode['C-02'].neverVisited, true);
  assert.equal(byCode['C-02'].stale, true);
  assert.equal(rows[0].code, 'C-02', 'المهمَل أوّلًا');
});

/* ═══════════════════ الزيارة ═══════════════════ */

test('آلة الحالة: لا قفز من مخطّطة إلى منتهية', () => {
  assert.equal(canTransitionVisit('planned', 'checked_in'), true);
  assert.equal(canTransitionVisit('planned', 'checked_out'), false);
  assert.equal(canTransitionVisit('checked_in', 'checked_out'), true);
  assert.deepEqual(VISIT_TRANSITIONS.checked_out, []);
});

test('قراءة الختم من صيغه الثلاث', () => {
  assert.equal(stampMs(1000), 1000);
  assert.equal(stampMs({ seconds: 5 }), 5000);
  assert.equal(stampMs(new Date(7000)), 7000);
  assert.equal(stampMs(null), null);
});

test('المدّة تُحسب من ختمَي الخادم، وتُرفض إن انعكس الترتيب', () => {
  assert.equal(visitDurationMinutes({ seconds: 0 }, { seconds: 600 }), 10);
  assert.equal(visitDurationMinutes({ seconds: 600 }, { seconds: 0 }), null);
  assert.equal(visitDurationMinutes(null, { seconds: 600 }), null);
});

const goodVisit = (over = {}) => ({
  state: 'checked_out',
  customerCoords: SHOP,
  checkInPosition: { lat: 32.1168, lng: 20.0668, accuracy: 8 },
  checkOutPosition: { lat: 32.1168, lng: 20.0668, accuracy: 8 },
  checkInAt: { seconds: 0 },
  checkOutAt: { seconds: 900 },
  outcome: 'sale',
  ...over,
});

test('زيارة سليمة: بلا ملاحظات', () => {
  const v = visitVerdict(goodVisit());
  assert.deepEqual(v.flags, []);
  assert.equal(v.valid, true);
  assert.equal(v.durationMinutes, 15);
  assert.equal(v.fenceStatus, 'inside');
});

test('الزيارة القصيرة أو خارج السياج تُوسَم ولا تُمحى', () => {
  const short = visitVerdict(goodVisit({ checkOutAt: { seconds: 60 } }));
  assert.equal(short.counted, true, 'تُحتسب');
  assert.equal(short.valid, false, 'موسومة');
  assert.match(short.flags.join(' '), /مدّة المكوث/);

  const far = visitVerdict(goodVisit({ checkInPosition: { lat: 32.2, lng: 20.2, accuracy: 8 } }));
  assert.equal(far.counted, true);
  assert.match(far.flags.join(' '), /خارج النطاق/);
});

test('الانصراف من مكانٍ بعيد عن الحضور يُوسَم', () => {
  const v = visitVerdict(goodVisit({ checkOutPosition: { lat: 32.2, lng: 20.2, accuracy: 8 } }));
  assert.match(v.flags.join(' '), /الانصراف سُجّل/);
});

test('«لم تُنفَّذ» بلا سبب تُوسَم، ولا تُحتسب زيارةً', () => {
  const v = visitVerdict({ state: 'skipped' });
  assert.equal(v.counted, false);
  assert.match(v.flags.join(' '), /بلا سببٍ مكتوب/);
  assert.deepEqual(visitVerdict({ state: 'skipped', skipReason: 'المتجر مغلق' }).flags, []);
});

test('الملخّص يفرّق بين من يمرّ ومن يبيع', () => {
  const s = summarizeVisits([
    goodVisit(),
    goodVisit({ outcome: 'no_order' }),
    { state: 'planned' },
    { state: 'skipped', skipReason: 'مغلق' },
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.done, 2);
  assert.equal(s.productive, 1);
  assert.equal(s.strikeRate, 50);
  assert.equal(s.avgMinutes, 15);
});

test('حارس الفاتورة: لا فاتورة بلا زيارةٍ مفتوحة', () => {
  const g = invoiceGuard({ visit: { state: 'planned' } });
  assert.equal(g.ok, false);
  assert.equal(g.blocking, true);
});

test('حارس الفاتورة يمنع المؤكَّد خارجًا ويسمح لما لا يُحسم', () => {
  const open = { state: 'checked_in', customerCoords: SHOP };

  const outside = invoiceGuard({ visit: open, position: { lat: 32.2, lng: 20.2, accuracy: 8 } });
  assert.equal(outside.ok, false);
  assert.equal(outside.blocking, true);

  // إرسالٌ ضعيف: لا يُحسم فلا يُمنع — وإلّا بيع المندوب خارج النظام
  const weak = invoiceGuard({ visit: open, position: { lat: 32.2, lng: 20.2, accuracy: 900 } });
  assert.equal(weak.status, 'unverified');
  assert.equal(weak.blocking, false);
  assert.equal(weak.ok, true);

  const inside = invoiceGuard({ visit: open, position: { lat: 32.1168, lng: 20.0668, accuracy: 8 } });
  assert.equal(inside.ok, true);
  assert.equal(DEFAULT_FENCE_RADIUS_M, 150);
});

/* ═══════════ أنواع الزيارة (م٥-ب · تسدّ ف‑١١) ═══════════ */

test('★★ الترحيل: زيارةٌ بلا نوعٍ تُعامَل «بيع وتحصيل» — سلوك اليوم حرفيًّا', () => {
  assert.equal(visitTypeOf({}), 'sell_collect');
  assert.equal(visitTypeOf({ visitType: '' }), 'sell_collect');
  assert.equal(visitTypeOf({ visitType: 'نوع مخترع' }), 'sell_collect');
  assert.equal(DEFAULT_VISIT_TYPE, 'sell_collect');

  // والاحتساب لم يتغيّر لها: البيع والتحصيل منتجان وما عداهما لا.
  assert.equal(isVisitProductive({ outcome: 'sale' }), true);
  assert.equal(isVisitProductive({ outcome: 'collection' }), true);
  assert.equal(isVisitProductive({ outcome: 'no_order' }), false);
  assert.equal(isVisitProductive({ outcome: 'closed' }), false);
});

test('★★ زيارة الخدمة لم تعد تُحتسب فاشلة — وهي الفجوة ف‑١١ بعينها', () => {
  const service = { visitType: 'service', outcome: 'no_order' };
  assert.equal(isVisitProductive(service), true, 'أدّت غرضها');
  assert.equal(isVisitProductive({ visitType: 'service', outcome: 'service_done' }), true);

  // ونفس النتيجة في زيارة بيعٍ تعني فشلًا — فالمقياس بالغرض لا بالنتيجة وحدها.
  assert.equal(isVisitProductive({ visitType: 'sell', outcome: 'no_order' }), false);
});

test('★ ولكلّ نوعٍ نتائجه: التحصيل لا يُرضي زيارة بيعٍ فقط، والعكس', () => {
  assert.equal(isVisitProductive({ visitType: 'sell', outcome: 'collection' }), false);
  assert.equal(isVisitProductive({ visitType: 'collect', outcome: 'sale' }), false);
  assert.equal(isVisitProductive({ visitType: 'collect', outcome: 'collection' }), true);
  assert.equal(isVisitProductive({ visitType: 'sell_collect', outcome: 'collection' }), true, 'والأوسع يقبل الاثنين');
});

test('★ الأنواع أربعةٌ كما في الخطة، وكلٌّ بنتائجه المعرَّفة', () => {
  assert.equal(VISIT_TYPES.length, 4);
  const outcomeIds = new Set(VISIT_OUTCOMES.map((o) => o.id));
  for (const t of VISIT_TYPES) {
    assert.ok(t.labelAr && t.hint, `${t.id} بلا تسميةٍ أو تلميح`);
    assert.ok(t.satisfies.length > 0, `${t.id} بلا نتيجةٍ تُرضيه — نوعٌ لا يُنجَح فيه أبدًا`);
    for (const o of t.satisfies) {
      assert.ok(outcomeIds.has(o), `${t.id} يشير إلى نتيجةٍ غير معرَّفة «${o}»`);
    }
  }
});

test('★★ الملخّص يقيس كلّ زيارةٍ بغرضها، ويُظهر التوزيع بالنوع', () => {
  const visits = [
    { state: 'checked_out', visitType: 'service', outcome: 'no_order' },
    { state: 'checked_out', visitType: 'sell', outcome: 'no_order' },
    { state: 'checked_out', visitType: 'sell', outcome: 'sale' },
  ];
  const s = summarizeVisits(visits);
  assert.equal(s.productive, 2, 'الخدمة نجحت والبيع نجح مرّةً وفشل مرّة');
  assert.equal(s.strikeRate, 67);
  assert.equal(s.byType.service, 1);
  assert.equal(s.byType.sell, 2);
  assert.equal(s.byType.collect, 0);
});
