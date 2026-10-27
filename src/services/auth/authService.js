/**
 * خدمة المصادقة — الواجهةُ العامّة التي يستعملها الدخولُ والحارسُ وقائمةُ المستخدم.
 *
 * ★ الدوالُّ المرتبطةُ بالمزوّد (الاشتراك · الدخول · الخروج · إعادةُ التعيين ·
 *   قراءةُ الملف) تمرّ عبر **مقبس المصادقة** (`_auth/`) المُبدَّل بـ
 *   `PUBLIC_AUTH_BACKEND` — الافتراضُ Firebase، تمامًا كبابِ البيانات (`_db/`).
 *   فهذا الملفُّ لم يعد يستورد Firebase؛ التنفيذُ في `_auth/firebaseAuth.js`.
 *   والمساعدتان أدناه خالصتان لا تخصّان مزوّدًا، فبقيتا هنا.
 *
 * ملاحظة أمنية: هذا حارس على مستوى تجربة الاستخدام (UX). الإلزام الحقيقي
 * يبقى في الحرّاس الستة في موديول أودو + قواعد أمان Firestore.
 */
export {
  subscribeAuth,
  signIn,
  signOutUser,
  sendPasswordReset,
  fetchUserProfile,
  AUTH_BACKEND,
} from './_auth/index.js';

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
