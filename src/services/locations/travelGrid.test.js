/**
 * اختبارات شبكة الممرّات ‹EXE-801›.
 *
 * قرار المالك ت-O07: **شبكةٌ تقريبيّة من ترتيب الأكواد**. فالحارس الحاكم هنا
 * أنّ كلّ رقمٍ يخرج منها **يقول إنّه تقريبيّ** — ورقمُ مسافةٍ يُعرض كأنّه
 * مقيس أسوأ من غيابه. والحارس الثاني: لا كسرَ لموقعٍ قائم ولا لمفتاح الرصيد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRID_DEFAULTS,
  GRID_FIELDS,
  POINT_SOURCE,
  buildGrid,
  gridPointOf,
  levelIndexOf,
  naturalRank,
  routeDistance,
  travelDistance,
} from './travelGrid.js';
import { balanceLocationCode, shapeLocation } from './locationsModel.js';
import { CODE_SEGMENTS } from './locationCode.js';

/** مستودعٌ بممرّين: A01 فيه ثلاث خانات، B01 فيه اثنتان. */
const CODES = [
  'MAIN-A01-R01-B01',
  'MAIN-A01-R01-B02',
  'MAIN-A01-R02-B01',
  'MAIN-B01-R01-B01',
  'MAIN-B01-R01-B02',
];

const grid = buildGrid(CODES);

/* ── الاشتقاق من ترتيب الأكواد ───────────────────────────────── */

test('★★ الممرّ من المنطقة والموضع من ترتيب الرفّ والخانة', () => {
  const a1 = gridPointOf('MAIN-A01-R01-B01', grid);
  const a3 = gridPointOf('MAIN-A01-R02-B01', grid);
  const b1 = gridPointOf('MAIN-B01-R01-B01', grid);
  assert.equal(a1.aisle, 'A01');
  assert.equal(a1.x, 0);
  assert.equal(a3.x, 2, 'الثالثة على طول الممرّ');
  assert.equal(a1.y, 0);
  assert.equal(b1.y, 1, 'الممرّ الثاني');
});

test('★★ الترتيب طبيعيٌّ لا نصّيّ — وإلّا وقع A10 قبل A2 فانقلب صفّ الممرّات', () => {
  assert.ok(naturalRank('A2', 'A10') < 0);
  assert.ok(naturalRank('A10', 'A2') > 0);
  assert.equal(naturalRank('A01', 'A01'), 0);
  const g = buildGrid(['W-A2-R01', 'W-A10-R01']);
  assert.equal(gridPointOf('W-A2-R01', g).y, 0, 'A2 أوّلًا');
  assert.equal(gridPointOf('W-A10-R01', g).y, 1);
});

test('المستوى ارتفاعٌ يُقرأ من رمزه — والمجهول أرضيّ', () => {
  assert.equal(levelIndexOf('L3'), 3);
  assert.equal(levelIndexOf('LG'), 0);
  assert.equal(levelIndexOf('LF'), 1);
  assert.equal(levelIndexOf(''), 0);
  assert.equal(levelIndexOf('زحلقة'), 0, 'ولا يُسقط الحساب');
});

/* ── ★★ التقريب يُعلَن دائمًا (ت-O07) ────────────────────────── */

test('★★ كلّ نقطةٍ مشتقّة تقول إنّها تقريبيّة وتسمّي مصدرها', () => {
  const p = gridPointOf('MAIN-A01-R01-B01', grid);
  assert.equal(p.source, POINT_SOURCE.derived.id);
  assert.equal(p.approximate, true);
  assert.equal(grid.approximate, true);
  assert.equal(grid.declared, 0);
});

test('★★ ولا مسافةَ تخرج بلا نصٍّ يصف أساسها', () => {
  const d = travelDistance('MAIN-A01-R01-B01', 'MAIN-A01-R02-B01', grid);
  assert.equal(d.approximate, true);
  assert.match(d.note, /تقدير/);
  assert.match(d.note, /لا قياسٌ ميدانيّ/);
});

test('★★ إحداثيّاتٌ مُدخَلة تحلّ محلّ المشتقّ لموقعها وحده — ولا انتظارَ لمخطّطٍ كامل', () => {
  const g = buildGrid([{ code: 'MAIN-A01-R01-B01', x: 5, y: 0 }, 'MAIN-A01-R02-B01']);
  const declared = gridPointOf('MAIN-A01-R01-B01', g);
  const derived = gridPointOf('MAIN-A01-R02-B01', g);
  assert.equal(declared.source, POINT_SOURCE.declared.id);
  assert.equal(declared.approximate, false);
  assert.equal(declared.x, 5);
  assert.equal(derived.approximate, true);
  assert.equal(g.declared, 1);
  assert.equal(g.approximate, true, 'والشبكة تبقى تقريبيّةً ما دام فيها مشتقّ');
  // ومسافةٌ طرفُها مشتقٌّ تبقى تقريبيّة — أضعفُ الطرفين يحكم.
  assert.equal(travelDistance('MAIN-A01-R01-B01', 'MAIN-A01-R02-B01', g).approximate, true);
});

test('شبكةٌ كلّها مُدخَلة تُعلن أنّها مقيسة', () => {
  const g = buildGrid([
    { code: 'MAIN-A01-R01-B01', x: 0, y: 0 },
    { code: 'MAIN-A01-R01-B02', x: 3, y: 0 },
  ]);
  assert.equal(g.approximate, false);
  const d = travelDistance('MAIN-A01-R01-B01', 'MAIN-A01-R01-B02', g);
  assert.equal(d.approximate, false);
  assert.equal(d.note, '', 'ولا تحذيرَ حين لا موجبَ له');
});

/* ── ★★ المسافة عبر الشبكة لا بالخطّ المستقيم ────────────────── */

test('★★ الممرّان لا يُخترق الرفّ بينهما — خروجٌ للمعبر ثمّ دخول', () => {
  const same = travelDistance('MAIN-A01-R01-B01', 'MAIN-A01-R02-B01', grid);
  assert.equal(same.path, 'same-aisle');
  assert.equal(same.meters, 2 * GRID_DEFAULTS.bayMeters);

  // من آخر الممرّ الأوّل إلى آخر الثاني: خروجٌ (٢ خانة) + معبر + دخول (١ خانة).
  const cross = travelDistance('MAIN-A01-R02-B01', 'MAIN-B01-R01-B02', grid);
  assert.equal(cross.path, 'cross-aisle');
  const expected = 2 * GRID_DEFAULTS.bayMeters + 1 * GRID_DEFAULTS.aisleMeters + 1 * GRID_DEFAULTS.bayMeters;
  assert.equal(cross.meters, Math.round(expected * 10) / 10);
  assert.ok(cross.meters > same.meters, 'والعبور أطولُ من المشي في الممرّ نفسه');
});

test('الارتفاع يدخل بمترٍ مكافئٍ معلَن — لا يُدَّعى أنّه مشي', () => {
  const g = buildGrid(['W-A01-R01-B01-LG', 'W-A01-R01-B01-L3']);
  const d = travelDistance('W-A01-R01-B01-LG', 'W-A01-R01-B01-L3', g);
  assert.equal(d.meters, 3 * GRID_DEFAULTS.levelEquivalentMeters);
});

test('الأبعاد في مصدرٍ واحد وتُبدَّل بالإعداد', () => {
  const g = buildGrid(CODES, { bayMeters: 2 });
  assert.equal(travelDistance('MAIN-A01-R01-B01', 'MAIN-A01-R02-B01', g).meters, 4);
});

/* ── ما لا يُحسب لا يُخترَع ──────────────────────────────────── */

test('★★ موقعٌ خارج الشبكة: لا مسافةَ ولا رقمٌ مُختلَق', () => {
  const d = travelDistance('MAIN-A01-R01-B01', 'MAIN-Z99-R01-B01', grid);
  assert.equal(d.meters, null);
  assert.equal(d.path, 'unknown');
  assert.match(d.note, /لا تُخترَع/);
});

test('مستودعان مختلفان: نقلٌ لا مشي', () => {
  const g = buildGrid(['MAIN-A01-R01', 'WH2-A01-R01']);
  const d = travelDistance('MAIN-A01-R01', 'WH2-A01-R01', g);
  assert.equal(d.meters, null);
  assert.equal(d.path, 'cross-warehouse');
});

test('كودٌ غير صالح لا يدخل الشبكة ولا يُسقطها', () => {
  const g = buildGrid(['MAIN', '', null, 'MAIN-A01-R01']);
  assert.equal(g.points.size, 1);
  assert.equal(gridPointOf('MAIN', g), null);
});

/* ── التتابع ─────────────────────────────────────────────────── */

test('مسافة التتابع تُجمع بالترتيب المعطى — ولا يُعاد ترتيبه هنا', () => {
  const r = routeDistance(['MAIN-A01-R01-B01', 'MAIN-A01-R01-B02', 'MAIN-A01-R02-B01'], grid);
  assert.equal(r.stops, 3);
  assert.equal(r.legs, 2);
  assert.equal(r.meters, 2 * GRID_DEFAULTS.bayMeters);
  assert.equal(r.approximate, true);
  assert.match(r.note, /تقريبيّ/);
});

test('★★ ساقٌ تعذّرت تُعلَن ولا تُبتلع — والإجمالي يقول إنّه ناقص', () => {
  const r = routeDistance(['MAIN-A01-R01-B01', 'MAIN-Z99-R01-B01', 'MAIN-A01-R02-B01'], grid);
  assert.equal(r.unknown, 2);
  assert.match(r.note, /تعذّر حسابها/);
  assert.match(r.note, /ناقص/);
});

test('تتابعٌ بموقعٍ واحد أو بلا مواقع لا يُسقط الحساب', () => {
  assert.equal(routeDistance(['MAIN-A01-R01-B01'], grid).meters, 0);
  assert.equal(routeDistance([], grid).legs, 0);
});

/* ── ★★ لا كسرَ لما هو قائم ──────────────────────────────────── */

test('★★ حقول الشبكة الستّة اختياريّةٌ كلّها — وموقعٌ بلا واحدٍ منها صالح', () => {
  const plain = shapeLocation({ code: 'MAIN-A01-R01' });
  for (const f of GRID_FIELDS) assert.ok(f in plain, `${f} غائبٌ عن الشكل`);
  assert.equal(plain.x, null, 'و«لم يُدخَل» غيرُ الصفر الذي يعني نقطة الصفر');
  assert.equal(plain.y, null);
  assert.equal(plain.approach, '');
  assert.equal(plain.aisle, '');
});

test('★★ ولا مساسَ بمفتاح الرصيد — الكود وحده يصنعه', () => {
  const before = balanceLocationCode({ bin: 'MAIN-A01-R01-B09' });
  const withGrid = shapeLocation({ code: 'MAIN-A01-R01-B09', x: 3, y: 1, z: 2, aisle: 'A01', approach: 'يمين' });
  assert.equal(withGrid.code, before, 'الكود لم يتغيّر');
  assert.equal(balanceLocationCode({ bin: withGrid.code }), before);
  // ولا حقلَ شبكةٍ تسرّب إلى مقاطع الكود.
  for (const f of GRID_FIELDS) assert.equal(CODE_SEGMENTS.includes(f), false, `${f} تسرّب إلى مقاطع الكود`);
});

test('الحقول المُدخَلة تُسوّى ولا تُخترع: الممرّ كبير والنقطة كودٌ مسوّى', () => {
  const l = shapeLocation({ code: 'MAIN-A01-R01', aisle: 'a01', entryPoint: 'main-a01', x: '4' });
  assert.equal(l.aisle, 'A01');
  assert.equal(l.entryPoint, 'MAIN-A01');
  assert.equal(l.x, 4);
});

/* ═══════ مسار المهمّة ‹EXE-802› — الترتيب بالمشي لا بالكود ═══════ */

import { pickPathOrder, pickPlan, pathBasisOf } from './pickPlan.js';

/** بنودٌ مخطَّطة بمواقعها — كما يُخرجها `planLine`. */
const planned = [
  { index: 0, sku: 'A', picks: [{ bin: 'MAIN-A01-R02-B01', qty: 1 }] },
  { index: 1, sku: 'B', picks: [{ bin: 'MAIN-B01-R01-B01', qty: 1 }] },
  { index: 2, sku: 'C', picks: [{ bin: 'MAIN-A01-R01-B01', qty: 1 }] },
];

test('★★ بلا شبكةٍ يبقى الترتيب بالكود حرفيًّا — لا انكسار', () => {
  const byCode = pickPathOrder(planned);
  assert.deepEqual(byCode.map((s) => s.bin), [
    'MAIN-A01-R01-B01',
    'MAIN-A01-R02-B01',
    'MAIN-B01-R01-B01',
  ]);
  assert.deepEqual(pickPathOrder(planned, null).map((s) => s.bin), byCode.map((s) => s.bin));
  assert.deepEqual(pickPathOrder(planned, { points: new Map() }).map((s) => s.bin), byCode.map((s) => s.bin));
});

test('★★ ومع الشبكة يُرتَّب بأقرب تالٍ فعلًا', () => {
  // الشبكة: A01 ممرّ ٠ · B01 ممرّ ١. الانطلاق من أوّل الممرّ الأوّل.
  const ordered = pickPathOrder(planned, grid).map((s) => s.bin);
  assert.equal(ordered[0], 'MAIN-A01-R01-B01', 'البداية أوّل موقعٍ بالكود — مسارٌ ثابت');
  assert.equal(ordered[1], 'MAIN-A01-R02-B01', 'ثمّ الأقرب: بقيّة الممرّ نفسه');
  assert.equal(ordered[2], 'MAIN-B01-R01-B01', 'والعبور آخرًا');
});

test('★★ المسار عبر الشبكة لا يطول عن المسار بالكود', () => {
  const byCode = routeDistance(pickPathOrder(planned).map((s) => s.bin), grid).meters;
  const byGrid = routeDistance(pickPathOrder(planned, grid).map((s) => s.bin), grid).meters;
  assert.ok(byGrid <= byCode, `${byGrid} ≤ ${byCode}`);
});

test('بنودٌ على الرفّ نفسه تُجمَع ولا يُعاد إليه', () => {
  const twice = [
    { index: 0, sku: 'A', picks: [{ bin: 'MAIN-A01-R01-B01', qty: 1 }] },
    { index: 1, sku: 'B', picks: [{ bin: 'MAIN-B01-R01-B01', qty: 1 }] },
    { index: 2, sku: 'C', picks: [{ bin: 'MAIN-A01-R01-B01', qty: 1 }] },
  ];
  const bins = pickPathOrder(twice, grid).map((s) => s.bin);
  assert.deepEqual(bins, ['MAIN-A01-R01-B01', 'MAIN-A01-R01-B01', 'MAIN-B01-R01-B01']);
});

test('موقعٌ خارج الشبكة يبقى آخرًا ولا يُخمَّن قربه', () => {
  const withAlien = [
    { index: 0, sku: 'A', picks: [{ bin: 'MAIN-A01-R01-B01', qty: 1 }] },
    { index: 1, sku: 'X', picks: [{ bin: 'MAIN-Z99-R09-B09', qty: 1 }] },
    { index: 2, sku: 'C', picks: [{ bin: 'MAIN-A01-R02-B01', qty: 1 }] },
  ];
  const bins = pickPathOrder(withAlien, grid).map((s) => s.bin);
  assert.equal(bins[bins.length - 1], 'MAIN-Z99-R09-B09');
});

test('★★ أساس الترتيب يُعلَن — ولا يُخمَّن من الشاشة', () => {
  assert.equal(pathBasisOf([], null).id, 'code');
  assert.match(pathBasisOf([], null).label, /لا شبكةَ ممرّات/);
  const basis = pathBasisOf(pickPathOrder(planned, grid), grid);
  assert.equal(basis.id, 'grid');
  assert.match(basis.label, /تقريبيّ/, 'وشبكةٌ مشتقّة تقول ذلك في أساسها');
  assert.equal(basis.covered, 3);
});

test('★★ خطّة السحب تحمل المسافة وعدد التوقّفات للمشرف', () => {
  const doc = {
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyRequested: 1 }],
  };
  const balances = [{ sku: 'A', warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01', qty: 5 }];
  const plan = pickPlan(doc, balances, { grid });
  assert.ok(plan.route, 'المسافة جزءٌ من الخطّة لا حسابٌ في الشاشة');
  assert.equal(plan.route.stops, plan.path.length);
  assert.ok(plan.pathBasis.label);
});

test('وخطّةٌ بلا شبكة تبقى صالحةً بمسافةٍ فارغة معلنة', () => {
  const doc = { header: { warehouse: 'MAIN' }, lines: [{ sku: 'A', qtyRequested: 1 }] };
  const balances = [{ sku: 'A', warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01', qty: 5 }];
  const plan = pickPlan(doc, balances);
  assert.equal(plan.pathBasis.id, 'code');
  assert.equal(plan.route.meters, 0);
  assert.equal(plan.route.unknown, 0, 'ساقٌ واحدة لا مسافةَ فيها أصلًا');
});
