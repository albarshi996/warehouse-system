/**
 * سجلّ الأسباب الموحَّد ‹EXE-203› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ العطب ═══
 * السبب مطلوبٌ في خمسة مواضع وموزَّعٌ على أربعة ملفّات: رفض الجودة في
 * [`srn.js`](./schemas/srn.js)، وتخطّي الزيارة في [`visitModel.js`](../field/visitModel.js)
 * (`SKIP_REASONS`)، وتعذّر التخزين في [`putawaySuggest.js`](../locations/putawaySuggest.js)،
 * ونقص السحب بلا قائمةٍ أصلًا. فلا يُجاب سؤالٌ بسيط: **«لماذا نقصت الكمّيّات
 * هذا الشهر؟»** — إذ لا مكان واحد يُسأل.
 *
 * ═══ والعلاج جمعٌ بالإحالة لا نسخ ═══
 * `SKIP_REASONS` تبقى في مكانها ويعيد هذا الملفّ تصديرها ضمن سياقها. فمن
 * يستوردها اليوم لا ينكسر، ومن يريد الصورة كاملةً يجدها هنا. ونسخُ القائمة
 * كان سيُنتج قائمتين تفترقان أوّل إضافةٍ في إحداهما.
 *
 * ═══ ولماذا الأسباب **مقيَّدة** لا نصٌّ حرّ ═══
 * سببٌ حرٌّ يُكتب «نقص» و«ناقص» و«العدد قليل» — ثلاثة نصوصٍ لمعنًى واحد لا
 * يُجمَع منها تقرير. فالقائمة تُقيّد، و`other` وحدها تفتح خانة نصّ **وتُلزم
 * بها** — فلا يُهرَب إلى «أخرى» بلا بيان.
 */

import { SKIP_REASONS } from '../field/visitModel.js';

/** سياقات السبب — كلٌّ يُسأل في لحظةٍ مختلفة من الدورة. */
export const REASON_CONTEXTS = Object.freeze({
  pick_short: 'نقص في السحب',
  receipt_variance: 'فرق في الاستلام',
  qc_reject: 'رفض جودة',
  putaway_blocked: 'تعذّر التخزين',
  task_delay: 'تأخّر في التنفيذ',
  visit_skip: 'تخطّي زيارة',
  // ‹FNB-303› الفرع طلب غير المقترح — والسبب يجعل الانحراف تعلُّمًا لا لومًا.
  order_deviation: 'انحراف عن الكمّيّة المقترحة',
});

/** المعرّف المحجوز لـ«سببٍ آخر» — يفتح خانة النصّ ويُلزم بها. */
export const OTHER = 'other';

const other = (label) => ({ id: OTHER, label, requiresNote: true });

/**
 * الأسباب لكلّ سياق.
 *
 * ★ `blamesWorker:false` تعني أنّ السبب **خارج إرادة المنفّذ** — وهي ما
 * يقرؤه قياسُ الأداء في ت٧ كي لا يُحمَّل العاملُ عطلَ جهازٍ ولا ازدحامَ ممرّ.
 * وهو نصّ `تطوير.md`: «المعيار أداة لاكتشاف المشكلة لا حكمٌ آليّ على الموظف».
 */
export const REASONS = Object.freeze({
  pick_short: [
    { id: 'not_found', label: 'الصنف غير موجود في الموقع', blamesWorker: false },
    { id: 'damaged', label: 'الموجود تالف', blamesWorker: false },
    { id: 'expired', label: 'الموجود منتهي الصلاحية', blamesWorker: false },
    { id: 'partial', label: 'الكمّيّة أقلّ من المطلوب', blamesWorker: false },
    { id: 'unreadable', label: 'الباركود غير مقروء', blamesWorker: false },
    { id: 'blocked_aisle', label: 'الممرّ مغلق أو مزدحم', blamesWorker: false },
    other('سببٌ آخر — يُكتب'),
  ],
  receipt_variance: [
    { id: 'short_shipped', label: 'المورّد شحن أقلّ', blamesWorker: false },
    { id: 'over_shipped', label: 'المورّد شحن أكثر', blamesWorker: false },
    { id: 'damaged_transit', label: 'تلفٌ أثناء النقل', blamesWorker: false },
    { id: 'wrong_item', label: 'صنفٌ مخالف للأمر', blamesWorker: false },
    { id: 'count_error', label: 'خطأ عدٍّ عند الاستلام', blamesWorker: true },
    other('سببٌ آخر — يُكتب'),
  ],
  qc_reject: [
    { id: 'no_label', label: 'غياب ملصق البراند', blamesWorker: false },
    { id: 'used_marks', label: 'أثر استعمال', blamesWorker: false },
    { id: 'broken', label: 'كسرٌ أو تلفٌ ظاهر', blamesWorker: false },
    { id: 'expiry_short', label: 'صلاحيةٌ قصيرة عند الاستلام', blamesWorker: false },
    { id: 'spec_mismatch', label: 'مخالفة المواصفة المتّفق عليها', blamesWorker: false },
    other('سببٌ آخر — يُكتب'),
  ],
  putaway_blocked: [
    { id: 'no_space', label: 'لا موقعَ يقبل السعة', blamesWorker: false },
    { id: 'wrong_type', label: 'نوع التخزين لا يناسب الصنف', blamesWorker: false },
    { id: 'mixing_rule', label: 'قاعدة الخلط تمنع', blamesWorker: false },
    { id: 'equipment', label: 'لا رافعة متاحة', blamesWorker: false },
    other('سببٌ آخر — يُكتب'),
  ],
  task_delay: [
    { id: 'device', label: 'عطل الجهاز أو التطبيق', blamesWorker: false },
    { id: 'equipment', label: 'انتظار رافعة أو معدّة', blamesWorker: false },
    { id: 'congestion', label: 'ازدحام الممرّ', blamesWorker: false },
    { id: 'labels', label: 'نقص ملصقات', blamesWorker: false },
    { id: 'qc_wait', label: 'انتظار موافقة الجودة', blamesWorker: false },
    { id: 'location_messy', label: 'الموقع غير مرتّب', blamesWorker: false },
    { id: 'qty_differs', label: 'اختلافٌ فعليّ في الكمّيّة', blamesWorker: false },
    other('سببٌ آخر — يُكتب'),
  ],
  // ‹FNB-303› أسباب تجاوز المقترح — مبنيّةٌ على ما يقع فعلًا في مطعم:
  // حملةٌ أو افتتاحٌ يرفعان الطلب، وعطلةٌ تقلبه، وفقدُ بديلٍ يُحوّل الطلب
  // إلى صنفٍ آخر. و`forecast_error` وحدها تشير إلى **السياسة** لا إلى
  // الفرع — فتكرارُها إشارةُ مراجعةِ Par Level لا لومَ مديرِ فرع.
  order_deviation: [
    { id: 'campaign', label: 'حملة أو عرضٌ ترويجيّ', blamesWorker: false },
    { id: 'event', label: 'مناسبة أو حجزٌ كبير', blamesWorker: false },
    { id: 'holiday', label: 'عطلة أو موسم', blamesWorker: false },
    { id: 'opening', label: 'افتتاح أو إعادة تشغيل', blamesWorker: false },
    { id: 'substitute', label: 'بديلٌ عن صنفٍ مفقود', blamesWorker: false },
    { id: 'menu_change', label: 'تغيير في المنيو', blamesWorker: false },
    { id: 'waste_spike', label: 'هدرٌ أو تلفٌ غير معتاد', blamesWorker: false },
    { id: 'forecast_error', label: 'المقترح لا يطابق الواقع — يُراجَع Par Level', blamesWorker: false },
    other('سببٌ آخر — يُكتب'),
  ],
  // ← إحالةٌ إلى القائمة القائمة، لا نسخةٌ منها.
  visit_skip: SKIP_REASONS.map((label, i) => ({
    id: `skip_${i}`,
    label,
    blamesWorker: false,
    requiresNote: label.includes('آخر'),
  })),
});

/** أسباب سياقٍ بعينه — والسياق المجهول قائمةٌ فارغة لا خطأ. */
export function reasonsFor(context) {
  return REASONS[context] || [];
}

export function reasonLabel(context, id) {
  return reasonsFor(context).find((r) => r.id === id)?.label || '';
}

/**
 * حكم السبب المُدخَل.
 * @returns {{ok:boolean, problem:string}}
 */
export function reasonProblem(context, { id, note } = {}) {
  const list = reasonsFor(context);
  if (!list.length) return { ok: false, problem: `سياق سببٍ غير معروف: «${context}».` };

  const found = list.find((r) => r.id === id);
  if (!found) return { ok: false, problem: 'اختر سببًا من القائمة — النصّ الحرّ لا يُجمَع منه تقرير.' };
  if (found.requiresNote && !String(note || '').trim()) {
    return { ok: false, problem: '«سببٌ آخر» يحتاج بيانًا مكتوبًا — وإلّا كان بابًا للهروب من التصنيف.' };
  }
  return { ok: true, problem: '' };
}

/** أيُحمَّل المنفّذُ هذا السبب؟ المجهول **لا يُحمَّل** — الشكّ لصالحه. */
export function blamesWorker(context, id) {
  return reasonsFor(context).find((r) => r.id === id)?.blamesWorker === true;
}

/**
 * تقرير «لماذا نقصت الكمّيّات» — الجواب الذي لم يكن له مكانٌ يُسأل فيه.
 *
 * @param {Array} entries `{ context, reasonId, qty }`
 * @returns {{rows:Array, total:number, outOfControl:number}}
 */
export function reasonReport(entries, context) {
  const rows = new Map();
  let total = 0;
  let outOfControl = 0;

  for (const e of entries || []) {
    if (context && e?.context !== context) continue;
    const ctx = e?.context;
    const id = e?.reasonId;
    if (!reasonsFor(ctx).some((r) => r.id === id)) continue;

    const key = `${ctx}::${id}`;
    const qty = Number(e?.qty) || 0;
    const row = rows.get(key) || { context: ctx, reasonId: id, label: reasonLabel(ctx, id), count: 0, qty: 0 };
    row.count += 1;
    row.qty += qty;
    rows.set(key, row);
    total += qty;
    if (!blamesWorker(ctx, id)) outOfControl += qty;
  }

  return {
    rows: [...rows.values()].sort((a, b) => b.qty - a.qty || b.count - a.count),
    total,
    /** ما يقع **خارج إرادة المنفّذ** — الرقم الذي يوجّه الإدارة لا الذي يعاقب. */
    outOfControl,
  };
}

export { SKIP_REASONS };
