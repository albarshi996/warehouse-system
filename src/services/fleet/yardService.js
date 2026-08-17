/**
 * الساحة والأبواب في السحابة ‹EXE-602› — طبقةٌ رقيقة تنفّذ ولا تقرّر.
 *
 * البنية:
 *   doors/{CODE}                   ← سجلّ الأبواب — **بياناتٌ يضيفها المدير** (ت-O04)
 *   yard_visits/{visitId}          ← زيارة مركبةٍ للموقع، بأختام مراحلها
 *      └── events/{eventId}        ← سجلّ تدقيق الانتقالات (إضافة فقط)
 *
 * ═══ ولماذا مجموعتان جديدتان ═══
 * القاعدة الحاكمة: **لا مجموعة Firestore جديدة إلّا ببيّنة أنّ لا نواة تصلح.**
 * والبيّنة هنا: `trips` تصف **رحلاتنا** (مركبتنا تخرج بأمر إرسالية)، وزيارة
 * الساحة قد تكون شاحنةَ **مورّدٍ** لا نملكها ولا رحلةَ لها عندنا؛ وإقحامها في
 * `trips` يُفسد كلّ مؤشّرات الأسطول (POD · OTIF · الوقود) بصفوفٍ لا سائقَ لنا
 * فيها. و`doors` أعلنها `resourcesResolver` مصدرًا منذ EXE-401 ‹source: 'doors'›
 * فهي وعدٌ سابقٌ يُوفى لا اختراعٌ جديد.
 *
 * ═══ والقرار كلّه في `yardModel.js` ═══
 * كلّ حارسٍ هنا **استدعاءٌ** لدالّةٍ خالصة مختبَرة: `visitProblems` ·
 * `canTransitionVisit` · `assignDoorVerdict` · `exitVerdict`. فلا قاعدةَ عملٍ
 * تُكتب في طبقة التخزين، ولا في قاعدة البيانات (قرار المالك: القاعدة مخزنٌ
 * وبوّابةُ مستخدمين لا حاكم).
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import {
  AT_DOOR_STAGES,
  EXIT_STAGE,
  YARD_CANCELED,
  YARD_CYCLE,
  assignDoorVerdict,
  canTransitionVisit,
  doorProblems,
  exitVerdict,
  shapeDoor,
  shapeVisit,
  visitProblems,
  yardStage,
} from './yardModel.js';

const DOORS = 'doors';
const VISITS = 'yard_visits';

/** أحدث ما يُعرض من الزيارات — الساحة تُدار باليوم لا بالتاريخ كلّه. */
export const VISITS_CAP = 200;

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    byRole: profile?.role || '',
  };
}

/** سجلّ تدقيق على الزيارة (إضافة فقط — نمط `trips/events`). */
function logEvent(visitId, action, detail, who) {
  return addDoc(collection(db, VISITS, visitId, 'events'), {
    action,
    detail: detail || '',
    ...who,
    at: serverTimestamp(),
  });
}

/* ═══════════════ الأبواب ═══════════════ */

/** اشتراكٌ حيّ على سجلّ الأبواب (مرتّبًا برمزه). */
export function listenDoors(callback, onError) {
  return onSnapshot(
    query(collection(db, DOORS), orderBy('code')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/**
 * يحفظ بابًا. **معرّفه رمزُه** — فإعادة الحفظ تُحدّث ولا تُضاعف (نمط
 * `handoverDocId`). والرمز يُفحص ضدّ القائمة القائمة قبل الكتابة.
 */
export async function saveDoor(input, existingDoors, profile) {
  const door = shapeDoor(input);
  const others = (existingDoors || []).filter((d) => String(d?.code ?? '').toUpperCase() !== door.code);
  const problems = doorProblems(door, others);
  if (problems.length) throw new Error(problems.join(' · '));

  const who = whoami(profile);
  await setDoc(
    doc(db, DOORS, door.code),
    { ...door, updatedAt: serverTimestamp(), updatedByUid: who.byUid, updatedByName: who.byName },
    { merge: true }
  );
  return door.code;
}

/**
 * يُخرج بابًا من الخدمة أو يُعيده. **لا حذف** — بابٌ محذوفٌ يُفقد أثرَ ما جرى
 * عليه، والزيارات القديمة تُشير إلى رمزٍ لا وجود له.
 */
export function setDoorActive(code, active, profile) {
  const who = whoami(profile);
  return setDoc(
    doc(db, DOORS, String(code || '').toUpperCase()),
    { active: Boolean(active), updatedAt: serverTimestamp(), updatedByUid: who.byUid, updatedByName: who.byName },
    { merge: true }
  );
}

/* ═══════════════ الزيارات ═══════════════ */

/** اشتراكٌ حيّ على زيارات الساحة (الأحدث أوّلًا). */
export function listenYardVisits(callback, onError, max = VISITS_CAP) {
  return onSnapshot(
    query(collection(db, VISITS), orderBy('createdAt', 'desc'), fsLimit(max)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap.metadata.hasPendingWrites),
    (e) => onError?.(e)
  );
}

/**
 * يفتح زيارة. المرحلة الأولى **بحسب الواقع**: مركبةٌ حُجز لها موعدٌ مسبقًا تبدأ
 * «حجزًا»، ومركبةٌ ظهرت على البوّابة بلا موعد تبدأ «وصولًا» — وإجبارُها على
 * المرور بحجزٍ لم يقع يزوّر ختمًا.
 */
export async function openVisit(input, profile, startStage = 'arrived') {
  const visit = shapeVisit(input);
  const problems = visitProblems(visit);
  if (problems.length) throw new Error(problems.join(' · '));

  const stage = yardStage(startStage) && startStage !== YARD_CANCELED.id ? startStage : 'arrived';
  const who = whoami(profile);
  const stamps = {};
  // ختم كلّ مرحلةٍ حتى المرحلة الابتدائية — فمن بدأ «وصولًا» بلا حجزٍ لا
  // يحمل ختم حجزٍ كاذبًا، ومؤقّت الموعد يقول «بلا موعدٍ محجوز» بصدق.
  stamps[yardStage(stage).stamp] = serverTimestamp();

  const ref = await addDoc(collection(db, VISITS), {
    ...visit,
    stage,
    stamps,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: who.byUid,
    createdByName: who.byName,
  });
  await logEvent(ref.id, 'open', `فُتحت الزيارة عند «${yardStage(stage).label}» للوحة ${visit.plate}`, who);
  return ref.id;
}

/** يقرأ زيارةً بمعرّفها أو يرمي. */
async function readVisit(visitId) {
  const snap = await getDoc(doc(db, VISITS, visitId));
  if (!snap.exists()) throw new Error('الزيارة غير موجودة.');
  return { id: snap.id, ...snap.data() };
}

/**
 * ينقل الزيارة مرحلةً واحدة إلى الأمام ويختم لحظتَها **بختم الخادم**.
 *
 * والانتقال يُفحص بـ`canTransitionVisit` لا بشرطٍ يُكتب هنا: القفز يُنتج
 * مؤقّتًا بلا بداية، وفي البوابة يعني خروجًا بلا تصريح.
 */
export async function advanceVisit(visitId, toStage, patch = {}, profile) {
  const current = await readVisit(visitId);
  const target = yardStage(toStage);
  if (!target) throw new Error(`مرحلة غير معروفة: ${toStage}`);
  if (!canTransitionVisit(current.stage, toStage)) {
    const from = yardStage(current.stage);
    throw new Error(`لا انتقال من «${from?.label || current.stage}» إلى «${target.label}» — الدورة تمضي خطوةً خطوة.`);
  }
  if (toStage === EXIT_STAGE) {
    const verdict = exitVerdict({ ...current, ...patch });
    if (!verdict.ok) throw new Error(verdict.problems.join(' · '));
  }

  const who = whoami(profile);
  await updateDoc(doc(db, VISITS, visitId), {
    ...patch,
    stage: toStage,
    [`stamps.${target.stamp}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logEvent(visitId, 'stage', `${yardStage(current.stage)?.label || current.stage} ← ${target.label}`, who);
  return toStage;
}

/**
 * يُسنِد بابًا لزيارة.
 *
 * ⚠️ **حدٌّ صادق:** الفحص يقرأ شاغلي الباب باستعلامٍ ثمّ يكتب — ولا معاملةَ
 * ذرّيّة، لأنّ معاملات Firestore لا تحتمل استعلامًا. فبين القراءة والكتابة
 * نافذةُ سباقٍ نظريّة لو أسند مشرفان البابَ نفسه في اللحظة نفسها. والشاشة
 * تعرض الإشغال حيًّا فيراه الثاني، والبديل (حقلُ «شاغلٍ» مخزَّنٌ على الباب)
 * يُنشئ حالةً تتقادم — وهو أسوأ من نافذةٍ يراها بشرٌ في الشاشة.
 */
export async function assignDoor(visitId, doorCode, profile) {
  const current = await readVisit(visitId);
  const code = String(doorCode || '').toUpperCase();
  const doorSnap = await getDoc(doc(db, DOORS, code));
  if (!doorSnap.exists()) throw new Error(`الباب ${code} غير مسجَّل — أضِفه في سجلّ الأبواب أوّلًا.`);

  const occupied = await getDocs(
    query(collection(db, VISITS), where('doorCode', '==', code), where('stage', 'in', AT_DOOR_STAGES))
  );
  const others = occupied.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.id !== visitId);

  const verdict = assignDoorVerdict(current, { id: doorSnap.id, ...doorSnap.data() }, others);
  if (!verdict.ok) throw new Error(verdict.problems.join(' · '));

  await advanceVisit(visitId, 'atDoor', { doorCode: code }, profile);
  return verdict;
}

/** يُلغي زيارة — **بسببٍ مكتوب**، ولا تُحذف: بقاؤها يُثبت أنّها جاءت ورُدّت. */
export async function cancelVisit(visitId, reason, profile) {
  const note = String(reason || '').trim();
  if (!note) throw new Error('سبب الإلغاء مطلوب — مركبةٌ رُدّت بلا سببٍ لا يُعرف لماذا رُدّت.');
  const current = await readVisit(visitId);
  if (!canTransitionVisit(current.stage, YARD_CANCELED.id)) {
    throw new Error('لا إلغاء بعد بلوغ الباب — التصحيح بمستندٍ لا بإلغاء زيارة.');
  }
  const who = whoami(profile);
  await updateDoc(doc(db, VISITS, visitId), {
    stage: YARD_CANCELED.id,
    cancelReason: note,
    [`stamps.${YARD_CANCELED.stamp}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logEvent(visitId, 'cancel', note, who);
}

/** يوقف الزيارة بسببٍ (أو يرفع الوقف) — الوقف يمنع الخروج ويظهر في التنبيهات. */
export async function holdVisit(visitId, reason, profile) {
  const who = whoami(profile);
  const note = String(reason || '').trim();
  await updateDoc(doc(db, VISITS, visitId), { holdReason: note, updatedAt: serverTimestamp() });
  await logEvent(visitId, note ? 'hold' : 'release', note || 'رُفع الوقف', who);
}

/** سجلّ تدقيق زيارة (الأقدم أوّلًا = تسلسل ما جرى). */
export function listenVisitEvents(visitId, callback, onError) {
  return onSnapshot(
    query(collection(db, VISITS, visitId, 'events'), orderBy('at', 'asc')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** المراحل بالترتيب — تُعاد كما هي كي لا تستورد الشاشة طبقتين. */
export { YARD_CYCLE };
