/**
 * تصديرُ ماستر الأصناف ‹EXP-1› — الرحلةُ ذهابًا وإيابًا بلا فقد.
 *
 * ═══ الدرسُ الذي كشفه الطلب ═══
 * `exportItemsMaster` كانت **مبنيّةً منذ زمنٍ وبلا مستدعٍ** — الشاشةُ تستورد
 * ولا تُصدّر. وأوّلُ ما ظهر حين وُصلت: الصنفُ يُخزَّن بـ`barcodes[]` والشيتُ
 * عمودان (`barcode` · `barcodeAlt`)، فكان التصديرُ سيُخرجهما **فارغَين**
 * ويبدو ناجحًا — ثمّ يُعاد استيرادُه فيمحو باركوداتٍ قائمة.
 *
 * فالحارسُ يوكّد الاتّجاهين معًا: ما يخرج يعود كما هو.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { itemsExportRows } from './excelExport.js';
import { DATASETS, splitMulti } from './excelSchema.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = fs.readFileSync(
  path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'items', 'ItemMaster.jsx'),
  'utf8'
);

test('★★ الباركوداتُ لا تسقط في التصدير — الأوّلُ عمودًا والباقي مفصولًا', () => {
  const [row] = itemsExportRows([{ sku: 'ITM-1', barcodes: ['600100', '600200', '600300'] }]);
  assert.equal(row.barcode, '600100');
  assert.equal(row.barcodeAlt, '600200, 600300');
  // والفاصلُ هو ما يقرؤه المستورِد نفسُه — لا صيغةٌ ثانية
  assert.deepEqual(splitMulti(row.barcodeAlt), ['600200', '600300']);
});

test('صنفٌ بباركودٍ واحدٍ أو بلا باركود لا يُخترع له شيء', () => {
  assert.deepEqual(
    itemsExportRows([{ sku: 'A', barcodes: ['1'] }])[0],
    { sku: 'A', barcodes: ['1'], barcode: '1', barcodeAlt: '' }
  );
  const bare = itemsExportRows([{ sku: 'B' }])[0];
  assert.equal(bare.barcode, '');
  assert.equal(bare.barcodeAlt, '');
  assert.deepEqual(itemsExportRows([]), []);
  assert.deepEqual(itemsExportRows(null), []);
});

test('الفارغُ والفراغُ يُقلَّمان فلا يخرج عمودٌ بمحرفٍ أبيض', () => {
  const [row] = itemsExportRows([{ sku: 'C', barcodes: ['', '  ', '77', null] }]);
  assert.equal(row.barcode, '77');
  assert.equal(row.barcodeAlt, '');
});

test('ولا حقلَ من حقول الصنف يُفقد في الطريق', () => {
  const item = { sku: 'D', nameAr: 'اسم', costPrice: 3.5, itemType: 'sale', barcodes: [] };
  const [row] = itemsExportRows([item]);
  for (const [k, v] of Object.entries(item)) assert.deepEqual(row[k], v);
});

test('★ وترويسةُ التصدير هي ترويسةُ الاستيراد نفسُها — فما يخرج يعود', () => {
  const fields = DATASETS.items.columns.map((c) => c.field);
  assert.ok(fields.includes('barcode') && fields.includes('barcodeAlt'));
  // ولا عمودَ في الشيت بلا حقلٍ يملؤه التصدير
  const [row] = itemsExportRows([{ sku: 'E', nameAr: 'ن', barcodes: ['1', '2'] }]);
  for (const f of ['sku', 'nameAr', 'barcode', 'barcodeAlt']) assert.ok(f in row, f);
});

/* ───────── الوصل: لا دالّةَ بلا مستدعٍ ───────── */

test('★★ زرُّ التصدير موصولٌ في الشاشة فعلًا — لا دالّةٌ مبنيّةٌ بلا زرّ', () => {
  assert.match(SCREEN, /import \{ exportItemsMaster \} from '\.\.\/\.\.\/\.\.\/services\/excel\/excelExport\.js'/);
  assert.match(SCREEN, /function exportMaster\(\)/);
  assert.match(SCREEN, /onClick=\{exportMaster\}/);
  assert.match(SCREEN, /تصدير الأصناف/);
});

test('★ ويُصدَّر المعروضُ لا القاعدةُ كلُّها — بعد البحث والأرشيف', () => {
  assert.match(SCREEN, /exportItemsMaster\(filtered,/);
  assert.match(SCREEN, /disabled=\{!filtered\.length\}/);
});
