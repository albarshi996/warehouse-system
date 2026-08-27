/**
 * خدمة التخزين — من الطبلية المُلصَقة إلى الرفّ. تنقل ولا تقرّر.
 *
 * ═══ لماذا بلا مجموعةٍ جديدة؟ (قرارٌ يُقرأ لا يُخمَّن) ═══
 * مهمّةُ التخزين **تُشتقّ ولا تُخزَّن**: قائمةُ الانتظار هي الطبالي في
 * `LABEL_PRINTED`/`PENDING_PUTAWAY` نفسها، والمقترحُ يُحسب لحظةَ العرض من
 * `putawaySuggest` القائمة. ومجموعةٌ ثالثة (`putaway_tasks`) كانت ستطلب
 * **قاعدةَ أمانٍ جديدةً يَنشرها المالك** — ودرسُ LPN-O06/O07 صريح: قاعدةٌ
 * غيرُ منشورةٍ تعني `permission-denied` عند أوّل فتحة، **والبناءُ
 * والاختبارات لا تكشفه لأنّه قيدُ خادم**. فما يُكتب هنا يُكتب في
 * `handling_units` وأحداثها — وقواعدُها منشورةٌ منذ LPN-O05.
 *
 * ═══ القاعدة الحاكمة ═══
 * الحكم كلُّه في `putawayTask` الخالصة — تُستدعى ولا تُنسخ. والخدمةُ تُثبت
 * ما حكمت به: نقلةٌ بمستندٍ (القاعدة ١) ثمّ انتقالُ حالةٍ، وكلاهما ذرّيٌّ
 * بمعرّفٍ حتميّ فلا تُكرَّر النقلة بضغطتين.
 */
import { getUnit, listUnitsByState, moveUnit, transitionUnit } from './lpnService.js';
import {
  binScanVerdict,
  completePutaway,
  openPutawayTask,
  taskOpenProblem,
} from './putawayTask.js';

/** الحالتان اللتان تعنيان «تنتظر رفًّا». */
export const PUTAWAY_QUEUE_STATES = Object.freeze(['LABEL_PRINTED', 'PENDING_PUTAWAY']);

/**
 * قائمةُ الانتظار — الطبالي المُلصَقة التي لم تبلغ رفًّا بعد.
 *
 * ★ والسقفُ يُعلَن: `capped` تقول إنّ المعروض ليس كلّ ما ينتظر، فقائمةٌ
 * ناقصةٌ تبدو كاملةً تجعل العامل يظنّ أنّه أنهى وقد بقي.
 */
export async function listPutawayQueue({ max = 100 } = {}) {
  const groups = await Promise.all(PUTAWAY_QUEUE_STATES.map((s) => listUnitsByState(s, max)));
  const units = groups.flat();
  return { units, capped: groups.some((g) => g.length >= max) };
}

/**
 * فتحُ مهمّةٍ لطبلية — المهمّةُ كائنٌ في الذاكرة، والأثرُ الوحيد في السحابة
 * أنّ الطبلية تنتقل إلى «بانتظار التخزين» إن كانت لم تنتقل.
 *
 * @returns {Promise<{task:object}|{problem:string}>}
 */
export async function openTask(code, { locations = [], balances = [], item = null, actor, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const unit = await getUnit(code);
  if (!unit) return { problem: `الطبلية «${code}» غير موجودة — امسح الملصق ثانيةً أو راجع الحوكمة.` };

  const problem = taskOpenProblem(unit);
  if (problem) return { problem };

  // ★ الانتقال أوّلًا ثمّ المهمّة: الدورة صارمة (LABEL_PRINTED →
  // PENDING_PUTAWAY → STORED)، فطبليةٌ تُنفَّذ من حالة الملصق مباشرةً
  // كانت سترتدّ عند الإتمام بخطأ انتقالٍ غير مسموح — بعد أن مشى العامل.
  if (unit.state === 'LABEL_PRINTED') {
    await transitionUnit(unit.code, 'PENDING_PUTAWAY', { actor, at, doc: unit.sourceDoc ?? null });
  }

  const opened = openPutawayTask({ ...unit, state: 'PENDING_PUTAWAY' }, { locations, balances, item, actor, at });
  if (opened.problem) return { problem: opened.problem };
  return { task: opened.task, unit: { ...unit, state: 'PENDING_PUTAWAY' } };
}

/** حكمُ مسح الرفّ قبل التنفيذ — للعرض الفوريّ بلا كتابة. */
export function previewBin(unit, code, ctx = {}) {
  return binScanVerdict(unit, code, ctx);
}

/**
 * إتمامُ التخزين — يُثبت ما حكمت به `completePutaway`.
 *
 * الترتيب مقصود: **النقلة قبل الحالة**. فلو انقطع الاتّصال بينهما بقيت
 * الطبلية «بانتظار التخزين» في رفّها الصحيح — تُعاد المحاولة فتُصحَّح.
 * والعكسُ كان سيخلّف طبليةً «مخزَّنة» بلا رفٍّ يُعرف.
 */
export async function executePutaway(code, binCode, { actor, overrideNote = '', locations = [], balances = [], item = null, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const unit = await getUnit(code);
  if (!unit) return { problem: `الطبلية «${code}» غير موجودة.` };

  const opened = openPutawayTask(unit, { locations, balances, item, actor, at });
  if (opened.problem) return { problem: opened.problem };

  const done = completePutaway(opened.task, unit, binCode, {
    actor, at, overrideNote, locations, balances, item,
  });
  if (done.problem) return { problem: done.problem };

  // القاعدة ١: لا نقلةَ بلا مستند. ومستندُ التخزين هو مستند مولد الطبلية
  // نفسه (GRN الجلسة) — لا مستندٌ يُخترع هنا.
  const docRef = unit.sourceDoc ?? null;
  if (!docRef?.id) {
    return { problem: 'الطبلية بلا مستندٍ مصدر — والنقلة تتبع مستندًا (القاعدة ١). راجع الحوكمة.' };
  }

  await moveUnit(unit.code, { toBin: done.move.toBin, toWarehouse: unit.warehouse ?? '', docRef, actor, at });
  await transitionUnit(unit.code, 'STORED', { actor, at, doc: docRef });

  return { task: done.task, move: done.move };
}
