/**
 * اختبار تشكيل حقول الاستيراد — وعلى رأسه **حارس الانحراف**:
 * كل عمود في مخطّط شيت الأصناف يجب أن يكتبه التشكيل. هذا الاختبار وُلد من
 * خلل حقيقي (2026-07-15): ترقّى المخطّط وبقي الكاتب قديمًا، فضاعت الأسعار
 * والتصنيفات والمورّد **صامتةً** — استيراد «ناجح» يرمي نصف أعمدته.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { shapeImportedItem, normalizeUnit, SHAPED_FIELDS } from './itemShape.js';
import { DATASETS } from '../excel/excelSchema.js';

// ── حارس الانحراف: المخطّط ↔ الكاتب ────────────────────────────────
test('🚨 كل عمود في مخطّط الشيت يكتبه التشكيل — لا عمود يضيع صامتًا', () => {
  // ما يُعالَج خارج التشكيل عمدًا: الهوية والباركودات والحالة.
  const handledElsewhere = new Set(['sku', 'barcode', 'barcodeAlt', 'status', 'nameAr']);
  const sample = { string: 'قيمة', number: '12.5' };

  for (const col of DATASETS.items.columns) {
    if (handledElsewhere.has(col.field)) continue;
    const out = shapeImportedItem({ [col.field]: sample[col.type] });
    assert.ok(
      col.field in out,
      `عمود «${col.field}» (${col.labelAr}) يُقرأ من الشيت ثم يُرمى — أضِفه إلى itemShape.js`
    );
  }
});

test('ولا حقل في التشكيل غريب عن المخطّط (الاتجاه المعاكس)', () => {
  const schemaFields = new Set(DATASETS.items.columns.map((c) => c.field));
  // المرايا القديمة مسموحة — تعيش في المستند لا في الشيت.
  const legacyMirrors = new Set(['category', 'subcategory', 'unit', 'unitPrice']);
  for (const f of SHAPED_FIELDS) {
    assert.ok(schemaFields.has(f) || legacyMirrors.has(f), `حقل «${f}» لا يقابله عمود ولا مرآة`);
  }
});

// ── المرايا: الشاشات القائمة لا تنكسر ──────────────────────────────
test('العائلة تنعكس فئةً — فشاشة الأصناف القائمة تعرض التصنيف الجديد', () => {
  const out = shapeImportedItem({ family: 'ماكياج', subFamily: 'أساس' });
  assert.equal(out.family, 'ماكياج');
  assert.equal(out.category, 'ماكياج');
  assert.equal(out.subFamily, 'أساس');
  assert.equal(out.subcategory, 'أساس');
});

test('سعر الشراء ينعكس unitPrice — والقيمة الصريحة لا تُداس', () => {
  assert.equal(shapeImportedItem({ costPrice: '12.5' }).unitPrice, 12.5);
  const explicit = shapeImportedItem({ costPrice: '12.5', unitPrice: '9' });
  assert.equal(explicit.unitPrice, 9, 'الشيت قال 9 صراحةً — المرآة لا تدهسها');
});

test('اسم مجموعة الوحدة ينعكس وحدةً قياسية', () => {
  const out = shapeImportedItem({ uomGroupName: 'قطعة' });
  assert.equal(out.uomGroupName, 'قطعة');
  assert.equal(out.unit, 'piece');
});

test('الحقل الغائب أو الفارغ لا يُكتب — فلا يمحو عمودٌ ناقص بياناتٍ قائمة', () => {
  const out = shapeImportedItem({ costPrice: '', supplier: undefined, shade: 'شفاف' });
  assert.deepEqual(Object.keys(out), ['shade']);
});

// ── الوحدات ────────────────────────────────────────────────────────
test('الوحدات العربية تتقيّس', () => {
  assert.equal(normalizeUnit('قطعة'), 'piece');
  assert.equal(normalizeUnit('كرتون'), 'box');
  assert.equal(normalizeUnit('علبة'), 'pack');
  assert.equal(normalizeUnit(' KG '), 'kg');
  assert.equal(normalizeUnit(''), 'piece');
  assert.equal(normalizeUnit('وحدة غريبة'), 'وحدة غريبة', 'ما لا يُعرف يبقى لا يُطمس');
});
