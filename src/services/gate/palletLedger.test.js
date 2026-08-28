/**
 * 🔒 حرّاسُ دفتر الطبليات العائدة ‹GATE-301/302›.
 *
 * والاختبارُ الأوّل هو **مثالُ المالك حرفيًّا**: دخل ٨٠ · خرج ٦٥ · الرصيد ١٥.
 * فما لا يُثبت المثالَ الذي طلبه صاحبُ الحاجة لم يُبنَ له.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PALLET_MOVE_KINDS,
  UNKNOWN_PARTY,
  moveKind,
  shapeMove,
  moveProblems,
  movesFromLoad,
  signedCount,
  palletBalance,
  balanceText,
  movesOfParty,
} from './palletLedger.js';

const mv = (kind, count, extra = {}) => ({ kind, count, party: 'المورّد A', ownership: 'supplier', ...extra });

/* ═══════════ مثالُ المالك ═══════════ */

test('★★★ مثالُ المالك: دخل ٨٠ · خرج ٦٥ ⇒ رصيدُ طبليات المورّد لدينا ١٥', () => {
  const { parties } = palletBalance([mv('IN', 80), mv('OUT', 65)]);
  assert.equal(parties.length, 1);
  assert.equal(parties[0].in, 80);
  assert.equal(parties[0].out, 65);
  assert.equal(parties[0].balance, 15);
  assert.ok(balanceText(parties[0]).includes('لدينا 15'), balanceText(parties[0]));
});

test('★★ وجدولُ الورقة الثلاثيّ يُنتج أرقامَه', () => {
  const moves = [
    mv('IN', 120, { party: 'المورّد A' }), mv('OUT', 100, { party: 'المورّد A' }),
    mv('IN', 45, { party: 'المورّد B' }), mv('OUT', 45, { party: 'المورّد B' }),
    mv('IN', 70, { party: 'المورّد C' }), mv('OUT', 55, { party: 'المورّد C' }),
  ];
  const byName = Object.fromEntries(palletBalance(moves).parties.map((p) => [p.party, p.balance]));
  assert.equal(byName['المورّد A'], 20);
  assert.equal(byName['المورّد B'], 0);
  assert.equal(byName['المورّد C'], 15);
});

/* ═══════════ ★ الإشارةُ معناها ═══════════ */

test('★★ الرصيدُ الموجب: نحتفظ بخشبه — والسالب: خشبُنا عنده', () => {
  const ours = palletBalance([{ ...mv('OUT', 30), ownership: 'company', party: 'العميل X' }]).parties[0];
  assert.equal(ours.balance, -30);
  assert.ok(balanceText(ours).includes('لديه 30'), 'اتّجاهُ الدَّين انقلب — والمطالبةُ ستذهب للطرف الخطأ');

  const theirs = palletBalance([mv('IN', 30)]).parties[0];
  assert.ok(balanceText(theirs).includes('لدينا 30'));
  assert.ok(balanceText({ party: 'ص', balance: 0 }).includes('لا رصيد'));
});

test('★ الطرفُ الواحد بملكيّتين صفّان — فخشبُه غيرُ خشبِنا عنده', () => {
  const { parties } = palletBalance([
    { ...mv('IN', 10), ownership: 'supplier', party: 'المورّد A' },
    { ...mv('OUT', 4), ownership: 'company', party: 'المورّد A' },
  ]);
  assert.equal(parties.length, 2, 'خُلطت ملكيّتان في صفٍّ واحدٍ فضاع من يملك ماذا');
});

/* ═══════════ الإجمالاتُ الستّ ═══════════ */

test('ج‑٩ الإجمالاتُ الستّ محسوبةٌ ومعرَّفةٌ بما تعنيه', () => {
  const { totals } = palletBalance([
    { ...mv('OPENING', 220), ownership: 'company', party: 'الرصيد الافتتاحيّ', note: 'جردُ 2026-08-01' },
    { ...mv('IN', 85), ownership: 'supplier', party: 'المورّد A' },
    { ...mv('OUT', 45), ownership: 'company', party: 'العميل X' },
    { ...mv('IN', 12), ownership: 'supplier', party: 'المورّد B', condition: 'damaged' },
    { ...mv('IN', 4), ownership: 'supplier', party: 'المورّد C', condition: 'underReview' },
  ]);
  assert.equal(totals.companyOnSite, 220 - 45);
  assert.equal(totals.othersWithUs, 85 + 12 + 4);
  assert.equal(totals.oursWithOthers, 45);
  assert.equal(totals.damaged, 12);
  assert.equal(totals.underReview, 4);
  assert.equal(totals.onSite, 220 + 85 - 45 + 12 + 4);
});

test('★ «ملكُنا عند الغير» لا ينزل تحت الصفر — رقمٌ سالبٌ هنا بلا معنى', () => {
  const { totals } = palletBalance([
    { ...mv('OUT', 10), ownership: 'company', party: 'العميل X' },
    { ...mv('IN', 40), ownership: 'company', party: 'العميل X' },
  ]);
  assert.equal(totals.oursWithOthers, 0);
});

test('ق-٥ الرصيدُ الافتتاحيّ يُحسب — وبدونه يبدأ الجدولُ من صفرٍ وهو ليس صفرًا', () => {
  const without = palletBalance([mv('OUT', 20, { ownership: 'company' })]).totals.companyOnSite;
  const with_ = palletBalance([
    { kind: 'OPENING', count: 350, ownership: 'company', party: 'الافتتاحيّ' },
    mv('OUT', 20, { ownership: 'company' }),
  ]).totals.companyOnSite;
  assert.equal(without, -20);
  assert.equal(with_, 330);
});

test('★ الشطبُ يُخرج من الرصيد ويُبقي الأثر', () => {
  const { parties, moves } = palletBalance([
    mv('IN', 20),
    { ...mv('WRITE_OFF', 3), note: 'تلفت أثناء التفريغ' },
  ]);
  assert.equal(parties[0].balance, 17);
  assert.equal(moves, 2, 'الشطبُ محا السطرَ بدل أن يُضيف سطرًا');
});

/* ═══════════ التسوية والحرّاس ═══════════ */

test('★ أنواعُ الحركة أربعةٌ بإشاراتها — ولا نوعَ بلا إشارة', () => {
  assert.equal(PALLET_MOVE_KINDS.length, 4);
  for (const k of PALLET_MOVE_KINDS) assert.ok(k.sign === 1 || k.sign === -1, `${k.id} بلا إشارة`);
  assert.equal(moveKind('in').id, 'IN');
  assert.equal(moveKind('nope'), null);
});

test('★ signedCount يقلب الإشارةَ بنوعها لا بالعدد', () => {
  assert.equal(signedCount({ kind: 'IN', count: 5 }), 5);
  assert.equal(signedCount({ kind: 'OUT', count: 5 }), -5);
  assert.equal(signedCount({ kind: 'OPENING', count: 5 }), 5);
  assert.equal(signedCount({ kind: 'WRITE_OFF', count: 5 }), -5);
});

test('★ الطرفُ المجهول اسمٌ صريح — فلا حركةَ تختفي من الجدول', () => {
  assert.equal(shapeMove({ count: 3 }).party, UNKNOWN_PARTY);
  assert.equal(palletBalance([{ kind: 'IN', count: 3 }]).parties[0].party, UNKNOWN_PARTY);
});

test('★★ نقضٌ: الشطبُ بلا سببٍ يُمنع — دفترٌ لا يُصحَّح لا يُشطب فيه بلا بيان', () => {
  assert.ok(moveProblems({ kind: 'WRITE_OFF', count: 3 }).some((p) => p.includes('سببًا')));
  assert.deepEqual(moveProblems({ kind: 'WRITE_OFF', count: 3, note: 'تلفت' }), []);
});

test('★★ نقضٌ: الرصيدُ الافتتاحيّ بلا بيانٍ يُمنع · والصفرُ ليس حركة', () => {
  assert.ok(moveProblems({ kind: 'OPENING', count: 350 }).some((p) => p.includes('بيانًا')));
  assert.ok(moveProblems({ kind: 'IN', count: 0 }).some((p) => p.includes('مطلوب')));
});

test('★ ولا ساعةَ تُقرأ في المنطق الخالص — at يُمرَّر أو يبقى null', () => {
  assert.equal(shapeMove({ count: 1 }).at, null);
  assert.equal(shapeMove({ count: 1, at: 1700000000000 }).at, 1700000000000);
});

/* ═══════════ ★★★ الاشتقاقُ من الحمولة — مصدرُ الكتابة الوحيد ═══════════ */

test('★★★ movesFromLoad يشتقّ سطرًا لكلّ سطرِ طبليات — ولا يخترع طرفًا', () => {
  const moves = movesFromLoad(
    'IN',
    { party: 'XYZ', pallets: [{ count: 10, ownership: 'supplier' }, { count: 5, ownership: 'company' }] },
    { visitId: 'v1', plate: '27-123456', reason: 'supplier', at: 1700000000000 }
  );
  assert.equal(moves.length, 2);
  assert.equal(moves[0].party, 'XYZ');
  assert.equal(moves[0].visitId, 'v1');
  assert.equal(moves[0].plate, '27-123456');
  assert.equal(moves[0].at, 1700000000000);
  assert.equal(moves[1].ownership, 'company');
});

test('★ حمولةٌ بلا طبلياتٍ لا تُنتج سطرًا — ولا سطرٌ فارغٌ يلوّث الدفتر', () => {
  assert.deepEqual(movesFromLoad('IN', { party: 'X' }, {}), []);
  assert.deepEqual(movesFromLoad('OUT', { party: 'X', pallets: [{ count: 0 }] }, {}), []);
  assert.deepEqual(movesFromLoad('IN', null, {}), []);
});

test('★★ ودورةٌ كاملة: دخلت بـ١٥ وخرجت بـ٦ ⇒ يبقى عندنا ٩ من خشبه', () => {
  const ctx = { visitId: 'v9', plate: 'A 1', reason: 'supplier', at: 1 };
  const moves = [
    ...movesFromLoad('IN', { party: 'المورّد A', pallets: [{ count: 15, ownership: 'supplier' }] }, ctx),
    ...movesFromLoad('OUT', { party: 'المورّد A', pallets: [{ count: 6, ownership: 'supplier' }] }, ctx),
  ];
  assert.equal(palletBalance(moves).parties[0].balance, 9);
});

test('★ movesOfParty تُصفّي بالطرف والملكيّة وترتّب الأحدثَ أوّلًا', () => {
  const list = [
    { ...mv('IN', 5), at: 100 },
    { ...mv('IN', 7), at: 300 },
    { ...mv('IN', 9), party: 'آخر', at: 200 },
  ];
  const mine = movesOfParty(list, 'المورّد A');
  assert.equal(mine.length, 2);
  assert.equal(mine[0].at, 300, 'لم تُرتَّب الأحدثَ أوّلًا');
  assert.equal(movesOfParty(list, 'المورّد A', 'company').length, 0);
});
