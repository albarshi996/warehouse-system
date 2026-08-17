/**
 * اختبارات سلسلة حالات الطلب ‹EXE-502›.
 *
 * الحارس الأوّل هنا ليس حسابًا بل **قاعدة**: المرحلة تُشتقّ من المهامّ
 * والمستندات، فلا يوجد في المخرج كلّه حقلُ حالةٍ يُكتب باليد — ولو وُجد
 * لَافترق عن الواقع أوّلَ مستندٍ يُنشأ بعده.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { OUTBOUND_CHAIN } from './chain.js';
import {
  ORDER_STAGES,
  ORDER_TYPE,
  STAGE_FLOW,
  STALL_HOURS,
  descendantsOf,
  orderStageChain,
  stageSummary,
  varianceOf,
} from './orderStages.js';

const HOUR = 3600000;
const T0 = Date.parse('2026-08-17T06:00:00Z');
const NOW = Date.parse('2026-08-17T12:00:00Z');
const DEADLINE = Date.parse('2026-08-17T18:00:00Z');

/** أمر بيعٍ بمئة وحدة على صنفين، بمهلة شحنٍ معلنة. */
function order(overrides = {}) {
  return {
    id: 'so-1',
    type: 'SO',
    number: 'SO-2026-0001',
    state: 'approved',
    createdAt: T0,
    header: { customer: 'فرع بنغازي', mustShipBy: DEADLINE },
    lines: [
      { sku: 'A1', description: 'صنف أ', qty: 60 },
      { sku: 'B2', description: 'صنف ب', qty: 40 },
    ],
    ...overrides,
  };
}

function pick(overrides = {}) {
  return {
    id: 'pick-1',
    type: 'PICK',
    number: 'PICK-2026-0001',
    state: 'approved',
    createdAt: T0 + HOUR,
    updatedAt: T0 + HOUR,
    links: { SO: { id: 'so-1', number: 'SO-2026-0001' } },
    lines: [
      { sku: 'A1', qtyRequested: 60, qtyPicked: 0 },
      { sku: 'B2', qtyRequested: 40, qtyPicked: 0 },
    ],
    ...overrides,
  };
}

const stageOf = (chain, id) => chain.stages.find((st) => st.id === id);

/* ── القاعدة الحاكمة ───────────────────────────────────────────── */

test('★★ المراحل التسع بأسمائها — ولا عاشرة تُخترع في الشاشة', () => {
  assert.deepEqual(
    ORDER_STAGES.map((st) => st.label),
    ['جديد', 'خُصّص', 'يحتاج تعبئة', 'أُطلقت المهامّ', 'سحب', 'تعبئة', 'تجهيز', 'تحميل', 'شُحن']
  );
});

test('★★ لا نوع مستندٍ خارج `OUTBOUND_CHAIN` — ولا حلقةَ فيها بلا مرحلة', () => {
  const used = ORDER_STAGES.map((st) => st.docType).filter(Boolean);
  for (const type of used) assert.ok(OUTBOUND_CHAIN.includes(type), `${type} خارج سلسلة الصادر`);
  for (const type of OUTBOUND_CHAIN) assert.ok(used.includes(type), `${type} بلا مرحلةٍ تمثّله`);
});

test('★★ أنصبة المهلة في مصدرٍ واحد ومجموعها 100', () => {
  assert.equal(ORDER_STAGES.reduce((a, st) => a + st.share, 0), 100);
});

test('★★ لكلّ مرحلة الحقول الثمانية — ولا حقلَ حالةٍ يُكتب باليد', () => {
  const chain = orderStageChain(order(), { documents: [pick()], nowMs: NOW });
  for (const st of chain.stages) {
    for (const key of ['startedAt', 'expectedAt', 'actualAt', 'owner', 'required', 'done', 'remaining', 'stall']) {
      assert.ok(key in st, `${st.id} بلا ${key}`);
    }
    assert.ok(st.flow, 'ولكلّ مرحلةٍ حالٌ في الزمن');
    assert.equal(st.remaining, Math.max(0, st.required - st.done), 'المتبقّي يُحسب ولا يُخزَّن');
  }
});

test('★★ المرحلة تُشتقّ من المستندات — حقل حالةٍ مكتوبٌ على الطلب لا يُغيّرها', () => {
  const lying = order({ stage: 'شُحن', status: 'shipped' });
  const chain = orderStageChain(lying, { documents: [pick()], nowMs: NOW });
  assert.equal(chain.current.id, 'released', 'الواقع: خُصّص ولم تُطلق مهامّ');
  assert.equal(chain.shipped, false, 'ولا يُصدَّق ادّعاءُ الشحن');
});

/* ── الاشتقاق ──────────────────────────────────────────────────── */

test('الأحفاد يُلتقطون بالروابط الموروثة لا بالتسلّق حلقةً حلقة', () => {
  const dn = { id: 'dn-1', type: 'DN', number: 'DN-1', state: 'approved', links: { SO: { id: 'so-1' }, PICK: { id: 'pick-1' } }, lines: [] };
  const alien = { id: 'x', type: 'DN', number: 'DN-9', state: 'approved', links: { SO: { id: 'so-9' } }, lines: [] };
  const byType = descendantsOf(order(), [pick(), dn, alien]);
  assert.deepEqual([...byType.keys()].sort(), ['DN', 'PICK']);
  assert.equal(byType.get('DN').length, 1, 'وطلبٌ آخر لا يتسرّب');
});

test('طلبٌ بلا أبناء: «جديد» تمّت وما بعدها ينتظر', () => {
  const chain = orderStageChain(order(), { nowMs: NOW });
  assert.equal(stageOf(chain, 'new').flow, STAGE_FLOW.done.id);
  assert.equal(stageOf(chain, 'new').done, 100, 'المعتمَد أُنجزت مرحلتُه كاملةً');
  assert.equal(chain.current.id, 'allocated');
});

test('طلبٌ لم يُعتمد بعد: «جديد» نفسها لم تكتمل', () => {
  const chain = orderStageChain(order({ state: 'submitted', createdAt: NOW - HOUR }), { nowMs: NOW });
  assert.equal(stageOf(chain, 'new').flow, STAGE_FLOW.active.id);
  assert.equal(stageOf(chain, 'new').done, 0);
});

test('★★ الأثرُ يشهد لما قبله — ما تلَته مرحلةٌ تمّت لا يبقى مفتوحًا', () => {
  // شحنةٌ قديمة: مستنداتها كاملة ولا سجلَّ مهامّ لها (سجلّ المهامّ وُلد في ت١).
  const docs = [
    pick({ state: 'done', lines: [{ sku: 'A1', qtyRequested: 60, qtyPicked: 60 }, { sku: 'B2', qtyRequested: 40, qtyPicked: 40 }] }),
  ];
  const chain = orderStageChain(order(), { documents: docs, nowMs: NOW });
  const released = stageOf(chain, 'released');
  assert.equal(released.flow, STAGE_FLOW.done.id, 'ولا تقف الشحنة عند مرحلةٍ لم تكن موجودة يوم نُفّذت');
  assert.equal(released.impliedBy, 'سحب', 'والاستدلال يُعلَن باسم شاهده');
  assert.equal(released.done, 0, 'ولا يُختلق لها رقم');
  assert.equal(released.late, false, 'ولا تُتّهم بتأخّرٍ لا لحظةَ له');
  assert.equal(chain.current.id, 'pack');
});

test('★★ «خُصّص» لا تتقلّص كلّما تقدّم السحب — الحقلان مختلفان', () => {
  const half = pick({ lines: [{ sku: 'A1', qtyRequested: 60, qtyPicked: 20 }, { sku: 'B2', qtyRequested: 40, qtyPicked: 0 }] });
  const chain = orderStageChain(order(), { documents: [half], nowMs: NOW });
  assert.equal(stageOf(chain, 'allocated').done, 100, 'المخصَّص هو المطلوب لا المسحوب');
  assert.equal(stageOf(chain, 'allocated').flow, STAGE_FLOW.done.id);
  assert.equal(stageOf(chain, 'pick').done, 20);
});

test('الشحن يكتمل حين يُنجَز تصريح الخروج — لا حين يُنشأ', () => {
  const docs = [
    pick({ state: 'done', lines: [{ sku: 'A1', qtyRequested: 60, qtyPicked: 60 }, { sku: 'B2', qtyRequested: 40, qtyPicked: 40 }] }),
    { id: 'pack-1', type: 'PACK', number: 'PACK-1', state: 'done', links: { SO: { id: 'so-1' } }, lines: [{ sku: 'A1', qty: 60 }, { sku: 'B2', qty: 40 }] },
    { id: 'dn-1', type: 'DN', number: 'DN-1', state: 'done', links: { SO: { id: 'so-1' } }, lines: [{ sku: 'A1', qty: 60 }, { sku: 'B2', qty: 40 }] },
    { id: 'gp-1', type: 'GP', number: 'GP-1', state: 'approved', links: { SO: { id: 'so-1' } }, lines: [{ sku: 'A1', qty: 60 }, { sku: 'B2', qty: 40 }] },
  ];
  const open = orderStageChain(order(), { documents: docs, nowMs: NOW });
  assert.equal(stageOf(open, 'ship').flow !== STAGE_FLOW.done.id, true, 'تصريحٌ معتمَدٌ لم يُنجَز بعد');
  assert.equal(open.shipped, false);

  const closed = orderStageChain(order(), {
    documents: docs.map((d) => (d.type === 'GP' ? { ...d, state: 'done' } : d)),
    nowMs: NOW,
  });
  assert.equal(closed.shipped, true);
  assert.equal(closed.current, null, 'ولا مرحلةَ جاريةً بعد الشحن');
});

/* ── الميدان والمستند ──────────────────────────────────────────── */

test('★★ الميدان يقول الجاري والمستند يقول المثبَّت', () => {
  const laborTasks = [{
    id: 'lt-1',
    orderType: 'pick',
    docRef: { number: 'PICK-2026-0001' },
    startedAt: T0 + 2 * HOUR,
    lines: [{ sku: 'A1', qtyRequired: 60, qtyDone: 45 }, { sku: 'B2', qtyRequired: 40, qtyDone: 0 }],
  }];
  const live = orderStageChain(order(), { documents: [pick()], laborTasks, nowMs: NOW });
  assert.equal(stageOf(live, 'pick').done, 45, 'المستند بلا `qtyPicked` بعد — فالميدان هو الحيّ');
  assert.equal(stageOf(live, 'pick').basis, 'field');

  const posted = pick({ state: 'done', updatedAt: T0 + 3 * HOUR, lines: [{ sku: 'A1', qtyRequested: 60, qtyPicked: 60 }, { sku: 'B2', qtyRequested: 40, qtyPicked: 40 }] });
  const settled = orderStageChain(order(), { documents: [posted], laborTasks, nowMs: NOW });
  assert.equal(stageOf(settled, 'pick').done, 100, 'ورُحّل المستند فصار هو الحكم');
  assert.equal(stageOf(settled, 'pick').basis, 'document');
});

test('★★ المهامّ المقترحة لا تُعدّ مُطلقة — والسبب يُقال', () => {
  const tasks = [{ id: 't1', releaseState: 'suggested', laborTaskId: 'lt-1' }];
  const laborTasks = [{ id: 'lt-1', orderType: 'pick', docRef: { number: 'PICK-2026-0001' }, lines: [{ sku: 'A1', qtyRequired: 100, qtyDone: 0 }] }];
  const chain = orderStageChain(order(), { documents: [pick()], tasks, laborTasks, nowMs: NOW });
  const released = stageOf(chain, 'released');
  assert.equal(released.done, 0);
  assert.equal(released.flow, STAGE_FLOW.stalled.id);
  assert.match(released.stall, /لم تُطلق/);
});

test('المُطلقة تُحسب بكمّيّة مهمّتها الميدانيّة', () => {
  const tasks = [{ id: 't1', releaseState: 'released', laborTaskId: 'lt-1' }];
  const laborTasks = [{ id: 'lt-1', orderType: 'pick', docRef: { number: 'PICK-2026-0001' }, lines: [{ sku: 'A1', qtyRequired: 60, qtyDone: 0 }, { sku: 'B2', qtyRequired: 40, qtyDone: 0 }] }];
  const chain = orderStageChain(order(), { documents: [pick()], tasks, laborTasks, nowMs: NOW });
  assert.equal(stageOf(chain, 'released').done, 100);
  assert.equal(stageOf(chain, 'released').flow, STAGE_FLOW.done.id);
});

/* ── يحتاج تعبئة ───────────────────────────────────────────────── */

test('بلا نقصٍ: مرحلة التعبئة لا تنطبق ولا تُعدّ منجَزة', () => {
  const chain = orderStageChain(order(), { documents: [pick()], nowMs: NOW });
  const replenish = stageOf(chain, 'replenish');
  assert.equal(replenish.flow, STAGE_FLOW.skipped.id);
  assert.equal(stageSummary(chain).total, ORDER_STAGES.length - 1, 'ولا تُحتسب في النسبة');
});

test('★★ بنقصٍ: تتوقّف صراحةً وتقول إنّ التعبئة الداخليّة لم تُبنَ بعد', () => {
  const chain = orderStageChain(order(), {
    documents: [pick()],
    shortages: [{ sku: 'B2', nameAr: 'صنف ب', qty: 15 }],
    nowMs: NOW,
  });
  const replenish = stageOf(chain, 'replenish');
  assert.equal(replenish.flow, STAGE_FLOW.stalled.id);
  assert.equal(replenish.required, 15, 'المطلوب هو النقص لا الطلب كلّه');
  assert.match(replenish.stall, /EXE-903/);
  assert.equal(chain.current.id, 'replenish', 'وهي التي توقف ما بعدها');
});

test('نقصٌ يكشفه الميدان بسطرٍ موسوم يُحتسب كما يُحتسب نقص المصنع', () => {
  const laborTasks = [{
    id: 'lt-1',
    orderType: 'pick',
    docRef: { number: 'PICK-2026-0001' },
    lines: [{ sku: 'B2', qtyRequired: 12, qtyDone: 0, shortfall: true }],
  }];
  const chain = orderStageChain(order(), { documents: [pick()], laborTasks, nowMs: NOW });
  assert.equal(stageOf(chain, 'replenish').required, 12);
});

/* ── المتوقّع ──────────────────────────────────────────────────── */

test('★★ المتوقّع يُعلَن أساسَه — تقديرٌ من المهلة لا زمنٌ معياريّ', () => {
  const chain = orderStageChain(order(), { documents: [pick()], nowMs: NOW });
  const ship = stageOf(chain, 'ship');
  assert.equal(ship.expectedBasis, 'deadline-share');
  assert.match(ship.expectedHint, /لا زمنٌ معياريّ/);
  assert.equal(ship.expectedAt, DEADLINE, 'آخر مرحلةٍ متوقَّعها هو المهلة نفسها');
  const expected = chain.stages.filter((st) => st.expectedAt).map((st) => st.expectedAt);
  assert.deepEqual(expected, [...expected].sort((a, b) => a - b), 'ومتوقّعُ المراحل يتصاعد');
});

test('بلا مهلة شحنٍ معلنة: لا متوقّعَ يُختلق', () => {
  const chain = orderStageChain(order({ header: { customer: 'فرع بنغازي' } }), { nowMs: NOW });
  for (const st of chain.stages) {
    assert.equal(st.expectedAt, null);
    assert.match(st.expectedHint, /بلا مهلة شحن/);
  }
});

test('المهلة الاحتياطيّة (وعد العميل) تُعلَن احتياطًا', () => {
  const chain = orderStageChain(order({ header: { requiredDate: DEADLINE } }), { nowMs: NOW });
  assert.equal(chain.deadline.fallback, true);
  assert.equal(chain.deadline.source, 'requiredDate');
});

test('★★ الزمن المعياريّ حين يأتي يعلو التوزيع بلا تغيير الشكل', () => {
  const chain = orderStageChain(order(), {
    documents: [pick()],
    standardMinutes: { new: 30, allocated: 45 },
    nowMs: NOW,
  });
  assert.equal(stageOf(chain, 'new').expectedBasis, 'standard');
  assert.equal(stageOf(chain, 'new').expectedAt, T0 + 30 * 60000);
  assert.equal(stageOf(chain, 'ship').expectedBasis, 'deadline-share', 'وما لا معيارَ له يبقى على التوزيع');
});

test('المرحلة التي فات موعدها ولم تنتهِ متأخّرةٌ الآن لا حين تنتهي', () => {
  const late = { expectedAt: NOW - 2 * HOUR, actualAt: null, flow: STAGE_FLOW.active.id };
  assert.equal(varianceOf(late, NOW), 2 * HOUR);
  const early = { expectedAt: NOW + 2 * HOUR, actualAt: null, flow: STAGE_FLOW.active.id };
  assert.equal(varianceOf(early, NOW), null, 'ولا سبقَ يُدّعى لعملٍ لم ينتهِ');
  const finished = { expectedAt: NOW, actualAt: NOW - HOUR, flow: STAGE_FLOW.done.id };
  assert.equal(varianceOf(finished, NOW), -HOUR, 'والمنتهية قبل موعدها فرقُها سالب');
});

/* ── الفعليّ والمسؤول ─────────────────────────────────────────── */

test('★★ الفعليّ من سجلّ التدقيق لا من آخر تعديل', () => {
  const done = pick({ state: 'done', updatedAt: T0 + 20 * HOUR, lines: [{ sku: 'A1', qtyRequested: 60, qtyPicked: 60 }, { sku: 'B2', qtyRequested: 40, qtyPicked: 40 }] });
  const audit = { 'pick-1': [{ action: 'create', to: 'draft', at: T0 + HOUR }, { action: 'done', to: 'done', at: T0 + 3 * HOUR, byName: 'سالم', byRole: 'storekeeper' }] };
  const chain = orderStageChain(order(), { documents: [done], audit, nowMs: NOW });
  const stage = stageOf(chain, 'pick');
  assert.equal(stage.actualAt, T0 + 3 * HOUR, 'تعليقٌ بعد يومين لا يدفع لحظة الإنجاز');
  assert.equal(stage.owner.name, 'سالم');
  assert.equal(stage.owner.role, 'storekeeper');
});

test('المسؤول الافتراضيّ من مخطّط المستند لا من جدولٍ ثانٍ', () => {
  const chain = orderStageChain(order(), { nowMs: NOW });
  assert.equal(stageOf(chain, 'ship').owner.role, 'gate_officer', 'الخروج لضابط البوابة');
  assert.equal(stageOf(chain, 'ship').owner.roleLabel, 'ضابط البوابة');
  assert.equal(stageOf(chain, 'released').owner.role, 'labor_supervisor', 'والإطلاق للمشرف — ت-O01');
});

/* ── سبب التوقّف ──────────────────────────────────────────────── */

test('★★ الجارية حديثًا ليست متوقّفة — ولا يُغرق الأحمرُ الشاشة', () => {
  const fresh = pick({ createdAt: NOW - HOUR, updatedAt: NOW - HOUR });
  const chain = orderStageChain(order(), { documents: [fresh], nowMs: NOW });
  assert.equal(stageOf(chain, 'pick').flow, STAGE_FLOW.active.id);
  assert.equal(stageOf(chain, 'pick').stall, '');
});

test('الجارية بلا حركةٍ منذ ساعاتٍ تُوصف بالتوقّف وتقول مدّته', () => {
  const idleMs = (STALL_HOURS + 2) * HOUR;
  const stale = pick({ createdAt: NOW - idleMs, updatedAt: NOW - idleMs });
  const chain = orderStageChain(order(), { documents: [stale], nowMs: NOW });
  const stage = stageOf(chain, 'pick');
  assert.equal(stage.flow, STAGE_FLOW.stalled.id);
  assert.match(stage.stall, new RegExp(`${STALL_HOURS + 2} ساعة`));
});

test('الاستثناء المفتوح على مستند المرحلة هو سببُ توقّفها', () => {
  const chain = orderStageChain(order(), {
    documents: [pick()],
    exceptions: [{ number: 'EXC-2026-0007', reason: 'فرقٌ في السحب لم يُبتّ', docRef: { number: 'PICK-2026-0001' } }],
    nowMs: NOW,
  });
  assert.match(stageOf(chain, 'pick').stall, /EXC-2026-0007/);
  assert.match(stageOf(chain, 'pick').stall, /فرقٌ في السحب/);
});

/* ── المدخلات المعطوبة ────────────────────────────────────────── */

test('مستندٌ من غير نوع الطلب يُردّ بسببٍ مكتوب لا بسلسلةٍ كاذبة', () => {
  const chain = orderStageChain({ id: 'x', type: 'GRN', number: 'GRN-1' }, { nowMs: NOW });
  assert.equal(chain.stages.length, 0);
  assert.match(chain.problem, new RegExp(ORDER_TYPE));
});

test('بلا هويّةٍ لا سلسلة', () => {
  assert.match(orderStageChain(null).problem, /لا طلب/);
});

test('الملغى من الأبناء لا يُحتسب تقدّمًا', () => {
  const chain = orderStageChain(order(), { documents: [pick({ state: 'canceled' })], nowMs: NOW });
  assert.equal(stageOf(chain, 'allocated').done, 0);
  assert.equal(stageOf(chain, 'allocated').docs.length, 0);
});

test('الملخّص يقول أين نحن وكم توقّف — بلا إعادة حسابٍ في الشاشة', () => {
  const chain = orderStageChain(order(), { documents: [pick()], nowMs: NOW });
  const summary = stageSummary(chain);
  assert.equal(summary.current, 'أُطلقت المهامّ');
  assert.ok(summary.pct > 0 && summary.pct < 100);
  assert.equal(summary.total, 8);
});
