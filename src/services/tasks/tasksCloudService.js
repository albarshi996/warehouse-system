/**
 * خدمة المهام المُسنَدة السحابيّة (Firestore).
 *
 * تحوّل «المهام» من أداةٍ محلّيّة (localStorage) إلى نظام إسنادٍ حقيقيّ:
 * المدير يُسنِد مهمّةً لمستخدمٍ فعليّ، فتظهر فورًا عنده؛ والمُسنَد إليه ينفّذ
 * ويردّ؛ وكل حركةٍ تُوثَّق في سجلٍّ ملحق-فقط لا يُعدَّل ولا يُحذف.
 *
 *   tasks/{id}                 ← بطاقة المهمّة (الحالة والطوابع الزمنيّة)
 *      └── events/{eventId}    ← سجلّ التوثيق: created · status · reply · reassigned
 *
 * نمط المشروع (documents/hiring_requests): لا حذف — التصحيح بقيدٍ جديد؛ ولا
 * `orderBy` مع `where` (يفرض فهرسًا مركّبًا) — نستعلم بحقلٍ واحد ونرتّب محلّيًّا.
 * ⚠️ أسماء الحالات والأدوار تُكرَّر في firestore.rules — عدّلهما معًا.
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { listUsers } from '../auth/usersService.js';
import { MANAGER_ROLES } from '../auth/roles.js';
import { TASK_STATUS, EVENT_TYPE, STATUS_LABELS, toMillis } from './taskShape.js';
import { reassignVerdict } from './priority.js';

const COL = 'tasks';

/** من يُسنِد المهام (الواجهة + firestore.rules). المدير العام ومدير المستودع. */
export function canAssignTasks(role) {
  return MANAGER_ROLES.includes(role);
}

/** قائمة المستخدمين القابلين للإسناد إليهم (المفعَّلون فقط، مرتّبون بالاسم). */
export async function assignableUsers() {
  const users = await listUsers();
  return users
    .filter((u) => u.active !== false)
    .map((u) => ({
      uid: u.uid,
      name: u.name || (u.email ? u.email.split('@')[0] : u.uid),
      role: u.role || 'viewer',
      email: u.email || '',
      phone: u.phone || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function currentActor(profile) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('يجب تسجيل الدخول.');
  return {
    uid,
    name: profile?.name || auth?.currentUser?.email || 'غير معروف',
    role: profile?.role || 'viewer',
  };
}

/** يضيف حدثًا لسجلّ التوثيق الملحق-فقط. */
function logEvent(taskId, actor, type, extra = {}) {
  return addDoc(collection(db, COL, taskId, 'events'), {
    type,
    byUid: actor.uid,
    byName: actor.name,
    byRole: actor.role,
    at: serverTimestamp(),
    ...extra,
  });
}

/** ينشئ مهمّةً ويُسنِدها لمستخدم، ويكتب أول حدثٍ توثيقيّ. يُعيد المعرّف. */
export async function createTask(input, profile) {
  const actor = currentActor(profile);
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('عنوان المهمّة إلزاميّ.');
  const assignee = input.assignee;
  if (!assignee?.uid) throw new Error('اختر المُسنَد إليه.');

  const ref = await addDoc(collection(db, COL), {
    title,
    description: String(input.description ?? '').trim(),
    priority: input.priority || 'low',
    dept: String(input.dept ?? '').trim(),
    tags: Array.isArray(input.tags) ? input.tags : [],
    checklist: Array.isArray(input.checklist)
      ? input.checklist.map((s) => ({ text: String(s.text ?? '').trim(), done: !!s.done }))
      : [],
    dueDate: input.dueDate || '',
    dueTime: input.dueTime || '',

    // ‹EXE-103› رأس العمل الميدانيّ — **بلا بنودٍ وبلا زمن**: البنود يكتبها
    // `WorkerTaskPanel` في `labor_tasks` منذ LOC-401، ونسخةٌ ثانية منها هنا
    // تصير رقمًا ثانيًا للمنجَز. والقسمة كلّها في `taskShape.splitGenerated`.
    workKey: String(input.workKey ?? '').trim(),
    workType: String(input.workType ?? '').trim(),
    docRef: input.docRef || null,
    laborTaskId: String(input.laborTaskId ?? '').trim(),

    createdByUid: actor.uid,
    createdByName: actor.name,
    assigneeUid: assignee.uid,
    assigneeName: assignee.name || 'غير معروف',
    assigneeRole: assignee.role || 'viewer',
    assigneePhone: assignee.phone || '',
    assigneeEmail: assignee.email || '',

    status: TASK_STATUS.ASSIGNED,
    acknowledgedAt: null,
    startedAt: null,
    doneAt: null,
    canceledAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logEvent(ref.id, actor, EVENT_TYPE.CREATED, {
    text: `أُسندت إلى ${assignee.name || ''}`.trim(),
    toStatus: TASK_STATUS.ASSIGNED,
  });
  return ref.id;
}

/** يبني رقعة الطوابع الزمنيّة الموافقة للحالة الجديدة (آلية التنفيذ). */
function stampsFor(toStatus) {
  switch (toStatus) {
    case TASK_STATUS.ACKNOWLEDGED:
      return { acknowledgedAt: serverTimestamp() };
    case TASK_STATUS.IN_PROGRESS:
      // إعادة الفتح من «منجَزة» تُلغي ختم الإنجاز كي لا تُحسب منجَزةً في المقاييس.
      return { startedAt: serverTimestamp(), doneAt: null };
    case TASK_STATUS.DONE:
      return { doneAt: serverTimestamp() };
    case TASK_STATUS.CANCELED:
      return { canceledAt: serverTimestamp() };
    default:
      return {};
  }
}

/** ينقل حالة المهمّة ويُوثّق الانتقال (يُستدعى من المُسنَد إليه أو المدير). */
export async function setStatus(taskId, fromStatus, toStatus, profile) {
  const actor = currentActor(profile);
  await updateDoc(doc(db, COL, taskId), {
    status: toStatus,
    ...stampsFor(toStatus),
    updatedAt: serverTimestamp(),
  });
  await logEvent(taskId, actor, EVENT_TYPE.STATUS, {
    fromStatus,
    toStatus,
    text: `${STATUS_LABELS[fromStatus] || fromStatus} ← ${STATUS_LABELS[toStatus] || toStatus}`,
  });
}

/** يحدّث قائمة التحقّق (بلا حدثٍ لكل نقرة كي يبقى الخيط نظيفًا). */
export function updateChecklist(taskId, checklist) {
  return updateDoc(doc(db, COL, taskId), {
    checklist: checklist.map((s) => ({ text: s.text, done: !!s.done })),
    updatedAt: serverTimestamp(),
  });
}

/** آلية الردّ: يكتب ردًّا/تعليقًا في خيط المهمّة (المُسنَد إليه أو المدير). */
export async function addReply(taskId, text, profile) {
  const actor = currentActor(profile);
  const body = String(text ?? '').trim();
  if (!body) throw new Error('اكتب ردًّا أولًا.');
  await logEvent(taskId, actor, EVENT_TYPE.REPLY, { text: body });
}

/** إعادة الإسناد لمستخدمٍ آخر (المدير فقط — الإلزام في firestore.rules). */
export async function reassignTask(taskId, assignee, profile, reason = '', currentAssignee = '') {
  const actor = currentActor(profile);
  // ‹EXE-303› الحكم من `priority.js` الخالص — والخدمة تنفّذ ولا تقرّر.
  // والسبب مطلوب: نقلُ عملٍ بلا سبب يجعل تقرير الإنتاجيّة يظلم من سُحبت منه.
  const verdict = reassignVerdict({ assigneeUid: currentAssignee }, { toUid: assignee?.uid, reason });
  if (!verdict.ok) throw new Error(verdict.problem);
  await updateDoc(doc(db, COL, taskId), {
    assigneeUid: assignee.uid,
    assigneeName: assignee.name || 'غير معروف',
    assigneeRole: assignee.role || 'viewer',
    assigneePhone: assignee.phone || '',
    assigneeEmail: assignee.email || '',
    updatedAt: serverTimestamp(),
  });
  await logEvent(taskId, actor, EVENT_TYPE.REASSIGNED, {
    text: `أُعيد الإسناد إلى ${assignee.name || ''} — ${String(reason).trim()}`.trim(),
    reason: String(reason).trim(),
  });
}

/**
 * ‹EXE-103› يربط البطاقة بسجلّ تنفيذها في `labor_tasks` — **معرّفٌ لا نسخة**.
 *
 * ولا تُكتب هنا حالةٌ ولا زمن: الحالة المستنبَطة من الميدان **تُحسب عند
 * القراءة** بـ`bridgeVerdict`، والزمن يبقى في `labor_tasks` وحدها. فالخدمة
 * تنفّذ ولا تقرّر.
 */
export async function linkLaborTask(taskId, laborTaskId, profile) {
  const actor = currentActor(profile);
  const id = String(laborTaskId ?? '').trim();
  if (!id) throw new Error('معرّف مهمّة المناولة مطلوب.');
  await updateDoc(doc(db, COL, taskId), { laborTaskId: id, updatedAt: serverTimestamp() });
  await logEvent(taskId, actor, EVENT_TYPE.STATUS, { text: `رُبطت بسجلّ التنفيذ ${id}` });
}

/** يرتّب لقطة المهام بالأحدث أولًا (بلا ختم وقتٍ = الأحدث). */
function sortedByNewest(snap) {
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toMillis(b.createdAt) ?? Infinity) - (toMillis(a.createdAt) ?? Infinity));
}

/** يستمع للمهام المُسنَدة إليّ (المُنفِّذ). */
export function listenAssignedToMe(uid, cb, onError) {
  const q = query(collection(db, COL), where('assigneeUid', '==', uid));
  return onSnapshot(q, (s) => cb(sortedByNewest(s)), (e) => onError?.(e));
}

/** يستمع للمهام التي أنشأتُها (المُسنِد). */
export function listenCreatedByMe(uid, cb, onError) {
  const q = query(collection(db, COL), where('createdByUid', '==', uid));
  return onSnapshot(q, (s) => cb(sortedByNewest(s)), (e) => onError?.(e));
}

/** يستمع لكل المهام (للمديرين — الإلزام في firestore.rules). */
export function listenAllTasks(cb, onError) {
  return onSnapshot(collection(db, COL), (s) => cb(sortedByNewest(s)), (e) => onError?.(e));
}

/** يستمع لسجلّ توثيق مهمّةٍ، مرتّبًا زمنيًّا (الأقدم أولًا = تسلسل الخيط). */
export function listenEvents(taskId, cb, onError) {
  return onSnapshot(
    collection(db, COL, taskId, 'events'),
    (s) => {
      const events = s.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (toMillis(a.at) ?? Infinity) - (toMillis(b.at) ?? Infinity));
      cb(events);
    },
    (e) => onError?.(e)
  );
}

/** يُطبّع مهام Firestore لصيغة مقاييس معدّل الاستجابة (طوابع بالميلي-ثانية). */
export function normalizeForMetrics(tasks) {
  return tasks.map((t) => ({
    assigneeUid: t.assigneeUid,
    assigneeName: t.assigneeName,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    createdAtMs: toMillis(t.createdAt),
    acknowledgedAtMs: toMillis(t.acknowledgedAt),
    doneAtMs: toMillis(t.doneAt),
  }));
}
