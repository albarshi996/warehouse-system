/**
 * خدمة سجلّ الاستثناءات ‹EXE-201› — **تنفّذ ولا تقرّر**.
 *
 *   exceptions/{id}          ← الحقول الثلاثة عشر (الشكل في `exceptions.js`)
 *      └── events/{id}       ← ملحق-فقط: فُتح · تقدّم · صُعّد · أُغلق (من ومتى)
 *
 * كلّ حكمٍ هنا مستوردٌ من `exceptions.js` الخالص: شكلُ المستند، وصلاحيّةُ
 * الانتقال، وحكمُ الإغلاق، والبصمة. فلو استُبدل المخزن غدًا انتقل المنطق كما
 * هو — وهو نصّ قرار المالك: **القاعدة مخزنٌ وبوّابةُ مستخدمين لا حاكم**.
 *
 * ولا حذف (`delete:false` في القواعد): سجلٌّ يُمحى لا قيمة له، والتصحيح
 * استثناءٌ جديد يشير إلى الأوّل.
 */
import {
  collection,
  doc,
  addDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { counterId, formatNumber, nextSeq } from '../documents/numberFormat.js';
import {
  EXCEPTION_PREFIX,
  EXCEPTION_STATUS,
  VANISHED_NOTE,
  detectionsToDrafts,
  reconcileDetections,
  canTransition,
  closeVerdict,
  correctionDraft,
  exceptionProblems,
  fingerprint,
  shapeException,
} from './exceptions.js';

const COL = 'exceptions';
const COUNTERS = 'counters';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

function logEvent(id, actor, type, extra = {}) {
  return addDoc(collection(db, COL, id, 'events'), { type, ...extra, ...actor, at: serverTimestamp() });
}

/** يستمع للاستثناءات (الأحدث كشفًا أوّلًا). يُعيد دالّة إلغاء الاشتراك. */
export function listenExceptions(cb, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('createdAt', 'desc')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** استثناءٌ قائمٌ ببصمته — يُستعمل في `EXE-202` قبل الفتح فلا يتكرّر. */
export async function findByFingerprint(print) {
  const s = await getDocs(query(collection(db, COL), where('fingerprint', '==', String(print || ''))));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يفتح استثناءً برقمٍ رسميّ.
 *
 * الرقم يُحجز داخل معاملةٍ كنمط `numberingService`: موظّفان يفتحان في اللحظة
 * نفسها يأخذ كلٌّ رقمًا مختلفًا. والسنة تُمرَّر (`year`) ولا تُقرأ من ساعة
 * الجهاز — فالمنطق يبقى قابلًا للاختبار والطابع الرسميّ من الخادم.
 */
export async function openException(input, year, profile) {
  const problems = exceptionProblems(input);
  if (problems.length) throw new Error(problems.join(' · '));

  const actor = whoami(profile);
  const shaped = shapeException(input);
  const counterRef = doc(db, COUNTERS, counterId(EXCEPTION_PREFIX, year));

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = nextSeq(snap.exists() ? snap.data().seq : 0);
    tx.set(counterRef, { type: EXCEPTION_PREFIX, year, seq: next }, { merge: true });
    return next;
  });

  const ref = await addDoc(collection(db, COL), {
    ...shaped,
    number: formatNumber(EXCEPTION_PREFIX, year, seq),
    status: EXCEPTION_STATUS.OPEN,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...actor,
  });
  await logEvent(ref.id, actor, 'opened', { fingerprint: shaped.fingerprint });
  return { id: ref.id, number: formatNumber(EXCEPTION_PREFIX, year, seq) };
}

/** ينقل الحالة — والحكم من `canTransition` لا من الخدمة. */
export async function moveException(exception, to, profile, note = '') {
  if (!canTransition(exception?.status, to)) {
    throw new Error(`انتقالٌ غير مسموح من «${exception?.status}» إلى «${to}».`);
  }
  const actor = whoami(profile);
  await updateDoc(doc(db, COL, exception.id), { status: to, updatedAt: serverTimestamp(), ...actor });
  await logEvent(exception.id, actor, 'moved', { toStatus: to, text: String(note || '').trim() });
}

/**
 * يُغلق بقرارٍ مكتوب. والحكم كلّه من `closeVerdict`:
 * القرار يمنع إن غاب، ونقصُ الدليل **يُسجَّل في السجلّ ولا يمنع**.
 */
export async function closeException(exception, { decision, evidenceRef } = {}, profile) {
  const verdict = closeVerdict(exception, { decision, evidenceRef });
  if (!verdict.ok) throw new Error(verdict.problem);

  const actor = whoami(profile);
  await updateDoc(doc(db, COL, exception.id), {
    status: EXCEPTION_STATUS.CLOSED,
    decision: String(decision).trim(),
    evidenceRef: String(evidenceRef || '').trim(),
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...actor,
  });
  await logEvent(exception.id, actor, 'closed', { text: String(decision).trim(), gaps: verdict.gaps });
  return verdict.gaps;
}

/**
 * ‹EXE-202› يُزامن ما يكشفه المحرّك الآن مع السجلّ.
 *
 * **يفتح الجديد ولا يُغلق شيئًا.** الزوال يُعلَّم بملاحظةٍ في سجلّ الأحداث
 * وينتظر قرارًا — وإغلاقٌ تلقائيّ يمحو الأثر فلا يُعرف كم مرّة تكرّرت الحادثة
 * ولا من عالجها.
 *
 * والقرار كلّه في `reconcileDetections` الخالص؛ هذه تكتب ما قرّره.
 *
 * @returns {{opened:Array, active:number, vanished:number}}
 */
export async function syncDetections(detections, existing, year, profile) {
  const drafts = detectionsToDrafts(detections);
  const { toOpen, active, vanished } = reconcileDetections(drafts, existing);
  const actor = whoami(profile);

  const opened = [];
  for (const draft of toOpen) {
    opened.push(await openException(draft, year, profile));
  }
  for (const e of vanished) {
    if (e.vanishedFlagged) continue; // لا يُكرَّر التعليم عند كلّ فحص
    await updateDoc(doc(db, COL, e.id), { vanishedFlagged: true, updatedAt: serverTimestamp(), ...actor });
    await logEvent(e.id, actor, 'vanished', { text: VANISHED_NOTE });
  }
  return { opened, active: active.length, vanished: vanished.length };
}

/** يفتح استثناء تصحيحٍ لمغلَق — جديدٌ يشير إلى الأوّل ولا يمسّه. */
export async function openCorrection(closed, { reason, ...rest }, year, profile) {
  return openException(correctionDraft(closed, { reason, ...rest }), year, profile);
}

export { fingerprint };
