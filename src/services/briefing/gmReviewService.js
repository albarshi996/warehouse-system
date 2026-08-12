/**
 * مزامنة عرض المراجعة التنفيذية للمدير العام — `gm_review/current`.
 *
 * الغرض: شروح العرض ومواقف القرارات وجدول المتابعة والأسعار يحرّرها المدير
 * من الشاشة وتُحفظ في Firestore فتظهر على كل الأجهزة (شاشة الاجتماع،
 * حاسوبه، هاتفه) وتبقى بعد الاجتماع أثرًا.
 *
 * الكتابة للمديرَين فقط (قاعدة gm_review في firestore.rules)، والقراءة لكل
 * مصادَق. Firestore يخزّن محليًا ويرفع عند عودة الشبكة، فالعرض يعمل حتى لو
 * انقطع الاتصال أثناء الاجتماع.
 */
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

const reviewRef = () => doc(db, 'gm_review', 'current');

/** يستمع لحالة العرض لحظيًا. يمرّر null إن لم توجد وثيقة بعد. */
export function subscribeReview(callback) {
  return onSnapshot(
    reviewRef(),
    (snap) => callback(snap.exists() ? snap.data() : null, snap.metadata.hasPendingWrites),
    (error) => {
      console.error('[gm-review] subscribe failed', error);
      callback(null, false);
    }
  );
}

/** يحفظ حالة العرض (دمجًا) مع ختم آخر تعديل وهويته. */
export function saveReview(data) {
  return setDoc(
    reviewRef(),
    { ...data, updatedAt: serverTimestamp(), updatedByUid: auth?.currentUser?.uid || null },
    { merge: true }
  );
}
