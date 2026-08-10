/**
 * تخزين المستهدفات — تعريفًا وقراءةً.
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. الحساب كلّه في `achievement.js` الخالص.
 *
 * ولا حقل `achieved` هنا: الإنجاز يُشتقّ لحظة القراءة من المستندات المنجَزة
 * والزيارات. فما يُخزَّن ينحرف، وما يُحسب لا ينحرف — ولا يستطيع أحدٌ تحسين
 * رقمه بتعديل صفٍّ في قاعدة البيانات.
 */
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { targetVerdict } from './targetModel.js';

const TARGETS = 'targets';

function whoami(profile) {
  return {
    byUid: profile?.uid || null,
    byName: profile?.displayName || profile?.email || 'مستخدم',
    byRole: profile?.role || null,
  };
}

/** استماعٌ لحظيّ لكلّ المستهدفات. */
export function listenTargets(callback, onError) {
  return onSnapshot(
    query(collection(db, TARGETS), orderBy('to', 'desc')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** يحفظ مستهدفًا بعد التحقّق — لا يُحفظ ما سيُظهر إنجازه صفرًا أبدًا. */
export async function saveTarget(target, profile) {
  const verdict = targetVerdict(target);
  if (!verdict.ok) throw new Error(verdict.problems.join(' · '));

  const id = String(target?.id || '').trim() || doc(collection(db, TARGETS)).id;
  await setDoc(
    doc(db, TARGETS, id),
    {
      ...target,
      id,
      amount: Number(target.amount) || 0,
      active: target.active !== false,
      ...whoami(profile),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return id;
}

export async function setTargetActive(id, active, profile) {
  await updateDoc(doc(db, TARGETS, id), {
    active: Boolean(active),
    ...whoami(profile),
    updatedAt: serverTimestamp(),
  });
}
