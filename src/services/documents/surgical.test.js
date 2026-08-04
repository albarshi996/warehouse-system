/**
 * اختبارات «التحسينات الجراحية» (2026-08-04) — منطق خالص:
 *  · اشتقاق إشعار رفض الاستلام (SRN) من البنود المرفوضة في مذكرة الاستلام.
 *  · اشتقاق تأكيد التسليم (POD) من إذن التسليم، حاملًا لوحة المركبة.
 *  · تسجيل المخطّطين، وأثرهما المخزنيّ (SRN توثيقيّ · POD يخصم المركبة).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveDocument, derivationTargets, DELIVERY_CHAIN, REJECTION_CHAIN } from './chain.js';
import { getSchema, readyTypes } from './schemas/index.js';
import { primaryParentType } from './schemaUtils.js';
import { movesStock } from '../ledger/postingRules.js';

// ── إشعار رفض الاستلام (SRN) ────────────────────────────────────────
const GRN_WITH_REJECTS = {
  id: 'grn1',
  type: 'GRN',
  number: 'GRN-2026-0001',
  state: 'approved',
  header: { supplier: 'مورّد المشارق', poRef: 'PO-2026-0007' },
  links: { PO: { id: 'po1', number: 'PO-2026-0007' } },
  lines: [
    { sku: 'A', description: 'صنف أ', qtyReceived: 10, qtyRejected: 3, rejectReason: 'تالف', expiryDate: '2026-12-01' },
    { sku: 'B', description: 'صنف ب', qtyReceived: 5, qtyRejected: 0, rejectReason: '' },
    { sku: 'C', description: 'صنف ج', qtyReceived: 8, qtyRejected: 2, rejectReason: 'مخالف للمواصفات' },
  ],
};

test('مذكرة الاستلام تتفرّع: فحص جودة وإشعار رفض', () => {
  assert.deepEqual(derivationTargets('GRN'), ['QC', 'SRN']);
});

test('SRN يأخذ البنود المرفوضة وحدها، وكمية الرفض تصير كمية الإرجاع', () => {
  const srn = deriveDocument(GRN_WITH_REJECTS, 'SRN');
  assert.equal(srn.type, 'SRN');
  assert.equal(srn.lines.length, 2, 'المرفوضان فقط (A وC)، لا المقبول B');
  const a = srn.lines.find((l) => l.sku === 'A');
  assert.equal(a.qty, 3, 'الكمية المرفوضة تصير كمية الإشعار');
  assert.equal(a.reason, 'تالف');
  assert.equal(a.expiry, '2026-12-01');
  assert.ok(!srn.lines.some((l) => l.sku === 'B'), 'الصنف المقبول لا يظهر في إشعار الرفض');
});

test('SRN يرث المورّد ومرجعَي الاستلام وأمر الشراء', () => {
  const srn = deriveDocument(GRN_WITH_REJECTS, 'SRN');
  assert.equal(srn.header.supplier, 'مورّد المشارق');
  assert.equal(srn.header.poRef, 'PO-2026-0007');
  assert.equal(srn.header.grnRef, 'GRN-2026-0001', 'رقم الاستلام مرجعًا');
  assert.equal(srn.links.GRN.id, 'grn1');
});

test('SRN توثيقيّ فقط — لا أثر مخزنيّ (فحص الجودة عزل المرفوض أصلًا)', () => {
  assert.equal(movesStock('SRN'), false);
});

test('أب SRN المرجعيّ هو مذكرة الاستلام', () => {
  assert.equal(primaryParentType(getSchema('SRN')), 'GRN');
});

// ── تأكيد التسليم (POD) ─────────────────────────────────────────────
const DN_LOADED = {
  id: 'dn1',
  type: 'DN',
  number: 'DN-2026-0003',
  state: 'approved',
  header: { customer: 'مطعم البركة', customerCode: 'C-12', driverName: 'سالم', vehiclePlate: '12-3456' },
  // السعر يتدفّق خفيةً عبر السلسلة (SO→…→DN) وإن لم يكن عمودًا مرئيًّا في الإذن.
  lines: [{ sku: 'A', description: 'صنف أ', qty: 6, uom: 'علبة', batch: 'B1', expiry: '2026-10-01', unitPrice: 5 }],
};

test('إذن التسليم يتفرّع ثلاثًا ومنها تأكيد التسليم', () => {
  assert.ok(derivationTargets('DN').includes('POD'));
});

test('POD يرث بنود الإذن ولوحة مركبته وعميله ومرجعه', () => {
  const pod = deriveDocument(DN_LOADED, 'POD');
  assert.equal(pod.type, 'POD');
  assert.equal(pod.header.vehiclePlate, '12-3456', 'لوحة المركبة تُورَّث — منها يُخصم الرصيد');
  assert.equal(pod.header.customer, 'مطعم البركة');
  assert.equal(pod.header.dnRef, 'DN-2026-0003');
  assert.equal(pod.lines.length, 1);
  assert.equal(pod.lines[0].qty, 6);
  assert.equal(pod.lines[0].batch, 'B1');
  assert.equal(pod.lines[0].unitPrice, 5, 'السعر يتدفّق للـPOD فلا تُقيَّد حركة التسليم بقيمة صفر');
  assert.equal(pod.links.DN.id, 'dn1');
});

test('POD يُحرّك المخزون (يخصم المركبة)، وأبوه إذن التسليم', () => {
  assert.equal(movesStock('POD'), true);
  assert.equal(primaryParentType(getSchema('POD')), 'DN');
});

// ── التسجيل والسلاسل ────────────────────────────────────────────────
test('المخطّطان مسجّلان بأقسامٍ وأدوارٍ وتواقيع', () => {
  for (const t of ['SRN', 'POD']) {
    const s = getSchema(t);
    assert.ok(s, `${t} مسجّل`);
    assert.ok(Array.isArray(s.sections) && s.sections.length);
    assert.ok(s.roles?.create?.length && s.roles?.approve?.length && s.roles?.complete?.length);
    assert.ok(Array.isArray(s.signatures) && s.signatures.length);
    assert.ok(typeof s.warnings === 'function');
  }
  assert.ok(readyTypes().includes('SRN') && readyTypes().includes('POD'));
});

test('السلسلتان المصغّرتان معرّفتان', () => {
  assert.deepEqual(DELIVERY_CHAIN, ['DN', 'POD']);
  assert.deepEqual(REJECTION_CHAIN, ['GRN', 'SRN']);
});

test('POD يُنجزه فريق الحركة (fleet) — لخصم رصيد المركبة', () => {
  assert.ok(getSchema('POD').roles.complete.includes('fleet'));
});
