/**
 * فرق عمالة الشحن/التفريغ — سجلٌّ سحابيّ يديره مشرف المناولة والمديران.
 *
 *   crews/{id}   ← { crewNo, shift, members[], forkliftDriver{name,licenseNo}, active }
 *
 * لا حذف — الأرشفة بـ active:false (الأثر التنظيميّ يبقى). الإلزام الحقيقيّ
 * في firestore.rules (isLaborWriter).
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

const COL = 'crews';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع للفرق (بترتيب رقم الفريق). يُعيد دالّة إلغاء الاشتراك. */
export function listenCrews(cb, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('crewNo', 'asc')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

function shapeCrew({ crewNo, shift, members, forkliftDriver }) {
  return {
    crewNo: String(crewNo ?? '').trim(),
    shift: String(shift ?? '').trim(),
    members: (members || []).map((m) => String(m).trim()).filter(Boolean),
    forkliftDriver: forkliftDriver?.name
      ? { name: String(forkliftDriver.name).trim(), licenseNo: String(forkliftDriver.licenseNo || '').trim() }
      : null,
  };
}

/** إضافة فريق عملٍ جديد (رقم + وردية «توكة» + أعضاء + سائق فرك اختياريّ). */
export async function addCrew(input, profile) {
  const c = shapeCrew(input);
  if (!c.crewNo || !c.shift) throw new Error('رقم الفريق والوردية مطلوبان.');
  const ref = await addDoc(collection(db, COL), {
    ...c,
    active: true,
    createdAt: serverTimestamp(),
    ...whoami(profile),
  });
  return ref.id;
}

/** تعديل بيانات فريق. */
export async function updateCrew(id, input, profile) {
  await updateDoc(doc(db, COL, id), {
    ...shapeCrew(input),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
}

/** أرشفة/تفعيل فريق (لا حذف). */
export async function setCrewActive(id, active, profile) {
  await updateDoc(doc(db, COL, id), {
    active: Boolean(active),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
}
