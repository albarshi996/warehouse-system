/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المحوَّل `local-sqlite` — العقدُ، والجسرُ الغائب، والبيّنةُ الحيّة على SQLite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ١. العقد: يُصدّر الرموزَ الثلاثةَ والعشرين كلَّها (كـFirestore وpostgres).
 * ٢. الجسرُ الغائب: خارجَ تطبيق سطح المكتب، أيُّ نداءٍ يُرفَض برسالةٍ واضحة
 *    لا يتعلّق ولا ينهار صامتًا.
 * ٣. البيّنةُ الحيّة: نفسُ SQL الذي تولّده الترجمةُ يُنفَّذ على SQLite حقيقيّةٍ
 *    (`node:sqlite`) — فيُثبَت أنّه صالحٌ ودلالتُه كدلالة المخزن المزيّف. يُتخطّى
 *    بلطفٍ على إصدار Node لا يحمل `node:sqlite` (البناءُ في CI على Node 22+).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as localSqlite from './index.js';
import { createLocalDb } from './localDb.js';
import { createSqlStore } from './sqlStore.js';
import { REQUIRED_SYMBOLS, missingSymbols } from '../backend.js';

/* ═══════════════════ ١ · العقد ═══════════════════ */

test('المحوَّل يُصدّر العقدَ كاملًا (٢٣ رمزًا دوالَّ)', () => {
  assert.deepEqual(missingSymbols(localSqlite), []);
  for (const n of REQUIRED_SYMBOLS) assert.equal(typeof localSqlite[n], 'function', `${n} دالّة`);
  assert.equal(localSqlite.BACKEND_NAME, 'local-sqlite');
  assert.equal(typeof localSqlite.Timestamp.now, 'function');
});

/* ═══════════════════ ٢ · الجسرُ الغائب ═══════════════════ */

test('★ خارجَ Tauri: النداءُ يُرفَض برسالةٍ واضحةٍ لا يتعلّق', async () => {
  const ref = localSqlite.doc(localSqlite.db, 'documents', 'D1');
  await assert.rejects(() => localSqlite.getDoc(ref), /جسرُ Tauri غير متاح/);
});

/* ═══════════════════ ٣ · البيّنةُ الحيّة على SQLite ═══════════════════ */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // إصدارٌ بلا node:sqlite — يُتخطّى الفحصُ الحيّ (يبقى على CI).
}

const MIGRATION = new URL('../../../../src-tauri/migrations/001-kv-docs.sql', import.meta.url);

/** جسرُ Tauri مزيّفٌ على SQLite حقيقيّةٍ في الذاكرة — نفسُ أوامر `db.rs`. */
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

test('★★★ دورةٌ كاملةٌ على SQLite حقيقيّة', { skip: DatabaseSync ? false : 'node:sqlite غير متاح' }, async () => {
  const d = createLocalDb({ store: createSqlStore(sqliteInvoke()), now: () => 1_700_000_000_000 });
  const c = d.collection(d.db, 'documents');

  await d.setDoc(d.doc(c, 'a'), { kind: 'SRI', n: 2, tags: ['x', 'y'], at: d.Timestamp.fromMillis(1000) });
  await d.setDoc(d.doc(c, 'b'), { kind: 'SRI', n: 1, tags: ['y'], at: d.Timestamp.fromMillis(5000) });
  await d.setDoc(d.doc(c, 'z'), { kind: 'SRO', n: 9, tags: ['x'], at: d.Timestamp.fromMillis(9000) });

  // شرطٌ + ترتيبٌ + حدّ (SQL الحقيقيّ)
  const q = d.query(c, d.where('kind', '==', 'SRI'), d.orderBy('n', 'asc'), d.limit(5));
  const snap = await d.getDocs(q);
  assert.deepEqual(snap.docs.map((s) => s.id), ['b', 'a']);

  // طابعٌ زمنيّ: الترشيحُ عبر خدعة __ts__ في SQLite نفسِها
  const recent = await d.getDocs(d.query(c, d.where('at', '>=', d.Timestamp.fromMillis(3000))));
  assert.deepEqual(recent.docs.map((s) => s.id).sort(), ['b', 'z']);
  assert.equal(recent.docs[0].get('at').toMillis() >= 3000, true, 'الطابعُ عاد كائنًا');

  // array-contains عبر json_each
  const tagged = await d.getDocs(d.query(c, d.where('tags', 'array-contains', 'x')));
  assert.deepEqual(tagged.docs.map((s) => s.id).sort(), ['a', 'z']);

  // عدٌّ
  assert.equal((await d.getCountFromServer(d.query(c, d.where('kind', '==', 'SRI')))).data().count, 2);

  // تحديثٌ تراكميّ وحذف
  await d.updateDoc(d.doc(c, 'a'), { n: d.increment(10) });
  assert.equal((await d.getDoc(d.doc(c, 'a'))).data().n, 12);
  await d.deleteDoc(d.doc(c, 'z'));
  assert.equal((await d.getCountFromServer(c)).data().count, 2);
});

test('★★ writeBatch ذرّيّةٌ على SQLite', { skip: DatabaseSync ? false : 'node:sqlite غير متاح' }, async () => {
  const d = createLocalDb({ store: createSqlStore(sqliteInvoke()), now: () => 1 });
  const c = d.collection(d.db, 'c');
  await d.setDoc(d.doc(c, 'base'), { n: 10 });

  const batch = d.writeBatch();
  batch.set(d.doc(c, 'one'), { v: 1 });
  batch.update(d.doc(c, 'base'), { n: d.increment(5) });
  await batch.commit();

  assert.equal((await d.getDoc(d.doc(c, 'base'))).data().n, 15);
  assert.equal((await d.getDoc(d.doc(c, 'one'))).data().v, 1);
});

test('★★★ runTransaction (db, fn) وترشيحُ ==null على SQLite', { skip: DatabaseSync ? false : 'node:sqlite غير متاح' }, async () => {
  const d = createLocalDb({ store: createSqlStore(sqliteInvoke()), now: () => 1 });
  const ref = d.doc(d.db, 'counters', 'seq');
  await d.setDoc(ref, { value: 0 });

  // التوقيعُ الحقيقيّ: db أوّلًا (نمطُ numberingService) — على SQLite حيّة
  const next = await d.runTransaction(d.db, async (tx) => {
    const snap = await tx.get(ref);
    const v = (snap.exists() ? snap.data().value : 0) + 1;
    tx.set(ref, { value: v }, { merge: true });
    return v;
  });
  assert.equal(next, 1);
  assert.equal((await d.getDoc(ref)).data().value, 1);

  // ==null يطابق الصريحَ لا المفقود (json_type في SQLite نفسِها)
  const c = d.collection(d.db, 'docs');
  await d.setDoc(d.doc(c, 'explicit'), { closedAt: null });
  await d.setDoc(d.doc(c, 'missing'), { other: 1 });
  const open = await d.getDocs(d.query(c, d.where('closedAt', '==', null)));
  assert.deepEqual(open.docs.map((s) => s.id), ['explicit']);
});
