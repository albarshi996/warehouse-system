/**
 * المُرحِّل (م٣) — التحويلُ والإدخالُ والمطابقة، بلا جهازٍ ولا تصديرٍ حيّ.
 *
 * يُبرهَن مرّتين: مخزنُ ذاكرةٍ يعمل في كلّ بيئة، وSQLite حقيقيّة (`node:sqlite`)
 * — فالدلالةُ واحدةٌ على الجهاز. الطوابعُ تصير `{__ts__}` التي يفهمها المحوّل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createSqlStore } from '../_db/localSqlite/sqlStore.js';
import { fromExportValue, parseDumpEntry, importDocuments, reconcileCounts } from './importDump.js';

const NOW = () => 1_760_000_000_000;

function memStore() {
  const rows = new Map();
  const k = (c, i) => `${c}\u0000${i}`;
  return {
    async get(c, i) { return rows.get(k(c, i)) || null; },
    async query(c) { return [...rows.values()].filter((r) => r.col === c).map((r) => ({ id: r.id, data: r.data })); },
    async count(c) { return [...rows.values()].filter((r) => r.col === c).length; },
    async write(ops) { for (const o of ops) { if (o.op === 'delete') rows.delete(k(o.col, o.id)); else rows.set(k(o.col, o.id), { col: o.col, id: o.id, data: o.data, updated_at: o.updatedAt }); } },
  };
}
const dbOn = (store) => createLocalDb({ store, now: NOW });

/* ═══════════════════ التحويل ═══════════════════ */

test('★★★ fromExportValue: الطابعُ الموسومُ يصير طابعَ الباب، والأنواعُ الخاصّةُ تُبسَّط', () => {
  const T = dbOn(memStore()).Timestamp;
  const iso = '2026-10-21T08:00:00.000Z';
  const ts = fromExportValue({ __type: 'timestamp', iso }, T);
  assert.equal(typeof ts.toMillis, 'function');
  assert.equal(ts.toMillis(), new Date(iso).getTime());
  assert.deepEqual(fromExportValue({ __type: 'geopoint', lat: 32.1, lng: 20.0 }, T), { lat: 32.1, lng: 20.0 });
  assert.deepEqual(fromExportValue({ __type: 'bytes', b64: 'AAE=' }, T), { b64: 'AAE=' });
  assert.equal(fromExportValue({ __type: 'ref', path: 'items/x' }, T), 'items/x');
  // متداخلٌ وبدائيّات
  const nested = fromExportValue({ a: 1, b: { __type: 'timestamp', iso }, c: [{ __type: 'ref', path: 'p/1' }] }, T);
  assert.equal(nested.a, 1);
  assert.equal(nested.b.toMillis(), new Date(iso).getTime());
  assert.deepEqual(nested.c, ['p/1']);
});

/* ═══════════════════ تحليلُ السطر ومسارُ المجموعة ═══════════════════ */

test('★★ parseDumpEntry: العليا بمسارها، والفرعيّةُ تُعادُ بناءً من __parent', () => {
  const top = parseDumpEntry('items', JSON.stringify({ __id: 'i1', name: 'صنف', qty: 3 }));
  assert.deepEqual(top, { collectionPath: 'items', id: 'i1', data: { name: 'صنف', qty: 3 } });

  const sub = parseDumpEntry('operations__scans', JSON.stringify({ __id: 's1', __parent: 'op7', code: 'X' }));
  assert.deepEqual(sub, { collectionPath: 'operations/op7/scans', id: 's1', data: { code: 'X' } });

  assert.throws(() => parseDumpEntry('operations__scans', JSON.stringify({ __id: 's1', code: 'X' })), /__parent/);
  assert.throws(() => parseDumpEntry('a__b__c', JSON.stringify({ __id: 'x', __parent: 'p' })), /أعمقُ من مستوًى/);
});

/* ═══════════════════ الإدخالُ عبر الباب ═══════════════════ */

const mockDump = () => [
  parseDumpEntry('items', JSON.stringify({ __id: 'i1', name: 'صنف أ', qty: 5, at: { __type: 'timestamp', iso: '2026-10-21T08:00:00.000Z' } })),
  parseDumpEntry('items', JSON.stringify({ __id: 'i2', name: 'صنف ب', qty: 0 })),
  parseDumpEntry('counters', JSON.stringify({ __id: 'PO-2026', type: 'PO', year: 2026, seq: 42 })),
  parseDumpEntry('operations__scans', JSON.stringify({ __id: 's1', __parent: 'op1', code: 'A' })),
  parseDumpEntry('operations__scans', JSON.stringify({ __id: 's2', __parent: 'op1', code: 'B' })),
];

test('★★★ importDocuments: يُدخل الكلَّ، والطابعُ يُقرأ طابعًا، والفرعيّةُ في مسارها', async () => {
  const db = dbOn(memStore());
  const { imported } = await importDocuments(db, mockDump(), { chunkSize: 2 });
  assert.equal(imported, 5);

  const i1 = (await db.getDoc(db.doc(db.db, 'items', 'i1'))).data();
  assert.equal(i1.name, 'صنف أ');
  assert.equal(i1.qty, 5);
  assert.equal(i1.at.toMillis(), new Date('2026-10-21T08:00:00.000Z').getTime(), 'الطابعُ حُفظ طابعًا لا كائنًا');

  // العدّادُ بُذر بقيمته (seq=42) — فالترقيمُ يبدأ من حيث انتهى السحابيّ.
  assert.equal((await db.getDoc(db.doc(db.db, 'counters', 'PO-2026'))).data().seq, 42);

  // الفرعيّةُ في `operations/op1/scans`.
  const scans = await db.getDocs(db.collection(db.db, 'operations', 'op1', 'scans'));
  assert.equal(scans.size, 2);
});

test('★★ reconcileCounts: صفرُ فرقٍ يمرّ، وأيُّ فرقٍ يُكشف', async () => {
  const db = dbOn(memStore());
  await importDocuments(db, mockDump());
  const ok = await reconcileCounts(db, { items: 2, counters: 1, 'operations/op1/scans': 2 });
  assert.equal(ok.allMatch, true, JSON.stringify(ok.rows));

  const bad = await reconcileCounts(db, { items: 3 });
  assert.equal(bad.allMatch, false);
  assert.equal(bad.rows[0].diff, -1, 'نقصٌ واحدٌ يُكشف');
});

/* ═══════════════════ البيّنةُ الحيّة على SQLite حقيقيّة ═══════════════════ */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // إصدارٌ بلا node:sqlite — يُتخطّى.
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

test('★★★ ترحيلٌ كاملٌ على SQLite حقيقيّة ثمّ مطابقةٌ بصفر فرق', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const db = dbOn(createSqlStore(sqliteInvoke()));
  await importDocuments(db, mockDump());
  // المطابقةُ تقرأ من القرص نفسِه.
  const rec = await reconcileCounts(db, { items: 2, counters: 1, 'operations/op1/scans': 2 });
  assert.equal(rec.allMatch, true, JSON.stringify(rec.rows));
  // الطابعُ نجا إلى القرص طابعًا.
  const at = (await db.getDoc(db.doc(db.db, 'items', 'i1'))).data().at;
  assert.equal(at.toMillis(), new Date('2026-10-21T08:00:00.000Z').getTime());
});
