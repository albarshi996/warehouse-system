/**
 * اختبارات المسح الثلاثيّ — الموانع السبعة التي تجعل كلّ سحبةٍ مبرهنةً لا مظنونة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_STAGES,
  applyPick,
  binVerdict,
  buildIssuePallet,
  itemVerdict,
  nextStage,
  palletVerdict,
  picksOfTask,
  pickVerdict,
  qtyVerdict,
  takeFromPallet,
} from './pickingScan.js';

const STEP = {
  seq: 1, bin: 'MAIN-A01-R01-B01', sku: 'WNW-001', barcode: '6221',
  batch: 'B2408', expiry: '2027-01-01', required: 24, picked: 0, state: 'PENDING',
};
const TASK = { state: 'OPEN', warehouse: 'MAIN', steps: [STEP, { ...STEP, seq: 2, bin: 'MAIN-A01-R02-B01', sku: 'WNW-002', batch: 'B2409', required: 10 }] };

const UNIT = {
  code: 'LPN-MAIN-20260827-000001',
  state: 'STORED',
  flags: [],
  warehouse: 'MAIN',
  bin: 'MAIN-A01-R01-B01',
  lines: [{ sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'carton', factor: 12, qty: 5, baseQty: 60 }],
};
const CTX = { unit: UNIT, asOf: '2026-08-27' };

test('المرحلة التالية تُشتقّ ممّا مُسح لا من عدّادٍ في الشاشة', () => {
  assert.equal(nextStage({}), 'BIN');
  assert.equal(nextStage({ bin: 'X' }), 'PALLET');
  assert.equal(nextStage({ bin: 'X', lpn: 'Y' }), 'ITEM');
  assert.equal(nextStage({ bin: 'X', lpn: 'Y', sku: 'Z' }), 'QTY');
  assert.equal(SCAN_STAGES.BIN, 'امسح باركود الرفّ');
});

test('① موقعٌ مخالف يُردّ — والرسالة تسمّي المطلوب والممسوح', () => {
  const v = binVerdict(TASK, 'MAIN-A09-R09-B09');
  assert.ok(!v.ok);
  assert.match(v.message, /MAIN-A01-R01-B01/, 'تسمّي المطلوب');
  assert.match(v.message, /MAIN-A09-R09-B09/, 'وتسمّي الممسوح');
  assert.ok(binVerdict(TASK, 'main a01 r01 b01').ok, 'التطبيع قبل المقارنة');
  assert.match(binVerdict(TASK, '').message, /غير مقروء فعليًّا/);
  assert.match(binVerdict({ steps: [] }, 'X').message, /لا خطوةَ جارية/);
});

test('④ طبليةٌ في رفٍّ آخر تُردّ — إمّا نُقلت بلا تسجيل وإمّا هذه أخرى', () => {
  const elsewhere = { ...UNIT, bin: 'MAIN-A05-R01-B01' };
  const v = palletVerdict(STEP, UNIT.code, elsewhere);
  assert.ok(!v.ok);
  assert.match(v.message, /نُقلت بلا تسجيل/);
});

test('★★★ ④ الوسم الحاجب يمنع الصرف — «الصرف من طبلية محجوزة أو تحت الفحص» ممنوع', () => {
  for (const flag of ['GOVERNANCE_HOLD', 'INSPECTION', 'DAMAGED', 'EXPIRED']) {
    const blocked = { ...UNIT, flags: [flag] };
    const v = palletVerdict(STEP, UNIT.code, blocked);
    assert.ok(!v.ok, `«${flag}» يمنع`);
    assert.match(v.message, /لا يُصرف منها/);
    assert.match(v.message, /قرار حوكمة/, 'وتقول المخرج');
  }
  // «تحت الجرد» لا يحجب — الجرد يلتقط والعمل يمضي (ق-٣).
  assert.ok(palletVerdict(STEP, UNIT.code, { ...UNIT, flags: ['UNDER_COUNT'] }).ok);
});

test('الطبلية المجهولة أو غير الملصق تُردّان — والحالة غير الصالحة كذلك', () => {
  assert.match(palletVerdict(STEP, 'B2408', UNIT).message, /ليس ملصق طبلية/);
  assert.match(palletVerdict(STEP, UNIT.code, null).message, /غير موجودة في السجلّ/);
  assert.match(palletVerdict(STEP, UNIT.code, { ...UNIT, state: 'ISSUED' }).message, /لا يُسحب منها/);
});

test('★★ ② صنفٌ غير مخصّصٍ للخطوة يُردّ', () => {
  const v = itemVerdict(STEP, { sku: 'WNW-999' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /المطلوب «WNW-001»/);
  assert.match(v.message, /غير مخصّصٍ لهذه الخطوة/);
  assert.ok(itemVerdict(STEP, { sku: 'wnw-001', batch: 'b2408' }, CTX).ok, 'التطبيع');
  assert.ok(itemVerdict(STEP, { barcode: '6221', batch: 'B2408' }, CTX).ok, 'الباركود يقبل أيضًا');
});

test('★★★ ② دفعةٌ غير المخصَّصة تُردّ — الأقرب انتهاءً أوّلًا وإلّا فسد القديم', () => {
  const v = itemVerdict(STEP, { sku: 'WNW-001', batch: 'B9999' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /المخصَّص دفعة «B2408»/);
  assert.match(v.message, /FEFO/);
  assert.match(v.message, /يترك القديم يفسد/, 'تقول لماذا لا كلمة «ممنوع»');
});

test('★★ ⑤ الدفعة المنتهية لا تُصرف بحال', () => {
  const v = itemVerdict({ ...STEP, expiry: '2026-01-01' }, { sku: 'WNW-001', batch: 'B2408' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /منتهيةٌ منذ 2026-01-01/);
  assert.match(v.message, /أبلغ الحوكمة/);
});

test('★★★ ③ كمّيّةٌ فوق المطلوب تُردّ — حمايةُ الأمر من تنفيذٍ زائد', () => {
  const v = qtyVerdict(STEP, UNIT, 30);
  assert.ok(!v.ok);
  assert.match(v.message, /المطلوب من هذه الخطوة 24/);
  assert.match(v.message, /لا تأخذ أكثر ممّا طُلب/);
  assert.ok(qtyVerdict(STEP, UNIT, 24).ok, 'الحدّ تمامًا يمرّ');
  assert.ok(qtyVerdict({ ...STEP, picked: 20 }, UNIT, 4).ok, 'والباقي بعد سحبٍ جزئيّ');
  assert.match(qtyVerdict({ ...STEP, picked: 20 }, UNIT, 5).message, /المطلوب من هذه الخطوة 4/);
});

test('★★★ ⑦ كمّيّةٌ فوق ما تحمله الطبلية تُردّ — حمايةُ الحقيقة من رصيدٍ سالب', () => {
  const thin = { ...UNIT, lines: [{ sku: 'WNW-001', batch: 'B2408', baseQty: 10 }] };
  const v = qtyVerdict(STEP, thin, 20);
  assert.ok(!v.ok);
  assert.match(v.message, /على الطبلية 10/);
  assert.match(v.message, /لا يُسالَب/);
  assert.match(v.message, /طبليةٍ أخرى/, 'وتقول الصواب');
});

test('الكمّيّة صفرٌ فما دون تُردّ', () => {
  assert.match(qtyVerdict(STEP, UNIT, 0).message, /أكبر من صفر/);
  assert.match(qtyVerdict(STEP, UNIT, -5).message, /أكبر من صفر/);
});

test('★★ الحكم الكامل يمرّ بالمراحل الأربع بترتيبها — ويقول أين وقف', () => {
  const good = pickVerdict(TASK, { bin: STEP.bin, lpn: UNIT.code, sku: 'WNW-001', batch: 'B2408', qty: 24 }, CTX);
  assert.ok(good.ok, good.message);
  assert.equal(good.stage, 'DONE');
  assert.deepEqual(good.pick, {
    seq: 1, bin: 'MAIN-A01-R01-B01', lpn: 'LPN-MAIN-20260827-000001',
    sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', qty: 24,
  });

  assert.equal(pickVerdict(TASK, { bin: 'X-1' }, CTX).stage, 'BIN');
  assert.equal(pickVerdict(TASK, { bin: STEP.bin, lpn: 'ليس' }, CTX).stage, 'PALLET');
  assert.equal(pickVerdict(TASK, { bin: STEP.bin, lpn: UNIT.code, sku: 'XX' }, CTX).stage, 'ITEM');
  assert.equal(pickVerdict(TASK, { bin: STEP.bin, lpn: UNIT.code, sku: 'WNW-001', batch: 'B2408', qty: 99 }, CTX).stage, 'QTY');
});

test('★★ السحبة تُقفل الخطوة عند بلوغ المطلوب — ودونه تبقى مفتوحةً للباقي', () => {
  const partial = applyPick(TASK, { seq: 1, qty: 10 });
  assert.equal(partial.steps[0].picked, 10);
  assert.equal(partial.steps[0].state, 'PENDING', 'لم يبلغ المطلوب بعد');
  assert.equal(partial.state, 'IN_PROGRESS');

  const done = applyPick(partial, { seq: 1, qty: 14 });
  assert.equal(done.steps[0].picked, 24);
  assert.equal(done.steps[0].state, 'DONE');
  assert.equal(TASK.steps[0].picked, 0, 'الأصل لا يُعدَّل — نسخٌ لا طفرة');
});

test('ما يُسحب من الأمّ بصيغة طبقة المحتويات — موضعٌ واحدٌ يحكم المحتوى', () => {
  const t = takeFromPallet({ sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', qty: 24 });
  assert.equal(t.sku, 'WNW-001');
  assert.equal(t.qty, 24);
});

// ═══ LPN-304 — طبلية الصرف بنسبها ═══

test('★★★ طبليةُ الصرف هويّةٌ جديدة تسمّي كلّ مصادرها — لا هويّةَ أمٍّ تكذب عن الباقي', () => {
  const picks = [
    { seq: 1, lpn: 'LPN-MAIN-20260827-000001', sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'carton', factor: 12, qty: 2, baseQty: 24 },
    { seq: 2, lpn: 'LPN-MAIN-20260827-000002', sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'carton', factor: 12, qty: 3, baseQty: 36 },
    { seq: 3, lpn: 'LPN-MAIN-20260827-000003', sku: 'WNW-002', batch: 'B2409', expiry: '', uom: 'piece', factor: 1, qty: 10, baseQty: 10 },
  ];
  const r = buildIssuePallet(picks, {
    code: 'LPN-MAIN-20260827-000050', warehouse: 'main',
    sourceDoc: { type: 'PICK', number: 'PICK-2026-0021' }, actor: 'سالم',
  });
  assert.equal(r.problem, undefined);
  assert.equal(r.pallet.code, 'LPN-MAIN-20260827-000050');
  assert.equal(r.pallet.state, 'PICKING', 'تولد قيد التحضير');
  assert.equal(r.pallet.warehouse, 'MAIN');
  assert.deepEqual(r.pallet.parentCodes, [
    'LPN-MAIN-20260827-000001', 'LPN-MAIN-20260827-000002', 'LPN-MAIN-20260827-000003',
  ], 'كلُّ مصدرٍ مسمًّى');

  assert.equal(r.pallet.lines.length, 2, 'سحبتان لدفعةٍ واحدة بندٌ واحد');
  const merged = r.pallet.lines[0];
  assert.equal(merged.qty, 5);
  assert.equal(merged.baseQty, 60);
});

test('★★ النسب سطريٌّ لا رأسيٌّ فقط — «هذه الكرتونة من أيّ حمولة» لا «من إحدى هذه»', () => {
  const picks = [
    { lpn: 'LPN-MAIN-20260827-000001', sku: 'WNW-001', batch: 'B2408', uom: 'carton', qty: 2, baseQty: 24 },
    { lpn: 'LPN-MAIN-20260827-000002', sku: 'WNW-001', batch: 'B2408', uom: 'carton', qty: 3, baseQty: 36 },
  ];
  const line = buildIssuePallet(picks, { code: 'LPN-MAIN-20260827-000051', actor: 'سالم' }).pallet.lines[0];
  assert.equal(line.from.length, 2);
  assert.deepEqual(line.from, [
    { lpn: 'LPN-MAIN-20260827-000001', qty: 2 },
    { lpn: 'LPN-MAIN-20260827-000002', qty: 3 },
  ], 'أيّ طبليةٍ أسهمت وبكم');
});

test('طبليةُ الصرف ترفض: هويّةً بيدٍ أو بلا سحبةٍ أو بلا فاعل', () => {
  const one = [{ lpn: 'LPN-MAIN-20260827-000001', sku: 'X', qty: 1 }];
  assert.match(buildIssuePallet(one, { code: 'يدوي-1', actor: 'س' }).problem, /من العدّاد لا من اليد/);
  assert.match(buildIssuePallet([], { code: 'LPN-MAIN-20260827-000052', actor: 'س' }).problem, /بلا سحبةٍ واحدة/);
  assert.match(buildIssuePallet(one, { code: 'LPN-MAIN-20260827-000052' }).problem, /بلا فاعل/);
});

test('★★★ الخطوة تسجّل من أيّ طبليةٍ جاءت كلّ سحبة — خطوةٌ من طبليتين نسبٌ محفوظ', () => {
  // الأولى نفدت عند ١٠ والباقي من الثانية — وهو واقعُ مستودعٍ لا حالةٌ نادرة.
  let t = applyPick(TASK, { seq: 1, qty: 10, lpn: 'LPN-MAIN-20260827-000001' });
  t = applyPick(t, { seq: 1, qty: 14, lpn: 'LPN-MAIN-20260827-000002' });
  assert.equal(t.steps[0].picked, 24);
  assert.deepEqual(t.steps[0].picks, [
    { lpn: 'LPN-MAIN-20260827-000001', qty: 10 },
    { lpn: 'LPN-MAIN-20260827-000002', qty: 14 },
  ]);

  // وسحبتان من الطبلية نفسها تُدمجان في سطرٍ واحد لا سطرين.
  const same = applyPick(applyPick(TASK, { seq: 1, qty: 5, lpn: 'LPN-MAIN-20260827-000001' }), { seq: 1, qty: 5, lpn: 'LPN-MAIN-20260827-000001' });
  assert.equal(same.steps[0].picks.length, 1);
  assert.equal(same.steps[0].picks[0].qty, 10);
});

test('★★ سحبات المهمّة تُسطَّح للتكوين — وتُشتقّ ولا تُخزَّن ثانيةً', () => {
  let t = applyPick(TASK, { seq: 1, qty: 10, lpn: 'LPN-MAIN-20260827-000001' });
  t = applyPick(t, { seq: 2, qty: 10, lpn: 'LPN-MAIN-20260827-000003' });
  const picks = picksOfTask(t);
  assert.equal(picks.length, 2);
  assert.equal(picks[0].sku, 'WNW-001');
  assert.equal(picks[1].sku, 'WNW-002');
  assert.equal(picks[0].lpn, 'LPN-MAIN-20260827-000001');

  // والنسب يعبر فعلًا إلى الحمولة الخارجة.
  const pallet = buildIssuePallet(picks, { code: 'LPN-MAIN-20260827-000060', actor: 'سالم' }).pallet;
  assert.deepEqual(pallet.parentCodes, ['LPN-MAIN-20260827-000001', 'LPN-MAIN-20260827-000003']);
});
