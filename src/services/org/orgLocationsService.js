/**
 * تخزين المواقع التنظيميّة (م٦-أ).
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ المنطق في `orgLocations.js` الخالص.
 *
 * **لا حذف:** موقعٌ حُمِّلت عليه تكلفةٌ تاريخيّة لا يُمحى — يُعطَّل بـ`active:false`
 * فتبقى تقارير الأمس مقروءة. ومن حذف موقعًا حوّل تكلفةً حقيقيّةً إلى «غير مربوط».
 */
import { collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { locationProblems } from './orgLocations.js';

const COL = 'org_locations';

/** استماعٌ لحظيّ لكلّ المواقع. الفشل ⇒ قائمةٌ فارغة ⇒ «غير مربوط» لا تعطيل. */
export function listenOrgLocations(callback, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('code')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      callback([]);
      onError?.(err);
    }
  );
}

/**
 * يحفظ موقعًا بعد التحقّق من الشجرة كاملةً — لا من الموقع وحده.
 * فحلقةُ ملكيّةٍ لا تظهر إلّا بالنظر إلى الشجرة، وموقعٌ سليمٌ منفردًا قد يُفسدها.
 */
export async function saveOrgLocation(location, allLocations = [], profile) {
  const others = (allLocations || []).filter((l) => String(l.code).toUpperCase() !== String(location?.code).toUpperCase());
  const problems = locationProblems([...others, location]);
  if (problems.length) throw new Error(problems.join(' · '));

  const code = String(location?.code || '').trim().toUpperCase();
  await setDoc(
    doc(db, COL, code),
    {
      ...location,
      code,
      active: location.active !== false,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return code;
}

/** تعطيلٌ لا حذف — فتبقى تقارير الأمس مقروءة. */
export function setOrgLocationActive(code, active, profile) {
  return setDoc(
    doc(db, COL, String(code).toUpperCase()),
    {
      active: Boolean(active),
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
}
