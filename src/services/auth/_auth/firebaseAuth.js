/**
 * محوَّلُ المصادقة القائم — Firebase Auth + ملفُّ الدور من Firestore.
 *
 * ★ نُقل هنا حرفيًّا من `authService.js` دون تغييرٍ في السلوك، ليصير خلف مقبسٍ
 *   مُبدَّل (`_auth/index.js`) كما صار Firestore خلف `_db/`. المصادقةُ تبقى على
 *   Firebase بقرارٍ صريح حتّى يُبنى المحوَّلُ المحليُّ ويُقاس.
 */
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, db } from '../../_db/index.js';
import { auth } from '../../../config/firebase.js';
import { DEFAULT_ROLE } from '../roles.js';

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
 * ‹ODOO-ORD› قراءةُ `users/{uid}` مرّةً واحدةً للصفحة.
 *
 * كلُّ صفحةٍ كانت تقرأ الملفَّ ثلاثَ مرّاتٍ أو أربعًا (AuthGate · RoleNav · UserMenu · جزيرةُ الشاشة) — وطبقةُ «جارٍ التحقّق»
 * تنتظر أبطأها، فحين يضعف الاتّصال يتضاعف الانتظار (قيس 2026-10-22). والجزرُ تتشارك وحدةَ الخدمة في الصفحة الواحدة،
 * فوعدٌ واحدٌ يكفيها كلَّها. ★★ والفشلُ لا يُحفظ: قراءةٌ أسقطتها الشبكة تُحذف فتُعاد عند النداء التالي، وإلّا علق الدورُ
 * الافتراضيُّ على الصفحة كلّها. والصفحةُ التالية (MPA) تبدأ ذاكرةً جديدة.
 */
const profileReads = new Map();

function readUserDoc(uid) {
  if (!profileReads.has(uid)) {
    const read = getDoc(doc(db, 'users', uid)).then((snap) => (snap.exists() ? snap.data() : null));
    read.catch(() => profileReads.delete(uid));
    profileReads.set(uid, read);
  }
  return profileReads.get(uid);
}

/**
 * يقرأ ملف المستخدم من Firestore `users/{uid}` ويحدّد الدور والاسم والحالة.
 * يتحمّل غياب الملف أو تعذّر القراءة بالرجوع للدور الافتراضي الآمن.
 */
export async function fetchUserProfile(userOrUid) {
  if (!userOrUid) return null;

  // ⚠️ يقبل كائن المستخدم **أو** معرّفه نصًّا.
  //
  // ليس تساهلًا في الشكل بل حارسٌ ضدّ عطبٍ وقع فعلًا (2026-08-17): شاشتان
  // مرّرتا `user.uid`، فقُرئ `.uid` من نصٍّ ⟵ `undefined` ⟵ فشلت القراءة ⟵
  // ابتلعها `catch` أدناه ⟵ عاد الدور `viewer`. فظهر المنع للمدير العام نفسه
  // **بلا رسالة خطأ**. وأخطر ما في العطب أنّه صامت: الشاشة تقول «لا صلاحيّة»
  // وهي في الحقيقة لم تعرف من أنت.
  const user = typeof userOrUid === 'string' ? { uid: userOrUid, email: null, displayName: null } : userOrUid;
  if (!user.uid) return null;
  let role = DEFAULT_ROLE;
  let name = user.displayName || (user.email ? user.email.split('@')[0] : 'مستخدم');
  let active = true;

  try {
    const data = await readUserDoc(user.uid);
    if (data) {
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
