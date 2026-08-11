/**
 * تخزين دفتر الذمم (م٤-ج).
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ الحساب في `partnerLedger.js` الخالص.
 *
 * ═══ ملحق فقط، ومعرّفٌ حتميّ ═══
 * `partner_ledger/{نوع__معرّف}` — فإعادة القيد تكتب فوق نفسها ولا تُضاعف
 * (نفس ضمانة دفتر المخزون). ولا تعديل ولا حذف: التصحيح قيدٌ مضادّ.
 *
 * ═══ لماذا يُقيَّد ولا يُشتقّ لحظةَ القراءة ═══
 * المبدأ الثالث يقول «ما يُحسب لا يُخزَّن». والذمّة استثناءٌ مقصود: مبلغ الفاتورة
 * **واقعةٌ وقعت بسعر يومها**، فلو اشتُقّ لاحقًا من بنودٍ تغيّر سعرُها أو من قائمة
 * أسعارٍ حُدِّثت، تغيّر دَينٌ ثبت في ذمّة العميل. والرصيد نفسه يبقى مشتقًّا من
 * السطور لا مخزَّنًا — فالمخزَّن هو الواقعة، والمحسوب هو الرصيد.
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { entryFor, closeoutEntry } from './partnerLedger.js';

const LEDGER = 'partner_ledger';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || profile?.displayName || auth?.currentUser?.email || 'مستخدم',
    byRole: profile?.role || '',
  };
}

/** استماعٌ لحظيّ لسطور طرفٍ واحد، أو للكلّ إن لم يُمرَّر رمز. */
export function listenPartnerLedger(partyCode, callback, onError) {
  const base = collection(db, LEDGER);
  const q = partyCode
    ? query(base, where('partyCode', '==', String(partyCode).toUpperCase()), orderBy('date'))
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

/** قراءةٌ لمرّةٍ واحدة (للتقارير). */
export async function fetchPartnerLedger(partyCode = '') {
  const base = collection(db, LEDGER);
  const q = partyCode ? query(base, where('partyCode', '==', String(partyCode).toUpperCase())) : base;
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يقيّد أثر مستندٍ في دفتر الذمم. يُستدعى عند بلوغ «منجَز» — بجانب قيد المخزون
 * لا بدلًا منه: المستند الواحد قد يُحرّك رفًّا **و**ذمّة.
 *
 * يُعيد `null` إن لم يكن للمستند أثرٌ ماليّ — وهذا ليس فشلًا.
 */
export async function postToPartnerLedger(docData, profile) {
  const entry = entryFor(docData);
  if (!entry) return null;
  await setDoc(
    doc(db, LEDGER, entry.id),
    { ...entry, ...whoami(profile), postedAt: serverTimestamp() },
    { merge: true }
  );
  return entry.id;
}

/**
 * تصفيرٌ موثّق: يُلحق قيدًا مضادًّا ولا يمحو شيئًا.
 * السبب إلزاميّ — تصفيرٌ بلا سببٍ محوٌ مؤجَّل.
 */
export async function closeoutBalance({ partyCode, party, partyName, balance, reason, date }, profile) {
  if (!String(reason || '').trim()) throw new Error('التصفير يحتاج سببًا مكتوبًا — بلا سببٍ فهو محوٌ مؤجَّل.');
  const who = whoami(profile);
  const entry = closeoutEntry({ partyCode, party, partyName, balance, reason, date, byName: who.byName });
  if (!entry) throw new Error('لا رصيد للتصفير.');
  await setDoc(doc(db, LEDGER, entry.id), { ...entry, ...who, postedAt: serverTimestamp() }, { merge: true });
  return entry.id;
}
