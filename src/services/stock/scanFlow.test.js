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

/* ═══ CAP-102 — الوحدة تُحلّ من الباركود لا تُكتب ═══ */

// صنفٌ عرّف وحداته: قطعةٌ أساسًا، وكرتونٌ بمعامل 12، ولكلٍّ باركوده.
const BOXED = {
  sku: 'ITM-BX',
  nameAr: 'شامبو',
  baseUom: 'piece',
  uomFactors: { carton: 12 },
  barcodes: ['700001', '700012'],
  uomBarcodes: { '700012': 'carton' },
};

test('★★★ CAP-102 باركود الكرتون يُظهر «كرتون (12 قطعة)» لا «قطعة»', () => {
  const box = panelForScan('700012', BOXED);
  assert.equal(box.unit, 'carton');
  assert.equal(box.factor, 12);
  assert.equal(box.fromBarcode, true);
  assert.equal(box.baseUom, 'piece');
  assert.equal(box.unitLabel, 'كرتون (12 قطعة)');

  // وباركود القطعة للصنف نفسه يبقى قطعةً — الباركود هو الفاصل.
  const piece = panelForScan('700001', BOXED);
  assert.equal(piece.unit, 'piece');
  assert.equal(piece.factor, 1);
  assert.equal(piece.fromBarcode, false);
  assert.equal(piece.unitLabel, 'قطعة');
});

test('★★ ترحيلٌ صفرُ الأثر: صنفٌ بلا باركود وحدةٍ يرجع لوحدة أساسه', () => {
  // ITEM لا يحمل uomBarcodes إطلاقًا — سلوك اليوم حرفيًّا.
  const panel = panelForScan('8059692040599', ITEM);
  assert.equal(panel.unit, 'piece');
  assert.equal(panel.fromBarcode, false);
  assert.equal(panel.unitLabel, 'قطعة');
  // وصنفٌ بلا وحدةٍ أصلًا لا يُخترع له شيء (١٠٤٠ صنفًا وحدتها «—»).
  const bare = panelForScan('555', { sku: 'X', nameAr: 'بلا وحدة' });
  assert.equal(bare.unit, '');
  assert.equal(bare.unitLabel, '—');
});

test('★★ معاملٌ غير معرّف يُقال صراحةً — الصمت يوحي بتحويلٍ مجهول', () => {
  const noFactor = {
    sku: 'ITM-NF', nameAr: 'صندوقٌ بلا معامل', baseUom: 'piece',
    barcodes: ['800001'], uomBarcodes: { '800001': 'box' },
  };
  const panel = panelForScan('800001', noFactor);
  assert.equal(panel.unit, 'box');
  assert.equal(panel.factor, null); // «لا أعرف» لا «صفر»
  assert.equal(panel.unitLabel, 'صندوق (معاملٌ غير معرّف)');
});

test('المجهول يحمل حقول الوحدة فارغةً لا غائبة', () => {
  const panel = panelForScan('999888', null);
  assert.deepEqual(
    { unit: panel.unit, baseUom: panel.baseUom, factor: panel.factor, fromBarcode: panel.fromBarcode },
    { unit: '', baseUom: '', factor: null, fromBarcode: false }
  );
});

/* ═══════════════ حكم الحفظ ═══════════════ */

test('★ قيدٌ معروف: الاسم من الماستر والكمّيّة من الموظّف — ولا يُطلب اسم', () => {
  const v = scanEntryVerdict({ mode: 'استلام', barcode: '111', qty: '5', item: ITEM });
  assert.equal(v.ok, true);
  assert.deepEqual(v.entry, {
    barcode: '111', sku: 'ITM-1', name: 'كريم يدين — وردي',
    qty: 5, uom: 'piece', factor: 1, baseQty: 5, opType: 'استلام',
  });
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

/* ═══ CAP-103 — القيد يُختم بوحدته ومعاملها وكمّيّته الأساس ═══ */

test('★★★ CAP-103 كرتونٌ معامله 12 وكتابة 1 ⇒ baseQty = 12 (لا 1)', () => {
  const v = scanEntryVerdict({ mode: 'جرد', barcode: '700012', qty: '1', item: BOXED });
  assert.equal(v.ok, true);
  assert.deepEqual(v.entry, {
    barcode: '700012', sku: 'ITM-BX', name: 'شامبو',
    qty: 1, uom: 'carton', factor: 12, baseQty: 12, opType: 'جرد',
  });
  // وهذا هو فارق 1100٪ الذي حذّر منه المالك: 1 كرتون ليست 1 قطعة.
  assert.notEqual(v.entry.baseQty, v.entry.qty);
});

test('★★ حارس الكسر يعمل بوحدة القيد لا بوحدة الأساس — والرسالة تسمّي ما كُتب', () => {
  const half = scanEntryVerdict({ mode: 'جرد', barcode: '700012', qty: 2.5, item: BOXED });
  assert.equal(half.ok, false);
  assert.match(half.problems.join(' '), /«كرتون» لا تقبل الكسور/);
});

test('★★ معاملٌ مجهول: القيد يُحفظ بـfactor=null وbaseQty=null — ولا يُوقَف العادّ', () => {
  const noFactor = {
    sku: 'ITM-NF', nameAr: 'صندوقٌ بلا معامل', baseUom: 'piece',
    barcodes: ['800001'], uomBarcodes: { '800001': 'box' },
  };
  const v = scanEntryVerdict({ mode: 'جرد', barcode: '800001', qty: 3, item: noFactor });
  assert.equal(v.ok, true, 'يُحفظ على كلّ حال — ق-٢: لا حجب للعادّ على الرفّ');
  assert.equal(v.entry.uom, 'box');
  assert.equal(v.entry.factor, null); // «لا أعرف» لا «صفر»
  assert.equal(v.entry.baseQty, null);
  assert.equal(v.entry.qty, 3);
});

test('★★★ الجمع بوحدة الأساس: كرتونٌ وقِطعٌ لا تُجمعان خامَّين', () => {
  const byBarcode = new Map([['700001', BOXED], ['700012', BOXED]]);
  const rows = buildSessionRows(
    [
      { barcode: '700012', qty: 1, uom: 'carton', factor: 12, baseQty: 12 },
      { barcode: '700001', qty: 3, uom: 'piece', factor: 1, baseQty: 3 },
    ],
    [BOXED], byBarcode, { withBaseline: false }
  );
  assert.equal(rows.length, 1); // باركودان لصنفٍ واحد ⇒ صفٌّ واحد
  assert.equal(rows[0].countedQty, 15, '12 + 3 بوحدة الأساس — لا 1 + 3');
  assert.equal(rows[0].baseUom, 'piece');
  assert.equal(rows[0].uncertain, false);
});

test('★★ ترحيلٌ صفرُ الأثر: قيدٌ قديم بلا uom ولا baseQty يُقرأ كما هو', () => {
  const rows = buildSessionRows(
    [{ barcode: '700001', qty: 5 }], // قيدُ ما قبل CAP-103
    [BOXED], new Map([['700001', BOXED]]), { withBaseline: false }
  );
  assert.equal(rows[0].countedQty, 5, 'معامله ١ ضمنًا — سلوك اليوم حرفيًّا');
  assert.equal(rows[0].uncertain, false, 'القديم ليس مشكوكًا فيه — لم يدّعِ وحدةً');
});

test('★★★ المعامل المجهول لا يُبتلع صفرًا صامتًا — يُقرأ خامًّا ويُوسم الصفّ', () => {
  const noFactor = { sku: 'ITM-NF', nameAr: 'صندوق', baseUom: 'piece', barcodes: ['800001'] };
  const rows = buildSessionRows(
    [{ barcode: '800001', qty: 3, uom: 'box', factor: null, baseQty: null }],
    [noFactor], new Map([['800001', noFactor]]), { withBaseline: false }
  );
  // لو قُرئت baseQty=null رقمًا لصارت صفرًا وضاعت الثلاثة بلا أثر.
  assert.equal(rows[0].countedQty, 3);
  assert.equal(rows[0].uncertain, true, 'المجموع بوحدة الأساس غير مضمون — يُعلَن');
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
  const row = { barcode: '111', sku: 'ITM-1', name: 'كريم', countedQty: 10, baseUom: 'piece' };
  const fix = correctionEntry(row, 7, 'جرد');
  assert.equal(fix.ok, true);
  // والتصحيح يُقال **بوحدة الأساس** بمعامل ١ — فلا يُخلط بقيدٍ بوحدةٍ أخرى.
  assert.deepEqual(fix.entry, {
    barcode: '111', sku: 'ITM-1', name: 'كريم',
    qty: -3, uom: 'piece', factor: 1, baseQty: -3, opType: 'جرد',
  });

  const wipe = correctionEntry(row, 0, 'جرد');
  assert.equal(wipe.entry.qty, -10);
  assert.equal(wipe.entry.baseQty, -10);
});

test('★★ CAP-103 صفٌّ «غير مضمون» لا يُصحَّح — لا يُكتب فرقٌ من مجموعٍ مجهول', () => {
  const row = { barcode: '111', name: 'كريم', countedQty: 10, baseUom: 'piece', uncertain: true };
  const v = correctionEntry(row, 7, 'جرد');
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /بلا معامل/);
});

test('التصحيح يُرفض بالاسم: كمّيّة سالبة أو لا تغيير أو وضعٌ مجهول', () => {
  const row = { barcode: '111', name: 'كريم', countedQty: 10 };
  assert.match(correctionEntry(row, -1, 'جرد').problems.join(' '), /صفرٌ فأكبر/);
  assert.match(correctionEntry(row, 10, 'جرد').problems.join(' '), /لا تغيير/);
  assert.equal(correctionEntry(row, 7, 'x').ok, false);
});

test('★★ التصدير يصدّر ما التُقط فقط — لا عمود رصيدٍ ولا عمود فرق', () => {
  const rows = exportRows([
    { barcode: '111', sku: 'ITM-1', name: 'كريم', known: true, baseUom: 'piece', countedQty: 8, scanCount: 2, scanned: true },
    { barcode: '999', sku: '', name: 'جديد', known: false, baseUom: '', countedQty: 2, scanCount: 1, scanned: true },
    { barcode: '222', sku: 'ITM-2', name: 'شامبو', known: true, baseUom: 'kg', countedQty: 0, scanCount: 0, scanned: false },
    { barcode: '333', sku: 'ITM-3', name: 'صندوق', known: true, baseUom: 'piece', countedQty: 3, scanCount: 1, scanned: true, uncertain: true },
  ]);
  const columns = Object.keys(rows[0]);
  assert.equal(columns.includes('الكمية الدفترية'), false);
  assert.equal(columns.includes('الفرق'), false);
  assert.deepEqual(columns, [
    'الباركود', 'كود الصنف', 'اسم الصنف', 'المعدود/المنفَّذ', 'الوحدة', 'عدد القيود', 'الحالة', 'ملاحظة',
  ]);
  assert.equal(rows[0]['المعدود/المنفَّذ'], 8);
  assert.equal(rows[0]['الوحدة'], 'قطعة'); // رقمٌ بلا وحدةٍ لا يُقرأ (CAP-103)
  assert.equal(rows[1]['الحالة'], 'غير معرّف — بانتظار الاعتماد');
  assert.equal(rows[1]['الوحدة'], '—');
  // «لم يُمسح» يُصدَّر «—» لا صفرًا: الصفر يقول «عددتُ ولم أجد» وهو معنًى آخر.
  assert.equal(rows[2]['المعدود/المنفَّذ'], '—');
  assert.equal(rows[2]['الحالة'], 'لم يُمسح');
  assert.equal(rows[2]['الوحدة'], 'كيلوغرام');
  assert.match(rows[3]['ملاحظة'], /غير مضمون/);
  assert.equal(rows[0]['ملاحظة'], '');
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
