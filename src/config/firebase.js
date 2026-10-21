import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

/**
 * Firebase configuration — التطبيقُ والمصادقة.
 *
 * ═══ ما نُقل من هنا (2026-09-02) ═══
 * مثيلُ Firestore (`db`) انتقل إلى [`src/services/_db/firestore.js`]، وصار
 * **الموضعَ الوحيدَ في المشروع** الذي يعرف `firebase/firestore`. والسبب: ٦٢
 * خدمةً كانت تستورد Firestore مباشرةً، فأيُّ تغييرٍ في القاعدة يعني لمسَ ٦٢
 * ملفًّا — وأيُّ نسيانٍ لواحدٍ يعني بابًا خلفيًّا يكتب في القاعدة القديمة
 * ولا يعلم أحد. ويحرس الحدَّ `_db/seam.test.js` فيُسقط `npm test`.
 *
 * وما بقي هنا بقي **بقرار**: المصادقةُ وStorage يبقيان على Firebase بعد هجرة
 * قاعدة البيانات — هجرةٌ واحدةٌ في المرّة.
 *
 * Values are read from environment variables prefixed with `PUBLIC_FIREBASE_`
 * so that Astro will inline them into the client bundle. See `.env.example`
 * for the full list.
 *
 * NOTE: Firebase web API keys are NOT secrets — they are designed to be
 * shipped to browsers. Access is gated by Firebase Auth (email/password) and
 * enforced SERVER-SIDE by the hardened Firestore Security Rules (see
 * `firestore.rules`: role/isActive checks, counter guard, default-deny tail).
 */
// NOTE: `||` (not `??`) so that an EMPTY-string env var (which is what a
// missing `PUBLIC_FIREBASE_*` becomes in CI builds with no `.env`) also falls
// back to the real project values below. `getAuth()` validates the API key
// eagerly at build time, so an empty key would break the static build.
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY || 'AIzaSyAWhqQVdhODZT0bdXnbyYzcmpnv11s9qoU',
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || 'brandzo-erp-2026.firebaseapp.com',
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || 'brandzo-erp-2026',
  storageBucket:
    import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || 'brandzo-erp-2026.firebasestorage.app',
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '991460523040',
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID || '1:991460523040:web:d3c6f76b1ff13a1ab8d045',
};

/**
 * Initialize the Firebase app exactly once (HMR-safe).
 * يُصدَّر كي يبنيَ عليه محوَّلُ Firestore وخدمةُ الأرشيف مثيليهما.
 */
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Firebase Authentication (M1 — الأدوار والصلاحيات).
 * يُستخدم لتسجيل الدخول بالبريد/كلمة المرور وحماية صفحات البوابة.
 * فعّل مزوّد Email/Password من Firebase Console → Authentication → Sign-in method.
 *
 * ★ يبقى على Firebase بعد هجرة قاعدة البيانات: نفسُ البريد ونفسُ كلمة المرور،
 *   ولا حسابَ يُنشأ من جديد ولا موظّفَ يُعلَّم شيئًا. وقاعدةُ PostgreSQL تقرأ
 *   الرمزَ الموقَّع الصادرَ من هنا لتعرف مَن الطالبُ ودورَه.
 */
export const auth = getAuth(app);
