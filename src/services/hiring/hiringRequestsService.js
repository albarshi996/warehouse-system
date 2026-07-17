/**
 * خدمة طلبات التوظيف من الإدارات — منفصلة تمامًا عن `candidates`
 * (بيانات المرشحين الحسّاسة الخاصة بالمالك).
 *
 * هنا كل إدارة تكتب بطاقة تعريفية كاملة عن المرشّح (اسم · مسمّى · هاتف …
 * وسيرة اختيارية) وتقرأ طلباتها هي دون سواها. المدير العام ومدير المستودع
 * يراجعان كل الطلبات. لا حذف ولا تعديل من صاحب الطلب — نفس نمط المشروع
 * (candidates/scans/documents): التصحيح بقيد جديد لا بمحو القديم.
 *
 *   hiring_requests/{id}         ← بطاقة الطلب (خفيفة — بلا ملف السيرة)
 *      └── files/cv              ← السيرة مرمّزة base64 (تُجلب عند الطلب فقط)
 *
 * ⚠️ لا orderBy مع where في الاستعلام: تركيبتهما تفرض فهرسًا مركّبًا في
 *    Firestore. نستعلم بحقل واحد ونرتّب في المتصفح — نفس حلّ «متابعة العمليات».
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { validateCv } from '../recruitment/cvFile.js';

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

/** يشكّل حقول الطلب من مدخلات النموذج (نصوص مشذّبة). */
function shapeFields({ departmentName, name, jobTitle, phone, email, qualification, experienceYears, notes }) {
  return {
    departmentName: String(departmentName ?? '').trim(),
    name: String(name ?? '').trim(),
    jobTitle: String(jobTitle ?? '').trim(),
    phone: String(phone ?? '').trim(),
    email: String(email ?? '').trim(),
    qualification: String(qualification ?? '').trim(),
    experienceYears: Number(experienceYears) || 0,
    notes: String(notes ?? '').trim(),
  };
}

/** يضيف طلب توظيف جديدًا باسم صاحبه، مع سيرة اختيارية. */
export async function addHiringRequest(input) {
  const fields = shapeFields(input);
  if (!fields.departmentName) throw new Error('اسم الإدارة إلزامي.');
  if (!fields.name) throw new Error('اسم المرشّح إلزامي.');
  if (!fields.jobTitle) throw new Error('المسمى الوظيفي إلزامي.');

  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('يجب تسجيل الدخول.');

  let cvMeta = null;
  let cvBase64 = null;
  if (input.cvFile) {
    const check = validateCv(input.cvFile);
    if (!check.ok) throw new Error(check.error);
    cvBase64 = await fileToBase64(input.cvFile);
    cvMeta = { fileName: input.cvFile.name, kind: check.kind, size: input.cvFile.size };
  }

  const ref = await addDoc(collection(db, COL), {
    ...fields,
    status: 'submitted',
    hasCv: Boolean(cvMeta),
    cvMeta,
    createdByUid: uid,
    createdByName: input.profile?.name || auth?.currentUser?.email || 'غير معروف',
    createdAt: serverTimestamp(),
  });

  if (cvMeta) {
    await setDoc(doc(db, COL, ref.id, 'files', 'cv'), { ...cvMeta, data: cvBase64 });
  }
  return ref.id;
}

/** يرتّب لقطة محليًّا بالأحدث أولًا (الطلب المعلّق بلا ختم وقت يُعدّ الأحدث). */
function sortedByNewest(snap) {
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || Infinity) - (a.createdAt?.toMillis?.() || Infinity));
}

/** يستمع لطلبات صاحب الحساب هو فقط (بلا فهرس مركّب — الترتيب محليّ). */
export function listenMyHiringRequests(uid, callback, onError) {
  const q = query(collection(db, COL), where('createdByUid', '==', uid));
  return onSnapshot(q, (snap) => callback(sortedByNewest(snap)), (err) => onError?.(err));
}

/** يستمع لكل الطلبات من كل الإدارات (للمراجعين — الإلزام في firestore.rules). */
export function listenAllHiringRequests(callback, onError) {
  const q = query(collection(db, COL));
  return onSnapshot(q, (snap) => callback(sortedByNewest(snap)), (err) => onError?.(err));
}

/** يجلب السيرة عند الطلب ويفتحها في تبويب (لا تُحمَّل مع القائمة أبدًا). */
export async function openCv(reqId) {
  const snap = await getDoc(doc(db, COL, reqId, 'files', 'cv'));
  if (!snap.exists()) throw new Error('لا سيرة مرفقة لهذا الطلب.');
  const { data, kind, fileName } = snap.data();
  const mime = kind === 'PDF' ? 'application/pdf' : kind === 'PNG' ? 'image/png' : 'image/jpeg';
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'cv';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('تعذّرت قراءة الملف.'));
    r.readAsDataURL(file);
  });
}
