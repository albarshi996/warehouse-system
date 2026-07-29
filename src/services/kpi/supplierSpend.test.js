/**
 * اختبارات تحليل إنفاق الموردين وتركّزه.
 *
 * تتحقّق من: الإنفاق من صافي أوامر الشراء (يحترم الخصم) · تُحتسب المُصدَرة وحدها
 * (لا المسودّة) · الترتيب تنازليّ · تركّز أكبر خمسة صحيح مع أكثر من خمسة موردين ·
 * المورّد بلا رمزٍ يُفتَح بالاسم · وبلا بيانات يُعيد صفرًا وnull لا رقمًا مزيّفًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { supplierSpend } from './supplierSpend.js';

/** أمر شراء مُبسَّط: مورّدٌ برمز، وبندٌ واحد (كمية×سعر)، وخصمٌ اختياريّ. */
function po(id, code, price, state = 'approved', discount = 0) {
  return { id, type: 'PO', state, header: { supplierCode: code, supplier: `مورّد ${code}`, discount }, lines: [{ qty: 1, unitPrice: price }] };
}

/** ستة موردين بإنفاقٍ متدرّج + خصمٌ على الثاني + مسودّة تُقصى. */
function sampleDocs() {
  return [
    po('p1', 'S1', 1000),
    po('p2', 'S2', 600, 'done', 100), // صافي 500 (خصم 100)
    po('p3', 'S3', 300),
    po('p4', 'S4', 200, 'done'),
    po('p5', 'S5', 100),
    po('p6', 'S6', 50),
    po('pDraft', 'S1', 9999, 'draft'), // مسودّة — تُقصى
  ];
}

test('الإنفاق: من صافي الأمر (يحترم الخصم) والمُصدَرة وحدها', () => {
  const r = supplierSpend(sampleDocs());
  assert.equal(r.activeCount, 6);
  assert.equal(r.totalSpend, 2150); // 1000+500+300+200+100+50
  assert.equal(r.suppliers[0].key, 'S1');
  assert.equal(r.suppliers[0].spend, 1000); // المسودّة لم تُضف
  assert.equal(r.suppliers[1].spend, 500); // الخصم طُبّق
});

test('تركّز أكبر خمسة: صحيح مع أكثر من خمسة موردين', () => {
  const r = supplierSpend(sampleDocs());
  // أكبر خمسة = 1000+500+300+200+100 = 2100 ÷ 2150
  assert.equal(r.top5Spend, 2100);
  assert.equal(r.top5Concentration, 2100 / 2150);
});

test('الحصّة: كل مورّدٍ يحمل نسبته من الإجمالي', () => {
  const r = supplierSpend(sampleDocs());
  assert.equal(r.suppliers[0].share, 1000 / 2150);
});

test('المورّد بلا رمز: يُفتَح بالاسم مطبَّعًا', () => {
  const docs = [
    { id: 'x', type: 'PO', state: 'approved', header: { supplier: 'أكمي', discount: 0 }, lines: [{ qty: 2, unitPrice: 150 }] },
  ];
  const r = supplierSpend(docs);
  assert.equal(r.activeCount, 1);
  assert.equal(r.totalSpend, 300);
  assert.equal(r.suppliers[0].name, 'أكمي');
});

test('بلا بيانات: صفر إنفاق وتركّز null لا رقم مزيّف', () => {
  const r = supplierSpend([]);
  assert.equal(r.activeCount, 0);
  assert.equal(r.totalSpend, 0);
  assert.equal(r.top5Concentration, null);
});

test('خمسة موردين أو أقل: التركّز 100%', () => {
  const docs = [po('a', 'A', 400), po('b', 'B', 100)];
  const r = supplierSpend(docs);
  assert.equal(r.top5Concentration, 1);
});
