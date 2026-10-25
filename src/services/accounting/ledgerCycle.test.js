/**
 * اختبارُ الدورة الكاملة — القيدُ المزدوج يُعيد بناءَ **دفتر الذمم بأكمله** طرفًا
 * طرفًا بلا فرق (لا الدفعاتُ وحدها): فاتورة · استلام · قبض · سداد · إشعار.
 * هذا برهانُ «الدفترُ المحليّ يملك المحاسبة».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveLedgerEntry, deriveLedgerEntries } from './deriveEntries.js';
import { reconcileLedger } from './reconcile.js';

const D1 = '2026-10-21';
const D2 = '2026-10-25';
const PRE = '2026-10-05';

const inv = (id, code, total, date) => ({
  id, type: 'INV', number: `INV-${id}`, state: 'done',
  header: { customerCode: code, customer: 'بقالة النور', invoiceDate: date },
  lines: [{ qty: 1, unitPrice: total }],
});
const rcp = (id, code, amount, date) => ({
  id, type: 'RCP', number: `RCP-${id}`, state: 'done',
  header: { customerCode: code, payer: 'بقالة النور', receiptDate: date },
  lines: [{ invoiceRef: `INV-${id}`, amount }],
});
const cn = (id, code, total, date) => ({
  id, type: 'CN', number: `CN-${id}`, state: 'done',
  header: { customerCode: code, customer: 'بقالة النور', issueDate: date },
  lines: [{ qty: 1, unitPrice: total }],
});
const grn = (id, code, qty, cost, date) => ({
  id, type: 'GRN', number: `GRN-${id}`, state: 'done',
  header: { supplierCode: code, supplier: 'مورّد عامّ', invoiceDate: date },
  lines: [{ qtyAccepted: qty, unitCost: cost }],
});
const spv = (id, code, amount, date) => ({
  id, type: 'SPV', number: `SPV-${id}`, state: 'done',
  header: { supplierCode: code, paymentDate: date },
  lines: [{ amount }],
});

/* ═══════════ الاشتقاق لكلّ جهة ═══════════ */

test('★★ الفاتورة: مدينٌ ذمّةُ العميل، دائنٌ المبيعات', () => {
  const e = deriveLedgerEntry(inv('1', 'C-1', 5000, D1));
  assert.equal(e.lines[0].account, 'AR:C-1');
  assert.equal(e.lines[0].debit, 5000000);
  assert.equal(e.lines[1].account, 'SALES');
  assert.equal(e.lines[1].credit, 5000000);
});

test('★★ الاستلام: مدينٌ المخزون، دائنٌ ذمّةُ المورّد (يزيد ما نَدينه)', () => {
  const e = deriveLedgerEntry(grn('2', 'S-9', 3, 1000, D1));
  assert.equal(e.lines[0].account, 'AP:S-9');
  assert.equal(e.lines[0].credit, 3000000);
  assert.equal(e.lines[1].account, 'INVENTORY');
  assert.equal(e.lines[1].debit, 3000000);
});

test('★ الإشعار الدائن ينقص ذمّةَ العميل عبر مرتجعات المبيعات', () => {
  const e = deriveLedgerEntry(cn('3', 'C-1', 100, D1));
  assert.equal(e.lines[0].account, 'AR:C-1');
  assert.equal(e.lines[0].credit, 100000);
  assert.equal(e.lines[1].account, 'SALES_RETURNS');
  assert.equal(e.lines[1].debit, 100000);
});

/* ═══════════ صفرُ الفرق على الدورة كاملةً ═══════════ */

test('★★★ القيدُ المزدوج = دفترُ الذمم كلُّه، رصيدًا رصيدًا، صفرُ فرق', () => {
  const docs = [
    inv('10', 'C-1', 5000, D1),
    rcp('10', 'C-1', 400, D2),
    cn('11', 'C-1', 100, D2),
    grn('20', 'S-9', 3, 1000, D1),
    spv('21', 'S-9', 500, D2),
    inv('30', 'C-2', 1250.5, D1),
    inv('99', 'C-9', 800, PRE), // قبل T0 — يُسقط من الجانبين
  ];
  const { rows, allMatch, journalErrors } = reconcileLedger(docs);
  assert.equal(allMatch, true, JSON.stringify(rows));
  assert.equal(journalErrors.length, 0);

  const c1 = rows.find((r) => r.partyCode === 'C-1');
  assert.equal(c1.ledger, 4500, 'فاتورة 5000 − قبض 400 − إشعار 100');
  assert.equal(c1.journal, 4500);

  const s9 = rows.find((r) => r.partyCode === 'S-9');
  assert.equal(s9.ledger, 2500, 'استلام 3000 − سداد 500 (ما نَدينه)');
  assert.equal(s9.journal, 2500);

  const c2 = rows.find((r) => r.partyCode === 'C-2');
  assert.equal(c2.journal, 1250.5);

  assert.equal(rows.find((r) => r.partyCode === 'C-9'), undefined, 'ما قبل T0 لا يظهر');
});

test('★★ كلُّ قيود الدورة متوازنة', () => {
  const entries = deriveLedgerEntries([
    inv('a', 'C-1', 5000, D1),
    grn('b', 'S-9', 3, 1000, D1),
    cn('c', 'C-1', 100, D1),
  ]);
  assert.equal(entries.length, 3);
  for (const e of entries) {
    const dr = e.lines.reduce((s, l) => s + l.debit, 0);
    const cr = e.lines.reduce((s, l) => s + l.credit, 0);
    assert.equal(dr, cr, `قيد ${e.key} متوازن`);
  }
});
