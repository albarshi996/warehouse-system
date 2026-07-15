/**
 * محرّك المستندات — الطبقة التي تحوّل النماذج من ورقٍ داخل متصفّح إلى مستندات حيّة.
 *
 * المبدأ الحاكم: **محرّك واحد لا 21 تطبيقًا** (ROADMAP §11.2). كل نموذج
 * يصف نفسه في «مخطّط» (schema)، وهذا الملف يتكفّل بالباقي لكل الأنواع:
 * حفظ · ترقيم حقيقي · هوية ووقت · اعتماد حسب الدور · سجلّ تدقيق دائم.
 *
 * البنية (تمتدّ من `operations` الذي نجح):
 *   documents/{docId}            ← رأس المستند + بنوده
 *      └── audit/{entryId}       ← append-only: من فعل ماذا ومتى
 *
 * قاعدة التاريخ: سجلّ التدقيق **لا يُعدَّل ولا يُحذف** — نفس نمط `scans`.
 * والمستند نفسه لا يُحذف أبدًا؛ المستند الخاطئ يُرفض أو يُلغى، ولا يُمحى.
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from './numbering.js';
import { INITIAL_STATE, isEditable, isLegalTransition, canDo, TRANSITIONS } from './states.js';

const DOCS = 'documents';
const AUDIT = 'audit';

/**
 * هوية الكاتب من Firebase Auth مباشرة (لا من الملف الشخصي) — لأن قواعد
 * الأمان تشترط `byUid == request.auth.uid`، وقد يسبق القيدُ تحميلَ الملف.
 */
function currentUid() {
  return auth?.currentUser?.uid || null;
}

function currentName(profile) {
  return profile?.name || auth?.currentUser?.email || 'غير معروف';
}

/** يُضيف قيد تدقيق دائم. لا يُحدَّث ولا يُحذف أبدًا. */
export function appendAudit(docId, { action, note = '', from = '', to = '', profile }) {
  return addDoc(collection(db, DOCS, docId, AUDIT), {
    action,
    note: String(note || ''),
    from,
    to,
    byUid: currentUid(),
    byName: currentName(profile),
    byRole: profile?.role || '',
    at: serverTimestamp(),
  });
}

/**
 * ينشئ مسودّة جديدة ويُعيد معرّفها.
 * بلا رقم رسمي — الرقم يُمنح عند الإرسال (انظر numbering.js).
 */
export async function createDraft({ type, stage = null, profile, header = {}, lines = [] }) {
  const ref = await addDoc(collection(db, DOCS), {
    type,
    stage,
    number: null,
    state: INITIAL_STATE,
    header,
    lines,
    links: {},
    createdByUid: currentUid(),
    createdByName: currentName(profile),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await appendAudit(ref.id, { action: 'create', to: INITIAL_STATE, profile });
  return ref.id;
}

/**
 * يحفظ حقول المسودّة. يرفض الكتابة على مستند غير قابل للتعديل —
 * فالمستند المُرسَل أو المعتمَد لا تتغيّر بياناته من تحت من اعتمده.
 */
export async function saveDocument(docId, { header, lines, links }) {
  const snap = await getDoc(doc(db, DOCS, docId));
  if (!snap.exists()) throw new Error('المستند غير موجود.');
  if (!isEditable(snap.data().state)) {
    throw new Error('لا يمكن التعديل بعد الإرسال — المستند خرج من يدك.');
  }
  const patch = { updatedAt: serverTimestamp() };
  if (header !== undefined) patch.header = header;
  if (lines !== undefined) patch.lines = lines;
  if (links !== undefined) patch.links = links;
  return updateDoc(doc(db, DOCS, docId), patch);
}

/**
 * ينقل المستند إلى حالة جديدة بعد التحقّق من: شرعية النقلة، وصلاحية الدور،
 * ووجود السبب حين يلزم. وعند أول إرسال — يحجز الرقم الرسمي.
 *
 * الرقم يُحجز **مرّة واحدة فقط**: المستند المرفوض الذي يُعاد إرساله يحتفظ
 * برقمه الأصلي، فلا يُهدر رقم ولا يتغيّر مرجع المستند بعد أن عُرف به.
 */
export async function transitionDocument(docId, to, { note = '', profile, schema } = {}) {
  const ref = doc(db, DOCS, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('المستند غير موجود.');

  const data = snap.data();
  const from = data.state;

  if (!isLegalTransition(from, to)) {
    throw new Error(`نقلة غير مسموحة: من «${from}» إلى «${to}».`);
  }

  const transition = (TRANSITIONS[from] || []).find((t) => t.to === to);
  const user = { role: profile?.role, uid: currentUid() };
  if (!canDo(transition, user, schema, data)) {
    throw new Error('لا تملك صلاحية هذا الإجراء.');
  }
  if (transition.needsNote && !String(note).trim()) {
    throw new Error('اكتب السبب أولًا — الرفض بلا سبب لا يُوثَّق.');
  }

  const patch = { state: to, updatedAt: serverTimestamp() };

  if (to === 'submitted' && !data.number) {
    const { number } = await reserveNumber(data.type);
    patch.number = number;
    patch.numberedAt = serverTimestamp();
  }
  if (to === 'approved') {
    patch.approvedByUid = currentUid();
    patch.approvedByName = currentName(profile);
    patch.approvedAt = serverTimestamp();
  }

  await updateDoc(ref, patch);
  await appendAudit(docId, { action: to, note, from, to, profile });
  return patch.number || data.number || null;
}

/** يقرأ مستندًا مرّة واحدة. */
export async function getDocument(docId) {
  const snap = await getDoc(doc(db, DOCS, docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** يستمع لمستند لحظيًّا (ليرى المُنشئ الاعتماد فور وقوعه). */
export function listenDocument(docId, callback) {
  return onSnapshot(doc(db, DOCS, docId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** يستمع لسجلّ التدقيق (الأقدم أولًا — قصّة المستند بالترتيب). */
export function listenAudit(docId, callback) {
  const q = query(collection(db, DOCS, docId, AUDIT), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/**
 * «مستنداتي» — ما أنشأته أنا.
 * نُصفّي بحقل واحد ونرتّب في الواجهة تفاديًا للفهرس المركّب
 * (نفس الدرس المستفاد من شاشة متابعة العمليات).
 */
export function listenMyDocuments(uid, callback, max = 50) {
  const q = query(collection(db, DOCS), where('createdByUid', '==', uid), limit(max));
  return onSnapshot(q, (snap) => callback(sortByCreated(snap)));
}

/** «بانتظار اعتمادي» — كل ما أُرسل ولم يُبتّ فيه. */
export function listenPendingApproval(callback, max = 50) {
  const q = query(collection(db, DOCS), where('state', '==', 'submitted'), limit(max));
  return onSnapshot(q, (snap) => callback(sortByCreated(snap)));
}

/** كل المستندات (للمدير) — الأحدث أولًا. */
export function listenAllDocuments(callback, max = 100) {
  const q = query(collection(db, DOCS), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** ترتيب محلّي بالأحدث — يُغني عن فهرس مركّب مع `where`. */
function sortByCreated(snap) {
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
