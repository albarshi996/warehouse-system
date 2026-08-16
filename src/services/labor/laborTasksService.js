/**
 * مهام المناولة — سجلٌّ زمنيٌّ سحابيٌّ ملحق-فقط لكلّ حركة تنزيل/صرف.
 *
 *   labor_tasks/{id}          ← { orderType, docRef{type,number,id}, containerRef,
 *                                 crewId, state, unitsHandled, startedAt, finishedAt,
 *                                 pauseStartedAt, pausedMs, byUid, byName }
 *      └── events/{id}        ← append-only: بدء/إيقاف/استئناف/إنهاء (من ومتى)
 *
 * الأوقات الرسميّة (البدء/الانتهاء) تُختم على الخادم (serverTimestamp) فيُقاس
 * الزمن الفعليّ بدقّة. زمن التوقّف عدّادٌ تراكميّ بالملّي (`pausedMs`) لأن
 * serverTimestamp لا يُخزَّن داخل المصفوفات. الحساب في `laborModel.js`.
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { canTransitionTask } from './laborModel.js';

const COL = 'labor_tasks';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

function logEvent(taskId, actor, type, extra = {}) {
  return addDoc(collection(db, COL, taskId, 'events'), {
    type,
    ...extra,
    byUid: actor.byUid,
    byName: actor.byName,
    at: serverTimestamp(),
  });
}

/** يستمع لكلّ مهام المناولة (الأحدث أوّلًا). يُعيد دالّة إلغاء الاشتراك. */
export function listenLaborTasks(cb, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('createdAt', 'desc')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** إنشاء مهمّة مناولة مربوطةٍ بأمرٍ تشغيليّ وفريق. */
export async function createTask({ orderType, docRef, containerRef, crewId, note }, profile) {
  const actor = whoami(profile);
  if (!orderType || !crewId) throw new Error('نوع الأمر والفريق مطلوبان.');
  const ref = await addDoc(collection(db, COL), {
    orderType,
    docRef: docRef || null, // { type, number, id? }
    containerRef: String(containerRef || '').trim(),
    crewId,
    note: String(note || '').trim(),
    state: 'pending',
    unitsHandled: 0,
    startedAt: null,
    finishedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    createdAt: serverTimestamp(),
    ...actor,
  });
  await logEvent(ref.id, actor, 'created', { crewId, orderType });
  return ref.id;
}

/** بدء المهمّة — يختم وقت البدء على الخادم. */
export async function startTask(task, profile) {
  if (!canTransitionTask(task.state, 'in_progress')) throw new Error('لا يمكن بدء المهمّة من حالتها الحاليّة.');
  const actor = whoami(profile);
  await updateDoc(doc(db, COL, task.id), { state: 'in_progress', startedAt: serverTimestamp() });
  await logEvent(task.id, actor, 'started');
}

/** إيقافٌ مؤقّت — يسجّل لحظة التوقّف (بوقت العميل، تفصيلٌ تشغيليّ). */
export async function pauseTask(task, profile) {
  if (!canTransitionTask(task.state, 'paused')) throw new Error('لا يمكن إيقاف المهمّة من حالتها الحاليّة.');
  await updateDoc(doc(db, COL, task.id), { state: 'paused', pauseStartedAt: Date.now() });
  await logEvent(task.id, whoami(profile), 'paused');
}

/** استئناف — يراكم زمن التوقّف في `pausedMs`. */
export async function resumeTask(task, profile) {
  if (!canTransitionTask(task.state, 'in_progress')) throw new Error('لا يمكن استئناف المهمّة من حالتها الحاليّة.');
  const delta = task.pauseStartedAt ? Math.max(0, Date.now() - task.pauseStartedAt) : 0;
  await updateDoc(doc(db, COL, task.id), { state: 'in_progress', pauseStartedAt: null, pausedMs: increment(delta) });
  await logEvent(task.id, whoami(profile), 'resumed', { pausedMs: delta });
}

/** إنهاء المهمّة — يختم وقت الانتهاء ويسجّل الكميّة المناوَلة. */
export async function finishTask(task, unitsHandled, profile) {
  if (!canTransitionTask(task.state, 'done')) throw new Error('لا يمكن إنهاء المهمّة من حالتها الحاليّة.');
  const units = Number(unitsHandled) || 0;
  await updateDoc(doc(db, COL, task.id), { state: 'done', finishedAt: serverTimestamp(), unitsHandled: units });
  await logEvent(task.id, whoami(profile), 'finished', { unitsHandled: units });
}

/** إلغاء مهمّةٍ لم تبدأ بعد. */
export async function cancelTask(task, profile) {
  if (!canTransitionTask(task.state, 'cancelled')) throw new Error('لا يمكن إلغاء مهمّةٍ بدأت.');
  await updateDoc(doc(db, COL, task.id), { state: 'cancelled' });
  await logEvent(task.id, whoami(profile), 'cancelled');
}

/**
 * ═══ مهامّ التخزين والسحب — تُنفَّذ بندًا بندًا (LOC-402) ═══
 */

/**
 * يحفظ بنود المهمّة بعد كلّ مسح، ويُقيّد المسح **حدثًا ملحقًا** في `events`.
 *
 * الحفظ بعد كلّ مسحة لا في آخر المهمّة: العامل قد ينقطع اتصاله أو ينتهي دوامه
 * أو يسقط هاتفه — وما مُسح فعلًا لا يجوز أن يضيع لأنّ المهمّة لم تُغلق.
 *
 * والتجاوز يُقيَّد بحكم النظام وسبب المخالف معًا (قرار المالك LOC-O12)، فيقرأ
 * المدير لاحقًا **لماذا** لا **ماذا** فقط.
 */
export async function saveTaskLines(task, lines, profile, entry = null) {
  await updateDoc(doc(db, COL, task.id), {
    lines,
    updatedAt: serverTimestamp(),
    ...(task.state === 'pending' ? { state: 'in_progress', startedAt: serverTimestamp() } : {}),
  });
  if (entry) {
    await logEvent(task.id, whoami(profile), entry.override ? 'scan-override' : 'scan', {
      locationCode: entry.locationCode,
      sku: entry.sku,
      batch: entry.batch,
      qty: entry.qty,
      ...(entry.override ? { systemVerdict: entry.overrideReason, note: entry.overrideNote } : {}),
    });
  }
}

/**
 * إنهاء مهمّةٍ بندِيّة بحكم `finishVerdict`.
 *
 * ★★ **الإنجاز الجزئيّ لا يُغلقها**: الحكم يُعيد `paused` ما بقي متبقٍّ، فلا
 * يظنّ أحدٌ أنّ الشحنة خُزّنت كاملة. والوحدات المناوَلة تُحسب من البنود لا
 * تُكتب بيد.
 */
export async function finishLineTask(task, verdict, lines, profile) {
  const units = (lines || []).reduce((s, l) => s + (Number(l.qtyDone) || 0), 0);
  const patch = { lines, unitsHandled: units, updatedAt: serverTimestamp() };

  if (verdict.nextState === 'done') {
    if (!canTransitionTask(task.state, 'done')) throw new Error('لا يمكن إنهاء المهمّة من حالتها الحاليّة.');
    Object.assign(patch, { state: 'done', finishedAt: serverTimestamp() });
  } else if (task.state === 'in_progress') {
    Object.assign(patch, { state: 'paused', pauseStartedAt: Date.now() });
  }

  await updateDoc(doc(db, COL, task.id), patch);
  await logEvent(task.id, whoami(profile), verdict.partial ? 'partial-finish' : 'finished', {
    unitsHandled: units,
    remaining: (lines || []).reduce((s, l) => s + Math.max(0, (Number(l.qtyRequired) || 0) - (Number(l.qtyDone) || 0)), 0),
  });
}
