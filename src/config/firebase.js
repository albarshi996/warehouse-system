import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * Firebase configuration.
 *
 * Values are read from environment variables prefixed with `PUBLIC_FIREBASE_`
 * so that Astro will inline them into the client bundle. See `.env.example`
 * for the full list. The fallback values below let the existing demo project
 * keep working in environments where the env vars have not yet been wired up
 * (e.g. local clones before the developer creates a `.env` file).
 *
 * NOTE: Firebase web API keys are NOT secrets — they are designed to be
 * shipped to browsers. The dashboard is currently open access; auth and
 * Firestore Security Rules will be revisited in a later phase.
 */
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAWhqQVdhODZT0bdXnbyYzcmpnv11s9qoU',
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'brandzo-erp-2026.firebaseapp.com',
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ?? 'brandzo-erp-2026',
  storageBucket:
    import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'brandzo-erp-2026.firebasestorage.app',
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '991460523040',
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID ?? '1:991460523040:web:d3c6f76b1ff13a1ab8d045',
};

// Initialize the Firebase app exactly once (HMR-safe).
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Firebase Authentication (M1 — الأدوار والصلاحيات).
 * يُستخدم لتسجيل الدخول بالبريد/كلمة المرور وحماية صفحات البوابة.
 * فعّل مزوّد Email/Password من Firebase Console → Authentication → Sign-in method.
 */
export const auth = getAuth(app);

/**
 * Initialize Firestore with long-polling enabled. Long-polling is required
 * for cloud IDEs (Codespaces, Stackblitz, …) and for some restrictive
 * corporate networks. It also works fine in normal browsers.
 *
 * `initializeFirestore` may only be called once per app, so we guard against
 * re-initialization on hot module reload.
 */
function createDb() {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

export const db = createDb();
