/**
 * حارسُ مولّد مهامّ التزويد — ‹WMS-302›.
 *
 * ★★★ وأخطرُ بندٍ فيه: **FEFO على التزويد الداخليّ لا على السحب وحده.**
 * فمهمّةٌ نصُّها «زوِّد الوجه بثمانين» تُسلَّم لعاملٍ فيأخذ أقربَ طبليّة — وهي
 * الأحدثُ غالبًا لأنّ الأحدثَ يُخزَّن في الفارغ القريب — فيبقى الأقدمُ راكدًا
 * حتّى يبلغ تاريخَه وهو في الرفّ. ويُلقى اللومُ على «المخزون الراكد» وسببُه
 * قرارُ مشيٍ لا قرارُ شراء.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLENISH_STATES,
  replenishTaskId,
  sourceStock,
  planFace,
  replenishPlan,
  releaseVerdict,
  taskSummary,
} from './replenishPlan.js';
import { pickFaceState } from './replenishModel.js';

const NOW = Date.UTC(2026, 9, 3);

const FACE = (over = {}) => ({
  code: 'RH-A-R-01-01',
  warehouse: 'RH',
  status: 'active',
  pickFace: true,
  pickSku: 'ITM-1',
  replenishMin: 20,
  replenishMax: 100,
  ...over,
});
const BULK = (over = {}) => ({ code: 'RH-B-R-10-01', warehouse: 'RH', status: 'active', ...over });
const bal = (over = {}) => ({ sku: 'ITM-1', warehouse: 'RH', qty: 100, ...over });

/* ══════════ ① المعرّفُ حتميّ ══════════ */

test('★★★ المعرّفُ حتميٌّ — خانةٌ وصنفٌ، فلا تتضاعف المهمّةُ في كلّ فتحةِ شاشة', () => {
  assert.equal(replenishTaskId('RH-A-R-01-01', 'ITM-1'), 'RPL-RH-A-R-01-01-ITM-1');
  assert.equal(replenishTaskId('rh-a-r-01-01', 'itm-1'), replenishTaskId('RH-A-R-01-01', 'ITM-1'));
  // ولا يدخله الوقتُ ولا العجز — وإلّا وُلد معرّفٌ جديدٌ كلّما تبدّل الرصيد.
  assert.equal(replenishTaskId('RH-A-R-01-01', ''), 'RPL-RH-A-R-01-01-ANY');
});

test('والمعرّفُ صالحٌ لـFirestore — بلا شرطةٍ مائلةٍ ولا حروفٍ عربيّة', () => {
  const id = replenishTaskId('RH/A/R-01', 'صنف-عربي');
  assert.ok(!id.includes('/'), id);
  assert.ok(/^[\w-]+$/.test(id), id);
});

/* ══════════ ② المصدرُ سائبٌ لا وجهُ تجهيز ══════════ */

test('★★★ الوجهُ لا يُزوَّد من وجهٍ آخر — وإلّا حلقةٌ لا تنتهي ومشيٌ بلا فائدة', () => {
  const locations = [FACE(), FACE({ code: 'RH-A-R-02-01' }), BULK()];
  const balances = [
    bal({ bin: 'RH-A-R-02-01', qty: 500 }), // وجهُ تجهيزٍ آخر — ممنوع
    bal({ bin: 'RH-B-R-10-01', qty: 80 }), //  سائبٌ — مسموح
  ];
  const pool = sourceStock(balances, locations, 'RH-A-R-01-01');
  assert.equal(pool.length, 1);
  assert.equal(pool[0].bin, 'RH-B-R-10-01');
});

test('والوجهُ لا يُزوَّد من نفسِه، وبضاعةٌ بلا رفٍّ لا يُرسَل إليها عامل', () => {
  const locations = [FACE(), BULK()];
  const balances = [
    bal({ bin: 'RH-A-R-01-01', qty: 10 }), // هو نفسُه
    bal({ bin: '', qty: 900 }), //            بلا رفّ
    bal({ bin: 'RH-B-R-10-01', qty: 40 }),
  ];
  const pool = sourceStock(balances, locations, 'RH-A-R-01-01');
  assert.equal(pool.length, 1);
  assert.equal(pool[0].bin, 'RH-B-R-10-01');
});

/* ══════════ ③ FEFO على التزويد ══════════ */

test('★★★ المصدرُ يُختار بـFEFO — فلا يُزوَّد الوجهُ بالأحدث والأقدمُ راكد', () => {
  const locations = [FACE(), BULK({ code: 'RH-B-R-10-01' }), BULK({ code: 'RH-B-R-20-01' })];
  const balances = [
    bal({ bin: 'RH-B-R-20-01', batch: 'جديدة', expiry: '2028-01-01', qty: 500 }),
    bal({ bin: 'RH-B-R-10-01', batch: 'قديمة', expiry: '2027-01-01', qty: 500 }),
  ];
  const face = pickFaceState(FACE(), []); // فارغٌ ⟹ نقصٌ 100
  const task = planFace(face, { balances, locations, nowMs: NOW, warehouse: 'RH' });

  assert.equal(task.planned, 100);
  assert.equal(task.moves.length, 1);
  assert.equal(task.moves[0].batch, 'قديمة', 'زُوِّد الوجهُ بالأحدث — فيبقى الأقدمُ حتّى يبلغ تاريخَه في الرفّ');
  assert.equal(task.moves[0].fromBin, 'RH-B-R-10-01');
  assert.equal(task.moves[0].toBin, 'RH-A-R-01-01');
  assert.equal(task.shortfallQty, 0);
});

test('★★ والمنتهي لا يُنقل إلى وجه التجهيز — ولا تُسحب بضاعةٌ لتُرفض عند الشحن', () => {
  const locations = [FACE(), BULK()];
  const balances = [
    bal({ bin: 'RH-B-R-10-01', batch: 'منتهية', expiry: '2026-01-01', qty: 500 }),
    bal({ bin: 'RH-B-R-10-01', batch: 'سليمة', expiry: '2027-06-01', qty: 60 }),
  ];
  const task = planFace(pickFaceState(FACE(), []), { balances, locations, nowMs: NOW, warehouse: 'RH' });
  assert.equal(task.planned, 60);
  assert.ok(task.moves.every((m) => m.batch !== 'منتهية'), 'نُقلت دفعةٌ منتهيةٌ إلى وجه التجهيز');
  assert.equal(task.shortfallQty, 40);
});

test('وبلا تمرير الوقت لا يُحكَم على الصلاحية — ولا تُهدر بضاعةٌ بحكمٍ بلا تاريخ', () => {
  const locations = [FACE(), BULK()];
  const balances = [bal({ bin: 'RH-B-R-10-01', expiry: '2026-01-01', qty: 500 })];
  const task = planFace(pickFaceState(FACE(), []), { balances, locations, warehouse: 'RH' });
  assert.equal(task.planned, 100, 'استُبعدت دفعةٌ بحكمٍ على تاريخٍ بلا «الآن»');
});

/* ══════════ ④ لا مهمّةَ تُخترع ══════════ */

test('★★★ بلا مصدرٍ تُعلَن المهمّةُ بعجزها وسببِه — لا تُكتَم ولا تُخترع كمّيّة', () => {
  const locations = [FACE(), BULK()];
  const task = planFace(pickFaceState(FACE(), []), { balances: [], locations, nowMs: NOW, warehouse: 'RH' });
  assert.equal(task.planned, 0);
  assert.equal(task.wanted, 100);
  assert.equal(task.shortfallQty, 100);
  assert.ok(task.shortfallReason.includes('لا مخزونَ سائبًا'), task.shortfallReason);
  assert.ok(task.shortfallReason.includes('استلامًا'), 'لم يُقل ما العمل — فالمهمّةُ بلاغٌ لا قرار');
});

test('والعجزُ الجزئيُّ يُسمّى برقمَيه', () => {
  const locations = [FACE(), BULK()];
  const balances = [bal({ bin: 'RH-B-R-10-01', qty: 30 })];
  const task = planFace(pickFaceState(FACE(), []), { balances, locations, nowMs: NOW, warehouse: 'RH' });
  assert.equal(task.planned, 30);
  assert.equal(task.shortfallQty, 70);
  assert.ok(task.shortfallReason.includes('30') && task.shortfallReason.includes('100'), task.shortfallReason);
});

test('ووجهٌ مختلطٌ بلا صنفٍ معروفٍ لا تُولَّد له مهمّة — ولا يُخترع صنف', () => {
  const locations = [FACE({ pickSku: '' }), BULK()];
  const balances = [
    { bin: 'RH-A-R-01-01', sku: 'A', warehouse: 'RH', qty: 1 },
    { bin: 'RH-A-R-01-01', sku: 'B', warehouse: 'RH', qty: 1 },
  ];
  const face = pickFaceState(FACE({ pickSku: '' }), balances);
  const task = planFace(face, { balances, locations, nowMs: NOW, warehouse: 'RH' });
  assert.ok(task.problem.includes('لا صنفَ معروف'), task.problem);
});

test('ولا نقصَ ⟹ لا مهمّة', () => {
  const face = pickFaceState(FACE(), [bal({ bin: 'RH-A-R-01-01', qty: 90 })]);
  const task = planFace(face, { balances: [], locations: [FACE()], nowMs: NOW });
  assert.ok(task.problem.includes('لا نقص'), task.problem);
});

/* ══════════ ⑤ الخطّةُ كاملةً ══════════ */

test('★★ خطّةٌ كاملةٌ: الفارغُ أوّلًا، وما له مصدرٌ يتقدّم ما لا مصدرَ له', () => {
  const locations = [
    FACE({ code: 'RH-A-R-01-01', pickSku: 'ITM-1' }), // فارغٌ وله مصدر
    FACE({ code: 'RH-A-R-02-01', pickSku: 'ITM-9' }), // فارغٌ ولا مصدرَ له
    FACE({ code: 'RH-A-R-03-01', pickSku: 'ITM-1', replenishMin: 20, replenishMax: 60 }), // ناقصٌ وله مصدر
    BULK(),
  ];
  const balances = [
    bal({ bin: 'RH-B-R-10-01', sku: 'ITM-1', qty: 1000 }),
    bal({ bin: 'RH-A-R-03-01', sku: 'ITM-1', qty: 15 }),
  ];
  const out = replenishPlan({ locations, balances, nowMs: NOW, warehouse: 'RH' });

  assert.equal(out.tasks.length, 3);
  assert.equal(out.counts.sourced, 2);
  assert.equal(out.counts.unsourced, 1);
  // ما له مصدرٌ أوّلًا — فالعاملُ لا يقرأ مهمّتين لا تُنفَّذان قبل أن يجد عملَه.
  assert.ok(out.tasks[0].planned > 0, 'مهمّةٌ بلا مصدرٍ صُدِّرت رأسَ الطابور');
  assert.equal(out.tasks[0].code, undefined);
  assert.equal(out.tasks[0].bin, 'RH-A-R-01-01', 'الفارغُ الذي له مصدرٌ لم يسبق');
  assert.equal(out.tasks[2].planned, 0);
  assert.equal(out.unsourced.length, 1);
  assert.equal(out.unsourced[0].sku, 'ITM-9');
});

test('★★ بلا وجهِ تجهيزٍ معلَنٍ تُقال الحقيقةُ ولا يُصمت — وتُقال خطواتُ العلاج', () => {
  const out = replenishPlan({ locations: [BULK()], balances: [], nowMs: NOW });
  assert.equal(out.tasks.length, 0);
  assert.ok(out.problem.includes('لا وجهَ تجهيزٍ معلَنًا'), out.problem);
  assert.ok(out.problem.includes('أعلِن'), 'لم تُقل خطوةُ العلاج');
});

test('وسيّدٌ فارغٌ يُقال سببُه', () => {
  const out = replenishPlan({ locations: [], balances: [], nowMs: NOW });
  assert.ok(out.problem.includes('سيّد المواقع فارغ'), out.problem);
});

test('ولا مهمّةَ لوجهٍ كافٍ — فلا ضجيج', () => {
  const locations = [FACE(), BULK()];
  const balances = [bal({ bin: 'RH-A-R-01-01', qty: 95 }), bal({ bin: 'RH-B-R-10-01', qty: 900 })];
  const out = replenishPlan({ locations, balances, nowMs: NOW, warehouse: 'RH' });
  assert.equal(out.tasks.length, 0);
  assert.equal(out.counts.ok, 1);
  assert.equal(out.problem, '');
});

/* ══════════ ⑥ الإطلاقُ طورٌ مستقلّ ══════════ */

test('★★★ الإطلاقُ مستقلٌّ عن التكوين — ومقترَحةٌ لم تُطلَق لا تظهر للعامل', () => {
  const locations = [FACE(), BULK()];
  const balances = [bal({ bin: 'RH-B-R-10-01', qty: 900 })];
  const task = planFace(pickFaceState(FACE(), []), { balances, locations, nowMs: NOW, warehouse: 'RH' });
  assert.equal(task.state, REPLENISH_STATES.suggested.id);

  const v = releaseVerdict(task, { actor: 'U1' });
  assert.equal(v.ok, true, v.problem);
  assert.equal(v.task.state, REPLENISH_STATES.released.id);
  assert.equal(v.task.releasedBy, 'U1');
  // ولا تُطلَق مرّتين.
  assert.equal(releaseVerdict(v.task, { actor: 'U1' }).ok, false);
});

test('★★ ومهمّةٌ بلا مصدرٍ لا تُطلَق بلا سبب — العاملُ سيقف فليُعلَم لماذا أُرسل', () => {
  const task = planFace(pickFaceState(FACE(), []), { balances: [], locations: [FACE(), BULK()], nowMs: NOW });
  assert.equal(releaseVerdict(task, { actor: 'U1' }).ok, false);
  assert.ok(releaseVerdict(task, { actor: 'U1' }).problem.includes('بلا سبب'));
  const ok = releaseVerdict(task, { actor: 'U1', reason: 'اذهب وتحقّق بالعين — الجردُ متأخّر' });
  assert.equal(ok.ok, true, ok.problem);
  assert.ok(ok.task.releaseReason.includes('بالعين'));
});

test('وإطلاقٌ بلا فاعلٍ يُردّ', () => {
  const task = planFace(pickFaceState(FACE(), []), { balances: [bal({ bin: 'RH-B-R-10-01' })], locations: [FACE(), BULK()], nowMs: NOW });
  assert.equal(releaseVerdict(task, {}).ok, false);
  assert.equal(releaseVerdict(null, { actor: 'U1' }).ok, false);
});

/* ══════════ ⑦ السطرُ المقروء ══════════ */

test('سطرُ المهمّة يقول من أين وإلى أين وكم — بالدفعة', () => {
  const locations = [FACE(), BULK()];
  const balances = [bal({ bin: 'RH-B-R-10-01', batch: 'L7', expiry: '2027-01-01', qty: 900 })];
  const task = planFace(pickFaceState(FACE(), []), { balances, locations, nowMs: NOW, warehouse: 'RH' });
  const line = taskSummary(task);
  assert.ok(line.includes('ITM-1') && line.includes('L7') && line.includes('100'), line);

  const dry = planFace(pickFaceState(FACE(), []), { balances: [], locations, nowMs: NOW });
  assert.ok(taskSummary(dry).includes('مطلوبةً'), taskSummary(dry));
  assert.equal(taskSummary(null), '');
});
