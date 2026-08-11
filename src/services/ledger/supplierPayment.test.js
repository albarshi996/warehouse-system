/**
 * اختبارات سند سداد المورّد (م٤-ب · يكمل سدّ ف‑١ من طرف الدائنين).
 *
 * ويحرس تمييزه عن `PV`: ذاك صرفُ خزينةٍ في دورة المشتريات الداخلية بمرجعٍ
 * إلزاميّ لأمرٍ داخليّ، وهذا سدادُ مورّدٍ خارجيّ. ولو خلطناهما لاختلط «ما علينا
 * للموردين» بمصروفات الإدارات.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import SCHEMAS, { GOVERNED_FORMS, readyTypes } from '../documents/schemas/index.js';
import { lineAmount, paymentTotal, spvWarnings } from '../documents/schemas/spv.js';
import { chainFor } from '../documents/chain.js';
import { classOf } from '../documents/timeFields.js';
import { odooTargetFor, docToOdooValues } from '../odoo/docCrosswalk.js';
import { findMoneyFields } from '../odoo/moneyFields.js';

const doc = (header = {}, lines = []) => ({ id: 'S1', type: 'SPV', number: 'SPV-2026-0001', header, lines });

test('الحساب: مبلغ البند ومجموع التوزيع', () => {
  assert.equal(lineAmount({ amount: 400.75 }), 400.75);
  assert.equal(lineAmount(null), 0);
  assert.equal(paymentTotal([{ amount: 400 }, { amount: 100.5 }]), 500.5);
  assert.equal(paymentTotal(null), 0);
});

test('★★ فرق التوزيع مالٌ بلا وجهة — مرآةُ سند القبض', () => {
  const w = spvWarnings(doc({ supplier: 'مختبرات الخليج', amountPaid: 1000 }, [{ docRef: 'PO-1', amount: 700 }]));
  assert.ok(w.some((m) => /مالٌ بلا وجهة/.test(m)));
  assert.ok(w.some((m) => /300/.test(m)));
});

test('★ سدادٌ واحد يُقاصّ أمرًا وفاتورةً معًا', () => {
  const w = spvWarnings(
    doc({ supplier: 'مورّد', amountPaid: 1000 }, [
      { docRef: 'PO-1', amount: 600 },
      { docRef: 'INV-9', amount: 400 },
    ])
  );
  assert.deepEqual(w, []);
});

test('★ لا يُسدَّد لمجهول، والشيك بلا مرجعٍ يُبلَّغ، والسالب مرفوض', () => {
  assert.ok(spvWarnings(doc({ amountPaid: 100 }, [{ amount: 100 }])).some((m) => /مجهول/.test(m)));
  assert.ok(
    spvWarnings(doc({ supplier: 'م', paymentMethod: 'تحويل مصرفي', amountPaid: 100 }, [{ amount: 100 }]))
      .some((m) => /رقم مرجعي/.test(m))
  );
  assert.ok(spvWarnings(doc({ supplier: 'م', amountPaid: -1 }, [{ amount: -1 }])).some((m) => /سالب/.test(m)));
  assert.ok(spvWarnings(doc({ supplier: 'م' }, [])).some((m) => /صفر/.test(m)));
});

test('★★ مسجَّلٌ في السجلّات الخمسة — لا نصفَ تسجيل', () => {
  assert.ok(SCHEMAS.SPV, 'سجلّ المخطّطات');
  assert.ok(readyTypes().includes('SPV'), 'الأنواع الجاهزة');
  assert.ok(GOVERNED_FORMS.some((f) => f.type === 'SPV' && f.ready), 'خارطة النماذج');
  assert.equal(classOf('SPV', 'paymentDate'), 'event', 'الحقول الزمنيّة');
  assert.equal(classOf('SPV', 'docDate'), 'reference', 'وتاريخ الأمر منقولٌ لا ختم');
  assert.ok(odooTargetFor('SPV'), 'عبور أودو');
});

test('★ خارج السلاسل كنظيره — يُقاصّ أمرًا أو أكثر', () => {
  assert.equal(chainFor('SPV'), null);
});

test('★★ ليس نسخةً من PV: ذاك للمشتريات الداخلية وهذا للمورّد الخارجيّ', () => {
  assert.ok(SCHEMAS.PV, 'وكلاهما قائم');
  assert.ok(SCHEMAS.SPV);
  // PV يشترط مرجعًا لأمرٍ داخليّ؛ SPV لا يشترط — سدادُ المورّد قد يسبق الفاتورة.
  const pvHeader = SCHEMAS.PV.sections[0].fields.find((f) => f.key === 'ipoRef');
  assert.equal(pvHeader.required, true, 'لا صرفَ داخليًّا بلا أمرٍ معتمَد');
  const spvKeys = SCHEMAS.SPV.sections[0].fields.map((f) => f.key);
  assert.ok(!spvKeys.includes('ipoRef'), 'وسداد المورّد لا يمرّ بأمرٍ داخليّ');
  assert.ok(spvKeys.includes('supplier'));
});

test('★ من صرف المال لا يعتمد صرفه', () => {
  const roles = SCHEMAS.SPV.roles;
  assert.ok(roles.create.includes('treasury'));
  assert.ok(roles.approve.includes('finance_manager'));
  assert.ok(!roles.approve.includes('treasury'));
  assert.ok(!roles.approve.includes('purchase_officer'), 'ولا المشتريات تعتمد سدادها');
});

test('★★ ولا يُسرّب مالًا إلى أودو', () => {
  const values = docToOdooValues(
    doc({ supplier: 'م', amountPaid: 1000, paymentMethod: 'شيك' }, [{ docRef: 'PO-1', amount: 1000, docTotal: 5000 }])
  );
  assert.deepEqual(findMoneyFields(values), []);
});
