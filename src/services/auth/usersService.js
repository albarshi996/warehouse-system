/**
 * إدارة مستندات أدوار المستخدمين في Firestore `users/{uid}`.
 * تُستخدم من صفحة إدارة المستخدمين (للأدمن فقط في الواجهة).
 *
 * ⚠ الأمان الحقيقي في قواعد أمان Firestore: يجب أن تسمح بالكتابة على
 * `users/**` للأدمن فقط، وإلا أمكن لأي مستخدم مصادق ترقية نفسه.
 * القواعد الجاهزة للصق في FIRESTORE_RULES (انظر الصفحة). المرجع: ROADMAP §8 ركيزة 1.
 */
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase.js';

/** يقرأ كل مستندات الأدوار. */
export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/** ينشئ/يحدّث مستند مستخدم (دمج). */
export function upsertUser(uid, data) {
  return setDoc(doc(db, 'users', uid), data, { merge: true });
}

/** يغيّر دور مستخدم. */
export function updateUserRole(uid, role) {
  return updateDoc(doc(db, 'users', uid), { role });
}

/** يفعّل/يعطّل مستخدمًا. */
export function setUserActive(uid, active) {
  return updateDoc(doc(db, 'users', uid), { active });
}
