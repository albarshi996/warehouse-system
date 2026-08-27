/**
 * اختبارات التجهيز والتحميل — الأبواب الثلاثة التي تُغلق عند باب الشحن.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOADING_STATES,
  applyExtra,
  applyLoad,
  closeLoading,
  itemStockPicture,
  loadScanVerdict,
  loadingCloseProblem,
  loadingCounters,
  openLoading,
  stagedBalanceOf,
  stagingAssignVerdict,
  stagingDwellMs,
} from './stagingLoading.js';

const A = 'LPN-MAIN-20260827-000001';
const B = 'LPN-MAIN-20260827-000002';
const C = 'LPN-MAIN-20260827-000003';

const UNIT = { code: A, state: 'ISSUE_CLOSED', flags: [], warehouse: 'MAIN', route: 'R-BENGHAZI', lines: [{ sku: 'WNW-001', baseQty: 60 }] };
const CTX = { actor: 'سالم', at: '2026-08-27T10:00:00Z' };

/* ── التجهيز ── */

test('★★ منطقة التجهيز موقعٌ بنحو الكود القائم — لا كيانٌ موازٍ', () => {
  const v = stagingAssignVerdict(UNIT, 'main s01 r01 b01', { route: 'R-BENGHAZI' });
  assert.ok(v.ok, v.message);
  assert.equal(v.bin, 'MAIN-S01-R01-B01', 'مطبَّعًا بمطبّع المواقع');
  assert.match(stagingAssignVerdict(UNIT, '').message, /غير مقروء/);
});

test('🔒 لا تُجهَّز إلّا طبليةُ صرفٍ مغلقة', () => {
  assert.match(stagingAssignVerdict({ ...UNIT, state: 'STORED' }, 'MAIN-S01-R01-B01').message, /بعد إغلاقها طبليةَ صرف/);
});

test('★★★ طبليةُ فرعٍ في مسار فرعٍ آخر تُردّ — تخرج مع الشاحنة الخطأ', () => {
  const v = stagingAssignVerdict(UNIT, 'MAIN-S02-R01-B01', { route: 'R-TRIPOLI' });
  assert.ok(!v.ok);
  assert.match(v.message, /R-BENGHAZI/, 'تسمّي مسار الطبلية');
  assert.match(v.message, /R-TRIPOLI/, 'ومسار المنطقة');
  assert.match(v.message, /الشاحنة الخطأ/);
});

test('مدّة البقاء في التجهيز تُحسب من الأحداث — والغائب null لا صفر', () => {
  const ms = stagingDwellMs({ stagedAt: '2026-08-27T08:00:00Z' }, Date.parse('2026-08-27T10:00:00Z'));
  assert.equal(ms, 2 * 60 * 60 * 1000);
  assert.equal(stagingDwellMs({}, Date.now()), null);
});

/* ── التحميل ── */

test('★★ الجلسة تتبع رحلةً أو مستندًا وتحمل المتوقَّع — لا تحميلَ بلا أيّهما', () => {
  assert.match(openLoading({ expected: [A], actor: 'س' }).problem, /رحلةً أو مستندًا/);
  assert.match(openLoading({ tripId: 'TRIP-1', expected: [], actor: 'س' }).problem, /لا طبليةً متوقَّعة/);
  const r = openLoading({ tripId: 'TRIP-1', expected: [A, B, A], vehicle: 'ly-123', actor: 'سالم' });
  assert.equal(r.session.expected.length, 2, 'المكرّرة تُطوى');
  assert.equal(r.session.vehicle, 'LY-123');
  assert.equal(r.session.state, 'OPEN');
});

test('★★★ القاعدة ٨: لا تُحمَّل مرّتين — أخطرُ خطأٍ صامت', () => {
  let s = openLoading({ tripId: 'T1', expected: [A, B], actor: 'سالم' }).session;
  assert.ok(loadScanVerdict(s, A, UNIT).ok);
  s = applyLoad(s, A);
  const again = loadScanVerdict(s, A, UNIT);
  assert.ok(!again.ok);
  assert.equal(again.kind, 'DUPLICATE');
  assert.match(again.message, /محمَّلةٌ في هذه الرحلة أصلًا/);
});

test('★★★ القاعدة ٧: طبليةٌ خارج الرحلة تُردّ — تحميلُها هنا نقصٌ هناك', () => {
  const s = openLoading({ tripId: 'T1', expected: [A, B], actor: 'سالم' }).session;
  const v = loadScanVerdict(s, C, UNIT);
  assert.ok(!v.ok);
  assert.equal(v.kind, 'NOT_EXPECTED');
  assert.match(v.message, /ليست في هذه الرحلة/);
  assert.match(v.message, /نقصٌ هناك/);
});

test('🔒 الموسومة لا تُحمَّل — والملصق غير الصالح يُردّ', () => {
  const s = openLoading({ tripId: 'T1', expected: [A], actor: 'سالم' }).session;
  const v = loadScanVerdict(s, A, { ...UNIT, flags: ['DAMAGED'] });
  assert.equal(v.kind, 'BLOCKED');
  assert.match(v.message, /تالفة/);
  assert.match(loadScanVerdict(s, 'B2408', UNIT).message, /ليس ملصق طبلية/);
});

test('★★ العدّاد اللحظيّ: المطلوب والمقروء والمتبقّي — ويسمّي الناقصة', () => {
  let s = openLoading({ tripId: 'T1', expected: [A, B], actor: 'سالم' }).session;
  s = applyLoad(s, A);
  const c = loadingCounters(s);
  assert.deepEqual({ expected: c.expected, loaded: c.loaded, missing: c.missing, complete: c.complete }, { expected: 2, loaded: 1, missing: 1, complete: false });
  assert.deepEqual(c.missingList, [B]);
  assert.ok(loadingCounters(applyLoad(s, B)).complete);
});

test('★★★ لا تُغلق الرحلة ناقصةً — والاستثناء بسببٍ لأنّ السائق ينتظر', () => {
  let s = openLoading({ tripId: 'T1', expected: [A, B], actor: 'سالم' }).session;
  s = applyLoad(s, A);

  const p = loadingCloseProblem(s);
  assert.match(p, /لم تُحمَّل/);
  assert.match(p, /LPN-MAIN-20260827-000002/, 'تسمّي الناقصة');
  assert.match(p, /أغلق بصلاحيةٍ وسبب/, 'وتقول المخرج');

  assert.match(loadingCloseProblem(s, { override: true }), /سببًا مكتوبًا/);
  assert.equal(loadingCloseProblem(s, { override: true, overrideNote: 'الطبلية تالفةٌ وأُخرجت بقرار المشرف' }), '');

  const full = applyLoad(s, B);
  assert.equal(loadingCloseProblem(full), '', 'المكتملة تُغلق بلا استثناء');
});

test('★★ الزائدة تُسجَّل صراحةً لا تُبتلع — فيُعرف يوم الوصول لماذا وصل ما لم يُرسَل', () => {
  const s = openLoading({ tripId: 'T1', expected: [A], actor: 'سالم' }).session;
  assert.match(applyExtra(s, C, { actor: 'سالم' }).problem, /سببًا مكتوبًا/);
  const r = applyExtra(s, C, { reason: 'طلبٌ عاجلٌ من الفرع بأمر المدير', actor: 'سالم' });
  assert.equal(r.session.extras.length, 1);
  assert.equal(r.session.extras[0].lpn, C);
  assert.ok(r.session.loaded.includes(C));
  // والزائدة تمنع الإغلاق العاديّ أيضًا — تحتاج قرارًا.
  assert.match(loadingCloseProblem(r.session), /زائدة/);
});

test('الإغلاق يعتمد الخروج ويسجّل الختم — ولا يُغلق مرّتين', () => {
  let s = openLoading({ tripId: 'T1', expected: [A], actor: 'سالم' }).session;
  s = applyLoad(s, A);
  const closed = closeLoading(s, { ...CTX, seal: 'SEAL-9911' });
  assert.equal(closed.session.state, 'CLOSED');
  assert.equal(closed.session.seal, 'SEAL-9911');
  assert.match(closeLoading(closed.session, CTX).problem, /لا تُغلق مرّتين/);
  assert.equal(LOADING_STATES.CLOSED, 'مغلقة');
});

/* ── الرصيد المرحليّ ── */

test('★★★ المراحل تُشتقّ من حالات الطبالي — لا بُعدَ جديدٌ في مفتاح الرصيد', () => {
  const units = [
    { warehouse: 'MAIN', state: 'STORED', lines: [{ sku: 'WNW-001', baseQty: 100 }] },
    { warehouse: 'MAIN', state: 'RESERVED', lines: [{ sku: 'WNW-001', baseQty: 20 }] },
    { warehouse: 'MAIN', state: 'PICKING', lines: [{ sku: 'WNW-001', baseQty: 10 }] },
    { warehouse: 'MAIN', state: 'STAGED', lines: [{ sku: 'WNW-001', baseQty: 5 }] },
    { warehouse: 'MAIN', state: 'LOADED', lines: [{ sku: 'WNW-001', baseQty: 3 }] },
    { warehouse: 'TRP', state: 'STORED', lines: [{ sku: 'WNW-001', baseQty: 999 }] },
  ];
  const s = stagedBalanceOf(units, { sku: 'WNW-001', warehouse: 'MAIN' });
  assert.deepEqual(s, { reserved: 20, picking: 10, staged: 5, loaded: 3, stored: 100 }, 'مستودعٌ آخر لا يتسرّب');
});

test('★★ الصورة الكاملة: الفعليّ من الدفتر والمراحل من الطبالي — والتجاوز يُعلَن', () => {
  const units = [
    { warehouse: 'MAIN', state: 'RESERVED', lines: [{ sku: 'WNW-001', baseQty: 20 }] },
    { warehouse: 'MAIN', state: 'STAGED', lines: [{ sku: 'WNW-001', baseQty: 5 }] },
  ];
  const p = itemStockPicture(units, { sku: 'WNW-001', warehouse: 'MAIN', actualQty: 100 });
  assert.equal(p.actual, 100, 'الفعليّ يُمرَّر من الدفتر ولا يُحسب هنا');
  assert.equal(p.inFlight, 25);
  assert.equal(p.freeEstimate, 75);
  assert.ok(!p.exceedsActual);

  const impossible = itemStockPicture(units, { sku: 'WNW-001', warehouse: 'MAIN', actualQty: 10 });
  assert.ok(impossible.exceedsActual, 'محمولٌ يتجاوز الفعليّ = حركةٌ لم تُقيَّد أو قراءةٌ مكرّرة');
  assert.equal(impossible.freeEstimate, 0, 'ولا يُسالَب المتاح');
});
