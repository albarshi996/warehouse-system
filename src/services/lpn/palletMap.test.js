/**
 * اختبارات الطبالي على الخريطة — «ماذا في هذا الرفّ؟» سؤالُ العامل كلّ يوم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  binSummary,
  binsOfItem,
  isOnFloor,
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
