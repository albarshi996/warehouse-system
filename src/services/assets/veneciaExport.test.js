/**
 * اختبارُ تصدير جرد فينسيا — **ذهابًا وإيابًا**.
 *
 * ولا يكفي أن نتحقّق من الصفوف قبل البناء: الذي يُسقط عمودًا هو `json_to_sheet`
 * حين يختلف مفتاحٌ عن عنوانٍ بمحرفٍ واحد، فيخرج العمودُ **فارغًا** والملفُّ
 * يبدو سليمًا. فيُبنى المصنَّف ثمّ يُقرأ من بايتاته كما يقرؤه إكسل، ويُطابق.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

import { VENECIA_EXPORT_COLUMNS } from './veneciaModel.js';
import {
  buildVeneciaWorkbook,
  veneciaFileName,
  veneciaSheetName,
} from './veneciaExport.js';

const seed = JSON.parse(
  readFileSync(new URL('../../data/venecia-assets-seed.json', import.meta.url), 'utf8')
);

/** يقرأ المصنَّفَ من بايتاته — كما يفعل إكسل، لا من الكائن في الذاكرة. */
function roundTrip(wb) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const back = XLSX.read(buf, { type: 'buffer' });
  const ws = back.Sheets[back.SheetNames[0]];
  return {
    sheetName: back.SheetNames[0],
    header: XLSX.utils.sheet_to_json(ws, { header: 1 })[0],
    rows: XLSX.utils.sheet_to_json(ws, { defval: '' }),
  };
}

const asset = (over = {}) => ({
  id: 'BRZ-0001',
  population: 'issue',
  assetType: 'تخزين لصرف',
  assetName: 'خشب باركي',
  brand: 'دستة',
  serial: 'اثاث',
  qty: 120,
  condition: 'جيد',
  responsible: 'سراج',
  department: 'مخزن فينسيا',
  section: '',
  location: 'فينسيا',
  receivedDate: '',
  notes: 'ملاحظةٌ ما',
  warehouse: 'فينسيا',
  ...over,
});

test('اسمُ الملفّ يُنظَّف وبامتدادٍ واحدٍ لا اثنين', () => {
  assert.equal(veneciaFileName('جرد-2026-10-19'), 'جرد-2026-10-19.xlsx');
  assert.equal(veneciaFileName('جرد.xlsx'), 'جرد.xlsx');
  assert.equal(veneciaFileName('a/b:c?d'), 'abcd.xlsx');
  assert.equal(veneciaFileName('   '), 'جرد-مخزن-فينسيا.xlsx');
});

test('واسمُ الورقة لا يتجاوز حدَّ إكسل', () => {
  assert.equal(veneciaSheetName(''), 'مخزن فينسيا');
  assert.equal(veneciaSheetName('ا'.repeat(40)).length, 31);
});

test('★★★ الملفُّ المُصدَّر يُقرأ بعشرين عمودًا بترتيبها — ولا عمودَ يُسقط صامتًا', () => {
  const out = roundTrip(buildVeneciaWorkbook([asset()]));
  assert.deepEqual(out.header, VENECIA_EXPORT_COLUMNS);
  assert.equal(out.rows.length, 1);
  assert.equal(out.sheetName, 'مخزن فينسيا');
});

test('وكلُّ قيمةٍ تبلغ خانتها — لا إزاحةَ عمودٍ ولا قيمةٌ تهاجر', () => {
  const [row] = roundTrip(buildVeneciaWorkbook([asset()])).rows;
  assert.equal(row['رقم الأصل'], 'BRZ-0001');
  assert.equal(row['اسم الأصل'], 'خشب باركي');
  assert.equal(row['الماركة'], 'دستة');
  assert.equal(row['السيريال'], 'اثاث');
  assert.equal(row['الكمية'], 120);
  assert.equal(row['الحالة'], 'جيد');
  assert.equal(row['المسؤول'], 'سراج');
  assert.equal(row['المجموعة'], 'بضاعة الصرف');
  assert.equal(row['التصنيف'], 'اثاث');
  assert.equal(row['ملاحظات'], 'ملاحظةٌ ما');
});

test('★ وأرقامُ الجرد تخرج أرقامًا لا نصًّا — فتُجمع في إكسل بلا تحويل', () => {
  const [row] = roundTrip(
    buildVeneciaWorkbook([asset({ qty: 5, countedQty: 3, countedAt: '2026-10-19', countedBy: 'أحمد' })])
  ).rows;
  assert.equal(row['الكمية المعدودة'], 3);
  assert.equal(row['فرق الجرد'], -2);
  assert.equal(typeof row['فرق الجرد'], 'number');
  assert.equal(row['تاريخ الجرد'], '2026-10-19');
  assert.equal(row['من جرد'], 'أحمد');
});

test('وما لم يُجرَد يخرج فارغًا لا صفرًا — فصفرٌ كاذبٌ يُقرأ جردًا مطابقًا', () => {
  const [row] = roundTrip(buildVeneciaWorkbook([asset()])).rows;
  assert.equal(row['الكمية المعدودة'], '');
  assert.equal(row['فرق الجرد'], '');
});

test('★ وبذرةُ المالك تُصدَّر كاملةً: ١٠٤ صفًّا و٢٧٣٩ وحدة', () => {
  const out = roundTrip(buildVeneciaWorkbook(seed.assets));
  assert.equal(out.rows.length, 104);
  assert.equal(
    out.rows.reduce((s, r) => s + Number(r['الكمية'] || 0), 0),
    2739
  );
  // والمجموعتان كلتاهما في الملفّ — لا تُصدَّر واحدةٌ ويُنسى أختُها.
  const pops = new Set(out.rows.map((r) => r['المجموعة']));
  assert.deepEqual([...pops].sort(), ['أصول المدعوم', 'بضاعة الصرف']);
});

test('وجردٌ فارغٌ يُصدَّر ترويسةً وحدَها ولا يرمي', () => {
  const out = roundTrip(buildVeneciaWorkbook([]));
  assert.deepEqual(out.header, VENECIA_EXPORT_COLUMNS);
  assert.deepEqual(out.rows, []);
});
