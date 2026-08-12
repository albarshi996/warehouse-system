/**
 * اختبارات دفتر الذمم (م٤-ج · يسدّ ف‑١).
 *
 * معيار الإتمام في الخطة: **«المتبقّي يطابق مجموع السطور»** — وهو يُثبت هنا
 * لا يُقال. والاختبار الأدقّ بعده: المقاصّة **بالأقدم أوّلًا**، وإلّا ظهر دَينٌ
 * قديمٌ لم يعد قائمًا في تقرير الأعمار.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_RULES,
  AGING_BUCKETS,
  ledgerRuleFor,
  partyCodeOf,
  entryFor,
  entriesFrom,
  statement,
  balances,
  bucketOf,
  aging,
  closeoutEntry,
  invoiceOutstanding,
  overCollectionProblems,
} from './partnerLedger.js';
import SCHEMAS from '../documents/schemas/index.js';

const inv = (id, code, total, date, dueDate = '') => ({
  id, type: 'INV', number: `INV-${id}`, state: 'done',
  header: { customerCode: code, customer: 'بقالة النور', invoiceDate: date, dueDate },
  lines: [{ qty: 1, unitPrice: total }],
});

const rcp = (id, code, amount, date, ref = 'INV-1') => ({
  id, type: 'RCP', number: `RCP-${id}`, state: 'done',
  header: { customerCode: code, payer: 'بقالة النور', receiptDate: date, amountReceived: amount },
  lines: [{ invoiceRef: ref, amount }],
});

/* ═══════════ ١. جدول القواعد ═══════════ */

test('★ الجدول يجيب: ما الأثر الماليّ لهذا المستند؟', () => {
  assert.equal(ledgerRuleFor('INV').party, 'customer');
  assert.equal(ledgerRuleFor('INV').direction, 'debit');
  assert.equal(ledgerRuleFor('RCP').direction, 'credit');
  assert.equal(ledgerRuleFor('GRN').party, 'supplier');
  assert.equal(ledgerRuleFor('SPV').direction, 'credit');
  assert.equal(ledgerRuleFor('PICK'), null, 'ما لا أثر ماليَّ له لا يُقيَّد');
  assert.equal(ledgerRuleFor('لا نوع'), null);
});

test('★ كلّ نوعٍ في الجدول موجودٌ فعلًا في سجلّ المخطّطات', () => {
  // قاعدةٌ لنوعٍ لا وجود له تعني ذمّةً لا تُقيَّد أبدًا — وتبقى الفجوة مفتوحة.
  for (const type of Object.keys(LEDGER_RULES)) {
    assert.ok(SCHEMAS[type], `النوع ${type} في جدول الذمم ولا مخطّط له`);
  }
});

/* ═══════════ ٢. بناء السطر ═══════════ */

test('★★ الفاتورة تُنشئ مدينًا، والقبض يُنقصه', () => {
  const a = entryFor(inv('1', 'C-1', 1000, '2026-08-01'));
  assert.equal(a.direction, 'debit');
  assert.equal(a.amount, 1000);
  assert.equal(a.delta, 1000);

  const b = entryFor(rcp('2', 'C-1', 400, '2026-08-05'));
  assert.equal(b.direction, 'credit');
  assert.equal(b.delta, -400, 'السالب ينقص ما على الطرف');
});

test('★ بلا طرفٍ لا ذمّة — ولا نخترع طرفًا', () => {
  assert.equal(entryFor({ id: 'x', type: 'INV', header: {}, lines: [{ qty: 1, unitPrice: 10 }] }), null);
});

test('★ صفرٌ ليس ذمّة', () => {
  assert.equal(entryFor(inv('3', 'C-1', 0, '2026-08-01')), null);
});

test('★ المعرّف حتميّ — فإعادة القيد تكتب فوق نفسها ولا تُضاعف', () => {
  assert.equal(entryFor(inv('7', 'C-1', 100, '2026-08-01')).id, 'INV__7');
  assert.equal(entryFor(inv('7', 'C-1', 999, '2026-08-09')).id, 'INV__7', 'نفس المستند نفس المعرّف');
});

test('★ الاستلام يُذمّ به المورّد بالمقبول لا بالمستلَم كلّه', () => {
  const grn = {
    id: 'g1', type: 'GRN', number: 'GRN-1', state: 'done',
    header: { supplierCode: 'S-1', supplier: 'مختبرات الخليج', receivedAt: '2026-08-02' },
    lines: [{ qtyReceived: 100, qtyAccepted: 90, unitCost: 10 }],
  };
  const e = entryFor(grn);
  assert.equal(e.party, 'supplier');
  assert.equal(e.amount, 900, 'المرفوض لا يُذمّ به المورّد');
});

test('المسوّدة لا تُقيَّد — الذمّة تنشأ بالاعتماد لا بالكتابة', () => {
  const draft = { ...inv('9', 'C-1', 500, '2026-08-01'), state: 'draft' };
  assert.equal(entriesFrom([draft]).length, 0);
  assert.equal(entriesFrom([{ ...draft, state: 'approved' }]).length, 1);
});

test('partyCodeOf يقرأ الرمز من موضعه الصحيح لكلّ طرف', () => {
  assert.equal(partyCodeOf({ header: { customerCode: 'c-1' } }, 'customer'), 'C-1');
  assert.equal(partyCodeOf({ header: { payer: 'بقالة' } }, 'customer'), 'بقالة');
  assert.equal(partyCodeOf({ header: { supplier: 'مورّد' } }, 'supplier'), 'مورّد');
});

/* ═══════════ ٣. كشف الحساب ═══════════ */

test('★★ المتبقّي يطابق مجموع السطور — معيار الإتمام يُثبت لا يُقال', () => {
  const entries = entriesFrom([
    inv('1', 'C-1', 1000, '2026-08-01'),
    rcp('2', 'C-1', 400, '2026-08-05'),
    inv('3', 'C-1', 250, '2026-08-07'),
  ]);
  const s = statement(entries, { partyCode: 'C-1', opening: 100 });
  assert.equal(s.opening, 100);
  assert.equal(s.debit, 1250);
  assert.equal(s.credit, 400);
  assert.equal(s.closing, 950, '١٠٠ + ١٢٥٠ − ٤٠٠');
  assert.equal(s.balanced, true);
  assert.deepEqual(s.rows.map((r) => r.balance), [1100, 700, 950], 'الرصيد متراكمٌ سطرًا سطرًا');
});

test('★ الرصيد الافتتاحيّ نقطةُ بدايةٍ لا حقيقةٌ جارية — يُمرَّر ولا يُخلط', () => {
  const entries = entriesFrom([inv('1', 'C-1', 500, '2026-08-01')]);
  assert.equal(statement(entries, { partyCode: 'C-1' }).closing, 500, 'بلا افتتاحيّ');
  assert.equal(statement(entries, { partyCode: 'C-1', opening: 300 }).closing, 800);
});

test('كشفٌ بلا طرفٍ يعرض الكلّ، وطرفٌ بلا سطورٍ يعرض افتتاحيّه', () => {
  const entries = entriesFrom([inv('1', 'C-1', 500, '2026-08-01'), inv('2', 'C-2', 300, '2026-08-02')]);
  assert.equal(statement(entries).rows.length, 2);
  assert.equal(statement(entries, { partyCode: 'C-9', opening: 50 }).closing, 50);
});

test('السطور مرتّبةٌ زمنيًّا مهما ورد ترتيب المستندات', () => {
  const entries = entriesFrom([inv('2', 'C-1', 100, '2026-08-09'), inv('1', 'C-1', 100, '2026-08-01')]);
  assert.deepEqual(entries.map((e) => e.date), ['2026-08-01', '2026-08-09']);
});

/* ═══════════ ٤. الأرصدة ═══════════ */

test('★ أرصدة الأطراف: الأكبر مطلقًا أوّلًا — الدائن كالمدين في الانتباه', () => {
  const entries = entriesFrom([
    inv('1', 'C-1', 1000, '2026-08-01'),
    inv('2', 'C-2', 200, '2026-08-02'),
    rcp('3', 'C-1', 100, '2026-08-03'),
  ]);
  const b = balances(entries);
  assert.equal(b[0].partyCode, 'C-1');
  assert.equal(b[0].balance, 900);
  assert.equal(b[0].entries, 2);
  assert.equal(b[0].lastDate, '2026-08-03');
  assert.equal(b[1].balance, 200);
});

/* ═══════════ ٥. أعمار الديون ═══════════ */

test('الشرائح خمسٌ كما في الخطة', () => {
  assert.equal(AGING_BUCKETS.length, 5);
  assert.equal(bucketOf(-5), 'current', 'قبل الاستحقاق');
  assert.equal(bucketOf(0), 'current');
  assert.equal(bucketOf(1), 'd1_30');
  assert.equal(bucketOf(30), 'd1_30');
  assert.equal(bucketOf(31), 'd31_60');
  assert.equal(bucketOf(90), 'd61_90');
  assert.equal(bucketOf(91), 'over90');
  assert.equal(bucketOf(500), 'over90');
});

test('★★ المقاصّة بالأقدم أوّلًا — وإلّا ظهر دَينٌ قديمٌ لم يعد قائمًا', () => {
  const entries = entriesFrom([
    inv('1', 'C-1', 1000, '2026-05-01', '2026-05-01'), // قديمة جدًّا
    inv('2', 'C-1', 500, '2026-08-05', '2026-08-05'), // حديثة
    rcp('3', 'C-1', 1000, '2026-08-10'),
  ]);
  const [row] = aging(entries, '2026-08-11');
  assert.equal(row.total, 500, 'بقي المتبقّي وحده');
  assert.equal(row.buckets.over90, 0, 'القديمة سُدّدت بالكامل — فلا تظهر شيخوخةً كاذبة');
  assert.equal(row.buckets.d1_30, 500, 'والباقي حديث');
});

test('★ المقاصّة الجزئيّة تُبقي بقيّة الأقدم في شريحتها', () => {
  const entries = entriesFrom([
    inv('1', 'C-1', 1000, '2026-05-01', '2026-05-01'),
    rcp('2', 'C-1', 400, '2026-08-10'),
  ]);
  const [row] = aging(entries, '2026-08-11');
  assert.equal(row.total, 600);
  assert.equal(row.buckets.over90, 600);
});

test('★ فائض الدائن دفعةٌ مقدَّمة لا دَين', () => {
  const entries = entriesFrom([inv('1', 'C-1', 300, '2026-08-01'), rcp('2', 'C-1', 500, '2026-08-02')]);
  const [row] = aging(entries, '2026-08-11');
  assert.equal(row.total, 0);
  assert.equal(row.advance, 200);
});

test('★ تاريخ الاستحقاق يُقدَّم على تاريخ الفاتورة في حساب العمر', () => {
  // فاتورةٌ قديمةٌ بأجلٍ طويل ليست متأخّرة — ومن خلط الاثنين شيّخ دَينًا سليمًا.
  const entries = entriesFrom([inv('1', 'C-1', 100, '2026-05-01', '2026-09-01')]);
  const [row] = aging(entries, '2026-08-11');
  assert.equal(row.buckets.current, 100);
  assert.equal(row.buckets.over90, 0);
});

test('الأعمار لا تقرأ ساعة النظام — يُمرَّر اليوم صراحةً', () => {
  const entries = entriesFrom([inv('1', 'C-1', 100, '2026-05-01', '2026-05-01')]);
  assert.deepEqual(aging(entries, '2026-08-11'), aging(entries, '2026-08-11'));
  assert.equal(aging(entries, '')[0].buckets.current, 100, 'بلا يومٍ لا تشيخ');
});

/* ═══════════ ٦. التصفير ═══════════ */

test('★★ التصفير قيدٌ مضادّ لا محوٌ للقديم', () => {
  const e = closeoutEntry({
    partyCode: 'C-1', party: 'customer', partyName: 'بقالة',
    balance: 250, reason: 'إعفاءٌ باعتماد المدير', date: '2026-08-11', byName: 'المالي',
  });
  assert.equal(e.direction, 'credit');
  assert.equal(e.amount, 250);
  assert.equal(e.delta, -250);
  assert.equal(e.reason, 'إعفاءٌ باعتماد المدير');
  assert.equal(e.docType, 'CLOSEOUT');
});

test('★ ويُصفّر الدائن كما يُصفّر المدين', () => {
  const e = closeoutEntry({ partyCode: 'S-1', party: 'supplier', balance: -180, reason: 'ر', date: '2026-08-11' });
  assert.equal(e.direction, 'debit');
  assert.equal(e.delta, 180);
});

test('رصيدٌ صفرٌ لا يُصفَّر', () => {
  assert.equal(closeoutEntry({ partyCode: 'C-1', balance: 0, date: '2026-08-11' }), null);
});

test('★ والتصفير يدخل الكشف كسطرٍ عاديّ فيبقى الرصيد متّسقًا', () => {
  const entries = [
    ...entriesFrom([inv('1', 'C-1', 250, '2026-08-01')]),
    closeoutEntry({ partyCode: 'C-1', party: 'customer', balance: 250, reason: 'ر', date: '2026-08-11' }),
  ];
  const s = statement(entries, { partyCode: 'C-1' });
  assert.equal(s.closing, 0);
  assert.equal(s.balanced, true);
  assert.equal(s.rows.length, 2, 'والسطر الأصليّ باقٍ — لم يُمحَ');
});

// ═══ CC-302 — تاريخ التحصيل الميدانيّ والمفتوح لكلّ فاتورة ═══

test('★★ قيد RCV يحمل تاريخ التحصيل لا فراغًا — فلا يسبق السدادُ فاتورتَه', () => {
  const rcv = {
    id: 'rcv-1', type: 'RCV', number: 'RCV-5', state: 'done',
    header: { customerCode: 'C-1', customer: 'عميل', collectionDate: '2026-08-10' },
    lines: [{ invoiceRef: 'INV-7', amount: 300 }],
  };
  const entry = entryFor(rcv);
  assert.equal(entry.date, '2026-08-10', 'كان يُكتب فارغًا فيتقدّم كلُّ تحصيلٍ على فاتورته في الكشف');
  assert.equal(entry.delta, -300);
  assert.deepEqual(entry.allocations, [{ ref: 'INV-7', amount: 300 }]);
});

test('المفتوح لكلّ فاتورة: المقاصّات المسمّاة تُطرح من فاتورتها لا من الأقدم', () => {
  const entries = [
    { partyCode: 'C-1', direction: 'debit', docNumber: 'INV-7', docId: 'a', amount: 300, allocations: [] },
    { partyCode: 'C-1', direction: 'debit', docNumber: 'INV-9', docId: 'b', amount: 500, allocations: [] },
    { partyCode: 'C-1', direction: 'credit', docNumber: 'RCV-1', docId: 'c', amount: 400, allocations: [{ ref: 'INV-9', amount: 400 }] },
    // طرفٌ آخر لا يختلط
    { partyCode: 'C-2', direction: 'debit', docNumber: 'INV-8', docId: 'd', amount: 900, allocations: [] },
  ];
  const rows = invoiceOutstanding(entries, 'C-1');
  assert.deepEqual(rows, [
    { ref: 'INV-7', total: 300, paid: 0, remaining: 300 },
    { ref: 'INV-9', total: 500, paid: 400, remaining: 100 },
  ]);
});

test('★★ حارس التجاوز يمسك تحصيلًا فوق المفتوح وفاتورةً لا وجود لها', () => {
  const outstanding = [{ ref: 'INV-7', total: 300, paid: 200, remaining: 100 }];
  const doc = {
    lines: [
      { invoiceRef: 'INV-7', amount: 150 },   // يتجاوز المفتوح 100
      { invoiceRef: 'INV-404', amount: 50 },  // فاتورة مجهولة
      { invoiceRef: '', amount: 999 },        // بلا مرجع — له تحذير المخطّط لا هذا الحارس
    ],
  };
  const problems = overCollectionProblems(doc, outstanding);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /يتجاوز المفتوح 100/);
  assert.match(problems[1], /لا مدينَ مفتوحًا/);
  // تحصيلٌ داخل المفتوح يمرّ بلا كلمة.
  assert.deepEqual(overCollectionProblems({ lines: [{ invoiceRef: 'INV-7', amount: 100 }] }, outstanding), []);
});
