/**
 * اختبارُ الاشتقاق والمطابقة — معيارُ قبول الشريحة الأولى: **صفرُ فرقٍ** بين
 * القيد المزدوج ودفتر الذمم على نفس المستندات.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveEntry, deriveEntries } from './deriveEntries.js';
import { reconcilePayments } from './reconcile.js';

const D1 = '2026-10-21';
const D2 = '2026-10-25';
const PRE = '2026-10-05'; // قبل T0 — رصيدٌ افتتاحيّ

const rcp = (id, code, amount, date, ref = 'INV-1') => ({
  id, type: 'RCP', number: `RCP-${id}`, state: 'done',
  header: { customerCode: code, payer: 'بقالة النور', receiptDate: date },
  lines: [{ invoiceRef: ref, amount }],
});
const spv = (id, code, amount, date, ref = 'GRN-1') => ({
  id, type: 'SPV', number: `SPV-${id}`, state: 'done',
  header: { supplierCode: code, supplier: 'مورّد عامّ', paymentDate: date },
  lines: [{ invoiceRef: ref, amount }],
});
const inv = (id, code, total, date) => ({
  id, type: 'INV', number: `INV-${id}`, state: 'done',
  header: { customerCode: code, customer: 'بقالة النور', invoiceDate: date },
  lines: [{ qty: 1, unitPrice: total }],
});

/* ═══════════ الاشتقاق ═══════════ */

test('★★ القبضُ: مدينٌ النقد، دائنٌ ذمّةُ العميل — ومتوازن', () => {
  const e = deriveEntry(rcp('1', 'C-1', 400, D1));
  assert.equal(e.lines[0].account, 'CASH');
  assert.equal(e.lines[0].debit, 400000);
  assert.equal(e.lines[1].account, 'AR:C-1');
  assert.equal(e.lines[1].credit, 400000);
  assert.equal(e.key, 'RCP__1', 'المعرّفُ الحتميّ نفسُه — أساسُ منع التكرار');
});

test('★★ السدادُ: مدينٌ ذمّةُ المورّد، دائنٌ النقد', () => {
  const e = deriveEntry(spv('2', 'S-9', 1250.5, D1));
  assert.equal(e.lines[0].account, 'AP:S-9');
  assert.equal(e.lines[0].debit, 1250500);
  assert.equal(e.lines[1].account, 'CASH');
  assert.equal(e.lines[1].credit, 1250500);
});

test('★ ما ليس قبضًا ولا سدادًا لا يُشتقّ منه قيد', () => {
  assert.equal(deriveEntry(inv('3', 'C-1', 1000, D1)), null);
});

test('★★ ما قبل T0 يُسقط بهدوءٍ ولا يُسقط الباقي', () => {
  const entries = deriveEntries([rcp('a', 'C-1', 100, PRE), rcp('b', 'C-1', 200, D1)]);
  assert.equal(entries.length, 1, 'القبضُ قبل الافتتاح رصيدٌ افتتاحيّ لا قيد');
  assert.equal(entries[0].key, 'RCP__b');
});

/* ═══════════ صفرُ الفرق ═══════════ */

test('★★★ المطابقة: القيدُ المزدوج = دفترُ الذمم طرفًا طرفًا، صفرُ فرق', () => {
  const docs = [
    inv('10', 'C-1', 5000, D1),        // فاتورة — ليست قبضًا، تُتجاهَل في هذه الشريحة
    rcp('11', 'C-1', 400, D1),
    rcp('12', 'C-1', 1100.25, D2),
    rcp('13', 'C-2', 900, D2),
    spv('14', 'S-9', 1250.5, D1),
    spv('15', 'S-9', 500, D2),
    rcp('16', 'C-9', 300, PRE),         // قبل T0 — يُسقط من الجانبين فلا فرق
  ];
  const { rows, allMatch, journalErrors } = reconcilePayments(docs);
  assert.equal(allMatch, true, JSON.stringify(rows));
  assert.equal(journalErrors.length, 0);

  const c1 = rows.find((r) => r.partyCode === 'C-1');
  assert.equal(c1.ledger, 1500.25);
  assert.equal(c1.journal, 1500.25);
  assert.equal(c1.diff, 0);

  // C-9 قبل الافتتاح لا يظهر في أيّ جانب
  assert.equal(rows.find((r) => r.partyCode === 'C-9'), undefined);
});

test('★★★ تكرارُ نفس المستند لا يضاعف الطرف (منع التكرار في المطابقة)', () => {
  const docs = [rcp('20', 'C-5', 750, D1), rcp('20', 'C-5', 750, D1)];
  const { rows, allMatch } = reconcilePayments(docs);
  assert.equal(allMatch, true);
  assert.equal(rows.find((r) => r.partyCode === 'C-5').journal, 750, 'المعرّفُ الحتميّ يمنع المضاعفة');
});
