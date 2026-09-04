/**
 * اختبارات مهمّة التحضير — الجسر بين خطّةٍ يعرفها النظام ومحضّرٍ يمشي الممرّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ★★★ الحَكَمُ على «أيصلح هذا ولدًا؟» هو محرّكُ React نفسُه لا قائمةُ أنواعٍ
// نقلّدها هنا فتفترق عنه يومًا — وهو نفسُ المحرّك الذي يُسقط شاشةَ المحضّر.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildGrid } from '../locations/travelGrid.js';
import {
  PICKABLE_TYPES,
  PICK_TASK_STATES,
  assignTask,
  closePickTask,
  currentStep,
  fulfillmentGap,
  openPickTask,
  pathBasisLabel,
  pickTaskDuplicateProblem,
  pickTaskId,
  skipStep,
  stepRemaining,
  taskCloseProblem,
  stepUnitOf,
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

test('🔒 رفضاتُ الفتح الأربعُ تُطلق بالترتيب نفسِه — أوّلُ ما يُقال أوّلُ ما يُصلَح', () => {
  // مستندٌ يخالف الأربعةَ معًا: يُقال أوّلُها لا آخرُها، ثمّ تُكشف التاليةُ
  // كلّما أُصلحت سابقتُها. وترتيبٌ ينقلب يُرسل المشرف يعتمد مستندًا نوعُه
  // أصلًا لا يُحضَّر منه.
  const broken = { id: '', type: 'GRN', state: 'draft', number: 'X-1' };
  assert.match(taskOpenProblem(broken, null), /لا تحضير بلا أمرٍ معتمد/);
  assert.match(taskOpenProblem({ ...broken, id: 'd1' }, null), /التحضير من/);
  assert.match(taskOpenProblem({ ...broken, id: 'd1', type: 'SO' }, null), /حتى يُعتمد/);
  assert.match(taskOpenProblem({ ...broken, id: 'd1', type: 'SO', state: 'approved' }, null), /بلا بنودٍ قابلةٍ للسحب/);
  assert.equal(taskOpenProblem({ ...broken, id: 'd1', type: 'SO', state: 'approved' }, { lines: [{}] }), '');
});

const SO_77 = { id: 'so-77', type: 'SO', number: 'SO-77', state: 'approved' };

test('★★★ معرّفُ المهمّة حتميٌّ — ضغطتان على الزرّ تقصدان مستندًا واحدًا لا مهمّتين', () => {
  assert.equal(pickTaskId(SO_77), 'PICK__so-77');
  assert.equal(pickTaskId({ ...SO_77 }), pickTaskId(SO_77), 'ثابتٌ عبر النداءات');
  assert.equal(pickTaskId({ id: ' a/b.c ' }), 'PICK__a_b_c', 'وما يكسر معرّف Firestore يُبدَّل');
  assert.notEqual(pickTaskId({ id: 'aBc' }), pickTaskId({ id: 'abc' }), 'ومعرّفات Firestore حسّاسةٌ للحالة — لا تُرفع');
  assert.equal(pickTaskId({}), '', 'ومستندٌ بلا معرّفٍ لا يشارك أمثالَه مستندًا اسمُه PICK__');
  assert.equal(pickTaskId(null), '');
});

test('★★★ المكرّرُ يُرفض بسببٍ يسمّي القائمةَ ومن بيده — لا محضّران على الرفّ نفسِه', () => {
  const open = {
    id: pickTaskId(SO_77), state: 'OPEN', assignee: 'سالم',
    source: { type: 'SO', id: 'so-77', number: 'SO-77' },
  };
  const why = pickTaskDuplicateProblem(open, SO_77);
  assert.match(why, /SO-77/, 'يسمّي الأمر');
  assert.match(why, /مفتوحةٌ سلفًا/);
  assert.match(why, /سالم/, 'ومن بيده — وإلّا فتح المشرف ثانيةً ظنًّا أنّ الأولى ضاعت');
  assert.match(pickTaskDuplicateProblem({ ...open, state: 'IN_PROGRESS' }, SO_77), /مفتوحةٌ سلفًا/);
  assert.equal(pickTaskDuplicateProblem(null, SO_77), '', 'ولا مهمّةَ قائمةً ⇒ لا مانع');
  assert.equal(pickTaskDuplicateProblem(undefined, SO_77), '');
});

test('★★★ والمنفَّذةُ تُرفض كذلك — الكتابةُ الثانيةُ تمرّ من قاعدة الأمان وتمحو الخطوات', () => {
  const done = { state: 'DONE', source: { number: 'SO-77' } };
  assert.match(pickTaskDuplicateProblem(done, SO_77), /SO-77/);
  assert.match(pickTaskDuplicateProblem(done, SO_77), new RegExp(PICK_TASK_STATES.DONE));
  assert.match(pickTaskDuplicateProblem(done, SO_77), /تمحو ما سُحب/);
  assert.match(pickTaskDuplicateProblem({ state: 'CANCELLED' }, SO_77), /ملغاة/);
  // ومهمّةٌ بلا مصدرٍ مكتوبٍ تُسمّى بمستندها الممرَّر — لا «؟» يحيّر قارئه.
  assert.match(pickTaskDuplicateProblem({ state: 'CANCELLED' }, SO_77), /SO-77/);
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

// ═══ ‹JR-301ب› الخطوةُ تحمل وحدتَها — «الكمّيّة بلا وحدةٍ رقمٌ بلا معنى» ═══

/** مستندٌ آمرٌ كتب سطرَه بالكرتون، وختم معاملَه كما يختمه `refreshLineBase`. */
const CARTON_DOC = {
  ...PICK_DOC,
  lines: [
    { sku: 'WNW-001', barcode: '6221', qtyRequested: 24, uom: 'carton', uomFactor: 12, uomFactorFor: 'carton', baseUom: 'piece' },
    { sku: 'WNW-002', barcode: '6222', qtyRequested: 10 },
  ],
};

test('★★★ الخطوة تنقل وحدةَ السطر الآمر ومعاملَه — لا رقمًا عاريًا', () => {
  const task = openPickTask(CARTON_DOC, BALANCES, CTX).task;
  const carton = task.steps.find((s) => s.sku === 'WNW-001');
  assert.equal(carton.uom, 'carton');
  assert.equal(carton.factor, 12);
  assert.equal(carton.baseUom, 'piece');
});

test('★★★ خطوةٌ لبندٍ بلا وحدةٍ تبقى بحقولها كما كانت حرفًا — لا حقلَ فارغًا يُقرأ فارغًا', () => {
  const plain = openPickTask(CARTON_DOC, BALANCES, CTX).task.steps.find((s) => s.sku === 'WNW-002');
  assert.equal(Object.hasOwn(plain, 'uom'), false, 'مهمّةٌ قديمة ومهمّةٌ جديدةٌ لصنفٍ بلا وحدةٍ سواء');
  assert.equal(Object.hasOwn(plain, 'factor'), false);
  assert.deepEqual(Object.keys(plain), Object.keys(openPickTask(PICK_DOC, BALANCES, CTX).task.steps[0]));
});

test('★★ ترتيبُ المصادر: خطوةُ المسار ثمّ صفُّ الرصيد ثمّ سطرُ المستند', () => {
  const fromPath = { uom: 'box', factor: 6, baseUom: 'piece' };
  assert.deepEqual(stepUnitOf(fromPath, { uom: 'carton', factor: 12 }, { uom: 'pack', uomFactor: 3 }), fromPath);
  assert.deepEqual(
    stepUnitOf({}, { uom: 'carton', factor: 12, baseUom: 'piece' }, { uom: 'pack', uomFactor: 3 }),
    { uom: 'carton', factor: 12, baseUom: 'piece' }
  );
  assert.equal(stepUnitOf({}, null, { uom: 'pack', uomFactor: 3 }).uom, 'pack');
  assert.equal(stepUnitOf({}, null, {}), null, 'بلا وحدةٍ معلنةٍ لا تُلحق ثلاثةُ حقول');
});

test('★★★ معاملٌ مختومٌ لوحدةٍ أخرى لا يصف هذه — شرطُ `refreshLineBase` نفسُه', () => {
  // سطرٌ بُدّلت وحدتُه إلى «قطعة» وبقي عليه معاملُ «كرتون المورّد» — لا يلتصق.
  const stale = stepUnitOf({}, null, { uom: 'piece', uomFactor: 24, uomFactorFor: 'carton' });
  assert.equal(stale.uom, 'piece');
  assert.equal(stale.factor, null, 'ولا يُقرأ ٢٤ لقطعةٍ واحدة');
  // ومختومٌ لوحدتها بمرادفٍ يُقبل — «كرتونة» و«carton» واحد.
  assert.equal(stepUnitOf({}, null, { uom: 'carton', uomFactor: 12, uomFactorFor: 'كرتونة' }).factor, 12);
});

test('★★★ معاملٌ صفرٌ أو سالبٌ ⇒ null — الصفرُ الصامتُ أخطر من الغياب', () => {
  assert.equal(stepUnitOf({ uom: 'carton', factor: 0 }, null, null).factor, null);
  assert.equal(stepUnitOf({ uom: 'carton', factor: -3 }, null, null).factor, null);
  assert.equal(stepUnitOf({ uom: 'carton' }, null, null).factor, null);
});

test('صفُّ الرصيد يُطابَق بمفتاحه الميدانيّ — الصنفُ والمخزنُ والرفُّ والدفعة', () => {
  const rows = [
    // مخزنٌ آخر: بضاعةٌ لا يصل إليها هذا العامل أصلًا، فلا تُملي عليه وحدته.
    { ...BALANCES[0], warehouse: 'OTHER', uom: 'pack', factor: 3, baseUom: 'piece' },
    // ورفٌّ آخر أبعدُ انتهاءً — لا يُخصَّص منه، فلا يُقرأ منه.
    { ...BALANCES[0], bin: 'MAIN-A09-R09-B09', expiry: '2028-01-01', uom: 'dozen', factor: 12, baseUom: 'piece' },
    { ...BALANCES[0], uom: 'carton', factor: 12, baseUom: 'piece' },
    BALANCES[1],
  ];
  const step = openPickTask(PICK_DOC, rows, CTX).task.steps.find((s) => s.sku === 'WNW-001');
  assert.equal(step.bin, 'MAIN-A01-R01-B01', 'الأقربُ انتهاءً أوّلًا (FEFO)');
  assert.equal(step.uom, 'carton', 'ووحدتُه من صفّه هو لا من صفٍّ مجاور');
  assert.equal(step.factor, 12);
});

/* ═════════════ 🔒 حارسُ الشاشة البيضاء ‹القاتل ①› ═════════════
 *
 * ═══ ما وقع ═══
 * `openPickTask` يكتب `pathBasis` **كائنًا**، وشاشةُ التحضير كانت تعرضه ولدًا
 * في JSX بجانب المستودع. وReact يرمي «Objects are not valid as a React child»
 * **ولا `ErrorBoundary` فوق هذه الشاشة**: كلُّ مهمّةٍ يفتحها المحضّر تسقط عند
 * أوّل رندر، فيقف في الممرّ أمام بياضٍ لا رسالةَ فيه ولا زرَّ رجوع.
 *
 * ولم يمسكه اختبارٌ واحدٌ من آلافٍ خضراء، لأنّها كلَّها تبني بياناتِها بيدها
 * وتنادي الدوالَّ مباشرةً — فلا واحدَ منها سأل **الشاشةَ** ماذا تعرض، ولا سأل
 * **React** أيقبله ولدًا.
 *
 * فهذا الحارسُ يقلب الاتّجاهين معًا:
 *   ① القائمةُ تُقرأ من `PickingFlow.jsx` نفسِه — فحقلٌ يُضاف غدًا يُحرَس اليوم.
 *   ② والحكمُ يمرّ بـ`react-dom/server` — المحرّكُ نفسُه لا محاكاةٌ له.
 */

const FLOW_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'components', 'brandzo-erp', 'lpn', 'PickingFlow.jsx'
);

/**
 * ★★★ ما تعرضه الشاشةُ **ولدًا** — يُقرأ من ملفّها ولا يُسرَد هنا بيد.
 *
 * ولماذا لا يُسرَد؟ لأنّ قائمةً مكتوبةً تحرس حقلَ اليوم وحدَه: يُضاف غدًا
 * `{task?.route}` — وهو كائنٌ أيضًا (`routeDistance` يعيد `{meters, note…}`) —
 * فتبقى القائمةُ خضراءَ والشاشةُ بيضاء. وهو عينُ ما وقع بـ`pathBasis`.
 *
 * والجذورُ ثلاثةٌ كما تسمّيها الشاشة: `task` (شاشةُ المهمّة) و`t` (صفُّ
 * القائمة) وكلاهما المهمّة، و`step` الخطوةُ الجارية.
 *
 * ⚠️ وما سبقه `=` ليس ولدًا بل خاصّيّةَ مكوّن (`source={task?.source}`):
 * الكائنُ يُمرَّر خاصّيّةً بلا ضرر ويُفكَّك داخلَ المكوّن نصوصًا. وما سبقه `$`
 * قالبٌ نصّيّ يُسطِّح ولا يرمي — فكلاهما خارج هذا الحارس عمدًا لا سهوًا.
 */
function jsxChildReads(src) {
  const re = /(^|[^=$])\{\s*(task|t|step)((?:\??\.[A-Za-z_$][\w$]*)+)\s*\}/g;
  return [...src.matchAll(re)].map((m) => ({ root: m[2], keys: m[3] }));
}

/** قيمةُ مسارٍ مكتوبٍ كما في JSX — `?.` تُطرح، فالغيابُ يُردّ `undefined`. */
function valueAt(obj, keys) {
  return keys
    .replace(/\?/g, '')
    .split('.')
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * ★★ المهمّةُ **كما تصل الشاشةَ** لا كما تخرج من الدالّة.
 *
 * `createPickTask` ينثر `built.task` في `picking_tasks` ويزيد `openedByUid`
 * و`createdAt`، و`listenTask` يزيد `id` من `snap.id`. فمن بنى عيّنتَه من مخرج
 * الدالّة وحدَه حرس نصفَ ما يُعرض — **اقرأ الكاتبَ لا القارئ**.
 */
function storedTask({ grid = null } = {}) {
  const built = openPickTask(PICK_DOC, BALANCES, { ...CTX, grid });
  assert.equal(built.problem, undefined, 'والعيّنةُ من مدخلاتٍ واقعيّةٍ تُفتح فعلًا');
  return {
    id: pickTaskId(PICK_DOC),
    ...built.task,
    openedByUid: 'uid-7',
    // ⚠️ `serverTimestamp()` يعود من الخادم **كائنَ طابعٍ** لا نصًّا — فمن
    //    يعرضه ولدًا غدًا يُبيّض الشاشةَ كما بيّضها `pathBasis` أمس.
    createdAt: { seconds: 1756900000, nanoseconds: 0 },
  };
}

/** أيقبل Reactُ هذه القيمةَ ولدًا؟ — `''` تعني نعم، وغيرُها سببُ الرفض. */
function reactRejects(value) {
  try {
    renderToStaticMarkup(React.createElement('div', null, value));
  } catch (e) {
    return e?.message || 'رفضها React بلا رسالة.';
  }
  // ★ ومصفوفةٌ فارغةٌ يقبلها Reactُ اليوم ويرميها غدًا حين تمتلئ كائنات
  //   (`issuePallets: []` مثالُها الحيّ) — فتُردّ بالقاعدة لا بالتجربة.
  if (Array.isArray(value)) return 'مصفوفةٌ تمرّ فارغةً وتُسقط الشاشةَ حين تمتلئ.';
  return '';
}

/** أعطابُ الشاشة البيضاء في مهمّةٍ بعينها — مسارُ الحقل وسببُ رفضه. */
function whiteScreenFaults(reads, task) {
  const out = [];
  for (const { root, keys } of reads) {
    for (const target of root === 'step' ? task.steps ?? [] : [task]) {
      const why = reactRejects(valueAt(target, keys));
      if (why) out.push(`${root}${keys} ⇐ ${why}`);
    }
  }
  return [...new Set(out)];
}

test('🔒 كلُّ ما تعرضه شاشةُ التحضير ولدًا يقبله React — لا كائنٌ يُبيّضها عند أوّل رندر', () => {
  const reads = jsxChildReads(fs.readFileSync(FLOW_FILE, 'utf8'));
  // ★★★ الاستخراجُ نفسُه يُقاس: حارسٌ لا يجد ما يفحصه لا يُطلق ولو مرّة —
  //     وهو درسُ «حارسٍ يقرأ حقلًا لا يُكتب أبدًا» بعينه.
  assert.ok(reads.length >= 6, `الشاشةُ تعرض ${reads.length} حقلًا وحدَه — أتبدّل شكلُ JSX؟`);
  assert.ok(reads.some((r) => r.root === 'task'), 'وفيها قراءاتُ شاشة المهمّة');
  assert.ok(reads.some((r) => r.root === 'step'), 'وقراءاتُ الخطوة الجارية');

  const faults = [];
  // بلا شبكةٍ وبها: `pathBasisOf` يعيد كائنًا في الحالين، وهما مسارا الواقع.
  for (const grid of [null, buildGrid(BALANCES.map((b) => b.bin))]) {
    faults.push(...whiteScreenFaults(reads, storedTask({ grid })));
  }
  assert.deepEqual(
    [...new Set(faults)],
    [],
    'كائنٌ يُعرض ولدًا: اعرض تسميتَه (`pathBasisLabel`) ولا تُسطّح البيانةَ المخزَّنة.'
  );
});

test('🔒 والحارسُ يُطلق فعلًا — يُقاس بالنقض لا بخضرةٍ تُصدَّق', () => {
  const reads = jsxChildReads(fs.readFileSync(FLOW_FILE, 'utf8'));
  // مستودعٌ صار كائنًا (وهو ما يقع حين يُخزَّن الكودُ مع تسميته يومًا).
  const poisoned = { ...storedTask(), warehouse: { code: 'MAIN', label: 'الرئيسيّ' } };
  assert.ok(
    whiteScreenFaults(reads, poisoned).some((f) => f.includes('warehouse')),
    'حارسٌ لا يُمسك كائنًا مدسوسًا في حقلٍ تعرضه الشاشةُ حارسٌ صامت'
  );
  // وخطوةٌ حُشيت كائنًا في حقلٍ معروض — الجذرُ الثاني يُقاس كما الأوّل.
  const badStep = storedTask();
  badStep.steps = badStep.steps.map((s) => ({ ...s, bin: { code: s.bin } }));
  assert.ok(whiteScreenFaults(reads, badStep).some((f) => f.includes('bin')));
});

test('★★★ `pathBasis` بيانةٌ منظَّمةٌ تبقى — والشاشةُ تعرض تسميتَها لا هي', () => {
  const task = storedTask();
  assert.equal(typeof task.pathBasis, 'object', 'المنظَّمُ أنفعُ في التخزين فلا يُسطَّح لأجل ركنِ شاشة');
  assert.match(reactRejects(task.pathBasis), /not valid as a React child/, 'وهو بعينه ما كان يُبيّض الشاشة');
  assert.equal(pathBasisLabel(task.pathBasis), 'مرتَّبٌ بكود الموقع — لا شبكةَ ممرّاتٍ معرَّفة بعد');
  assert.equal(reactRejects(pathBasisLabel(task.pathBasis)), '');
  // والشبكةُ تُبدّل التسمية ولا تُبدّل صلاحيّتَها للعرض.
  const gridded = storedTask({ grid: buildGrid(BALANCES.map((b) => b.bin)) });
  assert.equal(reactRejects(pathBasisLabel(gridded.pathBasis)), '');
  assert.ok(pathBasisLabel(gridded.pathBasis).length > 0);
  // والكاتبُ يُعلن `''` بديلًا (`plan.pathBasis ?? ''`) فالقارئُ يقبل الاثنين.
  assert.equal(pathBasisLabel(''), '');
  assert.equal(pathBasisLabel('مرتَّبٌ بكود الموقع'), 'مرتَّبٌ بكود الموقع');
  assert.equal(pathBasisLabel(undefined), '');
  assert.equal(pathBasisLabel(null), '');
});

test('🔒 شاشةُ التحضير تقرأ مهمّتَها من العنوان ثمّ تنظّفه — لا قائمةٌ يبحث فيها من جاء بأمره', () => {
  /*
   * ⚠️ المزلقُ الأوّلُ مكتوبٌ في `services/tasks/fieldRoutes.js` حرفًا: «المسارُ
   * بلا معرّف المستند… قُرئت الشاشاتُ الأربع فلم تقرأ واحدةٌ منها
   * `searchParams`… ثمّ يُضاف هنا وفي الشاشة معًا لا هنا وحده». وهذا نصفُه
   * الثاني، وهذا حارسُه — فلا يعود الغيابُ صامتًا.
   */
  const src = fs.readFileSync(FLOW_FILE, 'utf8');
  assert.match(src, /new URLSearchParams\(window\.location\.search\)\.get\('doc'\)/);
  assert.match(src, /listOpenTasks\(\{\s*sourceDocId:/, 'والجوابُ بالمعرّف الحتميّ لا باستعلامٍ يحتاج فهرسًا');
  assert.match(
    src,
    /searchParams\.delete\('doc'\)[\s\S]{0,200}history\.replaceState/,
    'ويُنظَّف بعدها — وإلّا أعادته كلُّ إعادةِ تحميلٍ إلى مهمّةٍ تركها بقصد'
  );
});
