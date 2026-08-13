/**
 * اختبارات جدول العبور — وفي مقدّمتها **حارس الشمول**: أيّ نوع مستندٍ يُضاف
 * لمحرّك المستندات بلا صفّ عبورٍ لأودو يُفشل هذا الاختبار فورًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { readyTypes } from '../documents/schemas/index.js';
import { DOC_ODOO_MAP, odooTargetFor, coveredTypes, docToOdooValues, refText } from './docCrosswalk.js';

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

/* ═══════════ مرجع السلسلة نصًّا — لا «[object Object]» أبدًا ═══════════ */

test('★★ رابط المستند كائنٌ لا نصّ — ومرجعُ أودو لا يقبل حشوًا', () => {
  // العطب الذي ظهر حيًّا على سجلّ TRN (لقطة المالك 2026-08-13): كان
  // `String(link)` يُخزّن «[object Object]» في أودو، فيصير نصًّا فاسدًا
  // لا يُصلحه تشديدُ العرض. الرقم أولى من المعرّف لأنّه ما يقرؤه الإنسان.
  const withLink = docToOdooValues({
    type: 'TRN',
    number: 'TRN-2026-0001',
    header: {},
    links: { TR: { id: 'abc123', number: 'TR-2026-0013' } },
  });
  assert.equal(withLink.origin, 'TR-2026-0013');
  assert.doesNotMatch(withLink.origin, /\[object/);

  // ورابطٌ بلا رقم يسقط إلى المعرّف، لا إلى حشو.
  const idOnly = docToOdooValues({ type: 'TRN', number: 'x', header: {}, links: { TR: { id: 'abc123' } } });
  assert.equal(idOnly.origin, 'abc123');

  // والنصّ يبقى كما هو (توافقٌ رجعيّ مع الروابط القديمة).
  const asText = docToOdooValues({ type: 'TRN', number: 'x', header: {}, links: { TR: 'TR-9' } });
  assert.equal(asText.origin, 'TR-9');

  // والفراغ فراغ — لا «undefined» ولا «null» ولا حشو.
  const empty = docToOdooValues({ type: 'TRN', number: 'x', header: {}, links: {} });
  assert.equal(empty.origin, '');
});

test('★ refText لا تُخرج حشوًا مهما كان المدخل', () => {
  assert.equal(refText({ id: 1, number: 'PO-1' }), 'PO-1');
  assert.equal(refText([7, 'TR/OUT/001']), 'TR/OUT/001'); // شكل أودو العلاقيّ
  assert.equal(refText({}), '');
  assert.equal(refText({ deep: { deeper: 1 } }), '');
  for (const bad of [null, undefined, false, 0, '', {}, []]) {
    assert.doesNotMatch(refText(bad), /\[object/, `«${String(bad)}» أنتج حشوًا`);
  }
});

test('★★ ولا مخطِّطَ دفعٍ واحد يُخرج «[object Object]» في أيّ حقل', () => {
  // حارسٌ شامل: مستندٌ محشوٌّ بروابط كائنيّة في كلّ نوع محكوم.
  for (const type of Object.keys(DOC_ODOO_MAP)) {
    const values = docToOdooValues({
      type,
      number: `${type}-1`,
      header: { supplier: 'م', poRef: { id: 'i', number: 'PO-1' } },
      links: { PO: { id: 'i', number: 'PO-1' }, GRN: { id: 'j' } },
      lines: [{ sku: 'S1', qty: 2 }],
    });
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string') {
        assert.doesNotMatch(value, /\[object/, `${type}.${key} يحمل حشوًا`);
      }
    }
  }
});
