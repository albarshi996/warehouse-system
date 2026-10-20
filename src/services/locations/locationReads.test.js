/**
 * ‹LOC-READS› حارسُ «الشاشةُ تقرأ ما تعرضه» — والحكمُ لا يتغيّر.
 *
 * ═══ العطبُ الذي يحرسه (كونسول Firebase 2026-10-20) ═══
 * ثلاثَ عشرةَ شاشةً كانت تستمع لـ`bin_locations` **كاملةً عند الفتح** (8,402 خانة) —
 * منها محرّكُ المستندات في كلّ مستندٍ يُفتح — فتجاوزت قراءاتُ يومٍ واحدٍ حصّةَ Spark.
 *
 * ═══ وما يُثبته هذا الملفّ ═══
 * لكلّ شاشة: عالمٌ واحدٌ يُحسب فيه حكمُها من السيّد كاملًا ومن القراءة المقصورة
 * (المقروءُ ∪ الشاهد، أو مستودعُ الشاشة، أو تخطّي المقطع، أو الذاكرةُ المُثبَتةُ بالعدّ) —
 * ويُقارَنان حرفًا. والعالمُ فيه ما يكسر الطرقَ المختصرة: كودٌ مفقود، ومؤرشف، وممتلئ،
 * ومكتوبٌ بحروفٍ صغيرة، وباركودٌ مربوطٌ بخانتين، ومستودعٌ خاناتُه كلُّها مؤرشفة، ومنطقةٌ
 * أوّلُ خاناتها مؤرشفة، وطبليّةٌ في رفٍّ غير مسجَّل، وخانةٌ موقوفةٌ `active:false`.
 * وأخيرًا حارسُ وصلٍ: لا مستمعَ كاملًا في الشاشات إلّا خلف مفتاح الإطفاء.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOCATION_READS_KEY,
  LOCATION_SCREENS,
  SCOPED_LOCATION_READS,
  afterSegment,
  binCodesOfLines,
  codeIndexIsFresh,
  codesInPrefix,
  codesToRead,
  codingProgressFrom,
  coordinatesProven,
  foundOf,
  fullLocationReads,
  isQueryableCode,
  isResolved,
  knownCodesScoped,
  lookupBinVia,
  mergeById,
  mergeCodeIndex,
  pickPrefixesOf,
  prefixCodesVia,
  prefixOfCode,
  readCodeIndex,
  resolveFromWarehouse,
  scanLookupKey,
  schemaHasBinColumn,
  scopeChoicesFrom,
  scopedBinVerdict,
  skipScanPrefixes,
  skipScanZones,
  sortByCode,
  withWitness,
} from './locationReads.js';
import { normalizeLocationCode } from './locationCode.js';
import { binCellVerdict, buildLocationTree, locationOptions, occupancyOf, shapeLocation } from './locationsModel.js';
import { generationPlan, planPrefixOf } from './binTemplate.js';
import { buildLocationGrid, warehouseCodesOf } from './mapGrid.js';
import { bindingProblems, codingProgress, findByBarcode, normalizeBinBarcode } from './binCoding.js';
import { binContents, binProblem, identifyBin } from './binConsole.js';
import { replenishPlan } from './replenishPlan.js';
import { isPickFace } from './replenishModel.js';
import { pickPlan } from './pickPlan.js';
import { buildGrid } from './travelGrid.js';
import { assignmentReport, rowBin } from './binAssignment.js';
import { locationMismatch, reconcile } from './reconcile.js';
import { suggestLocations } from './putawaySuggest.js';
import { scanVerdict } from './scanGate.js';
import { binScanVerdict, openPutawayTask } from '../lpn/putawayTask.js';
import { palletsByBin, unexpectedPlacements } from '../lpn/palletMap.js';
import { generateTasks } from '../tasks/taskFactory.js';
import { scopeChoices } from '../stock/operationScope.js';
import { getSchema } from '../documents/schemas/index.js';
import {
  BALANCE_ROWS,
  ITEM_ROWS,
  PRODUCTS_FULL_READS_KEY,
  applyDelta,
  cursorOf,
  millisOf,
  needsResync,
  packRows,
  productsFullReads,
  unpackRows,
} from '../items/catalogDelta.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..', '..');
const read = (rel) => fs.readFileSync(path.join(srcRoot, rel), 'utf8');
const SCHEMES = JSON.parse(read('data/warehouse-schemes.json'));

/* ═══════════════════════════ العالَم ═══════════════════════════ */

const L = (code, extra = {}) => {
  const { barcode, active, ...rest } = extra;
  return {
    id: code,
    ...shapeLocation({ code, ...rest }),
    ...(barcode !== undefined ? { barcode } : {}),
    ...(active !== undefined ? { active } : {}),
  };
};

function buildWorld() {
  const bins = [];
  for (const z of ['A', 'B']) for (const s of ['L', 'R']) for (const b of ['01', '02']) for (const l of ['01', '02', '03']) {
    bins.push(L(`RH-${z}-${s}-${b}-${l}`));
  }
  const patch = (code, extra) => {
    const i = bins.findIndex((x) => x.code === code);
    bins[i] = L(code, extra);
  };
  patch('RH-A-L-01-01', { pickFace: true, replenishMin: 10, replenishMax: 50, pickSku: 'P1' });
  patch('RH-A-L-01-02', { barcode: 'L-100' });
  patch('RH-A-L-01-03', { mixItems: false });
  patch('RH-A-L-02-01', { status: 'archived' });
  patch('RH-A-L-02-02', { status: 'full' });
  patch('RH-A-R-01-01', { capacity: { qty: 10, pallets: 1 } });
  patch('RH-A-R-02-02', { barcode: 'DUP-1' });
  patch('RH-B-L-01-01', { barcode: 'DUP-1' });
  patch('RH-B-R-02-03', { pickFace: true, replenishMax: 30, pickSku: 'P2' });
  patch('RH-B-R-01-01', { active: false });
  for (let i = 1; i <= 12; i++) {
    // أوّلُ خانات المنطقة A مسمّاةٌ وليست خانةَ المنطقة — فاسمُ المنطقة لا يُؤخذ منها.
    const extra = i === 1 ? { nameAr: 'رفّ المدخل' } : i === 2 ? { barcode: 'L-200' } : {};
    bins.push(L(`TR-A-L-01-${String(i).padStart(2, '0')}`, extra));
  }
  bins.push(L('ZW-A', { nameAr: 'ممرّ الزاوية' }));
  bins.push(L('ZW-A-L-01-01'));
  bins.push(L('ZW-P', { nameAr: 'ممرٌّ مؤرشف', status: 'archived' }));
  bins.push(L('ZW-P-L-01-01', { status: 'archived' }));
  bins.push(L('ZW-Q-L-01-01', { status: 'archived' }));
  bins.push(L('ZW-Q-L-01-02'));
  bins.push(L('OLD-A-L-01-01', { status: 'archived' }));
  return sortByCode(bins);
}

const FULL = buildWorld();
const WITNESS = FULL[0];
const CODES = FULL.map((l) => l.code);

const bal = (id, extra) => ({ id, warehouse: 'WH001', batch: '', expiry: '', unitCost: 2, ...extra });
const BAL = [
  bal('b01', { sku: 'P1', bin: 'RH-A-L-01-01', qty: 4 }), //            وجهٌ تحت الحدّ
  bal('b02', { sku: 'P1', bin: 'RH-B-L-02-01', qty: 40, expiry: '2027-01-01', batch: 'X' }), // احتياطيّ
  bal('b03', { sku: 'P1', bin: 'RH-B-L-02-02', qty: 9, expiry: '2026-10-25', batch: 'Y' }), //  ينتهي قريبًا
  bal('b04', { sku: 'P9', bin: 'RH-A-L-01-03', qty: 3 }), //            رفٌّ لا يقبل الخلط
  bal('b05', { sku: 'P2', bin: '', location: 'RH-A-R-01-02', qty: 2 }), // حقلٌ قديم (`location`)
  bal('b06', { sku: 'P3', bin: '', qty: 50 }), //                          رصيدٌ مجمَلٌ بلا خانة
  bal('b07', { sku: 'P3', bin: 'TR-A-L-01-03', qty: 6, warehouse: 'WH002' }),
  bal('b08', { sku: 'P3', bin: 'RH-A-R-01-01', qty: 8 }),
  bal('b09', { sku: 'P2', bin: 'RH-B-R-02-03', qty: 0 }),
  bal('b10', { sku: 'P4', bin: 'RH-B-R-02-01', qty: 5, expiry: '2026-10-21' }),
  // صنفٌ ينتهي في الرحبة وبديلُه في الزاوية — فالمسارُ يعبر المستودعَ بتغيّر «الآن».
  bal('b11', { sku: 'P5', bin: 'RH-B-L-01-02', qty: 10, expiry: '2026-10-22' }),
  bal('b12', { sku: 'P5', bin: 'ZW-A-L-01-01', qty: 10, expiry: '2027-05-01' }),
];
const UNITS = [
  { code: 'LPN-RH-1', state: 'STORED', warehouse: 'RH', bin: 'RH-A-R-01-01', lines: [{ sku: 'P3', qty: 2 }] },
  { code: 'LPN-TR-1', state: 'STORED', warehouse: 'TR', bin: 'TR-A-L-01-03', lines: [{ sku: 'P3', qty: 1 }] },
  { code: 'LPN-X-1', state: 'STORED', warehouse: 'RH', bin: 'RH-Z-Z-99-99', lines: [] },
  { code: 'LPN-A-1', state: 'STORED', warehouse: 'RH', bin: 'RH-A-L-02-01', lines: [] },
];
const NOW = Date.parse('2026-10-20T08:00:00Z');

/* ── محاكاةُ القرّاء بعقد Firestore ─────────────────────────────── */

/** `warehouse ==` — ما يقرؤه `listenLocationsOfWarehouses`. */
const ofWarehouse = (p) => FULL.filter((l) => l.warehouse === p);
/** مدى البادئة على `bin` و`location` كما يقرؤه `listenBalancesInBinsOf` (نصوصٌ مخزَّنةٌ حرفًا). */
const balancesOfPrefix = (p) =>
  BAL.filter((b) => ['bin', 'location'].some((f) => typeof b[f] === 'string' && b[f] >= `${p}-` && b[f] < `${p}.`));
/** `bin in` و`location in` كما يقرؤه `listenBalancesInBins`. */
const balancesInBins = (codes) => BAL.filter((b) => codes.includes(b.bin) || codes.includes(b.location));
/** `documentId() in` — ما تُعيده `fetchLocationsByCodes`. */
const resolvedOf = (raws, world = FULL) => {
  const map = new Map();
  for (const c of codesToRead(raws)) map.set(c, world.find((l) => l.id === c) || null);
  return map;
};

/* ═══════════════════════════ مفتاحُ الإطفاء ═══════════════════════════ */

test('مفتاحُ الإطفاء: «1» للكلّ، وأسماءُ الشاشات لها وحدها، والتخزينُ المحظورُ لا يُسقط', () => {
  assert.equal(SCOPED_LOCATION_READS, true);
  assert.equal(LOCATION_READS_KEY, 'bz.locations.fullReads');
  const st = (v) => ({ getItem: (k) => (k === LOCATION_READS_KEY ? v : null) });
  for (const screen of Object.values(LOCATION_SCREENS)) {
    assert.equal(fullLocationReads(screen, st('1')), true, screen);
    assert.equal(fullLocationReads(screen, st(null)), false, screen);
  }
  assert.equal(fullLocationReads('bin-console', st('pick-plan, bin-console')), true);
  assert.equal(fullLocationReads('documents', st('pick-plan, bin-console')), false);
  assert.equal(fullLocationReads('documents', { getItem: () => { throw new Error('blocked'); } }), false);
  assert.equal(fullLocationReads('documents', null), false);
  // والأسماءُ لا تتكرّر — اسمٌ واحدٌ لكلّ موضعٍ يقرأ الخانات.
  assert.equal(new Set(Object.values(LOCATION_SCREENS)).size, Object.values(LOCATION_SCREENS).length);
});

test('الأدوات: أكوادٌ قابلةٌ للاستعلام، وشاهدٌ لا يتكرّر، ودمجٌ بالمعرّف', () => {
  assert.deepEqual(codesToRead(['rh-a-l-01-01', 'RH-A-L-01-01', 'A/B', '', null]), ['RH-A-L-01-01']);
  assert.equal(isQueryableCode('__x__'), false);
  assert.equal(prefixOfCode(' rh-a-l '), 'RH');
  assert.equal(afterSegment('rh'), 'RH.');
  const w = withWitness([FULL[3], FULL[0]], FULL[3]);
  assert.deepEqual(w.map((l) => l.code), [FULL[0].code, FULL[3].code]);
  assert.deepEqual(mergeById([{ id: 'a', v: 1 }], [{ id: 'a', v: 2 }, { id: 'b' }]).map((x) => x.v ?? x.id), [1, 'b']);
});

/* ═══════════════════════════ المستند ═══════════════════════════ */

test('المستند: حكمُ خانة الموقع بالمقروء ∪ الشاهد = حكمُه بالسيّد كلّه — كودًا كودًا', () => {
  const raws = ['RH-A-L-01-02', 'RH-A-L-02-01', 'RH-A-L-02-02', 'RH-Q-R-09-09', 'rh a l 01 02', 'TR-A-L-01-01', 'A/B', 'RH', '', '  '];
  for (const raw of raws) {
    assert.deepEqual(
      scopedBinVerdict(raw, { resolved: resolvedOf([raw]), witness: WITNESS }),
      binCellVerdict(raw, FULL),
      `«${raw}»`
    );
  }
  // سيّدٌ فارغ: لا شاهد ⇒ لا حكم — كما تقول القائمةُ الفارغة.
  for (const raw of raws) {
    assert.deepEqual(scopedBinVerdict(raw, { resolved: resolvedOf([raw], []), witness: null }), binCellVerdict(raw, []), `فارغ «${raw}»`);
  }
});

test('المستند: كودٌ لم يُقرأ بعدُ يُعامَل كقائمةٍ لم تصل — لا «غير مسجَّل» عابر', () => {
  assert.equal(isResolved(new Map(), 'RH-Q-R-09-09'), false);
  assert.deepEqual(scopedBinVerdict('RH-Q-R-09-09', { resolved: new Map(), witness: WITNESS }), binCellVerdict('RH-Q-R-09-09', []));
  assert.equal(scopedBinVerdict('RH-Q-R-09-09', { resolved: new Map(), witness: WITNESS }).level, 'ok');
  // وعطبُ الشكل يُقال قبل أيّ قراءة.
  assert.equal(scopedBinVerdict('RH', { resolved: new Map(), witness: WITNESS }).level, 'warn');
});

test('المستند: قائمةُ الاقتراح من مستودع الرأس = قائمتُه من السيّد كلّه، والمستودعُ المقروءُ يحكم بلا قراءةٍ ثانية', () => {
  for (const w of ['RH', 'TR', 'ZW', 'WH001', 'rh']) {
    const p = normalizeLocationCode(w);
    assert.deepEqual(locationOptions(ofWarehouse(p), { warehouse: w }), locationOptions(FULL, { warehouse: w }), w);
  }
  const typed = ['RH-A-L-01-02', 'RH-Q-R-09-09', 'TR-A-L-01-01'];
  const outside = resolvedOf(['TR-A-L-01-01']);
  const merged = resolveFromWarehouse(outside, { prefix: 'RH', locations: ofWarehouse('RH'), ready: true }, typed);
  for (const raw of typed) {
    assert.deepEqual(scopedBinVerdict(raw, { resolved: merged, witness: WITNESS }), binCellVerdict(raw, FULL), raw);
  }
  // وقبل وصول المستودع لا يُحكم على أكواده.
  const early = resolveFromWarehouse(outside, { prefix: 'RH', locations: [], ready: false }, typed);
  assert.equal(isResolved(early, 'RH-Q-R-09-09'), false);
});

test('المستند: عمودُ الموقع في ستّة أنواعٍ بعينها — وغيرُها لا يقرأ خانةً قطّ', () => {
  const withBin = ['ADJ', 'CC', 'MIS', 'PICK', 'PRC', 'PUTAWAY'];
  for (const t of withBin) assert.equal(schemaHasBinColumn(getSchema(t)), true, t);
  for (const t of ['GRN', 'PO', 'SO', 'DN', 'TRN']) assert.equal(schemaHasBinColumn(getSchema(t)), false, t);
  assert.equal(schemaHasBinColumn(null), false);
  assert.deepEqual(binCodesOfLines([{ bin: 'rh-a-l-01-02' }, { bin: 'RH' }, { bin: '' }, {}]), ['RH-A-L-01-02']);
});

test('الإطلاقُ للميدان: مهامُّ التخزين والسحب من المقصور = مهامُّها من السيّد كلّه', () => {
  const lines = [{ sku: 'P1', qty: 5 }, { sku: 'P3', qty: 2, batch: 'Z' }];
  for (const wh of ['RH', 'WH001', 'TR']) {
    const doc = { id: 'd1', type: 'PUTAWAY', number: 'PUT-1', header: { warehouse: wh }, lines };
    const scoped = withWitness(ofWarehouse(wh.toUpperCase()), WITNESS);
    assert.deepEqual(
      generateTasks(doc, { balances: BAL, locations: scoped, items: [], nowMs: NOW }),
      generateTasks(doc, { balances: BAL, locations: FULL, items: [], nowMs: NOW }),
      wh
    );
  }
  const pick = { id: 'd2', type: 'PICK', number: 'PICK-1', header: { warehouse: 'WH001' }, lines: [{ sku: 'P1', qty: 45 }, { sku: 'P3', qty: 9 }, { sku: 'P4', qty: 1 }] };
  const prefixes = pickPrefixesOf(pick, BAL);
  const scoped = withWitness(FULL.filter((l) => prefixes.includes(l.warehouse)), WITNESS);
  assert.deepEqual(
    generateTasks(pick, { balances: BAL, locations: scoped, nowMs: NOW }),
    generateTasks(pick, { balances: BAL, locations: FULL, nowMs: NOW })
  );
});

test('خطّةُ السحب: بادئاتُ المرشّحين تحوي المسارَ أيًّا كان «الآن» الذي يُسقط المنتهي', () => {
  const pick = { header: { warehouse: 'WH001' }, lines: [{ sku: 'P1', qty: 45 }, { sku: 'P4', qty: 1 }, { sku: 'P5', qty: 10 }] };
  const prefixes = pickPrefixesOf(pick, BAL);
  assert.deepEqual(prefixes, ['RH', 'ZW']);
  for (const nowMs of [undefined, NOW, Date.parse('2026-10-26T00:00:00Z'), Date.parse('2030-01-01T00:00:00Z')]) {
    const plan = pickPlan(pick, BAL, { nowMs });
    for (const step of plan.path) assert.ok(prefixes.includes(prefixOfCode(step.bin)), `${step.bin} @ ${nowMs}`);
  }
});

/* ═══════════════════════════ المستودعات وبانيةُ المواقع ═══════════════════════════ */

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function readers(world) {
  const calls = { count: 0, fetch: 0 };
  return {
    calls,
    count: async (p) => { calls.count += 1; return world.filter((l) => l.code >= `${p}-` && l.code < `${p}.`).length; },
    fetchRows: async (p) => { calls.fetch += 1; return world.filter((l) => l.code >= `${p}-` && l.code < `${p}.`); },
  };
}

test('ذاكرةُ أكواد البادئة: لا تُصدَّق إلّا إن ساوى عددُ الخادم حجمَها — والملحقةُ هويّتُها لا تُحذف', async () => {
  const storage = memStorage();
  const world = [...FULL];
  let r = readers(world);
  const cold = await prefixCodesVia({ prefix: 'RH', storage, count: r.count, fetchRows: r.fetchRows });
  assert.equal(cold.source, 'server');
  assert.deepEqual(cold.codes, codesInPrefix(FULL, 'RH'));
  assert.deepEqual(r.calls, { count: 0, fetch: 1 });

  r = readers(world);
  const warm = await prefixCodesVia({ prefix: 'RH', storage, count: r.count, fetchRows: r.fetchRows });
  assert.equal(warm.source, 'memory');
  assert.deepEqual(warm.codes, cold.codes);
  assert.deepEqual(r.calls, { count: 1, fetch: 0 });

  // زميلٌ ولّد خانة ⇒ العددُ يختلف ⇒ تُقرأ.
  world.push(L('RH-C-L-01-01'));
  r = readers(world);
  const after = await prefixCodesVia({ prefix: 'RH', storage, count: r.count, fetchRows: r.fetchRows });
  assert.equal(after.source, 'server');
  assert.ok(after.codes.includes('RH-C-L-01-01'));

  // بلا شبكةٍ لا عدّ ⇒ تُقرأ (ولا يُصدَّق المحفوظ).
  const offline = await prefixCodesVia({ prefix: 'RH', storage, count: async () => { throw new Error('offline'); }, fetchRows: r.fetchRows });
  assert.equal(offline.source, 'server');

  // وما كتبته البانيةُ للتوّ يُضمّ، فالعدُّ التالي يطابق.
  world.push(L('RH-C-L-01-02'));
  mergeCodeIndex(storage, 'RH', ['RH-C-L-01-02', 'TR-A-L-01-01']);
  r = readers(world);
  const merged = await prefixCodesVia({ prefix: 'RH', storage, count: r.count, fetchRows: r.fetchRows });
  assert.equal(merged.source, 'memory');
  assert.ok(merged.codes.includes('RH-C-L-01-02') && !merged.codes.includes('TR-A-L-01-01'));
  assert.equal(codeIndexIsFresh(readCodeIndex(storage, 'RH'), merged.codes.length - 1), false);
  assert.equal(codeIndexIsFresh(null, 3), false);
  assert.equal(codeIndexIsFresh({ codes: ['A', 'A'] }, 1), true);
});

test('المستودعات: خطّةُ التوليد من أكواد بادئاتها وحدَها = خطّتُها من السيّد كلّه', async () => {
  const warehouses = [
    { code: 'WH001', nameAr: 'الرحبة' }, //                       بادئتُه من الإسناد المعتمد
    { code: 'WH002', binPrefix: 'TR', templateId: 'double-sided-racks', templateParams: { aisles: 1, racks: 1, bins: 10 } },
    { code: 'ZW', templateId: 'double-sided-racks', templateParams: { aisles: 2, racks: 1, bins: 1 } },
    { code: 'WH006' },
  ];
  const opts = { warehouses, templates: SCHEMES.templates, assignments: SCHEMES.assignments };
  const storage = memStorage();
  const r = readers(FULL);
  const prefixes = [...new Set(warehouses.map((w) => planPrefixOf(w, SCHEMES.assignments)).filter(Boolean))];
  assert.deepEqual(prefixes, ['RH', 'TR', 'ZW', 'WH006']);
  const codes = (await Promise.all(prefixes.map((p) => prefixCodesVia({ prefix: p, storage, ...r })))).flatMap((x) => x.codes);
  assert.deepEqual(generationPlan({ ...opts, existingCodes: codes }), generationPlan({ ...opts, existingCodes: CODES }));
});

/* ═══════════════════════════ الشجرةُ والخريطة ═══════════════════════════ */

test('الشجرة: شجرةُ مستودعٍ مقروءٍ وحدَه = فرعُه من الشجرة الكاملة، وإشغالُ كلّ خانةٍ هو هو', () => {
  const pallets = palletsByBin(UNITS);
  for (const p of ['RH', 'TR', 'ZW', 'OLD']) {
    assert.deepEqual(
      buildLocationTree(ofWarehouse(p)),
      buildLocationTree(FULL).filter((root) => root.code.startsWith(`${p}-`)),
      p
    );
    for (const loc of ofWarehouse(p)) {
      assert.deepEqual(occupancyOf(loc, balancesOfPrefix(p), pallets), occupancyOf(loc, BAL, pallets), loc.code);
    }
  }
});

test('الخريطة: شبكةُ المستودع المقروء = الشبكةُ الكاملةُ مرشَّحةً به، والقائمةُ بالتخطّي = قائمتُها', async () => {
  const pallets = palletsByBin(UNITS);
  for (const p of ['RH', 'TR', 'ZW']) {
    for (const o of [{}, { includeArchived: true }, { storageType: 'ambient', term: 'A-L' }]) {
      assert.deepEqual(
        buildLocationGrid(ofWarehouse(p), balancesOfPrefix(p), { warehouse: p, pallets, ...o }),
        buildLocationGrid(FULL, BAL, { warehouse: p, pallets, ...o }),
        `${p} ${JSON.stringify(o)}`
      );
    }
  }
  const prefixes = await skipScanPrefixes(firstOf(FULL));
  assert.deepEqual(warehouseCodesOf(prefixes.map((w) => ({ warehouse: w }))), warehouseCodesOf(FULL));
  // والطبالي الواقفةُ في كلّ المستودعات تُحكم بخانات مواضعها بأعيانها.
  const bins = [...palletsByBin(UNITS).keys()];
  const scoped = mergeById(ofWarehouse('RH'), foundOf(resolvedOf(bins)));
  assert.deepEqual(unexpectedPlacements(UNITS, scoped), unexpectedPlacements(UNITS, FULL));
});

/* ═══════════════════════════ لوحةُ الخانة ═══════════════════════════ */

const lookupIo = {
  normalizeBinBarcode,
  byBarcode: async (b) => FULL.filter((l) => l.barcode === b),
  byCode: async (c) => FULL.filter((l) => l.id === c),
};

test('لوحة الخانة: المسحةُ تُسأل عن خانتها بقراءتين = `findByBarcode` على السيّد كلّه', async () => {
  const raws = ['L-100', 'l-100', ' L 100 ', 'DUP-1', 'RH-A-L-01-03', 'rh-a-l-01-03', 'NOPE', 'RH-Q-Q-01-01', 'A/B', 'L-200', '', 'ZW-A'];
  for (const raw of raws) {
    assert.deepEqual(await lookupBinVia(raw, lookupIo), findByBarcode(FULL, raw), `«${raw}»`);
  }
  assert.equal((await lookupBinVia('DUP-1', lookupIo)).code, 'RH-A-R-02-02'); // الأصغرُ كودًا
  // مسحتان تتّفقان في صيغتَي الباركود والكود — جوابُهما واحد، ومفتاحُهما واحد.
  assert.equal(scanLookupKey(' l100 ', { normalizeBinBarcode }), scanLookupKey('L100', { normalizeBinBarcode }));
  assert.notEqual(scanLookupKey('l 100', { normalizeBinBarcode }), scanLookupKey('L100', { normalizeBinBarcode }));
});

test('لوحة الخانة: حكمُ الخانة وبطاقتُها ومحتواها بالخانة المقروءة ∪ الشاهد = حكمُها بالسيّد كلّه', () => {
  const warehouses = [{ code: 'WH001', binPrefix: 'RH' }, { code: 'WH002', binPrefix: 'TR' }];
  const doc = (c) => FULL.find((l) => l.code === normalizeLocationCode(c)) || null;
  const cases = [['RH-A-L-01-03', ''], ['RH-Q-Q-01-01', 'RH-A-L-01-01'], ['', 'TR-A-L-01-03'], ['RH-A-L-02-01', 'RH-Q-Q-01-01']];
  for (const [pending, bin] of cases) {
    const known = knownCodesScoped([pending ? doc(pending) : null, bin ? doc(bin) : null], { witness: WITNESS, ready: true });
    const bals = balancesInBins(codesToRead([pending, bin]));
    if (bin) assert.equal(binProblem(bin, known), binProblem(bin, CODES), bin);
    if (pending) {
      assert.deepEqual(
        identifyBin(pending, { warehouses, knownCodes: known, balances: bals, units: UNITS }),
        identifyBin(pending, { warehouses, knownCodes: CODES, balances: BAL, units: UNITS }),
        pending
      );
    }
    const active = pending || bin;
    assert.deepEqual(binContents(active, { balances: bals, units: UNITS }), binContents(active, { balances: BAL, units: UNITS }), active);
  }
  // ★ «بلا كود» (`null`) غيرُ «لم يصل» (`undefined`): خانةٌ محدَّدةٌ مفقودةٌ والمعروضُ فارغ
  //   تُحكم «غير معرَّفة» كما بالقائمة الكاملة (`useLocation('')` يُعيد `null` لهذا بالذات).
  assert.notEqual(binProblem('RH-Q-Q-01-01', knownCodesScoped([null, null], { witness: WITNESS, ready: true })), '');
  assert.equal(
    binProblem('RH-Q-Q-01-01', knownCodesScoped([null, null], { witness: WITNESS, ready: true })),
    binProblem('RH-Q-Q-01-01', CODES)
  );
  // ما لم يصل بعدُ لا يُحكم عليه (قائمةٌ فارغة) — لا «غير معرَّفة» عابر.
  assert.deepEqual(knownCodesScoped([undefined, null], { witness: WITNESS, ready: true }), []);
  assert.deepEqual(knownCodesScoped([null], { witness: WITNESS, ready: false }), []);
  assert.equal(binProblem('RH-Q-Q-01-01', knownCodesScoped([undefined], { witness: WITNESS, ready: true })), '');
});

test('لوحة الخانة: ويزاردُ التكويد — التصادمُ من المربوطة ∪ العنوان، والتقدّمُ من العدّ = حكمُهما بالسيّد كلّه', () => {
  const bound = FULL.filter((l) => l.barcode > '');
  for (const p of ['RH', 'TR', 'ZW', 'XX']) {
    const total = FULL.filter((l) => l.code >= `${p}-` && l.code < `${p}.`).length;
    assert.deepEqual(codingProgressFrom({ total, boundLocations: bound, prefix: p }), codingProgress(FULL, p), p);
  }
  const cases = [
    ['NEW-1', 'RH-A-L-01-03'], //      ملصقٌ جديد على خانةٍ حرّة
    ['L-100', 'RH-A-L-01-03'], //      ملصقٌ مربوطٌ بغيرها
    ['NEW-2', 'RH-A-L-01-02'], //      خانةٌ مربوطةٌ بملصقٍ آخر
    ['NEW-3', 'RH-Q-Q-01-01'], //      عنوانٌ غيرُ مولَّد
    ['L-100', 'RH-A-L-01-02'], //      الربطُ نفسُه
  ];
  for (const [barcode, code] of cases) {
    const target = FULL.find((l) => l.code === code);
    assert.deepEqual(
      bindingProblems({ barcode, code, locations: mergeById(bound, target ? [target] : []) }),
      bindingProblems({ barcode, code, locations: FULL }),
      `${barcode} → ${code}`
    );
  }
});

test('التخزين (لوحة الخانة والاستلام): المهمّةُ ومقترحُها وحكمُ الرفّ من مستودع الطبليّة = من السيّد كلّه', () => {
  const actor = 'مسبار';
  const at = '2026-10-20T08:00:00Z';
  for (const unit of [
    { code: 'LPN-1', state: 'PENDING_PUTAWAY', warehouse: 'RH', bin: 'RH-DOCK', lines: [{ sku: 'P1', qty: 5 }] },
    { code: 'LPN-2', state: 'LABEL_PRINTED', warehouse: 'WH001', bin: '', lines: [{ sku: 'P3', qty: 2 }] },
  ]) {
    const wh = unit.warehouse;
    const locations = withWitness(ofWarehouse(wh), WITNESS);
    const balances = balancesOfPrefix(wh);
    assert.deepEqual(
      openPutawayTask(unit, { locations, balances, actor, at }),
      openPutawayTask(unit, { locations: FULL, balances: BAL, actor, at }),
      unit.code
    );
    for (const code of ['RH-A-L-01-03', 'RH-A-R-01-01', 'RH-A-L-02-01', 'RH-Q-Q-01-01', 'TR-A-L-01-01']) {
      assert.deepEqual(
        binScanVerdict(unit, code, { locations, balances }),
        binScanVerdict(unit, code, { locations: FULL, balances: BAL }),
        `${unit.code} → ${code}`
      );
    }
  }
});

/* ═══════════════════════════ خطّةُ السحب والتزويد ═══════════════════════════ */

test('التزويد: طابورُ أوجه التجهيز من الأوجه ∪ الشاهد = طابورُه من السيّد كلّه', () => {
  const faces = withWitness(FULL.filter(isPickFace), WITNESS);
  for (const warehouse of ['', 'RH', 'TR', 'WH001']) {
    assert.deepEqual(
      replenishPlan({ locations: faces, balances: BAL, nowMs: NOW, warehouse }),
      replenishPlan({ locations: FULL, balances: BAL, nowMs: NOW, warehouse }),
      warehouse || 'الكلّ'
    );
  }
  // سيّدٌ بلا أوجه: الشاهدُ وحده يقول «لا وجه» لا «السيّدُ فارغ».
  const noFaces = FULL.map((l) => ({ ...l, pickFace: false }));
  assert.deepEqual(
    replenishPlan({ locations: withWitness(noFaces.filter(isPickFace), noFaces[0]), balances: BAL, nowMs: NOW }),
    replenishPlan({ locations: noFaces, balances: BAL, nowMs: NOW })
  );
});

test('خطّةُ السحب: الشبكةُ من مستودعات المسار ∪ الشاهد = الشبكةُ الكاملة — والبرهانُ شرطٌ حين لا تقريب', () => {
  const pick = { header: { warehouse: 'WH001' }, lines: [{ sku: 'P1', qty: 45 }, { sku: 'P3', qty: 9 }, { sku: 'P4', qty: 1 }] };
  const prefixes = pickPrefixesOf(pick, BAL);
  const plan = (world) => {
    const rows = withWitness(world.filter((l) => prefixes.includes(l.warehouse)), world[0]);
    return [pickPlan(pick, BAL, { nowMs: NOW, grid: buildGrid(rows) }), pickPlan(pick, BAL, { nowMs: NOW, grid: buildGrid(world) })];
  };
  // ① كلُّ خانةٍ «مُدخَلة» (`x: null` ⇒ صفر) — والبرهانُ بالعدّ يثبت ⇒ المقصورُ يكفي.
  const [s1, f1] = plan(FULL);
  assert.deepEqual(s1, f1);
  assert.equal(coordinatesProven({ total: FULL.length, nullX: FULL.length, numX: 0, nullY: FULL.length, numY: 0 }), true);
  // ② خانةٌ خارج المسار بلا حقل `x` ⇒ «تقريبيّة» على الكلّ لا على المسار ⇒ يفترقان، والعدُّ لا يثبت ⇒ يُقرأ الكلّ.
  const legacy = FULL.map((l) => {
    if (l.code !== 'ZW-A-L-01-01') return l;
    const copy = { ...l };
    delete copy.x; // خانةٌ قديمةٌ كُتبت قبل حقول الشبكة
    return copy;
  });
  const [s2, f2] = plan(legacy);
  assert.notDeepEqual(s2.pathBasis, f2.pathBasis);
  const numX = legacy.filter((l) => typeof l.x === 'number').length;
  const nullX = legacy.filter((l) => l.x === null).length;
  assert.equal(coordinatesProven({ total: legacy.length, nullX, numX, nullY: legacy.length, numY: 0 }), false);
});

/* ═══════════════════════════ الجرد ═══════════════════════════ */

/** أوّلُ خانةٍ كودُها في المدى — ما يُعيده `firstCodeInRange` (استعلامٌ بقراءة). */
function firstOf(world, counter = { n: 0 }) {
  const sorted = sortByCode(world);
  return async (from, to, { after = false } = {}) => {
    counter.n += 1;
    return sorted.find((l) => (after ? l.code > from : l.code >= from) && (!to || l.code < to)) || null;
  };
}

test('الجرد: خياراتُ النطاق بـ«تخطّي المقطع» = `scopeChoices` على السيّد كلّه — بقراءةٍ لكلّ قيمة', async () => {
  const counter = { n: 0 };
  const first = firstOf(FULL, counter);
  const live = await skipScanPrefixes(first, { liveOnly: true });
  assert.deepEqual(live, ['RH', 'TR', 'ZW']); // OLD خاناتُه كلُّها مؤرشفة
  for (const wh of [undefined, '', 'RH', 'TR', 'ZW', 'OLD', 'NONE']) {
    const zones = wh ? await skipScanZones(first, wh) : [];
    assert.deepEqual(scopeChoicesFrom(live, zones, { warehouse: wh }), scopeChoices(FULL, { warehouse: wh }), String(wh));
  }
  assert.ok(counter.n < 40, `قراءات التخطّي ${counter.n}`);
});

/* ═══════════════════════════ الإسنادُ والمطابقة ═══════════════════════════ */

const ROWS = [
  { sku: 'P1', warehouse: 'WH001', bin: 'RH-A-L-01-02', qty: 3 },
  { sku: 'P2', warehouse: 'WH001', bin: 'RH-Q-R-01-04', qty: 2 },
  { sku: 'P3', warehouse: 'WH001', bin: 'rh-b-r-02-03', qty: 4 },
  { sku: 'P4', warehouse: 'WH001', bin: 'RH-B-R-01-01', qty: 1 }, // موقوفٌ `active:false`
  { sku: 'P5', warehouse: 'WH001', bin: '', qty: 6 },
  { sku: 'P6', warehouse: 'WH001', location: 'TR-A-L-01-05', qty: 5 },
];

test('الإسناد: تقريرُ الورقة برفوفها ∪ شاهدٍ «معرَّف» = تقريرُها بالسيّد كلّه', () => {
  const activeFirst = (world) => world.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).find((l) => l.active !== false) || null;
  for (const world of [FULL, FULL.map((l) => ({ ...l, active: false })), FULL.map((l, i) => (i === 0 ? { ...l, active: false } : l))]) {
    const sheetBins = ROWS.map(rowBin).filter(Boolean);
    const found = foundOf(resolvedOf(sheetBins, world)).filter((l) => l.active !== false).map((l) => l.code);
    const w = activeFirst(world);
    const known = w ? [...found, w.code] : found;
    const fullKnown = world.filter((l) => l.active !== false).map((l) => l.code);
    assert.deepEqual(assignmentReport(ROWS, known), assignmentReport(ROWS, fullKnown));
  }
});

test('المطابقة: فحصُ المواقع بمواقع الورقة ∪ الشاهد = فحصُها بالسيّد كلّه', () => {
  const sheets = [
    [{ sku: 'P1', warehouse: 'WH001', systemLocation: 'RH-A-L-01-02', qty: 2 }],
    [{ sku: 'P1', warehouse: 'WH001', systemLocation: 'A1-SHELF', qty: 2 }, { sku: 'P2', warehouse: 'WH001', systemLocation: 'rh-q-r-01-04', qty: 1 }],
    [{ sku: 'P1', warehouse: 'WH001', qty: 2 }],
  ];
  for (const world of [FULL, []]) {
    for (const rows of sheets) {
      const rep = reconcile(rows, BAL);
      const asked = rep.rows.map((r) => r.systemLocation).filter(Boolean);
      const scoped = withWitness(foundOf(resolvedOf(asked, world)), world[0] || null).map((l) => l.code);
      assert.equal(locationMismatch(rep, scoped), locationMismatch(rep, world.map((l) => l.code)));
    }
  }
});

/* ═══════════════════════════ مهمّةُ العامل ═══════════════════════════ */

test('مهمّة العامل: الاقتراحُ من مستودع المهمّة، وحكمُ المسح برفٍّ من أيّ مستودع = حكمُهما بالسيّد كلّه', () => {
  const line = { sku: 'P1', qty: 5, qtyRequired: 5, qtyDone: 0 };
  for (const wh of ['RH', 'TR', 'WH001']) {
    const locs = withWitness(ofWarehouse(wh), WITNESS);
    const bals = balancesOfPrefix(wh);
    assert.deepEqual(
      suggestLocations({ line, locations: locs, balances: bals, warehouse: wh }),
      suggestLocations({ line, locations: FULL, balances: BAL, warehouse: wh }),
      wh
    );
    for (const scannedBin of ['RH-A-L-01-03', 'TR-A-L-01-03', 'RH-Q-Q-01-01', 'RH-A-L-02-02']) {
      const extra = prefixOfCode(scannedBin) === wh ? [] : foundOf(resolvedOf([scannedBin]));
      const args = { line, scannedItem: 'P1', scannedBatch: '', scannedBin, qty: 2, overrideNote: '' };
      assert.deepEqual(
        scanVerdict({ ...args, locations: withWitness(mergeById(ofWarehouse(wh), extra), WITNESS), balances: mergeById(bals, balancesInBins([scannedBin])) }),
        scanVerdict({ ...args, locations: FULL, balances: BAL }),
        `${wh} ← ${scannedBin}`
      );
    }
  }
});

/* ═══════════════════════════ شاشةُ الأصناف ═══════════════════════════ */

test('الأصناف: الأساسُ المحفوظُ + ما خُتم بعده = القاعدةُ الآن — والحذفُ يُكشف بالعدّ', () => {
  const T0 = 1_800_000_000_000;
  const base = [
    { sku: 'B', nameAr: 'ب', updatedAt: { seconds: T0 / 1000 - 50, nanoseconds: 0 } },
    { sku: 'A', nameAr: 'أ', updatedAt: { seconds: T0 / 1000, nanoseconds: 5_000_000 } },
    { sku: 'C', nameAr: 'ج' }, //                                             صفٌّ قديمٌ بلا ختم
  ];
  const cursor = cursorOf(base);
  assert.equal(cursor, T0 + 5);
  const now = [
    { sku: 'A', nameAr: 'أ', updatedAt: { toMillis: () => T0 + 5 } }, //      الحدُّ نفسُه: يُعاد ولا يضرّ
    { sku: 'B', nameAr: 'ب مُعدَّل', updatedAt: { toMillis: () => T0 + 900 } },
    { sku: 'C', nameAr: 'ج' },
    { sku: 'D', nameAr: 'د جديد', updatedAt: { toMillis: () => T0 + 1000 } },
  ];
  const delta = now.filter((r) => (millisOf(r.updatedAt) ?? -1) >= cursor);
  const merged = applyDelta(base, delta, ITEM_ROWS);
  assert.deepEqual(merged.map((r) => [r.sku, r.nameAr]), now.map((r) => [r.sku, r.nameAr]));
  assert.equal(needsResync(merged.length, now.length), false);
  // صنفٌ حُذف ⇒ العددان يختلفان ⇒ يُعاد الأساس.
  assert.equal(needsResync(merged.length, now.length - 1), true);
  // وتعذّرُ العدّ لا يُسقط ما في اليد.
  assert.equal(needsResync(merged.length, null), false);
  // والأرصدةُ بمعرّفها.
  assert.deepEqual(applyDelta([{ id: 'b2', qty: 1 }, { id: 'b1', qty: 1 }], [{ id: 'b2', qty: 9 }], BALANCE_ROWS), [{ id: 'b1', qty: 1 }, { id: 'b2', qty: 9 }]);
});

test('الأصناف: الختمُ بأيّ شكلٍ وصل، والذاكرةُ تُرفض عند الشكّ، والمفتاحُ يُعيد البثّ الكامل', () => {
  assert.equal(millisOf(null), null);
  assert.equal(millisOf(5), 5);
  assert.equal(millisOf({ seconds: 2, nanoseconds: 3_000_000 }), 2003);
  assert.equal(millisOf({ _seconds: 2, _nanoseconds: 0 }), 2000);
  assert.equal(millisOf(new Date(7)), 7);
  assert.equal(millisOf({}), null);
  assert.equal(cursorOf([]), 0);
  assert.deepEqual(unpackRows(packRows([{ id: 'x' }], 10)), { at: 10, rows: [{ id: 'x' }] });
  for (const bad of ['', 'x', '{"v":2,"at":1,"rows":[]}', '{"v":1,"rows":[]}', null]) assert.equal(unpackRows(bad), null);
  const st = (v) => ({ getItem: (k) => (k === PRODUCTS_FULL_READS_KEY ? v : null) });
  assert.equal(productsFullReads(st('1')), true);
  assert.equal(productsFullReads(st(null)), false);
  assert.equal(productsFullReads({ getItem: () => { throw new Error('x'); } }), false);
});

/* ═══════════════════════════ حارسُ الوصل ═══════════════════════════ */

/**
 * ★★★ لا مستمعَ كاملًا على `bin_locations` في شاشةٍ إلّا خلف شرطٍ يذكر مفتاحَ الإطفاء
 *     (`full…`) أو حالةً تقرأ الكلَّ فعلًا (طبليّةٌ أو مهمّةٌ أو مستندٌ بلا مستودع). وكلُّ
 *     شاشةٍ من الثلاث عشرة تسأل المفتاح.
 */
test('الوصل: لا قراءةَ كاملةً لسيّد المواقع في الشاشات إلّا خلف مفتاح الإطفاء', () => {
  const compDir = path.join(srcRoot, 'components');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx|js)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
    }
  };
  walk(compDir);
  const GUARD = /\bfull\w*|\breadAll\b|\bpalletAllOn\b|\ballOn\b|kind !== 'all'|!ok\b/;
  const offenders = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\b(listenLocations|listenAllLocations|fetchLocationsOnce)\s*\(/.test(line)) return;
      if (/^\s*(import|\*|\/\/)/.test(line)) return;
      // النافذةُ من بداية الجملة الحاكمة (أقربُ `useEffect(` أو دالّة) — لا ما قبلها، وإلّا
      // رأت سطرَ تعريف المفتاح نفسَه فظنّته شرطًا (وهو ما كشفه النقض).
      let start = i;
      while (start > Math.max(0, i - 8) && !/useEffect\(|\bfunction\b/.test(lines[start])) start -= 1;
      const window = lines.slice(start, i + 1).filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      if (!GUARD.test(window)) offenders.push(`${path.relative(srcRoot, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);

  const screens = {
    'components/brandzo-erp/documents/DocumentEngine.jsx': 'documents',
    'components/brandzo-erp/warehouse/WarehouseManager.jsx': 'warehouses',
    'components/brandzo-erp/warehouse/LocationTree.jsx': 'locationTree',
    'components/brandzo-erp/warehouse/LocationMap.jsx': 'locationMap',
    'components/brandzo-erp/locations/BinConsole.jsx': 'binConsole',
    'components/brandzo-erp/locations/PickPlanScreen.jsx': 'pickPlan',
    'components/brandzo-erp/locations/LocationBuilder.jsx': 'locationBuilder',
    'components/brandzo-erp/locations/BinAssignment.jsx': 'binAssignment',
    'components/brandzo-erp/lpn/ReceivingFlow.jsx': 'lpnReceiving',
    'components/brandzo-erp/labor/WorkerTaskPanel.jsx': 'workerTask',
    'components/brandzo-erp/stock/ScanFlow.jsx': 'scanFlow',
    'components/brandzo-erp/locations/StockReconcile.jsx': 'stockReconcile',
  };
  for (const [rel, key] of Object.entries(screens)) {
    assert.match(read(rel), new RegExp(`LOCATION_SCREENS\\.${key}\\b`), rel);
  }
  // والإطلاقُ للميدان يتبع مفتاحَ المستند (يُمرَّر إليه `scopedLocations`).
  assert.match(read('components/brandzo-erp/documents/DocumentEngine.jsx'), /scopedLocations=\{!fullLocations\}/);
  // وشاشةُ الأصناف لا تفتح البثَّ الكاملَ إلّا خلف مفتاحها.
  const items = read('components/brandzo-erp/items/ItemMaster.jsx');
  assert.match(items, /fullReads\s*\?\s*subscribeItems\(/);
  assert.match(items, /fullReads \? listenBalances\(setBalances/);
});
