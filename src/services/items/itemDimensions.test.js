/**
 * حارسُ أبعاد الصنف وسعةِ الوزن — ‹WMS-201›.
 *
 * وثلاثةُ بنودٍ هنا هي الفجوةُ بعينها:
 * ① مقياسا `weightKg` و`volumeM3` كانا **معلَنين ومعطّلين** — حدٌّ مكتوبٌ لا
 *    يُطبَّق يُورث ثقةً كاذبة، وهو أسوأ من غيابه.
 * ② الوزنُ بوحدة الأساس لا بوحدة البند — ومن ضرب في الكمّيّة المكتوبة أنتج
 *    رقمًا أصغرَ من الحقيقة باثني عشر ضعفًا.
 * ③ المعرفةُ الجزئيّةُ حدٌّ أدنى لا حقيقة — فالرفضُ عليها آمنٌ والقبولُ ليس.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  unitWeightKg,
  unitVolumeM3,
  hasDimensions,
  lineWeightKg,
  lineVolumeM3,
  loadIndexOf,
  loadAt,
  capacityProblem,
  loadSummary,
  dimensionsSummary,
} from './itemDimensions.js';
import { shapeImportedItem } from './itemShape.js';
import { occupancyOf, canReceive } from '../locations/locationsModel.js';
import { scoreLocation, suggestLocations } from '../locations/putawaySuggest.js';

/** صنفٌ وحدةُ أساسه القطعة، وكرتونُه اثنتا عشرةَ قطعة، ووزنُ قطعته كيلو. */
const ITEM = {
  sku: 'ITM-1',
  nameAr: 'لبن طازج',
  baseUom: 'piece',
  uomFactors: { carton: 12, pallet: 480 },
  unitWeightKg: 1,
  unitVolumeM3: 0.002,
};
const LIGHT = { sku: 'ITM-2', baseUom: 'piece', unitWeightKg: 0.25 };
const NO_DIMS = { sku: 'ITM-3', baseUom: 'piece' };

const BIN = (over = {}) => ({ code: 'RH-A-R-01-01', warehouse: 'RH', status: 'active', ...over });

/* ══════════ ① الغيابُ «لا علم» لا صفر ══════════ */

test('★★★ الصنفُ بلا وزنٍ يُعاد له null لا صفرًا — وصفرٌ محسوبٌ يُظهر رفًّا ممتلئًا خاليًا', () => {
  assert.equal(unitWeightKg(NO_DIMS), null);
  assert.equal(unitVolumeM3(NO_DIMS), null);
  assert.equal(unitWeightKg({}), null);
  assert.equal(unitWeightKg(null), null);
  assert.equal(hasDimensions(NO_DIMS), false);
  assert.equal(hasDimensions(ITEM), true);
});

test('الوزنُ الصفرُ والسالبُ خطأُ إدخالٍ لا حقيقة — فيُقرآن «لا علم»', () => {
  assert.equal(unitWeightKg({ unitWeightKg: 0 }), null);
  assert.equal(unitWeightKg({ unitWeightKg: -3 }), null);
  assert.equal(unitWeightKg({ unitWeightKg: 'ثقيل' }), null);
  assert.equal(unitWeightKg({ unitWeightKg: '2.5' }), 2.5, 'النصُّ الرقميُّ من الشيت لا يُقرأ');
});

/* ══════════ ② الوزنُ بوحدة الأساس ══════════ */

test('★★★ عشرةُ كراتينَ لصنفٍ قطعتُه كيلو ومعاملُ كرتونه اثنا عشر = مئةٌ وعشرون', () => {
  const r = lineWeightKg({ qty: 10, uom: 'carton' }, ITEM);
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.kg, 120, 'ضُرب في الكمّيّة المكتوبة — فالرقمُ أصغرُ من الحقيقة باثني عشر ضعفًا');
});

test('والطبليّةُ بمعاملها هي أيضًا — لا يُفترض معاملٌ لم يُعرَّف', () => {
  assert.equal(lineWeightKg({ qty: 2, uom: 'pallet' }, ITEM).kg, 960);
  // وحدةٌ لا معاملَ لها لهذا الصنف ⟹ لا حكمَ بسببٍ مكتوب.
  const r = lineWeightKg({ qty: 5, uom: 'metre' }, ITEM);
  assert.equal(r.ok, false);
  assert.equal(r.kg, null);
  assert.ok(r.problem.includes('معامل'), r.problem);
});

test('بندٌ بلا وحدةٍ مكتوبةٍ يُقرأ بوحدة الأساس — سلوكُ النظام اليوم حرفًا', () => {
  assert.equal(lineWeightKg({ qty: 7 }, ITEM).kg, 7);
  assert.equal(lineWeightKg({ qty: 7, uom: 'piece' }, ITEM).kg, 7);
});

test('الكمّيّةُ صفرٌ وزنُها صفرٌ مؤكَّدٌ لا مجهول — والفارقُ أنّ هذه تُحتسب', () => {
  const r = lineWeightKg({ qty: 0, uom: 'carton' }, ITEM);
  assert.equal(r.ok, true);
  assert.equal(r.kg, 0);
  assert.equal(lineWeightKg({ qty: 'كثير' }, ITEM).kg, null);
});

test('الحجمُ يسلك مسلكَ الوزن حرفًا — ومفتاحُه m3 لا kg', () => {
  const r = lineVolumeM3({ qty: 10, uom: 'carton' }, ITEM);
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.m3, 0.24);
  assert.equal(lineVolumeM3({ qty: 1 }, NO_DIMS).m3, null);
});

/* ══════════ ③ فهرسُ الحِمل والمعرفةُ الجزئيّة ══════════ */

test('فهرسُ الحِمل يجمع وزنَ كلّ موقعٍ من أرصدته', () => {
  const balances = [
    { bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 100 },
    { bin: 'RH-A-R-01-01', sku: 'ITM-2', qty: 40 },
    { bin: 'RH-A-R-02-01', sku: 'ITM-1', qty: 10 },
  ];
  const items = new Map([['ITM-1', ITEM], ['ITM-2', LIGHT]]);
  const idx = loadIndexOf(balances, items);
  assert.equal(idx.get('RH-A-R-01-01').weightKg, 110, '100×1 + 40×0.25');
  assert.equal(idx.get('RH-A-R-01-01').lines, 2);
  assert.equal(idx.get('RH-A-R-02-01').weightKg, 10);
});

test('★★★ المعرفةُ الجزئيّةُ تُعلَن — مجموعٌ على بعض البنود حدٌّ أدنى لا حقيقة', () => {
  const balances = [
    { bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 100 },
    { bin: 'RH-A-R-01-01', sku: 'ITM-3', qty: 500 }, // بلا وزنٍ معرَّف
  ];
  const idx = loadIndexOf(balances, new Map([['ITM-1', ITEM], ['ITM-3', NO_DIMS]]));
  const cell = idx.get('RH-A-R-01-01');
  assert.equal(cell.weightKg, 100, 'حُسب للمجهولِ وزنٌ لم يُعرَّف');
  assert.equal(cell.lines, 2);
  assert.equal(cell.knownWeight, 1);
  assert.equal(cell.partial, true, 'نقصُ المعرفة لم يُعلَن — فيُقرأ الرقمُ كأنّه الحقيقة');
});

test('★★ غيابُ الفهرس يعني «لا علم» لا «صفرَ حمل» — والفرقُ بين حكمٍ ولا حكم', () => {
  assert.equal(loadAt(null, 'RH-A-R-01-01'), null);
  assert.equal(loadAt(undefined, 'X'), null);
  // ومعلومٌ وهذا الرفُّ خالٍ ⟹ صفرٌ صريح.
  const idx = loadIndexOf([{ bin: 'OTHER', sku: 'ITM-1', qty: 5 }], new Map([['ITM-1', ITEM]]));
  assert.deepEqual(loadAt(idx, 'RH-A-R-01-01'), { weightKg: 0, volumeM3: 0, lines: 0, knownWeight: 0, knownVolume: 0, partial: false });
});

test('الرصيدُ الصفرُ والسالبُ لا يُحمَّلان، والموقعُ الفارغُ لا يُفهرَس', () => {
  const idx = loadIndexOf(
    [{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 0 }, { bin: '', sku: 'ITM-1', qty: 9 }],
    new Map([['ITM-1', ITEM]])
  );
  assert.equal(idx.size, 0);
});

test('وحقلُ الموقع يُقرأ bin ثمّ location — نفسُ أولويّة balanceLocationCode', () => {
  const idx = loadIndexOf([{ location: 'RH-A-R-03-01', sku: 'ITM-1', qty: 4 }], { 'ITM-1': ITEM });
  assert.equal(idx.get('RH-A-R-03-01').weightKg, 4, 'استيرادُ إكسل يكتب location ولم يُقرأ');
});

/* ══════════ ④ السقفُ يُطبَّق فعلًا ══════════ */

test('★★★ بندٌ يتجاوز سقفَ وزن الرفّ يُرفض بسببٍ مكتوب — والمقياسُ لم يكن يُحتسب قطّ', () => {
  const location = BIN({ capacity: { weightKg: 500 } });
  const load = { weightKg: 450, volumeM3: 0, lines: 1, knownWeight: 1, knownVolume: 1, partial: false };
  const v = capacityProblem(location, { line: { qty: 10, uom: 'carton' }, item: ITEM, load });
  assert.equal(v.ok, false);
  assert.equal(v.measure, 'weightKg');
  assert.ok(v.reason.includes('500') && v.reason.includes('450') && v.reason.includes('120'), v.reason);
});

test('وما يسعُه يمرّ — والحدُّ نفسُه يمرّ لا يُرفض', () => {
  const location = BIN({ capacity: { weightKg: 500 } });
  const load = { weightKg: 380, volumeM3: 0, lines: 1, knownWeight: 1, knownVolume: 1, partial: false };
  assert.equal(capacityProblem(location, { line: { qty: 10, uom: 'carton' }, item: ITEM, load }).ok, true);
  const atLimit = { ...load, weightKg: 380 };
  assert.equal(capacityProblem(location, { line: { qty: 10, uom: 'carton' }, item: ITEM, load: atLimit }).ok, true, '380+120=500 بالضبط — رُفض الحدُّ نفسُه');
});

test('★★★ ثلاثةُ غياباتٍ تُمرّر: لا سقفَ · لا وزنَ للبند · لا حِملَ معلوم', () => {
  const line = { qty: 10, uom: 'carton' };
  // لا سقف
  assert.equal(capacityProblem(BIN(), { line, item: ITEM, load: { weightKg: 9999, lines: 1, knownWeight: 1 } }).ok, true);
  // لا وزنَ للصنف
  assert.equal(capacityProblem(BIN({ capacity: { weightKg: 1 } }), { line, item: NO_DIMS, load: { weightKg: 0, lines: 1, knownWeight: 0 } }).ok, true);
  // لا حِملَ معلوم (الفهرسُ لم يُمرَّر)
  assert.equal(capacityProblem(BIN({ capacity: { weightKg: 1 } }), { line, item: ITEM, load: null }).ok, true);
  // ولا موقعَ أصلًا
  assert.equal(capacityProblem(null, { line, item: ITEM, load: { weightKg: 0 } }).ok, true);
});

test('★★ الرفضُ على معرفةٍ جزئيّةٍ يقول إنّه جزئيّ — والواقعُ أثقل', () => {
  const location = BIN({ capacity: { weightKg: 500 } });
  const load = { weightKg: 450, volumeM3: 0, lines: 3, knownWeight: 1, knownVolume: 3, partial: true };
  const v = capacityProblem(location, { line: { qty: 10, uom: 'carton' }, item: ITEM, load });
  assert.equal(v.ok, false);
  assert.equal(v.partial, true);
  assert.ok(v.reason.includes('1 من 3'), v.reason);
});

test('سقفُ الحجم يُطبَّق كسقف الوزن', () => {
  const location = BIN({ capacity: { volumeM3: 0.3 } });
  const load = { weightKg: 0, volumeM3: 0.2, lines: 1, knownWeight: 1, knownVolume: 1, partial: false };
  const v = capacityProblem(location, { line: { qty: 50, uom: 'carton' }, item: ITEM, load });
  assert.equal(v.ok, false);
  assert.equal(v.measure, 'volumeM3');
});

/* ══════════ ⑤ occupancyOf يحتسبهما فعلًا ══════════ */

test('★★★ occupancyOf يحتسب الوزنَ والحجمَ — وهو معيارُ الإتمام حرفًا', () => {
  const location = BIN({ capacity: { qty: 1000, weightKg: 500, volumeM3: 2 } });
  const load = { weightKg: 120, volumeM3: 0.5, lines: 1, knownWeight: 1, knownVolume: 1, partial: false };
  const occ = occupancyOf(location, [{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 120 }], null, load);
  assert.equal(occ.usedWeightKg, 120);
  assert.equal(occ.capacityWeightKg, 500);
  assert.equal(occ.remainingWeightKg, 380);
  assert.equal(occ.weightPct, 24);
  assert.equal(occ.usedVolumeM3, 0.5);
  assert.equal(occ.remainingVolumeM3, 1.5);
});

test('★★ وبلا تمرير الحِمل تبقى حقولُه null — فلا حقلٌ قائمٌ يتغيّر ولا نداءٌ ينكسر', () => {
  const location = BIN({ capacity: { qty: 1000, weightKg: 500 } });
  const occ = occupancyOf(location, [{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 120 }]);
  assert.equal(occ.usedWeightKg, null);
  assert.equal(occ.remainingWeightKg, null);
  assert.equal(occ.weightPct, null);
  assert.equal(occ.loadPartial, false);
  // والحقولُ القديمةُ كما هي حرفًا.
  assert.equal(occ.usedQty, 120);
  assert.equal(occ.remainingQty, 880);
  assert.equal(occ.usedPallets, null);
});

test('canReceive ترفض رفًّا بلغ سقفَ وزنه — وتمرّره بلا سقفٍ أو بلا حمل', () => {
  const full = BIN({ capacity: { weightKg: 500 } });
  assert.equal(canReceive(full, 0, null, { weightKg: 500, partial: false }).ok, false);
  assert.ok(canReceive(full, 0, null, { weightKg: 500, partial: false }).reason.includes('سقفَ وزنه'));
  assert.equal(canReceive(full, 0, null, { weightKg: 499, partial: false }).ok, true);
  assert.equal(canReceive(full, 0, null, null).ok, true, 'مُنع بلا حِملٍ معلوم — امتلاءٌ من جهل');
  assert.equal(canReceive(BIN(), 0, null, { weightKg: 9999 }).ok, true, 'مُنع بلا سقفٍ معلَن');
});

/* ══════════ ⑥ الوصلُ بمحرّك التسكين ══════════ */

test('★★★ محرّكُ التسكين يرفض الرفَّ الثقيلَ ويُبقي الخفيف — بسببٍ يقرؤه العامل', () => {
  const locations = [
    BIN({ code: 'RH-A-R-01-01', capacity: { qty: 1000, weightKg: 500 } }),
    BIN({ code: 'RH-A-R-02-01', capacity: { qty: 1000, weightKg: 5000 } }),
  ];
  const balances = [{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 450 }];
  const loads = loadIndexOf(balances, new Map([['ITM-1', ITEM]]));
  const out = suggestLocations({
    line: { sku: 'ITM-1', qty: 10, uom: 'carton' },
    locations,
    balances,
    item: ITEM,
    warehouse: 'RH',
    loads,
  });
  assert.equal(out.candidates.length, 1, 'الرفُّ الثقيلُ ما زال مرشَّحًا');
  assert.equal(out.candidates[0].code, 'RH-A-R-02-01');
  const rejected = out.rejected.find((r) => r.code === 'RH-A-R-01-01');
  assert.ok(rejected, 'المرفوضُ أُخفي — وعاملٌ لا يرى رفَّه يظنّ النظامَ معطَّلًا');
  assert.ok(rejected.reason.includes('الوزن'), rejected.reason);
});

test('★★★ وبلا تمرير الفهرس يبقى حكمُ التسكين كما كان حرفًا — صفرُ انحراف', () => {
  const locations = [BIN({ code: 'RH-A-R-01-01', capacity: { qty: 1000, weightKg: 500 } })];
  const balances = [{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 450 }];
  const out = suggestLocations({
    line: { sku: 'ITM-1', qty: 10, uom: 'carton' },
    locations,
    balances,
    item: ITEM,
    warehouse: 'RH',
  });
  assert.equal(out.candidates.length, 1, 'رُفض رفٌّ بسقفِ وزنٍ بلا فهرسٍ مُمرَّر');
  assert.equal(out.rejected.length, 0);
});

test('التجاوزُ يبقى مسموحًا بسببٍ مُقيَّد — الرفضُ ليس منعًا (قرار المالك)', () => {
  const location = BIN({ capacity: { weightKg: 500 } });
  const loads = loadIndexOf([{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 450 }], new Map([['ITM-1', ITEM]]));
  const v = scoreLocation(location, {
    line: { sku: 'ITM-1', qty: 10, uom: 'carton' },
    balances: [{ bin: 'RH-A-R-01-01', sku: 'ITM-1', qty: 450 }],
    item: ITEM,
    loads,
  });
  assert.equal(v.ok, false);
  assert.ok(v.reason.includes('الوزن'));
  // والمرشَّحُ المقبولُ يحمل حِملَه للعرض.
  const light = scoreLocation(BIN({ code: 'RH-A-R-09-01', capacity: { weightKg: 9000 } }), {
    line: { sku: 'ITM-1', qty: 1, uom: 'carton' },
    balances: [],
    item: ITEM,
    loads,
  });
  assert.equal(light.ok, true);
  assert.ok(light.reasons.some((r) => r.includes('الحِمل')), light.reasons.join(' | '));
});

/* ══════════ ⑦ الاستيرادُ يكتبهما ══════════ */

test('★★★ عمودا الوزن والحجم يُقرآن من الشيت ويُكتبان — ولا عمودٌ قائمٌ يُحذف', () => {
  const out = shapeImportedItem({ sku: 'X', unitWeightKg: '2.5', unitVolumeM3: '0.004', costPrice: '10' });
  assert.equal(out.unitWeightKg, 2.5);
  assert.equal(out.unitVolumeM3, 0.004);
  assert.equal(out.costPrice, 10, 'عمودٌ قائمٌ ضاع');
  assert.equal(out.unitPrice, 10, 'مرآةُ التوافق الخلفيّ انكسرت');
});

test('والعمودُ الغائبُ لا يُكتب — فلا يمحو شيتٌ ناقصٌ وزنًا معرَّفًا', () => {
  const out = shapeImportedItem({ sku: 'X', costPrice: '10' });
  assert.ok(!('unitWeightKg' in out));
  assert.ok(!('unitVolumeM3' in out));
});

/* ══════════ ⑧ سطورُ العرض ══════════ */

test('سطرُ أبعاد الصنف يُسمّي الوحدة — و«الوزن ١» بلا وحدةٍ لا يُقرأ', () => {
  const s = dimensionsSummary(ITEM);
  assert.ok(s.includes('1 كجم') && s.includes('لكلّ'), s);
  assert.equal(dimensionsSummary(NO_DIMS), '');
});

test('سطرُ الحِمل يحمل تحفّظَه — فلا يُقرأ ناقصٌ كأنّه تامّ', () => {
  const location = BIN({ capacity: { weightKg: 500 } });
  assert.ok(loadSummary(location, { weightKg: 120, volumeM3: 0, lines: 1, knownWeight: 1, partial: false }).includes('120 كجم من 500'));
  assert.ok(loadSummary(location, { weightKg: 120, volumeM3: 0, lines: 3, knownWeight: 1, partial: true }).includes('1 من 3'));
  assert.equal(loadSummary(BIN(), { weightKg: 0, volumeM3: 0, lines: 0, knownWeight: 0, partial: false }), '');
  assert.equal(loadSummary(location, null), '');
});
