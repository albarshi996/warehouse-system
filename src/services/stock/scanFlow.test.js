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
