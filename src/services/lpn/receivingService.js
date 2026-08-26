/**
 * خدمة الاستلام السحابيّة — الجلسة والطبالي المسوّدة وتنفيذ قرار الحوكمة.
 *
 * ═══ لماذا تعيش الطبلية في جلستها قبل الاعتماد؟ ═══
 * لأنّ **الهويّة تولد عند الاعتماد** (خطة ٧ رابعًا). فلو أُنشئت الطبلية في
 * `handling_units` وهي قيد القراءة لَاحتاجت هويّةً قبل أوانها — فتُحرق أرقامٌ
 * لكلّ حمولةٍ رُفضت، وتصير المجموعة التي يُفترض أنّها سجلّ الحمولات الرسميّ
 * مقبرةَ مسوّداتٍ لم تدخل المخزن قطّ.
 *
 * فالبنية:
 *   receiving_sessions/{id}          ← الجلسة: الأمر والبنود والطبالي المسوّدة
 *   handling_units/{LPN}             ← لا يدخلها إلّا معتمَدٌ بهويّته
 *
 * ═══ القاعدة الحاكمة ═══
 * **الخدمة تنقل ولا تقرّر.** كلّ حكمٍ من الوحدات الخالصة
 * (`receivingSession` · `receivingScan` · `governanceQueue` · `lpnLifecycle`)
 * — تُستدعى قبل كلّ كتابة، ولا شرطَ عملٍ واحدٌ يُكتب هنا.
 *
 * ولا تكتب هذه الخدمة دفترًا ولا مستندًا (ح-٢): القيد المخزنيّ يقع بمستنده
 * (GRN) في LPN-213، والطبلية غلافُ تجميعٍ يركب فوقه.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

import { openSession, closeSession, abandonSession, applyAccepted, attachPallet, sessionCloseProblem } from './receivingSession.js';
import { scanVerdict, buildRejection } from './receivingScan.js';
import { planDecision } from './governanceQueue.js';
import { addReading } from './lpnContents.js';
import { createHandlingUnit, reserveLpnCode, appendUnitEvent, flagUnit } from './lpnService.js';
import { sessionEventId } from './lpnEvents.js';

const SESSIONS = 'receiving_sessions';

function currentUid() {
  return auth?.currentUser?.uid || null;
}

/** ختمُ الوقت من المستدعي — المنطق الخالص لا يقرأ ساعةً، والخدمة تقرؤها مرّةً. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * فتح جلسة استلام في السحابة.
 *
 * @returns {Promise<{id:string, session:object}>}
 */
export async function startSession(order, progress, { actor, warehouse = '', device = '' } = {}) {
  const built = openSession(order, progress, { actor, at: nowIso(), warehouse, device });
  if (built.problem) throw new Error(built.problem);

  const ref = await addDoc(collection(db, SESSIONS), {
    ...built.session,
    // الطبلية المسوّدة الأولى تُفتح مع الجلسة — العامل يمسح فورًا بلا خطوةٍ زائدة.
    drafts: [emptyDraft(1)],
    openedByUid: currentUid(),
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, session: built.session };
}

/** طبليةٌ مسوّدة فارغة داخل الجلسة — بمعرّفٍ محلّيٍّ لا هويّةٍ دائمة. */
function emptyDraft(index) {
  return { ref: `P${index}`, lines: [], rejections: [], exceptions: [], closedAt: null, state: 'SCANNING' };
}

/** قراءة الجلسة. */
export async function getSession(id) {
  const snap = await getDoc(doc(db, SESSIONS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** استماعٌ حيّ — جهازان على الجلسة نفسها يريان بعضهما. */
export function listenSession(id, onChange) {
  return onSnapshot(doc(db, SESSIONS, id), (snap) => onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

/** الجلسات المفتوحة — لقائمة «تابع جلسةً» على الهاتف. */
export async function listOpenSessions(max = 50) {
  const snap = await getDocs(query(collection(db, SESSIONS), where('state', '==', 'OPEN'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ★★ تسجيل قراءةٍ على طبليةٍ مسوّدة — الحكم أوّلًا ثمّ الكتابة الذرّيّة.
 *
 * المعاملة تقرأ الجلسة الحيّة وتحكم عليها هي لا على نسخة الشاشة: عاملان
 * يمسحان على الجلسة نفسها (وهو مقصودٌ ومبنيّ في الالتقاط) فلا تُمحى قراءةُ
 * أحدهما.
 *
 * @returns {Promise<{ok:boolean, message:string, needsSupervisor?:boolean}>}
 */
export async function scanIntoDraft(sessionId, draftRef, scan, { indexes, actor, device = '', seq = 0, policy } = {}) {
  const ref = doc(db, SESSIONS, sessionId);
  const at = nowIso();

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة — أعد فتحها.');
    const session = { id: snap.id, ...snap.data() };
    if (session.state !== 'OPEN') throw new Error(`الجلسة «${session.state}» — لا قراءة على جلسةٍ مغلقة.`);

    const drafts = session.drafts ?? [];
    const draft = drafts.find((d) => d.ref === draftRef);
    if (!draft) throw new Error(`الطبلية «${draftRef}» ليست في هذه الجلسة.`);
    if (draft.state !== 'SCANNING') throw new Error('الطبلية أُغلقت للحوكمة — افتح طبليةً جديدة.');

    // الحكم من المنطق الخالص على البيانات الحيّة — بنودُ الطبلية الجارية
    // تُمرَّر كي تعمل أحكام الخلط والصلاحية على واقعها لا على فراغ.
    const verdict = scanVerdict(session, { ...scan, palletLines: draft.lines }, { indexes, asOf: at.slice(0, 10), policy });
    if (!verdict.ok) {
      // ★ الاستثناء يُسجَّل ولا يُنسى — الباركود المجهول والصنف الغريب
      // يبقيان أثرًا للحوكمة حتى وإن لم يدخلا الحمولة.
      if (verdict.exception) {
        const withException = drafts.map((d) =>
          d.ref === draftRef ? { ...d, exceptions: [...(d.exceptions ?? []), { ...verdict.exception, actor, at }] } : d
        );
        tx.update(ref, { drafts: withException });
      }
      return { ok: false, message: verdict.message, needsSupervisor: verdict.needsSupervisor === true };
    }

    const added = addReading(draft.lines, verdict.entry, { asOf: at.slice(0, 10), policy });
    if (added.problem) return { ok: false, message: added.problem };

    const nextDrafts = drafts.map((d) => (d.ref === draftRef ? { ...d, lines: added.lines } : d));
    const nextSession = applyAccepted({ ...session, drafts: nextDrafts }, {
      lineId: verdict.entry.lineId,
      qty: verdict.entry.baseQty ?? verdict.entry.qty,
    });

    tx.update(ref, {
      drafts: nextDrafts,
      lines: nextSession.lines,
      lastScanAt: at,
      lastScanBy: actor ?? '',
      // معرّفٌ حتميّ للقراءة — إعادة الإرسال بعد انقطاعٍ لا تضاعف.
      lastScanId: sessionEventId(`LPN-TMP-00000000-000001`, device || 'WEB', Number(seq) || 0) ?? '',
    });
    return { ok: true, message: '' };
  });
}

/** تسجيل كمّيّةٍ مرفوضة — لا تدخل الحمولة وتذهب للحوكمة. */
export async function rejectIntoDraft(sessionId, draftRef, rejection, { actor } = {}) {
  const built = buildRejection({ ...rejection, actor, at: nowIso() });
  if (built.problem) throw new Error(built.problem);

  const ref = doc(db, SESSIONS, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
    const drafts = snap.data().drafts ?? [];
    const next = drafts.map((d) => (d.ref === draftRef ? { ...d, rejections: [...(d.rejections ?? []), built.rejection] } : d));
    tx.update(ref, { drafts: next });
  });
}

/** فتح طبليةٍ مسوّدةٍ جديدة في الجلسة — الجلسة تكوّن طبليةً أو أكثر. */
export async function addDraft(sessionId) {
  const ref = doc(db, SESSIONS, sessionId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
    const drafts = snap.data().drafts ?? [];
    const next = [...drafts, emptyDraft(drafts.length + 1)];
    tx.update(ref, { drafts: next });
    return next[next.length - 1].ref;
  });
}

/**
 * إغلاق طبليةٍ مسوّدة وإرسالها للحوكمة — بعده لا قراءة عليها.
 */
export async function closeDraftToGovernance(sessionId, draftRef, { actor } = {}) {
  if (!String(actor ?? '').trim()) throw new Error('الإغلاق بلا فاعلٍ لا يُسجَّل.');
  const at = nowIso();
  const ref = doc(db, SESSIONS, sessionId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
    const drafts = snap.data().drafts ?? [];
    const draft = drafts.find((d) => d.ref === draftRef);
    if (!draft) throw new Error(`الطبلية «${draftRef}» ليست في هذه الجلسة.`);
    if (draft.state !== 'SCANNING') throw new Error('الطبلية أُغلقت من قبل.');
    if ((draft.lines ?? []).length === 0) {
      throw new Error('طبليةٌ فارغة لا تُرفع للحوكمة — امسح محتواها أو احذف المسوّدة.');
    }
    const next = drafts.map((d) =>
      d.ref === draftRef ? { ...d, state: 'PENDING_GOVERNANCE', closedAt: at, closedBy: String(actor).trim() } : d
    );
    tx.update(ref, { drafts: next });
  });
}

/**
 * ★★★ تنفيذ قرار الحوكمة (LPN-207) — حيث تولد الهويّة.
 *
 * الخطوات بترتيبها الحاكم:
 *   ١· الحكم من `planDecision` (الخالص) على الطبلية الحيّة.
 *   ٢· إن كان القرار يولّد هويّة: حجزُ LPN ذرّيًّا ثمّ إنشاء الكيان.
 *   ٣· وسمُ ما يُوسَم (فحص/حجز).
 *   ٤· ختمُ المسوّدة في الجلسة بقرارها فلا تُعرض ثانيةً.
 *
 * ولماذا لا تكون كلُّها معاملةً واحدة؟ لأنّ حجز الهويّة معاملةٌ على عدّادٍ
 * في مجموعةٍ أخرى، ومعاملة Firestore لا تمتدّ عبر عدّةِ قراءاتٍ متتابعة
 * بأمان. فالترتيب مصمَّمٌ ليكون **آمنًا عند الانقطاع**: الهويّة تُحجز أوّلًا
 * (رقمٌ محروقٌ أهونُ من حمولةٍ بلا هويّة)، والكيان يُنشأ بمعرّفٍ لا يتكرّر،
 * وختمُ المسوّدة آخرُ خطوةٍ فإن انقطعت أُعيد التنفيذ بلا ازدواج.
 *
 * @returns {Promise<{lpn:string|null, decision:string}>}
 */
export async function executeDecision(sessionId, draftRef, decisionId, { reason = '', actor } = {}) {
  const at = nowIso();
  const snap = await getDoc(doc(db, SESSIONS, sessionId));
  if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
  const live = { id: snap.id, ...snap.data() };
  const draft = (live.drafts ?? []).find((d) => d.ref === draftRef);
  if (!draft) throw new Error(`الطبلية «${draftRef}» ليست في هذه الجلسة.`);

  const pallet = { ...draft, state: draft.state, warehouse: live.warehouse, code: draft.lpn ?? draft.ref };
  const planned = planDecision(pallet, decisionId, { reason, actor, at });
  if (planned.problem) throw new Error(planned.problem);
  const plan = planned.plan;

  let lpn = draft.lpn ?? null;

  if (plan.generatesIdentity && !lpn) {
    // ١· الهويّة — معاملةٌ ذرّيّة على عدّاد اليوم.
    const reserved = await reserveLpnCode({ warehouse: live.warehouse, date: at });
    lpn = reserved.code;

    // ٢· الكيان — لا يدخل `handling_units` إلّا الآن، معتمَدًا بهويّته.
    await createHandlingUnit({
      code: lpn,
      state: 'APPROVED',
      warehouse: live.warehouse,
      bin: '',
      lines: draft.lines ?? [],
      parentCodes: [],
      sourceDoc: live.order ? { type: live.order.type, id: live.order.id, number: live.order.number } : null,
      orderRef: live.order?.number ?? null,
      actor,
      at,
    });

    // ٣· حدثُ القرار على سجلّها — بمعرّفٍ حتميّ فلا يتكرّر بإعادة التنفيذ.
    await appendUnitEvent(lpn, {
      type: plan.eventType,
      actor,
      at,
      reason: plan.reason,
      doc: live.order ? { type: live.order.type, id: live.order.id, number: live.order.number } : null,
      details: { decision: decisionId, sessionId, draftRef },
    }, { id: `DECISION__${decisionId}__${draftRef}` });

    // ٤· الوسم إن كان القرار يوسم.
    if (plan.flag) {
      await flagUnit(lpn, plan.flag, { reason: plan.reason || plan.label, actor, at });
    }
  }

  // ٥· ختمُ المسوّدة — آخرُ خطوة، فإن انقطع ما قبلها أُعيد بلا ازدواج
  // (الهويّة محفوظةٌ على المسوّدة فلا تُحجز ثانيةً).
  await updateDoc(doc(db, SESSIONS, sessionId), {
    drafts: (live.drafts ?? []).map((d) =>
      d.ref === draftRef
        ? {
            ...d,
            lpn,
            state: plan.nextState ?? d.state,
            decision: decisionId,
            decisionReason: plan.reason,
            decidedBy: actor,
            decidedAt: at,
          }
        : d
    ),
    ...(lpn ? { pallets: attachPallet(live, lpn).pallets } : {}),
  });

  return { lpn, decision: decisionId };
}

/** إغلاق الجلسة — والمتبقّي المفتوح يبقى على الأمر لجلسةٍ لاحقة. */
export async function finishSession(id, { actor } = {}) {
  const snap = await getDoc(doc(db, SESSIONS, id));
  if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
  const live = { id: snap.id, ...snap.data() };
  const problem = sessionCloseProblem(live);
  if (problem) throw new Error(problem);
  const built = closeSession(live, { actor, at: nowIso() });
  if (built.problem) throw new Error(built.problem);
  await updateDoc(doc(db, SESSIONS, id), { state: 'CLOSED', closedBy: actor, closedAt: nowIso() });
}

/** تركُ جلسةٍ لم تُنتج شيئًا — بسببٍ إلزاميّ. */
export async function leaveSession(id, { reason, actor } = {}) {
  const snap = await getDoc(doc(db, SESSIONS, id));
  if (!snap.exists()) throw new Error('الجلسة غير موجودة.');
  const built = abandonSession({ id: snap.id, ...snap.data() }, { reason, actor, at: nowIso() });
  if (built.problem) throw new Error(built.problem);
  await updateDoc(doc(db, SESSIONS, id), {
    state: 'ABANDONED',
    abandonReason: built.session.abandonReason,
    closedBy: actor,
    closedAt: nowIso(),
  });
}

/**
 * الطبالي المنتظرة للحوكمة عبر الجلسات كلّها — مصدرُ لوحة الحوكمة.
 *
 * تُقرأ من الجلسات لا من `handling_units` لأنّ ما قبل الاعتماد ليس هناك
 * أصلًا (القاعدة الحاكمة أعلى الملفّ).
 */
export async function listPendingGovernance(max = 100) {
  const snap = await getDocs(query(collection(db, SESSIONS), where('state', '==', 'OPEN'), limit(max)));
  const out = [];
  for (const d of snap.docs) {
    const s = { id: d.id, ...d.data() };
    for (const draft of s.drafts ?? []) {
      if (draft.state === 'PENDING_GOVERNANCE') {
        out.push({
          sessionId: s.id,
          ref: draft.ref,
          code: draft.ref,
          state: 'PENDING_GOVERNANCE',
          flags: [],
          warehouse: s.warehouse,
          lines: draft.lines ?? [],
          rejections: draft.rejections ?? [],
          exceptions: draft.exceptions ?? [],
          closedAt: draft.closedAt,
          session: s,
        });
      }
    }
  }
  return out;
}
