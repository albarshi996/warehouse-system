/**
 * اختبارات تقرير حركة المستودعات وفق المستودع (طلب المالك): الاتجاه من
 * `from`/`to`، والمواقع الانتقاليّة ليست مستودعاتٍ، والنقل بين مستودعَين يُحسب
 * للطرفين، والترشيح بالتاريخ والمستودع، وأوراقُ الإكسل مكتملةٌ بالإجماليّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  warehouseMovementReport,
  warehouseMovementSheets,
  isWarehouseCode,
  moveDay,
} from './warehouseMovements.js';

const MOVES = [
  { from: 'RECEIVING', to: 'WH001', qty: 100, value: 1000, reasonLabel: 'تخزين على الرفّ', eventDay: '2026-11-01', docType: 'PUTAWAY', docNumber: 'PUTAWAY-2026-0001', sku: 'A' },
  { from: 'WH001', to: 'STAGING', qty: 30, value: 300, reasonLabel: 'سحب للتجهيز', eventDay: '2026-11-02', docType: 'PICK', docNumber: 'PICK-2026-0001', sku: 'A' },
  { from: 'WH002', to: null, qty: 5, value: 50, reasonLabel: 'صرف من المستودع', eventDay: '2026-11-02', docType: 'ISS', docNumber: 'ISS-2026-0001', sku: 'B' },
  { from: 'WH001', to: 'WH002', qty: 10, value: 100, reasonLabel: 'نقل', eventDay: '2026-11-03', docType: 'TRC', docNumber: 'TRC-2026-0001', sku: 'A' },
  { from: 'RECEIVING', to: 'WH001', qty: 7, value: 70, reasonLabel: 'تخزين على الرفّ', eventDay: '', docType: 'PUTAWAY', docNumber: 'PUTAWAY-2026-0002', sku: 'C' },
  { from: 'RECEIVING', to: 'STAGING', qty: 999, value: 9990, reasonLabel: 'داخليّ', eventDay: '2026-11-01', docType: 'X', docNumber: 'X-1', sku: 'D' },
];

test('★ تمييز كود المستودع من موقع النظام والمركبة والعميل والخارج', () => {
  assert.equal(isWarehouseCode('WH001'), true);
  assert.equal(isWarehouseCode('RECEIVING'), false);
  assert.equal(isWarehouseCode('TRANSIT'), false);
  assert.equal(isWarehouseCode('VAN:ABC'), false);
  assert.equal(isWarehouseCode('CUST:C1'), false);
  assert.equal(isWarehouseCode(null), false);
  assert.equal(isWarehouseCode(''), false);
});

test('★ يومُ الحركة: الواقعة فالترحيل', () => {
  assert.equal(moveDay({ eventDay: '2026-11-01' }), '2026-11-01');
  assert.equal(moveDay({ postedDay: '2026-11-02' }), '2026-11-02');
  assert.equal(moveDay({}), '');
});

test('★★★ الاتجاه من from/to: الوارد والمنصرف والصافي لكلّ مستودع', () => {
  const r = warehouseMovementReport(MOVES, { names: { WH001: 'الرحبة', WH002: 'طرابلس' } });
  const wh1 = r.warehouses.find((w) => w.code === 'WH001');
  const wh2 = r.warehouses.find((w) => w.code === 'WH002');

  // WH001: وارد 100 (تخزين) + 7 (تخزين بلا تاريخ) = 107 · منصرف 30 (سحب) + 10 (نقل) = 40 · صافي 67.
  assert.equal(wh1.inQty, 107);
  assert.equal(wh1.outQty, 40);
  assert.equal(wh1.net, 67);
  assert.equal(wh1.name, 'الرحبة');
  // WH002: وارد 10 (نقلٌ وارد) · منصرف 5 (صرفٌ للخارج) · صافي 5.
  assert.equal(wh2.inQty, 10);
  assert.equal(wh2.outQty, 5);
  assert.equal(wh2.net, 5);

  // موقعا النظام فقط (RECEIVING→STAGING) لا يُنتجان مستودعًا.
  assert.equal(r.warehouses.length, 2);
  // الإجماليّ.
  assert.equal(r.totals.inQty, 117);
  assert.equal(r.totals.outQty, 45);
  assert.equal(r.totals.net, 72);
  // حركةٌ بلا يومٍ واحدة (الصفّ الخامس) — مضمَّنةٌ هنا إذ لا ترشيحَ بتاريخ.
  assert.equal(r.undated, 1);
  assert.equal(r.undatedIncluded, 1);
  assert.equal(r.undatedExcluded, 0);
});

test('★★ النقل بين مستودعَين يُحسب واردًا لوجهته ومنصرفًا لمصدره', () => {
  const r = warehouseMovementReport([
    { from: 'WH001', to: 'WH002', qty: 10, value: 100, reasonLabel: 'نقل', eventDay: '2026-11-03' },
  ]);
  assert.equal(r.warehouses.find((w) => w.code === 'WH001').outQty, 10);
  assert.equal(r.warehouses.find((w) => w.code === 'WH002').inQty, 10);
  assert.equal(r.details.length, 2, 'صفّا تفصيلٍ: منصرفٌ ووارد');
});

test('★★ الترشيح بالتاريخ يُسقط ما خرج عن المدى والمجهولَ اليوم', () => {
  const r = warehouseMovementReport(MOVES, { from: '2026-11-02', to: '2026-11-03' });
  const wh1 = r.warehouses.find((w) => w.code === 'WH001');
  // داخل المدى: سحب 30 (11-02) ونقلٌ منصرف 10 (11-03) = 40 · ولا واردَ (التخزينان خارجه/بلا تاريخ).
  assert.equal(wh1.inQty, 0);
  assert.equal(wh1.outQty, 40);
  // الحركةُ بلا تاريخٍ (تخزينُ WH001) أسقطها الترشيح — لكنّها تُعَدّ مستبعَدةً لا تُبتلع صامتةً.
  assert.equal(r.undatedExcluded, 1);
  assert.equal(r.undatedIncluded, 0);
});

test('★ الترشيح بمستودعٍ بعينه يُفرد صفَّه وحده', () => {
  const r = warehouseMovementReport(MOVES, { warehouse: 'WH001' });
  assert.equal(r.warehouses.length, 1);
  assert.equal(r.warehouses[0].code, 'WH001');
  assert.equal(r.warehouses[0].inQty, 107);
});

test('★★ أوراقُ الإكسل: ملخّصٌ بالإجماليّ وتفصيلٌ بالعناوين', () => {
  const r = warehouseMovementReport(MOVES, { names: { WH001: 'الرحبة', WH002: 'طرابلس' } });
  const sheets = warehouseMovementSheets(r);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].name, 'الملخّص وفق المستودع');
  assert.equal(sheets[1].name, 'تفصيل الحركات');
  // ترويسةٌ + مستودعان + صفُّ إجماليّ.
  assert.equal(sheets[0].aoa.length, 1 + 2 + 1);
  assert.equal(sheets[0].aoa.at(-1)[0], 'الإجماليّ');
  // التفصيل: ترويسةٌ + صفٌّ لكلّ جانبٍ مستودعيّ.
  assert.equal(sheets[1].aoa[0][0], 'التاريخ');
  assert.equal(sheets[1].aoa.length, 1 + r.details.length);
});

test('★ تقريرٌ بلا حركاتٍ لا ينفجر', () => {
  const r = warehouseMovementReport([]);
  assert.deepEqual(r.warehouses, []);
  assert.equal(r.totals.inQty, 0);
  assert.equal(r.moveCount, 0);
  const sheets = warehouseMovementSheets(r);
  assert.equal(sheets[0].aoa.length, 2, 'ترويسةٌ + صفُّ إجماليٍّ صفريّ');
});
