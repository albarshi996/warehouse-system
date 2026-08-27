/**
 * اختبارات الطبالي على الخريطة — «ماذا في هذا الرفّ؟» سؤالُ العامل كلّ يوم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ON_FLOOR_STATES,
  PALLET_CELL_ORDER,
  PALLET_LEGEND,
  binSummary,
  binsOfItem,
  isOnFloor,
  palletCellOf,
  palletChip,
  palletCountByNode,
  palletsByBin,
  unexpectedPlacements,
} from './palletMap.js';

const mk = (code, bin, state, flags = [], lines = [{ sku: 'WNW-001', baseQty: 60 }]) => ({
  code, bin, state, flags, warehouse: 'MAIN', lines,
});

const UNITS = [
  mk('LPN-MAIN-20260827-000001', 'MAIN-A01-R01-B01', 'STORED'),
  mk('LPN-MAIN-20260827-000002', 'MAIN-A01-R01-B01', 'STORED', ['DAMAGED']),
  mk('LPN-MAIN-20260827-000003', 'MAIN-A01-R02-B01', 'RESERVED', [], [
    { sku: 'WNW-001', baseQty: 12 },
    { sku: 'WNW-002', baseQty: 5 },
  ]),
  mk('LPN-MAIN-20260827-000004', '', 'APPROVED'),            // بلا رفّ — لم تُخزَّن بعد
  mk('LPN-MAIN-20260827-000005', 'MAIN-A01-R01-B01', 'ISSUED'), // خرجت
];

test('★★ الواقفةُ في المستودع وحدها تُعرض — والمصروفةُ وما لم يُخزَّن لا يشغلان رفًّا', () => {
  assert.ok(isOnFloor(UNITS[0]));
  assert.ok(!isOnFloor(UNITS[3]), 'معتمَدةٌ بلا رفٍّ ليست على الأرض');
  assert.ok(!isOnFloor(UNITS[4]), 'مصروفةٌ خرجت');
  assert.equal(palletsByBin(UNITS).get('MAIN-A01-R01-B01').length, 2);
});

test('★ المطبّع الواحد للمفتاح — فلا يصير الرفّ رفّين لاختلاف كتابة', () => {
  const messy = [mk('LPN-MAIN-20260827-000010', 'main a01 r01 b01', 'STORED')];
  assert.ok(palletsByBin(messy).has('MAIN-A01-R01-B01'));
});

test('★★ ملخّصُ الرفّ يُشتقّ من طباليه — والموسومة تُعدّ منفصلةً', () => {
  const s = binSummary(UNITS, 'MAIN-A01-R01-B01');
  assert.equal(s.count, 2);
  assert.equal(s.available, 1, 'واحدةٌ صالحة');
  assert.equal(s.blocked, 1, 'وواحدةٌ تالفة — والفرق يُرى قبل السحب');
  assert.equal(s.totalQty, 120);
  assert.equal(s.itemCount, 1);
  assert.equal(binSummary(UNITS, 'MAIN-Z99-R99-B99').count, 0, 'رفٌّ فارغٌ ملخّصٌ صحيحٌ لا انهيار');
});

test('البطاقة المختصرة تكفي للتعرّف — والوسم بعنوانه العربيّ', () => {
  const chip = palletChip(UNITS[1]);
  assert.equal(chip.code, 'LPN-MAIN-20260827-000002');
  assert.equal(chip.stateLabel, 'مخزَّنة');
  assert.deepEqual(chip.flagLabels, ['تالفة']);
  assert.ok(!chip.available);
  assert.ok(palletChip(UNITS[2]).isMixed, 'المختلطة تُعلَن');
});

test('★★ السؤال المعكوس: أين يقف هذا الصنف؟ — مرتّبًا بالأكبر', () => {
  const bins = binsOfItem(UNITS, 'WNW-001');
  assert.equal(bins.length, 2);
  assert.equal(bins[0].bin, 'MAIN-A01-R01-B01');
  assert.equal(bins[0].qty, 120, 'طبليتان × ٦٠');
  assert.equal(bins[1].qty, 12);
  assert.equal(bins[0].pallets.length, 2);

  assert.deepEqual(binsOfItem(UNITS, 'wnw-002')[0].bin, 'MAIN-A01-R02-B01', 'التطبيع قبل المقارنة');
  assert.deepEqual(binsOfItem(UNITS, ''), []);
});

test('★ التجميع صعودًا: المنطقة تعرف مجموع رفوفها والمستودع مجموع مناطقه', () => {
  const counts = palletCountByNode(UNITS);
  assert.equal(counts.get('MAIN-A01-R01-B01'), 2);
  assert.equal(counts.get('MAIN-A01-R01'), 2);
  assert.equal(counts.get('MAIN-A01'), 3, 'الرفّان + طبلية الممرّ الثاني');
  assert.equal(counts.get('MAIN'), 3);
});

test('🔒 الطبالي في مواقع غير متوقّعة — مقاسٌ لا مظنون', () => {
  const locations = [
    { code: 'MAIN-A01-R01-B01', status: 'active' },
    { code: 'MAIN-A01-R02-B01', status: 'stopped' },
  ];
  const odd = unexpectedPlacements(UNITS, locations);
  assert.equal(odd.length, 1);
  assert.equal(odd[0].bin, 'MAIN-A01-R02-B01');
  assert.match(odd[0].reason, /موقوف وفيه حمولة/);

  const unknownBin = unexpectedPlacements([mk('LPN-MAIN-20260827-000020', 'MAIN-Z09-R09-B09', 'STORED')], locations);
  assert.match(unknownBin[0].reason, /غير مسجَّل في سيّد المواقع/);
  assert.deepEqual(unexpectedPlacements(UNITS, [{ code: 'MAIN-A01-R01-B01', status: 'active' }, { code: 'MAIN-A01-R02-B01', status: 'active' }]), []);
});

/* ── طبقةُ العرض على الشبكة ‹LPN-211› ──────────────────────────────── */

test('★★ الخانةُ تُعرض بأسوأ ما فيها لا بأغلبه — طبليةٌ موسومةٌ بين عشرٍ تَسِمُ الرفّ', () => {
  // رفٌّ فيه اثنتان إحداهما تالفة (UNITS[1]) — فحالُه «موسوم» لا «متاح».
  const cell = palletCellOf(binSummary(UNITS, 'MAIN-A01-R01-B01'));
  assert.equal(cell.state, 'held');
  assert.ok(cell.warn, 'الوسمُ الحاجب تنبيهٌ يُرى على الخريطة');
  assert.match(cell.summaryText, /موسومة/);
});

test('★ الترتيبُ حاجبٌ ← مخلوطٌ ← مشغولٌ ← مخزَّن — ولكلّ حدٍّ حالتُه', () => {
  assert.equal(palletCellOf({ count: 0 }).state, 'none');
  assert.equal(palletCellOf({ count: 3, available: 3, blocked: 0, mixed: 0 }).state, 'stored');
  assert.equal(palletCellOf({ count: 3, available: 1, blocked: 0, mixed: 0 }).state, 'busy');
  assert.equal(palletCellOf({ count: 3, available: 3, blocked: 0, mixed: 1 }).state, 'mixed');
  // المخلوطُ لا يحجب الحاجب: الوسمُ أسبق.
  assert.equal(palletCellOf({ count: 3, available: 3, blocked: 1, mixed: 2 }).state, 'held');
});

test('خانةٌ فارغةٌ تُقرأ «بلا طبالي» ولا تُظهر صفرًا يُشبه رصيدًا', () => {
  const cell = palletCellOf(binSummary(UNITS, 'MAIN-Z09-R01-B01'));
  assert.equal(cell.state, 'none');
  assert.equal(cell.countText, '—');
  assert.equal(cell.summaryText, 'بلا طبالي');
});

test('★ المخلوطةُ تُعلن نفسها — الرفّ الذي فيه صنفان يُعدّ بندًا بندًا', () => {
  const cell = palletCellOf(binSummary(UNITS, 'MAIN-A01-R02-B01'));
  assert.equal(cell.state, 'mixed');
  assert.match(cell.summaryText, /مخلوطة/);
  assert.match(cell.summaryText, /صنفًا/);
});

test('المفتاحُ يغطّي كلّ حالةٍ يُنتجها المصنّف — فلا رمزٌ على الخريطة بلا شرح', () => {
  const produced = new Set([
    palletCellOf({ count: 0 }).state,
    palletCellOf({ count: 1, available: 1 }).state,
    palletCellOf({ count: 2, available: 0 }).state,
    palletCellOf({ count: 2, available: 2, mixed: 1 }).state,
    palletCellOf({ count: 2, available: 2, blocked: 1 }).state,
  ]);
  for (const id of produced) {
    assert.ok(PALLET_CELL_ORDER.includes(id), `الحالة «${id}» تُنتج ولا مفتاحَ لها`);
  }
  assert.equal(PALLET_LEGEND.length, PALLET_CELL_ORDER.length);
  for (const s of PALLET_LEGEND) {
    assert.ok(s.symbol && s.labelAr && s.hint, 'لكلّ حالةٍ رمزٌ ونصٌّ وشرح — تُقرأ بلا تمييز ألوان');
  }
});

test('★★ قائمةُ حالات «على الأرض» مصدَّرةٌ وواحدة — فلا تفترق نسخةُ الشاشة عن نسخة المنطق', () => {
  assert.ok(ON_FLOOR_STATES.includes('STORED'));
  assert.ok(!ON_FLOOR_STATES.includes('ISSUED'), 'المصروفةُ لا تقف على رفّ');
  // كلّ حالةٍ في القائمة تُقبل فعلًا من `isOnFloor` — لا اسمَ ميّتٌ فيها.
  for (const state of ON_FLOOR_STATES) {
    assert.ok(isOnFloor({ state, bin: 'MAIN-A01-R01-B01' }), `«${state}» معلَنةٌ ولا تُقبل`);
  }
});
