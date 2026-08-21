/**
 * حرّاس منطق مركز التجزئة.
 *
 * ما يُختبر هنا كان قبل اليوم داخل وسم `script` في الصفحة — فلم يكن اختباره
 * ممكنًا أصلًا. وأهمّ ما فيه ليس ما يفشل صراخًا بل ما يفشل صمتًا: سداسيٌّ
 * مائل، وحيٌّ يُنقل إلى البحر بتحرير حقل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAT_CORR,
  matchColor,
  incomeLabel,
  infraLabel,
  sectorLabel,
  segmentBadgeClass,
  mergeOverrides,
  hubStats,
  hexPolygon,
  adaptiveRadius,
  sanitizeOverride,
  EDITABLE_FIELDS,
  HEX_MIN_RADIUS,
  HEX_MAX_RADIUS,
} from './hubModel.js';

// ═══ الوسوم ═══════════════════════════════════════════════════════════════

test('لون المطابقة: الأحمر لغير المطابق وحده', () => {
  assert.equal(matchColor('غير مطابق'), '#f85149');
  assert.equal(matchColor('جزئي'), '#d29922');
  assert.equal(matchColor('مطابق'), '#3fb950');
});

test('الوسوم تمرّر المجهول كما هو بدل أن تبتلعه', () => {
  assert.equal(incomeLabel('مرتفع'), '💰 مرتفع');
  assert.equal(incomeLabel('قيمةٌ مستجدّة'), 'قيمةٌ مستجدّة');
  assert.equal(infraLabel('ممتاز'), '🟢 ممتازة');
  assert.equal(sectorLabel(3), 'كثافة FMCG');
  assert.equal(sectorLabel(99), 99);
});

test('شارة الشريحة: A·B·D بأصنافها، وما سواها على C', () => {
  assert.equal(segmentBadgeClass('A'), 'badge-A');
  assert.equal(segmentBadgeClass('D'), 'badge-D');
  assert.equal(segmentBadgeClass('C'), 'badge-C');
  assert.equal(segmentBadgeClass('مجهول'), 'badge-C');
});

// ═══ الدمج ════════════════════════════════════════════════════════════════

const SEED = [
  { id: 1, neighborhood: 'وسط البلد', lat: 32.11, lng: 20.06, market_match: 'مطابق', population: 65000 },
  { id: 2, neighborhood: 'الفويهات', lat: 32.09, lng: 20.15, market_match: 'جزئي', population: 40000 },
];

test('الدمج يُصحّح حيًّا قائمًا ولا يمسّ البذرة', () => {
  const merged = mergeOverrides(SEED, [{ id: 2, market_match: 'مطابق' }]);
  assert.equal(merged[1].market_match, 'مطابق');
  assert.equal(merged[1].neighborhood, 'الفويهات', 'ما لم يُذكر في التعديل يبقى من البذرة');
  assert.equal(SEED[1].market_match, 'جزئي', 'البذرة نفسها لم تتغيّر');
  assert.notEqual(merged[0], SEED[0], 'الناتج نسخةٌ لا إشارة');
});

test('★ تعديلٌ لمعرّفٍ لا وجود له يُهمَل — لا يخترع حيًّا على الخريطة', () => {
  const merged = mergeOverrides(SEED, [{ id: 999, neighborhood: 'حيٌّ مُلفَّق', lat: 0, lng: 0 }]);
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((m) => m.id),
    [1, 2]
  );
});

test('الدمج يحتمل الفراغ والقيم المعطوبة', () => {
  assert.deepEqual(mergeOverrides(SEED, null).length, 2);
  assert.deepEqual(mergeOverrides(SEED, [null, undefined, { noId: true }]).length, 2);
  assert.deepEqual(mergeOverrides(null, [{ id: 1 }]), []);
});

// ═══ الأرقام ══════════════════════════════════════════════════════════════

test('إحصاء الشريط: العدّ والسكّان ووسمهم بالمليون', () => {
  const s = hubStats(SEED);
  assert.equal(s.total, 2);
  assert.equal(s.full, 1);
  assert.equal(s.partial, 1);
  assert.equal(s.none, 0);
  assert.equal(s.population, 105000);
  // ‏0.105 يقرّبها `toFixed` إلى 0.10 لا 0.11 — لأنّ تمثيلها العشريّ أقلّ من
  // النصف بقليل. سلوكُ الشاشة نفسه قبل النقل، ويُثبَّت هنا كما هو لا كما يُظنّ.
  assert.equal(s.populationLabel, '0.10م');
});

test('الإحصاء لا ينهار على قائمةٍ فارغة أو سكّانٍ مفقودين', () => {
  assert.deepEqual(hubStats([]).total, 0);
  assert.equal(hubStats([{ id: 1 }]).population, 0);
  assert.equal(hubStats(undefined).populationLabel, '0.00م');
});

// ═══ الهندسة ══════════════════════════════════════════════════════════════

test('السداسيّ سبعُ نقاط، آخرها كأوّلها — فلا يُرسم مفتوحًا', () => {
  const pts = hexPolygon(32.1, 20.1, 0.01);
  assert.equal(pts.length, 7);
  assert.deepEqual(pts[6], pts[0]);
});

test('★ السداسيّ منتظمٌ فعلًا: أضلاعه الستّة متساوية بعد تصحيح خطّ الطول', () => {
  const [cLat, cLng, r] = [32.1, 20.1, 0.01];
  const pts = hexPolygon(cLat, cLng, r);
  const sides = [];
  for (let i = 0; i < 6; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = (x2 - x1) * LAT_CORR;
    const dy = y2 - y1;
    sides.push(Math.sqrt(dx * dx + dy * dy));
  }
  for (const side of sides) {
    assert.ok(Math.abs(side - sides[0]) < 1e-12, `ضلعٌ مختلف: ${side} مقابل ${sides[0]}`);
  }
  // وضلع السداسيّ المنتظم يساوي نصف قطره
  assert.ok(Math.abs(sides[0] - r) < 1e-12, 'الضلع ليس نصف القطر — الشكل ليس سداسيًّا منتظمًا');
});

test('★ تصحيح خطّ الطول مطبَّقٌ حقًّا — والسداسيّ ليس مسطّحًا', () => {
  assert.ok(LAT_CORR > 0.84 && LAT_CORR < 0.85, `التصحيح ${LAT_CORR} ليس جيب تمام 32.1°`);
  const pts = hexPolygon(32.1, 20.1, 0.01);
  const spanLng = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const spanLat = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  // بلا تصحيح يكون امتداد الطول √3·r وامتداد العرض 2r فيبدو الشكل مضغوطًا
  // أفقيًّا؛ ومع التصحيح يتّسع الطول بمقدار 1/cos فيصير √3·r/cos > 2r.
  assert.ok(spanLng > spanLat, 'امتداد الطول لم يتّسع — التصحيح غائب');
  const ratio = (spanLng * LAT_CORR) / spanLat;
  assert.ok(Math.abs(ratio - Math.sqrt(3) / 2) < 1e-9, `النسبة ${ratio} ليست √3/2 — الشكل ليس سداسيًّا مصحَّحًا`);
});

test('نصف القطر يتبع أقرب جار، محصورًا بين الحدّين', () => {
  const close = [
    { id: 1, lat: 32.1, lng: 20.1 },
    { id: 2, lat: 32.1004, lng: 20.1 },
  ];
  assert.equal(adaptiveRadius(close[0], close), HEX_MIN_RADIUS, 'الزحام يقف عند الحدّ الأدنى');

  const far = [
    { id: 1, lat: 32.1, lng: 20.1 },
    { id: 2, lat: 32.4, lng: 20.5 },
  ];
  assert.equal(adaptiveRadius(far[0], far), HEX_MAX_RADIUS, 'العزلة تقف عند الحدّ الأعلى');

  const mid = [
    { id: 1, lat: 32.1, lng: 20.1 },
    { id: 2, lat: 32.118, lng: 20.1 },
  ];
  const r = adaptiveRadius(mid[0], mid);
  assert.ok(r > HEX_MIN_RADIUS && r < HEX_MAX_RADIUS, `بين الحدّين، وجاء ${r}`);
  assert.ok(Math.abs(r - 0.009) < 1e-9, 'نصفُ المسافة إلى أقرب جار');
});

test('حيٌّ وحيدٌ في القائمة لا يُعيد Infinity', () => {
  const only = [{ id: 1, lat: 32.1, lng: 20.1 }];
  assert.equal(adaptiveRadius(only[0], only), HEX_MAX_RADIUS);
  assert.equal(adaptiveRadius(only[0], []), HEX_MAX_RADIUS);
});

// ═══ التنقية قبل الحفظ ════════════════════════════════════════════════════

test('★ الإحداثيّات لا تُحرَّر — فلا يُنقل حيٌّ إلى البحر من نموذج', () => {
  const clean = sanitizeOverride({ id: 3, lat: 0, lng: 0, notes: 'ملاحظة', class: 'A' });
  assert.deepEqual(clean, { id: 3, notes: 'ملاحظة', class: 'A' });
  assert.equal(clean.lat, undefined);
  assert.equal(clean.lng, undefined);
});

test('التنقية ترفض معرّفًا غير صالح بدل أن تكتب سجلًّا بلا هويّة', () => {
  assert.equal(sanitizeOverride({ notes: 'بلا معرّف' }), null);
  assert.equal(sanitizeOverride({ id: 0, notes: 'صفر' }), null);
  assert.equal(sanitizeOverride({ id: '3', notes: 'نصّ' }), null);
  assert.equal(sanitizeOverride(null), null);
});

// ═══ التكامل على البيانات الحقيقيّة ═══════════════════════════════════════

test('★ الطبقة السداسيّة على الأحياء المئة والواحد لا تخرج رأسًا واحدًا عن بنغازي', async () => {
  // اختبارُ وحدةٍ يُثبت أنّ الرياضيّات صحيحة، ولا يُثبت أنّها صحيحةٌ **على
  // مدخلنا**. وحيٌّ على الحافّة بنصف قطرٍ متضخّم يرسم ضلعًا في البحر ولا يشكو
  // أحد. فيُجمَع الاثنان هنا: البذرة الحقيقيّة تمرّ بالهندسة الحقيقيّة.
  const { BENGHAZI_NEIGHBORHOODS: hoods } = await import('../../data/benghazi-hub.js');

  const strays = [];
  for (const hood of hoods) {
    const r = adaptiveRadius(hood, hoods);
    assert.ok(r >= HEX_MIN_RADIUS && r <= HEX_MAX_RADIUS, `${hood.neighborhood}: نصف قطر ${r}`);
    const pts = hexPolygon(hood.lat, hood.lng, r);
    assert.equal(pts.length, 7, `${hood.neighborhood}: مضلّعٌ ناقص`);
    for (const [lng, lat] of pts) {
      if (lat < 31.8 || lat > 32.4 || lng < 19.9 || lng > 20.7) {
        strays.push(`${hood.neighborhood} → (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    }
  }
  assert.deepEqual(strays, [], 'رؤوسٌ سداسيّة خارج بنغازي');
});

test('إحصاء البذرة الحقيقيّة يوافق مجموع أقسامه', async () => {
  const { BENGHAZI_NEIGHBORHOODS: hoods } = await import('../../data/benghazi-hub.js');
  const s = hubStats(hoods);
  assert.equal(s.total, hoods.length);
  assert.equal(s.full + s.partial + s.none, s.total, 'حيٌّ بمطابقةٍ خارج القيم الثلاث');
  assert.ok(s.population > 0);
});

test('لا يمرّ حقلٌ خارج قائمة المسموح، ولا يُختلق حقلٌ غير مُرسَل', () => {
  const clean = sanitizeOverride({ id: 1, neighborhood: 'اسمٌ جديد', hacked: true, gap: 'نعم' });
  assert.deepEqual(Object.keys(clean).sort(), ['gap', 'id', 'neighborhood'], 'الاسم يمرّ والدخيل يسقط');
  assert.equal(clean.hacked, undefined);
});

test('قائمة المسموح تُطابق حقول نموذج التحرير — ولا إحداثيّة فيها', () => {
  // النموذج في الصفحة يعرض هذه الحقول؛ فلو ضاق المسموح عنها لفشل الحفظ صامتًا،
  // ولو اتّسع لأكثر منها لَفُتح بابٌ لا تفتحه الواجهة.
  const inForm = [
    'neighborhood', 'class', 'population', 'income', 'flow',
    'infra', 'market_type', 'market_match', 'notes', 'gap', 'segments_present',
  ];
  assert.deepEqual([...EDITABLE_FIELDS].sort(), [...inForm].sort());
  for (const forbidden of ['lat', 'lng', 'id', 'sector']) {
    assert.ok(!EDITABLE_FIELDS.includes(forbidden), `${forbidden} لا يُحرَّر`);
  }
});
