/**
 * اختبارات منطق عمليات الأسطول الخالص:
 *   - آلة حالات الرحلة لا تسمح بقفز المراحل (لا POD قبل الانطلاق).
 *   - بروتوكول التسليم اليومي يمنع: وقود دون الربع · حرارة تبريد خارج
 *     النطاق · بنود غير مفحوصة · ملاحظة بلا وصف.
 *   - رياضيات الوقود: كم/لتر، تكلفة الكيلومتر، وتنبيه انحراف الـ15%.
 *   - مؤشرات POD وOTIF ولقطة الأسطول.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIP_STATES,
  TRIP_TRANSITIONS,
  canTransitionTrip,
  ZONES,
  zoneById,
  HANDOVER_ITEMS,
  emptyHandover,
  handoverVerdict,
  handoverDocId,
  fuelStats,
  fuelAnomaly,
  fuelTotals,
  tripSnapshot,
  podRate,
  otifRate,
} from './fleetModel.js';

/* ── آلة حالات الرحلة ── */

test('دورة الرحلة الكاملة تمر بالترتيب الرسمي فقط', () => {
  assert.ok(canTransitionTrip('preparing', 'gatepass'));
  assert.ok(canTransitionTrip('gatepass', 'enroute'));
  assert.ok(canTransitionTrip('enroute', 'delivered'));
  assert.ok(canTransitionTrip('delivered', 'closed'));
});

test('لا قفز للمراحل: لا POD من التحضير ولا إقفال من الطريق', () => {
  assert.equal(canTransitionTrip('preparing', 'delivered'), false);
  assert.equal(canTransitionTrip('preparing', 'enroute'), false);
  assert.equal(canTransitionTrip('enroute', 'closed'), false);
  assert.equal(canTransitionTrip('gatepass', 'delivered'), false);
});

test('الإلغاء من التحضير فقط — بعد تصريح البوابة لا رجعة', () => {
  assert.ok(canTransitionTrip('preparing', 'cancelled'));
  assert.equal(canTransitionTrip('gatepass', 'cancelled'), false);
  assert.equal(canTransitionTrip('enroute', 'cancelled'), false);
});

test('المقفلة والملغاة نهائيتان', () => {
  assert.deepEqual(TRIP_TRANSITIONS.closed, []);
  assert.deepEqual(TRIP_TRANSITIONS.cancelled, []);
});

test('كل حالة انتقال معرّفة في قاموس الحالات', () => {
  for (const [from, tos] of Object.entries(TRIP_TRANSITIONS)) {
    assert.ok(TRIP_STATES[from], `حالة ${from} غير معرفة`);
    for (const to of tos) assert.ok(TRIP_STATES[to], `حالة ${to} غير معرفة`);
  }
});

/* ── مناطق التوزيع ── */

test('مناطق التوزيع الثلاث كما في المرجع (٢-٤)', () => {
  assert.equal(ZONES.length, 3);
  assert.equal(zoneById('A').vehicle, 'شاحنة مبردة كبيرة');
  assert.equal(zoneById('C').freq, 'مرة أسبوعياً');
  assert.equal(zoneById('X'), null);
});

/* ── بروتوكول التسليم اليومي ── */

function validHandover() {
  const h = emptyHandover('2026-07-22', 'صباحية');
  h.fromDriver = 'سالم';
  h.toDriver = 'خالد';
  h.odometer = '76800';
  h.fuelLevel = 'half';
  for (const it of HANDOVER_ITEMS) {
    if (it.type === 'check') h.items[it.id] = { status: 'سليم', notes: '' };
  }
  return h;
}

test('نموذج مكتمل يجيز إصدار تصريح البوابة', () => {
  const v = handoverVerdict(validHandover());
  assert.deepEqual(v, { ok: true, problems: [] });
});

test('وقود أقل من الربع يمنع التسليم (قاعدة ٢-٢ الصريحة)', () => {
  const h = validHandover();
  h.fuelLevel = 'below_q';
  const v = handoverVerdict(h);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes('ربع خزان')));
});

test('مبردة بحرارة خارج 2–4°م تُرفض، وداخله تُقبل', () => {
  const h = validHandover();
  h.refrigerated = true;
  h.tempReading = '7';
  assert.equal(handoverVerdict(h).ok, false);
  h.tempReading = '3';
  assert.equal(handoverVerdict(h).ok, true);
});

test('بند غير مفحوص أو ملاحظة بلا وصف = نموذج ناقص', () => {
  const h1 = validHandover();
  h1.items.lights = { status: '', notes: '' };
  assert.equal(handoverVerdict(h1).ok, false);

  const h2 = validHandover();
  h2.items.tires = { status: 'ملاحظة', notes: '' };
  assert.equal(handoverVerdict(h2).ok, false);
  h2.items.tires.notes = 'تآكل في الأمامي الأيسر';
  assert.equal(handoverVerdict(h2).ok, true);
});

test('معرّف مستند التسليم حتمي من التاريخ والوردية', () => {
  assert.equal(handoverDocId({ date: '2026-07-22', shift: 'صباحية' }), '2026-07-22__صباحية');
  assert.equal(handoverDocId({ date: '', shift: 'صباحية' }), null);
});

/* ── رياضيات الوقود ── */

test('fuelStats: مسافة وكم/لتر وتكلفة كيلومتر', () => {
  const s = fuelStats({ odoBefore: 1000, odoAfter: 1300, liters: 30, cost: 45 });
  assert.equal(s.distanceKm, 300);
  assert.equal(s.kmPerLiter, 10);
  assert.equal(s.costPerKm, 0.15);
});

test('fuelStats: عداد راجع للخلف أو ثابت = قيد غير قابل للحساب', () => {
  assert.equal(fuelStats({ odoBefore: 1300, odoAfter: 1000, liters: 30 }), null);
  assert.equal(fuelStats({ odoBefore: 1000, odoAfter: 1000, liters: 30 }), null);
});

test('تنبيه الانحراف يطلق فوق 15% فقط (قاعدة ٢-٥)', () => {
  // القياسي 10 كم/لتر؛ الفعلي 8 = انحراف 20% ⇒ تنبيه.
  assert.equal(fuelAnomaly(8, 10).anomalous, true);
  // الفعلي 9 = انحراف 10% ⇒ لا تنبيه.
  assert.equal(fuelAnomaly(9, 10).anomalous, false);
  // الحد نفسه (15% تمامًا) لا يطلق — النص: «يتجاوز».
  assert.equal(fuelAnomaly(8.5, 10).anomalous, false);
  // بلا خط أساس لا حكم.
  assert.equal(fuelAnomaly(8, null).anomalous, false);
});

test('fuelTotals يجمع اللترات والتكلفة والمسافة ويحسب المتوسطات', () => {
  const t = fuelTotals([
    { liters: 30, cost: 45, distanceKm: 300 },
    { liters: 20, cost: 30, distanceKm: 100, anomalous: true },
  ]);
  assert.equal(t.liters, 50);
  assert.equal(t.cost, 75);
  assert.equal(t.distanceKm, 400);
  assert.equal(t.kmPerLiter, 8);
  assert.equal(t.anomalies, 1);
});

/* ── المؤشرات ── */

test('tripSnapshot يعدّ الحالات ويتجاهل المجهول', () => {
  const snap = tripSnapshot([
    { state: 'enroute' },
    { state: 'enroute' },
    { state: 'closed' },
    { state: 'weird' },
  ]);
  assert.equal(snap.total, 3);
  assert.equal(snap.enroute, 2);
  assert.equal(snap.closed, 1);
});

test('podRate: نسبة الرحلات المنتهية الموثقة بتوقيع', () => {
  assert.equal(podRate([]), null);
  const rate = podRate([
    { state: 'delivered', pod: { receiverName: 'منفذ أ' } },
    { state: 'closed', pod: null },
    { state: 'preparing' }, // لا تدخل في القياس
  ]);
  assert.equal(rate, 0.5);
});

test('otifRate: التسليم في التاريخ المخطط أو قبله', () => {
  const rate = otifRate([
    { state: 'closed', plannedDate: '2026-07-20', deliveredDate: '2026-07-20' },
    { state: 'delivered', plannedDate: '2026-07-20', deliveredDate: '2026-07-22' },
    { state: 'enroute', plannedDate: '2026-07-20' }, // لم تنته — خارج القياس
  ]);
  assert.equal(rate, 0.5);
});
