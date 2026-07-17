/**
 * خدمة طلبات التوظيف من الإدارات — منفصلة تمامًا عن `candidates`
 * (بيانات المرشحين الحسّاسة: أسماء · هواتف · سير · رواتب).
 *
 * هنا: أي إدارة تكتب طلبها (مسمّى وظيفي + بطاقة تعريفية) فقط، وتقرأ
 * طلباتها هي دون سواها. المدير العام ومدير المستودع يراجعان كل الطلبات.
 * لا حذف ولا تعديل من صاحب الطلب — القرار يُدوَّن بحالة جديدة لا بمحو
 * (نفس نمط `candidates`/`scans`/`documents` في هذا المشروع).
 */
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

const COL = 'hiring_requests';

/** من يملأ النموذج ويرسل الطلب. تُطابق firestore.rules (عدّلهما معًا). */
export const REQUESTER_ROLES = ['department_user'];

/** من يراجع كل الطلبات (كل الإدارات). تُطابق firestore.rules (عدّلهما معًا). */
export const REVIEWER_ROLES = ['admin', 'warehouse_manager'];

export function canSubmitHiringRequest(role) {
  return REQUESTER_ROLES.includes(role);
}

export function canReviewHiringRequests(role) {
  return REVIEWER_ROLES.includes(role);
}

/** يضيف طلب توظيف جديدًا باسم صاحبه. */
export async function addHiringRequest({ jobTitle, departmentName, description, profile }) {
  const title = String(jobTitle || '').trim();
  const dept = String(departmentName || '').trim();
  const desc = String(description || '').trim();
  if (!title) throw new Error('المسمى الوظيفي إلزامي.');
  if (!dept) throw new Error('اسم الإدارة إلزامي.');

  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('يجب تسجيل الدخول.');

  await addDoc(collection(db, COL), {
    jobTitle: title,
    departmentName: dept,
    description: desc,
    status: 'submitted',
    createdByUid: uid,
    createdByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    createdAt: serverTimestamp(),
  });
}

/** يستمع لطلبات صاحب الحساب هو فقط (الأحدث أولًا). */
export function listenMyHiringRequests(uid, callback, onError) {
  const q = query(collection(db, COL), where('createdByUid', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** يستمع لكل الطلبات من كل الإدارات (للمراجعين فقط — الإلزام في firestore.rules). */
export function listenAllHiringRequests(callback, onError) {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}
