/**
 * حرّاس جرد الأصول.
 *
 * أهمّها قراءة الإكسل: خريطةُ عمودٍ خاطئة **لا تُسقط شيئًا ولا تشتكي** —
 * تُدخل الماركة في خانة السيريال وتمضي، فيُقرأ الجرد كلّه خطأً وهو يبدو
 * سليمًا. وهذه بالضبط الأعطاب التي لا تُمسك بالعين.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_CONDITIONS,
  conditionBadgeClass,
  isMainSheet,
  resolveColumns,
  assetQuantity,
  normalizeReceivedDate,
  parseAssetRows,
  assetStats,
  filterAssets,
  nextAssetId,
  MAIN_HEADERS,
  DEPT_HEADERS,
} from './assetsModel.js';

// عناوين الورقة الرئيسة كما تصل من الملفّ الحقيقيّ.
const MAIN_HEADER_ROW = [
  'رقم الأصل', 'نوع الأصل', 'اسم الأصل', 'الماركة', 'الموديل/السيريال',
  'الكمية', 'الحالة', 'المسؤول', 'الإدارة', 'القسم', 'الموقع',
  'تاريخ الاستلام', 'ملاحظات',
];

// وورقةُ إدارةٍ — بلا عمود «الإدارة»، فينزاح كلّ ما بعده عمودًا.
const DEPT_HEADER_ROW = [
  'رقم الأصل', 'نوع الأصل', 'اسم الأصل', 'الماركة', 'السيريال',
  'الكمية', 'الحالة', 'المسؤول', 'القسم', 'الموقع', 'تاريخ الاستلام', 'ملاحظات',
];

// ═══ تمييز الورقتين ═══════════════════════════════════════════════════════

test('عمود «الإدارة» وحده يفصل الورقة الرئيسة عن ورقة إدارة', () => {
  assert.equal(isMainSheet(MAIN_HEADER_ROW), true);
  assert.equal(isMainSheet(DEPT_HEADER_ROW), false);
  assert.equal(isMainSheet([]), false);
  assert.equal(isMainSheet(['  الإدارة  ']), true, 'المسافات لا تخدع التمييز');
});

test('★ الخريطتان تختلفان بعد الحقل السابع — وهذا مصدر الإزاحة الصامتة', () => {
  assert.equal(MAIN_HEADERS['القسم'], 9);
  assert.equal(DEPT_HEADERS['القسم'], 8, 'ورقة الإدارة تزيح القسم عمودًا للخلف');
  assert.equal(MAIN_HEADERS['ملاحظات'] - DEPT_HEADERS['ملاحظات'], 1);
  assert.equal(DEPT_HEADERS['الإدارة'], undefined, 'ورقة الإدارة بلا عمود إدارة');
});

test('المرادفات الثلاثة للسيريال تقع على الحقل نفسه', () => {
  for (const alias of ['الموديل/السيريال', 'السيريال', 'الموديل']) {
    assert.equal(MAIN_HEADERS[alias], 4, `${alias} ليست الحقل الرابع`);
  }
});

test('ربط الأعمدة يتبع الاسم لا الترتيب — فعمودٌ مُقحَم لا يُزيح القراءة', () => {
  const shuffled = ['ملاحظات', 'اسم الأصل', 'الإدارة', 'الحالة'];
  const { cols, isMain } = resolveColumns(shuffled);
  assert.equal(isMain, true);
  assert.equal(cols[12], 0, 'ملاحظات في الموضع صفر');
  assert.equal(cols[2], 1, 'اسم الأصل في الموضع واحد');
  assert.equal(cols[6], 3, 'الحالة في الموضع ثلاثة');
});

// ═══ القيم المفردة ════════════════════════════════════════════════════════

test('الكمّيّة موجبةٌ أو تقع على الافتراضيّ — لا على صفرٍ يُخفي أصلًا', () => {
  assert.equal(assetQuantity('7'), 7);
  assert.equal(assetQuantity(''), 1);
  assert.equal(assetQuantity('صفر'), 1);
  assert.equal(assetQuantity(0), 1);
  assert.equal(assetQuantity(-3), 1);
  assert.equal(assetQuantity(null, 5), 5);
});

test('التاريخ يُطبَّع، وما ليس تاريخًا يبقى كما كتبه صاحبه', () => {
  assert.equal(normalizeReceivedDate('2026-01-15'), '2026-01-15');
  assert.equal(normalizeReceivedDate(new Date(Date.UTC(2026, 0, 15))), '2026-01-15');
  assert.equal(normalizeReceivedDate('January 15, 2026'), '2026-01-15');
  assert.equal(normalizeReceivedDate('غير معروف'), 'غير معروف', 'لا يُمحى ولا يُخترع');
  assert.equal(normalizeReceivedDate(''), '');
});

test('شارة الحالة معروفة، والمجهول يقع على «جيد»', () => {
  assert.equal(conditionBadgeClass('معطل'), 'badge-broken');
  assert.equal(conditionBadgeClass('حالةٌ مستجدّة'), 'badge-good');
});

// ═══ قراءة الصفوف ═════════════════════════════════════════════════════════

test('★ الورقة الرئيسة تُقرأ حقلًا حقلًا في مواضعه', () => {
  const rows = [
    MAIN_HEADER_ROW,
    ['BRZ-0007', 'حاسوب', 'لابتوب ديل', 'Dell', 'SN-991', '2', 'ممتاز', 'أحمد', 'المستودعات', 'الجرد', 'بنغازي', '2026-01-15', 'بضمان'],
  ];
  assert.deepEqual(parseAssetRows(rows), [
    {
      id: 'BRZ-0007',
      assetType: 'حاسوب',
      assetName: 'لابتوب ديل',
      brand: 'Dell',
      serial: 'SN-991',
      qty: 2,
      condition: 'ممتاز',
      responsible: 'أحمد',
      department: 'المستودعات',
      section: 'الجرد',
      location: 'بنغازي',
      receivedDate: '2026-01-15',
      notes: 'بضمان',
    },
  ]);
});

test('★★ ورقة الإدارة تُقرأ بإزاحتها — وهو العطب الذي لا يُعلن عن نفسه', () => {
  const rows = [
    DEPT_HEADER_ROW,
    ['BRZ-0008', 'طابعة', 'طابعة HP', 'HP', 'SN-112', '1', 'جيد', 'سالم', 'المشتريات', 'طرابلس', '2026-02-01', 'مستعملة'],
  ];
  const [rec] = parseAssetRows(rows, { deptOverride: 'المالية' });
  assert.equal(rec.department, 'المالية', 'الإدارة من اسم الورقة لا من عمود');
  assert.equal(rec.section, 'المشتريات', 'القسم عند الموضع الثامن هنا');
  assert.equal(rec.location, 'طرابلس');
  assert.equal(rec.receivedDate, '2026-02-01');
  assert.equal(rec.notes, 'مستعملة', 'الملاحظات لم تنزلق عمودًا');
  assert.equal(rec.serial, 'SN-112');
});

test('صفٌّ بلا اسم أصلٍ يُهمَل، والصفّ الفارغ كذلك', () => {
  const rows = [
    MAIN_HEADER_ROW,
    ['BRZ-1', 'حاسوب', '', 'Dell', '', '1', 'جيد', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['BRZ-2', 'كرسي', 'كرسي مكتب', '', '', '3', 'جيد', '', 'الإدارة العامّة', '', '', '', ''],
  ];
  const recs = parseAssetRows(rows);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].assetName, 'كرسي مكتب');
});

test('حالةٌ غير معتمدة تقع على «جيد» بدل أن تُكتب كما وردت', () => {
  const rows = [MAIN_HEADER_ROW, ['', '', 'مكيّف', '', '', '', 'خردة', '', '', '', '', '', '']];
  assert.equal(parseAssetRows(rows)[0].condition, 'جيد');
  for (const c of ASSET_CONDITIONS) {
    const r = [MAIN_HEADER_ROW, ['', '', 'صنف', '', '', '', c, '', '', '', '', '', '']];
    assert.equal(parseAssetRows(r)[0].condition, c);
  }
});

test('ورقةٌ بلا صفوف أو بعنوانٍ وحده تُعيد فراغًا لا خطأً', () => {
  assert.deepEqual(parseAssetRows([]), []);
  assert.deepEqual(parseAssetRows([MAIN_HEADER_ROW]), []);
  assert.deepEqual(parseAssetRows(null), []);
});

// ═══ الإحصاء والتصفية ═════════════════════════════════════════════════════

const SAMPLE = [
  { id: 'BRZ-0001', assetName: 'لابتوب', brand: 'Dell', condition: 'ممتاز', qty: 2, department: 'المستودعات', responsible: 'أحمد' },
  { id: 'BRZ-0004', assetName: 'طابعة', brand: 'HP', condition: 'معطل', qty: 1, department: 'المالية', responsible: 'سالم' },
  { id: 'BRZ-0002', assetName: 'كرسي', brand: '', condition: 'جيد', qty: 5, department: 'المستودعات', responsible: 'أحمد' },
];

test('الإحصاء يجمع الكمّيّات ويصنّف الحالات ويرتّب الإدارات بالأكثر', () => {
  const s = assetStats(SAMPLE);
  assert.equal(s.total, 3);
  assert.equal(s.quantity, 8);
  assert.equal(s.good, 2);
  assert.equal(s.bad, 1);
  assert.deepEqual(s.departments, [
    ['المستودعات', 2],
    ['المالية', 1],
  ]);
});

test('الإحصاء يحتمل الفراغ وكمّيّةً مفقودة', () => {
  assert.equal(assetStats([]).total, 0);
  assert.equal(assetStats([{ assetName: 'صنف' }]).quantity, 1, 'الكمّيّة المفقودة واحد لا صفر');
  assert.deepEqual(assetStats(undefined).departments, []);
});

test('البحث الحرّ يشمل اسم الموظّف المسؤول', () => {
  assert.equal(filterAssets(SAMPLE, { q: 'سالم' }).length, 1);
  assert.equal(filterAssets(SAMPLE, { q: 'أحمد' }).length, 2);
  assert.equal(filterAssets(SAMPLE, { q: 'HP' }).length, 1, 'والبحث لا يحفل بحالة الأحرف');
});

test('المرشّحات تتراكم، والفارغ منها لا يُصفّي', () => {
  assert.equal(filterAssets(SAMPLE, {}).length, 3);
  assert.equal(filterAssets(SAMPLE, { department: 'المستودعات' }).length, 2);
  assert.equal(filterAssets(SAMPLE, { department: 'المستودعات', condition: 'جيد' }).length, 1);
  assert.equal(filterAssets(SAMPLE, { q: 'لابتوب', department: 'المالية' }).length, 0);
});

// ═══ الترقيم ══════════════════════════════════════════════════════════════

test('★ الرقم التالي يُقرأ من السجلّات — فاستيرادٌ بأرقامٍ أعلى لا يُنتج تصادمًا', () => {
  // العدّاد عند ١ والسجلّات فيها BRZ-0004: لو اتُّبع العدّاد لَتكرّر رقمٌ قائم.
  const { id, next } = nextAssetId(SAMPLE, 1);
  assert.equal(id, 'BRZ-0005');
  assert.equal(next, 6);
});

test('العدّاد يتقدّم على السجلّات إن كان أعلى', () => {
  assert.equal(nextAssetId(SAMPLE, 20).id, 'BRZ-0020');
});

test('جردٌ فارغ يبدأ من الواحد، ومعرّفٌ مشوّه لا يُربك التسلسل', () => {
  assert.equal(nextAssetId([], 1).id, 'BRZ-0001');
  assert.equal(nextAssetId([{ id: 'غير-منتظم' }, { id: null }], 1).id, 'BRZ-0001');
});
