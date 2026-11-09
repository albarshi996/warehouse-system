/**
 * ‹SECT-WH م١› نموذجُ المخزن — القطاع↔المخزن والأرشفة (منطقٌ خالص).
 * البيّنةُ تبدأ بالنقض: المؤرشفُ لا يُحتسب، والقطاعُ غيرُ المحدَّد لا يضمّ شيئًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WH_STATUS,
  warehouseSector,
  isArchived,
  isActiveWarehouse,
  activeWarehouses,
  warehousesInSector,
  unassignedWarehouses,
  sectorRollup,
} from './warehouseModel.js';

const wh = (code, shop, status = WH_STATUS.ACTIVE) => ({ id: code, code, shop, status });

test('‹SECT-WH› قطاعُ المخزن من حقل shop، والفارغُ ""', () => {
  assert.equal(warehouseSector({ shop: 'ABUHADI' }), 'ABUHADI');
  assert.equal(warehouseSector({ shop: '  RH  ' }), 'RH');
  assert.equal(warehouseSector({}), '');
  assert.equal(warehouseSector(null), '');
});

test('‹SECT-WH› الأرشفةُ بالحالة أو بعلَمٍ صريح', () => {
  assert.equal(isArchived({ status: 'مؤرشف' }), true);
  assert.equal(isArchived({ archived: true }), true);
  assert.equal(isArchived({ status: 'نشط' }), false);
  assert.equal(isArchived({}), false);
  assert.equal(isActiveWarehouse({ status: 'نشط' }), true);
  assert.equal(isActiveWarehouse({ status: 'مؤرشف' }), false);
});

test('‹SECT-WH› المؤرشفُ يُستبعَد من الحيّة', () => {
  const list = [wh('E1', 'A'), wh('E2', 'A', WH_STATUS.ARCHIVED), wh('E3', 'B')];
  assert.deepEqual(
    activeWarehouses(list).map((w) => w.code),
    ['E1', 'E3']
  );
});

test('‹SECT-WH› مخازنُ القطاع: الحيّةُ المُسنَدةُ لهذا المحلّ وحدها', () => {
  const list = [wh('E1', 'A'), wh('E2', 'A', WH_STATUS.ARCHIVED), wh('E3', 'B'), wh('E4', 'A')];
  assert.deepEqual(
    warehousesInSector(list, 'A').map((w) => w.code),
    ['E1', 'E4'],
    'المؤرشفُ E2 لا يدخل'
  );
  assert.deepEqual(warehousesInSector(list, 'B').map((w) => w.code), ['E3']);
  // قطاعٌ غيرُ محدَّدٍ لا يضمّ شيئًا (لا يُساوى بغير المُسنَد).
  assert.deepEqual(warehousesInSector(list, ''), []);
  assert.deepEqual(warehousesInSector(list, null), []);
});

test('‹SECT-WH› غيرُ المُسنَد: حيٌّ بلا قطاع', () => {
  const list = [wh('E1', 'A'), wh('E2', ''), wh('E3', null), wh('E4', 'B', WH_STATUS.ARCHIVED)];
  assert.deepEqual(
    unassignedWarehouses(list).map((w) => w.code),
    ['E2', 'E3']
  );
});

test('‹SECT-WH› تجميعُ القطاعات: عددُ الحيّة لكلّ محلّ، و"" لغير المُسنَد', () => {
  const list = [wh('E1', 'A'), wh('E2', 'A'), wh('E3', 'B'), wh('E4', ''), wh('E5', 'A', WH_STATUS.ARCHIVED)];
  const roll = sectorRollup(list);
  assert.equal(roll.get('A'), 2, 'المؤرشفُ لا يُعَدّ');
  assert.equal(roll.get('B'), 1);
  assert.equal(roll.get(''), 1);
});

test('‹SECT-WH› مدخلاتٌ فارغةٌ لا تُسقط', () => {
  assert.deepEqual(activeWarehouses(null), []);
  assert.deepEqual(unassignedWarehouses(undefined), []);
  assert.equal(sectorRollup([]).size, 0);
});
