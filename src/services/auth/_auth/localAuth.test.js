/**
 * محوَّلُ المصادقة المحلّيّة — السلوكُ كاملًا بمخزنٍ وجلسةٍ وهميَّين (بلا تخزينٍ حقيقيّ).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLocalAuth,
  createLocalUser,
  defaultUserStore,
  defaultSession,
  subscribeAuth,
  signIn,
  signOutUser,
  sendPasswordReset,
  fetchUserProfile,
} from './localAuth.js';
import { missingAuthSymbols } from './backend.js';

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
