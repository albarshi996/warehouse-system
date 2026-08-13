/**
 * حارس اتّجاه التكامل — **أودو ← البوابة، سحبًا لا دفعًا** (SAP-15 · يسدّ ف‑٣٥ وف‑٣٦ وف‑٣٧).
 *
 * ═══ القرار الذي يُنفّذه ═══
 * قرار المالك 2026-08-13: «نحن المصدر المالي أودو، لكن المنطق يكون موجودًا في
 * النظام… ونريد أن نلغي أي منطق لدفعٍ للأودو — البوابة تستورد وتحدّث البيانات
 * من أودو فقط.» فالسلطة عند أودو، والمعرفة عندنا، والاتّجاه واحد.
 *
 * ═══ لماذا حارسٌ عند حدّ النقل لا عند كلّ نداء؟ ═══
 * كشف الجرد ثلاثة تسريبات: الافتراض عند غياب السياسة كان **دفعًا**، وأربعة
 * مساراتٍ في `odooSyncService` تكتب إلى أودو متجاوزةً حارس السياسة
 * (`purchase.order → state`، و`stock.picking → state`، وتغيير حالة أيّ مستند،
 * وإنشاء `stock.move`)، وحدُّ النقل نفسه مفتوحٌ بلا سؤال.
 *
 * فمطاردة المسارات واحدًا واحدًا تُغلق ما نعرفه اليوم وتترك الباب لما يُكتب غدًا.
 * أمّا بابٌ واحد على المخرج فيُغلقها جميعًا، **ويمنع الخامس قبل أن يُكتب**.
 *
 * ═══ قائمة سماحٍ لا قائمة منع ═══
 * لو عدّدنا الممنوع (`create`/`write`/`unlink`) لنجا كلُّ ما لم نعدّه:
 * `copy` و`name_create` و`web_save` و`action_confirm` و`button_validate`…
 * وأودو مليءٌ بالأفعال التي تكتب بأسماء لا تُوحي بالكتابة.
 * لذلك: **ما ليس في قائمة القراءة فهو ممنوع** — ومن أراد فعلًا جديدًا أضافه
 * هنا عمدًا، لا سهوًا.
 *
 * ═══ ختمٌ لا حذف ═══
 * §3-٣ ‹42› يمنع حذف أيّ مسارٍ قائم، و§4 ‹79› يمنع الإزالة غير القابلة للعكس.
 * فلم يُحذف سطرُ دفعٍ واحد. الفكّ يكون بتغيير `INTEGRATION_DIRECTION` أدناه
 * إلى `'push'` — سطرٌ واحد ظاهر، لا مفتاحٌ يُقلب في الظلام.
 *
 * منطق خالص: بلا شبكة وبلا Firestore وبلا DOM.
 */

/**
 * اتّجاه التكامل المعتمد. **هذا هو الختم.**
 * `'pull'` = أودو مصدرٌ والبوابة تقرأ. تغييره قرارُ مالكٍ صريح لا تحسينُ كود.
 */
export const INTEGRATION_DIRECTION = 'pull';

/**
 * أفعال أودو التي **تقرأ ولا تكتب**. ما عداها ممنوع.
 *
 * `authenticate` ليس فعل نموذجٍ بل مصافحةٌ للتحقّق من الاتّصال، ولا يغيّر بيانًا.
 */
export const READ_METHODS = Object.freeze([
  'authenticate',
  'search',
  'search_read',
  'search_count',
  'read',
  'read_group',
  'fields_get',
  'name_search',
  'default_get',
  'web_search_read',
  'web_read',
]);

const READ_SET = new Set(READ_METHODS);

/** هل الاتّجاه اليوم سحبٌ (أي أنّ الدفع مختوم)؟ */
export function isPushSealed() {
  return INTEGRATION_DIRECTION !== 'push';
}

/** هل هذا الفعل قراءةٌ محضة؟ الفراغ والقيمة الفاسدة **ليسا** قراءة. */
export function isReadMethod(method) {
  return READ_SET.has(String(method ?? '').trim());
}

/**
 * قرار السماح بنداءٍ إلى أودو.
 *
 * @param {string} method فعل أودو (`search_read` · `create` …)
 * @param {string} [model] نموذج أودو — للرسالة وحدها
 * @returns {{allowed: boolean, reason: string, direction: string}}
 */
export function directionDecision(method, model = '') {
  const name = String(method ?? '').trim();
  const at = model ? ` على «${model}»` : '';

  if (!name) {
    return {
      allowed: false,
      reason: 'نداءٌ إلى أودو بلا فعلٍ مسمّى — يُرفض مغلقًا.',
      direction: INTEGRATION_DIRECTION,
    };
  }
  if (isReadMethod(name)) {
    return { allowed: true, reason: '', direction: INTEGRATION_DIRECTION };
  }
  if (!isPushSealed()) {
    return { allowed: true, reason: '', direction: INTEGRATION_DIRECTION };
  }
  return {
    allowed: false,
    reason:
      `الدفع إلى أودو مختوم: «${name}»${at} فعلُ كتابة، والاتّجاه المعتمد سحبٌ فقط ` +
      '(أودو ← البوابة). البوابة تستورد وتُحدّث ولا تكتب. ' +
      'لفكّ الختم: قرارُ مالكٍ صريح ثمّ تغيير INTEGRATION_DIRECTION في directionGuard.js.',
    direction: INTEGRATION_DIRECTION,
  };
}

/**
 * يفرض الاتّجاه أو يرمي بسببٍ مكتوب. يستدعيه حدّ النقل قبل كلّ نداء.
 *
 * @throws {Error} برسالةٍ عربيّةٍ تشرح المنع ولا تكشف سرًّا عن النظام المتّصل.
 */
export function assertPullOnly(method, model = '') {
  const decision = directionDecision(method, model);
  if (!decision.allowed) throw new Error(decision.reason);
  return decision;
}
