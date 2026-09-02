/**
 * اختبارات تشريح الخانة.
 *
 * جوهرُها فصلٌ واحد: **البادئة المطبوعة على الملصق ليست كودَ المستودع**.
 * `RH-A-R-01-01` خانةٌ في المستودع `WH001` — والترجمةُ بينهما حقلٌ يُقرأ لا
 * تخمين، ومن يخلطهما يولّد أكوادًا لا وجودَ لها على أيّ ملصق.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEGMENT_LABELS_DEFAULT,
  binCodeFor,
  binHeadline,
  binPrefixOf,
  binPrefixProblem,
  describeBin,
  numberingProblems,
  prefixConflicts,
  segmentLabelsOf,
  valueLabelOf,
  warehouseForBin,
} from './binAnatomy.js';

/** المستودعان كما هما في البوّابة الحيّة (لقطة المالك 2026-09-02). */
const RAHBA = {
  code: 'WH001',
  nameAr: 'الرحبة',
  binPrefix: 'RH',
  segmentLabels: { zone: 'الممرّ', rack: 'الجهة', bay: 'الرفّ', level: 'الخانة' },
  valueLabels: { rack: { L: 'يسار', R: 'يمين' } },
};
const TRIPOLI = { ...RAHBA, code: 'WH002', nameAr: 'طرابلس', binPrefix: 'TR' };
const WAREHOUSES = [RAHBA, TRIPOLI];

test('★★ البادئةُ غيرُ كود المستودع — والافتراضُ الكودُ نفسُه', () => {
  assert.equal(binPrefixOf(RAHBA), 'RH', 'المحفوظُ يتقدّم');
  assert.equal(binPrefixOf({ code: 'MAIN' }), 'MAIN', 'مستودعٌ بلا ملصقاتٍ يعمل بلا إعداد');
  assert.equal(binPrefixOf({ id: 'wh9' }), 'WH9', 'والمعرّفُ آخرُ ملاذ');
  assert.equal(binPrefixOf(null), '');
});

test('★★★ الخانةُ تعرف مستودعَها — ولا تُخمَّن حين لا تعرفه', () => {
  assert.equal(warehouseForBin('RH-A-R-01-01', WAREHOUSES)?.nameAr, 'الرحبة');
  assert.equal(warehouseForBin('TR-J-L-05-10', WAREHOUSES)?.nameAr, 'طرابلس');
  assert.equal(warehouseForBin('rh-a-r-01-01', WAREHOUSES)?.code, 'WH001', 'يُطبَّع قبل المطابقة');
  assert.equal(
    warehouseForBin('XX-A-R-01-01', WAREHOUSES),
    null,
    'ملصقُ فرعٍ آخر يُردّ — ولا يُنسب إلى أوّل مستودعٍ في القائمة'
  );
  assert.equal(warehouseForBin('لا كود', WAREHOUSES), null);
  assert.equal(warehouseForBin('WH001-A-R-01-01', WAREHOUSES), null, 'كودُ المستودع ليس بادئةَ خانة');
});

test('★★ العنوانُ يُقرأ بالعربيّة: «الممرّ A · الجهة يمين · الرفّ 01 · الخانة 01»', () => {
  assert.equal(binHeadline('RH-A-R-01-01', RAHBA), 'الممرّ A · الجهة يمين · الرفّ 01 · الخانة 01');
  assert.equal(binHeadline('TR-J-L-05-10', TRIPOLI), 'الممرّ J · الجهة يسار · الرفّ 05 · الخانة 10');
});

test('المقاطعُ الفارغة لا تُعرض — ولا «الصندوق: —»', () => {
  const segs = describeBin('RH-A-R-01-01', RAHBA);
  assert.equal(segs.length, 4, 'خمسةُ مقاطعَ ناقصَ المستودع');
  assert.deepEqual(
    segs.map((s) => s.key),
    ['zone', 'rack', 'bay', 'level']
  );
  assert.equal(describeBin('RH-A', RAHBA).length, 1);
  assert.deepEqual(describeBin('كود معطوب', RAHBA), []);
});

test('التسمياتُ: المحفوظُ يغطّي الافتراضيّ ولا يمحوه', () => {
  const labels = segmentLabelsOf({ segmentLabels: { bay: 'الرفّ' } });
  assert.equal(labels.bay, 'الرفّ', 'المحفوظُ يتقدّم');
  assert.equal(labels.position, SEGMENT_LABELS_DEFAULT.position, 'وغيرُ المحفوظ يبقى افتراضيًّا');
  assert.equal(segmentLabelsOf(null).rack, SEGMENT_LABELS_DEFAULT.rack, 'مستودعٌ بلا تسمياتٍ يُقرأ');
});

test('القيمةُ بلا تسميةٍ تعود بنفسها ظاهرةً — عرفُ المعجم', () => {
  assert.equal(valueLabelOf(RAHBA, 'rack', 'L'), 'يسار');
  assert.equal(valueLabelOf(RAHBA, 'rack', 'X'), 'X', 'المجهولُ يُعرض ولا يُبتلع');
  assert.equal(valueLabelOf(RAHBA, 'zone', 'A'), 'A');
  assert.equal(valueLabelOf(null, 'rack', 'r'), 'R');
});

test('★★★ البناءُ بالبادئة لا بالكود — وهذا العطبُ الذي مُنع', () => {
  assert.equal(binCodeFor(RAHBA, ['A', 'R', '01', '01']), 'RH-A-R-01-01', 'كودٌ مطبوعٌ على ملصق');
  assert.notEqual(binCodeFor(RAHBA, ['A', 'R', '01', '01']), 'WH001-A-R-01-01');
  assert.equal(binCodeFor({ code: 'MAIN' }, ['A01', 'R01']), 'MAIN-A01-R01');
  assert.equal(binCodeFor({}, ['A01']), '', 'بلا بادئةٍ لا يُبنى كودٌ يتيم');
});

test('★★ بادئةٌ مكرّرةٌ عطبٌ يُكشف يوم الإعداد لا يوم الجرد', () => {
  assert.deepEqual(prefixConflicts(WAREHOUSES), [], 'المستودعان الحيّان سليمان');
  const clash = prefixConflicts([...WAREHOUSES, { code: 'WH003', binPrefix: 'RH' }]);
  assert.equal(clash.length, 1);
  assert.deepEqual(clash[0].owners, ['WH001', 'WH003']);
  assert.match(clash[0].message, /لا تكون في مستودعين/);
});

test('★★ البادئةُ مقطعُ كودٍ لا اسمٌ حرّ', () => {
  assert.equal(binPrefixProblem('RH'), '');
  assert.equal(binPrefixProblem('W01'), '');
  assert.match(binPrefixProblem(''), /مطلوبة/);
  assert.match(binPrefixProblem('R H'), /غير مسموح/);
  assert.match(binPrefixProblem('RH-1'), /غير مسموح/, 'والشرطةُ فاصلُ مقاطعَ لا محرفَ بادئة');
  assert.match(binPrefixProblem('ABCDEFGHIJKLM'), /أطول من 12/);
});

test('★★★ مخطّطٌ يولّد ببادئةٍ غير بادئة مستودعه يُردّ قبل الحفظ', () => {
  assert.deepEqual(numberingProblems({ binPrefix: 'RH', scheme: { warehouse: 'RH' } }), []);
  const bad = numberingProblems({ binPrefix: 'RH', scheme: { warehouse: 'TR' } });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /يُنتج أكوادًا لمستودعٍ آخر/);
  assert.equal(numberingProblems({ binPrefix: 'RH', scheme: {} }).length, 0, 'بلا مخطّطٍ تُحفظ البادئةُ وحدها');
});

test('★★★ الاسمُ العربيُّ يُقرأ من `name` — فهو ما تكتبه وثيقةُ المستودع فعلًا', () => {
  // كُشف 2026-09-02 بمقابلة المِشحذ بالبوّابة الحيّة: `WarehouseManager` يكتب
  // `{ code, name, manager, status }` — و`nameAr` **لا يكتبه أحد**. فشاشةٌ
  // تقرأ `nameAr` وحدَه تعرض «WH001» بدل «الرحبة»، وهو عطبٌ لا يظهر في أيّ
  // اختبارٍ ببياناتٍ مصنوعة.
  const live = { code: 'WH001', name: 'الرحبة', binPrefix: 'RH' };
  assert.equal(binPrefixOf(live), 'RH');
  assert.equal(warehouseForBin('RH-A-R-01-01', [live])?.name, 'الرحبة');
  assert.equal(binHeadline('RH-A-R-01-01', live), 'المنطقة / الغرفة A · الممرّ R · الرفّ 01 · المستوى 01',
    'وبلا تسمياتٍ محفوظةٍ تعود الافتراضيّة — لا فراغ');
});
