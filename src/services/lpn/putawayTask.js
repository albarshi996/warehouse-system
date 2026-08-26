/**
 * مهمّة التخزين — مسحُ الطبلية ثمّ الرفّ بموانعه. منطق خالص بلا Firebase.
 *
 * المشكلة التي يحلّها: `putawaySuggest.js` يقترح الرفّ الأمثل منذ خطة LOC،
 * **ولا مهمّةَ تحمل اقتراحه إلى الميدان**. فالعامل يقف بالطبلية ولا يعرف
 * أين يضعها، والنظام يعرف ولا يقول.
 *
 * المهمّة تصل الطرفين: تُنشأ للطبلية المعتمدة، تحمل المقترح، وتُغلق بمسحٍ
 * مزدوجٍ يثبت أنّ **هذه** الحمولة صارت في **هذا** الرفّ.
 *
 * ═══ القاعدتان الحاكمتان ═══
 *
 * ١· **العامل يختار الرفّ والمرفوض يمرّ بسببٍ مقيَّد** — درس خطة LOC
 *    المعتمَد. فالاقتراح اقتراحٌ لا أمر: العامل يرى ما لا يراه النظام
 *    (رفٌّ مبلول، ممرٌّ مسدود). والحكم كلُّه من `chooseVerdict` القائمة —
 *    تُستدعى ولا تُنسخ، وإلّا افترق حكمُ الطبالي عن حكم الأصناف يومًا.
 *
 * ٢· **الطبلية في موقعٍ واحدٍ دائمًا** (خطة ٧ خامسًا): المهمّة تنقل ولا
 *    تنسخ، والحقل يُستبدل والتاريخ في الأحداث.
 */

import { normalizeLocationCode } from '../locations/locationCode.js';
import { chooseVerdict, suggestLocations } from '../locations/putawaySuggest.js';
import { isBlockedForIssue } from './lpnLifecycle.js';

/** حالات مهمّة التخزين. */
export const PUTAWAY_STATES = Object.freeze({
  OPEN: 'مفتوحة',
  DONE: 'منفَّذة',
  CANCELLED: 'ملغاة',
});

/**
 * سبب رفض إنشاء مهمّة تخزينٍ لطبلية — أو '' إن جازت.
 *
 * الطبلية تُخزَّن بعد أن تُعتمد ويُلصق ملصقُها ويُؤكَّد لصقُه (LPN-209):
 * حمولةٌ بلا ملصقٍ مؤكَّدٍ تدخل الرفّ هي حمولةٌ لا تُقرأ بعد ذلك.
 */
export function taskOpenProblem(unit) {
  if (!unit?.code) return 'لا طبلية — امسح الملصق.';
  if (!['LABEL_PRINTED', 'PENDING_PUTAWAY'].includes(unit.state)) {
    return `الطبلية «${unit.state ?? '؟'}» — تُخزَّن بعد اعتمادها وطباعة ملصقها وتأكيد لصقه.`;
  }
  return '';
}

/**
 * إنشاء مهمّة تخزين تحمل المقترح.
 *
 * @param {object} unit الطبلية المعتمدة
 * @param {object} ctx {locations, balances, item, actor, at}
 * @returns {{task:object}|{problem:string}}
 */
export function openPutawayTask(unit, { locations = [], balances = [], item = null, actor, at } = {}) {
  const problem = taskOpenProblem(unit);
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'مهمّةٌ بلا فاعلٍ لا تُنشأ.' };

  // البند الممثّل للطبلية في الاقتراح: أوّلُ بنودها — والمختلطة تُقترح
  // على أساس أوّل أصنافها، ويبقى للعامل أن يختار غيره بسبب.
  const line = unit?.lines?.[0] ?? null;
  // النواة تعيد `{candidates, rejected, problem}` — والمرفوض **يُعرض بسببه
  // لا يُخفى** (قرارها المعلن)، فتحمله المهمّة كما هو: عاملٌ يرى لماذا رُفض
  // رفٌّ يختار البديل بعلمٍ لا بتخمين.
  const { candidates, rejected, problem: suggestProblem } = suggestLocations({
    line, locations, balances, item, warehouse: unit.warehouse, limit: 3,
  });

  return {
    task: {
      state: 'OPEN',
      lpn: unit.code,
      warehouse: unit.warehouse ?? '',
      fromBin: normalizeLocationCode(unit.bin) || '',
      suggestions: candidates.map((s) => ({ code: s.code, shortLabel: s.shortLabel ?? '', score: s.score ?? null })),
      rejectedBins: rejected,
      suggestProblem: suggestProblem ?? '',
      suggestedBin: candidates[0]?.code ?? '',
      toBin: '',
      openedBy: String(actor).trim(),
      openedAt: at ?? null,
    },
  };
}

/**
 * حكمُ مسح الرفّ عند التنفيذ — `{ok, message, needsReason}`.
 *
 * ترتيب الحارس: الطبلية أوّلًا (موسومةٌ حاجبًا لا تُخزَّن إلّا بقرار)، ثمّ
 * انتماء الرفّ لمستودعها، ثمّ حكمُ الموقع نفسه من النواة القائمة.
 */
export function binScanVerdict(unit, code, { locations = [], balances = [], item = null } = {}) {
  const wanted = normalizeLocationCode(code);
  if (!wanted) return { ok: false, needsReason: false, message: 'امسح باركود الرفّ — لا تخزينَ في موقعٍ غير مقروء فعليًّا.' };

  // ★ وسمٌ حاجب لا يمنع **التخزين** بل الصرف — بل التخزين واجبٌ عليه:
  // حمولةٌ تالفةٌ تقف في ممرٍّ أسوأ من حمولةٍ تالفةٍ على رفٍّ معلوم. فلا
  // يُمنع، لكن يُعلَن كي يختار العامل رفَّ الحجر لا رفَّ البيع.
  const flagNote = isBlockedForIssue(unit)
    ? 'الطبلية موسومةٌ ولا تُصرف — خزّنها في موقع الحجر أو الفحص لا في رفوف الصرف.'
    : '';

  const unitWarehouse = String(unit?.warehouse ?? '').trim().toUpperCase();
  const binWarehouse = wanted.split('-')[0];
  if (unitWarehouse && binWarehouse && unitWarehouse !== binWarehouse) {
    return {
      ok: false,
      needsReason: false,
      message: `الطبلية تتبع مستودع «${unitWarehouse}» والرفّ «${binWarehouse}» — النقل بين المستودعين بأمر نقلٍ لا بتخزين. (القاعدة ٣.)`,
    };
  }

  // حكمُ الموقع من النواة القائمة — لا نسخةَ ثانية تفترق عنها.
  const verdict = chooseVerdict(wanted, { line: unit?.lines?.[0] ?? null, locations, balances, item });
  if (verdict.ok) return { ok: true, needsReason: false, message: flagNote };
  return {
    ok: false,
    needsReason: verdict.needsReason,
    // `override:true` يعني «يمرّ بسبب» لا «ممنوع» — درس LOC: العامل يختار.
    canOverride: verdict.override === true,
    message: verdict.reason,
  };
}

/**
 * إتمام المهمّة — يعيد المهمّة والطبلية بعد النقل.
 *
 * @returns {{task:object, move:object}|{problem:string}}
 */
export function completePutaway(task, unit, code, { actor, at, overrideNote = '', locations = [], balances = [], item = null } = {}) {
  if (task?.state !== 'OPEN') return { problem: `المهمّة «${PUTAWAY_STATES[task?.state] ?? '؟'}» — لا تُنفَّذ مرّتين.` };
  if (normalizeLocationCode(task?.lpn) && task.lpn !== unit?.code) {
    return { problem: `هذه مهمّةُ «${task.lpn}» والممسوح «${unit?.code ?? ''}» — امسح الطبلية الصحيحة.` };
  }
  if (!String(actor ?? '').trim()) return { problem: 'تنفيذُ المهمّة بلا فاعلٍ لا يُسجَّل.' };

  const wanted = normalizeLocationCode(code);
  const verdict = binScanVerdict(unit, wanted, { locations, balances, item });
  if (!verdict.ok) {
    if (!verdict.canOverride) return { problem: verdict.message };
    if (!String(overrideNote ?? '').trim()) {
      return { problem: `${verdict.message} — التخزين هنا يحتاج سببًا مكتوبًا يُقيَّد باسمك.` };
    }
  }

  const fromBin = normalizeLocationCode(unit?.bin) || '';
  return {
    task: { ...task, state: 'DONE', toBin: wanted, doneBy: String(actor).trim(), doneAt: at ?? null, overrideNote: String(overrideNote ?? '').trim() },
    // ★ سجلّ الحركة بحقول خطة ٧ الخمسة: الموقعان والمستخدم والوقت والمهمّة.
    move: {
      lpn: unit.code,
      fromBin,
      toBin: wanted,
      warehouse: unit.warehouse ?? '',
      actor: String(actor).trim(),
      at: at ?? null,
      offSuggestion: Boolean(task?.suggestedBin) && normalizeLocationCode(task.suggestedBin) !== wanted,
      overrideNote: String(overrideNote ?? '').trim(),
    },
  };
}

/**
 * الطبالي في مواقع غير متوقّعة — عدّادُ لوحة الحوكمة (خطة ٧ الثاني عشر).
 * تُقارن ما اقترحه النظام بما فعله العامل: لا لتُلام، بل ليُعرف أين تتكرّر
 * المخالفة فيُراجَع المقترح نفسه.
 */
export function offSuggestionRate(moves) {
  const all = (moves ?? []).filter((m) => m?.toBin);
  if (all.length === 0) return { total: 0, off: 0, rate: 0 };
  const off = all.filter((m) => m.offSuggestion).length;
  return { total: all.length, off, rate: Math.round((off / all.length) * 100) };
}
