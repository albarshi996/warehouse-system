/**
 * اختباراتُ جرد مخزن فينسيا — بصفوفٍ من ملفّات المالك نفسِها.
 *
 * وأثقلُ اختبارٍ هنا هو **تصادمُ الأرقام الثلاثين**: لو عاد يومًا أحدٌ
 * فجعل الهويّةَ رقمَ الأصل وحدَه، سقط هذا الاختبار وقال له كم أصلًا سيمحوه.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  POPULATIONS,
  VENECIA_WAREHOUSE,
  UNCLASSIFIED,
  isPopulation,
  populationLabel,
  populationAssetType,
  isAssetNo,
  assetDocId,
  parseAssetDocId,
  assetCategory,
  categoriesOf,
  rawQty,
  assetVerdict,
  countVariance,
  isCounted,
  signedText,
  countProgress,
  veneciaSnapshot,
  daysBetween,
  attentionRows,
  filterVenecia,
  nextAssetNoIn,
  VENECIA_EXPORT_COLUMNS,
  veneciaExportRows,
} from './veneciaModel.js';

const seed = JSON.parse(
  readFileSync(new URL('../../data/venecia-assets-seed.json', import.meta.url), 'utf8')
);

/** أصلٌ مختصر — كلُّ اختبارٍ يكتب ما يهمّه فقط. */
const asset = (over = {}) => ({
  id: 'BRZ-0001',
  population: 'issue',
  assetType: 'تخزين لصرف',
  assetName: 'خشب باركي',
  brand: 'دستة',
  serial: 'اثاث',
  qty: 120,
  condition: 'جيد',
  responsible: '',
  department: 'مخزن فينسيا',
  section: '',
  location: 'فينسيا',
  warehouse: VENECIA_WAREHOUSE,
  receivedDate: '',
  notes: '',
  ...over,
});

// ── الهويّة ───────────────────────────────────────────────────────────────

test('المجموعتان معروفتان، وما سواهما يُقال مجهولًا ولا يُخفى', () => {
  assert.deepEqual(POPULATIONS.map((p) => p.id), ['issue', 'supported']);
  assert.ok(isPopulation('issue') && isPopulation('supported'));
  assert.ok(!isPopulation('') && !isPopulation('other'));
  assert.equal(populationLabel('issue'), 'بضاعة الصرف');
  assert.equal(populationLabel('nope'), 'مجموعة غير معروفة');
  assert.equal(populationAssetType('supported'), 'اصول مستعمله');
});

test('الهويّة تضمّ المجموعة إلى الرقم', () => {
  assert.equal(assetDocId('issue', 'BRZ-0001'), 'issue-BRZ-0001');
  assert.equal(assetDocId('supported', ' BRZ-0030 '), 'supported-BRZ-0030');
  assert.deepEqual(parseAssetDocId('supported-BRZ-0030'), {
    population: 'supported',
    assetNo: 'BRZ-0030',
  });
  assert.equal(parseAssetDocId('BRZ-0030'), null);
  assert.equal(parseAssetDocId('other-BRZ-0030'), null);
});

test('ولا يُلفّق معرّفًا لمدخلٍ مشوّه — بل يرمي', () => {
  assert.throws(() => assetDocId('issue', 'BRZ-1'), /مشوّه/);
  assert.throws(() => assetDocId('issue', ''), /مشوّه/);
  assert.throws(() => assetDocId('مجهول', 'BRZ-0001'), /غير معروفة/);
  assert.ok(isAssetNo('BRZ-0074') && !isAssetNo('BRZ-74') && !isAssetNo('brz-0074'));
});

test('★★★ ثلاثون رقمًا متصادمًا بين المجموعتين — والهويّة المركّبة تفصلها', () => {
  const issue = new Set(seed.assets.filter((a) => a.population === 'issue').map((a) => a.id));
  const supported = seed.assets.filter((a) => a.population === 'supported').map((a) => a.id);
  const clashing = supported.filter((id) => issue.has(id));
  assert.equal(clashing.length, 30, 'ملفّا المالك يتصادمان في ثلاثين رقمًا');

  // ولو كان الرقمُ وحدَه هويّةً لَبقي ٧٤ من ١٠٤.
  assert.equal(new Set(seed.assets.map((a) => a.id)).size, 74);
  assert.equal(new Set(seed.assets.map((a) => assetDocId(a.population, a.id))).size, 104);
});

// ── التصنيف المشتقّ ───────────────────────────────────────────────────────

test('التصنيف يُشتقّ: السيريالُ في الصرف، والمجموعةُ في المدعوم', () => {
  assert.equal(assetCategory(asset({ serial: 'سباكه' })), 'سباكه');
  assert.equal(assetCategory(asset({ population: 'supported', serial: 'QUALITEC' })), 'أصول المدعوم');
  assert.equal(assetCategory(asset({ serial: '   ' })), UNCLASSIFIED);
  assert.equal(assetCategory(undefined), UNCLASSIFIED);
});

test('تصنيفاتُ بذرةِ المالك تسعةٌ للصرف وواحدٌ للمدعوم', () => {
  const issue = categoriesOf(seed.assets.filter((a) => a.population === 'issue'));
  assert.deepEqual(
    issue.map(([c]) => c).sort((a, b) => a.localeCompare(b, 'ar')),
    ['اثاث', 'بناء', 'دراجات', 'ري', 'سباكه', 'سيارات', 'كهرباء', 'مواد نجارة', 'مواشي']
  );
  assert.equal(issue.reduce((s, [, n]) => s + n, 0), 74);
  assert.deepEqual(categoriesOf(seed.assets.filter((a) => a.population === 'supported')), [
    ['أصول المدعوم', 30],
  ]);
});

test('التصنيفات مرتّبةٌ بالأكثر ثمّ بالاسم — فالترتيب ثابتٌ لا عشوائيّ', () => {
  const rows = [
    asset({ serial: 'ب' }),
    asset({ serial: 'ج' }),
    asset({ serial: 'ج' }),
    asset({ serial: 'ا' }),
  ];
  assert.deepEqual(categoriesOf(rows), [['ج', 2], ['ا', 1], ['ب', 1]]);
});

// ── الحكم على السجلّ ──────────────────────────────────────────────────────

test('الحكم يجمع كلَّ المشاكل مرّةً واحدة', () => {
  const v = assetVerdict({ population: 'x', id: 'BRZ-1', assetName: '  ', qty: -2, condition: 'ممتازة' });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 5);
  assert.ok(v.problems.some((p) => p.includes('المجموعة')));
  assert.ok(v.problems.some((p) => p.includes('سالبة')));
});

test('وسجلٌّ سليمٌ يمرّ، والكمّيّةُ صفرٌ مقبولةٌ (لا سالبة)', () => {
  assert.deepEqual(assetVerdict(asset()), { ok: true, problems: [] });
  assert.equal(assetVerdict(asset({ qty: 0 })).ok, true);
  assert.equal(assetVerdict(asset({ condition: '' })).ok, true, 'حالةٌ فارغةٌ تُترك للتعديل');
  assert.equal(assetVerdict(asset({ qty: 'كثير' })).ok, false);
});

test('كلُّ أصلٍ في بذرة المالك يمرّ الحكم', () => {
  const bad = seed.assets.filter((a) => !assetVerdict(a).ok);
  assert.deepEqual(bad, [], 'البذرة لا تُستورد إن لم تمرّ الحكمَ نفسَه');
});

// ── الجرد ────────────────────────────────────────────────────────────────

test('الكمّيّة تُقرأ كما كُتبت — وصفرٌ يبقى صفرًا ولا يقع على واحد', () => {
  assert.equal(rawQty(0), 0);
  assert.equal(rawQty('12'), 12);
  assert.equal(rawQty(''), 0);
  assert.equal(rawQty('كثير'), 0);
});

test('فرقُ الجرد: null قبل العدّ، ورقمٌ بعده', () => {
  assert.equal(countVariance(asset()), null);
  assert.equal(countVariance(asset({ countedQty: '' })), null);
  assert.equal(countVariance(asset({ countedQty: 118 })), -2);
  assert.equal(countVariance(asset({ countedQty: 125 })), 5);
  assert.equal(countVariance(asset({ countedQty: 120 })), 0);
  assert.ok(!isCounted(asset()) && isCounted(asset({ countedQty: 0 })));
});

test('★ وعدٌّ بصفرٍ جردٌ لا غياب — فالأصلُ المفقود يُقيَّد ولا يُترك «لم يُجرَد»', () => {
  assert.equal(countVariance(asset({ qty: 3, countedQty: 0 })), -3);
  assert.equal(isCounted(asset({ countedQty: 0 })), true);
});

test('تقدّمُ الجرد يُحصي المعدودَ والمتبقّي والفروق، والمكهَّنُ خارجَه', () => {
  const rows = [
    asset({ id: 'BRZ-0001', countedQty: 120 }),
    asset({ id: 'BRZ-0002', qty: 5, countedQty: 3 }),
    asset({ id: 'BRZ-0003', qty: 2 }),
    asset({ id: 'BRZ-0004', qty: 9, countedQty: 9, archived: true }),
  ];
  assert.deepEqual(countProgress(rows), {
    total: 3,
    counted: 2,
    pending: 1,
    variances: 1,
    netVariance: -2,
  });
});

// ── اللقطة ───────────────────────────────────────────────────────────────

test('اللقطة تُخرج المكهَّنَ من كلّ رقم، وتَعدُّه وحدَه', () => {
  const rows = [asset({ qty: 10 }), asset({ id: 'BRZ-0002', qty: 7, archived: true })];
  const snap = veneciaSnapshot(rows);
  assert.equal(snap.assets, 1);
  assert.equal(snap.units, 10);
  assert.equal(snap.archived, 1);
});

test('★ لقطةُ بذرةِ المالك: ١٠٤ أصلًا · ٢٧٣٩ وحدة · ٧٤+٣٠', () => {
  const snap = veneciaSnapshot(seed.assets);
  assert.equal(snap.assets, 104);
  assert.equal(snap.units, 2739);
  assert.deepEqual(snap.perPopulation, [
    { id: 'issue', label: 'بضاعة الصرف', assets: 74, units: 1640 },
    { id: 'supported', label: 'أصول المدعوم', assets: 30, units: 1099 },
  ]);
  // كلُّ حالةٍ في البذرة من مفردات البوّابة — فمجموعُ التوزيع هو العدد كلُّه.
  assert.equal(snap.byCondition.reduce((s, [, n]) => s + n, 0), 104);
  assert.equal(snap.count.pending, 104, 'البذرةُ لم تُجرَد بعد — الجردُ يبدأ من الشاشة');
});

test('وحالاتُ البذرة أربعٌ، و«ممتاز» صفرٌ كما في ملخّص المالك', () => {
  const byCondition = Object.fromEntries(veneciaSnapshot(seed.assets).byCondition);
  assert.equal(byCondition['ممتاز'], 0);
  assert.equal(byCondition['جيد'] + byCondition['متوسط'] + byCondition['معطل'], 74 + 30 - byCondition['يحتاج صيانة']);
  assert.ok(byCondition['يحتاج صيانة'] > 0, 'المدعوم فيه أصولٌ تحتاج صيانة');
});

// ── التدخّل ──────────────────────────────────────────────────────────────

test('الأيّام بين يومين، والناقصُ يُعيد null ولا يخترع رقمًا', () => {
  assert.equal(daysBetween('2026-06-04', '2026-10-19'), 137);
  assert.equal(daysBetween('2026-10-19', '2026-10-19'), 0);
  assert.equal(daysBetween('', '2026-10-19'), null);
  assert.equal(daysBetween('ليس تاريخًا', '2026-10-19'), null);
});

test('★★★ والرقمُ بإشارته معزولٌ — وإلّا قُرئ «-2» في العربيّة «2-»', () => {
  assert.equal(signedText(-2), '‎-2‎');
  assert.equal(signedText(5), '‎+5‎');
  assert.equal(signedText(0), '‎0‎');
  // والعزلُ **داخل** نصّ السبب لا خارجه — فالسببُ يُعرض وحدَه في رقاقة.
  const [row] = attentionRows([asset({ qty: 5, countedQty: 3 })], { asOf: '2026-10-19' });
  assert.ok(row.reasons[0].includes('‎-2‎'), row.reasons[0]);
});

test('★★★ كلُّ سببِ تدخّلٍ يُقال نصًّا بجوار الأصل', () => {
  const rows = [
    asset({ id: 'BRZ-0001', condition: 'معطل', countedQty: 120 }),
    asset({ id: 'BRZ-0002', qty: 0, countedQty: 0 }),
    asset({ id: 'BRZ-0003', qty: 5, countedQty: 3 }),
    asset({ id: 'BRZ-0004', qty: 1, countedQty: 1, countedAt: '2026-01-01' }),
    asset({ id: 'BRZ-0005', qty: 1, countedQty: 1, countedAt: '2026-10-01' }),
    asset({ id: 'BRZ-0006', qty: 1 }),
  ];
  const got = attentionRows(rows, { asOf: '2026-10-19', staleDays: 90 });
  const by = Object.fromEntries(got.map((r) => [r.id, r.reasons]));
  assert.deepEqual(by['BRZ-0001'], ['الحالة «معطل»']);
  assert.deepEqual(by['BRZ-0002'], ['كمّيّةٌ صفر']);
  assert.deepEqual(by['BRZ-0003'], ['فرقُ جردٍ ' + signedText(-2)]);
  assert.deepEqual(by['BRZ-0004'], ['آخرُ جردٍ قبل 291 يومًا']);
  assert.deepEqual(by['BRZ-0006'], ['لم يُجرَد قطّ']);
  assert.ok(!('BRZ-0005' in by), 'أصلٌ سليمٌ مجرودٌ حديثًا لا يُقحَم في التدخّل');
});

test('★★★ ودرجتان: العطبُ القائم «now»، و«لم يُجرَد قطّ» وحدَه «backlog»', () => {
  const rows = [
    asset({ id: 'BRZ-0001', qty: 1 }), // لم يُجرَد فقط
    asset({ id: 'BRZ-0002', qty: 1, condition: 'معطل' }), // عطبٌ + لم يُجرَد
    asset({ id: 'BRZ-0003', qty: 5, countedQty: 3 }), // فرقٌ
  ];
  const got = attentionRows(rows, { asOf: '2026-10-19' });
  const tier = Object.fromEntries(got.map((r) => [r.id, r.tier]));
  assert.equal(tier['BRZ-0001'], 'backlog');
  assert.equal(tier['BRZ-0002'], 'now');
  assert.equal(tier['BRZ-0003'], 'now');
  assert.deepEqual(got.map((r) => r.tier), ['now', 'now', 'backlog'], 'العاجلُ قبل المتراكم');
});

test('★ وجردٌ مستوردٌ حديثًا لا يقول «١٠٤ أصلًا تحتاج تدخّلًا» — فطبقةٌ تضمّ كلَّ شيءٍ لا تدلّ على شيء', () => {
  const got = attentionRows(seed.assets, { asOf: '2026-10-19' });
  assert.equal(got.length, 104, 'كلُّها مذكورةٌ — لكنْ بدرجتين');
  const now = got.filter((r) => r.tier === 'now');
  assert.ok(now.length > 0 && now.length < 30, `العاجلُ ${now.length} — حالاتٌ معطلةٌ وتحتاج صيانة لا الجردُ كلُّه`);
  assert.ok(
    now.every((r) => r.reasons.some((x) => x.startsWith('الحالة'))),
    'ولا سببَ عاجلًا في البذرة غيرُ الحالة — فلا كمّيّةَ صفرٍ ولا فرقَ جردٍ فيها'
  );
});

test('والأثقلُ أوّلًا: الحالةُ المعطلة تتقدّم على فرق الجرد', () => {
  const rows = [
    asset({ id: 'BRZ-0002', qty: 5, countedQty: 3 }),
    asset({ id: 'BRZ-0001', condition: 'يحتاج صيانة', countedQty: 120 }),
  ];
  assert.deepEqual(
    attentionRows(rows, { asOf: '2026-10-19' }).map((r) => r.id),
    ['BRZ-0001', 'BRZ-0002']
  );
});

test('والمكهَّنُ لا يُستدعى للتدخّل — خرج من الجرد', () => {
  const rows = [asset({ condition: 'معطل', archived: true, countedQty: 120 })];
  assert.deepEqual(attentionRows(rows, { asOf: '2026-10-19' }), []);
});

test('★ وبلا `asOf` لا يُحكم على قِدَم الجرد — ولا يُختلق تاريخٌ من ساعة الجهاز', () => {
  const rows = [asset({ qty: 1, countedQty: 1, countedAt: '2020-01-01' })];
  assert.deepEqual(attentionRows(rows), [], 'لا سببَ يُعلن بلا يومٍ مرجعيّ');
});

// ── التصفية والترقيم ─────────────────────────────────────────────────────

test('التصفية تتراكم، والفارغُ منها لا يُصفّي', () => {
  const rows = [
    asset({ id: 'BRZ-0001', serial: 'اثاث', condition: 'جيد' }),
    asset({ id: 'BRZ-0002', serial: 'سباكه', condition: 'معطل' }),
    asset({ id: 'BRZ-0003', population: 'supported', assetName: 'ثلاجة', condition: 'متوسط' }),
  ];
  assert.equal(filterVenecia(rows, {}).length, 3);
  assert.equal(filterVenecia(rows, { category: 'سباكه' }).length, 1);
  assert.equal(filterVenecia(rows, { population: 'supported' }).length, 1);
  assert.equal(filterVenecia(rows, { condition: 'معطل', category: 'اثاث' }).length, 0);
  assert.equal(filterVenecia(rows, { q: 'ثلاجة' }).length, 1);
  assert.equal(filterVenecia(rows, { q: 'BRZ-0002' }).length, 1);
});

test('★ والبحثُ يشمل التصنيفَ المشتقَّ واسمَ المجموعة — وهما ليسا حقلين مخزَّنين', () => {
  const rows = [asset({ serial: 'مواشي' }), asset({ id: 'BRZ-0002', population: 'supported' })];
  assert.equal(filterVenecia(rows, { q: 'مواشي' }).length, 1);
  assert.equal(filterVenecia(rows, { q: 'المدعوم' }).length, 1);
});

test('★★★ والمكهَّنُ مستثنًى افتراضًا ويُطلب صريحًا', () => {
  const rows = [asset(), asset({ id: 'BRZ-0002', archived: true })];
  assert.equal(filterVenecia(rows, {}).length, 1);
  assert.equal(filterVenecia(rows, { includeArchived: true }).length, 2);
  assert.equal(filterVenecia(rows, { q: 'خشب' }).length, 1, 'ولا يعود بالبحث من الباب الخلفيّ');
});

test('★ و«ما لم يُجرَد» مُرشِّحٌ قائمٌ بذاته — فالجردُ يُستكمل من الفهرس لا من الذاكرة', () => {
  const rows = [
    asset({ id: 'BRZ-0001', countedQty: 120 }),
    asset({ id: 'BRZ-0002' }),
    asset({ id: 'BRZ-0003', countedQty: 0 }),
    asset({ id: 'BRZ-0004', archived: true }),
  ];
  assert.deepEqual(
    filterVenecia(rows, { uncountedOnly: true }).map((a) => a.id),
    ['BRZ-0002'],
    'والعدُّ بصفرٍ جردٌ فلا يُعدّ ناقصًا، والمكهَّنُ خارجٌ كعادته'
  );
  assert.equal(filterVenecia(rows, {}).length, 3);
});

test('الرقم التالي يُحسب داخل المجموعة — فتسلسلٌ لا يدفع تسلسلًا', () => {
  assert.equal(nextAssetNoIn(seed.assets, 'issue'), 'BRZ-0075');
  assert.equal(nextAssetNoIn(seed.assets, 'supported'), 'BRZ-0031');
  assert.equal(nextAssetNoIn([], 'issue'), 'BRZ-0001');
});

test('والمكهَّنُ يحجز رقمَه إلى الأبد — فهو مطبوعٌ على شيءٍ كان في المخزن', () => {
  const rows = [asset({ id: 'BRZ-0009', archived: true })];
  assert.equal(nextAssetNoIn(rows, 'issue'), 'BRZ-0010');
});

// ── التصدير ──────────────────────────────────────────────────────────────

test('صفوفُ التصدير تحمل عناوينَ ملفّات المالك أوّلًا ثمّ ما أضافته البوّابة', () => {
  const [row] = veneciaExportRows([asset()]);
  assert.deepEqual(Object.keys(row), VENECIA_EXPORT_COLUMNS);
  assert.equal(row['رقم الأصل'], 'BRZ-0001');
  assert.equal(row['الكمية'], 120);
  assert.equal(row['المجموعة'], 'بضاعة الصرف');
  assert.equal(row['التصنيف'], 'اثاث');
});

test('★ وفرقُ الجرد محسوبٌ في الملفّ لا بيدٍ في الإكسل', () => {
  const [a, b] = veneciaExportRows([
    asset({ qty: 5, countedQty: 3, countedAt: '2026-10-19', countedBy: 'أحمد' }),
    asset({ id: 'BRZ-0002' }),
  ]);
  assert.equal(a['الكمية المعدودة'], 3);
  assert.equal(a['فرق الجرد'], -2);
  assert.equal(a['تاريخ الجرد'], '2026-10-19');
  assert.equal(a['من جرد'], 'أحمد');
  assert.equal(b['الكمية المعدودة'], '', 'ما لم يُجرَد يُترك فارغًا لا صفرًا');
  assert.equal(b['فرق الجرد'], '');
});

test('والمكهَّنُ يُقال في التصدير بسببه — فملفٌّ يُرسل لا يُخفي ما أُخرج', () => {
  const [row] = veneciaExportRows([asset({ archived: true, archiveReason: 'صُرف لمشروع الرحبة' })]);
  assert.equal(row['مكهَّن'], 'نعم');
  assert.equal(row['سبب التكهين'], 'صُرف لمشروع الرحبة');
});

test('وتصديرُ بذرةِ المالك يُخرج ١٠٤ صفًّا بعشرين عمودًا', () => {
  const rows = veneciaExportRows(seed.assets);
  assert.equal(rows.length, 104);
  assert.equal(VENECIA_EXPORT_COLUMNS.length, 20);
  assert.equal(rows.reduce((s, r) => s + r['الكمية'], 0), 2739);
});

// ── البذرة نفسُها ────────────────────────────────────────────────────────

test('★ بذرةُ المالك سليمةٌ بنيويًّا — حارسٌ على إعادة توليدها', () => {
  assert.equal(seed.warehouse, VENECIA_WAREHOUSE);
  assert.equal(seed.assets.length, 104);
  assert.ok(seed.sources.length >= 2, 'البذرة تسمّي ملفّاتها');
  for (const a of seed.assets) {
    assert.ok(isAssetNo(a.id), `رقمٌ مشوّه: ${a.id}`);
    assert.ok(isPopulation(a.population), `مجموعةٌ مجهولة: ${a.population}`);
    assert.equal(a.warehouse, VENECIA_WAREHOUSE);
    assert.equal(a.assetType, populationAssetType(a.population));
    assert.equal(a.receivedDate, '', 'تاريخُ الملفّ كان تاريخَ التصدير — فلا يُستورد');
  }
});
