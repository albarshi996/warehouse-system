/**
 * خدمة التحضير السحابيّة — المهامّ وتنفيذها بالمسح. تنقل ولا تقرّر.
 *
 * البنية:
 *   picking_tasks/{PICK__docId}  ← المهمّة: مصدرها وخطواتها ومحضّرها
 *
 * ★★★ والمعرّفُ حتميٌّ لا عشوائيّ (`pickTaskId`): مهمّةٌ واحدةٌ لكلّ أمر،
 * تفرضها هويّةُ المستند لا فحصٌ يسبق الكتابة. وضغطتان على الزرّ كانتا تكتبان
 * مهمّتين — ومحضّران يمشيان إلى الرفّ نفسِه للبضاعة نفسِها.
 *
 * ═══ القاعدة الحاكمة ═══
 * الحكم كلُّه في `pickingTask` و`pickingScan` الخالصتين — تُستدعيان **على
 * البيانات الحيّة داخل المعاملة**، لا على نسخة الشاشة. فمحضّران على مهمّةٍ
 * واحدة لا يمحو أحدهما سحبة الآخر.
 *
 * ولا تكتب هذه الخدمة دفترًا (ح-٢): سحبُ الحمولة يحرّك **محتوى الطبالي**،
 * والقيدُ المخزنيّ يقع بمستند PICK عند إنجازه — كما كان قبل الطبقة.
 */
import {
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

import {
  openPickTask,
  closePickTask,
  skipStep,
  assignTask,
  currentStep,
  pickTaskId,
  pickTaskDuplicateProblem,
} from './pickingTask.js';
import { pickVerdict, applyPick, buildIssuePallet, picksOfTask, takeFromPallet } from './pickingScan.js';
import { removeQty } from './lpnContents.js';
import { getUnit, reserveLpnCode, createHandlingUnit, appendUnitEvent, applyContentChange } from './lpnService.js';

const TASKS = 'picking_tasks';

function currentUid() {
  return auth?.currentUser?.uid || null;
}
function nowIso() {
  return new Date().toISOString();
}

/**
 * فتح مهمّة تحضيرٍ في السحابة من مستندٍ معتمد — بمعرّفٍ حتميٍّ ومعاملةٍ ترفض المكرّر.
 *
 * ★★★ الترتيب هو الحارس: تُقرأ المهمّةُ القائمة **داخل المعاملة** ثمّ تُكتب.
 * وفحصٌ خارجها كان يمرّ منه جهازان في اللحظة نفسها — والنتيجةُ محضّران على
 * الرفّ نفسِه. وحتميّةُ المعرّف وحدَها لا تحمي: `set` على معرّفٍ قائمٍ تمرّ من
 * قاعدة الأمان (المصدرُ والمستودعُ والفاتحُ لم تتغيّر) **وتمحو `steps`** — أي
 * تقدُّمَ من يعمل الآن. فالرفضُ صريحٌ بسببٍ يسمّي القائمة.
 *
 * @returns {Promise<{id:string, task:object}>} والمعرّفُ هو `pickTaskId` نفسُه،
 *   فالمستدعي يعرفه قبل النداء ولا ينتظر ردًّا ليعرف أين ذهبت مهمّتُه.
 */
export async function createPickTask(sourceDoc, balances, { actor, assignee = '', grid = null } = {}) {
  const built = openPickTask(sourceDoc, balances, { actor, at: nowIso(), assignee, nowMs: Date.now(), grid });
  if (built.problem) throw new Error(built.problem);

  const id = pickTaskId(sourceDoc);
  // حارسٌ لا يُطلق إلّا إن تبدّل حكمُ `taskOpenProblem` يومًا (فهو يردّ المستندَ
  // بلا معرّفٍ قبل هنا) — ويبقى لأنّ ثمنَ سقوطه مستندٌ اسمُه `PICK__` تتكدّس فيه
  // مهامُّ كلّ أمرٍ مجهول.
  if (!id) throw new Error('مستندٌ بلا معرّفٍ لا تُشتقّ منه مهمّة.');

  const ref = doc(db, TASKS, id);
  await runTransaction(db, async (tx) => {
    const live = await tx.get(ref);
    const dup = pickTaskDuplicateProblem(live.exists() ? { id: live.id, ...live.data() } : null, sourceDoc);
    if (dup) throw new Error(dup);
    tx.set(ref, {
      ...built.task,
      openedByUid: currentUid(),
      createdAt: serverTimestamp(),
    });
  });
  return { id, task: built.task };
}

/**
 * المهامّ المفتوحة — لقائمة المحضّر.
 *
 * ★★★ و`sourceDocId` يُجاب **بقراءة المعرّف الحتميّ لا باستعلام**: جمعُ
 * `where('source.id')` إلى `where('state','in',…)` يطلب فهرسًا مركّبًا
 * **ينشره المالك**، وحتّى يُنشر يرتدّ الاستعلام `failed-precondition` عند أوّل
 * ضغطة — والبناءُ والاختبارات لا تكشفه لأنّه قيدُ خادم (درسُ LPN-O06/O07).
 * والقراءةُ بالمعرّف تجيب السؤالَ عينَه بلا فهرسٍ ولا نشر، لأنّ المهمّة صارت
 * تولد على `pickTaskId` حتمًا.
 *
 * ★ ولا مهامَّ قديمةً بمعرّفٍ عشوائيّ تفوت هذه القراءة: المجموعةُ لم يكتبها
 * كاتبٌ قبل اليوم (`createPickTask` كان بلا مستدعٍ).
 *
 * @param {{assignee?:string, sourceDocId?:string, max?:number}} [opts]
 *   و`sourceDocId` معرّفُ **المستند الآمر** لا معرّفُ المهمّة.
 */
export async function listOpenTasks({ assignee = '', sourceDocId = '', max = 50 } = {}) {
  const forDoc = String(sourceDocId ?? '').trim();
  if (forDoc) {
    const snap = await getDoc(doc(db, TASKS, pickTaskId({ id: forDoc })));
    if (!snap.exists()) return [];
    const task = { id: snap.id, ...snap.data() };
    if (!['OPEN', 'IN_PROGRESS'].includes(task.state)) return [];
    return !assignee || task.assignee === assignee ? [task] : [];
  }

  const filters = [where('state', 'in', ['OPEN', 'IN_PROGRESS'])];
  if (assignee) filters.push(where('assignee', '==', assignee));
  const snap = await getDocs(query(collection(db, TASKS), ...filters, limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** استماعٌ حيّ لمهمّة. */
export function listenTask(id, onChange) {
  return onSnapshot(doc(db, TASKS, id), (snap) => onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

/** إسنادُ مهمّة. */
export async function assign(taskId, { assignee, actor, force = false } = {}) {
  const ref = doc(db, TASKS, taskId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('المهمّة غير موجودة.');
    const built = assignTask(snap.data(), { assignee, actor, force });
    if (built.problem) throw new Error(built.problem);
    tx.update(ref, { assignee: built.task.assignee, assignedBy: built.task.assignedBy });
  });
}

/**
 * ★★ تنفيذ سحبةٍ — الحكم على البيانات الحيّة ثمّ الكتابة الذرّيّة.
 *
 * الترتيب: يُحكم على المهمّة الحيّة، ثمّ يُنقص محتوى الطبلية الأمّ
 * (بـ`contentRev` الحارس من فقدان التحديث)، ثمّ تُحدَّث المهمّة. فإن فشل
 * إنقاصُ الأمّ لم تُسجَّل سحبةٌ لم تقع.
 *
 * @returns {Promise<{ok:boolean, message:string, stage?:string}>}
 */
export async function executePick(taskId, scan, { actor } = {}) {
  const taskRef = doc(db, TASKS, taskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) throw new Error('المهمّة غير موجودة.');
  const task = { id: taskSnap.id, ...taskSnap.data() };
  if (!['OPEN', 'IN_PROGRESS'].includes(task.state)) throw new Error(`المهمّة «${task.state}» — لا سحبَ عليها.`);
  if (!String(actor ?? '').trim()) throw new Error('السحب بلا فاعلٍ لا يُسجَّل.');

  const unit = scan?.lpn ? await getUnit(scan.lpn) : null;
  const verdict = pickVerdict(task, scan, { unit, asOf: nowIso().slice(0, 10) });
  if (!verdict.ok) return { ok: false, message: verdict.message, stage: verdict.stage };

  const pick = { ...verdict.pick, uom: scan?.uom ?? '', baseQty: scan?.baseQty ?? verdict.pick.qty };
  const at = nowIso();

  // ① إنقاصُ الأمّ أوّلًا — فإن فشل لم تُسجَّل سحبةٌ لم تقع.
  const removed = removeQty(unit.lines ?? [], takeFromPallet(pick));
  if (removed.problem) return { ok: false, message: removed.problem, stage: 'QTY' };

  await applyContentChange(unit.code, {
    lines: removed.lines,
    baseRev: Number(unit.contentRev) || 0,
    event: {
      type: 'PICKED_FROM', actor, at,
      doc: task.source ? { type: task.source.type, id: task.source.id, number: task.source.number } : null,
      details: { taskId, seq: pick.seq, sku: pick.sku, batch: pick.batch, qty: pick.qty },
    },
    eventId: `PICK__${taskId}__${pick.seq}__${at}`.replace(/[/.#$[\]\s]/g, '_'),
  });

  // ② ثمّ المهمّة — والحكم يُعاد على الحيّة داخل المعاملة.
  await runTransaction(db, async (tx) => {
    const live = await tx.get(taskRef);
    if (!live.exists()) throw new Error('المهمّة اختفت أثناء التنفيذ.');
    const liveTask = { id: live.id, ...live.data() };
    const step = currentStep(liveTask);
    if (!step || step.seq !== pick.seq) {
      throw new Error('تغيّرت الخطوة الجارية بينما كنت تسحب — أعد قراءة المهمّة؛ زميلٌ سبقك إليها.');
    }
    const next = applyPick(liveTask, pick);
    tx.update(taskRef, { state: next.state, steps: next.steps, lastPickAt: at, lastPickBy: actor });
  });

  return { ok: true, message: `سُحب ${pick.qty} من ${pick.sku}` };
}

/** تخطّي خطوةٍ بسبب. */
export async function skip(taskId, seq, { reason, actor } = {}) {
  const ref = doc(db, TASKS, taskId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('المهمّة غير موجودة.');
    const built = skipStep({ id: snap.id, ...snap.data() }, seq, { reason, actor });
    if (built.problem) throw new Error(built.problem);
    tx.update(ref, { steps: built.task.steps });
  });
}

/**
 * ★★★ إقفال المهمّة وتكوين طبلية الصرف — حيث تولد هويّة الحمولة الخارجة.
 *
 * الهويّة تُحجز أوّلًا ثمّ يُنشأ الكيان ثمّ تُقفل المهمّة — الترتيب نفسه
 * الآمن عند الانقطاع (رقمٌ محروقٌ أهونُ من حمولةٍ بلا هويّة).
 *
 * @returns {Promise<{lpn:string|null}>}
 */
export async function closeTaskWithPallet(taskId, { actor } = {}) {
  const ref = doc(db, TASKS, taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('المهمّة غير موجودة.');
  const task = { id: snap.id, ...snap.data() };

  const built = closePickTask(task, { actor, at: nowIso() });
  if (built.problem) throw new Error(built.problem);
  if (task.issuePallet) throw new Error(`هذه المهمّة كوّنت الطبلية «${task.issuePallet}» — لا تُكوَّن مرّتين.`);

  // السحبات المنفَّذة تصير بنود الحمولة الخارجة — بمصادرها المسجّلة على
  // كلّ خطوة، فيعبر النسب من الأمّهات إلى البنت.
  const picks = picksOfTask(task);

  let lpn = null;
  if (picks.length > 0) {
    const reserved = await reserveLpnCode({ warehouse: task.warehouse, date: nowIso() });
    lpn = reserved.code;
    const pallet = buildIssuePallet(picks, {
      code: lpn, warehouse: task.warehouse, sourceDoc: task.source,
      // ‹LPN-309› الوجهةُ تعبر من المهمّة إلى الحمولة — وبلا عبورها كان
      // حارسُ منع الخلط عند التجهيز يقرأ حقلًا فارغًا فلا يُطلق أبدًا.
      route: task.route ?? '', branch: task.branch ?? '',
      actor,
    });
    if (pallet.problem) throw new Error(pallet.problem);

    await createHandlingUnit({ ...pallet.pallet, actor, at: nowIso() });
    await appendUnitEvent(lpn, {
      type: 'CREATED', actor, at: nowIso(),
      doc: task.source, details: { role: 'issue-pallet', taskId },
    }, { id: `ISSUE__${taskId}` });
  }

  await updateDoc(ref, {
    state: 'DONE',
    issuePallet: lpn,
    closedBy: actor,
    closedAt: nowIso(),
  });
  return { lpn };
}
