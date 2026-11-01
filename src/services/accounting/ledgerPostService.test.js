/**
 * بابُ الترحيل — «منجَز» يولّد قيدًا فعليًّا: نهائيٌّ وحدَه، ذرّيٌّ، موسومٌ بالمحلّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createLedgerPost, shouldPostLocalJournal } from './ledgerPostService.js';
import { createLocalLedger } from './localLedgerStore.js';

test('★★★ بوّابةُ التفعيل: تُطلق على local-sqlite عند الإنجاز لنوعٍ له أثر — لا على Firestore', () => {
  // local-sqlite + منجَز + نوعٌ له أثر ⟵ تُطلق.
  assert.equal(shouldPostLocalJournal('local-sqlite', 'done', 'done', true), true);
  // Firestore (الويب الافتراضيّ) ⟵ لا تُطلق أبدًا، فلا يُكتب هناك شيء.
  assert.equal(shouldPostLocalJournal('firestore', 'done', 'done', true), false);
  // حالةٌ غيرُ نهائيّة ⟵ لا تُطلق.
  assert.equal(shouldPostLocalJournal('local-sqlite', 'approved', 'done', true), false);
  // نوعٌ بلا أثرٍ في الدفتر ⟵ لا تُطلق.
  assert.equal(shouldPostLocalJournal('local-sqlite', 'done', 'done', false), false);
});

const NOW = () => 1_760_000_000_000;
const D1 = '2026-10-21';

function memStore() {
  const rows = new Map();
  const k = (c, i) => `${c}\u0000${i}`;
  return {
    async get(col, id) {
      return rows.get(k(col, id)) || null;
    },
    async query(col) {
      return [...rows.values()].filter((r) => r.col === col).map((r) => ({ id: r.id, data: r.data }));
    },
    async count(col) {
      return [...rows.values()].filter((r) => r.col === col).length;
    },
    async write(ops) {
      for (const o of ops) {
        if (o.op === 'delete') rows.delete(k(o.col, o.id));
        else rows.set(k(o.col, o.id), { col: o.col, id: o.id, data: o.data, updated_at: o.updatedAt });
      }
    },
  };
}

const inv = (id, code, total, shop, state = 'done') => ({
  id, type: 'INV', number: `INV-${id}`, state, shop,
  header: { customerCode: code, customer: 'عميل', invoiceDate: D1 },
  lines: [{ qty: 1, unitPrice: total }],
});

test('★★★ «منجَز» يولّد قيدًا موسومًا بالمحلّ، ومتخطٍّ عند الإعادة', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  const P = createLedgerPost(db);

  const a = await P.postDone([inv('10', 'C-1', 5000, 'S1')]);
  assert.equal(a.posted, 1);

  // القيدُ مخزَّنٌ وموسومٌ بالمحلّ (عبر قراءة الدفتر بالمحل).
  const L = createLocalLedger(db);
  const s1 = await L.readEntries('S1');
  assert.equal(s1.length, 1);
  assert.equal(s1[0].shop, 'S1');
  assert.equal(s1[0].key, 'INV__10');

  // إعادةُ الترحيل تُتخطّى (ذرّيٌّ، لا مضاعفة).
  const b = await P.postDone([inv('10', 'C-1', 5000, 'S1')]);
  assert.equal(b.posted, 0);
  assert.equal(b.skipped, 1);
});

test('★★ الحالةُ المتقلّبة لا تُرحَّل (نهائيٌّ وحدَه)', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  const P = createLedgerPost(db);
  const r = await P.postDone([inv('a', 'C-1', 5000, 'S1', 'submitted'), inv('b', 'C-2', 3000, 'S1', 'draft')]);
  assert.equal(r.posted, 0, 'لا ترحيلَ من حالةٍ غير نهائيّة');
});

test('★★ مستندٌ مفردٌ (لا مصفوفة) يُرحَّل', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  const P = createLedgerPost(db);
  const r = await P.postDone(inv('99', 'C-9', 1000, null));
  assert.equal(r.posted, 1);
  assert.equal((await createLocalLedger(db).readEntries()).length, 1);
});
