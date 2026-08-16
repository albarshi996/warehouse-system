/**
 * اختبارات شبكة الخريطة — الحالة الإدارية تسبق الإشغال، واللون لا يحمل معنًى وحده.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CELL_STATES,
  CELL_STATE_ORDER,
  MAP_LEGEND,
  buildCell,
  buildLocationGrid,
  cellStateOf,
  indexBalancesByLocation,
  orphanBalanceCodes,
  summarize,
  warehouseCodesOf,
} from './mapGrid.js';

const loc = (over = {}) => ({ code: 'MAIN-A01-R01-B01', status: 'active', storageType: 'ambient', capacity: { qty: 100 }, ...over });
const bal = (over = {}) => ({ sku: 'A', qty: 10, bin: 'MAIN-A01-R01-B01', ...over });

/* ── القاعدة ١: الحالة الإدارية تسبق الإشغال ───────────────────────────── */

test('★★ الموقع المتوقّف الفارغ ليس «فارغًا» — هو ممنوع', () => {
  const cell = buildCell(loc({ status: 'stopped' }), []);
  assert.equal(cell.state, 'stopped');
  assert.equal(cell.accepts, false);
});

test('★★ كلّ حالةٍ لا تقبل تُعرض بذاتها لا بإشغالها', () => {
  for (const status of ['reserved', 'stopped', 'maintenance', 'archived']) {
    // ممتلئ رصيدًا أو فارغ — الحكم واحد
    assert.equal(cellStateOf(loc({ status }), { usedQty: 90, remainingQty: 10 }), status, status);
    assert.equal(cellStateOf(loc({ status }), { usedQty: 0, remainingQty: 100 }), status, status);
  }
});

test('★ حالة `full` الإدارية تُعرض ممتلئةً وإن كان الرفّ فارغًا فعلًا', () => {
  // ما يهمّ العامل: أيقبل أم لا. ولو عُرض «فارغًا» لَذهب إليه ورجع.
  assert.equal(cellStateOf(loc({ status: 'full' }), { usedQty: 0, remainingQty: 100 }), 'full');
});

test('الفعّال وحده يُشتقّ من الرصيد: فارغ ← مشغول ← ممتلئ', () => {
  assert.equal(cellStateOf(loc(), { usedQty: 0, remainingQty: 100 }), 'empty');
  assert.equal(cellStateOf(loc(), { usedQty: 40, remainingQty: 60 }), 'occupied');
  assert.equal(cellStateOf(loc(), { usedQty: 100, remainingQty: 0 }), 'full');
});

test('★★ بلا سقفٍ لا امتلاء — `remainingQty:null` تبقى «مشغولًا» لا «ممتلئًا»', () => {
  // نفس قاعدة `canReceive`: سعةٌ غائبة تعني «غير محدودة» لا «ممتلئ»، وإلّا
  // صار كلّ موقعٍ لم تُملأ سعته ممتلئًا يوم التشغيل.
  const cell = buildCell(loc({ capacity: { qty: 0 } }), [bal({ qty: 999 })]);
  assert.equal(cell.occupancy.capacityQty, null);
  assert.equal(cell.state, 'occupied');
  assert.match(cell.capacityText, /بلا سقف/);
});

/* ── القاعدة ٢: اللون لا يحمل معنًى وحده ──────────────────────────────── */

test('★★ لكلّ حالةٍ رمزٌ ونمطٌ ونصّ — لا لونٌ وحده', () => {
  for (const id of CELL_STATE_ORDER) {
    const s = CELL_STATES[id];
    assert.ok(s.symbol, `${id}: بلا رمز`);
    assert.ok(s.pattern, `${id}: بلا نمط`);
    assert.ok(s.labelAr, `${id}: بلا نصّ`);
  }
  const symbols = CELL_STATE_ORDER.map((id) => CELL_STATES[id].symbol);
  assert.equal(new Set(symbols).size, symbols.length, 'رمزان متطابقان يُلغيان فائدة الرمز');
});

test('★★ لا إيموجي في رموز الحالات', () => {
  for (const s of MAP_LEGEND) {
    assert.doesNotMatch(s.symbol, /\p{Extended_Pictographic}/u, `${s.id}: ${s.symbol}`);
  }
});

test('★ الأحمر للتحذير وحده — الحالات العاديّة ليست تحذيرًا', () => {
  assert.equal(CELL_STATES.empty.warn, false);
  assert.equal(CELL_STATES.occupied.warn, false);
  assert.equal(CELL_STATES.full.warn, false);
  assert.equal(CELL_STATES.reserved.warn, false);
  assert.equal(CELL_STATES.archived.warn, false);
  assert.equal(CELL_STATES.stopped.warn, true);
  assert.equal(CELL_STATES.maintenance.warn, true);
});

test('المفتاح مصدره الحالات نفسها فلا يفترق عنها', () => {
  assert.deepEqual(MAP_LEGEND.map((s) => s.id), CELL_STATE_ORDER);
});

test('السطر النصّيّ يحمل المعنى كاملًا للطباعة بالأبيض والأسود', () => {
  const cell = buildCell(loc({ status: 'reserved', nameAr: 'رفّ الزيوت' }), [bal({ qty: 30 })]);
  assert.match(cell.summaryText, /MAIN-A01-R01-B01/);
  assert.match(cell.summaryText, /محجوز/);
  assert.match(cell.summaryText, /30 من 100/);
});

/* ── القاعدة ٣: الرصيد في موقعٍ لا يقبل تحذير ─────────────────────────── */

test('★★ رصيدٌ في موقعٍ متوقّف يُعلَن — لا يراه تقريرٌ آخر', () => {
  const cell = buildCell(loc({ status: 'stopped' }), [bal({ qty: 25 })]);
  assert.equal(cell.alerts.length, 1);
  assert.equal(cell.alerts[0].id, 'stockInBlocked');
  assert.equal(cell.warn, true);
});

test('الممتلئ ليس تنبيهًا — امتلاؤه هو عملُه لا عطبُه', () => {
  const cell = buildCell(loc({ status: 'full' }), [bal({ qty: 100 })]);
  assert.deepEqual(cell.alerts, []);
});

test('★ تجاوز السعة يُعلَن ولا يُقصّ صامتًا', () => {
  const cell = buildCell(loc({ capacity: { qty: 50 } }), [bal({ qty: 80 })]);
  assert.ok(cell.alerts.some((a) => a.id === 'overCapacity'));
  assert.equal(cell.occupancy.usedQty, 80, 'الرصيد يُقال كما هو');
  assert.equal(cell.warn, true);
});

/* ── الفهرسة والشبكة ──────────────────────────────────────────────────── */

test('الفهرسة تجمع أرصدة الموقع الواحد وتتجاهل ما بلا موقع', () => {
  const idx = indexBalancesByLocation([bal(), bal({ sku: 'B' }), bal({ bin: '', location: '' }), bal({ bin: 'MAIN-A02' })]);
  assert.equal(idx.get('MAIN-A01-R01-B01').length, 2);
  assert.equal(idx.get('MAIN-A02').length, 1);
  assert.equal(idx.size, 2);
});

test('★ `location` يُقرأ حين يغيب `bin` — حقلان لمعنًى واحد (ل‑٥)', () => {
  const idx = indexBalancesByLocation([{ qty: 5, location: 'main a01 r01 b01' }]);
  assert.equal(idx.get('MAIN-A01-R01-B01').length, 1, 'والتسوية تسبق المقارنة');
});

test('★★ الشبكة تُبنى من الكود: مستودع ← منطقة ← رفّ', () => {
  const grid = buildLocationGrid(
    [loc({ code: 'MAIN-A01-R01-B01' }), loc({ code: 'MAIN-A01-R01-B02' }), loc({ code: 'MAIN-A02-R09-B01' }), loc({ code: 'DEPOT-Z01-R01' })],
    []
  );
  assert.deepEqual(grid.warehouses.map((w) => w.warehouse), ['DEPOT', 'MAIN']);
  const main = grid.warehouses.find((w) => w.warehouse === 'MAIN');
  assert.deepEqual(main.zones.map((z) => z.zone), ['A01', 'A02']);
  assert.equal(main.zones[0].racks[0].cells.length, 2);
});

test('★ الموقع الناقص المقاطع لا يسقط من الخريطة — منطقةٌ كاملة موقعٌ صالح', () => {
  const grid = buildLocationGrid([loc({ code: 'MAIN-A01' })], []);
  const zone = grid.warehouses[0].zones[0];
  assert.equal(zone.zone, 'A01');
  assert.equal(zone.racks[0].rack, '', 'رفٌّ بلا اسم لا حذفٌ للخانة');
  assert.equal(zone.racks[0].cells[0].code, 'MAIN-A01');
});

test('★ الترتيب طبيعيّ: B9 قبل B10', () => {
  const grid = buildLocationGrid(
    [loc({ code: 'MAIN-A01-R01-B10' }), loc({ code: 'MAIN-A01-R01-B9' }), loc({ code: 'MAIN-A01-R01-B1' })],
    []
  );
  assert.deepEqual(
    grid.warehouses[0].zones[0].racks[0].cells.map((c) => c.bay),
    ['B1', 'B9', 'B10']
  );
});

test('★ المؤرشَف مخفيٌّ افتراضًا ويُستدعى بالطلب — لا يُحذف', () => {
  const list = [loc({ code: 'MAIN-A01-R01-B01' }), loc({ code: 'MAIN-A01-R01-B02', status: 'archived' })];
  assert.equal(buildLocationGrid(list, []).cells.length, 1);
  assert.equal(buildLocationGrid(list, [], { includeArchived: true }).cells.length, 2);
});

test('الحصر بالمستودع وبنوع التخزين وبالبحث', () => {
  const list = [
    loc({ code: 'MAIN-A01-R01-B01', storageType: 'frozen', nameAr: 'مجمّد أوّل' }),
    loc({ code: 'MAIN-A01-R01-B02' }),
    loc({ code: 'DEPOT-Z01-R01' }),
  ];
  assert.equal(buildLocationGrid(list, [], { warehouse: 'main' }).cells.length, 2);
  assert.equal(buildLocationGrid(list, [], { storageType: 'frozen' }).cells.length, 1);
  assert.equal(buildLocationGrid(list, [], { term: 'b02' }).cells.length, 1);
  assert.equal(buildLocationGrid(list, [], { term: 'مجمّد' }).cells.length, 1);
});

/* ── الإحصاء ──────────────────────────────────────────────────────────── */

test('★★ نسبة الامتلاء تُحسب على المسقوف وحده وإلّا كانت كاذبة', () => {
  const s = summarize([
    buildCell(loc({ code: 'MAIN-A01-R01-B01', capacity: { qty: 100 } }), [bal({ qty: 50 })]),
    buildCell(loc({ code: 'MAIN-A01-R01-B02', capacity: { qty: 0 } }), [bal({ bin: 'MAIN-A01-R01-B02', qty: 900 })]),
  ]);
  assert.equal(s.cappedCells, 1);
  assert.equal(s.capacityQty, 100);
  assert.equal(s.usedQty, 950, 'الرصيد كلّه يُجمَع');
  assert.equal(s.fillPct, 50, 'والنسبة على المسقوف وحده');
});

test('بلا سقفٍ في المجموعة كلّها: النسبة `null` لا صفر', () => {
  const s = summarize([buildCell(loc({ capacity: { qty: 0 } }), [])]);
  assert.equal(s.fillPct, null);
});

test('الإحصاء يعدّ الحالات والتنبيهات والمواقع القابلة', () => {
  const s = summarize([
    buildCell(loc({ code: 'MAIN-A01-R01-B01' }), []),
    buildCell(loc({ code: 'MAIN-A01-R01-B02', status: 'stopped' }), [bal({ bin: 'MAIN-A01-R01-B02', qty: 5 })]),
  ]);
  assert.equal(s.byState.empty, 1);
  assert.equal(s.byState.stopped, 1);
  assert.equal(s.acceptingCells, 1);
  assert.equal(s.alerts, 1);
});

/* ── الأرصدة اليتيمة ──────────────────────────────────────────────────── */

test('★★ مواقع النظام والمركبات والعملاء ليست يتيمة — هي مواقع بحكم التصميم', () => {
  const orphans = orphanBalanceCodes(
    [loc({ code: 'MAIN-A01-R01-B01' })],
    [bal(), bal({ bin: 'RECEIVING' }), bal({ bin: 'VAN:12345' }), bal({ bin: 'CUST:C001' }), bal({ bin: '' })]
  );
  assert.deepEqual(orphans, []);
});

test('★ رصيدٌ على كودٍ غير مسجَّل يُعلَن مع عدد سطوره وكمّيّته', () => {
  const orphans = orphanBalanceCodes(
    [loc({ code: 'MAIN-A01-R01-B01' })],
    [bal({ bin: 'MAIN-A09-R01', qty: 7 }), bal({ bin: 'MAIN-A09-R01', qty: 3 })]
  );
  assert.deepEqual(orphans, [{ code: 'MAIN-A09-R01', lines: 2, qty: 10 }]);
});

test('أكواد المستودعات تُستخرج من الكود نفسه', () => {
  assert.deepEqual(warehouseCodesOf([loc({ code: 'MAIN-A01' }), loc({ code: 'DEPOT-Z01' }), loc({ code: 'MAIN-A02' })]), [
    'DEPOT',
    'MAIN',
  ]);
});

test('المدخلات الفارغة لا تُسقط الخريطة', () => {
  const grid = buildLocationGrid(null, null);
  assert.deepEqual(grid.warehouses, []);
  assert.equal(grid.summary.cells, 0);
  assert.deepEqual(grid.orphans, []);
});
