/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المحوَّل `local-sqlite` — يصل عقدَ Firestore بجسر SQLite في Tauri
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * نظيرُ `firestore.js` و`postgres.js`: يُصدّر الرموزَ الثلاثةَ والعشرين نفسَها،
 * فيختاره البابُ (`_db/index.js`) حين `PUBLIC_DB_BACKEND=local-sqlite`.
 *
 * ★ الجسرُ عالميٌّ لا مستورَد: `window.__TAURI__.core.invoke` (مفعَّلٌ بـ
 *   `withGlobalTauri`). فلا تبعيّةَ npm على `@tauri-apps/api`، والبناءُ للويب
 *   وNode لا ينكسر — والنداءُ لا يُطلب إلّا داخل تطبيق سطح المكتب.
 *
 * ★★ خاملٌ بالكامل: بناءُ هذا الملفّ لا يلمس Tauri (المصنعُ يبني مغلّفاتٍ فقط)،
 *    و`invoke` لا يُستدعى إلّا حين تُنادى دالّةٌ فعلًا — أي حين يُختار المحوَّل.
 */
import { createLocalDb } from './localDb.js';
import { createSqlStore } from './sqlStore.js';

/** جسرُ Tauri العالميّ — يُقرأ عند النداء لا عند البناء. */
function tauriInvoke(cmd, args) {
  const bridge = globalThis.__TAURI__;
  const invoke = bridge && bridge.core && bridge.core.invoke;
  if (typeof invoke !== 'function') {
    return Promise.reject(
      new Error('جسرُ Tauri غير متاح — المحوَّل local-sqlite يعمل داخل تطبيق سطح المكتب وحدَه')
    );
  }
  return invoke(cmd, args);
}

const impl = createLocalDb({ store: createSqlStore(tauriInvoke) });

/* ═══════════════════ المراجع ═══════════════════ */
export const doc = impl.doc;
export const collection = impl.collection;

/* ═══════════════════ الاستعلام ═══════════════════ */
export const query = impl.query;
export const where = impl.where;
export const orderBy = impl.orderBy;
export const limit = impl.limit;
export const startAfter = impl.startAfter;
export const documentId = impl.documentId;

/* ═══════════════════ القراءة ═══════════════════ */
export const getDoc = impl.getDoc;
export const getDocs = impl.getDocs;
export const getDocFromServer = impl.getDocFromServer;
export const getCountFromServer = impl.getCountFromServer;
export const onSnapshot = impl.onSnapshot;

/* ═══════════════════ الكتابة ═══════════════════ */
export const setDoc = impl.setDoc;
export const updateDoc = impl.updateDoc;
export const addDoc = impl.addDoc;
export const deleteDoc = impl.deleteDoc;
export const writeBatch = impl.writeBatch;
export const runTransaction = impl.runTransaction;

/* ═══════════════════ القيمُ الخادميّة ═══════════════════ */
export const serverTimestamp = impl.serverTimestamp;
export const increment = impl.increment;
export const arrayUnion = impl.arrayUnion;
export const arrayRemove = impl.arrayRemove;

/* ═══════════════════ الأنواع والمثيل ═══════════════════ */
export const Timestamp = impl.Timestamp;
export const db = impl.db;

/** اسمُ المحوَّل — يُقرأ في التشخيص. */
export const BACKEND_NAME = 'local-sqlite';
