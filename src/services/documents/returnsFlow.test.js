/**
 * حارس المرتجعات والنقل العكسيّ (SAP-10) — قبل أيّ واجهة (§22 ‹995›).
 *
 * البوّابات الحرفيّة: §15.5 ‹420-425› الشروط الستّة · §15 ‹429› النقل
 * العكسيّ لا يعدّل الأصل · §15 ‹430› مرتجع العميل يدخل الفحص قبل المخزون
 * الصالح، والتصحيح الماليّ البحت لا يحرّك الكمّيّة · §15 ‹416› لا يُلفَّق
 * أثرٌ ماليّ · SR-62 ‹3710› لا إرجاع من نقلٍ لم يُنفَّذ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RETURN_DERIVATIONS,
  returnableQuantity,
  returnedSoFar,
  returnEligibility,
  INSPECTION_ROUTES,
  inspectionRoute,
  inspectionPlan,
  reversalContract,
  REVERSAL_FIELDS,
  FINANCIAL_ONLY_CASES,
  isFinancialOnly,
} from './returnsFlow.js';
import { SYSTEM_LOCATIONS } from '../ledger/locations.js';
import { derivationLinkType, derivationQuantityFields, derivationTargets } from './chain.js';
import { documentLineProgress } from '../documentLineProgress.js';
import { createDocumentRelation } from './documentRelations.js';

const okSource = { id: 'dn-1', type: 'DN', number: 'DN-1', state: 'done' };

/* ═══════════════ الكمّيّة المؤهلة (ف‑٢٥ · ف‑٤٨) ═══════════════ */

test('★★ ف‑٤٨: زوجا الإرجاع الكمّيّ الغائبان صارا معرَّفين — من الاستلام ومن التسليم', () => {
  assert.ok(RETURN_DERIVATIONS['GRN>VRT']);
  assert.ok(RETURN_DERIVATIONS['DN>RET']);
  assert.equal(RETURN_DERIVATIONS['GRN>VRT'].source, 'qtyReceived');
});

test('★★ ف‑٢٥: المؤهَّل = المنفَّذ − ما أُرجع سابقًا، ولا يُرجع ما لم يُنفَّذ', () => {
  assert.equal(returnableQuantity({ executed: 100 }, 0), 100);
  assert.equal(returnableQuantity({ executed: 100 }, 30), 70);
  assert.equal(returnableQuantity({ executed: 100 }, 100), 0);
  assert.equal(returnableQuantity({ executed: 100 }, 140), 0, 'لا يهبط تحت الصفر');
  assert.equal(returnableQuantity({ executed: 0 }), 0, 'ما لم يُنفَّذ لا يُرجع');
});

test('ما أُرجع سابقًا يُجمع من المرتجعات القائمة بمطابقة الهويّة', () => {
  const returns = [
    { lines: [{ sku: 'ITM-1', qty: 10 }, { sku: 'ITM-2', qty: 5 }] },
    { lines: [{ sku: '', barcode: '111', qty: 4 }] },
  ];
  assert.equal(returnedSoFar(returns, { sku: 'itm-1' }), 10);
  assert.equal(returnedSoFar(returns, { sku: 'X', barcode: '111' }), 4);
  assert.equal(returnedSoFar(returns, {}), 0);
});

/* ═══════════════ الشروط الستّة (§15.5) ═══════════════ */

test('★★ §15.5: مرتجعٌ مستوفٍ للستّة يمرّ — والشروط كلّها معلَنة', () => {
  const v = returnEligibility({
    source: okSource,
    reason: 'تالف عند الاستلام',
    qty: 5,
    returnable: 10,
    line: { condition: 'تالف', warehouse: 'E5' },
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.conditions, {
    eligibleSource: true,
    documentedReason: true,
    quantityWithinCap: true,
    identityKept: true,
    warehouseKnown: true,
    clearReversal: true,
    relationRecorded: true,
  });
});

test('★★ لا يُرجع من مسودّة، ولا بلا سبب، ولا فوق المؤهَّل — وكلٌّ يُقال باسمه', () => {
  const v = returnEligibility({
    source: { id: 'd', type: 'DN', state: 'draft' },
    reason: '  ',
    qty: 20,
    returnable: 10,
    line: { condition: 'سليم' },
  });
  assert.equal(v.ok, false);
  const joined = v.problems.join(' | ');
  assert.match(joined, /لا يُرجَع إلّا من معتمَدٍ/);
  assert.match(joined, /سبب الإرجاع مطلوب/);
  assert.match(joined, /تتجاوز المؤهَّل للإرجاع 10/);
});

test('★ الصنف المتتبَّع بالتشغيلة: مرتجعٌ بلا تشغيلة يُرفض (الشرط الرابع)', () => {
  const base = { source: okSource, reason: 'تالف', qty: 1, returnable: 5, line: { condition: 'تالف' } };
  assert.equal(returnEligibility({ ...base, batchTracked: true }).ok, false);
  assert.equal(returnEligibility({ ...base, batchTracked: true, line: { condition: 'تالف', batch: 'B1' } }).ok, true);
  assert.equal(returnEligibility({ ...base, batchTracked: false }).ok, true, 'وغير المتتبَّع لا يُطالَب');
});

test('★ الشرط الخامس: بندٌ بلا حالةٍ ولا إجراءٍ لا أثرَ عكسيَّ واضحًا له', () => {
  const v = returnEligibility({ source: okSource, reason: 'س', qty: 1, returnable: 5, line: {} });
  assert.equal(v.ok, false);
  assert.equal(v.conditions.clearReversal, false);
  assert.match(v.problems.join(' '), /لا تُعرف وجهته/);
});

/* ═══════════════ مسار الفحص ثلاثيّ الوجهة (ف‑٢٤ · §15 ‹430›) ═══════════════ */

test('★★ §15 ‹430›: المرتجع لا يدخل المخزون الصالح مباشرةً — منطقةُ فحصٍ أوّلًا', () => {
  assert.equal(SYSTEM_LOCATIONS.RETURNS.code, 'RETURNS');
  assert.equal(SYSTEM_LOCATIONS.RETURNS.mustZero, true, 'رصيدٌ باقٍ = مرتجعٌ لم يُفرز');
  // «تحت الفحص» يبقى فيها — قرارٌ لم يُتَّخذ لا وجهةٌ مخترعة.
  assert.equal(inspectionRoute({ action: 'تحت الفحص' }).location, 'RETURNS');
});

test('★★ ف‑٢٤: الوجهات الثلاث — صالحٌ للمخزون · إصلاحٌ للصيانة · تالفٌ للإتلاف', () => {
  assert.equal(inspectionRoute({ condition: 'سليم' }).location, 'WAREHOUSE');
  assert.equal(inspectionRoute({ action: 'صيانة' }).location, 'MAINTENANCE');
  assert.equal(inspectionRoute({ condition: 'تالف' }).location, 'SCRAP');
  assert.equal(inspectionRoute({ condition: 'منتهي' }).location, 'SCRAP');
  assert.equal(inspectionRoute({ action: 'إرجاع للمورّد' }).location, 'QUARANTINE');
});

test('★ الإجراء يتقدّم على الحالة — قرارُ الفاحص فوق وصف الحالة', () => {
  const r = inspectionRoute({ condition: 'تالف', action: 'إعادة للمخزون' });
  assert.equal(r.key, 'stock');
  assert.equal(r.fromField, 'action');
});

test('خطّة الفرز تعدّ البنود لكلّ وجهة، وغير المفروز يُعلَن لا يُبتلع', () => {
  const plan = inspectionPlan({
    lines: [
      { sku: 'A', qty: 3, condition: 'سليم' },
      { sku: 'B', qty: 2, condition: 'تالف' },
      { sku: 'C', qty: 1, action: 'صيانة' },
      { sku: 'D', qty: 4 },
    ],
  });
  assert.equal(plan.stock.length, 1);
  assert.equal(plan.scrap.length, 1);
  assert.equal(plan.maintenance.length, 1);
  assert.equal(plan.unrouted.length, 1);
  assert.equal(plan.unrouted[0].sku, 'D');
});

/* ═══════════════ النقل العكسيّ (§15 ‹429› · SR-62 · SR-63) ═══════════════ */

const postedTransfer = {
  id: 'trc-1', type: 'TRC', number: 'TR-2026-0010', state: 'done', posted: true,
  header: { fromWarehouse: 'E5', toWarehouse: 'E2' },
};

test('★★ SR-63: العكس يقلب المستودعين ويحفظ التشغيلة ويسمّي أصله — تسعة حقول', () => {
  const r = reversalContract({
    original: postedTransfer,
    line: { sku: 'ITM-1', batch: 'B1', bin: 'A-01' },
    qty: 6,
    reason: 'شحنٌ خاطئ',
  });
  assert.equal(r.ok, true);
  assert.equal(r.contract.fromWarehouse, 'E2', 'المصدر الجديد = هدف الأصل');
  assert.equal(r.contract.toWarehouse, 'E5', 'والهدف الجديد = مصدره');
  assert.equal(r.contract.batch, 'B1', 'التشغيلة نفسها لا تُخترع أخرى');
  assert.equal(r.contract.linkType, 'REVERSAL');
  assert.equal(r.contract.relationLabel, 'عكس TR-2026-0010');
  for (const f of REVERSAL_FIELDS) assert.ok(f in r.contract, `الحقل ${f} مطلوب`);
});

test('★★ §15 ‹429›: العكس لا يعدّل الأصل ولا يحذفه — العقد يشير إليه ولا يمسّه', () => {
  const original = JSON.parse(JSON.stringify(postedTransfer));
  const r = reversalContract({ original, line: { sku: 'A' }, qty: 1, reason: 'س' });
  assert.deepEqual(original, postedTransfer, 'الأصل كما هو حرفيًّا');
  assert.deepEqual(r.contract.sourceDocument, { id: 'trc-1', type: 'TRC', number: 'TR-2026-0010' });
});

test('★★ SR-62 ‹3710›: لا إرجاع من طلب نقلٍ لم يُنفَّذ — إغلاقٌ أو إلغاءٌ لا عكس', () => {
  const r = reversalContract({
    original: { id: 'tr-1', type: 'TR', state: 'approved', header: { fromWarehouse: 'E5', toWarehouse: 'E2' } },
    line: { sku: 'A' }, qty: 1, reason: 'س',
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /لا يُعكس ما لم يقع/);
});

/* ═══════════════ الماليّة البحتة (ف‑٢٣ · §15 ‹416›) ═══════════════ */

test('★★ §15 ‹416›: الصفوف الماليّة البحتة موصوفةٌ فجوةً ولا يُلفَّق لها أثر', () => {
  assert.equal(FINANCIAL_ONLY_CASES.length, 4);
  for (const c of FINANCIAL_ONLY_CASES) {
    assert.ok(c.note.length > 20, `${c.id} يحتاج وصفًا مكتوبًا`);
  }
  // التصحيح الماليّ البحت لا يحرّك كمّيّة (§15 ‹430›).
  assert.equal(isFinancialOnly('vendor-credit-only'), true);
  assert.equal(isFinancialOnly('customer-credit-only'), true);
  // وما له شقٌّ كمّيّ ليس ماليًّا بحتًا — يُنفَّذ كمّيًّا هنا.
  assert.equal(isFinancialOnly('customer-return-after-invoice'), false);
});

test('وجهات الفحص الخمس معرَّفةٌ بتسمياتٍ ومواقع', () => {
  for (const key of ['stock', 'maintenance', 'scrap', 'vendor', 'hold']) {
    assert.ok(INSPECTION_ROUTES[key].label.length > 3, key);
  }
});

/* ═══════════ الوصل: المرتجع علاقةُ إرجاعٍ لا تنفيذًا ═══════════ */

test('★★ المرتجع ليس تنفيذًا لأصله: الزوجان يُنشئان RETURN لا BASE', () => {
  assert.equal(derivationLinkType('GRN', 'VRT'), 'RETURN');
  assert.equal(derivationLinkType('DN', 'RET'), 'RETURN');
  // وبقيّة السلسلة تبقى أساسًا كما كانت — لا انقلاب على القائم.
  assert.equal(derivationLinkType('PO', 'GRN'), 'BASE');
  assert.equal(derivationLinkType('QC', 'PUTAWAY'), 'BASE');
});

test('★★ استلامُ 100 وإرجاعُ 10 لا يجعل المنفَّذ 110 — الإرجاع خارج حساب التنفيذ', () => {
  const grn = {
    id: 'grn-1', type: 'GRN', number: 'GRN-1',
    lines: [{ sku: 'ITM-1', qtyReceived: 100 }],
  };
  const qc = { id: 'qc-1', type: 'QC', number: 'QC-1', lines: [{ sku: 'ITM-1', qtyInspected: 100 }] };
  const vrt = { id: 'vrt-1', type: 'VRT', number: 'VRT-1', lines: [{ sku: 'ITM-1', qty: 10 }] };

  const relations = [
    createDocumentRelation({
      source: { document: grn, line: grn.lines[0], lineIndex: 0 },
      target: { document: qc, line: qc.lines[0], lineIndex: 0 },
      linkType: derivationLinkType('GRN', 'QC'),
      linkedQuantity: 100,
    }),
    createDocumentRelation({
      source: { document: grn, line: grn.lines[0], lineIndex: 0 },
      target: { document: vrt, line: vrt.lines[0], lineIndex: 0 },
      linkType: derivationLinkType('GRN', 'VRT'),
      linkedQuantity: 10,
    }),
  ];

  const progress = documentLineProgress(grn, relations, [qc, vrt]);
  assert.equal(progress.totals.executed, 100, 'المنفَّذ مئةٌ لا مئةٌ وعشر');
  assert.equal(progress.totals.excess, 0, 'ولا تجاوز');
  assert.deepEqual(progress.issues, [], 'ولا مشكلة مسجَّلة');
});

test('★ الزوجان لهما حقول كمّيّة معرَّفة — فالمسار الكمّيّ للإرجاع صار موجودًا', () => {
  assert.deepEqual(derivationQuantityFields('GRN', 'VRT'), { source: 'qtyReceived', target: 'qty' });
  assert.deepEqual(derivationQuantityFields('DN', 'RET'), { source: 'qty', target: 'qty' });
  assert.ok(derivationTargets('GRN').includes('VRT'));
  assert.ok(derivationTargets('DN').includes('RET'));
});
