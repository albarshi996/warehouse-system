/**
 * حارس تدفّق المسح على الهاتف (SAP-19) — الاختبار قبل الواجهة (§22 ‹995›).
 *
 * البوّابة الحاكمة هي شكوى المالك الحرفيّة: «أقرأ باركودًا فتظهر خانة
 * التعبئة: الاسم إن كان في الذاكرة أو أسمّيه، والكمّيّة» — كلّ فرعٍ منها
 * مُثبَتٌ هنا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_MODES,
  isScanMode,
  panelForScan,
  scanEntryVerdict,
  sessionSummary,
  correctionEntry,
  exportRows,
  buildSessionRows,
  sessionProgress,
  filterRows,
  parseBulkBarcodes,
} from './scanFlow.js';

const ITEM = { sku: 'ITM-1', nameAr: 'كريم يدين', shade: 'وردي', unit: 'piece' };

/* ═══════════════ الأوضاع ═══════════════ */

test('الأوضاع الثلاثة بقيم opType القديمة حرفيًّا — فالتقارير القائمة تقرأ الجديد', () => {
  assert.deepEqual(SCAN_MODES.map((m) => m.id), ['جرد', 'استلام', 'صرف']);
  assert.equal(isScanMode('استلام'), true);
  assert.equal(isScanMode('bogus'), false);
});

/* ═══════════════ خانة التعبئة ═══════════════ */

test('★★ «إن كان في الذاكرة يظهر»: المعروف تظهر خانته باسمه ووحدته', () => {
  const panel = panelForScan('8059692040599', ITEM);
  assert.equal(panel.known, true);
  assert.equal(panel.name, 'كريم يدين — وردي');
  assert.equal(panel.sku, 'ITM-1');
  assert.equal(panel.unitLabel, 'قطعة');
});

test('★★ «أو أقوم بتسميته»: المجهول خانته فارغة الاسم تنتظر التسمية', () => {
  const panel = panelForScan('999888', null);
  assert.equal(panel.known, false);
  assert.equal(panel.name, '');
  assert.equal(panel.barcode, '999888');
});

test('الباركود يُطبَّع بقاعدة الماستر — الأصفار البادئة تسقط', () => {
  assert.equal(panelForScan('00251', null).barcode, '251');
});

/* ═══════════════ حكم الحفظ ═══════════════ */

test('★ قيدٌ معروف: الاسم من الماستر والكمّيّة من الموظّف — ولا يُطلب اسم', () => {
  const v = scanEntryVerdict({ mode: 'استلام', barcode: '111', qty: '5', item: ITEM });
  assert.equal(v.ok, true);
  assert.deepEqual(v.entry, { barcode: '111', name: 'كريم يدين — وردي', qty: 5, opType: 'استلام' });
});

test('★★ قيدٌ مجهول بلا اسم يُرفض برسالةٍ تشرح — ومع الاسم يُقبل', () => {
  const missing = scanEntryVerdict({ mode: 'جرد', barcode: '999', qty: 2 });
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join(' '), /سمِّه/);

  const named = scanEntryVerdict({ mode: 'جرد', barcode: '999', qty: 2, name: ' صنفٌ جديد ' });
  assert.equal(named.ok, true);
  assert.equal(named.entry.name, 'صنفٌ جديد');
});

test('الكمّيّة صفر أو سالبة أو فارغة تُرفض بالاسم', () => {
  for (const qty of [0, -1, '', 'abc']) {
    const v = scanEntryVerdict({ mode: 'صرف', barcode: '111', qty, item: ITEM });
    assert.equal(v.ok, false);
    assert.match(v.problems.join(' '), /الكمّيّة مطلوبة/);
  }
});

test('★ حارس الكسر بوحدة الصنف: نصف قطعةٍ يُرفض، ونصف كيلوغرامٍ يُقبل', () => {
  const half = scanEntryVerdict({ mode: 'جرد', barcode: '111', qty: 2.5, item: ITEM });
  assert.equal(half.ok, false);
  assert.match(half.problems.join(' '), /لا تقبل الكسور/);

  const kgItem = { sku: 'K1', nameAr: 'أرز', unit: 'kg' };
  const kg = scanEntryVerdict({ mode: 'جرد', barcode: '222', qty: 2.5, item: kgItem });
  assert.equal(kg.ok, true);
});

test('وضعٌ مجهول أو باركود فارغ يُرفضان بالاسم', () => {
  const v = scanEntryVerdict({ mode: 'x', barcode: '', qty: 1, name: 'أ' });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 2);
});

/* ═══════════════ ملخّص الجلسة ═══════════════ */

/* ═══════════════ جدول الجلسة — دفترٌ ملحق-فقط مصدرًا واحدًا ═══════════════ */

test('★★ التجميع: مجموع قيود الباركود = كمّيّته، والمجهول يحمل اسمه الذي سُمّي به', () => {
  const item = { sku: 'ITM-1', nameAr: 'كريم', barcodes: ['111'], balance: 10 };
  const byBarcode = new Map([['111', item]]);
  const scans = [
    { barcode: '111', qty: 5 },
    { barcode: '111', qty: 3 },
    { barcode: '999', qty: 2, name: 'مجهولٌ سمّاه الموظّف' },
  ];
  const rows = buildSessionRows(scans, [item], byBarcode, { withBaseline: false });
  assert.equal(rows.length, 2);
  const known = rows.find((r) => r.sku === 'ITM-1');
  assert.equal(known.countedQty, 8);
  assert.equal(known.scanCount, 2);
  assert.equal(known.name, 'كريم');
  const unknown = rows.find((r) => r.barcode === '999');
  assert.equal(unknown.known, false);
  assert.equal(unknown.name, 'مجهولٌ سمّاه الموظّف');
});

test('★★★ CAP-101 «الالتقاط لا يُحاسِب»: صنفٌ رصيده ٤٧٥ لا يحمل رصيدًا ولا فرقًا', () => {
  // هذا هو العطب المرصود بعينه: رصيد ٤٧٥ كان يظهر صفرًا في شاشة العدّ.
  // والعلاج ليس تصحيح الرقم بل نزعه — الشاشة لا تملك أن تعرفه أصلًا.
  const item = { sku: 'ITM-475', nameAr: 'صنفٌ ذو رصيد', barcodes: ['475'], balance: 475 };
  const byBarcode = new Map([['475', item]]);

  for (const rows of [
    buildSessionRows([{ barcode: '475', qty: 3 }], [item], byBarcode, { withBaseline: true }),
    buildSessionRows([], [item], byBarcode, { withBaseline: true }), // ولا حتّى الصفّ غير الممسوح
  ]) {
    const row = rows.find((r) => r.sku === 'ITM-475');
    assert.equal('bookQty' in row, false, 'الصفّ لا يحمل حقل رصيدٍ إطلاقًا');
    assert.equal('diff' in row, false, 'الصفّ لا يحمل حقل فرقٍ إطلاقًا');
    assert.equal(Object.values(row).includes(475), false, 'ولا قيمةَ في الصفّ تساوي الرصيد');
  }
});

test('★ قيد تصحيحٍ سالب (من جدول الجلسة نفسه) ينزل بالمجموع — لا حالة محلّيّة توفَّق', () => {
  const rows = buildSessionRows(
    [{ barcode: '111', qty: 10 }, { barcode: '111', qty: -3 }],
    [], new Map(), { withBaseline: false }
  );
  assert.equal(rows[0].countedQty, 7);
});

test('★★ التصحيح قيدُ فرقٍ لا تعديل: 10 ⇒ 7 يُنتج −3، والحذف يعكس الكلّ', () => {
  const row = { barcode: '111', name: 'كريم', countedQty: 10 };
  const fix = correctionEntry(row, 7, 'جرد');
  assert.equal(fix.ok, true);
  assert.deepEqual(fix.entry, { barcode: '111', name: 'كريم', qty: -3, opType: 'جرد' });

  const wipe = correctionEntry(row, 0, 'جرد');
  assert.equal(wipe.entry.qty, -10);
});

test('التصحيح يُرفض بالاسم: كمّيّة سالبة أو لا تغيير أو وضعٌ مجهول', () => {
  const row = { barcode: '111', name: 'كريم', countedQty: 10 };
  assert.match(correctionEntry(row, -1, 'جرد').problems.join(' '), /صفرٌ فأكبر/);
  assert.match(correctionEntry(row, 10, 'جرد').problems.join(' '), /لا تغيير/);
  assert.equal(correctionEntry(row, 7, 'x').ok, false);
});

test('★★ التصدير يصدّر ما التُقط فقط — لا عمود رصيدٍ ولا عمود فرق', () => {
  const rows = exportRows([
    { barcode: '111', sku: 'ITM-1', name: 'كريم', known: true, countedQty: 8, scanCount: 2, scanned: true },
    { barcode: '999', sku: '', name: 'جديد', known: false, countedQty: 2, scanCount: 1, scanned: true },
    { barcode: '222', sku: 'ITM-2', name: 'شامبو', known: true, countedQty: 0, scanCount: 0, scanned: false },
  ]);
  const columns = Object.keys(rows[0]);
  assert.equal(columns.includes('الكمية الدفترية'), false);
  assert.equal(columns.includes('الفرق'), false);
  assert.deepEqual(columns, ['الباركود', 'كود الصنف', 'اسم الصنف', 'المعدود/المنفَّذ', 'عدد القيود', 'الحالة']);
  assert.equal(rows[0]['المعدود/المنفَّذ'], 8);
  assert.equal(rows[1]['الحالة'], 'غير معرّف — بانتظار الاعتماد');
  // «لم يُمسح» يُصدَّر «—» لا صفرًا: الصفر يقول «عددتُ ولم أجد» وهو معنًى آخر.
  assert.equal(rows[2]['المعدود/المنفَّذ'], '—');
  assert.equal(rows[2]['الحالة'], 'لم يُمسح');
});

/* ═══════════════ قاعدة الجرد من الماستر — تكامل الأداة القديمة ═══════════════ */

const MASTER = [
  { sku: 'ITM-1', nameAr: 'كريم', barcodes: ['111'], balance: 10 },
  { sku: 'ITM-2', nameAr: 'شامبو', barcodes: ['222', '333'], balance: 4 },
  { sku: 'OLD-X', nameAr: 'مؤرشف', barcodes: ['444'], balance: 9, archived: true },
];
const BY_BARCODE = new Map([
  ['111', MASTER[0]],
  ['222', MASTER[1]],
  ['333', MASTER[1]],
  ['444', MASTER[2]],
]);

test('★★ الجرد بقاعدة الماستر: غير الممسوح يظهر صفًّا — جوهر الجرد ما لم يُعدّ بعد', () => {
  const rows = buildSessionRows([{ barcode: '111', qty: 8 }], MASTER, BY_BARCODE, { withBaseline: true });
  assert.equal(rows.length, 2); // المؤرشف لا يدخل القاعدة
  const counted = rows.find((r) => r.sku === 'ITM-1');
  assert.equal(counted.scanned, true);
  assert.equal(counted.countedQty, 8);
  const pending = rows.find((r) => r.sku === 'ITM-2');
  assert.equal(pending.scanned, false); // «لم يُمسح» عملٌ متبقٍّ — يبقى صفًّا
  assert.equal(pending.countedQty, 0);
});

test('★★ باركودان لصنفٍ واحد يُجمعان على هويّته لا على باركودَيهما', () => {
  const rows = buildSessionRows(
    [{ barcode: '222', qty: 1 }, { barcode: '333', qty: 2 }],
    MASTER, BY_BARCODE, { withBaseline: true }
  );
  const shampoo = rows.find((r) => r.sku === 'ITM-2');
  assert.equal(shampoo.countedQty, 3);
  assert.equal(rows.filter((r) => r.sku === 'ITM-2').length, 1);
});

test('استلام/صرف بلا قاعدة: الممسوح وحده يظهر', () => {
  const rows = buildSessionRows([{ barcode: '111', qty: 5 }], MASTER, BY_BARCODE, { withBaseline: false });
  assert.equal(rows.length, 1);
});

test('★ عدّادات الإنجاز — نفس أرقام رأس الأداة القديمة', () => {
  const rows = buildSessionRows(
    [{ barcode: '111', qty: 8 }, { barcode: '999', qty: 1, name: 'مجهول' }],
    MASTER, BY_BARCODE, { withBaseline: true }
  );
  // ولا عدّاد «فروقات» (CAP-101): المتبقّي يقيس العملَ لا الانحراف.
  assert.deepEqual(sessionProgress(rows), {
    total: 2, scanned: 1, remaining: 1, unknown: 1, pct: 50,
  });
});

test('★ الترشيح: تبويب «لم يُمسح» + بحثٌ بالاسم أو الكود أو الباركود', () => {
  const rows = buildSessionRows([{ barcode: '111', qty: 8 }], MASTER, BY_BARCODE, { withBaseline: true });
  assert.equal(filterRows(rows, { tab: 'unscanned' })[0].sku, 'ITM-2');
  assert.equal(filterRows(rows, { term: 'شامبو' })[0].sku, 'ITM-2');
  assert.equal(filterRows(rows, { term: '111' })[0].sku, 'ITM-1');
  // تبويب «الفروقات» نُزع (CAP-101) — والتبويب المجهول لا يُرشِّح شيئًا.
  assert.equal(filterRows(rows, { tab: 'diff' }).length, rows.length);
});

test('لصق باركودات: أسطرٌ وفواصل ومسافات — والتكرار يبقى (كلّ ظهورٍ قيدُ ١)', () => {
  const { codes, count } = parseBulkBarcodes('111\n222، 333 111;');
  assert.deepEqual(codes, ['111', '222', '333', '111']);
  assert.equal(count, 4);
  assert.equal(parseBulkBarcodes('').count, 0);
});

test('ملخّص الجلسة: قيود وأصناف وإجمالي ومجهولون', () => {
  const scans = [
    { barcode: '111', qty: 5 },
    { barcode: '111', qty: 3 },
    { barcode: '999', qty: 1 },
  ];
  const known = new Set(['111']);
  assert.deepEqual(sessionSummary(scans, known), {
    scanCount: 3,
    itemCount: 2,
    totalQty: 9,
    unknownCount: 1,
  });
  assert.equal(sessionSummary([]).scanCount, 0);
});
