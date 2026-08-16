/**
 * الاجتماعات الجماعية في السحابة.
 *
 * تُخزَّن في **نفس مجموعة** `preparatory_meetings` بمعرّف Firestore تلقائيّ
 * ووسمِ `kind:'group'` — لا مجموعة جديدة ولا قاعدة أمانٍ جديدة يُنشرها المالك:
 * القاعدة المنشورة أصلًا تُجيز للمدير إنشاء اجتماعٍ بأيّ معرّف، وتحرس الرقم
 * الرسميّ (لا يتغيّر بعد حجزه). و`mergeGroupAll` يفلتر الجماعية عن السبعة
 * وعن «التقرير المجمّع» بالوسم، فلا تلتبس.
 *
 * الصوت لا يُخزَّن هنا (قرار المالك: تنزيلٌ محليّ فقط) — يُحفظ **التفريغ
 * النصّيّ** فقط ضمن الوثيقة، فيبقى الأرشيف النصّيّ سحابيًّا بلا خطّة مدفوعة.
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
import { reserveNumber } from '../documents/numberingService.js';
import { MINUTES_NUMBER_TYPE } from './meetingsService.js';
import {
  GROUP_KIND,
  blankGroupMeeting,
  groupItemsPatch,
  groupMinutesVerdict,
  mergeGroupAll,
  canTransitionMeeting,
} from './groupMeetingsModel.js';

const COL = 'preparatory_meetings';

const ref = (id) => doc(db, COL, id);

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** الجسم المكتوب سحابيًّا من اجتماعٍ جماعيّ — الحقول التي تُحفظ فقط. */
function bodyOf(meeting) {
  return {
    kind: GROUP_KIND,
    title: meeting.title || '',
    date: meeting.date || '',
    place: meeting.place || '',
    goal: meeting.goal || '',
    notes: meeting.notes || '',
    departments: meeting.departments || [],
    attendees: (meeting.attendees || []).filter((a) => String(a.name || '').trim()),
    signatories: (meeting.signatories || []).filter((s) => String(s.name || '').trim()),
    items: groupItemsPatch(meeting),
    // التفريغ النصّيّ (الصوت محليّ لا يُرفع). قد يكبر لاجتماعٍ طويل لكنه نصٌّ
    // خفيف يظلّ دون حدّ الوثيقة (1MB) في الاستعمال العمليّ.
    transcript: Array.isArray(meeting.transcript) ? meeting.transcript : [],
    recordingMeta: meeting.recordingMeta || null,
    state: meeting.state || 'scheduled',
    archived: Boolean(meeting.archived),
  };
}

/**
 * يستمع لكل الاجتماعات الجماعية ويُعيدها قائمةً جاهزةً (مفلترةً بالوسم،
 * مرتّبةً بالأحدث). الاجتماعات السبعة و«التقرير المجمّع» تُستبعَد تلقائيًّا.
 */
export function listenGroupMeetings(callback) {
  return onSnapshot(collection(db, COL), (snap) => {
    const byId = {};
    snap.docs.forEach((d) => {
      byId[d.id] = { id: d.id, ...d.data() };
    });
    callback(mergeGroupAll(byId), snap.metadata.hasPendingWrites);
  });
}

/** ينشئ اجتماعًا جماعيًّا جديدًا بمعرّف Firestore ويُعيد كائنه الجاهز. */
export async function createGroupMeeting(fields, profile) {
  const refNew = doc(collection(db, COL));
  const draft = blankGroupMeeting({ ...fields, id: refNew.id });
  await setDoc(refNew, {
    ...bodyOf(draft),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
  return draft;
}

/**
 * ينشئ اجتماعًا من كائنٍ **مبنيٍّ مسبقًا ببنوده** (مثلًا مخرَج
 * `meetingFromTemplate`) — بخلاف `createGroupMeeting` الذي يبدأ فارغًا، هذا
 * يحفظ البنود المنسوخة من القالب فورًا. يُسنَد له معرّف Firestore جديد.
 */
export async function createGroupMeetingFrom(meeting, profile) {
  const refNew = doc(collection(db, COL));
  const draft = { ...meeting, id: refNew.id, kind: GROUP_KIND };
  await setDoc(refNew, {
    ...bodyOf(draft),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
  return draft;
}

/**
 * يحفظ ما جرى في الاجتماع. `merge:true` فلا يمحو حقلًا لم يُرسَل — الغرفة
 * تحفظ لحظيًّا أثناء الكتابة والتسجيل، والحفظ الجزئيّ هو القاعدة.
 */
export async function saveGroupMeeting(meeting, profile) {
  await setDoc(
    ref(meeting.id),
    { ...bodyOf(meeting), updatedAt: serverTimestamp(), ...whoami(profile) },
    { merge: true }
  );
}

/** تغيير حالة الاجتماع مع فرض آلة الحالات (لا قفز). */
export async function setGroupMeetingState(meeting, to, profile) {
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
 * إصدار المحضر الجماعيّ الرسميّ: يتحقّق، ثم يحجز رقم `MOM` **مرّة واحدة**
 * (يشارك تسلسل المحاضر نفسه)، ثم يثبّت الحالة. إعادة الإصدار تُعيد الرقم
 * القائم ولا تحرق رقمًا جديدًا.
 */
export async function issueGroupMinutes(meeting, profile) {
  const verdict = groupMinutesVerdict(meeting);
  if (!verdict.ok) {
    const err = new Error('المحضر غير مكتمل:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }

  const snap = await getDoc(ref(meeting.id));
  const existing = snap.exists() ? snap.data() : null;
  if (existing?.number) {
    await setDoc(
      ref(meeting.id),
      { state: 'issued', updatedAt: serverTimestamp() },
      { merge: true }
    );
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
export async function signGroupMinutes(meeting, profile) {
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

/**
 * أرشفة اجتماعٍ (لا حذف — القاعدة تمنعه، والأثر التنظيميّ لا يُمحى).
 * تُخفيه من القائمة النشطة ويبقى قابلًا للاسترجاع.
 */
export async function archiveGroupMeeting(meeting, profile, archived = true) {
  await setDoc(
    ref(meeting.id),
    { archived, updatedAt: serverTimestamp(), ...whoami(profile) },
    { merge: true }
  );
}
