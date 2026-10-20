/**
 * اختباراتُ تصدير جرد الأصول وطباعته.
 *
 * وأثقلُ ما هنا **حارسُ ترتيب الأعمدة**: عمودٌ يزيح عمودًا لا يُسقط شيئًا
 * ولا يشتكي — يُصدَّر ملفٌّ سليمٌ في الظاهر فيه «الماركة» في خانة
 * «السيريال». فيُفحص الصفُّ قيمةً قيمةً مقابل ترويسته.
 *
 * ★★★ وحارسٌ ثانٍ: **الإكسلُ والطباعةُ يعدّان الشيءَ نفسَه**. فلو بنى كلٌّ
 * أرقامَه بنفسه لَافترقا، ولا يُكشف الفرقُ إلّا حين يقارنهما أحد.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPORT_HEADERS_MAIN,
  EXPORT_HEADERS_DEPT,
  EXPORT_WIDTHS_MAIN,
  totalQty,
  countBy,
  conditionCounts,
  mainRow,
  deptRow,
  assetWorkbookModel,
  exportFileName,
  assetPrintModel,
} from './assetsExport.js';
import { ASSET_CONDITIONS } from './assetsModel.js';

const asset = (over = {}) => ({
  id: 'BRZ-0001',
  assetType: 'حاسوب',
  assetName: 'حاسوب مكتبي',
  brand: 'Dell',
  serial: 'SN-99',
  qty: 2,
  condition: 'جيد',
  responsible: 'أحمد',
  department: 'تقنية',
  section: 'الشبكات',
  location: 'المبنى الرئيسيّ',
  receivedDate: '2026-01-15',
  notes: 'بحالةٍ جيّدة',
  ...over,
});

// ─── ★★★ ترتيبُ الأعمدة ───────────────────────────────────────────────────
test('★★★ صفُّ الورقة الجامعة يطابق ترويستَه قيمةً قيمة', () => {
  const a = asset();
  const row = mainRow(a);
  assert.equal(row.length, EXPORT_HEADERS_MAIN.length, 'طولُ الصفّ = طولُ الترويسة');
  const at = (label) => row[EXPORT_HEADERS_MAIN.indexOf(label)];
  assert.equal(at('رقم الأصل'), 'BRZ-0001');
  assert.equal(at('نوع الأصل'), 'حاسوب');
  assert.equal(at('اسم الأصل'), 'حاسوب مكتبي');
  assert.equal(at('الماركة'), 'Dell');
  assert.equal(at('الموديل/السيريال'), 'SN-99');
  assert.equal(at('الكمية'), 2);
  assert.equal(at('الحالة'), 'جيد');
  assert.equal(at('المسؤول'), 'أحمد');
  assert.equal(at('الإدارة'), 'تقنية');
  assert.equal(at('القسم'), 'الشبكات');
  assert.equal(at('الموقع'), 'المبنى الرئيسيّ');
  assert.equal(at('تاريخ الاستلام'), '2026-01-15');
  assert.equal(at('ملاحظات'), 'بحالةٍ جيّدة');
});

test('★★★ صفُّ ورقة الإدارة يطابق ترويستَه — والإدارةُ غائبةٌ عنه', () => {
  const row = deptRow(asset());
  assert.equal(row.length, EXPORT_HEADERS_DEPT.length);
  assert.ok(!EXPORT_HEADERS_DEPT.includes('الإدارة'), 'الورقةُ هي الإدارةُ فلا عمودَ لها');
  const at = (label) => row[EXPORT_HEADERS_DEPT.indexOf(label)];
  assert.equal(at('رقم الأصل'), 'BRZ-0001');
  assert.equal(at('السيريال'), 'SN-99');
  assert.equal(at('الكمية'), 2);
  assert.equal(at('القسم'), 'الشبكات');
  assert.equal(at('تاريخ الاستلام'), '2026-01-15');
  assert.equal(at('ملاحظات'), 'بحالةٍ جيّدة');
});

test('عرضُ الأعمدة بطول الترويسة — فعرضٌ ناقصٌ يزيح البقيّة', () => {
  assert.equal(EXPORT_WIDTHS_MAIN.length, EXPORT_HEADERS_MAIN.length);
});

// ─── العدّ ────────────────────────────────────────────────────────────────
test('مجموعُ الكمّيّات: الناقصُ واحدٌ لا صفر', () => {
  assert.equal(totalQty([asset({ qty: 3 }), asset({ qty: 4 })]), 7);
  assert.equal(totalQty([asset({ qty: '' }), asset({ qty: 0 })]), 2, 'كلُّ ناقصٍ يقع على واحد');
  assert.equal(totalQty([]), 0);
  assert.equal(totalQty(null), 0);
});

test('العدُّ بحقلٍ يُهمل الفارغ', () => {
  const m = countBy([asset(), asset({ department: 'مالية' }), asset({ department: '  ' })], 'department');
  assert.equal(m.get('تقنية'), 1);
  assert.equal(m.get('مالية'), 1);
  assert.equal(m.size, 2, 'الفارغُ ليس إدارة');
});

test('كلُّ الحالات تظهر في الملخّص ولو بصفر', () => {
  const counts = conditionCounts([asset({ condition: 'معطل' })]);
  assert.equal(counts.length, ASSET_CONDITIONS.length);
  assert.deepEqual(counts.find(([c]) => c === 'معطل'), ['معطل', 1]);
  assert.deepEqual(counts.find(([c]) => c === 'ممتاز'), ['ممتاز', 0], 'حالةٌ غائبةٌ تُقرأ «لم تُقَس» لا «صفر»');
});

// ─── المصنَّف ─────────────────────────────────────────────────────────────
test('المصنَّف: ملخّصٌ وجامعةٌ وورقةٌ لكلّ إدارة', () => {
  const list = [asset(), asset({ id: 'BRZ-0002', department: 'مالية' }), asset({ id: 'BRZ-0003' })];
  const wb = assetWorkbookModel(list, { exportedOn: '2026-10-19' });

  assert.equal(wb.summary.name, 'ملخص إحصائي');
  assert.deepEqual(wb.summary.rows[1], ['تاريخ التصدير:', '2026-10-19']);
  assert.deepEqual(wb.summary.rows[3], ['إجمالي الأصول', 3]);
  assert.deepEqual(wb.summary.rows[4], ['إجمالي الكميات', 6]);

  assert.equal(wb.main.name, 'جرد الأصول');
  assert.deepEqual(wb.main.rows[0], EXPORT_HEADERS_MAIN);
  assert.equal(wb.main.rows.length, 4, 'ترويسةٌ وثلاثةُ صفوف');

  assert.deepEqual(wb.departments.map((d) => d.name), ['تقنية', 'مالية']);
  assert.equal(wb.departments[0].rows.length, 3, 'تقنية: ترويسةٌ وصفّان');
  assert.equal(wb.departments[1].rows.length, 2, 'مالية: ترويسةٌ وصفّ');
  assert.deepEqual(wb.departments[0].rows[0], EXPORT_HEADERS_DEPT);
});

test('اسمُ الورقة يُقصّ إلى حدِّ إكسل — واسمٌ أطولُ يُسقط الكتابةَ كلَّها', () => {
  const long = 'إدارةٌ باسمٍ طويلٍ جدًّا يتجاوز الواحدَ والثلاثين حرفًا بكثير';
  const wb = assetWorkbookModel([asset({ department: long })]);
  assert.equal(wb.departments[0].name.length, 31);
});

test('مصنَّفٌ بلا أصول: ترويسةٌ بلا صفوفٍ ولا أوراقَ إدارات', () => {
  const wb = assetWorkbookModel([]);
  assert.deepEqual(wb.main.rows, [EXPORT_HEADERS_MAIN]);
  assert.deepEqual(wb.departments, []);
  assert.deepEqual(wb.summary.rows[3], ['إجمالي الأصول', 0]);
});

test('اسمُ الملفّ يحمل اليومَ كما يُمرَّر', () => {
  assert.equal(exportFileName('2026-10-19'), 'Brandzo_Inventory_2026-10-19.xlsx');
});

// ─── الطباعة ─────────────────────────────────────────────────────────────
test('أرقامُ الطباعة: «يحتاج صيانة / معطل» بندٌ واحدٌ مجموع', () => {
  const m = assetPrintModel([
    asset({ condition: 'ممتاز' }),
    asset({ condition: 'جيد' }),
    asset({ condition: 'يحتاج صيانة' }),
    asset({ condition: 'معطل' }),
  ]);
  assert.equal(m.total, 4);
  assert.equal(m.quantity, 8);
  assert.equal(m.excellent, 1);
  assert.equal(m.good, 1);
  assert.equal(m.bad, 2, 'الحالتان السيّئتان بندٌ واحد');
  assert.equal(m.healthy, 2);
});

test('★★★ الطباعةُ والإكسلُ يعدّان الشيءَ نفسَه — فلا يفترق ملفّان', () => {
  const list = [asset({ condition: 'ممتاز', qty: 5 }), asset({ condition: 'معطل', qty: 1 })];
  const wb = assetWorkbookModel(list);
  const pr = assetPrintModel(list);
  assert.deepEqual(wb.summary.rows[3], ['إجمالي الأصول', pr.total]);
  assert.deepEqual(wb.summary.rows[4], ['إجمالي الكميات', pr.quantity]);
  const wbExcellent = wb.summary.rows.find((r) => r[0] === 'ممتاز')[1];
  assert.equal(wbExcellent, pr.excellent);
});

test('طباعةُ لا شيءٍ لا ترمي', () => {
  const m = assetPrintModel(null);
  assert.deepEqual([m.total, m.quantity, m.bad], [0, 0, 0]);
  assert.deepEqual(m.rows, []);
});
