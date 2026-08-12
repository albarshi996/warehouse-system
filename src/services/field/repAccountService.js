/**
 * تخزين حساب المندوب النقديّ (CC-302 · يُفعّل م٥-أ).
 *
 * المنطق الخالص في `repAccount.js` كان مكتوبًا ومختبَرًا **وبلا مستهلك**:
 * لا مجموعة تحفظ حركاته ولا شاشة تقرؤها — حسابٌ في الذاكرة يموت بإغلاق
 * الصفحة. هنا الوصلة، على نسق `partnerLedgerService` حرفًا بحرف: مجموعة
 * ملحقة-فقط بمعرّفٍ حتميّ (`نوع__معرّف`) فإعادة القيد تكتب فوق نفسها.
 *
 * يُقيَّد عند الإنجاز بجانب قيد الذمم — أفضلَ جهدٍ لا شرطَ اعتماد: فشلُ
 * كتابة سطر النقد لا يُبطل إنجاز مستندٍ تحرّكت بضاعته أو ذمّته فعلًا.
 */
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { cashMoves } from './repAccount.js';

const CASH = 'rep_cash_moves';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || profile?.displayName || auth?.currentUser?.email || 'مستخدم',
    byRole: profile?.role || '',
  };
}

/** استماعٌ لحظيّ لحركات نقد مندوبٍ واحد، أو للكلّ إن لم يُمرَّر اسم. */
export function listenRepCashMoves(rep, callback, onError) {
  const base = collection(db, CASH);
  const q = rep
    ? query(base, where('rep', '==', String(rep).trim()), orderBy('date'))
    : query(base, orderBy('date'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      callback([]);
      onError?.(err);
    }
  );
}

/** قراءةٌ لمرّةٍ واحدة (لحكم الإقفال والتقارير). */
export async function fetchRepCashMoves(rep = '') {
  const base = collection(db, CASH);
  const q = rep ? query(base, where('rep', '==', String(rep).trim())) : base;
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يقيّد أثر مستندٍ على نقد المندوب. يُستدعى عند بلوغ «منجَز» — بجانب قيد
 * الذمم لا بدلًا منه: RCV يُنقص ذمّة العميل **ويزيد جيب المندوب** معًا.
 *
 * يُعيد `null` إن لم يكن للمستند أثرٌ نقديّ — وهذا ليس فشلًا (بيعٌ آجل مثلًا).
 */
export async function postToRepCash(docData, profile) {
  const [move] = cashMoves([docData], { states: [docData?.state || 'done'] });
  if (!move) return null;
  await setDoc(
    doc(db, CASH, move.id),
    { ...move, ...whoami(profile), postedAt: serverTimestamp() },
    { merge: true }
  );
  return move.id;
}
