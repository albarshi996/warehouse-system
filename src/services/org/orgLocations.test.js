/**
 * اختبارات المواقع التنظيميّة (م٦-أ · تسدّ ف‑٥ وف‑٦).
 *
 * الاختباران الحاكمان: **التكلفة تصعد الشجرة** (وإلّا لم يُعرف كم كلّف قطاع)،
 * و**ما لم يُربط يُحصى ولا يذوب** (وإلّا كذب المجموع بصمت).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dispatchTargetVerdict, dispatchViolations, DISPATCH_DOC_TYPES,
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
  internalBranchProblems,
  dimensionsOf,
  docAmountOf,
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

// ═══ CC-401 — الفرع ليس عميلًا · أبعاد المستند · مبلغ التحميل ═══

const CC401_TREE = [
  { code: 'SEC-F', nameAr: 'قطاع الغذاء', level: 'sector' },
  { code: 'BR-WNW', nameAr: 'وت ن وايلد', level: 'brand', parentCode: 'SEC-F' },
  { code: 'BN-BEN', nameAr: 'فرع بنغازي', level: 'branch', parentCode: 'BR-WNW' },
  { code: 'CC-BEN-OPS', nameAr: 'تشغيل بنغازي', level: 'cost_center', parentCode: 'BN-BEN' },
];

test('★★ الفرع الداخليّ المسجَّل عميلًا يُكشف — والنقل طريقه TRANSIT لا فاتورة', () => {
  const problems = internalBranchProblems(CC401_TREE, [
    { code: 'BN-BEN', nameAr: 'فرع بنغازي (عميل!)' },
    { code: 'C-100', nameAr: 'عميل حقيقيّ' },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /TR→TRN→TRC/);
  // عميلٌ لا يطابق فرعًا لا يُتَّهم — والقطاع المطابق ليس فرعًا فلا يُحاكَم هنا.
  assert.deepEqual(internalBranchProblems(CC401_TREE, [{ code: 'C-100' }, { code: 'SEC-F' }]), []);
});

test('أبعاد المستند تُستكمل من رمزٍ واحد في الرأس — صعودًا حتى القطاع', () => {
  const index = indexLocations(CC401_TREE);
  const dims = dimensionsOf(index, { header: { costCenter: 'cc-ben-ops' } });
  assert.equal(dims.matched, true);
  assert.equal(dims.costCenter.code, 'CC-BEN-OPS');
  assert.equal(dims.branch.code, 'BN-BEN');
  assert.equal(dims.brand.code, 'BR-WNW');
  assert.equal(dims.sector.code, 'SEC-F');
  // رمزٌ لا يطابق ⇒ غير مربوط، بلا اختراع أبعاد.
  const loose = dimensionsOf(index, { header: { costCenter: 'مجهول' } });
  assert.equal(loose.matched, false);
  assert.equal(loose.sector, null);
});

test('مبلغ المستند: أوّل عمودٍ ماليّ يفوز ثمّ كمية×سعر ثمّ كمية×تكلفة', () => {
  assert.equal(docAmountOf({ lines: [{ lineTotal: 120 }, { amount: 30 }] }), 150);
  assert.equal(docAmountOf({ lines: [{ qty: 5, unitPrice: 4 }] }), 20);
  assert.equal(docAmountOf({ lines: [{ qty: 5, unitCost: 3 }] }), 15);
  assert.equal(docAmountOf({ lines: [{ qty: 5 }] }), 0, 'بلا مالٍ صفرٌ لا تخمين');
});

/* ═══════════ ‹FNB-103› لا يُصرف على وعاء ═══════════ */

test('★ حكم الوجهة بالمستويات الأربعة: قطاعٌ وبراند يُرفضان · فرعٌ ومركز تكلفةٍ يمرّان', () => {
  const index = indexLocations([
    { code: 'FNB', nameAr: 'قطاع الأغذية', level: 'sector' },
    { code: 'BRD1', nameAr: 'براند أول', level: 'brand', parentCode: 'FNB' },
    { code: 'BR01', nameAr: 'فرع أول', level: 'branch', parentCode: 'BRD1' },
    { code: 'BR02', nameAr: 'فرع مقفل', level: 'branch', parentCode: 'BRD1', active: false },
    { code: 'CC01', nameAr: 'مطبخ الفرع', level: 'cost_center', parentCode: 'BR01' },
  ]);
  assert.equal(dispatchTargetVerdict(index, 'FNB').ok, false);
  assert.equal(dispatchTargetVerdict(index, 'BRD1').ok, false);
  assert.equal(dispatchTargetVerdict(index, 'BR01').ok, true);
  assert.equal(dispatchTargetVerdict(index, 'CC01').ok, true);

  // الرفض يقول الصواب ويقترح البديل — فروع الوعاء النشطة وحدها.
  const v = dispatchTargetVerdict(index, 'BRD1');
  assert.match(v.problem, /وعاء/);
  assert.deepEqual(v.suggestions.map((s2) => s2.code), ['BR01']); // المقفل لا يُقترح.

  // وغير المربوط يمرّ ويُوسَم — لا منعَ بجهلنا (عقد السيّد الاختياريّ).
  assert.equal(dispatchTargetVerdict(index, 'GHOST-99').ok, true);
});

test('الحكم على مستندات الخروج وحدها: TRN وDN يُحكمان — وPO لا يُمسّ', () => {
  const index = indexLocations([
    { code: 'FNB', nameAr: 'قطاع', level: 'sector' },
    { code: 'BRD1', nameAr: 'براند', level: 'brand', parentCode: 'FNB' },
    { code: 'BR01', nameAr: 'فرع', level: 'branch', parentCode: 'BRD1' },
  ]);
  const doc = { header: { costCenter: 'FNB' } };
  assert.deepEqual(DISPATCH_DOC_TYPES, ['DN', 'TRN']);
  assert.equal(dispatchViolations('TRN', doc, index).length, 1);
  assert.equal(dispatchViolations('DN', doc, index).length, 1);
  assert.deepEqual(dispatchViolations('PO', doc, index), []); // الشراء ليس خروجًا لفرع.
  // فرعٌ سليم يمرّ صامتًا، والفارغ لا يُحكم (الإلزام شأن المخطّط لا الحكم).
  assert.deepEqual(dispatchViolations('TRN', { header: { costCenter: 'BR01' } }, index), []);
  assert.deepEqual(dispatchViolations('TRN', { header: {} }, index), []);
});
