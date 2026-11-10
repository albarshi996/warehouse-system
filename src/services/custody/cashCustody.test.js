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
  custodyCap,
  expenseNeedsApproval,
  isExpenseApproved,
  expenseStatus,
  pendingApprovals,
  custodySiteGroups,
  custodySiteNames,
  CUSTODY_UNASSIGNED_SECTOR,
  CUSTODY_LEGACY_SECTOR,
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

/* ═══════════ ‹توسيع صرف العهدة› السقفُ والاعتماد ═══════════ */

const approval = (refId, custodian, date, extra = {}) => ({ kind: CUSTODY_KINDS.APPROVAL, refId, custodian, date, ...extra });

test('CUSTODY_KINDS يضمّ الاعتماد', () => {
  assert.equal(CUSTODY_KINDS.APPROVAL, 'approval');
});

test('★★★ لا إفساد: بلا سقفٍ قطّ يسلك النظامُ كما كان — لا سقفَ ولا اعتمادَ ولا طابور', () => {
  const entries = [
    receipt('أحمد', 1000, '2026-11-01'),
    expense('أحمد', 900, '2026-11-02', { category: 'إعاشة', invoiceNo: 'BIG' }),
  ];
  assert.equal(custodyCap(entries, 'أحمد'), null);
  assert.equal(expenseStatus(entries, entries[1]), 'ok'); // لا سقفَ ⇒ ok مهما كبر
  assert.deepEqual(pendingApprovals(entries), []);
  // الرصيدُ كما كان تمامًا.
  assert.deepEqual(custodyBalance(entries, 'أحمد'), { received: toMinor(1000), spent: toMinor(900), remaining: toMinor(100) });
});

test('السقفُ: أحدثُ سقفٍ موجبٍ مضبوطٍ يفوز؛ وصفرٌ/غيابٌ = بلا سقف', () => {
  const entries = [
    receipt('سالم', 1000, '2026-11-01', { cap: toMinor(50) }),
    receipt('سالم', 500, '2026-11-10', { cap: toMinor(80) }), // الأحدث
    receipt('خالد', 300, '2026-11-01'), // بلا سقف
    receipt('خالد', 300, '2026-11-02', { cap: 0 }), // صفرٌ لا يُحتسب
  ];
  assert.equal(custodyCap(entries, 'سالم'), toMinor(80));
  assert.equal(custodyCap(entries, 'خالد'), null);
  assert.equal(custodyCap(entries, 'مجهول'), null);
});

test('المصروفُ فوق السقف يُنقص الرصيدَ ويُوسَم «بانتظار الاعتماد» (لا يُمنع)', () => {
  const entries = [
    receipt('سالم', 1000, '2026-11-01', { cap: toMinor(100) }),
    { ...expense('سالم', 150, '2026-11-02', { category: 'مناولة', invoiceNo: 'OVER' }), id: 'e1' },
    { ...expense('سالم', 40, '2026-11-03', { category: 'إعاشة', invoiceNo: 'UNDER' }), id: 'e2' },
  ];
  // الرصيد: صُرف الكلُّ فعلًا (190) بلا منع.
  assert.equal(custodyBalance(entries, 'سالم').spent, toMinor(190));
  // الحالة: الكبيرُ بانتظار، الصغيرُ ok.
  assert.equal(expenseStatus(entries, entries[1]), 'pending');
  assert.equal(expenseStatus(entries, entries[2]), 'ok');
  assert.equal(expenseNeedsApproval(entries[1], toMinor(100)), true);
  assert.equal(expenseNeedsApproval(entries[2], toMinor(100)), false);
  // الطابور: الكبيرُ وحدَه.
  const q = pendingApprovals(entries);
  assert.equal(q.length, 1);
  assert.equal(q[0].id, 'e1');
});

test('الاعتمادُ قيدٌ ملحقٌ بلا مبلغٍ: يُصادق المصروفَ ولا يمسّ الرصيدَ ولا الكشف', () => {
  const entries = [
    receipt('سالم', 1000, '2026-11-01', { cap: toMinor(100) }),
    { ...expense('سالم', 150, '2026-11-02', { category: 'مناولة', invoiceNo: 'OVER' }), id: 'e1' },
    approval('e1', 'سالم', '2026-11-03', { id: 'a1' }),
  ];
  assert.equal(isExpenseApproved(entries, 'e1'), true);
  assert.equal(isExpenseApproved(entries, 'eX'), false);
  assert.equal(expenseStatus(entries, entries[1]), 'approved');
  assert.deepEqual(pendingApprovals(entries), []); // اعتُمد ⇒ خرج من الطابور
  // الاعتمادُ لا يدخل الرصيدَ (المصروفُ وحدَه نقص).
  assert.equal(custodyBalance(entries, 'سالم').spent, toMinor(150));
  assert.equal(custodyBalance(entries, 'سالم').remaining, toMinor(850));
  // ولا يظهر سطرًا في الكشف (قيدٌ حوكميٌّ لا نقديّ).
  const st = custodyStatement(entries, 'سالم', {});
  assert.ok(!st.lines.some((l) => l.kind === CUSTODY_KINDS.APPROVAL));
  assert.equal(st.lines.length, 2); // الاستلامُ والمصروفُ وحدَهما
});

test('expenseNeedsApproval: لا سقفَ (null) ⇒ أبدًا، وغيرُ المصروف ⇒ أبدًا', () => {
  assert.equal(expenseNeedsApproval({ kind: 'expense', amount: toMinor(999) }, null), false);
  assert.equal(expenseNeedsApproval({ kind: 'receipt', amount: toMinor(999) }, toMinor(1)), false);
  assert.equal(expenseNeedsApproval({ kind: 'expense', amount: toMinor(100) }, toMinor(100)), false); // المساوي ليس فوقه
  assert.equal(expenseNeedsApproval({ kind: 'expense', amount: toMinor(101) }, toMinor(100)), true);
});

/* ═══════════ ‹توسيع صرف العهدة› المواقعُ الديناميّة ═══════════ */

test('custodySiteGroups: مخازنُ حيّةٌ مجمَّعةٌ بقطاعها (باسم القطاع لا رمزه)', () => {
  const warehouses = [
    { code: 'E1', name: 'E1 — أبوهادي', shop: 'S155', status: 'نشط' },
    { code: 'E2', name: 'E2 — أبوهادي', shop: 'S155', status: 'نشط' },
    { code: 'RH', name: 'الرحبة', shop: 'SRAH', status: 'نشط' },
    { code: 'ARC', name: 'مخزن مؤرشف', shop: 'S155', status: 'مؤرشف' }, // مستبعَد
    { code: 'NOSEC', name: 'بلا قطاع', shop: '', status: 'نشط' },
  ];
  const shops = [
    { code: 'S155', nameAr: 'قطاع ١٥٥' },
    { code: 'SRAH', nameAr: 'قطاع الرحبة' },
  ];
  const groups = custodySiteGroups(warehouses, shops);
  // المؤرشفُ لا يظهر.
  assert.ok(!custodySiteNames(groups).includes('مخزن مؤرشف'));
  // القطاعُ بالاسم العربيّ.
  const g155 = groups.find((g) => g.sector === 'قطاع ١٥٥');
  assert.deepEqual(g155.sites, ['E1 — أبوهادي', 'E2 — أبوهادي']);
  // بلا قطاعٍ آخرًا.
  assert.equal(groups[groups.length - 1].sector, CUSTODY_UNASSIGNED_SECTOR);
  assert.deepEqual(groups[groups.length - 1].sites, ['بلا قطاع']);
});

test('custodySiteGroups: المواقعُ السابقةُ غيرُ المطابقةِ تبقى في مجموعةٍ «سابقة»', () => {
  const warehouses = [{ code: 'E1', name: 'E1', shop: 'S155', status: 'نشط' }];
  const shops = [{ code: 'S155', nameAr: 'قطاع ١٥٥' }];
  const groups = custodySiteGroups(warehouses, shops, ['155', 'الرحبة', 'E1']); // E1 معروفٌ فلا يتكرّر
  const legacy = groups.find((g) => g.sector === CUSTODY_LEGACY_SECTOR);
  assert.deepEqual(legacy.sites, ['155', 'الرحبة']);
  assert.ok(!legacy.sites.includes('E1'));
});

test('custodySiteGroups: فارغٌ آمنٌ (بلا مخازن) ولا يرمي', () => {
  assert.deepEqual(custodySiteGroups([], []), []);
  assert.deepEqual(custodySiteGroups(null, null, null), []);
  assert.deepEqual(custodySiteGroups([], [], ['155']), [{ sector: CUSTODY_LEGACY_SECTOR, sites: ['155'] }]);
});
