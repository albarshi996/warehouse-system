/**
 * اختبارات مؤشرات المشتريات والدورة المستندية.
 *
 * تتحقّق من: مدة دورة أمر الشراء تُقاس من إنشاء الطلب لإصدار الأمر عبر الرابط ·
 * مهلة التوريد من إصدار الأمر للاستلام · التزام الموردين يحترم مهلة اليوم ·
 * نسبة النفاد تحسب أصنافًا لا كميات · وكلٌّ يُعيد null بلا بيانات ولا يخترع رقمًا.
 *
 * التواريخ أرقام ميلي-ثانية فوق أساسٍ زمنيّ (يقبلها toMillis) كي يبقى الحساب
 * ثابتًا بلا منطقة زمنية. الأساس يُبعد كلّ طابعٍ عن الصفر — فالصفر طابعٌ زائف.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  poCycleTime,
  supplierLeadTime,
  supplierOtd,
  stockoutRate,
  computeProcurementKpis,
} from './procurementKpis.js';

const DAY = 86400000;
const BASE = 500 * DAY;
/** طابعٌ زمنيّ عند اليوم n فوق الأساس — يتجنّب الصفر ويحفظ الفروق. */
const t = (n) => BASE + n * DAY;

/** مجموعة مستنداتٍ مترابطة: طلبان ← أمران ← استلامان + أمرا بيع. */
function sampleDocs() {
  return [
    { id: 'pr1', type: 'PR', createdAt: t(0) },
    { id: 'pr2', type: 'PR', createdAt: t(2) },
    { id: 'po1', type: 'PO', links: { PR: { id: 'pr1' } }, approvedAt: t(3), header: { requiredDelivery: t(10) } },
    { id: 'po2', type: 'PO', links: { PR: { id: 'pr2' } }, numberedAt: t(5), header: { requiredDelivery: t(6) } },
    { id: 'g1', type: 'GRN', links: { PO: { id: 'po1' } }, header: { receivedAt: t(8) } },
    { id: 'g2', type: 'GRN', links: { PO: { id: 'po2' } }, header: { receivedAt: t(9) } },
    { id: 's1', type: 'SO', lines: [{ sku: 'A' }, { sku: 'B' }], soShortfall: [{ sku: 'A' }] },
    { id: 's2', type: 'SO', lines: [{ sku: 'C' }], soShortfall: [] },
  ];
}

test('مدة دورة أمر الشراء: من إنشاء الطلب لإصدار الأمر عبر links.PR', () => {
  const r = poCycleTime(sampleDocs());
  // po1: 3−0 = 3 · po2: 5−2 = 3 (الترقيم بديل الاعتماد)
  assert.equal(r.count, 2);
  assert.equal(r.avgDays, 3);
  assert.equal(r.medianDays, 3);
});

test('مدة دورة أمر الشراء: أمرٌ بلا طلبٍ مرتبط لا يُحتسب', () => {
  const docs = [
    { id: 'poX', type: 'PO', approvedAt: t(5) }, // بلا links.PR
    { id: 'pr1', type: 'PR', createdAt: t(0) },
    { id: 'po1', type: 'PO', links: { PR: { id: 'pr1' } }, approvedAt: t(4) },
  ];
  const r = poCycleTime(docs);
  assert.equal(r.count, 1);
  assert.equal(r.avgDays, 4);
});

test('مهلة التوريد: من إصدار الأمر للاستلام الفعلي', () => {
  const r = supplierLeadTime(sampleDocs());
  // g1: 8−3 = 5 · g2: 9−5 = 4
  assert.equal(r.count, 2);
  assert.equal(r.avgDays, 4.5);
  assert.equal(r.medianDays, 4.5);
});

test('التزام الموردين OTD: استلامٌ في موعده أو قبله (مهلة يوم)', () => {
  const r = supplierOtd(sampleDocs());
  // g1: 8 ≤ 10+1 ملتزم · g2: 9 ≤ 6+1؟ لا → متأخّر
  assert.equal(r.total, 2);
  assert.equal(r.onTime, 1);
  assert.equal(r.rate, 0.5);
});

test('نسبة النفاد: أصنافٌ عاجزة ÷ أصنافٌ مطلوبة (لا كميات)', () => {
  const r = stockoutRate(sampleDocs());
  // مطلوبة {A,B,C}=3 · عاجزة {A}=1
  assert.equal(r.orderedItems, 3);
  assert.equal(r.stockoutItems, 1);
  assert.equal(r.rate, 1 / 3);
});

test('بلا بيانات: كل مؤشرٍ يُعيد null ولا يخترع رقمًا', () => {
  assert.equal(poCycleTime([]).avgDays, null);
  assert.equal(supplierLeadTime([]).avgDays, null);
  assert.equal(supplierOtd([]).rate, null);
  assert.equal(stockoutRate([]).rate, null);
});

test('النافذة الزمنية تُقصي ما قبلها ويُحتسب المستند بلا تاريخ', () => {
  const nowMs = t(100);
  const docs = [
    { id: 'prOld', type: 'PR', createdAt: t(1) }, // خارج نافذة 30 يومًا
    { id: 'poOld', type: 'PO', links: { PR: { id: 'prOld' } }, approvedAt: t(3) },
    { id: 'prNew', type: 'PR', createdAt: t(90) },
    { id: 'poNew', type: 'PO', links: { PR: { id: 'prNew' } }, approvedAt: t(92), createdAt: t(92) },
  ];
  const r = computeProcurementKpis(docs, { nowMs, windowDays: 30 });
  // القديم أُقصي (createdAt خارج النافذة) → دورةٌ واحدة فقط من الحديث
  assert.equal(r.poCycle.count, 1);
  assert.equal(r.poCycle.avgDays, 2);
});
