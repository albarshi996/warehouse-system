/**
 * اختبارات ملخّص المصاريف (ذ): التجميعُ بالفئة، والسلفةُ صافيةٌ خارج الإجماليّ،
 * والترشيحُ بالمحلّ والحالة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { expenseSummary } from './expenseSummary.js';

const exp = (id, category, amount, shop = null, state = 'done') => ({
  id, type: 'EXP', number: `EXP-${id}`, state, shop, header: { category, amount, expenseDate: '2026-10-21' },
});
const sal = (id, amount, shop = null) => ({ id, type: 'SAL', state: 'done', shop, header: { worker: 'سالم', amount, payDate: '2026-10-21' } });
const adv = (id, amount, shop = null) => ({ id, type: 'ADV', state: 'done', shop, header: { worker: 'سالم', amount, advanceDate: '2026-10-21' } });
const advr = (id, amount, shop = null) => ({ id, type: 'ADVR', state: 'done', shop, header: { worker: 'سالم', amount, repayDate: '2026-10-25' } });

test('★★ التجميعُ بالفئة، والراتبُ مصروفٌ، والسلفةُ صافيةٌ خارج الإجماليّ', () => {
  const s = expenseSummary([
    exp('1', 'إيجار', 400),
    exp('2', 'rent', 100), // بالمفتاح أو بالعربيّة — تُجمع معًا
    exp('3', 'نظافة', 50),
    sal('4', 800),
    adv('5', 300),
    advr('6', 120),
  ]);
  const rent = s.rows.find((r) => r.key === 'rent');
  assert.equal(rent.total, 500, 'الإيجارُ مجموعٌ بصرف النظر عن صيغة الفئة');
  assert.equal(rent.count, 2);
  assert.equal(s.rows.find((r) => r.key === 'salaries').total, 800);
  assert.equal(s.expenseTotal, 1350, '٥٠٠ + ٥٠ + ٨٠٠ — بلا السلفة');
  assert.equal(s.advancesOut, 180, 'السلفةُ صافيةٌ: ٣٠٠ − ١٢٠');
});

test('★ الترشيحُ بالمحلّ يعزل مصاريفَ كلّ محلّ', () => {
  const docs = [exp('1', 'إيجار', 400, 'S1'), exp('2', 'إيجار', 90, 'S2'), sal('3', 500, 'S1')];
  assert.equal(expenseSummary(docs, { shop: 'S1' }).expenseTotal, 900);
  assert.equal(expenseSummary(docs, { shop: 'S2' }).expenseTotal, 90);
  assert.equal(expenseSummary(docs).expenseTotal, 990, 'بلا ترشيحٍ: الكلّ');
});

test('★ غيرُ المنجَز لا يُحسب', () => {
  const s = expenseSummary([exp('1', 'إيجار', 400, null, 'draft'), exp('2', 'إيجار', 100, null, 'done')]);
  assert.equal(s.expenseTotal, 100);
  assert.equal(s.docs, 1);
});

test('الفئةُ المجهولةُ تسقط إلى «أخرى» ولا تضيع', () => {
  const s = expenseSummary([exp('1', 'فئةٌ غريبة', 70)]);
  assert.equal(s.rows.find((r) => r.key === 'other').total, 70);
});
