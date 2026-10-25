/**
 * اختبارات محرّك القيد المزدوج — العقودُ الأربعة تُثبَت لا تُقال.
 * (قرار المالك 2026-10-25: الدفترُ المحليّ يملك المحاسبة.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { postEntry, reverseEntry, createLedger, LEDGER_T0 } from './journal.js';
import { toMinor, fromMinor, isWholeMinor, roundHalfAwayFromZero } from './money.js';
import { subAccount } from './accounts.js';

const D = '2026-10-21'; // بعد حدّ الافتتاح
const AR1 = subAccount('AR', 'C-1');

/* ═══════════ المال بالوحدة الصغرى ═══════════ */

test('★ الدينارُ ثلاثُ منازل: عشريٌّ ⇄ وحدةٌ صغرى بلا فقدٍ للدقّة', () => {
  assert.equal(toMinor(42), 42000);
  assert.equal(toMinor(1250.5), 1250500);
  assert.equal(fromMinor(1250500), 1250.5);
  assert.equal(toMinor(0.001), 1, 'أصغرُ وحدة');
  assert.equal(roundHalfAwayFromZero(2.5), 3);
  assert.equal(roundHalfAwayFromZero(-2.5), -3, 'النصفُ بعيدًا عن الصفر للسالب أيضًا');
  assert.ok(isWholeMinor(42000) && !isWholeMinor(42000.5));
});

/* ═══════════ ① التوازن ═══════════ */

test('★★ قيدٌ متوازنٌ يُقبل ويُطبَّع', () => {
  const e = postEntry({ key: 'K1', date: D, memo: 'قبض', lines: [
    { account: 'CASH', debit: 400000, credit: 0 },
    { account: AR1, party: 'C-1', debit: 0, credit: 400000 },
  ] });
  assert.equal(e.amount, 400000);
  assert.equal(e.lines.length, 2);
});

test('★★★ قيدٌ غير متوازنٍ يُرفض — لا يُطبق إلى الصفر', () => {
  assert.throws(() => postEntry({ key: 'K2', date: D, lines: [
    { account: 'CASH', debit: 400000, credit: 0 },
    { account: AR1, debit: 0, credit: 399000 },
  ] }), /غير متوازن/);
});

test('★★ السطرُ إمّا مدينٌ وإمّا دائن، والمبلغُ وحدةٌ صغرى صحيحة', () => {
  assert.throws(() => postEntry({ key: 'K3', date: D, lines: [
    { account: 'CASH', debit: 100000, credit: 100000 },
    { account: AR1, debit: 0, credit: 0 },
  ] }), /إمّا مدينٌ وإمّا دائن/);
  assert.throws(() => postEntry({ key: 'K4', date: D, lines: [
    { account: 'CASH', debit: 100.5, credit: 0 },
    { account: AR1, debit: 0, credit: 100.5 },
  ] }), /الوحدة الصغرى الصحيحة/);
});

test('★★ حسابٌ مجهولٌ يُرفض — لا يُخترع حساب', () => {
  assert.throws(() => postEntry({ key: 'K5', date: D, lines: [
    { account: 'NOPE', debit: 1000, credit: 0 },
    { account: 'CASH', debit: 0, credit: 1000 },
  ] }), /حسابٌ مجهول/);
});

/* ═══════════ ④ الفترةُ المقفلة ═══════════ */

test('★★★ لا قيدَ قبل حدّ الافتتاح T0', () => {
  assert.throws(() => postEntry({ key: 'K6', date: '2026-10-01', lines: [
    { account: 'CASH', debit: 1000, credit: 0 },
    { account: AR1, debit: 0, credit: 1000 },
  ] }), /فترةٌ مقفلة/);
  // اليومُ نفسُه T0 مقبول (الحدُّ شامل).
  assert.ok(postEntry({ key: 'K7', date: LEDGER_T0, lines: [
    { account: 'CASH', debit: 1000, credit: 0 },
    { account: AR1, debit: 0, credit: 1000 },
  ] }));
});

/* ═══════════ ② منعُ التكرار ═══════════ */

test('★★★ المفتاحُ الفريد يمنع التكرار — القفزُ لا المضاعفة', () => {
  const L = createLedger();
  const line = { key: 'DUP', date: D, lines: [
    { account: 'CASH', debit: 500000, credit: 0 },
    { account: AR1, debit: 0, credit: 500000 },
  ] };
  L.post(line);
  L.post(line); // إعادةُ محاولة
  assert.equal(L.entries.length, 1, 'لا يُضاعَف');
  assert.equal(L.balanceOf('CASH'), 500000);
});

/* ═══════════ ③ التصحيحُ بعكسٍ لا حذف ═══════════ */

test('★★★ العكسُ قيدٌ مضادٌّ مرتبطٌ يُطبق الرصيدَ إلى الصفر', () => {
  const orig = postEntry({ key: 'E10', date: D, lines: [
    { account: 'CASH', debit: 700000, credit: 0 },
    { account: AR1, party: 'C-1', debit: 0, credit: 700000 },
  ] });
  const rev = reverseEntry(orig, { date: D, reason: 'خطأ إدخال' });
  assert.equal(rev.key, 'E10~REV');
  assert.equal(rev.reverses, 'E10');
  assert.equal(rev.lines[0].credit, 700000, 'المدينُ صار دائنًا');

  const L = createLedger().postMany([orig, rev]);
  assert.equal(L.balanceOf('CASH'), 0, 'الأصلُ باقٍ والعكسُ ألغى أثرَه');
  assert.equal(L.entries.length, 2, 'سطران: لا حذفَ للتاريخ');
});

test('★★ subBalances يجمع الأطراف تحت AR', () => {
  const L = createLedger().postMany([
    { key: 'P1', date: D, lines: [{ account: 'CASH', debit: 100000, credit: 0 }, { account: subAccount('AR', 'C-1'), debit: 0, credit: 100000 }] },
    { key: 'P2', date: D, lines: [{ account: 'CASH', debit: 200000, credit: 0 }, { account: subAccount('AR', 'C-2'), debit: 0, credit: 200000 }] },
  ]);
  const subs = L.subBalances('AR');
  assert.equal(subs.get('C-1'), -100000, 'الدائنُ ينقص ذمّةَ العميل');
  assert.equal(subs.get('C-2'), -200000);
});
