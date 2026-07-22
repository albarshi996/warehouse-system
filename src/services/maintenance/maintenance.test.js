/**
 * اختبارات منطق الصيانة الخالص:
 *   - دورة أمر الشغل لا تقبل القفز، والتكهين متاح من الحالات النشطة فقط.
 *   - استحقاق الوقائية بالتاريخ وبالكيلومترات — الأسوأ يحكم.
 *   - MTTR بالساعات ولقطة أوامر الشغل.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_CATEGORIES,
  WO_STATES,
  WO_TRANSITIONS,
  canTransitionWO,
  pmStatus,
  mttrHours,
  woSnapshot,
} from './workOrderModel.js';

test('فئات الأصول الخمس كما في جدول ٣-١', () => {
  assert.deepEqual(Object.keys(ASSET_CATEGORIES), ['handling', 'vehicle', 'cooling', 'facility', 'device']);
  assert.equal(ASSET_CATEGORIES.vehicle.defaultPmKm, 5000);
  assert.equal(ASSET_CATEGORIES.cooling.tempRange, '2°م — 4°م');
});

test('دورة أمر الشغل الرسمية: مسودة→اعتماد→إصلاح→تم→عودة للخدمة', () => {
  assert.ok(canTransitionWO('draft', 'confirmed'));
  assert.ok(canTransitionWO('confirmed', 'in_progress'));
  assert.ok(canTransitionWO('in_progress', 'repaired'));
  assert.ok(canTransitionWO('repaired', 'back_in_service'));
});

test('لا قفز: لا إصلاح من مسودة ولا عودة للخدمة من جارٍ', () => {
  assert.equal(canTransitionWO('draft', 'in_progress'), false);
  assert.equal(canTransitionWO('draft', 'repaired'), false);
  assert.equal(canTransitionWO('in_progress', 'back_in_service'), false);
});

test('التكهين متاح بعد الاعتماد لا قبله، والحالتان الختاميتان نهائيتان', () => {
  assert.equal(canTransitionWO('draft', 'scrapped'), false);
  assert.ok(canTransitionWO('confirmed', 'scrapped'));
  assert.ok(canTransitionWO('in_progress', 'scrapped'));
  assert.deepEqual(WO_TRANSITIONS.back_in_service, []);
  assert.deepEqual(WO_TRANSITIONS.scrapped, []);
});

test('كل انتقال يشير لحالة معرفة', () => {
  for (const [from, tos] of Object.entries(WO_TRANSITIONS)) {
    assert.ok(WO_STATES[from]);
    for (const to of tos) assert.ok(WO_STATES[to]);
  }
});

/* ── استحقاق الوقائية ── */

test('pmStatus بالتاريخ: متأخرة / خلال أسبوع / في المدى', () => {
  assert.equal(pmStatus({ nextPmDate: '2026-07-20' }, '2026-07-22').status, 'overdue');
  assert.equal(pmStatus({ nextPmDate: '2026-07-25' }, '2026-07-22').status, 'due');
  assert.equal(pmStatus({ nextPmDate: '2026-09-01' }, '2026-07-22').status, 'ok');
  assert.equal(pmStatus({}, '2026-07-22').status, 'none');
});

test('pmStatus بالكيلومترات: تجاوز الاستحقاق = متأخرة، وضمن 500كم = قريبة', () => {
  assert.equal(pmStatus({ nextPmKm: 80000, currentKm: 81000 }, '2026-07-22').status, 'overdue');
  assert.equal(pmStatus({ nextPmKm: 80000, currentKm: 79700 }, '2026-07-22').status, 'due');
  assert.equal(pmStatus({ nextPmKm: 80000, currentKm: 70000 }, '2026-07-22').status, 'ok');
});

test('pmStatus: الأسوأ بين التاريخ والكيلومترات يحكم (٣-١: كل 5000كم أو 3 أشهر)', () => {
  const s = pmStatus(
    { nextPmDate: '2026-12-01', nextPmKm: 80000, currentKm: 81000 },
    '2026-07-22'
  );
  assert.equal(s.status, 'overdue');
  assert.equal(s.kmLeft, -1000);
});

/* ── المؤشرات ── */

test('MTTR بالساعات: متوسط (الإصلاح − الاعتماد)', () => {
  const h = 3600000;
  const mttr = mttrHours([
    { confirmedAtMs: 0, repairedAtMs: 2 * h },
    { confirmedAtMs: 10 * h, repairedAtMs: 14 * h },
    { confirmedAtMs: 5 * h, repairedAtMs: 0 }, // ناقص — خارج القياس
  ]);
  assert.equal(mttr, 3);
  assert.equal(mttrHours([]), null);
});

test('woSnapshot: يعدّ المفتوح والعالي الخطورة وتكاليف القطع', () => {
  const snap = woSnapshot([
    { state: 'confirmed', priority: 'high', partsCost: 120 },
    { state: 'in_progress', priority: 'low', partsCost: 80 },
    { state: 'back_in_service', priority: 'high' },
  ]);
  assert.equal(snap.total, 3);
  assert.equal(snap.open, 2);
  assert.equal(snap.highOpen, 1);
  assert.equal(snap.partsCost, 200);
});
