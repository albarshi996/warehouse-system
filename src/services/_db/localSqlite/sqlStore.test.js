/**
 * المخزنُ عبر SQL — يصل الترجمةَ بالأوامر، فيُفحص أنّه يمرّر الأمرَ الصحيحَ
 * ويشكّل الصفوف. الجسرُ مزيّفٌ يسجّل ما طُلب منه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSqlStore } from './sqlStore.js';

function spy(reply) {
  const calls = [];
  const invoke = async (cmd, args) => {
    calls.push({ cmd, args });
    return typeof reply === 'function' ? reply(cmd, args) : reply;
  };
  return { calls, invoke };
}

test('get يستعلم عن صفٍّ واحدٍ بالمجموعة والمعرّف', async () => {
  const { calls, invoke } = spy([{ id: 'D1', data: '{"n":1}' }]);
  const store = createSqlStore(invoke);
  const row = await store.get('documents', 'D1');

  assert.equal(calls[0].cmd, 'bhome_db_query');
  assert.match(calls[0].args.sql, /WHERE collection = \? AND id = \?/);
  assert.deepEqual(calls[0].args.params, ['documents', 'D1']);
  assert.deepEqual(row, { id: 'D1', data: '{"n":1}' });
});

test('get على لا صفٍّ يُعيد null', async () => {
  const { invoke } = spy([]);
  assert.equal(await createSqlStore(invoke).get('c', 'x'), null);
});

test('query يمرّر نصَّ الترجمة ويشكّل الصفوف', async () => {
  const { calls, invoke } = spy([{ id: 'A', data: '{}' }, { id: 'B', data: '{}' }]);
  const rows = await createSqlStore(invoke).query('documents', [{ __c: 'where', field: 'k', op: '==', value: 'v' }]);

  assert.equal(calls[0].cmd, 'bhome_db_query');
  assert.deepEqual(calls[0].args.params, ['documents', 'v']);
  assert.deepEqual(rows, [{ id: 'A', data: '{}' }, { id: 'B', data: '{}' }]);
});

test('count يقرأ العمود n عددًا', async () => {
  const { calls, invoke } = spy([{ n: 7 }]);
  const n = await createSqlStore(invoke).count('documents', []);
  assert.match(calls[0].args.sql, /SELECT COUNT\(\*\) AS n/);
  assert.equal(n, 7);
});

test('★ كتابةٌ واحدةٌ تمرّ exec، وأكثرُ تمرّ batch ذرّيّة', async () => {
  const single = spy(1);
  await createSqlStore(single.invoke).write([
    { op: 'upsert', col: 'c', id: '1', data: '{}', updatedAt: 'T' },
  ]);
  assert.equal(single.calls[0].cmd, 'bhome_db_exec');
  assert.match(single.calls[0].args.sql, /INSERT INTO kv_docs/);
  assert.deepEqual(single.calls[0].args.params, ['c', '1', '{}', 'T']);

  const many = spy(undefined);
  await createSqlStore(many.invoke).write([
    { op: 'upsert', col: 'c', id: '1', data: '{}', updatedAt: 'T' },
    { op: 'delete', col: 'c', id: '2' },
  ]);
  assert.equal(many.calls[0].cmd, 'bhome_db_batch');
  assert.equal(many.calls[0].args.stmts.length, 2);
  assert.match(many.calls[0].args.stmts[1].sql, /DELETE FROM kv_docs/);
});

test('كتابةٌ فارغةٌ لا تلمس الجسر', async () => {
  const { calls, invoke } = spy(undefined);
  await createSqlStore(invoke).write([]);
  assert.equal(calls.length, 0);
});
