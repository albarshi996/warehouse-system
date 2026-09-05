/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  محوَّل Firestore — التنفيذُ القائم خلف الباب
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **هذا هو الملفُّ الوحيدُ في المشروع الذي يستورد `firebase/firestore`.**
 *     ويحرس ذلك `seam.test.js` فيُسقط `npm test` إن استورده ملفٌّ آخر.
 *
 * ولا يضيف طبقةً ولا يغيّر سلوكًا: إعادةُ تصديرٍ حرفيّةٌ للدوالّ كما هي.
 * وقيمتُه أنّه صار **الموضعَ الوحيد** الذي يعرف Firestore — فيوم يصل محوَّلُ
 * PostgreSQL يُكتب بجانبه ولا يُلمس شيءٌ آخر.
 *
 * ★★ والواجهةُ **مقيسةٌ لا مفترَضة** (2026-09-02): مُسحت الـ٦٢ خدمةً فظهر أنّها
 *    تستعمل **٢٢ رمزًا** لا أكثر من عشرات مكتبة Firestore. وهذا الرقمُ هو حجمُ
 *    ما يجب أن يُبنى لـPostgreSQL: اثنان وعشرون لا ألفان.
 *    والعقدُ مكتوبٌ في `backend.js` (`REQUIRED_SYMBOLS`) ومفحوصٌ آليًّا.
 *
 * ═══ ما لا يُصدَّر هنا عمدًا ═══
 * المصادقةُ وStorage يبقيان في `config/firebase.js` على Firebase بعد الهجرة —
 * هجرةٌ واحدةٌ في المرّة، فليسا من شأن هذا الباب.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { app } from '../../config/firebase.js';

/**
 * Initialize Firestore with long-polling enabled. Long-polling is required
 * for cloud IDEs (Codespaces, Stackblitz, …) and for some restrictive
 * corporate networks. It also works fine in normal browsers.
 *
 * ★★★ Also enables a PERSISTENT local cache (offline-first): writes are
 * accepted while offline and flushed automatically when the connection
 * returns, and reads are served from disk. **This is what lets warehouse staff
 * keep scanning on a weak/absent connection without losing a single entry.**
 * `persistentMultipleTabManager` keeps several open tabs consistent.
 *
 * ⚠️ وهذا السطرُ هو أثقلُ ما على محوَّل PostgreSQL: القاعدةُ العلائقيّةُ لا
 *    تعطي منه شيئًا. فطابورُ الكتابة المحلّيّ (`_db/outbox.js`) يجب أن يُبنى
 *    قبل التحويل لا بعده — وعلامةُ `_pending` تُحفظ باسمها كي يعمل
 *    `stock/scanQueue.js` بلا تعديلِ حرف.
 *
 * `initializeFirestore` may only be called once per app, so we guard against
 * re-initialization on hot module reload.
 */
function createDb() {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

/** مثيلُ القاعدة — واحدٌ للتطبيق كلِّه. */
export const db = createDb();

// ═══ المراجع ═══
export {
  doc,
  collection,
  // ═══ الاستعلام ═══
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  // ═══ القراءة ═══
  getDoc,
  getDocs,
  getDocFromServer,
  onSnapshot,
  // ═══ الكتابة ═══
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  // ═══ القيم الخادميّة ═══
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  // ═══ الأنواع ═══
  Timestamp,
} from 'firebase/firestore';

/** اسمُ المحوَّل — يُقرأ في التشخيص. */
export const BACKEND_NAME = 'firestore';
