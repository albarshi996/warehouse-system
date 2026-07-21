/**
 * خدمة المصادقة — طبقة رقيقة فوق Firebase Auth + Firestore.
 * تُستخدم من شاشة الدخول والحارس وقائمة المستخدم.
 *
 * ملاحظة أمنية: هذا حارس على مستوى تجربة الاستخدام (UX). الإلزام الحقيقي
 * يبقى في الحرّاس الستة في موديول أودو + قواعد أمان Firestore.
 */
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase.js';
import { DEFAULT_ROLE } from './roles.js';

/**
 * حسابات تُمنح دور الأدمن تلقائيًّا حتى قبل إنشاء ملف الدور في Firestore.
 * تمهيدٌ لأول دخول للمالك — لاحقًا تُدار الأدوار من صفحة إدارة المستخدمين.
 */
const ADMIN_BOOTSTRAP_EMAILS = ['albarshi.96@gmail.com'];

/** يشترك في تغيّر حالة الدخول. يُعيد دالة إلغاء الاشتراك. */
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** تسجيل الدخول بالبريد وكلمة المرور (يُبقي الجلسة محليًّا بين الزيارات). */
export async function signIn(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, String(email).trim(), password);
  return cred.user;
}

/** تسجيل الخروج. */
export function signOutUser() {
  return signOut(auth);
}

/** يرسل بريد إعادة تعيين كلمة المرور إلى العنوان المُدخل. */
export function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, String(email).trim());
}

/**
 * يقرأ ملف المستخدم من Firestore `users/{uid}` ويحدّد الدور والاسم والحالة.
 * يتحمّل غياب الملف أو تعذّر القراءة بالرجوع للدور الافتراضي الآمن.
 */
export async function fetchUserProfile(user) {
  if (!user) return null;
  let role = DEFAULT_ROLE;
  let name = user.displayName || (user.email ? user.email.split('@')[0] : 'مستخدم');
  let active = true;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data();
      if (data.role) role = data.role;
      if (data.name) name = data.name;
      if (typeof data.active === 'boolean') active = data.active;
    }
  } catch {
    // قواعد أمان/شبكة منعت القراءة — نُبقي الافتراضي الآمن.
  }

  // تمهيد الأدمن: بريد في قائمة التمهيد يُمنح admin حتى دون ملف.
  if (user.email && ADMIN_BOOTSTRAP_EMAILS.includes(user.email.toLowerCase())) {
    role = 'admin';
  }

  return { uid: user.uid, email: user.email, name, role, active };
}

/** يترجم رمز خطأ Firebase Auth إلى رسالة عربية واضحة. */
export function authErrorMessage(code) {
  const map = {
    'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
    'auth/user-disabled': 'هذا الحساب معطّل. راجع مدير النظام.',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة.',
    'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
    'auth/network-request-failed': 'تعذّر الاتصال بالشبكة. تحقّق من الإنترنت.',
    'auth/operation-not-allowed':
      'الدخول بالبريد وكلمة المرور غير مفعّل بعد. فعّله من Firebase Console.',
    'auth/configuration-not-found':
      'الدخول بالبريد وكلمة المرور غير مفعّل بعد. فعّله من Firebase Console → Authentication.',
  };
  return map[code] || 'تعذّر تسجيل الدخول. حاول مرّة أخرى.';
}

/** المسار الأساسي للموقع دون الشرطة الأخيرة (مثال: "/warehouse-system"). */
export function getBasePath() {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}
