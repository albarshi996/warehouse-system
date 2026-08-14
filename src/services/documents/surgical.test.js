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

// ── إشعار رفض الاستلام (SRN) — يُشتقّ من الفحص (BZ-SCN-005) ──────────
const QC_WITH_REJECTS = {
  id: 'qc1',
  type: 'QC',
  number: 'QC-2026-0001',
  state: 'approved',
  header: { supplier: 'مورّد المشارق', poRef: 'PO-2026-0007', grnRef: 'GRN-2026-0001' },
  links: { PO: { id: 'po1', number: 'PO-2026-0007' }, GRN: { id: 'grn1', number: 'GRN-2026-0001' } },
  lines: [
    { sku: 'A', description: 'صنف أ', qtyInspected: 10, qtyAccepted: 7, qtyRejected: 3, reason: 'تالف', batch: 'L1', expiry: '2026-12-01' },
    { sku: 'B', description: 'صنف ب', qtyInspected: 5, qtyAccepted: 5, qtyRejected: 0, reason: '' },
    { sku: 'C', description: 'صنف ج', qtyInspected: 8, qtyAccepted: 6, qtyRejected: 2, reason: 'مخالف للمواصفات' },
  ],
};

test('الاستلام يتفرّع: فحصٌ وإرجاعٌ للمورّد، والفحص يتفرّع: تخزينٌ وإشعار رفض', () => {
  // SAP-10 (ف‑٤٨): أُضيف `VRT` — فصار للإرجاع للمورّد مسارٌ كمّيّ من
  // الاستلام تُحسب منه الكمّيّة المؤهلة، وعلاقته `RETURN` لا `BASE`
  // (المرتجع عكسُ جزءٍ من الاستلام لا إتمامٌ له).
  assert.deepEqual(derivationTargets('GRN'), ['QC', 'VRT']);
  assert.deepEqual(derivationTargets('QC'), ['PUTAWAY', 'SRN']);
});

test('BZ-SCN-005: SRN يُشتقّ من الفحص فيأخذ مرفوضاته وحدها، وكمية الرفض تصير كمية الإرجاع', () => {
  const srn = deriveDocument(QC_WITH_REJECTS, 'SRN');
  assert.equal(srn.type, 'SRN');
  assert.equal(srn.lines.length, 2, 'المرفوضان فقط (A وC)، لا المقبول B');
  const a = srn.lines.find((l) => l.sku === 'A');
  assert.equal(a.qty, 3, 'الكمية المرفوضة جودةً تصير كمية الإشعار');
  assert.equal(a.reason, 'تالف');
  assert.equal(a.batch, 'L1', 'التشغيلة تُنقل مع المرفوض');
  assert.equal(a.expiry, '2026-12-01');
  assert.ok(!srn.lines.some((l) => l.sku === 'B'), 'الصنف المقبول لا يظهر في إشعار الرفض');
});

test('SRN يرث المورّد ورقمَي الاستلام وأمر الشراء (رقم الاستلام لا رقم الفحص)', () => {
  const srn = deriveDocument(QC_WITH_REJECTS, 'SRN');
  assert.equal(srn.header.supplier, 'مورّد المشارق');
  assert.equal(srn.header.poRef, 'PO-2026-0007');
  assert.equal(srn.header.grnRef, 'GRN-2026-0001', 'رقم الاستلام (من الروابط الموروثة) لا رقم الفحص');
  assert.equal(srn.links.QC.id, 'qc1', 'رابط الفحص محفوظ للتتبّع');
  assert.equal(srn.links.GRN.id, 'grn1', 'ورابط الاستلام موروث عبر الفحص');
});

test('SRN توثيقيّ فقط — لا أثر مخزنيّ (فحص الجودة عزل المرفوض أصلًا)', () => {
  assert.equal(movesStock('SRN'), false);
});

test('أب SRN المرجعيّ في المخطّط يبقى مذكرة الاستلام (حقل grnRef)', () => {
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
  assert.deepEqual(REJECTION_CHAIN, ['QC', 'SRN'], 'الرفض صار مشتقًّا من الفحص');
});

test('POD يُنجزه فريق الحركة (fleet) — لخصم رصيد المركبة', () => {
  assert.ok(getSchema('POD').roles.complete.includes('fleet'));
});
