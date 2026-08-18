/**
 * سياق طلب الشراء وأولويّته ‹FNB-601 · FNB-602› — منطق خالص.
 *
 * ═══ ما يرفضه المستند صراحةً ═══
 * «لا يكفي أن ترسل سلاسل الإمداد إلى المشتريات: **مطلوب 1,000 كجم دجاج**»
 * (أسطر 249–253). والغاية معلَنة: «يسمح للإدارة المالية والمشتريات بفهم
 * **أثر التأخير تشغيليًّا**» (سطر 278).
 *
 * ═══ والحقول العشرة **محسوبةٌ لا مكتوبة** ═══
 * كلٌّ منها له مصدرٌ حيّ في البوابة: المخزون من الأرصدة، والمعدّل من
 * الدفتر، وبالطريق من `openDemand`، والفروع المتأثّرة من الشجرة، والوصفة
 * تقول أيّ أصناف منيو تتعطّل. وحقلٌ يُكتب بيدٍ يتقادم بين إنشاء الطلب
 * وترسيته — فيقرأ المشتري رقمًا صار كذبًا.
 *
 * ═══ والأولويّة تُحسب لا تُختار ═══
 * درس ت٣: درجةٌ يختارها موظّفٌ عند الإنشاء **تجمد** بينما الواقع يتغيّر.
 * فالتصنيف الرباعيّ يُشتقّ من أيّام التغطية وعدد الفروع وتاريخ الاحتياج
 * وتوفّر البديل — ويتغيّر بتغيّرها.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { impactOfShortage } from '../items/recipe.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;
const day = (v) => str(v).slice(0, 10);

/** التصنيف الرباعيّ كما نصّ عليه المستند (سطر 276). */
export const PR_PRIORITY = Object.freeze({
  CRITICAL: { id: 'CRITICAL', labelAr: 'حرج', rank: 4, hint: 'نفد أو ينفد قبل وصول التوريد' },
  URGENT: { id: 'URGENT', labelAr: 'عاجل', rank: 3, hint: 'يكفي أقلّ من مهلة التوريد' },
  NORMAL: { id: 'NORMAL', labelAr: 'عادي', rank: 2, hint: 'ضمن دورة الشراء المعتادة' },
  PLANNED: { id: 'PLANNED', labelAr: 'مخطَّط', rank: 1, hint: 'تجديدٌ دوريّ بلا إلحاح' },
});

/** الحقول العشرة ومصدرُ كلٍّ منها — سجلٌّ معلَن يُقرأ بلا فتح الكود. */
export const CONTEXT_FIELDS = Object.freeze([
  { key: 'qty', labelAr: 'الكمّيّة المطلوبة', source: 'الاحتياج الصافي للقطاع' },
  { key: 'onHand', labelAr: 'المخزون الحالي', source: 'الأرصدة' },
  { key: 'rate', labelAr: 'متوسّط الاستهلاك اليوميّ', source: 'دفتر الحركات' },
  { key: 'inTransit', labelAr: 'الكمّيّات بالطريق', source: 'openDemand' },
  { key: 'stockoutDate', labelAr: 'تاريخ توقّع النفاد', source: 'محسوب' },
  { key: 'requiredDate', labelAr: 'تاريخ الاحتياج (Required Date)', source: 'محسوب من النفاد ومهلة التوريد' },
  { key: 'brands', labelAr: 'البراندات المتأثّرة', source: 'الشجرة التنظيميّة' },
  { key: 'branches', labelAr: 'الفروع المتأثّرة', source: 'الشجرة التنظيميّة' },
  { key: 'priority', labelAr: 'درجة الأولويّة', source: 'محسوبة' },
  { key: 'reason', labelAr: 'سبب الاحتياج', source: 'أثر النقص على المنيو' },
]);

const addDays = (isoDate, days) => {
  const t = Date.parse(`${day(isoDate)}T00:00:00Z`);
  if (!Number.isFinite(t)) return '';
  return new Date(t + Math.round(days) * 86400000).toISOString().slice(0, 10);
};

/**
 * يبني سياق سطرٍ في طلب الشراء ‹FNB-601› — **عشرةُ حقولٍ محسوبة**.
 *
 * @param {{sku, qty}} need الاحتياج الصافي (من `netSectorRequirement`)
 * @param {object} ctx
 *   `onHand` · `rate` · `inTransit` · `leadDays` · `today` ·
 *   `recipes` · `itemsBySku` · `branchMenus` · `orgIndex` · `alternatives`
 * @returns {object} السطر بحقوله العشرة و`why`
 */
export function buildRequisitionLine(need, ctx = {}) {
  const sku = normalizeItemCode(need?.sku);
  const qty = round3(num(need?.qty));
  const onHand = round3(num(ctx.onHand));
  const inTransit = round3(num(ctx.inTransit));
  const rate = round3(num(ctx.rate));
  const leadDays = num(ctx.leadDays) > 0 ? num(ctx.leadDays) : 14;
  const today = day(ctx.today);

  // أيّام التغطية من المتاح (الموجود + القادم) — لا من الموجود وحده،
  // فشحنةٌ في الطريق تؤجّل النفاد ولا تُلغيه.
  const available = round3(onHand + inTransit);
  const daysLeft = rate > 0 ? round3(available / rate) : null;
  const stockoutDate = daysLeft !== null ? addDays(today, daysLeft) : '';
  // تاريخ الاحتياج: قبل النفاد بمهلة التوريد — فالطلب يصل قبل أن ينفد.
  const requiredDate = daysLeft !== null ? addDays(today, Math.max(0, daysLeft - leadDays)) : '';

  // أثر النقص من الوصفة والشجرة — «الصنف يؤثّر على ٦ براندات و١٤ فرعًا
  // و٩ Menu Items» (سطر 319). يُستدعى ولا يُعاد بناؤه.
  const impact = ctx.recipes
    ? impactOfShortage(ctx.recipes, sku, {
        branchMenus: ctx.branchMenus || null,
        orgIndex: ctx.orgIndex || null,
        onDate: today,
      })
    : { brands: [], branches: [], menuItems: [] };

  const brands = impact.brands || [];
  const branches = impact.branches || [];
  const menuItems = impact.menuItems || [];

  const priority = priorityOfNeed({
    daysLeft,
    leadDays,
    branchCount: branches.length,
    hasAlternative: Boolean(ctx.alternatives?.length),
  });

  return {
    sku,
    nameAr: str(ctx.nameAr),
    qty,
    onHand,
    rate,
    inTransit,
    daysLeft,
    stockoutDate,
    requiredDate,
    brands,
    branches,
    menuItems,
    priority: priority.id,
    priorityWhy: priority.why,
    // ★ الأثر التشغيليّ بالعربيّة — هذا ما يقرؤه المشتري والماليّ.
    why: impactSentence({ sku, daysLeft, brands, branches, menuItems, priority }),
  };
}

/**
 * التصنيف الرباعيّ محسوبًا ‹FNB-602› — **لا يُختار فيجمد**.
 *
 * ويُشتقّ من: أيّام التغطية المتبقّية مقابل مهلة التوريد · عدد الفروع
 * المتأثّرة · توفّر بديل. فصنفٌ نفد في فرعٍ واحد وله بديلٌ ليس كصنفٍ
 * نفد في عشرة بلا بديل.
 */
export function priorityOfNeed({ daysLeft, leadDays = 14, branchCount = 0, hasAlternative = false } = {}) {
  const lead = num(leadDays) > 0 ? num(leadDays) : 14;
  const left = daysLeft === null || daysLeft === undefined ? null : num(daysLeft);
  const branches = num(branchCount);

  // بلا تاريخٍ كافٍ لا يُخمَّن إلحاح — «مخطَّط» حتّى يُعرف الواقع.
  if (left === null) {
    return { id: 'PLANNED', why: 'لا تاريخ استهلاكٍ كافٍ — يُصنَّف مخطَّطًا حتّى يُعرف معدّله.' };
  }

  const parts = [`يكفي ${left} يومًا والتوريد ${lead}`];
  if (branches > 0) parts.push(`${branches} فرعًا متأثّرًا`);
  if (hasAlternative) parts.push('وله بديلٌ معرَّف');

  // نفد أو ينفد قبل أن يصل التوريد ⇒ حرج.
  if (left <= 0 || left < lead) {
    // والبديل يخفّف درجةً — لا يُلغي الإلحاح بل يجعله عاجلًا لا حرجًا.
    const id = hasAlternative && left > 0 ? 'URGENT' : 'CRITICAL';
    return { id, why: `${parts.join('، ')} — ${PR_PRIORITY[id].hint}.` };
  }
  if (left < lead * 2 || branches >= 5) {
    return { id: 'URGENT', why: `${parts.join('، ')} — ${PR_PRIORITY.URGENT.hint}.` };
  }
  if (left < lead * 4) {
    return { id: 'NORMAL', why: `${parts.join('، ')} — ${PR_PRIORITY.NORMAL.hint}.` };
  }
  return { id: 'PLANNED', why: `${parts.join('، ')} — ${PR_PRIORITY.PLANNED.hint}.` };
}

/** الأثر التشغيليّ جملةً عربيّة — «تأخيرُ هذا يوقف كذا». */
function impactSentence({ daysLeft, brands = [], branches = [], menuItems = [], priority }) {
  const bits = [];
  if (daysLeft !== null && daysLeft !== undefined) bits.push(`المتاح يكفي ${daysLeft} يومًا`);
  if (branches.length) bits.push(`ويؤثّر نقصُه على ${branches.length} فرعًا`);
  if (brands.length) bits.push(`في ${brands.length} براندًا`);
  if (menuItems.length) bits.push(`و${menuItems.length} صنفَ منيو يتعطّل`);
  if (!bits.length) return 'لا أثرَ محسوبٌ بعد — تنقص الوصفة أو الشجرة أو تاريخ الاستهلاك.';
  return `${bits.join(' ')}. الدرجة: ${PR_PRIORITY[priority.id].labelAr}.`;
}

/**
 * ★ حارس الإرسال ‹FNB-601›: **طلبٌ بلا سياقٍ لا يُرسَل** — يمنع لا ينبّه.
 * وهو نصّ المستند حرفيًّا: «لا يكفي أن ترسل… مطلوب ١٠٠٠ كجم دجاج».
 *
 * والغائب يُسمّى حقلًا حقلًا كي يُعرف ما ينقص، لا برسالةٍ عامّة.
 */
export function requisitionSendVerdict(lines = []) {
  const problems = [];
  const rows = Array.isArray(lines) ? lines : [];
  if (!rows.length) return { ok: false, problems: ['طلبٌ بلا بنود — لا شيء يُرسَل.'] };

  for (const [i, line] of rows.entries()) {
    const sku = normalizeItemCode(line?.sku) || `البند ${i + 1}`;
    const missing = [];
    if (num(line?.qty) <= 0) missing.push('الكمّيّة');
    if (line?.onHand === undefined || line?.onHand === null) missing.push('المخزون الحالي');
    if (!num(line?.rate) && line?.rate !== 0) missing.push('متوسّط الاستهلاك');
    if (!str(line?.requiredDate)) missing.push('تاريخ الاحتياج');
    if (!str(line?.priority)) missing.push('درجة الأولويّة');
    if (missing.length) {
      problems.push(`«${sku}» ينقصه: ${missing.join(' · ')} — والطلب المجرَّد بكمّيّةٍ فقط لا يُرسَل.`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** ترتيب البنود بالإلحاح المحسوب — الأشدّ أوّلًا. */
export function rankRequisitionLines(lines = []) {
  return [...(Array.isArray(lines) ? lines : [])].sort(
    (a, b) =>
      (PR_PRIORITY[b?.priority]?.rank || 0) - (PR_PRIORITY[a?.priority]?.rank || 0) ||
      (num(a?.daysLeft) - num(b?.daysLeft))
  );
}

/**
 * تصعيدٌ يدويّ ‹FNB-602› — **الحساب يقترح والإنسان يحكم**، بسببٍ مسجَّل
 * واسم صاحبه (نفس عقد `manualPriority` في محرّك الأولويّة القائم).
 */
export function escalate(line, { to, by, reason } = {}) {
  const target = up(to);
  if (!PR_PRIORITY[target]) return { ok: false, problem: `درجةٌ غير معروفة «${to}».`, line };
  if (!str(reason)) return { ok: false, problem: 'التصعيد اليدويّ يحتاج سببًا مكتوبًا — تجاوزٌ بلا سببٍ لا يُراجَع.', line };
  return {
    ok: true,
    problem: '',
    line: {
      ...line,
      priority: target,
      priorityWhy: `تصعيدٌ يدويّ إلى «${PR_PRIORITY[target].labelAr}» بيد ${str(by) || 'المدير'}: ${str(reason)} (المحسوب كان ${PR_PRIORITY[line?.priority]?.labelAr || '—'}).`,
      manualPriority: { level: target, by: str(by) || 'المدير', reason: str(reason) },
    },
  };
}
