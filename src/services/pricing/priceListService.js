/**
 * تخزين قوائم الأسعار (م٣-ج).
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ القرار في `priceListModel.js` الخالص.
 *
 * **لا حذف:** القائمة المنتهية تُعطَّل بـ`active:false` فيبقى أثرها. وفاتورةٌ
 * بيعت بسعر قائمةٍ محذوفة تصير رقمًا بلا مرجع — وهو ما يمنعه المبدأ السابع.
 */
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { listProblems } from './priceListModel.js';

const LISTS = 'price_lists';

/** استماعٌ لحظيّ لكلّ القوائم — تغييرُ سعرٍ يسري على كلّ فاتورةٍ تُفتح بعده. */
export function listenPriceLists(callback, onError) {
  return onSnapshot(
    query(collection(db, LISTS), orderBy('name')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      callback([]); // بلا قوائم ⇒ الكتابة اليدوية — لا تعطيل
      onError?.(err);
    }
  );
}

/** يحفظ قائمةً بعد التحقّق. القائمة المعطوبة لا تُحفظ نصفَ صحيحة. */
export async function savePriceList(list, profile) {
  const problems = listProblems(list);
  if (problems.length) throw new Error(problems.join(' · '));

  const id = String(list?.id || '').trim() || doc(collection(db, LISTS)).id;
  await setDoc(
    doc(db, LISTS, id),
    {
      ...list,
      id,
      active: list.active !== false,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return id;
}

/** تعطيلٌ لا حذف — فيبقى أثر ما بيع بها. */
export function setPriceListActive(id, active, profile) {
  return setDoc(
    doc(db, LISTS, id),
    {
      active: Boolean(active),
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
}
