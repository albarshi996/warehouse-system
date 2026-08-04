/**
 * اختبارات رصيد المركبة المتنقّلة (المطلب ٢) — منطق خالص بلا شبكة.
 * تغطّي: مواقع المركبات في locations، وقيد DN (تحميل بالمركبة) وPOD (تسليم يخصم).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  vehicleLocationCode,
  isVehicleLocation,
  vehiclePlateFromCode,
  onVehicleBalances,
  isReservedCode,
  locationLabel,
} from './locations.js';
import { buildMoves, balanceDeltas } from './movements.js';
import { postingRuleFor, VEHICLE } from './postingRules.js';

// ── مواقع المركبات ─────────────────────────────────────────────────
test('كود موقع المركبة من اللوحة موحّد الحالة', () => {
  assert.equal(vehicleLocationCode('12-3456'), 'VAN:12-3456');
  assert.equal(vehicleLocationCode(' ط ح 55 '), 'VAN:ط ح 55');
  assert.equal(vehicleLocationCode(''), '');
  assert.equal(vehicleLocationCode(null), '');
});

test('كشف موقع المركبة واستخراج لوحتها', () => {
  assert.equal(isVehicleLocation('VAN:12-3456'), true);
  assert.equal(isVehicleLocation('van:12-3456'), true);
  assert.equal(isVehicleLocation('STAGING'), false);
  assert.equal(isVehicleLocation('WH-01'), false);
  assert.equal(vehiclePlateFromCode('VAN:12-3456'), '12-3456');
  assert.equal(vehiclePlateFromCode('STAGING'), '');
});

test('بادئة المركبة محجوزة فلا يحملها مستودع حقيقيّ', () => {
  assert.equal(isReservedCode('VAN:12-3456'), true);
  assert.equal(isReservedCode('STAGING'), true, 'موقع نظام محجوز أيضًا');
  assert.equal(isReservedCode('WH-01'), false);
});

test('تسمية موقع المركبة للعرض', () => {
  assert.equal(locationLabel('VAN:12-3456'), '🚚 مركبة 12-3456');
});

test('تقرير «ما على المركبات الآن»: غير الصفريّ في مواقع المركبات', () => {
  const balances = [
    { sku: 'A', warehouse: 'VAN:12-3456', qty: 4 },
    { sku: 'B', warehouse: 'VAN:99-0000', qty: 0 },
    { sku: 'C', warehouse: 'WH-01', qty: 10 },
    { sku: 'D', warehouse: 'STAGING', qty: 3 },
  ];
  const onVans = onVehicleBalances(balances);
  assert.equal(onVans.length, 1, 'مركبةٌ واحدة عليها رصيد غير صفريّ');
  assert.equal(onVans[0].sku, 'A');
  assert.equal(onVans[0].plate, '12-3456');
});

// ── قيد التحميل (DN) والتسليم (POD) ─────────────────────────────────
test('قاعدتا DN وPOD معرّفتان باتجاه المركبة', () => {
  assert.equal(postingRuleFor('DN').to, VEHICLE, 'إذن التسليم يُحمّل بالمركبة');
  assert.equal(postingRuleFor('DN').from, 'STAGING');
  assert.equal(postingRuleFor('POD').from, VEHICLE, 'التسليم يخصم من المركبة');
  assert.equal(postingRuleFor('POD').to, null, 'إلى خارج المنشأة');
});

test('DN يُحمّل من التجهيز إلى موقع المركبة بلوحتها', () => {
  const dn = {
    id: 'dn1',
    type: 'DN',
    header: { vehiclePlate: '12-3456' },
    lines: [{ sku: 'A', qty: 5, unitPrice: 2 }],
  };
  const { moves, problems } = buildMoves(dn);
  assert.equal(problems.length, 0);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'STAGING');
  assert.equal(moves[0].to, 'VAN:12-3456');
  assert.equal(moves[0].qty, 5);

  const { deltas } = balanceDeltas(moves);
  const van = deltas.find((d) => d.warehouse === 'VAN:12-3456');
  const staging = deltas.find((d) => d.warehouse === 'STAGING');
  assert.equal(van.delta, 5, 'يزيد رصيد المركبة');
  assert.equal(staging.delta, -5, 'ينقص التجهيز');
});

test('POD يخصم من موقع المركبة إلى خارج المنشأة', () => {
  const pod = {
    id: 'pod1',
    type: 'POD',
    header: { vehiclePlate: '12-3456' },
    lines: [{ sku: 'A', qty: 5, unitPrice: 2 }],
  };
  const { moves, problems } = buildMoves(pod);
  assert.equal(problems.length, 0);
  assert.equal(moves[0].from, 'VAN:12-3456');
  assert.equal(moves[0].to, null, 'خارج المنشأة');

  const { deltas } = balanceDeltas(moves);
  assert.equal(deltas.length, 1, 'الخارج لا رصيد له — فقط خصم المركبة');
  assert.equal(deltas[0].warehouse, 'VAN:12-3456');
  assert.equal(deltas[0].delta, -5, 'يُخصم رصيد المركبة عند التسليم');
});

test('DN/POD بلا لوحة مركبة يُرفض قيده بسبب مكتوب', () => {
  const dn = { id: 'x', type: 'DN', header: {}, lines: [{ sku: 'A', qty: 5 }] };
  const { moves, problems } = buildMoves(dn);
  assert.equal(moves.length, 0);
  assert.ok(problems.length > 0, 'لا قيد بلا موقع مركبة');
});
