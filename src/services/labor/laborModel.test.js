/**
 * اختبارات منطق عمالة الشحن والتفريغ — حالات المهمّة، المدّة، الإنتاجيّة، التخطيط.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canTransitionTask,
  taskDurationMinutes,
  throughputPerWorkerHour,
  crewsNeeded,
  summarizeTasks,
  crewSize,
  LABOR_SHIFTS,
  ORDER_TYPES,
} from './laborModel.js';

test('آلة الحالة: لا قفز صامت للمراحل', () => {
  assert.equal(canTransitionTask('pending', 'in_progress'), true);
  assert.equal(canTransitionTask('pending', 'done'), false);
  assert.equal(canTransitionTask('in_progress', 'paused'), true);
  assert.equal(canTransitionTask('paused', 'in_progress'), true);
  assert.equal(canTransitionTask('done', 'in_progress'), false);
});

test('المدّة الصافية تطرح فترات التوقّف', () => {
  const dur = taskDurationMinutes({ seconds: 1000 }, { seconds: 4600 }, 600000);
  assert.equal(dur, 50, '60 دقيقة ناقص 10 دقائق توقّف');
  assert.equal(taskDurationMinutes(null, { seconds: 100 }), 0);
  assert.equal(taskDurationMinutes({ seconds: 200 }, { seconds: 100 }), 0, 'نهاية قبل بداية = 0');
});

test('الإنتاجيّة: وحدة لكل عاملٍ لكل ساعة', () => {
  assert.equal(throughputPerWorkerHour(120, 4, 60), 30);
  assert.equal(throughputPerWorkerHour(0, 4, 60), 0);
  assert.equal(throughputPerWorkerHour(120, 0, 60), 0);
});

test('تخطيط الموارد: عدد الفرق المطلوبة يقرّب لأعلى', () => {
  assert.equal(crewsNeeded(1000, 25, 5, 8), 1, 'سعة الفريق = 25×5×8 = 1000');
  assert.equal(crewsNeeded(1001, 25, 5, 8), 2);
  assert.equal(crewsNeeded(1000, 0, 5, 8), 0, 'بلا إنتاجيّة = 0');
});

test('crewSize يحسب الأعضاء + سائق الفرك', () => {
  assert.equal(crewSize({ members: ['a', 'b'], forkliftDriver: { name: 'س' } }), 3);
  assert.equal(crewSize({ members: ['a', 'b'] }), 2);
  assert.equal(crewSize(null), 0);
});

test('summarizeTasks يجمّع الحالات والإنتاجيّة والورديات', () => {
  const crews = { c1: { shift: 'صباحية', members: ['a', 'b', 'c'], forkliftDriver: { name: 'س' } } };
  const tasks = [
    { state: 'done', crewId: 'c1', unitsHandled: 120, startedAt: { seconds: 1000 }, finishedAt: { seconds: 4600 }, pausedMs: 0 },
    { state: 'in_progress', crewId: 'c1' },
  ];
  const s = summarizeTasks(tasks, crews);
  assert.equal(s.doneCount, 1);
  assert.equal(s.byState.in_progress, 1);
  assert.equal(s.avgDurationMinutes, 60);
  assert.equal(s.avgThroughput, 30, '120 / (4 عمّال × ساعة)');
  assert.equal(s.byShift['صباحية'].units, 120);
});

test('الثوابت: الورديات وأنواع الأوامر مربوطة بأنواع المستندات', () => {
  assert.ok(LABOR_SHIFTS.includes('صباحية'));
  assert.equal(ORDER_TYPES.receipt.docType, 'GRN');
  assert.equal(ORDER_TYPES.transfer.docType, 'TRN');
  assert.equal(ORDER_TYPES.delivery.docType, 'DN');
});
