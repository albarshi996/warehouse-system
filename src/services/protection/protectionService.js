/**
 * تخزين سياسات الحماية — مستندٌ واحد لا مجموعة.
 *
 * لماذا مستندٌ واحد `protection_policies/current`؟ لأنّ السياسات تُقرأ **معًا
 * دائمًا** (أيّ حكمٍ على مرتجع يحتاج خريطة الأصناف والفئات والافتراضيّة)، وعددها
 * بالعشرات لا بالآلاف. فمجموعةٌ من مستنداتٍ تعني عشرات القراءات لكلّ حكم. وهو
 * نفس نمط `access_control/matrix` القائم في البوابة.
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. المنطق كلّه في `protectionModel.js`.
 */
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { policyVerdict } from './protectionModel.js';

const REF = ['protection_policies', 'current'];

/** الخريطة الفارغة — بنيةٌ ثابتة فلا يختلف الشكل بين حالةٍ وأخرى. */
export function emptyPolicies() {
  return { default: { type: 'none' }, bySku: {}, byCategory: {} };
}

function whoami(profile) {
  return {
    byUid: profile?.uid || null,
    byName: profile?.displayName || profile?.email || 'مستخدم',
    byRole: profile?.role || null,
  };
}

/** استماعٌ لحظيّ لخريطة السياسات. */
export function listenPolicies(callback, onError) {
  return onSnapshot(
    doc(db, ...REF),
    (snap) => callback(snap.exists() ? { ...emptyPolicies(), ...snap.data() } : emptyPolicies()),
    (err) => onError?.(err)
  );
}

/** قراءةٌ لمرّةٍ واحدة — للحكم على مرتجعٍ خارج شاشةٍ مشتركة. */
export async function fetchPolicies() {
  const snap = await getDoc(doc(db, ...REF));
  return snap.exists() ? { ...emptyPolicies(), ...snap.data() } : emptyPolicies();
}

/**
 * يحفظ الخريطة كاملةً بعد التحقّق من كلّ سياسةٍ فيها.
 * سياسةٌ معطوبة واحدة تُبطل الحفظ — لأنّها ستفشل صامتةً عند أوّل مرتجع.
 */
export async function savePolicies(policies, profile) {
  const all = [
    ['الافتراضيّة', policies?.default],
    ...Object.entries(policies?.bySku || {}).map(([k, v]) => [`الصنف ${k}`, v]),
    ...Object.entries(policies?.byCategory || {}).map(([k, v]) => [`الفئة ${k}`, v]),
  ];
  for (const [label, p] of all) {
    const v = policyVerdict(p);
    if (!v.ok) throw new Error(`${label}: ${v.problems.join(' · ')}`);
  }

  await setDoc(
    doc(db, ...REF),
    {
      default: policies?.default || { type: 'none' },
      bySku: policies?.bySku || {},
      byCategory: policies?.byCategory || {},
      ...whoami(profile),
      updatedAt: serverTimestamp(),
    },
    { merge: false } // استبدالٌ كامل: حذف سياسةٍ يجب أن يُحذفها فعلًا
  );
}
