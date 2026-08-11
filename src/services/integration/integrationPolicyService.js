/**
 * تخزين سياسة التكامل (م٧-أ).
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ المنطق في `integrationPolicy.js`.
 *
 * مستندٌ واحد `integration_policy/current` — كـ`settings/current` تمامًا. وكلّ
 * حفظٍ منسوبٌ لصاحبه: تغييرُ اتّجاه التكامل قرارٌ يُعرف من اتّخذه.
 */
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { fullPolicy, policyProblems } from './integrationPolicy.js';

const COL = 'integration_policy';
const DOC_ID = 'current';
const ref = () => doc(db, COL, DOC_ID);

/** اشتراكٌ حيّ بالسياسة المطبَّعة. الفشل يعطي الافتراض — أي سلوك اليوم. */
export function listenIntegrationPolicy(callback, onError) {
  return onSnapshot(
    ref(),
    (snap) => callback(fullPolicy(snap.exists() ? snap.data()?.types : null), { exists: snap.exists() }),
    (err) => {
      callback(fullPolicy({}), { exists: false });
      onError?.(err);
    }
  );
}

/** قراءةٌ لمرّةٍ واحدة (للجسر خارج React). تعود بالافتراض عند أيّ تعذّر. */
export async function getIntegrationPolicy() {
  try {
    const snap = await getDoc(ref());
    return fullPolicy(snap.exists() ? snap.data()?.types : null);
  } catch {
    return fullPolicy({});
  }
}

/** يحفظ السياسة بعد التحقّق والتطبيع — فلا يصل إلى القاعدة تناقضٌ صريح. */
export async function saveIntegrationPolicy(types, profile) {
  const clean = fullPolicy(types);
  const problems = policyProblems(clean);
  if (problems.length) throw new Error(problems.join(' · '));
  await setDoc(
    ref(),
    {
      types: clean,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return clean;
}
