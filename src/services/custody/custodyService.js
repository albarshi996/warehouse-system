/**
 * العُهد العينية في السحابة (المرجع ٥-١).
 *
 * البنية: custodies/{custodyId} — سند العهدة من الإصدار حتى الإغلاق
 * (إرجاع/فقد/إتلاف). لا حذف: السند المغلق يبقى تاريخًا محاسبيًّا.
 *
 * الرقم الرسمي `CUST-2026-0001` يُحجز عند الإصدار مباشرة — السند بلا رقم
 * لا وجود له (بخلاف الرحلات: العهدة تُوقَّع ورقيًّا لحظة التسليم).
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from '../documents/numbering.js';
import { custodyVerdict, canTransitionCustody } from './custodyModel.js';

const CUSTODIES = 'custodies';

/** نوع عدّاد ترقيم سندات العهدة: CUST-2026-0001. */
export const CUSTODY_NUMBER_TYPE = 'CUST';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع لسجل العُهد كاملًا (الأحدث أولًا). */
export function listenCustodies(callback) {
  const q = query(collection(db, CUSTODIES), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      snap.metadata.hasPendingWrites
    );
  });
}

/**
 * إصدار سند عهدة برقم رسمي: { employeeName, employeeRole, itemKind,
 *   itemDesc, serial, condition, value, notes, issueDate }
 * يرفض السند الناقص (حكم `custodyVerdict`).
 */
export async function issueCustody(record, profile) {
  const verdict = custodyVerdict(record);
  if (!verdict.ok) {
    const err = new Error('سند العهدة ناقص:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const who = whoami(profile);
  const { number } = await reserveNumber(CUSTODY_NUMBER_TYPE);
  const ref = await addDoc(collection(db, CUSTODIES), {
    number,
    employeeName: String(record.employeeName || '').trim(),
    employeeRole: String(record.employeeRole || '').trim(),
    itemKind: String(record.itemKind || '').trim(),
    itemDesc: String(record.itemDesc || '').trim(),
    serial: String(record.serial || '').trim(),
    condition: String(record.condition || '').trim(),
    value: record.value === '' || record.value == null ? null : Number(record.value),
    notes: String(record.notes || '').trim(),
    issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
    state: 'active',
    closeDate: '',
    closeCondition: '',
    closeNotes: '',
    deduction: null,
    createdAt: serverTimestamp(),
    createdByUid: who.byUid,
    createdBy: who.byName,
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, number };
}

/**
 * إغلاق عهدة: to ∈ {returned, lost, damaged}.
 * `payload`: { closeCondition, closeNotes, deduction } — الخصم يُوثَّق هنا
 * ويُعتمد ماليًّا خارج النظام (موافقة HR كما في المرجع).
 */
export async function closeCustody(custodyId, to, payload = {}, profile) {
  const who = whoami(profile);
  const snap = await getDoc(doc(db, CUSTODIES, custodyId));
  if (!snap.exists()) throw new Error('سند العهدة غير موجود');
  const rec = snap.data();
  if (!canTransitionCustody(rec.state, to)) {
    throw new Error(`لا انتقال من «${rec.state}» إلى «${to}» — السند المغلق نهائي`);
  }
  await setDoc(
    doc(db, CUSTODIES, custodyId),
    {
      state: to,
      closeDate: new Date().toISOString().slice(0, 10),
      closeCondition: String(payload.closeCondition || '').trim(),
      closeNotes: String(payload.closeNotes || '').trim(),
      deduction:
        payload.deduction === '' || payload.deduction == null ? null : Number(payload.deduction),
      closedBy: who.byName,
      closedByUid: who.byUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
