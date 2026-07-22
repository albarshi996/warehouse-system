/**
 * الاجتماعات التحضيرية في السحابة.
 *
 * البنية: `preparatory_meetings/{meetingId}` — معرّف **حتميّ** من البذرة
 * (`M01`…`M07`) لا معرّف عشوائي، فإعادة الحفظ تُحدّث ولا تُنشئ نسخة ثانية.
 *
 * ما يُحفظ هو **ما جرى في الغرفة** فقط (حالة · تاريخ · حاضرون · قرارات)؛
 * أمّا عناوين البنود فتبقى في `meetings-seed.json` وتُدمج عند القراءة
 * (`mergeMeeting`) — فلا تُخزَّن الأجندة مرّتين ولا تنحرف نسختاها.
 *
 * الترقيم الرسمي:
 *   MOM-2026-#### للمحضر · LTR-2026-#### لخطاب الدعوة
 * ويُحجز من عدّاد `counters` بمعاملة، فلا يتكرّر رقم ولو ضُغط مرّتين.
 */
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from '../documents/numbering.js';
import { canTransitionMeeting, minutesVerdict, itemPatch } from './meetingsModel.js';

const COL = 'preparatory_meetings';

/** نوعا العدّاد: محضر اجتماع · خطاب دعوة. */
export const MINUTES_NUMBER_TYPE = 'MOM';
export const LETTER_NUMBER_TYPE = 'LTR';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

const ref = (id) => doc(db, COL, id);

/**
 * يستمع لكل الاجتماعات المحفوظة ويُعيدها خريطةً بالمعرّف —
 * جاهزةً لـ`mergeAll(seed, savedById)`.
 */
export function listenMeetings(callback) {
  return onSnapshot(collection(db, COL), (snap) => {
    const byId = {};
    snap.docs.forEach((d) => {
      byId[d.id] = { id: d.id, ...d.data() };
    });
    callback(byId, snap.metadata.hasPendingWrites);
  });
}

/** قراءة اجتماع واحد لمرة واحدة. */
export async function getMeeting(id) {
  const snap = await getDoc(ref(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * حفظ ما جرى في الاجتماع. يُدمج مع المحفوظ (`merge: true`) فلا يمحو حقلًا
 * لم يُرسَل — الشاشة تحفظ لحظيًّا أثناء الكتابة، والحفظ الجزئي هو القاعدة.
 */
export async function saveMeeting(meeting, profile) {
  const body = {
    state: meeting.state || 'scheduled',
    goal: meeting.goal || '',
    date: meeting.date || '',
    place: meeting.place || '',
    notes: meeting.notes || '',
    attendees: (meeting.attendees || []).filter((a) => String(a.name || '').trim()),
    signatories: (meeting.signatories || []).filter((s) => String(s.name || '').trim()),
    items: (meeting.items || []).map(itemPatch),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  };
  await setDoc(ref(meeting.id), body, { merge: true });
}

/** تغيير حالة الاجتماع مع فرض آلة الحالات (لا قفز). */
export async function setMeetingState(meeting, to, profile) {
  if (!canTransitionMeeting(meeting.state, to)) {
    throw new Error(`لا يجوز الانتقال من «${meeting.state}» إلى «${to}»`);
  }
  await setDoc(
    ref(meeting.id),
    { state: to, updatedAt: serverTimestamp(), ...whoami(profile) },
    { merge: true }
  );
}

/**
 * إصدار المحضر الرسمي: يتحقّق أولًا، ثم يحجز الرقم، ثم يثبّت الحالة.
 * الرقم يُحجز **مرّة واحدة** — إعادة الإصدار تُعيد الرقم القائم ولا تحرق
 * رقمًا جديدًا من العدّاد.
 */
export async function issueMinutes(meeting, profile) {
  const verdict = minutesVerdict(meeting);
  if (!verdict.ok) {
    const err = new Error('المحضر غير مكتمل:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }

  const existing = await getMeeting(meeting.id);
  if (existing?.number) {
    await setDoc(ref(meeting.id), { state: 'issued', updatedAt: serverTimestamp() }, { merge: true });
    return { number: existing.number, reused: true };
  }

  const { number } = await reserveNumber(MINUTES_NUMBER_TYPE);
  await setDoc(
    ref(meeting.id),
    {
      number,
      state: 'issued',
      issuedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...whoami(profile),
    },
    { merge: true }
  );
  return { number, reused: false };
}

/** اعتماد المحضر بعد توقيعه ورقيًّا — نهاية المسار. */
export async function signMinutes(meeting, profile) {
  if (!meeting.number) throw new Error('لا يُعتمد محضر بلا رقم رسمي — أصدره أولًا');
  if (!canTransitionMeeting(meeting.state, 'signed')) {
    throw new Error('المحضر يجب أن يكون صادرًا قبل اعتماده');
  }
  await setDoc(
    ref(meeting.id),
    { state: 'signed', signedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...whoami(profile) },
    { merge: true }
  );
}

/** حجز رقم خطاب الدعوة — مرّة واحدة لكل إدارة. */
export async function issueLetter(meeting, profile) {
  const existing = await getMeeting(meeting.id);
  if (existing?.letterNumber) return { number: existing.letterNumber, reused: true };

  const { number } = await reserveNumber(LETTER_NUMBER_TYPE);
  await setDoc(
    ref(meeting.id),
    { letterNumber: number, letterIssuedAt: serverTimestamp(), ...whoami(profile) },
    { merge: true }
  );
  return { number, reused: false };
}
