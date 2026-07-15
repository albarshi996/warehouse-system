/**
 * اختبارات مخطّط الأصناف — المنطق الخالص الذي يقف بين شيت المستودع والماستر.
 * `node --test` بلا شبكة ولا متصفّح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DATASETS,
  normalizeBarcode,
  splitMulti,
  detectHeaderRow,
  buildHeaderIndex,
  resolveHeaderCell,
  toNumber,
} from './excelSchema.js';

// ── تطبيع الباركود (أخطر نقطة: الماسح يجب أن يطابق الشيت) ─────────
test('الباركود يُطبَّع فيطابق الماسحُ الشيتَ مهما اختلفت كتابته', () => {
  assert.equal(normalizeBarcode('8059692040599'), '8059692040599');
  assert.equal(normalizeBarcode(' 8059692040599 '), '8059692040599');
  assert.equal(normalizeBarcode('8059-692-040599'), '8059692040599');
  assert.equal(normalizeBarcode('8059 692 040599'), '8059692040599');
  assert.equal(normalizeBarcode('8059_692_040599'), '8059692040599');
});

test('الأرقام العربية تُقرأ كالغربية', () => {
  assert.equal(normalizeBarcode('٨٠٥٩٦٩٢٠٤٠٥٩٩'), '8059692040599');
});

test('🚨 الصيغة الأسّية التي يفرضها إكسيل على الباركودات الطويلة تُفكّ', () => {
  // إكسيل يخزّن 8059692040599 رقمًا فيعرضه 8.05969E+12 — بلا هذا الفكّ
  // يُستورد الباركود مشوّهًا فلا يطابقه الماسح أبدًا.
  assert.equal(normalizeBarcode('8.059692040599e+12'), '8059692040599');
  assert.equal(normalizeBarcode('8.05969E+12'), '8059690000000');
});

test('الفارغ يبقى فارغًا لا "undefined"', () => {
  assert.equal(normalizeBarcode(''), '');
  assert.equal(normalizeBarcode(null), '');
  assert.equal(normalizeBarcode(undefined), '');
});

test('عدّة باركودات في خانة واحدة تُفصل بأي فاصل شائع', () => {
  assert.deepEqual(splitMulti('8059692040599, 8059692040600'), ['8059692040599', '8059692040600']);
  assert.deepEqual(splitMulti('8059692040599/8059692040600'), ['8059692040599', '8059692040600']);
  assert.deepEqual(splitMulti('8059692040599 | 8059692040600'), ['8059692040599', '8059692040600']);
  assert.deepEqual(splitMulti('123،456'), ['123', '456'], 'الفاصلة العربية');
  assert.deepEqual(splitMulti(''), []);
});

// ── اكتشاف صفّ العناوين ────────────────────────────────────────────
test('يجد صفّ العناوين ولو لم يكن الأول (شيتات المستودع فوقها عناوين وشعارات)', () => {
  const matrix = [
    ['شركة برند زو — جرد المستودع', '', '', ''],
    ['', '', '', ''],
    ['الباركود', 'كود الصنف', 'اسم الصنف', 'الكمية الدفترية'],
    ['8059692040599', 'WNW-001', 'أساس سائل', '10'],
  ];
  const { index, hits } = detectHeaderRow(matrix, 'items');
  assert.equal(index, 2, 'صفّ العناوين هو الثالث');
  assert.ok(hits >= 4);
});

test('يعمل حين تكون العناوين في الصف الأول فعلًا', () => {
  const matrix = [
    ['كود الصنف', 'اسم الصنف'],
    ['WNW-001', 'أساس'],
  ];
  assert.equal(detectHeaderRow(matrix, 'items').index, 0);
});

test('يقبل العناوين الإنجليزية والعربية معًا', () => {
  const matrix = [['SKU', 'Barcode', 'Product Name', 'Qty']];
  assert.ok(detectHeaderRow(matrix, 'items').hits >= 4);
});

// ── حلّ العناوين ───────────────────────────────────────────────────
test('كل أعمدة قالبك الحقيقي معروفة للمخطّط', () => {
  // العناوين الحرفية من قالب التحميل في شاشة الجرد.
  const template = [
    'الباركود', 'كود الصنف', 'اسم الصنف', 'الظل/اللون', 'التصنيف',
    'التصنيف الفرعي', 'الكمية الدفترية', 'الوحدة', 'سعر الوحدة', 'ملاحظات',
  ];
  const index = buildHeaderIndex('items');
  const resolved = template.map((h) => resolveHeaderCell(h, index)?.field);
  assert.deepEqual(resolved, [
    'barcode', 'sku', 'nameAr', 'shade', 'category',
    'subcategory', 'balance', 'unit', 'unitPrice', 'notes',
  ]);
});

test('العنوان المزيّن يُحلّ بالاحتواء', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('الباركود (EAN)', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('  كود الصنف  ', index)?.field, 'sku');
});

test('🚨 «كود» مُحتواة داخل «الباركود» — ولا يجوز أن تخطف عمودها', () => {
  // خلل حقيقي (2026-07-15): مطابقة «أول احتواء» كانت تُسند عمود الباركود إلى
  // حقل sku، فتُستورد الباركودات أكوادًا وتبقى الأصناف بلا باركود — صامتًا.
  // الحلّ: أطول مرادف يفوز. هذا الاختبار يمنع عودته.
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('الباركود', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('الباركود (EAN)', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('الباركود / Barcode', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('باركود الصنف', index)?.field, 'barcode');
});

test('صفّ العناوين يُرجَّح بعدد الأعمدة المتمايزة لا بالخانات', () => {
  const matrix = [
    ['الكمية', 'الكمية', 'الكمية', 'الكمية', 'الكمية'], // 5 خانات، عمود واحد
    ['كود الصنف', 'اسم الصنف', 'الباركود'], // 3 أعمدة حقيقية
  ];
  assert.equal(detectHeaderRow(matrix, 'items').index, 1);
});

test('العنوان المجهول لا يُحلّ إلى عمود خاطئ', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('عمود لا معنى له', index), null);
  assert.equal(resolveHeaderCell('', index), null);
});

// ── مخطّط الأصناف ──────────────────────────────────────────────────
test('عمود الباركود موجود ومتعدّد (كان غائبًا تمامًا قبل 2026-07-15)', () => {
  const barcode = DATASETS.items.columns.find((c) => c.field === 'barcode');
  assert.ok(barcode, 'عمود الباركود موجود');
  assert.equal(barcode.multi, true, 'يقبل عدّة باركودات');
});

test('كود الصنف واسمه إلزاميان — وهما وحدهما', () => {
  const required = DATASETS.items.columns.filter((c) => c.required).map((c) => c.field);
  assert.deepEqual(required.sort(), ['nameAr', 'sku']);
});

test('الأرقام تتحمّل الفواصل والأرقام العربية', () => {
  assert.equal(toNumber('1,250'), 1250);
  assert.equal(toNumber('١٠'), 10);
  assert.equal(toNumber(''), 0);
  assert.ok(Number.isNaN(toNumber('غير رقم')));
});
