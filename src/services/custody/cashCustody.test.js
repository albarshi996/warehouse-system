/**
 * بيّنةُ «العهد النقديّة» — المنطقُ الخالصُ وحدَه (بلا Firestore، Node العاري).
 *
 * تُثبِت:
 *   • الرصيد = مجموعُ الاستلامات − مجموعُ المصروفات (بالوحدة الصغرى).
 *   • الكشفُ متوازنٌ ببنائه: opening + Σ signed(lines) === closing.
 *   • المدى يحترم الحدَّين (ما قبل from افتتاحيّ · ما بعد to مستثنًى · الحدّان شاملان).
 *   • السجلُّ يسمح بالرصيد السالب (لا حدَّ على الصرف) ولا يرمي.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTODY_CATEGORIES,
  CUSTODY_KINDS,
  CUSTODY_WRITER_ROLES,
  canManageCustody,
  listCustodians,
  custodyBalance,
  custodyStatement,
} from './cashCustody.js';
import { toMinor } from '../accounting/money.js';

/** قيدٌ مختصر — المبالغُ بالدينار ثمّ تُحوَّل للوحدة الصغرى كما في الخدمة. */
function receipt(custodian, dinars, date, extra = {}) {
  return { kind: CUSTODY_KINDS.RECEIPT, custodian, amount: toMinor(dinars), date, ...extra };
}
function expense(custodian, dinars, date, extra = {}) {
  return { kind: CUSTODY_KINDS.EXPENSE, custodian, amount: toMinor(dinars), date, ...extra };
}

test('الثوابت: أربعُ فئاتٍ بالترتيب المطلوب ونوعا القيد', () => {
  assert.deepEqual(CUSTODY_CATEGORIES, ['إعاشة', 'نظافة', 'مناولة', 'أخرى']);
  assert.equal(CUSTODY_KINDS.RECEIPT, 'receipt');
  assert.equal(CUSTODY_KINDS.EXPENSE, 'expense');
});

test('الصلاحيّة: الأدوارُ الأربعةُ تُدير، وغيرُها لا', () => {
  assert.deepEqual(CUSTODY_WRITER_ROLES, ['admin', 'warehouse_manager', 'finance_manager', 'treasury']);
  for (const r of CUSTODY_WRITER_ROLES) assert.equal(canManageCustody(r), true);
  assert.equal(canManageCustody('storekeeper'), false);
  assert.equal(canManageCustody(''), false);
  assert.equal(canManageCustody(undefined), false);
});

test('★ الرصيد = استلام − صرف، بالوحدة الصغرى الصحيحة', () => {
  const entries = [
    receipt('أحمد', 1000, '2026-11-01'),
    expense('أحمد', 250.5, '2026-11-02', { category: 'إعاشة', invoiceNo: 'INV-1' }),
    expense('أحمد', 120, '2026-11-03', { category: 'نظافة', invoiceNo: 'INV-2' }),
    receipt('سالم', 500, '2026-11-01'),
  ];
  const b = custodyBalance(entries, 'أحمد');
  assert.equal(b.received, toMinor(1000)); // 1,000,000 درهم
  assert.equal(b.spent, toMinor(370.5)); //   370,500 درهم
  assert.equal(b.remaining, toMinor(629.5));
  // عددٌ صحيحٌ لا عائم (برهانُ وحدةِ money.js: 250.5+120 دقيقةٌ بالدرهم).
  assert.ok(Number.isInteger(b.received) && Number.isInteger(b.spent) && Number.isInteger(b.remaining));

  // حاملٌ آخر منفصلٌ تمامًا.
  assert.deepEqual(custodyBalance(entries, 'سالم'), { received: toMinor(500), spent: 0, remaining: toMinor(500) });
});

test('الرصيدُ السالبُ مسموحٌ ولا يرمي (تنبيهٌ لا منع)', () => {
  const entries = [
    receipt('خالد', 100, '2026-11-01'),
    expense('خالد', 180, '2026-11-02', { category: 'مناولة', invoiceNo: 'INV-9' }),
  ];
  const b = custodyBalance(entries, 'خالد');
  assert.equal(b.remaining, toMinor(-80));
  assert.ok(b.remaining < 0);
});

test('listCustodians: فريدةٌ مرتّبةٌ، وتتجاهل الفراغ', () => {
  const entries = [
    receipt('سالم', 1, '2026-11-01'),
    receipt('أحمد', 1, '2026-11-01'),
    expense('سالم', 1, '2026-11-02', { category: 'أخرى', invoiceNo: 'x' }),
    receipt('', 1, '2026-11-01'),
    { kind: 'receipt', amount: 100, date: '2026-11-01' }, // بلا حامل
  ];
  assert.deepEqual(listCustodians(entries), ['أحمد', 'سالم']);
  assert.deepEqual(listCustodians([]), []);
  assert.deepEqual(listCustodians(null), []);
});

test('★★★ الكشفُ متوازنٌ ببنائه: opening + Σ signed === closing', () => {
  const entries = [
    receipt('أحمد', 1000, '2026-10-15'),
    expense('أحمد', 300, '2026-10-20', { category: 'إعاشة', invoiceNo: 'A' }),
    receipt('أحمد', 500, '2026-11-02'),
    expense('أحمد', 150, '2026-11-05', { category: 'نظافة', invoiceNo: 'B' }),
  ];
  // المدى: نوفمبر وحدَه — فأكتوبر كلُّه افتتاحيّ.
  const st = custodyStatement(entries, 'أحمد', { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(st.opening, toMinor(700)); // 1000 − 300
  assert.equal(st.lines.length, 2);
  const sumSigned = st.lines.reduce((s, l) => s + l.signed, 0);
  assert.equal(st.opening + sumSigned, st.closing);
  assert.equal(st.closing, toMinor(1050)); // 700 + 500 − 150
  // الرصيدُ الجاري يتبع الحركات.
  assert.equal(st.lines[0].running, toMinor(1200));
  assert.equal(st.lines[1].running, toMinor(1050));
});

test('الكشفُ بلا مدًى: الافتتاحيُّ صفرٌ، والختاميُّ = الرصيد كلُّه', () => {
  const entries = [
    receipt('سالم', 400, '2026-11-01'),
    expense('سالم', 90, '2026-11-02', { category: 'مناولة', invoiceNo: 'Z' }),
  ];
  const st = custodyStatement(entries, 'سالم', {});
  assert.equal(st.opening, 0);
  assert.equal(st.lines.length, 2);
  assert.equal(st.closing, custodyBalance(entries, 'سالم').remaining);
});

test('المدى يحترم الحدّين: ما بعد to مستثنًى من الكشف كلِّه', () => {
  const entries = [
    receipt('أحمد', 1000, '2026-11-01'),
    expense('أحمد', 200, '2026-11-10', { category: 'إعاشة', invoiceNo: 'A' }),
    expense('أحمد', 999, '2026-12-01', { category: 'إعاشة', invoiceNo: 'LATER' }), // بعد to
  ];
  const st = custodyStatement(entries, 'أحمد', { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(st.lines.length, 2);
  assert.ok(!st.lines.some((l) => l.invoiceNo === 'LATER'));
  assert.equal(st.closing, toMinor(800)); // لا يتأثّر بما بعد to
  // الحدُّ الأدنى شاملٌ: قيدُ 2026-11-01 داخلٌ.
  assert.ok(st.lines.some((l) => l.date === '2026-11-01'));
});
