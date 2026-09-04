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

/* ═══════ طبقة العمل ‹EXE-803› — ف ت‑١٦ ═══════ */

import {
  WORK_LEGEND,
  WORK_STATES,
  WORK_STATE_ORDER,
  applyWorkLayer,
  indexWorkByLocation,
  summarizeWork,
  workOf,
} from './mapGrid.js';

const LOCS = [
  { code: 'MAIN-A01-R01-B01', capacity: { qty: 100 } },
  { code: 'MAIN-A01-R01-B02', capacity: { qty: 100 } },
  { code: 'MAIN-A01-R01-B03', capacity: { qty: 100 } },
];

const workTask = (id, state, lines) => ({ id, state, lines });

test('★★ طبقةٌ ثانية على الشبكة نفسها — لا خريطةٌ ثانية', () => {
  const before = buildLocationGrid(LOCS, []);
  const after = applyWorkLayer(buildLocationGrid(LOCS, []), []);
  assert.equal(after.cells.length, before.cells.length, 'الخانات نفسها');
  assert.deepEqual(after.cells.map((c) => c.code), before.cells.map((c) => c.code), 'والفرز نفسه');
  assert.deepEqual(after.summary, before.summary, 'وملخّص الإشغال لم يُمسّ');
  assert.ok('work' in after.cells[0], 'ويُضاف حقلُ العمل وحده');
});

test('★★ لكلّ حالة عملٍ رمزٌ ونمطٌ ونصّ — لا لونٌ وحده', () => {
  assert.equal(WORK_LEGEND.length, WORK_STATE_ORDER.length);
  for (const s of WORK_LEGEND) {
    assert.ok(s.symbol && s.pattern && s.labelAr && s.hint, `${s.id} ناقص`);
    assert.equal(/\p{Extended_Pictographic}/u.test(s.symbol), false, 'ولا إيموجي');
  }
});

test('الحالات الأربع تُشتقّ من الكمّيّات لا من حقلٍ مكتوب', () => {
  assert.equal(workOf([]).state, 'idle');
  assert.equal(workOf([{ task: { id: 't', state: 'pending' }, line: { qtyRequired: 5, qtyDone: 0 } }]).state, 'waiting');
  assert.equal(workOf([{ task: { id: 't', state: 'in_progress' }, line: { qtyRequired: 5, qtyDone: 2 } }]).state, 'active');
  assert.equal(workOf([{ task: { id: 't', state: 'in_progress' }, line: { qtyRequired: 5, qtyDone: 5 } }]).state, 'done');
});

test('★★ المتعثّر يظهر **بسببه** — لا لونٌ أحمر بلا بيان', () => {
  const short = workOf([{ task: { id: 't1', state: 'in_progress' }, line: { qtyRequired: 9, qtyDone: 0, shortfall: true } }]);
  assert.equal(short.state, 'stalled');
  assert.match(short.reasons.join(' '), /نقص رصيد/);
  assert.match(short.summaryText, /نقص رصيد/);

  const paused = workOf([{ task: { id: 't2', state: 'paused' }, line: { qtyRequired: 5, qtyDone: 1 } }]);
  assert.match(paused.reasons.join(' '), /متوقّفة/);

  const delayed = workOf([
    { task: { id: 't3', state: 'in_progress', delayReason: { id: 'equipment', label: 'انتظار رافعة' } }, line: { qtyRequired: 5, qtyDone: 1 } },
  ]);
  assert.equal(delayed.state, 'stalled');
  assert.match(delayed.reasons.join(' '), /انتظار رافعة/);
});

test('السبب الواحد يُقال مرّةً ولو تكرّر في خمسة أسطر', () => {
  const many = workOf([
    { task: { id: 't', state: 'paused' }, line: { qtyRequired: 1, qtyDone: 0 } },
    { task: { id: 't', state: 'paused' }, line: { qtyRequired: 1, qtyDone: 0 } },
  ]);
  assert.equal(many.reasons.length, 1);
  assert.deepEqual(many.tasks, ['t'], 'والمهمّة تُعدّ مرّة');
});

test('الموقع يُقرأ من طرفَي السطر — السحب يُفرغ والتخزين يملأ', () => {
  const idx = indexWorkByLocation([
    workTask('t1', 'in_progress', [{ fromBin: 'MAIN-A01-R01-B01', toBin: 'MAIN-A01-R01-B02', qtyRequired: 3, qtyDone: 1 }]),
  ]);
  assert.equal(idx.get('MAIN-A01-R01-B01').length, 1);
  assert.equal(idx.get('MAIN-A01-R01-B02').length, 1);
});

test('مهمّةٌ منتهيةٌ بلا أثرٍ لا تُلوّن موقعًا · والمنتهية بأثرٍ تبقى مرئيّة', () => {
  const empty = indexWorkByLocation([workTask('t', 'done', [{ fromBin: 'MAIN-A01-R01-B01', qtyRequired: 2, qtyDone: 0 }])]);
  assert.equal(empty.size, 0);
  const withWork = indexWorkByLocation([workTask('t', 'done', [{ fromBin: 'MAIN-A01-R01-B01', qtyRequired: 2, qtyDone: 2 }])]);
  assert.equal(withWork.size, 1, 'فما أُنجز اليوم يُرى على الخريطة');
});

test('★★ ملخّص العمل يقول أين تعثّر لا كم تعثّر', () => {
  const grid = applyWorkLayer(buildLocationGrid(LOCS, []), [
    workTask('t1', 'in_progress', [{ fromBin: 'MAIN-A01-R01-B01', qtyRequired: 10, qtyDone: 10 }]),
    workTask('t2', 'in_progress', [{ fromBin: 'MAIN-A01-R01-B02', qtyRequired: 10, qtyDone: 0, shortfall: true }]),
  ]);
  const s = summarizeWork(grid.cells);
  assert.equal(s.byState.done, 1);
  assert.equal(s.byState.stalled, 1);
  assert.equal(s.byState.idle, 1);
  assert.equal(s.locations, 2, 'والخالي لا يُحتسب عملًا');
  assert.equal(s.required, 20);
  assert.equal(s.done, 10);
  assert.equal(s.pct, 50);
  assert.equal(s.stalled[0].code, 'MAIN-A01-R01-B02');
  assert.ok(s.stalled[0].reasons.length > 0, 'ومع الكود سببه');
});

test('بلا مهامَّ تبقى الخريطة كما هي وكلّ خانةٍ «لا عمل»', () => {
  const grid = applyWorkLayer(buildLocationGrid(LOCS, []), []);
  assert.equal(summarizeWork(grid.cells).locations, 0);
  assert.equal(summarizeWork(grid.cells).pct, null, 'ولا نسبةَ من لا شيء');
  assert.equal(grid.cells[0].work.state, WORK_STATES.idle.id);
});

/* ═══════════════════════════════════════════════════════════════════════
 * 🔒 فهرسُ الطبالي يبلغ الخانةَ — والسقفُ يُقارَن بمشغوله
 *
 * ═══ لماذا وُجد هذا الحارس ═══
 * `occupancyOf` تعرف مواضعَ الطبالي منذ ‹JR-601›، و`palletsByBin` تبني
 * الفهرسَ فعلًا في شاشة الخريطة — **ولا سلكَ بينهما**: `buildLocationGrid`
 * لا يتلقّى الفهرس، فـ`usedPallets` على كلّ خانةٍ `null` أبدًا. والنتيجةُ
 * أنّ الشجرة تكتب «٥ مواضع طبلية» — سقفًا معلَنًا لا يُقارَن بشيء — فيقرؤه
 * المالك رقمًا يُحاسِب وهو حبرٌ على ورق.
 *
 * ═══ ★★ ويُقاس بالمنتِج الحقيقيّ لا بـ`Map` تُبنى باليد ═══
 * الاختباراتُ القديمة أثبتت `occupancyOf` بـ`new Map([['MAIN-A01', [{}, {}]]])`
 * — عيّنةٌ مريحةٌ تمرّ ولا تمسّ السلك. فهنا تمرّ البيانةُ من **شكلها
 * المكتوب** (ما يكتبه `createHandlingUnit` وما يُسوّيه `shapeLocation`) عبر
 * `palletsByBin` نفسِها إلى الشبكة — وهو المسار الذي تسلكه الشاشة حرفًا.
 * ═══════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { palletsByBin } from '../lpn/palletMap.js';
import { shapeLocation } from './locationsModel.js';
import { suggestLocations } from './putawaySuggest.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * طبليّةٌ بالشكل الذي **يكتبه** `createHandlingUnit` — لا بالشكل الذي يكفي
 * القارئ. فحقلٌ يسقط من العيّنة يُخفي عطبًا في القارئ الحقيقيّ.
 */
const unit = (over = {}) => ({
  id: over.code || 'LPN-RH-20260904-000001',
  code: 'LPN-RH-20260904-000001',
  state: 'STORED',
  flags: [],
  warehouse: 'RH',
  bin: 'RH-A-R-01-01',
  lines: [{ sku: 'ITM-9', barcode: '8059692040599', batch: 'B-77', baseQty: 120 }],
  contentRev: 0,
  parentCodes: [],
  sourceDoc: null,
  orderRef: null,
  route: '',
  branch: '',
  createdBy: 'أحمد الشريف',
  createdByUid: 'uid-1',
  ...over,
});

/** موقعٌ بالشكل الذي يُخزَّن — من مُسوّي الكاتب نفسِه لا من كائنٍ مُختصَر. */
const shelf = (code, capacity) => shapeLocation({ code, capacity, nameAr: 'رفّ الزيوت' });

test('🔒★★★ خانةُ موقعٍ عليه طبليّتان تحمل المشغولَ ٢ — لا السقفَ وحدَه', () => {
  const locations = [shelf('RH-A-R-01-01', { qty: 400, pallets: 5 }), shelf('RH-A-R-01-02', { qty: 400, pallets: 5 })];
  const units = [
    unit({ code: 'LPN-RH-20260904-000001', bin: 'RH-A-R-01-01' }),
    // الحجزُ وقوفٌ على الأرض كذلك — الموضعُ مشغولٌ وإن كانت محجوزة.
    unit({ code: 'LPN-RH-20260904-000002', bin: 'RH-A-R-01-01', state: 'RESERVED' }),
    // ★ وطبليّةٌ خرجت من الأرض لا تشغل موضعًا — وإلّا امتلأ الرفّ بأشباح.
    unit({ code: 'LPN-RH-20260904-000003', bin: 'RH-A-R-01-01', state: 'SHIPPED' }),
    unit({ code: 'LPN-RH-20260904-000004', bin: 'RH-A-R-01-02', state: 'PICKING' }),
  ];

  const grid = buildLocationGrid(locations, [], { pallets: palletsByBin(units) });
  const at = (code) => grid.cells.find((c) => c.code === code);

  assert.equal(at('RH-A-R-01-01').occupancy.usedPallets, 2, 'طبليّتان تقفان هنا');
  assert.equal(at('RH-A-R-01-01').occupancy.capacityPallets, 5);
  assert.equal(at('RH-A-R-01-01').occupancy.remainingPallets, 3);
  assert.equal(at('RH-A-R-01-02').occupancy.usedPallets, 1);
  // والنصُّ يقول المقارنةَ لا طرفَها: رقمٌ بلا مقامٍ لا يُحاسِب.
  assert.match(at('RH-A-R-01-01').palletText, /2 من 5/);
  assert.match(at('RH-A-R-01-01').summaryText, /2 من 5/);
});

test('★★ ورفٌّ في الفهرس بلا طبليّةٍ صفرٌ لا `null` — الفهرسُ معلومٌ وهو خالٍ', () => {
  const grid = buildLocationGrid([shelf('RH-A-R-02-01', { qty: 400, pallets: 3 })], [], {
    pallets: palletsByBin([unit({ bin: 'RH-A-R-09-09' })]),
  });
  assert.equal(grid.cells[0].occupancy.usedPallets, 0);
  assert.equal(grid.cells[0].occupancy.remainingPallets, 3);
});

test('★★★ وبلا فهرسٍ لا يُحسب امتلاءٌ من جهل — الحقولُ `null` والنصُّ صامت', () => {
  // النداءُ ثلاثيُّ الوسائط لا يُغيّر النداءَ الثنائيّ حرفًا: مستدعٍ لم يُوصَل
  // بعدُ يبقى كما كان، ولا يُغلق رفٌّ في وجه عاملٍ لأنّ شاشةً لم تجلب الطبالي.
  const grid = buildLocationGrid([shelf('RH-A-R-01-01', { qty: 400, pallets: 5 })], []);
  assert.equal(grid.cells[0].occupancy.usedPallets, null);
  assert.equal(grid.cells[0].occupancy.remainingPallets, null);
  // ★★★ وهنا لبُّ شكوى المالك: الرقمُ المجرّد يُقرأ إشغالًا. فحين يُجهل
  // المشغولُ **يُقال إنّه سقفٌ صراحةً** ولا يُكتب «٥ مواضع» فيُظنّ محاسبةً.
  assert.match(grid.cells[0].palletText, /^سقفُ 5 موضع طبلية$/);
  assert.doesNotMatch(grid.cells[0].palletText, / من /, 'ولا مقارنةَ من مجهول');
});

/* ═══════════════════════════════════════════════════════════════════════
 * 🔒 وحدةُ البند تبلغ محرّكَ الاقتراح من «التخزين الموجّه»
 *
 * ═══ العطبُ المقيس ═══
 * `SuggestedBin` يبني حقيبةَ البند حقلًا حقلًا ويُسقط `uom` — والوحدةُ
 * **معروضةٌ وقابلةٌ للتحرير في الصفّ نفسِه** على بُعد اثني عشر سطرًا.
 * وبإسقاطها يعود `handlingNeedOf` فارغًا دائمًا، فيتساوى رفٌّ معلَنٌ
 * «بالطبلية» ورفٌّ «مختلط» في النقاط — أي أنّ نوعَ المناولة **عديمُ الأثر في
 * الشاشة الوحيدة التي اسمُها «الموجّه»**.
 *
 * ═══ ★★ والحارسُ لا يقرأ الشيفرةَ فحسب ═══
 * يستخرج **أسماءَ الحقول التي تُمرَّر فعلًا** من المصدر، يبني بها بندًا،
 * ويُشغّل `suggestLocations` الحقيقيّة عليه. فلو أُعيد إسقاطُ الوحدة يومًا
 * سقط الحارسُ بالفارق الصفريّ نفسِه — لا بنصٍّ يُطابَق.
 * ═══════════════════════════════════════════════════════════════════════ */

const DIRECTED_STORAGE = path.join(SRC, 'components', 'brandzo-erp', 'locations', 'DirectedStorage.jsx');

/** نصُّ نداءٍ كاملًا بموازنة الأقواس — فالنداءُ هنا يمتدّ سطورًا. */
function callText(src, fn) {
  const start = src.indexOf(`${fn}(`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('(', start); i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/** أسماءُ حقولِ كائنٍ حرفيٍّ يلي مفتاحًا — بموازنة الأقواس المعقوفة. */
function objectKeysAfter(text, key) {
  const at = text.indexOf(`${key}:`);
  if (at < 0) return [];
  const open = text.indexOf('{', at);
  if (open < 0) return [];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return [...text.slice(open + 1, i).matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    }
  }
  return [];
}

/** قيمٌ واقعيّةٌ لبندِ استلامٍ بالطبلية — يُبنى منها ما أعلنه المصدرُ وحدَه. */
const LINE_VALUES = {
  sku: 'ITM-9',
  barcode: '8059692040599',
  description: 'زيت ذرة ٥ لتر',
  uom: 'pallet',
  qty: 6,
  batch: 'B-77',
  expiry: '2027-01-01',
  notes: '',
  warehouse: 'RH',
};

test('🔒★★★ «التخزين الموجّه» يمرّر وحدةَ البند — وإلّا تساوى رفُّ الطبالي والمختلط', () => {
  const src = fs.readFileSync(DIRECTED_STORAGE, 'utf8');
  const call = callText(src, 'suggestLocations');
  assert.ok(call, 'لا نداءَ لـ`suggestLocations` في شاشة التخزين الموجّه');

  const passed = objectKeysAfter(call, 'line');
  const line = Object.fromEntries(passed.filter((f) => f in LINE_VALUES).map((f) => [f, LINE_VALUES[f]]));

  const locations = [
    shapeLocation({ code: 'RH-A-R-01-01', handling: 'pallet', capacity: { qty: 400, pallets: 5 } }),
    shapeLocation({ code: 'RH-A-R-01-02', handling: 'mixed', capacity: { qty: 400, pallets: 5 } }),
  ];
  const advice = suggestLocations({ line, locations, balances: [], warehouse: 'RH' });
  const scoreAt = (code) => advice.candidates.find((c) => c.code === code)?.score;

  assert.ok(
    scoreAt('RH-A-R-01-01') > scoreAt('RH-A-R-01-02'),
    'بندٌ بالطبلية يجب أن يُقدّم رفَّ الطبالي على المختلط — والفارقُ اليوم صفر ' +
      `(${scoreAt('RH-A-R-01-01')} مقابل ${scoreAt('RH-A-R-01-02')}) لأنّ الوحدةَ لا تُمرَّر: ` +
      `المُمرَّر ${JSON.stringify(passed)}`
  );
});

test('★★ وبطاقةُ الصنف تصل معها — معاملُ الطبليّة يُقرأ حين تغيب الوحدة', () => {
  const call = callText(fs.readFileSync(DIRECTED_STORAGE, 'utf8'), 'suggestLocations');
  assert.match(
    call,
    /\bitem\b/,
    'بطاقةُ الصنف لا تصل المحرّكَ: فمعاملُ الطبليّة (`uomFactors`) لا يُقرأ، ' +
      'وبندٌ كُتب بلا وحدةٍ يبقى بلا مناولةٍ معروفة'
  );
});
