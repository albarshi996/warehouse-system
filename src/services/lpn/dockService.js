/**
 * خدمة جلسات الأبواب ‹LPN-715…718› — تنفّذ ولا تقرّر.
 *
 * البنية:
 *   dock_sessions/{id}       ← جلسةُ بابٍ واحدة بنمطها: تحميلٌ · خروجٌ · استلام
 *
 * ═══ ★★ ولماذا مجموعةٌ **واحدة** لثلاثة أنماط ═══
 * لأنّ الثلاثة **الشيءُ نفسه**: بيّناتُ مسحٍ عند عنوانٍ ماديّ، بفاعلٍ ووقت.
 * وثلاثُ مجموعاتٍ تعني ثلاثَ قراءاتٍ في كلّ سؤالٍ عن سلسلة العهدة، وثلاثَ
 * قواعدَ أمنٍ تفترق أوّلَ تعديل. و`mode` حقلٌ يفصل — لا مجموعة.
 *
 * وهي البيّنةُ نفسها التي بُنيت عليها `yard_visits`: زيارةُ الساحة تصف
 * **المركبة في الموقع**، وهذه تصف **الحمولة عند الباب**. ولا تُغني إحداهما
 * عن الأخرى: شاحنةٌ تقف عند بابٍ زيارةٌ واحدة، وقد تُحمَّل منها ثلاثُ رحلات.
 *
 * ═══ والحكم كلّه في الوحدات الخالصة ═══
 * `dockLoading` · `exitGate` · `inboundDock` · `movementProof` — هذه الطبقة
 * تستدعيها قبل كلّ كتابة ولا تحمل قاعدة عملٍ واحدة.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { applyGateScan, applyItemExtra, applyItemScan, beginLoading, closeDock, openDockSession } from './dockLoading.js';
import { applyExitScan, openExit, stampExit, blockAtGate } from './exitGate.js';
import { applyInboundScan, applyUnload, applyUnloadExtra, beginUnloading, closeInbound, openInbound } from './inboundDock.js';
import { chainFor } from './custodyChain.js';

const SESSIONS = 'dock_sessions';

/** أنماطُ الجلسة الثلاثة — بأسمائها للعرض. */
export const DOCK_MODES = Object.freeze({
  LOAD: 'تحميلٌ عند الباب',
  EXIT: 'خروجٌ من البوّابة',
  INBOUND: 'استلامٌ عند الباب',
});

/** سقفُ القراءة الحيّة — الشاشة تعرض الجاري لا تاريخَ المستودع. */
export const SESSIONS_CAP = 200;

function currentUid() {
  return auth?.currentUser?.uid || null;
}

function nowIso() {
  return new Date().toISOString();
}

/** يقرأ الجلسة الحيّة — أو يرمي إن غابت. */
async function live(id) {
  const snap = await getDoc(doc(db, SESSIONS, id));
  if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
  return { id: snap.id, ...snap.data() };
}

/** نقطةُ كتابةٍ واحدة — لا تتكرّر في عشر دوالّ. */
async function commit(id, session) {
  await setDoc(doc(db, SESSIONS, id), { ...session, updatedAt: serverTimestamp() }, { merge: true });
  return { id, ...session };
}

/** يفتح جلسةً بنمطها — والمنطق الخالص هو من يبنيها. */
export async function openSession(mode, input = {}) {
  const at = input.at || nowIso();
  const built =
    mode === 'LOAD' ? openDockSession({ ...input, at })
      : mode === 'EXIT' ? openExit({ ...input, at })
        : openInbound({ ...input, at });
  if (built.problem) throw new Error(built.problem);

  const ref = await addDoc(collection(db, SESSIONS), {
    ...built.session,
    mode,
    openedByUid: currentUid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, ...built.session, mode };
}

/** يثبّت بيّنةَ خطوةٍ من خطوات البوّابة (بابٌ · مركبةٌ · رحلة). */
export async function scanStep(id, stepId, code, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out =
    session.mode === 'LOAD' ? applyGateScan(session, stepId, code, { ...opts, at })
      : session.mode === 'EXIT' ? applyExitScan(session, stepId, code, { ...opts, at })
        : applyInboundScan(session, stepId, code, { ...opts, at });
  if (out.problem) throw new Error(out.problem);
  return commit(id, out.session);
}

/** يبدأ التحميل أو التنزيل — ولا يبدأ قبل اكتمال بيّنات البوّابة. */
export async function beginWork(id, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out = session.mode === 'LOAD' ? beginLoading(session, { ...opts, at }) : beginUnloading(session);
  if (out.problem) throw new Error(out.problem);
  return commit(id, out.session);
}

/** يسجّل حمولةً — محمَّلةً أو منزَّلة، بحالها. */
export async function scanItem(id, code, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out = session.mode === 'LOAD' ? applyItemScan(session, code, { ...opts, at }) : applyUnload(session, code, { ...opts, at });
  if (out.problem) throw new Error(out.problem);
  return commit(id, out.session);
}

/** يسجّل حمولةً زائدةً بقرارٍ وسبب — تُسجَّل ولا تُبتلع. */
export async function scanItemExtra(id, code, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out = session.mode === 'LOAD' ? applyItemExtra(session, code, { ...opts, at }) : applyUnloadExtra(session, code, { ...opts, at });
  if (out.problem) throw new Error(out.problem);
  return commit(id, out.session);
}

/** يغلق الجلسة — تحميلًا أو استلامًا. */
export async function closeSession(id, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out = session.mode === 'LOAD' ? closeDock(session, { ...opts, at }) : closeInbound(session, { ...opts, at });
  if (out.problem) throw new Error(out.problem);
  const saved = await commit(id, out.session);
  return { ...saved, nextStop: out.nextStop ?? '', nextLabel: out.nextLabel ?? '', variance: out.variance ?? null };
}

/**
 * يختم الخروج الفعليّ — مرّةً واحدة.
 * `already` تعود لمسحةٍ ثانيةٍ لمركبةٍ خرجت: تُعلن ولا تُخطئ.
 */
export async function stampExitSession(id, ctx = {}, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out = stampExit(session, ctx, { ...opts, at });
  if (out.problem) throw new Error(out.problem);
  if (out.already) return { already: true, id, ...session };
  const saved = await commit(id, out.session);
  return { ...saved, tripState: out.tripState };
}

/** يوقف مركبةً عند البوّابة بسبب. */
export async function blockSession(id, opts = {}) {
  const session = await live(id);
  const at = opts.at || nowIso();
  const out = blockAtGate(session, { ...opts, at });
  if (out.problem) throw new Error(out.problem);
  return commit(id, out.session);
}

/** استماعٌ حيٌّ للجلسات — بنمطٍ اختياريّ. */
export function listenSessions(callback, { mode = '', max = SESSIONS_CAP, onError } = {}) {
  const base = collection(db, SESSIONS);
  const q = mode ? query(base, where('mode', '==', mode), fsLimit(max)) : query(base, fsLimit(max));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => (onError ? onError(err) : console.error('dock_sessions', err))
  );
}

/** قراءةٌ لمرّةٍ واحدة — للتتبّع وللتقارير. */
export async function listSessions({ mode = '', max = SESSIONS_CAP } = {}) {
  const base = collection(db, SESSIONS);
  const q = mode ? query(base, where('mode', '==', mode), fsLimit(max)) : query(base, fsLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ★ سلسلةُ العهدة لأيّ كود — تُجمَع الجلسات الثلاث ثمّ يُستدعى القارئ الخالص.
 * وهي **الوصلُ** الذي يجعل `custodyChain` مستدعًى لا مبنيًّا بلا مستدعٍ.
 */
export async function custodyChainFor(code, { max = SESSIONS_CAP } = {}) {
  const all = await listSessions({ max });
  return chainFor(code, {
    docks: all.filter((s) => s.mode === 'LOAD'),
    exits: all.filter((s) => s.mode === 'EXIT'),
    inbounds: all.filter((s) => s.mode === 'INBOUND'),
  });
}

export { SESSIONS as DOCK_SESSIONS_COLLECTION };
