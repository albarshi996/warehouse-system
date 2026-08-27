/**
 * اختبارات مهمّة التحضير — الجسر بين خطّةٍ يعرفها النظام ومحضّرٍ يمشي الممرّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PICKABLE_TYPES,
  PICK_TASK_STATES,
  assignTask,
  closePickTask,
  currentStep,
  fulfillmentGap,
  openPickTask,
  skipStep,
  stepRemaining,
  taskCloseProblem,
  taskOpenProblem,
  taskTotals,
} from './pickingTask.js';

const PICK_DOC = {
  id: 'pick-1', type: 'PICK', number: 'PICK-2026-0021', state: 'approved',
  header: { warehouse: 'MAIN' },
  lines: [
    { sku: 'WNW-001', barcode: '6221', qtyRequested: 24 },
    { sku: 'WNW-002', barcode: '6222', qtyRequested: 10 },
  ],
};

const BALANCES = [
  { sku: 'WNW-001', warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01', batch: 'B2408', expiry: '2027-01-01', qty: 60, qtyReserved: 0 },
  { sku: 'WNW-002', warehouse: 'MAIN', bin: 'MAIN-A01-R02-B01', batch: 'B2409', expiry: '2027-06-01', qty: 10, qtyReserved: 0 },
];
const CTX = { actor: 'المشرف', at: '2026-08-27T08:00:00Z', nowMs: Date.parse('2026-08-27') };

test('★★ المهمّة تُشتقّ من مستندٍ معتمد وتحمل مسار السحب القائم — لا مسارًا ثانيًا', () => {
  const r = openPickTask(PICK_DOC, BALANCES, CTX);
  assert.equal(r.problem, undefined);
  assert.equal(r.task.state, 'OPEN');
  assert.equal(r.task.source.number, 'PICK-2026-0021');
  assert.equal(r.task.warehouse, 'MAIN');
  assert.ok(r.task.steps.length >= 2, 'خطوةٌ لكلّ (موقع × بند)');
  assert.ok(r.task.pathBasis, 'وأساسُ الترتيب يُعلَن ولا يُخمَّن');
  assert.equal(r.task.steps[0].seq, 1, 'الترتيب من المسار');
});

test('🔒 لا تحضير دون مستندٍ معتمد — القاعدة ١', () => {
  assert.match(taskOpenProblem(null, { lines: [1] }), /لا تحضير بلا أمرٍ معتمد/);
  assert.match(taskOpenProblem({ ...PICK_DOC, type: 'GRN' }, { lines: [1] }), /التحضير من/);
  assert.match(taskOpenProblem({ ...PICK_DOC, state: 'draft' }, { lines: [1] }), /حتى يُعتمد/);
  assert.match(taskOpenProblem({ ...PICK_DOC, state: 'canceled' }, { lines: [1] }), /حتى يُعتمد/);
  assert.deepEqual(PICKABLE_TYPES, ['PICK', 'SO', 'TR']);
});

test('★★ النقص لا يمنع المهمّة — يُعلَن معها فيمشي المحضّر عالمًا', () => {
  const thin = [{ ...BALANCES[0], qty: 5 }, BALANCES[1]];
  const r = openPickTask(PICK_DOC, thin, CTX);
  assert.equal(r.problem, undefined, 'تسعُ خطواتٍ صالحةٍ لا توقفها واحدةٌ ناقصة');
  assert.ok(r.task.shortages.length > 0, 'والنقص معلَنٌ لا مخفيّ');
  assert.ok(r.task.shortages[0].shortfall > 0);
});

test('الخطوة الجارية أوّلُ ما لم يكتمل — والمتبقّي يُشتقّ', () => {
  const task = openPickTask(PICK_DOC, BALANCES, CTX).task;
  assert.equal(currentStep(task).seq, 1);
  const half = { ...task, steps: task.steps.map((s, i) => (i === 0 ? { ...s, picked: s.required, state: 'DONE' } : s)) };
  assert.equal(currentStep(half).seq, 2, 'المنفَّذة تُتخطّى');
  assert.equal(stepRemaining({ required: 24, picked: 10 }), 14);
  assert.equal(stepRemaining({ required: 24, picked: 99 }), 0, 'لا يُسالَب');
});

test('★ الإسناد: المسندةُ لغيره لا تُنتزع بلا قرار مشرفٍ صريح', () => {
  const task = openPickTask(PICK_DOC, BALANCES, CTX).task;
  const mine = assignTask(task, { assignee: 'سالم', actor: 'المشرف' });
  assert.equal(mine.task.assignee, 'سالم');

  const steal = assignTask(mine.task, { assignee: 'أحمد', actor: 'المشرف' });
  assert.match(steal.problem, /مسندةٌ إلى «سالم»/);
  assert.equal(assignTask(mine.task, { assignee: 'أحمد', actor: 'المشرف', force: true }).task.assignee, 'أحمد');
  assert.match(assignTask(task, { assignee: '', actor: 'المشرف' }).problem, /بلا محضّر/);
});

test('★★ التخطّي بسببٍ إلزاميّ — الأمر سيخرج ناقصًا ومن يقرأ التقرير يسأل لماذا', () => {
  const task = openPickTask(PICK_DOC, BALANCES, CTX).task;
  assert.match(skipStep(task, 1, { actor: 'سالم' }).problem, /سببًا مكتوبًا/);
  const r = skipStep(task, 1, { reason: 'الرفّ فارغٌ فعلًا — البضاعة لم تصل', actor: 'سالم' });
  assert.equal(r.task.steps[0].state, 'SKIPPED');
  assert.match(r.task.steps[0].skipReason, /الرفّ فارغ/);
  assert.match(skipStep(task, 99, { reason: 'س', actor: 'سالم' }).problem, /ليست في هذه المهمّة/);
});

test('🔒 لا إقفال على خطوةٍ منسيّة — النقص المجهول السبب أسوأ من النقص', () => {
  const task = openPickTask(PICK_DOC, BALANCES, CTX).task;
  const p = taskCloseProblem(task);
  assert.match(p, /لم تُنفَّذ ولم تُتخطَّ/);
  assert.match(p, /مجهول السبب/);

  const allDone = { ...task, steps: task.steps.map((s) => ({ ...s, picked: s.required, state: 'DONE' })) };
  assert.equal(taskCloseProblem(allDone), '');
  const closed = closePickTask(allDone, { actor: 'سالم', at: CTX.at });
  assert.equal(closed.task.state, 'DONE');
  assert.match(closePickTask(closed.task, { actor: 'سالم' }).problem, /لا تُقفل مرّتين/);
  assert.equal(PICK_TASK_STATES.DONE, 'منفَّذة');
});

test('الخلاصة تُشتقّ لحظيًّا: المطلوب والمسحوب والنسبة', () => {
  const task = openPickTask(PICK_DOC, BALANCES, CTX).task;
  const half = { ...task, steps: task.steps.map((s, i) => (i === 0 ? { ...s, picked: s.required, state: 'DONE' } : s)) };
  const t = taskTotals(half);
  assert.equal(t.required, 34);
  assert.equal(t.doneSteps, 1);
  assert.ok(t.percent > 0 && t.percent < 100);
});

test('★★ فرقُ التنفيذ يجمع المطلوب والمسحوب بأسباب التخطّي — منه يُبنى الـBack Order', () => {
  const task = openPickTask(PICK_DOC, BALANCES, CTX).task;
  const partial = {
    ...task,
    steps: task.steps.map((s, i) =>
      i === 0
        ? { ...s, picked: 10, state: 'SKIPPED', skipReason: 'الباقي تالفٌ على الرفّ' }
        : { ...s, picked: s.required, state: 'DONE' }
    ),
  };
  const gap = fulfillmentGap(partial);
  assert.equal(gap.length, 1, 'الصنف المكتمل لا يظهر فرقًا');
  assert.equal(gap[0].sku, 'WNW-001');
  assert.equal(gap[0].gap, 14);
  assert.deepEqual(gap[0].reasons, ['الباقي تالفٌ على الرفّ']);
});
