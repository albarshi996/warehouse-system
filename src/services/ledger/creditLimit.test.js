/**
 * اختبارات حدّ الائتمان (م٤-د · يسدّ ف‑٢).
 *
 * معيار الإتمام في الخطة: **«البيع لعميل تجاوز سقفه يُمنع»** — وهو هنا مربوطًا
 * برصيدٍ حقيقيٍّ من الدفتر لا بلقطة إكسل. والاختبار المقابل لا يقلّ أهمّيّة:
 * **غيابُ السقف لا يمنع أحدًا** — نظامٌ يمنع بيعًا لأنّه يجهل رصيدًا يوقف تجارة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { balanceOf, limitOf, documentExposure, creditCheck, customerExposure } from './creditGuard.js';
import { entriesFrom } from './partnerLedger.js';

const inv = (id, code, total, date) => ({
  id, type: 'INV', number: `INV-${id}`, state: 'done',
  header: { customerCode: code, invoiceDate: date },
  lines: [{ qty: 1, unitPrice: total }],
});
const rcp = (id, code, amount, date) => ({
  id, type: 'RCP', number: `RCP-${id}`, state: 'done',
  header: { customerCode: code, receiptDate: date, amountReceived: amount },
  lines: [{ invoiceRef: 'INV-1', amount }],
});
/** مستندٌ قيد الإعداد — لم يُقيَّد بعد، وهو ما نحكم عليه. */
const newSale = (code, total) => ({
  id: 'new', type: 'INV', state: 'draft',
  header: { customerCode: code },
  lines: [{ qty: 1, unitPrice: total }],
});

const LEDGER = entriesFrom([
  inv('1', 'C-1', 1000, '2026-08-01'),
  rcp('2', 'C-1', 300, '2026-08-05'),
  inv('3', 'C-2', 200, '2026-08-06'),
]);

/* ═══════════ ١. الرصيد الحقيقيّ ═══════════ */

test('★ الرصيد من الدفتر لا من لقطة إكسل', () => {
  assert.equal(balanceOf(LEDGER, 'C-1'), 700, '١٠٠٠ فاتورة ناقص ٣٠٠ قبض');
  assert.equal(balanceOf(LEDGER, 'c-1'), 700, 'الحرف الصغير يطابق');
  assert.equal(balanceOf(LEDGER, 'C-2'), 200);
  assert.equal(balanceOf(LEDGER, 'C-9'), 0, 'طرفٌ بلا سطور');
  assert.equal(balanceOf(LEDGER, 'C-9', 150), 150, 'وافتتاحيّه إن وُجد');
  assert.equal(balanceOf([], 'C-1'), 0);
});

test('limitOf: الغياب والسالب والنصّ = لا سقف', () => {
  assert.equal(limitOf({ creditLimit: 5000 }), 5000);
  assert.equal(limitOf({ creditLimit: 0 }), 0);
  assert.equal(limitOf({ creditLimit: -100 }), 0);
  assert.equal(limitOf({}), 0);
  assert.equal(limitOf(null), 0);
});

test('documentExposure: ما يزيد الذمّة وحده يُحسب', () => {
  assert.equal(documentExposure(newSale('C-1', 500)), 500);
  assert.equal(documentExposure(rcp('9', 'C-1', 500, '2026-08-09')), 0, 'القبض ينقص لا يزيد');
  assert.equal(documentExposure({ type: 'PICK' }), 0, 'ما لا أثر ماليَّ له');
});

/* ═══════════ ٢. المنع الحقيقيّ ═══════════ */

test('★★ البيع لعميل تجاوز سقفه يُمنع — معيار الإتمام', () => {
  const r = creditCheck({
    doc: newSale('C-1', 500),
    entries: LEDGER,
    partner: { creditLimit: 1000 },
    role: 'sales_rep',
  });
  assert.equal(r.verdict, 'block');
  assert.equal(r.ok, false);
  assert.equal(r.balance, 700);
  assert.equal(r.after, 1200);
  assert.match(r.message, /تجاوز/);
  assert.match(r.message, /700/, 'والرسالة تحمل الرقم لا الوصف وحده');
});

test('★★ ويُفحص الرصيد **بعد** الإضافة لا قبلها', () => {
  // العطب الشائع: ٧٠٠ < ١٠٠٠ فيمرّ بيعٌ بـ٥٠٠ يجعله ١٢٠٠.
  const r = creditCheck({ doc: newSale('C-1', 500), entries: LEDGER, partner: { creditLimit: 1000 }, role: 'sales_rep' });
  assert.equal(r.ok, false);
  const small = creditCheck({ doc: newSale('C-1', 100), entries: LEDGER, partner: { creditLimit: 1000 }, role: 'sales_rep' });
  assert.equal(small.ok, true, 'وما لا يتجاوز يمرّ');
});

test('★ الإنذار عند الاقتراب — ولا يمنع', () => {
  const r = creditCheck({ doc: newSale('C-1', 200), entries: LEDGER, partner: { creditLimit: 1000 }, role: 'sales_rep' });
  assert.equal(r.verdict, 'warn', '٩٠٠ من ١٠٠٠ = ٩٠٪');
  assert.equal(r.ok, true);
  assert.equal(r.usedPct, 90);
});

test('★★ ويفكّه المدير المالي وحده', () => {
  const args = { doc: newSale('C-1', 500), entries: LEDGER, partner: { creditLimit: 1000 } };
  assert.equal(creditCheck({ ...args, role: 'sales_rep' }).ok, false);
  assert.equal(creditCheck({ ...args, role: 'sales_supervisor' }).ok, false, 'ولا المشرف');
  assert.equal(creditCheck({ ...args, role: 'finance_manager' }).ok, true);
  assert.equal(creditCheck({ ...args, role: 'admin' }).ok, true);
  assert.equal(creditCheck({ ...args, role: 'finance_manager' }).verdict, 'block', 'ويبقى الحكم ظاهرًا وإن فُكّ');
});

/* ═══════════ ٣. ما لا يُمنع ═══════════ */

test('★★ سقفٌ غير مُدخَلٍ لا يمنع أحدًا (القسم ٦ من الخطة)', () => {
  const r = creditCheck({ doc: newSale('C-1', 99999), entries: LEDGER, partner: { creditLimit: 0 }, role: 'sales_rep' });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'ok');
});

test('★★ وعميلٌ غير موجودٍ في الماستر لا يُمنع — لا نمنع بسبب جهلنا', () => {
  const r = creditCheck({ doc: newSale('C-9', 99999), entries: LEDGER, partner: null, role: 'sales_rep' });
  assert.equal(r.ok, true);
});

test('★ ولا يُحاكَم ما لا يزيد ذمّةً: القبض والاستلام والسحب', () => {
  for (const doc of [rcp('9', 'C-1', 100, '2026-08-09'), { type: 'GRN', header: { supplierCode: 'S-1' }, lines: [] }, { type: 'PICK', header: {} }]) {
    assert.equal(creditCheck({ doc, entries: LEDGER, partner: { creditLimit: 1 }, role: 'sales_rep' }).ok, true);
  }
});

test('مستندٌ بلا عميلٍ لا سقف له', () => {
  const r = creditCheck({ doc: { type: 'INV', header: {}, lines: [{ qty: 1, unitPrice: 9999 }] }, entries: LEDGER, partner: { creditLimit: 1 } });
  assert.equal(r.ok, true);
});

/* ═══════════ ٤. السياسة تحكم ═══════════ */

test('★ تعطيل الائتمان من الشاشة يُلغي المنع', () => {
  const off = { credit: { enforce: 'off' } };
  const r = creditCheck({ doc: newSale('C-1', 5000), entries: LEDGER, partner: { creditLimit: 1000 }, settings: off, role: 'sales_rep' });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'ok');
});

test('★ و«إنذارٌ بلا منع» يُبقي التحذير ويرفع الحاجز', () => {
  const warn = { credit: { enforce: 'warn' } };
  const r = creditCheck({ doc: newSale('C-1', 5000), entries: LEDGER, partner: { creditLimit: 1000 }, settings: warn, role: 'sales_rep' });
  assert.equal(r.verdict, 'warn');
  assert.equal(r.ok, true);
});

test('★ وعتبة الإنذار تُقرأ من الإعدادات', () => {
  const early = { credit: { enforce: 'block', warnAtPct: 60 } };
  const r = creditCheck({ doc: newSale('C-1', 0), entries: LEDGER, partner: { creditLimit: 1000 }, settings: early, role: 'sales_rep' });
  assert.equal(r.verdict, 'warn', '٧٠٠ من ١٠٠٠ = ٧٠٪ يتجاوز ٦٠');
});

/* ═══════════ ٥. ما يُعرض قبل البيع ═══════════ */

test('★ مديونيّة العميل بلمحة — تُخبر ولا تمنع', () => {
  const e = customerExposure({ entries: LEDGER, partner: { creditLimit: 1000 }, partyCode: 'C-1' });
  assert.equal(e.balance, 700);
  assert.equal(e.limit, 1000);
  assert.equal(e.available, 300);
  assert.equal(e.usedPct, 70);
});

test('بلا سقفٍ لا مساحةَ تُحسب — ولا يُخترع رقم', () => {
  const e = customerExposure({ entries: LEDGER, partner: {}, partyCode: 'C-1' });
  assert.equal(e.limit, 0);
  assert.equal(e.available, null, 'null لا صفر — الصفر يعني «لا مساحة» وهو كذب');
});
