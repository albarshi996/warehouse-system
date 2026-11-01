/**
 * دفترُ النقد اليوميّ — دلالةُ إكسل المالك بالأرقام نفسِها: رصيدٌ تراكميّ،
 * الافتتاح = إقفالُ أمس، إلغاءٌ بقيدٍ مضادّ، ملخّصٌ شهريّ، وعزلٌ بالمحلّ.
 * يُبرهَن على مخزنٍ في الذاكرة وعلى SQLite حقيقيّة (`node:sqlite`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createSqlStore } from '../_db/localSqlite/sqlStore.js';
import { createCashbook } from './cashbookService.js';

const NOW = () => 1_760_000_000_000;

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

const cbOn = (store) => createCashbook(createLocalDb({ store, now: NOW }));
const D1 = '2026-09-12';
const D2 = '2026-09-13';

test('★★★ دلالةُ الإكسل: الافتتاح ثمّ قبض/صرف برصيدٍ تراكميّ مطابق', async () => {
  const CB = cbOn(memStore());
  await CB.openBook({ shop: 'S1', openingBalance: 15000 });
  await CB.addPayment({ shop: 'S1', amount: 326, memo: 'اعاشة', at: D1 });
  await CB.addPayment({ shop: 'S1', amount: 15, memo: 'توصيل', at: D1 });

  const r = await CB.dailyReport('S1', D1);
  assert.equal(r.opening, 15000);
  assert.equal(r.totalIn, 0);
  assert.equal(r.totalOut, 341);
  assert.equal(r.closing, 14659);
  assert.equal(r.activeCount, 2);
  // الرصيدُ التراكميُّ بعد كلّ حركةٍ — كعمود إكسلك تمامًا.
  assert.equal(r.rows[0].balance, 14674, 'بعد اعاشة 326');
  assert.equal(r.rows[1].balance, 14659, 'بعد توصيل 15');
  assert.equal(r.rows[0].out, 326);
  assert.equal(r.rows[1].out, 15);
});

test('★★★ رصيدُ بداية اليوم = إقفالُ اليوم السابق', async () => {
  const CB = cbOn(memStore());
  await CB.openBook({ shop: 'S1', openingBalance: 15000 });
  await CB.addPayment({ shop: 'S1', amount: 326, memo: 'اعاشة', at: D1 });
  await CB.addPayment({ shop: 'S1', amount: 15, memo: 'توصيل', at: D1 });
  await CB.addPayment({ shop: 'S1', amount: 120, memo: 'غداء', at: D2 });
  await CB.addReceipt({ shop: 'S1', amount: 500, memo: 'قبض', at: D2 });

  const r2 = await CB.dailyReport('S1', D2);
  assert.equal(r2.opening, 14659, 'افتتاحُ اليوم الثاني = إقفالُ الأوّل');
  assert.equal(r2.totalIn, 500);
  assert.equal(r2.totalOut, 120);
  assert.equal(r2.closing, 15039, '14659 + 500 − 120');
});

test('★★★ إلغاءٌ لا حذف: الأصلُ يبقى مشطوبًا ويُستبعد، والرصيدُ يتعادل', async () => {
  const CB = cbOn(memStore());
  await CB.openBook({ shop: 'S1', openingBalance: 15000 });
  await CB.addPayment({ shop: 'S1', amount: 326, memo: 'اعاشة', at: D1 }); // seq 0
  await CB.addPayment({ shop: 'S1', amount: 15, memo: 'توصيل', at: D1 }); // seq 1
  const c = await CB.cancelEntry({ shop: 'S1', seq: 1, reason: 'خطأ' });
  assert.equal(c.ok, true);
  assert.equal(c.posted, true);

  const r = await CB.dailyReport('S1', D1);
  assert.equal(r.totalOut, 326, 'الملغاةُ خارج الإجمالي');
  assert.equal(r.closing, 14674, 'زال أثرُ 15 — الرصيدُ تعادل');
  assert.equal(r.activeCount, 1);
  assert.equal(r.cancelledCount, 1);
  assert.equal(r.cancelledRows[0].seq, 1);
  assert.equal(r.cancelledRows[0].out, 15);

  // إلغاءُ المُلغى مرّةً أخرى يُتخطّى (لا تكرار).
  const again = await CB.cancelEntry({ shop: 'S1', seq: 1 });
  assert.equal(again.skipped, true);
});

test('★★ الملخّصُ الشهريّ: صفٌّ لكلّ يومٍ بافتتاحٍ متسلسل', async () => {
  const CB = cbOn(memStore());
  await CB.openBook({ shop: 'S1', openingBalance: 15000 });
  await CB.addPayment({ shop: 'S1', amount: 341, memo: 'يوم أول', at: D1 });
  await CB.addPayment({ shop: 'S1', amount: 120, memo: 'يوم ثانٍ', at: D2 });

  const m = await CB.monthlySummary('S1', '2026-09');
  assert.equal(m.length, 2);
  assert.deepEqual(
    m.map((r) => [r.day, r.opening, r.closing]),
    [
      [D1, 15000, 14659],
      [D2, 14659, 14539],
    ],
  );
  // شهرٌ آخرُ فارغ.
  assert.deepEqual(await CB.monthlySummary('S1', '2026-10'), []);
});

test('★★★ عزلٌ بالمحلّ: دفترُ محلٍّ لا يرى دفترَ آخر', async () => {
  const CB = cbOn(memStore());
  await CB.openBook({ shop: 'S1', openingBalance: 1000 });
  await CB.openBook({ shop: 'S2', openingBalance: 2000 });
  await CB.addPayment({ shop: 'S1', amount: 100, memo: 'صرف S1', at: D1 });

  const r1 = await CB.dailyReport('S1', D1);
  const r2 = await CB.dailyReport('S2', D1);
  assert.equal(r1.closing, 900, 'S1: 1000 − 100');
  assert.equal(r2.opening, 2000);
  assert.equal(r2.closing, 2000, 'S2 لم يتأثّر بصرف S1');
  assert.equal(r2.activeCount, 0);
});

test('★ دفترٌ غيرُ مفتوحٍ يُعيد null، والقبضُ قبل الفتح يُعيد not-found', async () => {
  const CB = cbOn(memStore());
  assert.equal(await CB.dailyReport('GHOST', D1), null);
  const r = await CB.addPayment({ shop: 'GHOST', amount: 10, at: D1 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-found');
});

/* ═══════════════════ SQLite حقيقيّة ═══════════════════ */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  /* يُتخطّى */
}
const MIGRATION = new URL('../../../src-tauri/migrations/001-kv-docs.sql', import.meta.url);
function sqliteInvoke() {
  const sq = new DatabaseSync(':memory:');
  sq.exec(readFileSync(MIGRATION, 'utf8'));
  return async (cmd, args) => {
    if (cmd === 'bhome_db_query') return sq.prepare(args.sql).all(...(args.params || []));
    if (cmd === 'bhome_db_exec') return sq.prepare(args.sql).run(...(args.params || [])).changes;
    if (cmd === 'bhome_db_batch') {
      sq.exec('BEGIN');
      try {
        for (const s of args.stmts) sq.prepare(s.sql).run(...(s.params || []));
        sq.exec('COMMIT');
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
      return undefined;
    }
    throw new Error(`أمرٌ مجهول: ${cmd}`);
  };
}

test('★★★ على SQLite حقيقيّة: دورةٌ يوميّة · إقفالٌ متسلسل · إلغاء', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const CB = createCashbook(createLocalDb({ store: createSqlStore(sqliteInvoke()), now: NOW }));
  await CB.openBook({ shop: 'RH', openingBalance: 15000 });
  await CB.addPayment({ shop: 'RH', amount: 326, memo: 'اعاشة', at: D1 });
  await CB.addPayment({ shop: 'RH', amount: 15, memo: 'توصيل', at: D1 });
  await CB.addPayment({ shop: 'RH', amount: 120, memo: 'غداء', at: D2 });

  assert.equal((await CB.dailyReport('RH', D1)).closing, 14659);
  assert.equal((await CB.dailyReport('RH', D2)).opening, 14659);
  assert.equal((await CB.dailyReport('RH', D2)).closing, 14539);

  await CB.cancelEntry({ shop: 'RH', seq: 2, reason: 'غداء ملغى' }); // seq 2 = غداء D2
  assert.equal((await CB.dailyReport('RH', D2)).closing, 14659, 'عاد الإقفالُ بعد الإلغاء');
  assert.equal((await CB.dailyReport('RH', D2)).cancelledCount, 1);
});
