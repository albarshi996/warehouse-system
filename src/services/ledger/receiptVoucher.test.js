/**
 * اختبارات سند القبض (م٤-أ · يسدّ ف‑١ جزئيًّا).
 *
 * الحارس الأهمّ: **فرق التوزيع**. مبلغٌ مقبوضٌ لا يساوي مجموع ما وُزّع على
 * الفواتير يعني مالًا بلا وجهة — يظهر في الخزينة ولا يُقفل ذمّة، فيبقى العميل
 * مدينًا بما دفعه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import SCHEMAS, { GOVERNED_FORMS, readyTypes } from '../documents/schemas/index.js';
import { lineAmount, receiptTotal, rcpWarnings } from '../documents/schemas/rcp.js';
import { chainFor } from '../documents/chain.js';
import { classOf } from '../documents/timeFields.js';
import { odooTargetFor } from '../odoo/docCrosswalk.js';
import { findMoneyFields } from '../odoo/moneyFields.js';
import { docToOdooValues } from '../odoo/docCrosswalk.js';

const doc = (header = {}, lines = []) => ({ id: 'R1', type: 'RCP', number: 'RCP-2026-0001', header, lines });

/* ═══════════ ١. الحساب ═══════════ */

test('مبلغ البند ومجموع التوزيع', () => {
  assert.equal(lineAmount({ amount: 250.5 }), 250.5);
  assert.equal(lineAmount({}), 0);
  assert.equal(lineAmount(null), 0);
  assert.equal(receiptTotal([{ amount: 100 }, { amount: 50.25 }]), 150.25);
  assert.equal(receiptTotal([]), 0);
  assert.equal(receiptTotal(null), 0);
});

/* ═══════════ ٢. فرق التوزيع ═══════════ */

test('★★ مالٌ بلا وجهة: المقبوض لا يساوي مجموع التوزيع', () => {
  const w = rcpWarnings(
    doc({ payer: 'بقالة النور', amountReceived: 500 }, [{ invoiceRef: 'INV-1', amount: 300 }])
  );
  assert.ok(w.some((m) => /مالٌ بلا وجهة/.test(m)));
  assert.ok(w.some((m) => /200/.test(m)), 'والفرق يُذكر بالرقم لا بالوصف');
});

test('★ والتطابق يمرّ — ولو على عدّة فواتير', () => {
  const w = rcpWarnings(
    doc({ payer: 'بقالة', amountReceived: 500 }, [
      { invoiceRef: 'INV-1', amount: 300 },
      { invoiceRef: 'INV-2', amount: 200 },
    ])
  );
  assert.deepEqual(w, [], 'دفعةٌ واحدة تُسدّد فاتورتين — وهو أصل تصميم البنود');
});

test('فرقٌ أقلّ من قرشٍ لا يُبلَّغ — التقريب ليس خطأً', () => {
  const w = rcpWarnings(doc({ payer: 'ب', amountReceived: 100 }, [{ amount: 99.999 }]));
  assert.equal(w.filter((m) => /بلا وجهة/.test(m)).length, 0);
});

/* ═══════════ ٣. بقيّة الحرّاس ═══════════ */

test('★ لا يُقبض من مجهول', () => {
  assert.ok(rcpWarnings(doc({ amountReceived: 100 }, [{ amount: 100 }])).some((m) => /مجهول/.test(m)));
  assert.ok(!rcpWarnings(doc({ customerCode: 'C-1', amountReceived: 100 }, [{ amount: 100 }])).some((m) => /مجهول/.test(m)));
});

test('★ الشيك والتحويل بلا مرجعٍ يُبلَّغان', () => {
  const w = rcpWarnings(doc({ payer: 'ب', paymentMethod: 'شيك', amountReceived: 100 }, [{ amount: 100 }]));
  assert.ok(w.some((m) => /رقم مرجعي/.test(m)));

  const cash = rcpWarnings(doc({ payer: 'ب', paymentMethod: 'نقدًا', amountReceived: 100 }, [{ amount: 100 }]));
  assert.ok(!cash.some((m) => /رقم مرجعي/.test(m)), 'والنقد لا مرجع له');
});

test('★ مبلغٌ سالب: المرتجع إشعارٌ دائن لا سند قبض', () => {
  const w = rcpWarnings(doc({ payer: 'ب', amountReceived: -50 }, [{ amount: -50 }]));
  assert.ok(w.some((m) => /سالب/.test(m)));
});

test('قبضٌ بصفرٍ يُبلَّغ', () => {
  assert.ok(rcpWarnings(doc({ payer: 'ب' }, [])).some((m) => /صفر/.test(m)));
});

/* ═══════════ ٤. التسجيل في السجلّات الخمسة ═══════════ */

test('★★ سند القبض مسجَّلٌ في كلّ سجلٍّ يلزمه — وإلّا عمل نصفَ عمل', () => {
  // خمسة سجلّات تفترق بسهولة، وكلّ افتراقٍ عطبٌ صامت.
  assert.ok(SCHEMAS.RCP, 'سجلّ المخطّطات');
  assert.ok(readyTypes().includes('RCP'), 'الأنواع الجاهزة');
  assert.ok(GOVERNED_FORMS.some((f) => f.type === 'RCP' && f.ready), 'خارطة النماذج المحكومة');
  assert.equal(classOf('RCP', 'receiptDate'), 'event', 'تصنيف الحقول الزمنيّة');
  assert.ok(odooTargetFor('RCP'), 'جدول عبور أودو');
});

test('★ تاريخ الفاتورة المقاصَّة منقولٌ لا ختمُ واقعة', () => {
  // ختمُه بزمن القبض يعرض تاريخ فاتورةٍ كاذبًا تحت تسميةٍ صادقة.
  assert.equal(classOf('RCP', 'invoiceDate'), 'reference');
});

test('★★ خارج السلاسل عمدًا — يُقاصّ فاتورةً أو أكثر، والسلسلة تفترض أبًا واحدًا', () => {
  assert.equal(chainFor('RCP'), null);
});

test('★ الاعتماد للمالي لا للقابض — من قبض المال لا يعتمد قبضه', () => {
  const roles = SCHEMAS.RCP.roles;
  assert.ok(roles.create.includes('treasury'));
  assert.ok(roles.create.includes('sales_rep'), 'والمندوب يقبض في الميدان');
  assert.ok(roles.approve.includes('finance_manager'));
  assert.ok(!roles.approve.includes('treasury'), 'الخزينة لا تعتمد قبضها');
  assert.ok(!roles.approve.includes('sales_rep'), 'ولا المندوب');
});

/* ═══════════ ٥. حدّ المال قائم (م١-ب) ═══════════ */

test('★★ ولا يُسرّب مالًا إلى أودو رغم أنّه مستندٌ ماليّ بحت', () => {
  // أخطر حالةٍ لحدّ المال: مستندٌ كلّه أرقام. والقاعدة تبقى — أودو يولّد القيد.
  const values = docToOdooValues(
    doc({ payer: 'ب', amountReceived: 500, paymentMethod: 'نقدًا' }, [
      { invoiceRef: 'INV-1', amount: 300, invoiceTotal: 1000 },
    ])
  );
  assert.deepEqual(findMoneyFields(values), [], 'تسرّب حقل مال');
});
