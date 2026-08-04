import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResponseMetrics, isOverdue } from './taskMetrics.js';
import {
  canAssigneeMove,
  canManagerMove,
  assigneeNextActions,
  toMillis,
  dueMillis,
  TASK_STATUS,
} from './taskShape.js';

const H = 3600 * 1000;
// لحظة مرجعيّة ثابتة للاختبار (2026-08-04 12:00 محلّيًّا يكفي التقريب بالـUTC).
const NOW = Date.parse('2026-08-04T12:00:00');

test('canAssigneeMove: أماميّ فقط، لا للوراء ولا للإلغاء', () => {
  assert.equal(canAssigneeMove('assigned', 'acknowledged'), true);
  assert.equal(canAssigneeMove('assigned', 'in_progress'), true); // تخطٍّ أماميّ مسموح
  assert.equal(canAssigneeMove('in_progress', 'done'), true);
  assert.equal(canAssigneeMove('done', 'in_progress'), false); // للوراء ممنوع
  assert.equal(canAssigneeMove('acknowledged', 'assigned'), false);
  assert.equal(canAssigneeMove('in_progress', 'canceled'), false); // خارج المسار
});

test('canManagerMove: يملك المسار كلّه عدا الثبات على نفس الحالة', () => {
  assert.equal(canManagerMove('done', 'in_progress'), true); // إعادة فتح
  assert.equal(canManagerMove('assigned', 'canceled'), true); // إلغاء
  assert.equal(canManagerMove('assigned', 'assigned'), false);
  assert.equal(canManagerMove('assigned', 'unknown'), false);
});

test('assigneeNextActions: الأزرار حسب الحالة', () => {
  assert.deepEqual(assigneeNextActions('assigned'), ['acknowledged', 'in_progress']);
  assert.deepEqual(assigneeNextActions('in_progress'), ['done']);
  assert.deepEqual(assigneeNextActions('done'), []);
});

test('toMillis: يقبل رقمًا وISO وTimestamp‑شبيهًا', () => {
  assert.equal(toMillis(1000), 1000);
  assert.equal(toMillis('2026-08-04T12:00:00'), NOW);
  assert.equal(toMillis({ toMillis: () => 5000 }), 5000);
  assert.equal(toMillis({ seconds: 2 }), 2000);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('نصّ فاسد'), null);
});

test('dueMillis: غياب الوقت يجعله نهاية اليوم لا بدايته', () => {
  const noon = dueMillis('2026-08-04', '12:00');
  const endDay = dueMillis('2026-08-04');
  assert.equal(noon, Date.parse('2026-08-04T12:00:00'));
  assert.equal(endDay, Date.parse('2026-08-04T23:59:00'));
  assert.ok(endDay > noon);
  assert.equal(dueMillis(''), null);
});

test('isOverdue: غير المنجَزة المتجاوِزة استحقاقها فقط', () => {
  assert.equal(isOverdue({ status: 'in_progress', dueDate: '2026-08-01' }, NOW), true);
  assert.equal(isOverdue({ status: 'in_progress', dueDate: '2026-08-10' }, NOW), false);
  assert.equal(isOverdue({ status: 'done', dueDate: '2026-08-01' }, NOW), false); // منجَزة لا تتأخّر
  assert.equal(isOverdue({ status: 'canceled', dueDate: '2026-08-01' }, NOW), false);
  assert.equal(isOverdue({ status: 'assigned' }, NOW), false); // بلا استحقاق
});

test('computeResponseMetrics: معدّلات الاستجابة والإنجاز والالتزام', () => {
  const created = Date.parse('2026-08-04T08:00:00'); // قبل NOW بأربع ساعات
  const tasks = [
    // منجَزة في وقتها: اطّلع بعد ساعة، أنجز بعد ساعتين، الاستحقاق نهاية اليوم
    { assigneeUid: 'u1', assigneeName: 'سالم', status: 'done', dueDate: '2026-08-04',
      createdAtMs: created, acknowledgedAtMs: created + 1 * H, doneAtMs: created + 2 * H },
    // قيد التنفيذ (استجاب لكن لم يُنجز)، متأخّرة الاستحقاق
    { assigneeUid: 'u1', assigneeName: 'سالم', status: 'in_progress', dueDate: '2026-08-01',
      createdAtMs: created, acknowledgedAtMs: created + 3 * H, doneAtMs: null },
    // مُسندة لم يستجب لها بعد
    { assigneeUid: 'u1', assigneeName: 'سالم', status: 'assigned', dueDate: '2026-08-10',
      createdAtMs: created, acknowledgedAtMs: null, doneAtMs: null },
    // ملغاة — تُستبعد من كل المقامات
    { assigneeUid: 'u1', assigneeName: 'سالم', status: 'canceled', dueDate: '2026-08-04',
      createdAtMs: created, acknowledgedAtMs: null, doneAtMs: null },
    // مستخدم آخر: منجَزة لكن متأخّرة عن موعدها
    { assigneeUid: 'u2', assigneeName: 'ليلى', status: 'done', dueDate: '2026-08-02',
      createdAtMs: created, acknowledgedAtMs: created + 0.5 * H, doneAtMs: created + 4 * H },
  ];

  const { overall, perUser } = computeResponseMetrics(tasks, NOW);

  const salem = perUser.find((u) => u.assigneeUid === 'u1');
  assert.equal(salem.total, 4);
  assert.equal(salem.active, 3); // بلا الملغاة
  assert.equal(salem.canceled, 1);
  assert.equal(salem.done, 1);
  assert.equal(salem.responded, 2); // done + in_progress (المُسندة لا تُحسب)
  assert.equal(salem.responseRate, 67); // 2 من 3
  assert.equal(salem.completionRate, 33); // 1 من 3
  assert.equal(salem.onTimeRate, 100); // المنجَزة الوحيدة كانت في وقتها
  assert.equal(salem.overdue, 1); // in_progress المتأخّرة
  assert.equal(salem.avgAckHours, 2); // متوسّط (1 + 3) ÷ 2
  assert.equal(salem.avgDoneHours, 2);

  const layla = perUser.find((u) => u.assigneeUid === 'u2');
  assert.equal(layla.onTimeRate, 0); // أنجزت متأخّرةً عن 08-02

  // العامّ: 5 مهام، 2 منجَزة، 1 ملغاة ⇒ 4 محسوبة
  assert.equal(overall.total, 5);
  assert.equal(overall.active, 4);
  assert.equal(overall.done, 2);
  // الترتيب: الأكثر مهامًّا أولًا (u1=4 قبل u2=1)
  assert.equal(perUser[0].assigneeUid, 'u1');
});

test('computeResponseMetrics: قائمة فارغة لا تنهار', () => {
  const { overall, perUser } = computeResponseMetrics([], NOW);
  assert.equal(overall.total, 0);
  assert.equal(overall.responseRate, 0);
  assert.deepEqual(perUser, []);
});

test('TASK_STATUS ثابت لا يتبدّل صمتًا', () => {
  assert.equal(TASK_STATUS.DONE, 'done');
  assert.equal(TASK_STATUS.IN_PROGRESS, 'in_progress');
});
