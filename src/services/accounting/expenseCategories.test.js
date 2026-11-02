/**
 * اختبارات فئات المصاريف (ذ) — التبويبُ الهجين: فئةٌ ثابتة + ملاحظةٌ حرّة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPENSE_CATEGORIES,
  EXP_DOC_CATEGORIES,
  DEFAULT_CATEGORY,
  normalizeCategory,
  isCategory,
  categoryLabel,
  categoryAccount,
  categoryOptions,
} from './expenseCategories.js';
import { ACCOUNTS } from './accounts.js';

test('★ القائمةُ إحدى عشرة فئةً أقرّها المالك — لا تزيد صامتًا', () => {
  assert.equal(EXPENSE_CATEGORIES.length, 11);
  // المفاتيحُ فريدةٌ ولاتينيّةٌ ثابتة (اسمُ الحساب الفرعيّ ومفتاحُ التجميع).
  const keys = EXPENSE_CATEGORIES.map((c) => c.key);
  assert.equal(new Set(keys).size, 11);
  for (const k of keys) assert.match(k, /^[a-z_]+$/);
});

test('★★ كلُّ حسابٍ تشير إليه فئةٌ موجودٌ فعلًا في دليل الحسابات', () => {
  for (const c of EXPENSE_CATEGORIES) {
    assert.ok(ACCOUNTS[c.account], `الفئة ${c.key} تشير إلى حسابٍ مجهول ${c.account}`);
  }
});

test('★★ مستندُ المصروف العامّ يعرض التسعَ التشغيليّة — لا الرواتبَ ولا السلف', () => {
  assert.equal(EXP_DOC_CATEGORIES.length, 9);
  const keys = EXP_DOC_CATEGORIES.map((c) => c.key);
  assert.ok(!keys.includes('salaries'), 'الراتبُ مستندُه SAL لا مصروفٌ عامّ');
  assert.ok(!keys.includes('worker_advance'), 'السلفةُ مستندُها ADV');
  for (const c of EXP_DOC_CATEGORIES) assert.equal(c.account, 'EXPENSE');
});

test('التطبيع يقبل المفتاحَ والنصَّ العربيّ، ويردّ المجهولَ إلى «أخرى»', () => {
  assert.equal(normalizeCategory('rent'), 'rent');
  assert.equal(normalizeCategory('إيجار'), 'rent');
  assert.equal(normalizeCategory('RENT'), 'rent');
  assert.equal(normalizeCategory('لا فئة'), DEFAULT_CATEGORY);
  assert.equal(normalizeCategory(''), DEFAULT_CATEGORY);
  assert.equal(normalizeCategory(null), DEFAULT_CATEGORY);
});

test('القارئاتُ متّسقة: اسمٌ وحسابٌ لكلّ فئة', () => {
  assert.equal(isCategory('cleaning'), true);
  assert.equal(isCategory('nope'), false);
  assert.equal(categoryLabel('rent'), 'إيجار');
  assert.equal(categoryLabel('مجهول'), 'أخرى');
  assert.equal(categoryAccount('salaries'), 'SALARIES');
  assert.equal(categoryAccount('worker_advance'), 'WORKER_ADV');
  assert.equal(categoryAccount('cleaning'), 'EXPENSE');
  assert.equal(categoryAccount('مجهول'), 'EXPENSE');
});

test('خياراتُ القائمةِ للمخطّط — القيمةُ المفتاحُ والعنوانُ عربيٌّ', () => {
  const opts = categoryOptions();
  assert.equal(opts.length, 9);
  assert.deepEqual(opts[0], { value: 'rent', label: 'إيجار' });
});
