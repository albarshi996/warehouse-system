/**
 * محوَّلُ المصادقة المحلّيّة — الدخولُ على الجهاز بلا إنترنت، خلف مقبس `_auth`.
 *
 * ★★★ يُصدّر نفسَ عقد الخمسة (subscribeAuth · signIn · signOutUser ·
 *     sendPasswordReset · fetchUserProfile)، فحين يُرفع `PUBLIC_AUTH_BACKEND=local`
 *     في بناء سطح المكتب يحلّ محلَّ Firebase دون لمسِ أيّ شاشةٍ أو حارس.
 *
 * ★★ المخزنُ والجلسةُ **محقونان** (كـ`pgClient` في باب البيانات) فيُختبَر كلُّه
 *    في Node بمخزنٍ وهميّ. والافتراضُ مخزنُ `localStorage` (يبقى في محرّك العرض
 *    بين التشغيلات) — وهو طبقةٌ تُستبدَل بـSQLite-عبر-Tauri لاحقًا دون لمس هذا
 *    الملفّ، لأنّ المحوَّل لا يعرف إلّا الواجهة (countUsers · getUser · putUser).
 *
 * ★ كلماتُ المرور عبر `localCrypto` (PBKDF2/WebCrypto). الجلسةُ لا تحمل الهاش.
 */
import { hashPassword, verifyPassword } from './localCrypto.js';
// بابُ البيانات المحلّيّ (SQLite عبر Tauri) — خفيفٌ بلا Firebase، ولا يُنادى جسرُ
// Tauri إلّا عند استعمال المخزن فعلًا (أي بعد قطع البيانات). بناؤه مغلّفاتٌ فقط.
import * as localDoor from '../../_db/localSqlite/index.js';

const USERS_KEY = 'bz.local.users';
const SESSION_KEY = 'bz.local.session';

/** وصولٌ محروسٌ إلى `localStorage` — يُعيد null إن غاب أو مُنع. */
function ls() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** مخزنُ المستخدمين الافتراضيّ: خريطةُ JSON في `localStorage`، وإلّا في الذاكرة. */
export function defaultUserStore() {
  let mem = {};
  const read = () => {
    const store = ls();
    if (!store) return mem;
    try {
      return JSON.parse(store.getItem(USERS_KEY) || '{}');
    } catch {
      return mem;
    }
  };
  const write = (map) => {
    mem = map;
    const store = ls();
    if (store) {
      try {
        store.setItem(USERS_KEY, JSON.stringify(map));
      } catch {
        /* ممتلئٌ أو مُنع — تبقى الذاكرةُ مصدرًا */
      }
    }
  };
  return {
    async countUsers() {
      return Object.keys(read()).length;
    },
    async getUser(username) {
      return read()[String(username).trim()] || null;
    },
    async putUser(record) {
      const map = read();
      map[String(record.username).trim()] = record;
      write(map);
    },
  };
}

/**
 * مخزنُ مستخدمين على بابِ بياناتٍ بعقد Firestore (SQLite عبر Tauri على الجهاز) —
 * **نفسُ واجهة `defaultUserStore`** (countUsers · getUser · putUser)، فيُستبدَل بها
 * دون لمسِ المحوَّل. المجموعةُ `local_users` والمعرّفُ اسمُ المستخدم. منطقٌ محايدُ
 * الخلفيّة يُختبَر فوق `createLocalDb` (ذاكرةٌ أو SQLite حقيقيّة).
 *
 * ★★ يُفعَّل **مع قطع البيانات** (`PUBLIC_DB_BACKEND=local-sqlite`) لا قبله: حتّى
 *    لا يعتمد الدخولُ على جسر Tauri قبل بوّابة P0 — فيبقى localStorage يعمل حتّى
 *    القطع، ثمّ تنتقل الحساباتُ إلى قاعدة الجهاز ذرّيًّا مع بقيّة البيانات.
 */
export function createDoorUserStore(door) {
  const COL = 'local_users';
  const idOf = (u) => String(u ?? '').trim();
  return {
    async countUsers() {
      const snap = await door.getDocs(door.collection(door.db, COL));
      return snap.size;
    },
    async getUser(username) {
      const snap = await door.getDoc(door.doc(door.db, COL, idOf(username)));
      return snap.exists() ? snap.data() : null;
    },
    async putUser(record) {
      await door.setDoc(door.doc(door.db, COL, idOf(record.username)), record);
    },
  };
}

/** جلسةٌ افتراضيّةٌ تبقى بين التشغيلات (نظيرُ browserLocalPersistence). */
export function defaultSession() {
  let mem = null;
  return {
    get() {
      const store = ls();
      if (!store) return mem;
      try {
        const raw = store.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return mem;
      }
    },
    set(user) {
      mem = user;
      const store = ls();
      if (!store) return;
      try {
        if (user) store.setItem(SESSION_KEY, JSON.stringify(user));
        else store.removeItem(SESSION_KEY);
      } catch {
        /* لا شيء — الذاكرةُ مصدرٌ احتياطيّ */
      }
    },
  };
}

const toUser = (session) =>
  session ? { uid: session.username, email: null, displayName: session.name } : null;

const toProfile = (rec, username) =>
  rec
    ? {
        uid: username,
        email: null,
        name: rec.name || username,
        role: rec.role || 'viewer',
        active: rec.active !== false,
      }
    : { uid: username, email: null, name: username, role: 'viewer', active: true };

function credentialError() {
  const e = new Error('اسمُ المستخدم أو كلمةُ المرور غير صحيحة.');
  e.code = 'auth/invalid-credential';
  return e;
}

/**
 * يصنع محوَّلًا محلّيًّا بمخزنٍ وجلسةٍ محقونَين — القلبُ المُختبَر.
 * @param {{store: object, session?: object}} deps
 */
export function createLocalAuth({ store, session = defaultSession() }) {
  const subscribers = new Set();
  let current = session.get();

  const notify = () => {
    const user = toUser(current);
    for (const cb of subscribers) {
      try {
        cb(user);
      } catch {
        /* مستمعٌ أخفق — لا يُسقط البقيّة */
      }
    }
  };

  return {
    /** يشترك في حالة الدخول ويُطلق فورًا بالحالة الراهنة؛ يُعيد إلغاءَ الاشتراك. */
    subscribeAuth(callback) {
      subscribers.add(callback);
      const user = toUser(current);
      Promise.resolve().then(() => {
        if (subscribers.has(callback)) callback(user);
      });
      return () => subscribers.delete(callback);
    },

    /** دخولٌ باسم المستخدم وكلمة المرور ضدّ المخزن المحليّ. */
    async signIn(username, password) {
      const uname = String(username ?? '').trim();
      if (!uname) throw credentialError();
      const rec = await store.getUser(uname);
      if (!rec || rec.active === false) throw credentialError();
      const ok = await verifyPassword(password, rec.passwordHash);
      if (!ok) throw credentialError();
      current = { username: uname, name: rec.name || uname, role: rec.role || 'viewer', active: rec.active !== false };
      session.set(current);
      notify();
      return toUser(current);
    },

    /** خروج. */
    signOutUser() {
      current = null;
      session.set(null);
      notify();
      return Promise.resolve();
    },

    /** لا إعادةَ تعيينٍ بالبريد محليًّا — تتمّ بإعادةِ مديرِ النظام للكلمة. */
    sendPasswordReset() {
      const e = new Error('إعادةُ تعيين كلمة المرور محليًّا تتمّ من مدير النظام، لا بالبريد.');
      e.code = 'auth/local-reset-unsupported';
      return Promise.reject(e);
    },

    /** ملفُّ المستخدم (الدور والاسم والحالة) من الجلسة أو المخزن. */
    async fetchUserProfile(userOrUid) {
      const uname = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid;
      if (!uname) return null;
      const id = String(uname);
      if (current && current.username === id) {
        return { uid: id, email: null, name: current.name, role: current.role, active: current.active !== false };
      }
      const rec = await store.getUser(id);
      return toProfile(rec, id);
    },
  };
}

/**
 * ينشئ سجلَّ مستخدمٍ محليّ (للتمهيد وإدارة المستخدمين لاحقًا). أوّلُ حسابٍ على
 * الجهاز يصير المالك (admin) — فيُكسر دور «البيضة والدجاجة» بلا بريدٍ مبرمَج.
 */
export async function createLocalUser(store, { username, name = '', password, role }) {
  const uname = String(username ?? '').trim();
  if (!uname) throw new Error('اسمُ المستخدم مطلوب');
  const count = await store.countUsers();
  const resolvedRole = role || (count === 0 ? 'admin' : 'viewer');
  const passwordHash = await hashPassword(password);
  const record = { username: uname, name: name || uname, role: resolvedRole, active: true, passwordHash };
  await store.putUser(record);
  return { username: uname, name: record.name, role: resolvedRole, active: true };
}

/* ═══════════════════ المثيلُ الافتراضيّ — ما يصله المقبس ═══════════════════ */

// ★ مخزنٌ وجلسةٌ **واحدان** يتشاركهما المحوَّلُ وواجهةُ التمهيد (إنشاءُ المالك)،
//   كي يجد الدخولُ ما أنشأته الشاشةُ على نفس المخزن (مثيلُ وحدةٍ واحد).
// ★★ عند قطع البيانات (PUBLIC_DB_BACKEND=local-sqlite) تُحفظ الحساباتُ في قاعدة
//    الجهاز عبر الباب المحلّيّ؛ وقبلَه (الوضعُ الراهن) يبقى localStorage يعمل.
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const sharedStore =
  ENV.PUBLIC_DB_BACKEND === 'local-sqlite' ? createDoorUserStore(localDoor) : defaultUserStore();
const instance = createLocalAuth({ store: sharedStore, session: defaultSession() });

export const subscribeAuth = instance.subscribeAuth;
export const signIn = instance.signIn;
export const signOutUser = instance.signOutUser;
export const sendPasswordReset = instance.sendPasswordReset;
export const fetchUserProfile = instance.fetchUserProfile;

/* ═══════════════════ واجهةُ التمهيد للشاشة المحلّيّة (خارج عقد المقبس) ═══════════════════ */

/** عددُ المستخدمين على الجهاز — صفرٌ يعني «أنشئ المالك أوّلًا». */
export function localUserCount() {
  return sharedStore.countUsers();
}

/** ينشئ مستخدمًا على الجهاز (أوّلُ حسابٍ مالك) على المخزن المشترك. */
export function localSignup({ username, name, password }) {
  return createLocalUser(sharedStore, { username, name, password });
}
