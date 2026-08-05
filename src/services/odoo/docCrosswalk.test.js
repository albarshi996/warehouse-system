/**
 * اختبارات جدول العبور — وفي مقدّمتها **حارس الشمول**: أيّ نوع مستندٍ يُضاف
 * لمحرّك المستندات بلا صفّ عبورٍ لأودو يُفشل هذا الاختبار فورًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { readyTypes } from '../documents/schemas/index.js';
import { DOC_ODOO_MAP, odooTargetFor, coveredTypes, docToOdooValues } from './docCrosswalk.js';

test('حارس الشمول: كلّ نوعٍ محكوم في المحرّك له صفّ عبورٍ لأودو', () => {
  const missing = readyTypes().filter((t) => !DOC_ODOO_MAP[t]);
  assert.deepEqual(
    missing,
    [],
    `أنواعٌ بلا تخطيط أودو: ${missing.join(', ')} — أضف صفوفها في docCrosswalk.js`
  );
});

test('حارس الاتجاه المعاكس: لا صفّ عبورٍ لنوعٍ غير موجود في المحرّك', () => {
  const ready = new Set(readyTypes());
  const orphans = coveredTypes().filter((t) => !ready.has(t));
  assert.deepEqual(orphans, [], `صفوف عبورٍ يتيمة: ${orphans.join(', ')}`);
});

test('كلّ صفٍّ مكتمل: نموذج + حالة اعتماد + تسمية + فعل', () => {
  for (const [type, row] of Object.entries(DOC_ODOO_MAP)) {
    assert.ok(row.model && row.model.includes('.'), `${type}: نموذج أودو ناقص/غير صالح`);
    assert.ok(row.confirmState, `${type}: حالة الاعتماد ناقصة`);
    assert.ok(row.confirmLabel, `${type}: تسمية الاعتماد ناقصة`);
    assert.ok(row.verb, `${type}: فعل الاعتماد ناقص`);
  }
});

test('odooTargetFor: يعيد الصفّ للنوع المعروف و null للمجهول', () => {
  assert.equal(odooTargetFor('PO').model, 'purchase.order');
  assert.equal(odooTargetFor('CN').model, 'account.move');
  assert.equal(odooTargetFor('XYZ'), null);
});

test('docToOdooValues: الظرف المشترك — draft دائمًا + رقم المصدر ونوعه', () => {
  const v = docToOdooValues({
    type: 'DN',
    number: 'DN-2026-0009',
    header: { customer: 'فرع طرابلس', warehouse: 'الرئيسي', issueDate: '2026-08-01' },
    lines: [{ sku: 'bz-1', description: 'صنف', qty: 10, unitPrice: 5 }],
  });
  assert.equal(v.state, 'draft');
  assert.equal(v.x_source_type, 'DN');
  assert.equal(v.x_source_number, 'DN-2026-0009');
  assert.equal(v.x_customer, 'فرع طرابلس');
  assert.equal(v.line_ids.length, 1);
  assert.equal(v.line_ids[0].product_code, 'BZ-1');
  assert.equal(v.line_ids[0].quantity, 10);
});

test('docToOdooValues: يلتقط أصل السلسلة من links أو حقول *Ref', () => {
  const fromLinks = docToOdooValues({ type: 'GRN', links: { PO: 'PO-2026-0007' }, header: {} });
  assert.equal(fromLinks.origin, 'PO-2026-0007');
  const fromHeader = docToOdooValues({ type: 'CN', header: { retRef: 'RET-2026-0002' } });
  assert.equal(fromHeader.origin, 'RET-2026-0002');
});

test('docToOdooValues: يلتقط كمّيات بأسمائها المختلفة (qtyReceived/qtyOrdered…)', () => {
  const v = docToOdooValues({
    type: 'GRN',
    header: {},
    lines: [{ sku: 'a', qtyReceived: 7 }, { sku: 'b', qtyOrdered: 3 }],
  });
  assert.equal(v.line_ids[0].quantity, 7);
  assert.equal(v.line_ids[1].quantity, 3);
});
