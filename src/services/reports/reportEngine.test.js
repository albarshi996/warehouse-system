/**
 * اختبارات محرّك التقارير (ر‑٠ · يسدّ ف‑٧).
 *
 * معايير القبول الثمانية في الخطة، وهذا الملفّ يحرس منها خمسة:
 * الفلاتر مجتمعةً · المجاميع تطابق المعروض · الفارغ يقول «لا بيانات» ·
 * محصورٌ بأصحابه · المنطق خالصٌ مختبَر. والثلاثة الباقية (الطباعة والتصدير
 * والخمسة آلاف صفّ) في الشاشة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILTER_KINDS,
  COLUMN_KINDS,
  definitionProblems,
  canOpen,
  applyFilters,
  totalsOf,
  runReport,
  formatCell,
  exportRows,
  buildRegistry,
  reportsForRole,
} from './reportEngine.js';

const DEF = {
  id: 'test-report',
  titleAr: 'تقرير اختبار',
  group: 'اختبار',
  roles: ['warehouse_manager'],
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'warehouse', label: 'المستودع', kind: 'select', options: ['MAIN', 'B2'] },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
    { key: 'minQty', label: 'كمّيّة لا تقلّ عن', kind: 'number', field: 'qty' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'warehouse', label: 'المستودع', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
  ],
  rows: (data) => data || [],
};

const DATA = [
  { date: '2026-08-01', sku: 'A-1', warehouse: 'MAIN', qty: 10, value: 100 },
  { date: '2026-08-05', sku: 'A-2', warehouse: 'B2', qty: 5, value: 50 },
  { date: '2026-08-09', sku: 'B-1', warehouse: 'MAIN', qty: 20, value: 200.5 },
];

/* ═══════════ ١. عقد التعريف ═══════════ */

test('★ التعريف السليم بلا مشاكل', () => {
  assert.deepEqual(definitionProblems(DEF), []);
});

test('★★ تقريرٌ بلا أدوار يُرفض — الرقم محصورٌ بأصحابه لا مباحٌ للجميع', () => {
  assert.match(definitionProblems({ ...DEF, roles: [] })[0], /بلا أدوار/);
  assert.match(definitionProblems({ ...DEF, roles: undefined })[0], /بلا أدوار/);
});

test('★ عمودٌ بلا تسميةٍ يُرفض — عمودٌ بلا اسمٍ لا يُقرأ', () => {
  const bad = { ...DEF, columns: [{ key: 'x', kind: 'text' }] };
  assert.match(definitionProblems(bad)[0], /بلا تسمية/);
});

test('★ مجموعٌ على عمودٍ نصّيّ يُرفض — جمعُ الأسماء لا معنى له', () => {
  const bad = { ...DEF, columns: [{ key: 'sku', label: 'الصنف', kind: 'text', sum: true }] };
  assert.match(definitionProblems(bad)[0], /مجموعٌ على عمودٍ غير رقميّ/);
});

test('نوعٌ غير معروفٍ لعمودٍ أو فلترٍ يُرفض', () => {
  assert.match(definitionProblems({ ...DEF, columns: [{ key: 'a', label: 'ا', kind: 'مخترع' }] })[0], /نوع عمود/);
  assert.match(definitionProblems({ ...DEF, filters: [{ key: 'a', kind: 'مخترع' }] })[0], /نوع فلتر/);
  assert.match(definitionProblems({ ...DEF, filters: [{ key: 'a', kind: 'select' }] })[0], /بلا خيارات/);
});

test('الأنواع المدعومة معلَنة', () => {
  assert.ok(FILTER_KINDS.includes('dateRange'));
  assert.ok(COLUMN_KINDS.includes('money'));
});

/* ═══════════ ٢. الحصر بالأدوار ═══════════ */

test('★★ التقرير محصورٌ بأصحابه، والأدمن يفتح كلّ شيء', () => {
  assert.equal(canOpen(DEF, 'warehouse_manager'), true);
  assert.equal(canOpen(DEF, 'admin'), true);
  assert.equal(canOpen(DEF, 'sales_rep'), false);

  const denied = runReport(DEF, DATA, {}, { role: 'sales_rep' });
  assert.equal(denied.ok, false);
  assert.equal(denied.rows.length, 0, 'ولا يُسرَّب صفٌّ واحد');
  assert.match(denied.message, /محصور/);
});

/* ═══════════ ٣. الفلاتر مجتمعةً ═══════════ */

test('★★ الفلاتر تعمل مجتمعة — المعيار الأوّل', () => {
  assert.equal(applyFilters(DATA, DEF.filters, {}).length, 3, 'الفارغ لا يُقيّد');
  assert.equal(applyFilters(DATA, DEF.filters, { warehouse: 'MAIN' }).length, 2);
  assert.equal(applyFilters(DATA, DEF.filters, { warehouse: 'MAIN', minQty: 15 }).length, 1);
  assert.equal(applyFilters(DATA, DEF.filters, { warehouse: 'MAIN', minQty: 15, sku: 'B' }).length, 1);
  assert.equal(applyFilters(DATA, DEF.filters, { warehouse: 'MAIN', sku: 'لا شيء' }).length, 0);
});

test('★ النصّ يتساهل والاختيار يدقّق', () => {
  assert.equal(applyFilters(DATA, DEF.filters, { sku: 'a' }).length, 2, 'يحتوي وبلا حساسيّة حرف');
  assert.equal(applyFilters(DATA, DEF.filters, { warehouse: 'MAIN' }).length, 2);
  assert.equal(applyFilters(DATA, DEF.filters, { warehouse: 'MAI' }).length, 0, 'الاختيار مطابقةٌ تامّة');
});

test('★ المدّة تشمل طرفيها', () => {
  const f = (from, to) => applyFilters(DATA, DEF.filters, { period: { from, to } }).length;
  assert.equal(f('2026-08-01', '2026-08-09'), 3);
  assert.equal(f('2026-08-05', ''), 2, 'من بلا إلى');
  assert.equal(f('', '2026-08-05'), 2, 'إلى بلا من');
  assert.equal(f('2026-08-02', '2026-08-08'), 1);
});

/* ═══════════ ٤. المجاميع ═══════════ */

test('★★ المجاميع تطابق الصفوف المعروضة — المعيار الثاني', () => {
  const all = runReport(DEF, DATA, {});
  assert.equal(all.totals.qty, 35);
  assert.equal(all.totals.value, 350.5);

  const filtered = runReport(DEF, DATA, { warehouse: 'MAIN' });
  assert.equal(filtered.totals.qty, 30, 'وليس ٣٥');
  assert.equal(filtered.totals.value, 300.5);
});

test('★ ولا يُجمَع إلّا ما وُسِم بالجمع', () => {
  const t = totalsOf(DATA, DEF.columns);
  assert.deepEqual(Object.keys(t).sort(), ['qty', 'value']);
});

/* ═══════════ ٥. الفارغ والحدّ ═══════════ */

test('★★ التقرير الفارغ يقول «لا بيانات» — المعيار الخامس', () => {
  const r = runReport(DEF, [], {});
  assert.equal(r.ok, true, 'الفراغ ليس فشلًا');
  assert.equal(r.empty, true);
  assert.equal(r.message, 'لا بيانات.');
  assert.deepEqual(r.totals, { qty: 0, value: 0 });
});

test('★★ الحدّ يُبلَّغ ولا يُبتلع — والمجموع من كلّ ما طابق لا من المقصوص', () => {
  const many = Array.from({ length: 120 }, (_, i) => ({ date: '2026-08-01', sku: `S${i}`, warehouse: 'MAIN', qty: 1, value: 1 }));
  const r = runReport(DEF, many, {}, { maxRows: 100 });
  assert.equal(r.rows.length, 100, 'المعروض مقصوص');
  assert.equal(r.count, 120, 'والعدّ صادق');
  assert.equal(r.truncated, true, 'والقصّ معلَن');
  assert.equal(r.totals.qty, 120, 'والمجموع من الكلّ — وإلّا كذب مرّتين');
});

test('دالّة صفوفٍ ترمي لا تُسقط الشاشة', () => {
  const bad = { ...DEF, rows: () => { throw new Error('عطب'); } };
  const r = runReport(bad, DATA, {});
  assert.equal(r.ok, false);
  assert.match(r.message, /تعذّر بناء التقرير/);
});

test('تقريرٌ غير معروف لا يرمي', () => {
  assert.equal(runReport(null, DATA, {}).ok, false);
});

/* ═══════════ ٦. العرض والتصدير ═══════════ */

test('★ التنسيق لا يخترع قيمة — الفارغ يبقى فارغًا لا صفرًا', () => {
  assert.equal(formatCell(null, 'money'), '');
  assert.equal(formatCell('', 'number'), '');
  assert.equal(formatCell(undefined, 'qty'), '');
  assert.equal(formatCell(0, 'money'), '0.00', 'والصفر الصريح يُعرض');
  assert.equal(formatCell(12.5, 'money'), '12.50');
  assert.equal(formatCell('2026-08-01T10:00', 'date'), '2026-08-01');
});

test('★★ التصدير قيمٌ خامٌ لا منسّقة — الرقم رقمٌ في الملفّ', () => {
  const out = exportRows(DATA, DEF.columns);
  assert.equal(typeof out[0]['الكمّيّة'], 'number');
  assert.equal(typeof out[0]['القيمة'], 'number');
  assert.equal(out[0]['القيمة'], 100);
  assert.equal(typeof out[0]['التاريخ'], 'string');
  assert.deepEqual(Object.keys(out[0]), DEF.columns.map((c) => c.label), 'وبأسماء الأعمدة العربيّة');
});

/* ═══════════ ٧. السجلّ ═══════════ */

test('★ السجلّ يرفض تقريرًا مكرّرًا — معرّفان متطابقان يعنيان تقريرًا مفقودًا', () => {
  assert.throws(() => buildRegistry([DEF], [DEF]), /مكرّر/);
  assert.equal(Object.keys(buildRegistry([DEF])).length, 1);
  assert.equal(Object.keys(buildRegistry()).length, 0);
});

test('★ المركز يعرض لكلّ دورٍ تقاريره مجموعةً', () => {
  const other = { ...DEF, id: 'x2', titleAr: 'آخر', group: 'مجموعة ٢', roles: ['finance_manager'] };
  const reg = buildRegistry([DEF, other]);
  assert.deepEqual(reportsForRole(reg, 'warehouse_manager').map((g) => g.group), ['اختبار']);
  assert.deepEqual(reportsForRole(reg, 'finance_manager').map((g) => g.group), ['مجموعة ٢']);
  assert.equal(reportsForRole(reg, 'admin').length, 2, 'الأدمن يرى الكلّ');
  assert.deepEqual(reportsForRole(reg, 'viewer'), [], 'ومن لا تقرير له يرى فراغًا لا خطأً');
});
