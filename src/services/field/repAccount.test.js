/**
 * اختبارات حساب المندوب النقديّ (م٥-أ · يسدّ ف‑١٠).
 *
 * الاختبار الحاكم: **الآجل لا يدخل الجيب.** فبيعٌ بالأجل يزيد ذمّة العميل ولا
 * يزيد نقد المندوب — وخلطهما يُظهر في عهدته مالًا لا وجود له، فيُطالَب بإيداعه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import SCHEMAS from '../documents/schemas/index.js';
import { classOf } from '../documents/timeFields.js';
import { ledgerRuleFor, entriesFrom } from '../ledger/partnerLedger.js';
import { odooTargetFor } from '../odoo/docCrosswalk.js';
import {
  CASH_RULES,
  repOf,
  cashMoves,
  cashBalance,
  repBalances,
  tripCloseVerdict,
  repDashboard,
} from './repAccount.js';
import { collectedTotal, rcvWarnings } from '../documents/schemas/rcv.js';

const rcv = (id, rep, amount, trip = 'T-1', date = '2026-08-05') => ({
  id, type: 'RCV', number: `RCV-${id}`, state: 'done',
  header: { repName: rep, tripRef: trip, collectionDate: date, customerCode: 'C-1', customer: 'بقالة', amountCollected: amount },
  lines: [{ invoiceRef: 'INV-1', amount }],
});
const vsiCash = (id, rep, total, trip = 'T-1') => ({
  id, type: 'VSI', number: `VSI-${id}`, state: 'done',
  header: { repName: rep, tripRef: trip, saleDate: '2026-08-05', customerCode: 'C-2', paymentMode: 'نقدًا' },
  lines: [{ sku: 'A', qty: 1, unitPrice: total }],
});
const vsiCredit = (id, rep, total, trip = 'T-1') => ({
  ...vsiCash(id, rep, total, trip),
  header: { repName: rep, tripRef: trip, saleDate: '2026-08-05', customerCode: 'C-3', paymentMode: 'آجل' },
});
const vsr = (id, rep, deposited, trip = 'T-1') => ({
  id, type: 'VSR', number: `VSR-${id}`, state: 'done',
  header: { repName: rep, tripRef: trip, settlementDate: '2026-08-06', cashDeposited: deposited },
  lines: [],
});

/* ═══════════ ١. الآجل لا يدخل الجيب ═══════════ */

test('★★ البيع الآجل يزيد ذمّة العميل ولا يزيد نقد المندوب', () => {
  const cash = cashMoves([vsiCash('1', 'أحمد', 500)]);
  assert.equal(cashBalance(cash, { rep: 'أحمد' }), 500);

  const credit = cashMoves([vsiCredit('2', 'أحمد', 500)]);
  assert.equal(credit.length, 0, 'ولا حركة نقدٍ أصلًا');
  assert.equal(cashBalance(credit, { rep: 'أحمد' }), 0);

  // لكنّه يدخل دفتر الذمم — فالمبلغ لم يضع، غيّر موضعه.
  assert.equal(entriesFrom([vsiCredit('2', 'أحمد', 500)])[0].amount, 500);
});

/* ═══════════ ٢. الحساب ═══════════ */

test('★ يزيد بالتحصيل والبيع النقديّ، وينقص بالإيداع', () => {
  const moves = cashMoves([
    rcv('1', 'أحمد', 300),
    vsiCash('2', 'أحمد', 500),
    vsr('3', 'أحمد', 600),
  ]);
  assert.equal(cashBalance(moves, { rep: 'أحمد' }), 200, '٣٠٠+٥٠٠−٦٠٠');
});

test('★ والرصيد يُحسب لرحلةٍ بعينها', () => {
  const moves = cashMoves([rcv('1', 'أحمد', 300, 'T-1'), rcv('2', 'أحمد', 200, 'T-2')]);
  assert.equal(cashBalance(moves, { rep: 'أحمد', tripRef: 'T-1' }), 300);
  assert.equal(cashBalance(moves, { rep: 'أحمد' }), 500, 'وبلا رحلةٍ يُجمع الكلّ');
});

test('المسوّدة لا تُحسب، والمندوب المجهول لا حساب له', () => {
  assert.equal(cashMoves([{ ...rcv('1', 'أحمد', 300), state: 'draft' }]).length, 0);
  assert.equal(cashMoves([{ ...rcv('1', '', 300), createdByName: '' }]).length, 0);
});

test('★ أرصدة المندوبين: من في جيبه أكثر أوّلًا', () => {
  const moves = cashMoves([rcv('1', 'أحمد', 900), rcv('2', 'سالم', 200), vsr('3', 'أحمد', 400)]);
  const b = repBalances(moves);
  assert.equal(b[0].rep, 'أحمد');
  assert.equal(b[0].balance, 500);
  assert.equal(b[0].collected, 900);
  assert.equal(b[0].deposited, 400);
  assert.equal(b[1].balance, 200);
});

/* ═══════════ ٣. حارس الإقفال ═══════════ */

test('★★ لا تُقفَل رحلةٌ ورصيدها غير صفر إلّا بسببٍ مكتوب', () => {
  const moves = cashMoves([rcv('1', 'أحمد', 500), vsr('2', 'أحمد', 300)]);
  const bad = tripCloseVerdict(moves, { rep: 'أحمد', tripRef: 'T-1' });
  assert.equal(bad.ok, false);
  assert.equal(bad.balance, 200);
  assert.match(bad.problem, /نقدٌ لم يُودَع/);
  assert.match(bad.problem, /200/);

  const ok = tripCloseVerdict(moves, { rep: 'أحمد', tripRef: 'T-1', reason: 'يُودَع صباح الغد باعتماد المشرف' });
  assert.equal(ok.ok, true);
  assert.equal(ok.needsReason, true, 'ويبقى الفرق مسجَّلًا وإن قُبل');
});

test('★ والإيداع الزائد يُبلَّغ كما النقص', () => {
  const moves = cashMoves([rcv('1', 'أحمد', 300), vsr('2', 'أحمد', 500)]);
  const v = tripCloseVerdict(moves, { rep: 'أحمد', tripRef: 'T-1' });
  assert.equal(v.ok, false);
  assert.equal(v.balance, -200);
  assert.match(v.problem, /يزيد على المحصَّل/);
});

test('★ والرحلة المتوازنة تُقفَل بلا سؤال', () => {
  const moves = cashMoves([rcv('1', 'أحمد', 500), vsr('2', 'أحمد', 500)]);
  const v = tripCloseVerdict(moves, { rep: 'أحمد', tripRef: 'T-1' });
  assert.equal(v.ok, true);
  assert.equal(v.needsReason, false);
});

/* ═══════════ ٤. لوحة المندوب ═══════════ */

test('★★ اللوحة تجمع الأربعة: النقد والمديونيّة والمبيعات والعملاء', () => {
  const documents = [vsiCash('1', 'أحمد', 500), vsiCredit('2', 'أحمد', 300), rcv('3', 'أحمد', 100)];
  const moves = cashMoves(documents);
  const ledger = entriesFrom(documents);
  const d = repDashboard({ moves, ledger, documents, rep: 'أحمد' });
  assert.equal(d.cash, 600, 'نقدًا ٥٠٠ + تحصيلًا ١٠٠');
  assert.equal(d.sales, 800, 'وإجماليّ البيع ٥٠٠ + ٣٠٠');
  assert.ok(d.customers >= 2);
  assert.equal(typeof d.receivable, 'number');
});

test('★ نسبة التحصيل تُخبر عن جودة البيع لا كمّيّته', () => {
  const documents = [vsiCredit('1', 'أحمد', 1000)];
  const d = repDashboard({ moves: [], ledger: entriesFrom(documents), documents, rep: 'أحمد' });
  assert.equal(d.sales, 1000);
  assert.equal(d.receivable, 1000, 'بيعٌ كلّه آجل');
  assert.equal(d.collectionRate, 0);
});

test('مندوبٌ بلا مبيعاتٍ: لا نسبةَ تُخترع', () => {
  const d = repDashboard({ rep: 'جديد' });
  assert.equal(d.sales, 0);
  assert.equal(d.collectionRate, null, 'null لا صفر — الصفر يعني «لم يحصّل شيئًا» وهو ظلم');
});

/* ═══════════ ٥. تسجيل RCV في السجلّات الستّة ═══════════ */

test('★★ سند التحصيل مسجَّلٌ في السجلّات الستّة', () => {
  assert.ok(SCHEMAS.RCV, 'المخطّطات');
  assert.equal(classOf('RCV', 'collectionDate'), 'event', 'الحقول الزمنيّة');
  assert.equal(classOf('RCV', 'invoiceDate'), 'reference');
  assert.ok(odooTargetFor('RCV'), 'عبور أودو');
  assert.equal(ledgerRuleFor('RCV').direction, 'credit', 'دفتر الذمم');
  assert.ok(CASH_RULES.RCV, 'حساب النقد');
  assert.equal(SCHEMAS.RCV.roles.approve.includes('sales_rep'), false, 'من قبض لا يعتمد قبضه');
  assert.equal(SCHEMAS.RCV.roles.create.includes('sales_rep'), true, 'لكنّه يُصدره — ومنعُه يوقف التحصيل');
});

test('★ حارس فرق التوزيع قائمٌ فيه كما في نظيرَيه', () => {
  const w = rcvWarnings({ header: { customer: 'ب', repName: 'أحمد', amountCollected: 500 }, lines: [{ amount: 300 }] });
  assert.ok(w.some((m) => /مالٌ بلا وجهة/.test(m)));
  assert.equal(collectedTotal([{ amount: 300 }, { amount: 200 }]), 500);
});

test('★ ولا يُحصَّل بلا مندوبٍ — والمال يبقى في عهدته', () => {
  const w = rcvWarnings({ header: { customer: 'ب', amountCollected: 100 }, lines: [{ amount: 100 }] });
  assert.ok(w.some((m) => /المندوب المحصِّل غير مُدخل/.test(m)));
});

test('repOf يقرأ المندوب من الرأس أو من المُنشئ', () => {
  assert.equal(repOf({ header: { repName: 'أحمد' } }), 'أحمد');
  assert.equal(repOf({ createdByName: 'سالم' }), 'سالم');
  assert.equal(repOf({}), '');
});
