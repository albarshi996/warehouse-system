/**
 * خدمة ماستر المندوبين (SAP-21) — الكتابة والقراءة على Firestore.
 * كلّ الحكم في `repModel.js` الخالص المُختبَر؛ هنا الجلب والحفظ.
 *
 * البنية: `sales_reps/{autoId}` — القراءة لكلّ مصادَق (قوائم SAP-20 تنبثق
 * منها لكلّ من يُنشئ مستندًا)، والكتابة للمديرَين ومشرف المبيعات، ولا حذف
 * (أرشفة — مندوبٌ له رحلاتٌ وعُهدٌ يبقى أثره).
 */
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { repVerdict } from './repModel.js';

const COL = 'sales_reps';

/** اشتراك لحظيّ بالمندوبين — الاسم ترتيبًا. */
export function subscribeReps(onChange, onError, { includeArchived = false } = {}) {
  const q = query(collection(db, COL), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onChange(includeArchived ? rows : rows.filter((r) => !r.archived));
    },
    (err) => onError?.(err)
  );
}

/** إنشاء مندوب — الحكم في repVerdict (الاسم إلزاميّ ولا تكرار). */
export async function createRep(raw, existingNames = []) {
  const verdict = repVerdict(raw, existingNames);
  if (!verdict.ok) {
    const err = new Error('لا يُسجَّل:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const ref = await addDoc(collection(db, COL), {
    ...verdict.rep,
    archived: false,
    uid: null, // يُربط بحساب دخولٍ لاحقًا إن أُنشئ (CC-602) — لا ازدواج
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** تعديل مندوبٍ قائم — الاسم يُفحص ضدّ البقيّة لا ضدّ نفسه. */
export async function updateRep(id, raw, existingNames = []) {
  const verdict = repVerdict(raw, existingNames);
  if (!verdict.ok) {
    const err = new Error('لا يُحفظ:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  await updateDoc(doc(db, COL, id), { ...verdict.rep, updatedAt: serverTimestamp() });
}

/** أرشفة ناعمة — لا حذف: مندوبٌ له رحلاتٌ يبقى أثره. */
export const archiveRep = (id) =>
  updateDoc(doc(db, COL, id), { archived: true, active: false, updatedAt: serverTimestamp() });

export const unarchiveRep = (id) =>
  updateDoc(doc(db, COL, id), { archived: false, active: true, updatedAt: serverTimestamp() });
