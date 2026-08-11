/**
 * اختبارات المواقع التنظيميّة (م٦-أ · تسدّ ف‑٥ وف‑٦).
 *
 * الاختباران الحاكمان: **التكلفة تصعد الشجرة** (وإلّا لم يُعرف كم كلّف قطاع)،
 * و**ما لم يُربط يُحصى ولا يذوب** (وإلّا كذب المجموع بصمت).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORG_LEVELS,
  LEVEL_IDS,
  ORG_FIELDS,
  levelOf,
  indexLocations,
  ancestryOf,
  resolveLocation,
  orgCodeOf,
  costByLocation,
  unlinkedCost,
  locationProblems,
  locationOptions,
} from './orgLocations.js';

const TREE = [
  { code: 'SEC-FOOD', nameAr: 'قطاع الأغذية', level: 'sector' },
  { code: 'BR-NUR', nameAr: 'براند النور', level: 'brand', parentCode: 'SEC-FOOD' },
  { code: 'BEN', nameAr: 'فرع بنغازي', level: 'branch', parentCode: 'BR-NUR' },
  { code: 'CC-MAINT', nameAr: 'صيانة بنغازي', level: 'cost_center', parentCode: 'BEN' },
  { code: 'TRP', nameAr: 'فرع طرابلس', level: 'branch', parentCode: 'BR-NUR' },
];
const IDX = indexLocations(TREE);

/* ═══════════ ١. الشجرة ═══════════ */

test('المستويات أربعةٌ من الأعمّ إلى الأخصّ', () => {
  assert.deepEqual(LEVEL_IDS, ['sector', 'brand', 'branch', 'cost_center']);
  assert.equal(levelOf('sector').parentOf, null, 'القطاع جذر');
  assert.equal(levelOf('cost_center').parentOf, 'branch');
  assert.equal(ORG_LEVELS.length, 4);
});

test('★ سلسلة الملكية تصعد إلى الجذر', () => {
  assert.deepEqual(ancestryOf(IDX, 'CC-MAINT').map((l) => l.code), ['CC-MAINT', 'BEN', 'BR-NUR', 'SEC-FOOD']);
  assert.deepEqual(ancestryOf(IDX, 'SEC-FOOD').map((l) => l.code), ['SEC-FOOD']);
  assert.deepEqual(ancestryOf(IDX, 'لا يوجد'), []);
  assert.deepEqual(ancestryOf(IDX, ''), []);
});

test('★★ حلقةٌ في الملكية لا تُعلّق الشاشة إلى الأبد', () => {
  const cyclic = indexLocations([
    { code: 'A', nameAr: 'أ', level: 'branch', parentCode: 'B' },
    { code: 'B', nameAr: 'ب', level: 'brand', parentCode: 'A' },
  ]);
  const chain = ancestryOf(cyclic, 'A');
  assert.equal(chain.length, 2, 'تُقطع الحلقة ولا تدور');
});

/* ═══════════ ٢. التوجيه بالملكية لا بالاسم ═══════════ */

test('★ الرمز يُقدَّم على الاسم — الرمز لا يتكرّر والاسم قد يتكرّر', () => {
  assert.equal(resolveLocation(IDX, 'BEN').status, 'matched');
  assert.equal(resolveLocation(IDX, 'ben').location.code, 'BEN', 'وبلا حساسيّة حرف');
  assert.equal(resolveLocation(IDX, 'فرع بنغازي').location.code, 'BEN', 'والاسم يعمل حين لا يتكرّر');
});

test('★★ اسمان متطابقان: يُعلَن الالتباس ولا يُختار أحدهما', () => {
  // اختيارٌ عشوائيٌّ يُحمّل التكلفة على فرعٍ بريء.
  const dup = indexLocations([
    { code: 'A1', nameAr: 'المستودع', level: 'branch', parentCode: 'BR-NUR' },
    { code: 'A2', nameAr: 'المستودع', level: 'branch', parentCode: 'BR-NUR' },
  ]);
  const r = resolveLocation(dup, 'المستودع');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.location, null);
  assert.equal(r.candidates.length, 2);
});

test('★★ الترحيل: نصٌّ لا يطابق شيئًا يبقى «غير مربوط» ولا يُمنع', () => {
  const r = resolveLocation(IDX, 'بنغازي');
  assert.equal(r.status, 'unlinked');
  assert.equal(r.location, null);
  assert.equal(resolveLocation(IDX, '').status, 'unlinked', 'والفراغ كذلك');
});

test('orgCodeOf: أوّل حقلٍ مملوء يفوز', () => {
  assert.equal(orgCodeOf({ header: { costCenter: 'CC-MAINT' } }), 'CC-MAINT');
  assert.equal(orgCodeOf({ header: { budgetCode: 'BEN' } }), 'BEN');
  assert.equal(orgCodeOf({ header: {} }), '');
  assert.ok(ORG_FIELDS.includes('costCenter') && ORG_FIELDS.includes('budgetCode'), 'الحقلان القائمان مشمولان');
});

/* ═══════════ ٣. تحميل التكلفة ═══════════ */

test('★★ التكلفة تصعد الشجرة — وبها يُعرف كم كلّف القطاع', () => {
  const cost = costByLocation(IDX, [
    { orgCode: 'CC-MAINT', amount: 1000 },
    { orgCode: 'TRP', amount: 500 },
  ]);
  assert.equal(cost.get('CC-MAINT').direct, 1000);
  assert.equal(cost.get('CC-MAINT').rollup, 1000);
  assert.equal(cost.get('BEN').direct, 0, 'الفرع لم يُحمَّل مباشرةً');
  assert.equal(cost.get('BEN').rollup, 1000, 'لكنّه يحمل ما تحته');
  assert.equal(cost.get('TRP').direct, 500);
  assert.equal(cost.get('BR-NUR').rollup, 1500, 'والبراند يجمع فرعَيه');
  assert.equal(cost.get('SEC-FOOD').rollup, 1500, 'والقطاع جذر الكلّ');
});

test('★★ ما لم يُربط يُحصى منفصلًا ولا يذوب في المجموع', () => {
  const entries = [
    { orgCode: 'CC-MAINT', amount: 1000 },
    { orgCode: 'بنغازي', amount: 300 },
    { orgCode: '', amount: 200 },
  ];
  const cost = costByLocation(IDX, entries);
  assert.equal(cost.get('SEC-FOOD').rollup, 1000, 'المجموع لا يبتلع غير المربوط');
  assert.equal(unlinkedCost(IDX, entries), 500, 'ويُعرض صريحًا');
});

test('الصفر لا يُقيَّد، والقائمة الفارغة لا ترمي', () => {
  assert.equal(costByLocation(IDX, [{ orgCode: 'BEN', amount: 0 }]).size, 0);
  assert.equal(costByLocation(IDX, []).size, 0);
  assert.equal(costByLocation(IDX, null).size, 0);
  assert.equal(unlinkedCost(IDX, []), 0);
});

/* ═══════════ ٤. تحقّق السيّد ═══════════ */

test('★ الشجرة السليمة بلا مشاكل', () => {
  assert.deepEqual(locationProblems(TREE), []);
});

test('★ الرمز هويّةٌ لا وصف — والمكرّر يُرفض', () => {
  const dup = [...TREE, { code: 'BEN', nameAr: 'آخر', level: 'branch', parentCode: 'BR-NUR' }];
  assert.ok(locationProblems(dup).some((p) => /مكرّر/.test(p)));
});

test('★ القطاع جذرٌ، وما دونه بلا أبٍ يُرفض، والأب من مستوًى خاطئ يُرفض', () => {
  assert.ok(locationProblems([{ code: 'X', nameAr: 'س', level: 'branch' }]).some((p) => /بلا أب/.test(p)));
  assert.ok(
    locationProblems([
      { code: 'S', nameAr: 'ق', level: 'sector' },
      { code: 'X', nameAr: 'س', level: 'sector', parentCode: 'S' },
    ]).some((p) => /القطاع جذر/.test(p))
  );
  assert.ok(
    locationProblems([
      { code: 'S', nameAr: 'ق', level: 'sector' },
      { code: 'C', nameAr: 'م', level: 'cost_center', parentCode: 'S' },
    ]).some((p) => /والمتوقَّع branch/.test(p))
  );
});

test('★★ الحلقة تُكشف — موقعٌ أبوه ابنُه يُعلّق كلّ حسابٍ يصعد الشجرة', () => {
  const cyclic = [
    { code: 'A', nameAr: 'أ', level: 'branch', parentCode: 'B' },
    { code: 'B', nameAr: 'ب', level: 'brand', parentCode: 'A' },
  ];
  assert.ok(locationProblems(cyclic).some((p) => /حلقة|لا تنتهي بجذر/.test(p)));
});

test('مستوًى غير معروفٍ وموقعٌ بلا رمزٍ أو اسم', () => {
  assert.ok(locationProblems([{ code: 'X', nameAr: 'س', level: 'مخترع' }]).some((p) => /مستوًى غير معروف/.test(p)));
  assert.ok(locationProblems([{ nameAr: 'س', level: 'sector' }]).some((p) => /بلا رمز/.test(p)));
  assert.ok(locationProblems([{ code: 'X', level: 'sector' }]).some((p) => /بلا اسمٍ عربيّ/.test(p)));
});

/* ═══════════ ٥. العرض ═══════════ */

test('الخيارات مرتّبةٌ بالمستوى ثمّ بالاسم، وتُفلتَر بالمستوى', () => {
  const all = locationOptions(TREE);
  assert.equal(all[0].level, 'sector', 'الأعمّ أوّلًا');
  assert.equal(locationOptions(TREE, { level: 'branch' }).length, 2);
  assert.match(all[0].label, /قطاع/);
  assert.deepEqual(locationOptions([]), []);
});
