/**
 * حارس دورة طلب الفرع التسع ‹FNB-401›.
 *
 * أخطر ما يحرسه: **الفحص موصولٌ بين السحب والتعبئة** (وكان مقطوعًا)،
 * و**لا يُغلق طلبٌ وله فرقٌ غير مسوّى**، و**لا رصيدَ محجوزٌ إلى الأبد**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCH_CYCLE_STAGES, CYCLE_CLOSED, stageOf, cycleProgress,
  receiptVariance, closureVerdict, releaseOnClose, varianceReasonContextExists,
  receivingExceptions, varianceEntries, RECEIPT_GRACE_DAYS, VARIANCE_TOLERANCE_PCT,
} from './branchCycle.js';
import { derivationTargets, derivationTargetsFor } from './chain.js';
import { getSchema } from './schemas/index.js';
import { EXCEPTION_TYPES, shapeException } from '../ledger/exceptions.js';
import { partyFieldFor } from './partyFields.js';
import { ORG_FIELDS, indexLocations, rollupBy } from '../org/orgLocations.js';

const doc = (type, state, lines = []) => ({ type, state, lines });

test('★ المراحل التسع كلّها — ومستند كلّ مرحلةٍ مبنيٌّ فعلًا', () => {
  assert.equal(BRANCH_CYCLE_STAGES.length, 9);
  const labels = BRANCH_CYCLE_STAGES.map((s) => s.label);
  for (const wanted of ['طلب الفرع', 'مراجعة', 'اعتماد', 'حجز مخزون', 'سحب', 'فحص', 'تعبئة', 'شحن', 'استلام الفرع']) {
    assert.ok(labels.includes(wanted), `المرحلة «${wanted}» غائبة`);
  }
  for (const s of BRANCH_CYCLE_STAGES) {
    if (s.docType) assert.ok(getSchema(s.docType), `المرحلة «${s.id}» تَعِد بمستند «${s.docType}» غير مبنيّ`);
  }
  // والحجز أثرٌ لا مستند — فلا يُخترع مستندٌ لكلّ خطوةٍ في نصٍّ إداريّ.
  assert.equal(stageOf('reserve').docType, null);
});

test('★★ الفحص موصولٌ بين السحب والتعبئة — وكان مقطوعًا', () => {
  // ① السحب يتفرّع: تعبئةٌ مباشرة (سلوك اليوم) أو فحصٌ قبلها.
  assert.deepEqual(derivationTargets('PICK'), ['PACK', 'QC']);
  // ② ومن الجودة سبيلٌ إلى التعبئة — وهو ما لم يكن.
  assert.ok(derivationTargets('QC').includes('PACK'));
  // ③ وسلوك الوارد لم يُمسّ: التخزين وإشعار الرفض باقيان.
  assert.ok(derivationTargets('QC').includes('PUTAWAY'));
  assert.ok(derivationTargets('QC').includes('SRN'));
});

test('★ ولا يُخلط فحصُ الوارد بفحص الصادر — الوجهة بالسياق لا بالنوع', () => {
  // فحصٌ مشتقٌّ من استلامٍ: يُخزَّن أو يُرفض، ولا يُعبَّأ.
  const inbound = { type: 'QC', links: [{ type: 'GRN', number: 'GRN-1' }] };
  assert.deepEqual(derivationTargetsFor(inbound).sort(), ['PUTAWAY', 'SRN']);
  // وفحصٌ مشتقٌّ من سحبٍ: يُعبَّأ وحسب.
  const outbound = { type: 'QC', links: [{ type: 'PICK', number: 'PICK-1' }] };
  assert.deepEqual(derivationTargetsFor(outbound), ['PACK']);
  // والمجهول لا يُقصّ: بلا أبٍ معروفٍ تُعرض الوجهات كلّها كما اليوم.
  assert.deepEqual(derivationTargetsFor({ type: 'QC' }).sort(), ['PACK', 'PUTAWAY', 'SRN']);
  // والأنواع الأخرى لا يمسّها التخصيص.
  assert.deepEqual(derivationTargetsFor({ type: 'PICK' }), derivationTargets('PICK'));
});

test('موضع الدورة يُقرأ من مستنداتها — والحجز يُستنتج من الاعتماد', () => {
  const early = cycleProgress([doc('TR', 'submitted')]);
  assert.equal(early.stage, 'review');
  assert.ok(!early.reached.includes('reserve'));

  const approved = cycleProgress([doc('TR', 'approved')]);
  assert.ok(approved.reached.includes('reserve'), 'الحجز واقعٌ بمجرّد الاعتماد');

  const shipped = cycleProgress([doc('TR', 'approved'), doc('PICK', 'done'), doc('PACK', 'done'), doc('TRN', 'done')]);
  assert.equal(shipped.stage, 'ship');
  assert.ok(shipped.missing.includes('receive'));
  assert.ok(!shipped.missing.includes('inspect'), 'الفحص اختياريّ فلا يُعدّ ناقصًا');
});

test('الإغلاق حالةٌ ختاميّة لا مرحلةَ عمل', () => {
  const done = cycleProgress([doc('TR', 'approved'), doc('PICK', 'done'), doc('PACK', 'done'), doc('TRN', 'done'), doc('TRC', 'done')], { closed: true });
  assert.equal(done.stage, CYCLE_CLOSED);
  assert.equal(done.pct, 100);
  assert.ok(!BRANCH_CYCLE_STAGES.some((s) => s.id === CYCLE_CLOSED));
});

test('فرق الاستلام يُقاس بين ما شُحن وما استُلم — والمطابق لا يُذكر', () => {
  const v = receiptVariance(
    [{ sku: 'A', qtyShipped: 100 }, { sku: 'B', qtyShipped: 50 }],
    [{ sku: 'A', qtyReceived: 90 }, { sku: 'B', qtyReceived: 50 }]
  );
  assert.equal(v.length, 1);
  assert.equal(v[0].sku, 'A');
  assert.equal(v[0].variance, -10);
});

test('★★ لا يُغلق طلبٌ وله فرقٌ غير مسوّى — والرفض يقول الصواب', () => {
  const received = cycleProgress([doc('TR', 'approved'), doc('PICK', 'done'), doc('PACK', 'done'), doc('TRN', 'done'), doc('TRC', 'done')]);
  const variance = [{ sku: 'A', shipped: 100, received: 90, variance: -10 }];

  const blocked = closureVerdict(received, { variance });
  assert.equal(blocked.ok, false);
  assert.match(blocked.problems[0], /فرقٌ غير مسوًّى/);
  assert.match(blocked.problems[0], /يُخفي نقصًا في مخزون الفرع/);

  // ويُسوّى بمستندٍ يغطّي الصنف…
  assert.equal(closureVerdict(received, { variance, settledBy: [doc('ADJ', 'done', [{ sku: 'A' }])] }).ok, true);
  // …أو بسببٍ مكتوب.
  assert.equal(closureVerdict(received, { variance, reason: 'نقصٌ أقرّ به الناقل' }).ok, true);
  // وبلا فرقٍ يُغلق مباشرةً.
  assert.equal(closureVerdict(received, { variance: [] }).ok, true);
});

test('ولا إغلاق قبل استلام الفرع — الدورة تُختم بوصول البضاعة', () => {
  const shipped = cycleProgress([doc('TR', 'approved'), doc('PICK', 'done'), doc('PACK', 'done'), doc('TRN', 'done')]);
  const v = closureVerdict(shipped, {});
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /لا إغلاق قبل استلام الفرع/);
  // والمغلَق لا يُغلق مرّتين.
  assert.equal(closureVerdict({ ...shipped, closed: true }, {}).ok, false);
});

test('★ الإغلاق يحرّر الحجز — لا رصيدَ محجوزٌ إلى الأبد', () => {
  const release = releaseOnClose(
    [{ sku: 'A', warehouse: 'MAIN', qty: 10 }, { sku: 'B', warehouse: 'MAIN', qty: 0 }],
    { branch: 'MAIN' }
  );
  assert.equal(release.length, 1, 'الصفر لا يُحرَّر');
  assert.equal(release[0].qty, -10, 'التحرير سالبٌ للحجز');
  // ومخزنٌ آخر لا يُمسّ.
  assert.deepEqual(releaseOnClose([{ sku: 'A', warehouse: 'OTHER', qty: 5 }], { branch: 'MAIN' }), []);
});

test('سبب الفرق من سجلّ الأسباب القائم — لا قائمةٌ ثانية', () => {
  assert.equal(varianceReasonContextExists(), true);
});

/* ═══════════ ‹FNB-402› فرق استلام الفرع ═══════════ */

const SHIPMENT = {
  number: 'TRN-77', id: 'd77', branch: 'BR01', shippedAtDay: '2026-08-10',
  lines: [{ sku: 'A', qtyShipped: 100 }, { sku: 'B', qtyShipped: 50 }],
};

test('★ الفرق يستعمل النوع القائم `transit_variance` — لا نوعَ ثانٍ لمعنًى واحد', () => {
  const receipt = { state: 'done', lines: [{ sku: 'A', qtyReceived: 90 }, { sku: 'B', qtyReceived: 50 }] };
  const exc = receivingExceptions(SHIPMENT, receipt, { today: '2026-08-11' });
  assert.equal(exc.length, 1);
  assert.equal(exc[0].type, 'transit_variance');
  assert.ok(EXCEPTION_TYPES.transit_variance, 'النوع مبنيٌّ من قبل');
  assert.equal(exc[0].sku, 'A');
  assert.equal(exc[0].location, 'BR01');
  assert.match(exc[0].reason, /شُحن 100 واستُلم 90/);
  // ويصبّ في السجلّ بالحقول الثلاثة عشر.
  assert.equal(shapeException(exc[0]).type, 'transit_variance');
});

test('فرقٌ دون التسامح يُسجَّل ويمرّ — التنبيه للاستثناء لا للروتين', () => {
  const receipt = { state: 'done', lines: [{ sku: 'A', qtyReceived: 99 }, { sku: 'B', qtyReceived: 50 }] };
  assert.deepEqual(receivingExceptions(SHIPMENT, receipt, { today: '2026-08-11' }), []); // ٪١ < ٪٢
  assert.equal(VARIANCE_TOLERANCE_PCT, 2);
});

test('★ «نقلٌ لم يستلمه الفرع» بعد مهلته — والرصيد عالقٌ في مخزن النقل', () => {
  const late = receivingExceptions(SHIPMENT, null, { today: '2026-08-20' });
  assert.equal(late.length, 1);
  assert.equal(late[0].type, 'transfer_unreceived');
  assert.ok(EXCEPTION_TYPES.transfer_unreceived);
  assert.equal(late[0].qty, 150, 'الكمّيّة كلّها عالقة');
  assert.match(late[0].reason, /عالقٌ في مخزن النقل/);
  // وداخل المهلة لا يُنبَّه.
  assert.deepEqual(receivingExceptions(SHIPMENT, null, { today: '2026-08-11' }), []);
  assert.equal(RECEIPT_GRACE_DAYS, 3);
});

test('وبلا تاريخٍ مقروء لا يُحكم — لا حكمَ بجهل', () => {
  assert.deepEqual(receivingExceptions({ ...SHIPMENT, shippedAtDay: '' }, null, { today: '2026-08-20' }), []);
});

test('فروق الفروع تصعد الشجرة بمحرّك rollupBy — لا محرّكَ ثانٍ', () => {
  const tree = indexLocations([
    { code: 'FNB', nameAr: 'قطاع', level: 'sector' },
    { code: 'BRD1', nameAr: 'براند', level: 'brand', parentCode: 'FNB' },
    { code: 'BR01', nameAr: 'فرع', level: 'branch', parentCode: 'BRD1' },
  ]);
  const entries = varianceEntries([{ branch: 'BR01', variance: -10 }, { branch: 'BR01', variance: 4 }]);
  const { byLocation } = rollupBy(tree, entries);
  assert.equal(byLocation.get('FNB').rollup.receiptVariance, 14, 'المطلق يصعد');
});

/* ═══════════ ‹FNB-403› وجهة المطعم ═══════════ */

test('★ الوجهة تُختار من الشجرة — ولا اسمَ حقلٍ سادس في ORG_FIELDS', () => {
  const decl = partyFieldFor('destination');
  assert.equal(decl.source, 'orgLocation');
  assert.equal(decl.codeKey, 'destination');
  // ★★ حارس FNB-102 قائمٌ: البُعد يُختم من costCenter الموروث لا من اسمٍ سادس.
  assert.deepEqual(ORG_FIELDS, ['costCenter', 'budgetCode', 'orgCode', 'branch', 'sector']);
});

test('مركز التكلفة مُعلَنٌ على السحب — فيُرى ويُختم على الحركة', () => {
  const keys = (getSchema('PICK').sections || []).flatMap((sec) => (sec.fields || []).map((f) => f.key));
  assert.ok(keys.includes('destination'), 'الوجهة قائمةٌ من قبل');
  assert.ok(keys.includes('costCenter'), 'ومركز التكلفة صار معلَنًا');
});
