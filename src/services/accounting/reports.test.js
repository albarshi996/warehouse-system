/**
 * اختبارُ تقارير القيد الخالصة — ميزانُ المراجعة يتوازن إلى الصفر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { trialBalance } from './reports.js';

const D = '2026-10-21';
const inv = (id, code, total) => ({
  id, type: 'INV', number: `INV-${id}`, state: 'done',
  header: { customerCode: code, customer: 'x', invoiceDate: D }, lines: [{ qty: 1, unitPrice: total }],
});
const rcp = (id, code, amount) => ({
  id, type: 'RCP', number: `RCP-${id}`, state: 'done',
  header: { customerCode: code, receiptDate: D }, lines: [{ amount }],
});
const grn = (id, code, qty, cost) => ({
  id, type: 'GRN', number: `GRN-${id}`, state: 'done',
  header: { supplierCode: code, invoiceDate: D }, lines: [{ qtyAccepted: qty, unitCost: cost }],
});

test('★★★ ميزانُ المراجعة يتوازن إلى الصفر دائمًا (ثابتةُ القيد المزدوج)', () => {
  const tb = trialBalance([inv('1', 'C-1', 5000), rcp('2', 'C-1', 400), grn('3', 'S-9', 3, 1000)]);
  assert.equal(tb.balanced, true, JSON.stringify(tb.rows));
  // كلُّ حسابٍ برصيده المتوقَّع
  const bal = Object.fromEntries(tb.rows.map((r) => [r.account, r.balance]));
  assert.equal(bal['AR:C-1'], 4600, 'فاتورة 5000 − قبض 400');
  assert.equal(bal.SALES, -5000);
  assert.equal(bal.CASH, 400);
  assert.equal(bal['AP:S-9'], -3000, 'التزامٌ دائنٌ سالب');
  assert.equal(bal.INVENTORY, 3000);
});

test('★★ لا مستنداتٍ ⇒ ميزانٌ فارغٌ ومتوازن', () => {
  const tb = trialBalance([]);
  assert.equal(tb.accounts, 0);
  assert.equal(tb.balanced, true);
});

test('★ مدين كلِّ الصفوف = دائنُها (مجموعان متساويان)', () => {
  const tb = trialBalance([inv('10', 'C-2', 1250.5), rcp('11', 'C-2', 250.5)]);
  const dr = tb.rows.reduce((s, r) => s + r.debit, 0);
  const cr = tb.rows.reduce((s, r) => s + r.credit, 0);
  assert.equal(Math.round((dr - cr) * 1000), 0);
});
