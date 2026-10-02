/**
 * مُنفِّذُ الإجراءات الجماعيّة — حلقةٌ على الفرديّ، لا طريقٌ ثانٍ إليه.
 *
 * ═══ ★★★ العقدُ الأمنيُّ لهذا الملفّ ═══
 * هذا الملفُّ **لا يستورد Firestore**. لا `updateDoc` ولا `writeBatch` ولا
 * `runTransaction`. أداتُه الوحيدةُ `transitionDocument` — نفسُ الدالّة التي
 * يستدعيها زرُّ الاعتماد الفرديُّ في `DocumentEngine`.
 *
 * ولماذا هذا صارمٌ إلى هذا الحدّ؟ لأنّ `writeBatch` **مُغرٍ وقاتل**: يكتب
 * خمسين حالةً في طلبٍ واحدٍ ذرّيٍّ سريع — ويتجاوز في طريقه كلَّ حارسٍ في
 * `transitionDocument`:
 *   · حارسَ الأثر المخزنيّ (`buildMoves`) — فيصير مستندٌ «منجَزًا» بلا حركة.
 *   · حارسَ FEFO بالموقع — فيُسحب الجديدُ ويُتلف القديم صامتًا.
 *   · حارسَ السلسلة — فيُنجَز ابنٌ قبل اعتماد أبيه.
 *   · حارسَ تجاوز التحصيل، وحارسَ خلوّ العهدة، وقيدَ الدفتر، وسجلَّ التدقيق
 *     **لكلِّ مستندٍ باسمه**.
 * فالسرعةُ هنا ثمنُها فقدُ النظام. والحلقةُ البطيئةُ هي الصحيحة.
 *
 * ═══ وثلاثُ قواعدَ في التنفيذ ═══
 * ★★ **بالتتابع لا بالتوازي**: `Promise.all` على خمسين نقلةً يفتح خمسين
 * معاملةَ ترقيمٍ متزامنة، فتتصادم على العدّاد نفسه وتُعاد المحاولة مرارًا —
 * وهو إهدارُ حصّةٍ وفشلٌ متقطّعٌ يصعب تفسيره. والتتابعُ يُبقي الترقيم نظيفًا.
 *
 * ★★★ **والسقوطُ يُعزل ولا يُسقط الدفعة**: مستندٌ واحدٌ بندُه بلا كمّيّة لا
 * يمنع التسعةَ والعشرين الباقية. هذا درسُ المرآة حرفيًّا — صفٌّ فاسدٌ واحدٌ
 * كان يُسقط الدفعةَ كلَّها حتى صار يُعزل ويُسمّى.
 *
 * ★★ **والتقدّمُ يُبلَّغ وهو يجري**: خمسون نقلةً قد تأخذ دقيقة. وشاشةٌ
 * جامدةٌ دقيقةً تُدفع ثانيةً أو تُغلق — فيُبلَّغ كلُّ مستندٍ لحظةَ انتهائه.
 */

import { transitionDocument } from './documentsService.js';
import { getSchema } from './schemas/index.js';
import { planBulk, summarizeRun } from './bulkActions.js';

/**
 * يُنفّذ خطّةً جماعيّة — مستندًا مستندًا عبر `transitionDocument`.
 *
 * @param {object} plan خطّةٌ من `planBulk` (تُعاد التحقّق منها هنا)
 * @param {{note?:string, profile:object, onProgress?:Function, signal?:{aborted:boolean}}} opts
 * @returns {Promise<ReturnType<typeof summarizeRun> & {aborted:boolean}>}
 */
export async function runBulk(plan, { note = '', profile, onProgress, signal } = {}) {
  const action = plan?.action;
  const docs = plan?.eligible || [];
  if (!action || docs.length === 0) {
    return { ...summarizeRun([]), aborted: false };
  }
  if (action.needsNote && !String(note).trim()) {
    throw new Error('اكتب السبب أولًا — هذا الإجراء لا يقع بلا سبب.');
  }

  const outcomes = [];
  let aborted = false;

  for (let i = 0; i < docs.length; i += 1) {
    // الإلغاءُ يُحترَم **بين** المستندات لا في وسط واحدٍ منها: نقلةٌ بدأت
    // تُكمَل أو تفشل، ولا تُقطع نصفَ طريقها فتترك ترقيمًا محجوزًا بلا مستند.
    if (signal?.aborted) {
      aborted = true;
      break;
    }
    const d = docs[i];
    onProgress?.({ index: i, total: docs.length, doc: d, phase: 'start' });
    try {
      await transitionDocument(d.id, action.to, {
        note,
        profile,
        schema: getSchema(d.type),
      });
      outcomes.push({ doc: d, ok: true });
      onProgress?.({ index: i, total: docs.length, doc: d, phase: 'ok' });
    } catch (err) {
      // لا يُعاد الرمي: السقوطُ يُعزل ويُسمّى، والحلقةُ تُكمل.
      const reason = err?.message || String(err);
      outcomes.push({ doc: d, ok: false, error: reason });
      onProgress?.({ index: i, total: docs.length, doc: d, phase: 'fail', error: reason });
    }
  }

  return { ...summarizeRun(outcomes), aborted };
}

/**
 * يخطّط ثمّ ينفّذ في نداءٍ واحد — لمن لا يعرض الخطّة للمستخدم.
 *
 * ⚠️ والشاشةُ **تعرض الخطّة** ثمّ تستدعي `runBulk`: هذا المسارُ المختصر
 * موجودٌ للسكربتات والاختبارات لا للواجهة. فالإجراءُ الجماعيُّ الذي يقع بلا
 * مراجعةٍ هو ما يصنع الحادثة.
 */
export async function planAndRun(docs, actionId, user, opts = {}) {
  const plan = planBulk(docs, actionId, user, { note: opts.note, schemas: opts.schemas });
  if (!plan.canRun) {
    return { ...summarizeRun([]), aborted: false, plan };
  }
  const result = await runBulk(plan, opts);
  return { ...result, plan };
}
