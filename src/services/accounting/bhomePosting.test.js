/**
 * اختبارات محاسبة المحلّ المستقلّ (ذ): فاتورةُ المورّد بنمطيها، وسلفُ العامل
 * وسدادها، والراتبُ والمصروفُ المبوّب — كلٌّ يُقيَّد في الدفتر المزدوج ويطابق
 * دفترَ الذمم بالبناء.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { entryFor, entriesFrom, balances } from '../ledger/partnerLedger.js';
import {
  deriveLedgerEntry,
  deriveExpenseEntry,
  isPostableType,
  expenseCategoryOf,
} from './deriveEntries.js';
import { createLedger } from './journal.js';
import { fromMinor } from './money.js';
import { createLedgerPost } from './ledgerPostService.js';
import { createLocalLedger } from './localLedgerStore.js';
import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { EXP_CATEGORY_LABELS } from '../documents/schemas/exp.js';
import { EXP_DOC_CATEGORIES } from './expenseCategories.js';

const NOW = () => 1_760_000_000_000;
const D = '2026-10-21';

function memStore() {
  const rows = new Map();
  const k = (c, i) => `${c}\u0000${i}`;
  return {
    async get(col, id) { return rows.get(k(col, id)) || null; },
    async query(col) { return [...rows.values()].filter((r) => r.col === col).map((r) => ({ id: r.id, data: r.data })); },
    async count(col) { return [...rows.values()].filter((r) => r.col === col).length; },
    async write(ops) {
      for (const o of ops) {
        if (o.op === 'delete') rows.delete(k(o.col, o.id));
        else rows.set(k(o.col, o.id), { col: o.col, id: o.id, data: o.data, updated_at: o.updatedAt });
      }
    },
  };
}

const bal = (L, acc) => fromMinor(L.balanceOf(acc));

/* ═══════════ ١. فاتورةُ المورّد بنمطيها ═══════════ */

const sinv = (id, code, amount, due = '') => ({
  id, type: 'SINV', number: `SINV-${id}`, state: 'done',
  header: { supplier: 'مختبرات الخليج', supplierCode: code, invoiceDate: D, dueDate: due, amount },
});
const sinvi = (id, code, lines) => ({
  id, type: 'SINVI', number: `SINVI-${id}`, state: 'done',
  header: { supplier: 'مختبرات الخليج', supplierCode: code, invoiceDate: D },
  lines,
});

test('★★ فاتورةُ القيمة: ذمّةُ مورّدٍ من الرأس، وقيدٌ Dr مشتريات / Cr ذمّة', () => {
  const ple = entryFor(sinv('1', 'S-1', 500));
  assert.equal(ple.party, 'supplier');
  assert.equal(ple.direction, 'debit');
  assert.equal(ple.amount, 500);
  assert.equal(ple.dueDate, '');

  const G = createLedger().postMany([deriveLedgerEntry(sinv('1', 'S-1', 500))]);
  assert.equal(bal(G, 'PURCHASES'), 500, 'مدينٌ المشتريات');
  assert.equal(bal(G, 'AP:S-1'), -500, 'دائنٌ ذمّةُ المورّد (ما نَدينه)');
});

test('★★ فاتورةُ الأصناف: القيمةُ من البنود، وقيدٌ Dr مخزون / Cr ذمّة', () => {
  const doc = sinvi('2', 'S-2', [{ qty: 2, unitCost: 100 }, { qty: 1, unitCost: 50 }]);
  assert.equal(entryFor(doc).amount, 250);
  const G = createLedger().postMany([deriveLedgerEntry(doc)]);
  assert.equal(bal(G, 'INVENTORY'), 250);
  assert.equal(bal(G, 'AP:S-2'), -250);
});

/* ═══════════ ٢. سلفُ العامل وسدادها ═══════════ */

const adv = (id, code, amount) => ({
  id, type: 'ADV', number: `ADV-${id}`, state: 'done',
  header: { worker: 'سالم', workerCode: code, advanceDate: D, amount },
});
const advr = (id, code, amount) => ({
  id, type: 'ADVR', number: `ADVR-${id}`, state: 'done',
  header: { worker: 'سالم', workerCode: code, repayDate: '2026-10-25', amount, method: 'نقدًا' },
});

test('★★★ رصيدُ العامل في الذمم يطابق قيدَه المزدوج بالبناء', () => {
  const docs = [adv('a', 'W-1', 300), advr('b', 'W-1', 120)];

  // دفتر الذمم: سلفةٌ تزيد، سدادٌ ينقص.
  const [row] = balances(entriesFrom(docs));
  assert.equal(row.partyCode, 'W-1');
  assert.equal(row.party, 'worker');
  assert.equal(row.balance, 180);

  // الدفتر المزدوج: WORKER_ADV:W-1 = 300 − 120 = 180، والنقدُ خرج ثمّ عاد.
  const G = createLedger().postMany(docs.map(deriveLedgerEntry));
  assert.equal(bal(G, 'WORKER_ADV:W-1'), 180);
  assert.equal(bal(G, 'CASH'), -180, 'صافي النقد: خرج ٣٠٠ وعاد ١٢٠');
});

test('★ السلفة: Dr سلف العمّال / Cr نقد — والسداد عكسُه', () => {
  const a = createLedger().postMany([deriveLedgerEntry(adv('a', 'W-1', 300))]);
  assert.equal(bal(a, 'WORKER_ADV:W-1'), 300);
  assert.equal(bal(a, 'CASH'), -300);
  const r = createLedger().postMany([deriveLedgerEntry(advr('b', 'W-1', 120))]);
  assert.equal(bal(r, 'WORKER_ADV:W-1'), -120);
  assert.equal(bal(r, 'CASH'), 120);
});

/* ═══════════ ٣. الراتبُ والمصروفُ المبوّب (مسارٌ مستقلّ عن الذمم) ═══════════ */

test('★★ الراتبُ مصروفٌ لا ذمّة: Dr رواتب / Cr نقد، ولا سطرَ في دفتر الذمم', () => {
  const sal = { id: 's1', type: 'SAL', number: 'SAL-1', state: 'done', header: { worker: 'سالم', workerCode: 'W-1', payDate: D, amount: 800, paymentMethod: 'نقدًا' } };
  assert.equal(entryFor(sal), null, 'الراتبُ ليس في دفتر الذمم');
  const G = createLedger().postMany([deriveExpenseEntry(sal)]);
  assert.equal(bal(G, 'SALARIES'), 800);
  assert.equal(bal(G, 'CASH'), -800);
});

test('★★ المصروفُ المبوّب: Dr مصروف:الفئة / Cr نقد، والتحويلُ المصرفيّ من البنك', () => {
  const exp = { id: 'e1', type: 'EXP', number: 'EXP-1', state: 'done', header: { category: 'إيجار', expenseDate: D, amount: 400, paymentMethod: 'نقدًا' } };
  assert.equal(expenseCategoryOf(exp), 'rent');
  const G = createLedger().postMany([deriveExpenseEntry(exp)]);
  assert.equal(bal(G, 'EXPENSE:RENT'), 400);
  assert.equal(bal(G, 'CASH'), -400);

  const bank = { id: 'e2', type: 'EXP', number: 'EXP-2', state: 'done', header: { category: 'نظافة', expenseDate: D, amount: 90, paymentMethod: 'تحويل مصرفي' } };
  const B = createLedger().postMany([deriveExpenseEntry(bank)]);
  assert.equal(bal(B, 'EXPENSE:CLEANING'), 90);
  assert.equal(bal(B, 'BANK'), -90, 'التحويلُ المصرفيُّ من البنك لا النقد');
});

/* ═══════════ ٣-ب. مستنداتُ التشغيل (س): فئةٌ ثابتةٌ لكلّ نوع ═══════════ */

test('★★ التشغيل: نقلٌ Dr مصروف:النقل، عمالةٌ Dr مصروف:المناولة، نظافةٌ Dr مصروف:النظافة', () => {
  const taxi = { id: 't1', type: 'TAXI', number: 'TAXI-1', state: 'done', header: { vendor: 'سائق', purpose: 'توريد', tripDate: D, amount: 60, paymentMethod: 'نقدًا' } };
  const labor = { id: 'l1', type: 'LABOR', number: 'LABOR-1', state: 'done', header: { crew: 'طاقم', task: 'تحميل', workDate: D, amount: 150, paymentMethod: 'نقدًا' } };
  const clean = { id: 'c1', type: 'CLEAN', number: 'CLEAN-1', state: 'done', header: { provider: 'شركة', area: 'المخزن', serviceDate: D, amount: 90, paymentMethod: 'تحويل مصرفي' } };

  assert.equal(expenseCategoryOf(taxi), 'transport');
  assert.equal(expenseCategoryOf(labor), 'handling');
  assert.equal(expenseCategoryOf(clean), 'cleaning');

  const G = createLedger().postMany([taxi, labor, clean].map(deriveExpenseEntry));
  assert.equal(bal(G, 'EXPENSE:TRANSPORT'), 60);
  assert.equal(bal(G, 'EXPENSE:HANDLING'), 150);
  assert.equal(bal(G, 'EXPENSE:CLEANING'), 90);
  assert.equal(bal(G, 'CASH'), -210, 'النقدُ: ٦٠ نقل + ١٥٠ عمالة (النظافةُ بتحويلٍ مصرفيّ)');
  assert.equal(bal(G, 'BANK'), -90, 'النظافةُ من البنك');
});

/* ═══════════ ٤. بوّابةُ القابليّة والترحيلُ الفعليّ على المخزن ═══════════ */

test('★ isPostableType: ذممٌ ومصروفاتٌ تُقيَّد، وما لا أثرَ له لا', () => {
  for (const t of ['SINV', 'SINVI', 'ADV', 'ADVR', 'SAL', 'EXP', 'TAXI', 'LABOR', 'CLEAN', 'INV', 'GRN']) {
    assert.equal(isPostableType(t), true, t);
  }
  assert.equal(isPostableType('PICK'), false);
  assert.equal(isPostableType('مجهول'), false);
});

test('★★★ الترحيلُ الفعليّ: SAL وEXP يُلحقان الدفترَ المحلّيّ عبر postDone', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  const P = createLedgerPost(db);

  const r1 = await P.postDone({ id: 's1', type: 'SAL', number: 'SAL-1', state: 'done', header: { worker: 'سالم', workerCode: 'W-1', payDate: D, amount: 800, paymentMethod: 'نقدًا' } });
  assert.equal(r1.posted, 1);
  const r2 = await P.postDone({ id: 'e1', type: 'EXP', number: 'EXP-1', state: 'done', header: { category: 'صيانة', expenseDate: D, amount: 250, paymentMethod: 'نقدًا' } });
  assert.equal(r2.posted, 1);

  const L = await createLocalLedger(db).buildLedger();
  assert.equal(bal(L, 'SALARIES'), 800);
  assert.equal(bal(L, 'EXPENSE:MAINTENANCE'), 250);
  assert.equal(bal(L, 'CASH'), -1050, 'النقدُ خرج للراتب والمصروف معًا');

  // إعادةُ الترحيل تُتخطّى (ذرّيٌّ بالمعرّف).
  const again = await P.postDone({ id: 's1', type: 'SAL', number: 'SAL-1', state: 'done', header: { worker: 'سالم', workerCode: 'W-1', payDate: D, amount: 800, paymentMethod: 'نقدًا' } });
  assert.equal(again.posted, 0);
  assert.equal(again.skipped, 1);
});

/* ═══════════ ٥. حارسُ انحراف فئات المصروف ═══════════ */

test('★ خياراتُ مخطّط EXP تطابق مصدرَ الحقيقة (expenseCategories)', () => {
  assert.deepEqual(EXP_CATEGORY_LABELS, EXP_DOC_CATEGORIES.map((c) => c.labelAr));
});
