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
  aggregateSession,
  correctionEntry,
  exportRows,
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

test('★★ التجميع: مجموع قيود الباركود = كمّيّته، والدفتريّة من الماستر لا من شيتٍ ثانٍ', () => {
  const byBarcode = new Map([['111', { sku: 'ITM-1', nameAr: 'كريم', balance: 10 }]]);
  const scans = [
    { barcode: '111', qty: 5 },
    { barcode: '111', qty: 3 },
    { barcode: '999', qty: 2, name: 'مجهولٌ سمّاه الموظّف' },
  ];
  const rows = aggregateSession(scans, byBarcode);
  assert.equal(rows.length, 2);
  const known = rows.find((r) => r.barcode === '111');
  assert.equal(known.countedQty, 8);
  assert.equal(known.bookQty, 10);
  assert.equal(known.diff, -2);
  assert.equal(known.name, 'كريم');
  const unknown = rows.find((r) => r.barcode === '999');
  assert.equal(unknown.known, false);
  assert.equal(unknown.bookQty, null);
  assert.equal(unknown.diff, null);
  assert.equal(unknown.name, 'مجهولٌ سمّاه الموظّف');
});

test('★ قيد تصحيحٍ سالب (من جدول الجلسة نفسه) ينزل بالمجموع — لا حالة محلّيّة توفَّق', () => {
  const rows = aggregateSession([
    { barcode: '111', qty: 10 },
    { barcode: '111', qty: -3 },
  ]);
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

test('صفوف التصدير بأعمدةٍ عربيّة ثابتة والمجهول موسومٌ بانتظار الاعتماد', () => {
  const rows = exportRows([
    { barcode: '111', sku: 'ITM-1', name: 'كريم', known: true, bookQty: 10, countedQty: 8, diff: -2 },
    { barcode: '999', sku: '', name: 'جديد', known: false, bookQty: null, countedQty: 2, diff: null },
  ]);
  assert.equal(rows[0]['الفرق'], -2);
  assert.equal(rows[1]['الحالة'], 'غير معرّف — بانتظار الاعتماد');
  assert.equal(rows[1]['الكمية الدفترية'], '—');
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
