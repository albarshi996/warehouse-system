/**
 * اختبارُ روابط أبواب الخزينة — العقدُ والنداءات بلا شبكةٍ (fetch محقون).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openSessionBody,
  movementBody,
  closeBody,
  openCashSession,
  addCashMovement,
  closeCashSession,
} from './treasuryRpc.js';

const API = { apiUrl: 'http://x:3000/', token: 'T' };
const okFetch = (value) => {
  let captured = null;
  return {
    fn: async (url, init) => {
      captured = { url, init };
      return { ok: true, json: async () => value };
    },
    get captured() {
      return captured;
    },
  };
};

/* ═══════════ بانياتُ الأجسام ═══════════ */

test('★★ openSessionBody بأسماء المعاملات، ويرفض المعرّفَ الفارغ والرصيدَ السالب/الكسريّ', () => {
  assert.deepEqual(openSessionBody({ id: 'W-1', shift: 'ص', opening: 100000, openedBy: 'أحمد' }), {
    p_id: 'W-1',
    p_shift: 'ص',
    p_opening: 100000,
    p_opened_by: 'أحمد',
  });
  assert.throws(() => openSessionBody({ id: '  ', opening: 0 }), /معرّف/);
  assert.throws(() => openSessionBody({ id: 'W', opening: -1 }), /غيرُ سالبة/);
  assert.throws(() => openSessionBody({ id: 'W', opening: 10.5 }), /صحيحة/);
});

test('★★ movementBody يحرس النوعَ والوسيلةَ والمبلغ', () => {
  assert.deepEqual(movementBody({ sessionId: 'W-1', kind: 'cash_sale', method: 'cash', amount: 20000 }), {
    p_session: 'W-1',
    p_kind: 'cash_sale',
    p_method: 'cash',
    p_amount: 20000,
    p_memo: '',
  });
  assert.throws(() => movementBody({ sessionId: 'W-1', kind: 'nope', method: 'cash', amount: 1 }), /نوعُ حركةٍ مجهول/);
  assert.throws(() => movementBody({ sessionId: 'W-1', kind: 'expense', method: 'crypto', amount: 1 }), /وسيلةٌ مجهولة/);
  assert.throws(() => movementBody({ sessionId: 'W-1', kind: 'expense', method: 'cash', amount: 0 }), /موجبة/);
});

test('★★ closeBody يرفض النقدَ السالبَ والكسريّ', () => {
  assert.deepEqual(closeBody({ sessionId: 'W-1', counted: 150000, reason: 'ر', closedBy: 'أحمد' }), {
    p_id: 'W-1',
    p_counted: 150000,
    p_reason: 'ر',
    p_closed_by: 'أحمد',
  });
  assert.throws(() => closeBody({ sessionId: 'W-1', counted: -5 }), /غيرُ سالبة/);
});

/* ═══════════ النداءات ═══════════ */

test('★★ openCashSession: POST إلى rpc/open_cash_session بالجسم الصحيح ويعيد المعرّف', async () => {
  const f = okFetch('W-1');
  const r = await openCashSession({ id: 'W-1', opening: 100000 }, { ...API, fetch: f.fn });
  assert.deepEqual(r, { ok: true, id: 'W-1' });
  assert.equal(f.captured.url, 'http://x:3000/rpc/open_cash_session');
  assert.equal(JSON.parse(f.captured.init.body).p_opening, 100000);
});

test('★★ addCashMovement يعيد seq رقمًا، و closeCashSession يعيد variance', async () => {
  const add = await addCashMovement({ sessionId: 'W-1', kind: 'cash_sale', method: 'cash', amount: 20000 }, { ...API, fetch: okFetch(1).fn });
  assert.deepEqual(add, { ok: true, seq: 1 });

  const close = await closeCashSession({ sessionId: 'W-1', counted: 95000, reason: 'عجز' }, { ...API, fetch: okFetch(-5000).fn });
  assert.deepEqual(close, { ok: true, variance: -5000 });
});

test('★★ فشلُ صلاحيّةٍ (403) وتعذّرُ الوصول يُعادان reason لا يرميان', async () => {
  const r403 = await closeCashSession({ sessionId: 'W-1', counted: 0 }, { ...API, fetch: async () => ({ ok: false, status: 403 }) });
  assert.deepEqual(r403, { ok: false, reason: 'http-403' });
  const rNet = await addCashMovement({ sessionId: 'W-1', kind: 'expense', method: 'cash', amount: 1 }, { ...API, fetch: async () => { throw new Error('net'); } });
  assert.deepEqual(rNet, { ok: false, reason: 'unreachable' });
});

test('★ غيرُ مهيّأٍ ومدخلٌ معطوبٌ لا يمسّان الشبكة', async () => {
  let called = false;
  const notConf = await openCashSession({ id: 'W-1', opening: 0 }, { apiUrl: '', token: '', fetch: async () => { called = true; return { ok: true, json: async () => 'x' }; } });
  assert.deepEqual(notConf, { ok: false, reason: 'not-configured' });
  assert.equal(called, false);

  const bad = await addCashMovement({ sessionId: 'W-1', kind: 'nope', method: 'cash', amount: 1 }, { ...API, fetch: async () => { called = true; return { ok: true, json: async () => 'x' }; } });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'bad-input');
  assert.equal(called, false);
});
