/**
 * اختبارات ملصق العميل — «تُسحب من أمر الصرف المعتمد» لا تُكتب.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOMER_LABEL_FIELDS,
  SEALED_FIELDS,
  buildAllCustomerLabels,
  buildCustomerLabel,
  customerLabelProblem,
  labelGaps,
  manualOverrideProblem,
} from './customerLabel.js';
import { closeParcel, openPacking, packLine, setParcelCount, cancelParcel } from './packingFlow.js';

const SHP = 'SHP-RH-20260827-000125';
const ORDER_DOC = {
  id: 'so-1',
  number: 'SO-2026-0044',
  state: 'approved',
  customerName: 'سوق المدينة',
  customerCode: 'C-9',
  destination: 'فرع الرحبة',
  route: 'R2',
  deliveryNotes: 'التسليم قبل الظهر',
};
const ORDER = {
  orderRef: 'SO-2026-0044',
  customerName: 'سوق المدينة',
  branch: 'RH',
  route: 'R2',
  warehouse: 'W01',
  state: 'PICKED',
  lines: [{ sku: 'WNW-001', description: 'ماء', uom: 'كرتون', qty: 4 }],
};

function packed() {
  let session = setParcelCount(openPacking(ORDER, { actor: 'u-1', at: 't0' }).session, 2, { shipment: SHP }).session;
  session = packLine(session, 1, { sku: 'WNW-001', qty: 2 }).session;
  session = packLine(session, 2, { sku: 'WNW-001', qty: 2 }).session;
  session = closeParcel(session, 1, { actor: 'u-1', at: 't1' }).session;
  session = closeParcel(session, 2, { actor: 'u-1', at: 't1' }).session;
  return session;
}

test('الحقول العشرة معلنةٌ في موضعٍ واحد', () => {
  assert.equal(CUSTOMER_LABEL_FIELDS.length, 10);
  assert.deepEqual(
    CUSTOMER_LABEL_FIELDS.map((f) => f.key).slice(0, 3),
    ['customerName', 'orderRef', 'shipment']
  );
});

test('★★ اسم العميل ورقم الطلب مختومان — تُسحب ولا تُكتب', () => {
  assert.deepEqual(SEALED_FIELDS, ['customerName', 'customerCode', 'orderRef']);
  const out = manualOverrideProblem({ customerName: 'عميلٌ آخر' });
  assert.match(out, /اسم العميل/);
  assert.match(out, /النصّ الحاكم يمنعه/);
  assert.equal(manualOverrideProblem({ route: 'R9' }), '', 'وخطّ السير ليس مختومًا');
  assert.equal(manualOverrideProblem(null), '');
});

test('★★ أمرٌ غير معتمَدٍ لا يُخرج ملصقًا — والحكم من محرّك المستندات نفسه', () => {
  const session = packed();
  assert.match(customerLabelProblem(session, 1, { order: { ...ORDER_DOC, state: 'draft' } }), /مسوّدة/);
  assert.match(customerLabelProblem(session, 1, { order: { ...ORDER_DOC, state: 'submitted' } }), /غير معتمَد/);
  assert.equal(customerLabelProblem(session, 1, { order: ORDER_DOC }), '');
  assert.match(customerLabelProblem(session, 1, {}), /لا أمر صرفٍ مرتبط/);
  assert.equal(buildCustomerLabel(session, 1, { order: { ...ORDER_DOC, state: 'draft' } }), null);
});

test('★ الملصق يحمل العشرة كلَّها من مصادرها', () => {
  const label = buildCustomerLabel(packed(), 1, { order: ORDER_DOC, at: '2026-08-27T12:00:00.000Z' });
  assert.equal(label.customerName, 'سوق المدينة');
  assert.equal(label.orderRef, 'SO-2026-0044');
  assert.equal(label.shipment, SHP);
  assert.equal(label.destination, 'فرع الرحبة');
  assert.equal(label.route, 'R2');
  assert.equal(label.parcelTotal, 2);
  assert.equal(label.ofTotal, '1 من 2');
  assert.equal(label.barcodeValue, `${SHP}-01`);
  assert.equal(label.preparedAt, '2026-08-27T12:00:00.000Z');
  assert.equal(label.instructions, 'التسليم قبل الظهر');
  assert.equal(label.qty, 2);
  assert.equal(label.branch, 'RH');
});

test('★ كلُّ طردٍ باركودٌ مستقلّ — وكلُّها ترتبط بالشحنة نفسها', () => {
  const { labels, problem } = buildAllCustomerLabels(packed(), { order: ORDER_DOC });
  assert.equal(problem, '');
  assert.equal(labels.length, 2);
  assert.deepEqual(labels.map((l) => l.barcodeValue), [`${SHP}-01`, `${SHP}-02`]);
  assert.equal(new Set(labels.map((l) => l.shipment)).size, 1, 'شحنةٌ واحدةٌ لكلّ الطرود');
  assert.deepEqual(labels.map((l) => l.ofTotal), ['1 من 2', '2 من 2']);
});

test('الطرد الملغى لا يُطبع له ملصق', () => {
  const session = cancelParcel(packed(), 2, { reason: 'تلف', actor: 'u', at: 't' }).session;
  const { labels } = buildAllCustomerLabels(session, { order: ORDER_DOC });
  assert.equal(labels.length, 1);
  assert.match(customerLabelProblem(session, 2, { order: ORDER_DOC }), /ملغًى/);
});

test('شحنةٌ بلا رقمٍ لا تُخرج ملصقًا', () => {
  const session = openPacking(ORDER, { actor: 'u', at: 't' }).session;
  assert.match(buildAllCustomerLabels(session, { order: ORDER_DOC }).problem, /رقم الشحنة مطلوب/);
});

test('★ النواقص تُعلَن ولا تمنع — التعليمات وخطّ السير اختياريّان', () => {
  const label = buildCustomerLabel(packed(), 1, { order: { ...ORDER_DOC, deliveryNotes: '', route: '' } });
  assert.deepEqual(labelGaps(label), [], 'الاختياريّ لا يُعدّ نقصًا');

  const bare = buildCustomerLabel(packed(), 1, { order: { ...ORDER_DOC, customerName: '', destination: '' } });
  const gaps = labelGaps(bare);
  assert.ok(gaps.includes('اسم العميل'));
  assert.ok(gaps.includes('الفرع أو عنوان التسليم'));
});

test('إعادة الطبع تُوسم على الملصق — والنسخة تُعدّ', () => {
  const session = packed();
  const withPrint = { ...session, parcels: session.parcels.map((p) => (p.no === 1 ? { ...p, labelCopies: 1 } : p)) };
  const label = buildCustomerLabel(withPrint, 1, { order: ORDER_DOC });
  assert.equal(label.reprint, true);
  assert.equal(label.copy, 2);
});
