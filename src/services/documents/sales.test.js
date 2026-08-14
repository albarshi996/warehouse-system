/**
 * اختبارات دورة المبيعات (الجلسة ٢) — منطق خالص، بلا Firestore.
 *
 * تُثبت: أمر البيع يرأس الصادر · إذن التسليم يتفرّع (تصريح + فاتورة) · السعر
 * يركب من الأمر حتى الفاتورة · حساب الفاتورة (فرعيّ · ضريبة · إجمالي) · وأن
 * أمر البيع والفاتورة لا يحرّكان مخزونًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTBOUND_CHAIN,
  BILLING_CHAIN,
  derivationTargets,
  deriveDocument,
  nextInChain,
  previousInChain,
  chainFor,
  chainOf,
} from './chain.js';
import { getSchema } from './schemas/index.js';
import { movesStock } from '../ledger/postingRules.js';
import { lineTotal as soLineTotal, orderValue, salesOrderWarnings } from './schemas/so.js';
import { subtotal, taxAmount, grandTotal, invoiceWarnings } from './schemas/inv.js';

/* ───────────── بنية السلسلة ───────────── */

test('أمر البيع يرأس الصادر، والفوترة سلسلةٌ مستقلّة من إذن التسليم', () => {
  assert.deepEqual(OUTBOUND_CHAIN, ['SO', 'PICK', 'PACK', 'DN', 'GP']);
  assert.deepEqual(BILLING_CHAIN, ['DN', 'INV']);
  assert.equal(chainFor('SO'), OUTBOUND_CHAIN);
  assert.equal(chainFor('INV'), BILLING_CHAIN);
  assert.equal(previousInChain('INV'), 'DN', 'الفاتورة تُشتقّ من التسليم');
  assert.equal(nextInChain('INV'), null, 'الفاتورة تنهي الفوترة');
});

test('إذن التسليم يتفرّع: تصريح خروج وفاتورة وتأكيد تسليم ومرتجع عميل', () => {
  // SAP-10 (ف‑٤٨): أُضيف `RET` فرعًا رابعًا — به صار للمرتجع مسارٌ كمّيّ
  // تُحسب منه «الكمّيّة المؤهلة للإرجاع»، وعلاقته `RETURN` لا `BASE` فلا
  // يُحسب المرتجع تنفيذًا للتسليم.
  assert.deepEqual(derivationTargets('DN'), ['GP', 'INV', 'POD', 'RET']);
  assert.deepEqual(derivationTargets('SO'), ['PICK'], 'أمر البيع خطّيّ إلى السحب');
  assert.deepEqual(derivationTargets('GP'), [], 'التصريح ينهي مساره');
});

/* ───────────── اشتقاق أمر البيع ← السحب ───────────── */

const soDoc = {
  id: 'SO1',
  type: 'SO',
  number: 'SO-2026-0001',
  state: 'approved',
  header: { warehouse: 'E5', customer: 'متجر النور', customerCode: 'C-01' },
  lines: [
    { sku: 'A', description: 'صنف أ', qty: 12, unitPrice: 5, uom: 'علبة' },
    { sku: 'B', description: 'صنف ب', qty: 8, unitPrice: 3 },
  ],
};

test('SO ← PICK: الكمية تصير مطلوبة، والسعر والمستودع والعميل يُورَّثون', () => {
  const pick = deriveDocument(soDoc, 'PICK');
  assert.equal(pick.type, 'PICK');
  assert.equal(pick.header.warehouse, 'E5', 'مستودع الأمر يصير مصدر السحب');
  assert.equal(pick.header.destination, 'متجر النور', 'العميل يصير وجهة السحب');
  assert.equal(pick.lines[0].qtyRequested, 12, 'الكمية المطلوبة من الأمر');
  assert.equal(pick.lines[0].unitPrice, 5, 'السعر يركب مع البند');
  assert.equal(pick.links.SO.id, 'SO1');
  assert.equal(pick.links.SO.number, 'SO-2026-0001');
});

test('deriveDocument بلا وجهة صريحة يأخذ التالي الخطّي (SO → PICK)', () => {
  const pick = deriveDocument(soDoc);
  assert.equal(pick.type, 'PICK');
});

test('deriveDocument يرفض وجهةً غير مشروعة', () => {
  assert.throws(() => deriveDocument(soDoc, 'DN'), /ليس وجهة اشتقاقٍ صحيحة/);
});

/* ───────────── السعر يركب حتى الفاتورة ───────────── */

test('السعر يركب عبر السلسلة: PICK → PACK → DN، ثم DN → INV', () => {
  // نحاكي البنود كما تتراكم بالاشتقاق: السحب يحمل السعر.
  const pick = { id: 'P1', type: 'PICK', number: 'PICK-2026-0001', state: 'done',
    header: {}, links: { SO: { id: 'SO1', number: 'SO-2026-0001' } },
    lines: [{ sku: 'A', description: 'صنف أ', qtyPicked: 12, unitPrice: 5, uom: 'علبة' }] };
  const pack = deriveDocument(pick, 'PACK');
  assert.equal(pack.lines[0].unitPrice, 5, 'السعر ركب إلى التعبئة');

  const packDone = { ...pack, id: 'PK1', number: 'PACK-2026-0001', state: 'done' };
  const dn = deriveDocument(packDone, 'DN');
  assert.equal(dn.lines[0].unitPrice, 5, 'السعر ركب إلى إذن التسليم');
});

test('DN ← INV: الكمية المسلَّمة بسعرها، ومراجع التسليم وأمر البيع تُشتقّ', () => {
  const dn = {
    id: 'DN1', type: 'DN', number: 'DN-2026-0001', state: 'done',
    header: { customer: 'متجر النور', customerCode: 'C-01' },
    links: { SO: { id: 'SO1', number: 'SO-2026-0001' }, PACK: { id: 'PK1', number: 'PACK-2026-0001' } },
    lines: [{ sku: 'A', description: 'صنف أ', qty: 12, unitPrice: 5, uom: 'علبة' }],
  };
  const inv = deriveDocument(dn, 'INV');
  assert.equal(inv.type, 'INV');
  assert.equal(inv.lines[0].qty, 12, 'الكمية من التسليم (ما خرج فعلًا)');
  assert.equal(inv.lines[0].unitPrice, 5, 'السعر مورَّثٌ من الأمر');
  assert.equal(inv.header.deliveryRef, 'DN-2026-0001', 'مرجع التسليم من رقمه');
  assert.equal(inv.header.salesOrderRef, 'SO-2026-0001', 'مرجع أمر البيع من السلسلة');
  assert.equal(inv.header.customer, 'متجر النور');
  assert.equal(inv.links.DN.id, 'DN1');
});

test('chainOf للفاتورة يُظهر إذن التسليم قبلها', () => {
  const inv = { id: 'INV1', type: 'INV', number: 'INV-2026-0001', state: 'draft',
    links: { DN: { id: 'DN1', number: 'DN-2026-0001' } } };
  const related = [{ id: 'DN1', type: 'DN', number: 'DN-2026-0001', state: 'done', links: {} }];
  const c = chainOf(inv, related);
  assert.equal(c.before.length, 1);
  assert.equal(c.before[0].type, 'DN');
});

/* ───────────── حساب الفاتورة ───────────── */

test('حساب الفاتورة: فرعيّ ثم ضريبة ثم إجمالي، بخصمَي البند والفاتورة', () => {
  const doc = {
    header: { taxRate: 5, invoiceDiscount: 10 },
    lines: [
      { qty: 10, unitPrice: 4 },              // 40
      { qty: 5, unitPrice: 6, discount: 5 },  // 30 − 5 = 25
    ],
  };
  assert.equal(subtotal(doc.lines), 65, 'مجموع البنود بعد خصم البند');
  assert.equal(taxAmount(doc), 3.25, '5% من 65');
  assert.equal(grandTotal(doc), 65 + 3.25 - 10, 'الفرعي + الضريبة − خصم الفاتورة');
});

test('تحذيرات الفاتورة: بند بلا سعر · إجمالي غير موجب · لا مرجع تسليم', () => {
  const bad = { header: {}, lines: [{ qty: 3 }] };
  const w = invoiceWarnings(bad);
  assert.ok(w.some((m) => m.includes('بلا سعر')));
  assert.ok(w.some((m) => m.includes('غير موجب')));
  assert.ok(w.some((m) => m.includes('مرجع')));

  const ok = { header: { deliveryRef: 'DN-1' }, lines: [{ qty: 2, unitPrice: 5 }] };
  assert.equal(invoiceWarnings(ok).length, 0);
});

/* ───────────── حساب أمر البيع ───────────── */

test('حساب أمر البيع: إجمالي البند وقيمة الأمر', () => {
  assert.equal(soLineTotal({ qty: 12, unitPrice: 5 }), 60);
  assert.equal(orderValue(soDoc.lines), 12 * 5 + 8 * 3);
});

test('تحذيرات أمر البيع: لا مستودع مصدر ⇒ لا حجز', () => {
  const w = salesOrderWarnings({ header: {}, lines: [{ qty: 3, unitPrice: 2 }] });
  assert.ok(w.some((m) => m.includes('مستودع')));
});

/* ───────────── لا أثر مخزنيّ للمبيعات والفوترة ───────────── */

test('أمر البيع والفاتورة لا يحرّكان مخزونًا (لا قيد لهما)', () => {
  assert.equal(movesStock('SO'), false, 'أمر البيع يحجز لا يُحرّك');
  assert.equal(movesStock('INV'), false, 'الفاتورة أثرٌ ماليّ لا مخزنيّ');
});

/* ───────────── المخطّطان مسجّلان وسليمان ───────────── */

test('مخطّطا SO و INV مسجّلان بأقسامٍ وجدولٍ وتواقيع', () => {
  for (const t of ['SO', 'INV']) {
    const s = getSchema(t);
    assert.ok(s, `مخطّط ${t} غير مسجّل`);
    assert.equal(s.type, t);
    assert.ok(s.roles.create.length && s.roles.approve.length && s.roles.complete.length);
    assert.ok(s.sections.some((sec) => sec.kind === 'table'), `${t} بلا جدول بنود`);
    assert.equal(s.signatures.length, 3);
    assert.ok(typeof s.warnings === 'function');
  }
});
