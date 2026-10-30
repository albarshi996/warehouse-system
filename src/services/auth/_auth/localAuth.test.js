/**
 * محوَّلُ المصادقة المحلّيّة — السلوكُ كاملًا بمخزنٍ وجلسةٍ وهميَّين (بلا تخزينٍ حقيقيّ).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createLocalAuth,
  createLocalUser,
  createDoorUserStore,
  defaultUserStore,
  defaultSession,
  subscribeAuth,
  signIn,
  signOutUser,
  sendPasswordReset,
  fetchUserProfile,
} from './localAuth.js';
import { missingAuthSymbols } from './backend.js';
import { createLocalDb } from '../../_db/localSqlite/localDb.js';
import { createSqlStore } from '../../_db/localSqlite/sqlStore.js';

/** مخزنٌ في الذاكرة للاختبار. */
function memStore(seed = {}) {
  const map = { ...seed };
  return {
    async countUsers() { return Object.keys(map).length; },
    async getUser(u) { return map[String(u).trim()] || null; },
    async putUser(r) { map[String(r.username).trim()] = r; },
    _map: map,
  };
}
/** جلسةٌ في الذاكرة. */
function memSession() {
  let cur = null;
  return { get: () => cur, set: (u) => { cur = u; } };
}

test('★★★ المحوَّلُ المحلّيُّ يُصدّر عقدَ الخمسة كاملًا', () => {
  assert.deepEqual(
    missingAuthSymbols({ subscribeAuth, signIn, signOutUser, sendPasswordReset, fetchUserProfile }),
    []
  );
});

test('★★★ دخولٌ صحيحٌ ⇒ مستخدمٌ، وخاطئٌ ⇒ رفضٌ برمزٍ موحّد', async () => {
  const store = memStore();
  await createLocalUser(store, { username: 'owner', name: 'المالك', password: 'secret-123' });
  const auth = createLocalAuth({ store, session: memSession() });

  const user = await auth.signIn('owner', 'secret-123');
  assert.equal(user.uid, 'owner');
  assert.equal(user.displayName, 'المالك');

  await assert.rejects(() => auth.signIn('owner', 'wrong'), (e) => e.code === 'auth/invalid-credential');
  await assert.rejects(() => auth.signIn('ghost', 'whatever'), (e) => e.code === 'auth/invalid-credential');
});

test('★★ أوّلُ حسابٍ مالكٌ (admin) والتالي viewer — تمهيدٌ بلا بريدٍ مبرمَج', async () => {
  const store = memStore();
  const first = await createLocalUser(store, { username: 'a', password: 'secret-123' });
  const second = await createLocalUser(store, { username: 'b', password: 'secret-123' });
  assert.equal(first.role, 'admin');
  assert.equal(second.role, 'viewer');
});

test('★★ الحسابُ المعطَّلُ لا يدخل', async () => {
  const store = memStore();
  await createLocalUser(store, { username: 'u', password: 'secret-123' });
  const rec = await store.getUser('u');
  await store.putUser({ ...rec, active: false });
  const auth = createLocalAuth({ store, session: memSession() });
  await assert.rejects(() => auth.signIn('u', 'secret-123'), (e) => e.code === 'auth/invalid-credential');
});

test('★★ الاشتراكُ يُطلق بالحالة، والدخولُ والخروجُ يُخطران', async () => {
  const store = memStore();
  await createLocalUser(store, { username: 'owner', name: 'م', password: 'secret-123' });
  const auth = createLocalAuth({ store, session: memSession() });

  const seen = [];
  const unsub = auth.subscribeAuth((u) => seen.push(u ? u.uid : null));
  await new Promise((r) => setTimeout(r, 0)); // الإطلاقُ الأوّلُ غيرُ متزامن
  assert.deepEqual(seen, [null], 'يبدأ بلا جلسة');

  await auth.signIn('owner', 'secret-123');
  assert.equal(seen.at(-1), 'owner', 'الدخولُ أخطر');
  await auth.signOutUser();
  assert.equal(seen.at(-1), null, 'الخروجُ أخطر');

  unsub();
  await auth.signIn('owner', 'secret-123');
  assert.equal(seen.length, 3, 'بعد إلغاء الاشتراك لا إخطار');
});

test('★ الجلسةُ تبقى: محوَّلٌ جديدٌ على نفس الجلسة يبدأ داخلًا', async () => {
  const store = memStore();
  await createLocalUser(store, { username: 'owner', name: 'م', password: 'secret-123' });
  const session = memSession();
  const a1 = createLocalAuth({ store, session });
  await a1.signIn('owner', 'secret-123');

  const a2 = createLocalAuth({ store, session });
  const prof = await a2.fetchUserProfile('owner');
  assert.equal(prof.role, 'admin');
  assert.equal(prof.name, 'م');
});

test('★ إعادةُ التعيين محليًّا غيرُ مدعومةٍ بالبريد — رمزٌ واضح', async () => {
  const auth = createLocalAuth({ store: memStore(), session: memSession() });
  await assert.rejects(() => auth.sendPasswordReset('x'), (e) => e.code === 'auth/local-reset-unsupported');
});

test('★ المخزنُ الافتراضيُّ يعمل في Node (بلا localStorage) على الذاكرة', async () => {
  const store = defaultUserStore();
  assert.equal(await store.countUsers(), 0);
  await createLocalUser(store, { username: 'z', password: 'secret-123' });
  assert.equal(await store.countUsers(), 1);
  // وجلسةُ Node الافتراضيّةُ لا تنهار
  const s = defaultSession();
  assert.equal(s.get(), null);
  s.set({ username: 'z' });
  assert.equal(s.get().username, 'z');
});

/* ═══════════════ مخزنُ المستخدمين على الباب (SQLite عبر Tauri) — جاهزيّة القطع ═══════════════ */

/** مخزنُ kv في الذاكرة يحقّق واجهةَ `createLocalDb` (get/query/count/write). */
function kvMemStore() {
  const rows = new Map();
  const k = (c, i) => `${c}\u0000${i}`;
  return {
    async get(c, i) { return rows.get(k(c, i)) || null; },
    async query(c) { return [...rows.values()].filter((r) => r.col === c).map((r) => ({ id: r.id, data: r.data })); },
    async count(c) { return [...rows.values()].filter((r) => r.col === c).length; },
    async write(ops) { for (const o of ops) { if (o.op === 'delete') rows.delete(k(o.col, o.id)); else rows.set(k(o.col, o.id), { col: o.col, id: o.id, data: o.data, updated_at: o.updatedAt }); } },
  };
}
const doorOn = (store) => createDoorUserStore(createLocalDb({ store, now: () => 1_760_000_000_000 }));

test('★★ createDoorUserStore: دورةٌ كاملةٌ (عدّ · حفظ · قراءة) بنفس واجهة الافتراضيّ', async () => {
  const s = doorOn(kvMemStore());
  assert.equal(await s.countUsers(), 0);
  assert.equal(await s.getUser('owner'), null, 'غيرُ موجودٍ ⟵ null');
  await s.putUser({ username: 'owner', name: 'المالك', role: 'admin', active: true, passwordHash: 'x' });
  assert.equal(await s.countUsers(), 1);
  const rec = await s.getUser('owner');
  assert.equal(rec.name, 'المالك');
  assert.equal(rec.role, 'admin');
  assert.equal(rec.passwordHash, 'x', 'السجلُّ كاملٌ كما خُزّن');
});

test('★★★ createLocalUser + createLocalAuth فوق مخزن الباب: المالكُ أوّلًا ثمّ دخولٌ وملفٌّ', async () => {
  const store = doorOn(kvMemStore());
  const first = await createLocalUser(store, { username: 'owner', name: 'م', password: 'secret-123' });
  assert.equal(first.role, 'admin', 'أوّلُ حسابٍ على الجهاز مالك');
  const second = await createLocalUser(store, { username: 'u2', password: 'secret-123' });
  assert.equal(second.role, 'viewer');

  const auth = createLocalAuth({ store, session: memSession() });
  assert.equal((await auth.signIn('owner', 'secret-123')).uid, 'owner', 'دخولٌ صحيح');
  await assert.rejects(() => auth.signIn('owner', 'wrong'), (e) => e.code === 'auth/invalid-credential');
  assert.equal((await auth.fetchUserProfile('u2')).role, 'viewer', 'الملفُّ من المخزن');
});

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // إصدارٌ بلا node:sqlite — يُتخطّى (يبقى على CI).
}
const MIGRATION = new URL('../../../../src-tauri/migrations/001-kv-docs.sql', import.meta.url);
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

test('★★★ مخزنُ المستخدمين على SQLite حقيقيّة: المالكُ يُحفَظ ويُقرأ ويدخل', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const store = doorOn(createSqlStore(sqliteInvoke()));
  await createLocalUser(store, { username: 'owner', name: 'المالك', password: 'secret-123' });
  assert.equal(await store.countUsers(), 1);
  const auth = createLocalAuth({ store, session: memSession() });
  assert.equal((await auth.signIn('owner', 'secret-123')).uid, 'owner', 'الدخولُ من قاعدة الجهاز');
});
