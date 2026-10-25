/**
 * اختبارات الخزينة والتسكير (§7) — العقودُ تُثبَت لا تُقال.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { openSession, closeSession, summarize, markClosed, movementsInWindow, validateMovement } from './cashSession.js';

const S = () => openSession({ id: 'WS-1', shift: 'صباحيّة', openingBalance: 100000, openedBy: 'أحمد', openedAt: '2026-10-21T08:00' });
const mv = (kind, method, amount, at = '2026-10-21T10:00') => ({ kind, method, amount, at });

/* ═══════════ المتوقَّع ═══════════ */

test('★★ المتوقَّع = البداية + الوارد النقديّ − الصادر النقديّ', () => {
  const s = S();
  const sum = summarize(s, [
    mv('customer_receipt', 'cash', 50000),
    mv('cash_sale', 'cash', 30000),
    mv('expense', 'cash', 20000),
    mv('supplier_payment', 'cash', 10000),
  ]);
  assert.equal(sum.cashIn, 80000);
  assert.equal(sum.cashOut, 30000);
  assert.equal(sum.expectedCash, 150000, '100000 + 80000 − 30000');
});

test('★★★ البطاقةُ والبنكُ لا يدخلان درجَ النقد — ويُتابَعان منفصلَين', () => {
  const s = S();
  const sum = summarize(s, [
    mv('customer_receipt', 'cash', 40000),
    mv('customer_receipt', 'card', 25000),
    mv('customer_receipt', 'bank', 15000),
  ]);
  assert.equal(sum.expectedCash, 140000, 'البطاقة والبنك خارج الدرج');
  assert.equal(sum.byMethod.cash, 40000);
  assert.equal(sum.byMethod.card, 25000);
  assert.equal(sum.byMethod.bank, 15000);
});

test('★ حركةٌ أو وسيلةٌ مجهولة تُرفض', () => {
  assert.throws(() => validateMovement({ kind: 'لا نوع', method: 'cash', amount: 1000 }), /حركةُ خزينةٍ مجهولة/);
  assert.throws(() => validateMovement({ kind: 'expense', method: 'crypto', amount: 1000 }), /وسيلةُ سدادٍ مجهولة/);
  assert.throws(() => validateMovement({ kind: 'expense', method: 'cash', amount: 10.5 }), /الوحدة الصغرى/);
});

/* ═══════════ التسكير ═══════════ */

test('★★ تسكيرٌ مطابقٌ بلا فرقٍ لا يحتاج سببًا', () => {
  const s = S();
  const movements = [mv('customer_receipt', 'cash', 50000)];
  const close = closeSession(s, movements, { countedCash: 150000, closedBy: 'أحمد', closedAt: '2026-10-21T16:00' });
  assert.equal(close.expectedCash, 150000);
  assert.equal(close.variance, 0);
  assert.equal(close.state, 'closed');
});

test('★★★ الفرقُ يحتاج سببًا — ولا يتحوّل تلقائيًّا دَينًا على الموظّف', () => {
  const s = S();
  const movements = [mv('customer_receipt', 'cash', 50000)];
  // عجزٌ 5000 بلا سبب → يُرفض
  assert.throws(() => closeSession(s, movements, { countedCash: 145000 }), /الفرقُ يحتاج سببًا/);
  // بسببٍ مكتوب → يُقبل، والفرقُ يُسجَّل لا يُحوَّل دَينًا
  const close = closeSession(s, movements, { countedCash: 145000, reason: 'صرفٌ لم يُوثَّق', closedBy: 'أحمد' });
  assert.equal(close.variance, -5000, 'سالبٌ عجز');
  assert.equal(close.reason, 'صرفٌ لم يُوثَّق');
});

test('★★★ لا إغلاقان متزامنان — تسكيرُ وردية مُسكَّرة يُرفض', () => {
  const s = S();
  const closed = markClosed(s);
  assert.equal(closed.state, 'closed');
  assert.throws(() => closeSession(closed, [], { countedCash: 100000 }), /وردية غير مفتوحة/);
  assert.throws(() => markClosed(closed), /ليست مفتوحة/);
});

/* ═══════════ ما بعد منتصف الليل ═══════════ */

test('★★ نافذةُ العمل تدعم ما بعد منتصف الليل، وتستبعد ما يتسلّل بعد القطع', () => {
  const all = [
    mv('cash_sale', 'cash', 10000, '2026-10-21T23:30'), // ضمن النافذة
    mv('cash_sale', 'cash', 20000, '2026-10-22T01:00'), // بعد منتصف الليل، ضمن النافذة
    mv('cash_sale', 'cash', 99000, '2026-10-22T02:30'), // بعد القطع — يُستبعد
  ];
  const win = movementsInWindow(all, { from: '2026-10-21T08:00', to: '2026-10-22T02:00' });
  assert.equal(win.length, 2);
  const sum = summarize(S(), win);
  assert.equal(sum.cashIn, 30000, 'ما بعد القطع لا يُحسب في التسكير');
});

test('★ رصيدُ بدايةٍ سالبٌ أو كسريٌّ يُرفض عند الفتح', () => {
  assert.throws(() => openSession({ id: 'X', openingBalance: -1 }), /غيرُ سالب/);
  assert.throws(() => openSession({ id: 'X', openingBalance: 10.5 }), /الوحدة الصغرى/);
  assert.throws(() => openSession({ openingBalance: 0 }), /معرّفًا/);
});
