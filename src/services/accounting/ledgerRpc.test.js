/**
 * اختبارُ الرابط JS↔بابِ الكتابة — العقدُ وحدَه، بلا شبكةٍ ولا قاعدة (fetch محقون).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPostJournalBody, postJournal } from './ledgerRpc.js';

const ENTRY = {
  key: 'RCP__11',
  date: '2026-10-21',
  amount: 400000,
  memo: 'سند قبض RCP-11',
  docType: 'RCP',
  docId: '11',
  lines: [
    { account: 'CASH', debit: 400000, credit: 0 },
    { account: 'AR', party: 'C-1', debit: 0, credit: 400000 },
  ],
};

/* ═══════════ العقد ═══════════ */

test('★★ يبني جسمَ النداء بأسماء معاملات post_journal', () => {
  const b = buildPostJournalBody(ENTRY);
  assert.equal(b.p_key, 'RCP__11');
  assert.equal(b.p_date, '2026-10-21');
  assert.equal(b.p_amount, 400000);
  assert.equal(b.p_source_type, 'RCP');
  assert.equal(b.p_source_id, '11');
  assert.equal(b.p_lines.length, 2);
  assert.deepEqual(b.p_lines[1], { account: 'AR', party: 'C-1', debit: 0, credit: 400000 });
  assert.equal(b.p_reverses, null);
});

test('★ قيدٌ بلا مفتاحٍ أو بسطرٍ واحدٍ يُرفض قبل أيّ شبكة', () => {
  assert.throws(() => buildPostJournalBody({ date: '2026-10-21', lines: ENTRY.lines }), /مفتاح/);
  assert.throws(() => buildPostJournalBody({ key: 'X', lines: [ENTRY.lines[0]] }), /سطران/);
});

/* ═══════════ النداء (fetch محقون) ═══════════ */

test('★★ نجاحٌ: يرسل POST إلى rpc/post_journal بالجسم الصحيح ويعيد المفتاح', async () => {
  let captured = null;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return { ok: true, json: async () => 'RCP__11' };
  };
  const r = await postJournal(ENTRY, { fetch: fakeFetch, apiUrl: 'http://x:3000/', token: 'T' });
  assert.equal(r.ok, true);
  assert.equal(r.key, 'RCP__11');
  assert.equal(captured.url, 'http://x:3000/rpc/post_journal');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, 'Bearer T');
  assert.deepEqual(JSON.parse(captured.init.body), buildPostJournalBody(ENTRY));
});

test('★★ فشلُ صلاحيّةٍ (403) يُعاد reason لا يرمي', async () => {
  const r = await postJournal(ENTRY, { fetch: async () => ({ ok: false, status: 403 }), apiUrl: 'http://x', token: 'T' });
  assert.deepEqual(r, { ok: false, reason: 'http-403' });
});

test('★★ تعذّرُ الوصول يُبتلع ويُعاد unreachable', async () => {
  const r = await postJournal(ENTRY, { fetch: async () => { throw new Error('net'); }, apiUrl: 'http://x', token: 'T' });
  assert.deepEqual(r, { ok: false, reason: 'unreachable' });
});

test('★ غيرُ مهيّأٍ (بلا عنوانٍ أو رمز) لا يحاول الشبكةَ', async () => {
  let called = false;
  const r = await postJournal(ENTRY, { fetch: async () => { called = true; return { ok: true, json: async () => 'x' }; }, apiUrl: '', token: '' });
  assert.deepEqual(r, { ok: false, reason: 'not-configured' });
  assert.equal(called, false);
});

test('★ قيدٌ معطوبٌ يُعاد bad-entry قبل الشبكة', async () => {
  const r = await postJournal({ date: '2026-10-21' }, { fetch: async () => ({ ok: true, json: async () => 'x' }), apiUrl: 'http://x', token: 'T' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-entry');
});
