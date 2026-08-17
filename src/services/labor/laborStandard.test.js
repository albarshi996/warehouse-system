/**
 * اختبارات الزمن المعياريّ ‹EXE-701›.
 *
 * حارسان حاكمان: **المعياريّ مجموعُ عناصرَ معلنة** لا رقمٌ يُفترض، و**الإعداد
 * إصداراتٌ لا قيمةٌ تُدهس** — فحكمُ قراءةٍ ماضية لا يتغيّر لأنّ الإدارة عدّلت
 * الإعداد اليوم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_STANDARD,
  BASIS,
  STANDARD_ELEMENTS,
  TIMED_ELEMENTS,
  elementLabel,
  explainStandard,
  nextStandard,
  resolveStandard,
  shapeStandard,
  standardFor,
  standardProblems,
} from './laborStandard.js';

const DAY = 86400000;
const T = Date.parse('2026-08-01T06:00:00Z');

/** مهمّةٌ بسطرين وثلاثين وحدة. */
const task = {
  startedAt: T,
  lines: [
    { sku: 'A', qtyRequired: 20, qtyDone: 0 },
    { sku: 'B', qtyRequired: 10, qtyDone: 0 },
  ],
};

/* ── العناصر ─────────────────────────────────────────────────── */

test('★★ العناصر الخمسة بأسمائها — قائمةٌ واحدة يقرؤها الحساب والشاشة', () => {
  assert.deepEqual(
    STANDARD_ELEMENTS.map((e) => e.label),
    ['استلام المهمّة', 'انتقال', 'مسح', 'مناولة', 'سماح']
  );
});

test('★★ لا عنصرَ بلا ثوانٍ في الأرضيّة — ولا ثوانٍ لعنصرٍ لا وجود له', () => {
  for (const id of TIMED_ELEMENTS) {
    assert.equal(typeof BASE_STANDARD.seconds[id], 'number', `${id} بلا قيمة`);
  }
  for (const id of Object.keys(BASE_STANDARD.seconds)) {
    assert.ok(TIMED_ELEMENTS.includes(id), `${id} قيمةٌ لعنصرٍ غير معلَن`);
  }
  assert.equal(TIMED_ELEMENTS.includes('allowance'), false, 'السماح نسبةٌ لا ثوانٍ');
});

test('★★ المعياريّ مجموعُ عناصره — لا رقمٌ يُفترض', () => {
  const r = standardFor(task, { atMs: T });
  // 120 استلام + 2×45 انتقال + 2×8 مسح + 30×12 مناولة = 586 ثانية
  const timed = r.elements.filter((e) => e.per !== 'percent').reduce((a, e) => a + e.seconds, 0);
  assert.equal(timed, 586);
  const allowance = r.elements.find((e) => e.id === 'allowance');
  assert.equal(allowance.seconds, Math.round(586 * 0.15));
  assert.equal(r.seconds, 586 + allowance.seconds);
  for (const e of r.elements) {
    assert.ok(e.label, 'ولكلّ عنصرٍ تسميةٌ يراها المشرف');
    assert.ok('count' in e && 'basis' in e);
  }
});

test('العدّ بالإحالة إلى `taskProgress` — لا حجمان للمهمّة', () => {
  const r = standardFor(task, { atMs: T });
  assert.equal(r.lines, 2);
  assert.equal(r.units, 30);
  assert.equal(r.elements.find((e) => e.id === 'handle').count, 30);
  assert.equal(r.elements.find((e) => e.id === 'scan').count, 2);
  assert.equal(r.elements.find((e) => e.id === 'setup').count, 1);
});

test('مهمّةٌ بلا بنود: معياريُّها الاستلام والسماح وحدهما — لا صفرٌ كاذب', () => {
  const r = standardFor({ lines: [] }, { atMs: T });
  assert.equal(r.elements.find((e) => e.id === 'handle').seconds, 0);
  assert.equal(r.seconds, Math.round(120 * 1.15));
});

/* ── الانتقال تقديريّ حتى ت٨ ─────────────────────────────────── */

test('★★ بلا مسافةٍ محسوبة يُعلَن أنّ الانتقال تقديريّ — ويُقال السبب', () => {
  const r = standardFor(task, { atMs: T });
  const travel = r.elements.find((e) => e.id === 'travel');
  assert.equal(travel.basis, BASIS.estimated.id);
  assert.match(travel.note, /ت٨/);
  assert.equal(r.estimated, true, 'والنتيجة كلّها تحمل وسم التقدير');
  assert.match(r.notes.join(' '), /لا مسافةَ محسوبة/);
});

test('★★ ومتى جاءت المسافة انقلب الأساس إلى «مقيس» بلا تغيير الشكل', () => {
  const r = standardFor(task, { atMs: T, distanceMeters: 110 });
  const travel = r.elements.find((e) => e.id === 'travel');
  assert.equal(travel.basis, BASIS.measured.id);
  assert.equal(travel.seconds, 100, '110 م ÷ 1.1 م/ث');
  assert.match(travel.note, /110 م/);
  assert.deepEqual(Object.keys(travel).sort(), Object.keys(standardFor(task, { atMs: T }).elements[1]).sort());
});

test('السماح يبقى تقديريًّا دائمًا — وهو نسبةٌ لا قياس', () => {
  const r = standardFor(task, { atMs: T, distanceMeters: 110 });
  assert.equal(r.elements.find((e) => e.id === 'allowance').basis, BASIS.estimated.id);
});

/* ── ★★ الإصدارات: لا تُدهس القراءات القديمة ─────────────────── */

test('★★ القراءة تُحاسَب بالإصدار السّاري لحظةَ وقوعها لا بالأحدث', () => {
  const v2 = { version: 2, effectiveFrom: T + 10 * DAY, seconds: { handle: 6 }, by: 'المشرف' };
  const before = standardFor(task, { atMs: T, versions: [v2] });
  const after = standardFor(task, { atMs: T + 20 * DAY, versions: [v2] });
  assert.equal(before.version, 1, 'مهمّةُ الأمس بمعيار الأمس');
  assert.equal(after.version, 2);
  assert.ok(after.seconds < before.seconds, 'والإصدار الجديد أسرع فعلًا');
  assert.equal(before.elements.find((e) => e.id === 'handle').unitSeconds, 12);
  assert.equal(after.elements.find((e) => e.id === 'handle').unitSeconds, 6);
});

test('★★ إصدارٌ يسري في الماضي مرفوض — وإلّا أُعيد حكمُ قراءاتٍ مضت', () => {
  const problems = standardProblems({ effectiveFrom: BASE_STANDARD.effectiveFrom, by: 'المشرف' }, BASE_STANDARD);
  assert.match(problems.join(' '), /بأثرٍ رجعيّ/);
  assert.throws(() => nextStandard(BASE_STANDARD, { effectiveFrom: -1, by: 'المشرف' }), /رجعيّ/);
});

test('التعديل إضافةٌ لا كتابةٌ فوق — والرقم يتصاعد والسابق يبقى', () => {
  const v2 = nextStandard(BASE_STANDARD, { effectiveFrom: T, seconds: { scan: 5 }, by: 'المشرف', label: 'بعد الماسح الجديد' });
  assert.equal(v2.version, 2);
  assert.equal(v2.seconds.scan, 5);
  assert.equal(v2.seconds.handle, BASE_STANDARD.seconds.handle, 'وما لم يُذكر يُورَث لا يُصفَّر');
  assert.equal(BASE_STANDARD.seconds.scan, 8, 'والأرضيّة لم تُمسّ');
});

test('★ اسم من غيّر الإعداد مطلوب — الإعداد قرارٌ لا حقلٌ مجهول', () => {
  assert.match(standardProblems({ effectiveFrom: T }, BASE_STANDARD).join(' '), /اسم من غيّر/);
});

test('حدود المدخلات محروسة', () => {
  assert.match(standardProblems({ effectiveFrom: T, allowancePct: 140, by: 'م' }, BASE_STANDARD).join(' '), /السماح/);
  assert.match(standardProblems({ effectiveFrom: T, walkSpeedMps: 0, by: 'م' }, BASE_STANDARD).join(' '), /سرعة المشي/);
  assert.deepEqual(standardProblems({ effectiveFrom: T, by: 'م' }, BASE_STANDARD), []);
});

test('بلا إصداراتٍ مضافة تبقى الأرضيّة سارية لكلّ زمن', () => {
  assert.equal(resolveStandard([], T).version, 1);
  assert.equal(resolveStandard(undefined, 0).version, 1);
  assert.equal(resolveStandard([], Number.NaN).version, 1, 'وزمنٌ مجهول لا يُسقط الحساب');
});

test('الإصدارات غير المرتّبة تُرتَّب — والأحدث سريانًا يحكم', () => {
  const versions = [
    { version: 3, effectiveFrom: T + 20 * DAY, seconds: { handle: 4 }, by: 'م' },
    { version: 2, effectiveFrom: T + 10 * DAY, seconds: { handle: 6 }, by: 'م' },
  ];
  assert.equal(resolveStandard(versions, T + 15 * DAY).seconds.handle, 6);
  assert.equal(resolveStandard(versions, T + 25 * DAY).seconds.handle, 4);
});

test('التسوية لا تخترع حقلًا ولا تُصفّر ما لم يُذكر', () => {
  const v = shapeStandard({ effectiveFrom: T, by: 'م' }, BASE_STANDARD);
  assert.deepEqual(v.seconds, { ...BASE_STANDARD.seconds });
  assert.equal(v.allowancePct, BASE_STANDARD.allowancePct);
});

/* ── الشرح للمشرف ────────────────────────────────────────────── */

test('★★ الشرح يقول **أين يذهب الوقت** — ويسمّي التقديريّ تقديريًّا', () => {
  const text = explainStandard(standardFor(task, { atMs: T }));
  assert.match(text, /مناولة/, 'أكبر العناصر أوّلًا');
  assert.match(text, /تقديريّ/, 'والانتقال يُوسَم');
  assert.equal(explainStandard({ elements: [] }), 'لا عنصر مؤثّر');
});

test('تسمية العنصر تُقرأ من القائمة لا من نصٍّ في الشاشة', () => {
  assert.equal(elementLabel('travel'), 'انتقال');
  assert.equal(elementLabel('zzz'), 'zzz', 'والمجهول يُعاد كما هو لا يُخترع له اسم');
});
