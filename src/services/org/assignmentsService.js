/**
 * تسكين الأشخاص في المناصب — سجلٌّ سحابيٌّ ملحق-فقط (لا حذف).
 *
 *   assignments/{id}   ← { jobId, jobTitle, orgNodeId, candidateId, personName,
 *                          active, startedAt, endedAt?, byUid, byName }
 *
 * كلّ تعيينٍ سطرٌ مستقلّ؛ «الشاغل الحاليّ» لوظيفةٍ = أحدث سطرٍ نشط (يُحسب في
 * `assignmentsModel.js`). الإنشاء والإنهاء للمديرَين (والإلزام الحقيقيّ في
 * `firestore.rules`). الإنهاء يضبط `active:false` ولا يحذف — الأثر يبقى.
 */
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

const COL = 'assignments';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع لكل سجلّات التسكين (الأحدث أوّلًا). يُعيد دالّة إلغاء الاشتراك. */
export function listenAssignments(cb, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('startedAt', 'desc')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** تسكين شخصٍ في منصب — خطوةٌ صريحة تُنشئ سجلًّا نشطًا. */
export async function assignToJob({ jobId, jobTitle, orgNodeId, candidateId, personName }, profile) {
  if (!jobId || !personName) throw new Error('التسكين يحتاج منصبًا واسمًا.');
  const ref = await addDoc(collection(db, COL), {
    jobId,
    jobTitle: jobTitle || '',
    orgNodeId: orgNodeId || '',
    candidateId: candidateId || null,
    personName,
    active: true,
    startedAt: serverTimestamp(),
    ...whoami(profile),
  });
  return ref.id;
}

/** إنهاء تسكينٍ قائم (بلا حذف) — يضبط active:false ويسجّل من أنهى ومتى. */
export async function endAssignment(id, profile) {
  const who = whoami(profile);
  await updateDoc(doc(db, COL, id), {
    active: false,
    endedAt: serverTimestamp(),
    endedByUid: who.byUid,
    endedByName: who.byName,
  });
}
