/**
 * دفعة الإنتاج والصلاحيّة والـYield ‹FNB-503› — منطق خالص.
 *
 * ═══ ثلاثة أشياء تقع لحظة استلام الإنتاج ═══
 * ① **الدفعة تُولَد**: برقمٍ من مولّد الترقيم القائم لا بصيغةٍ ثانية.
 * ② **MFG/EXP يُحسبان**: تاريخ الإنتاج هو يوم الاستلام، والصلاحيّة تُشتقّ
 *    من مدّة صلاحيّة المنتَج — فلا تُكتب بيدٍ فتُنسى أو تُخطئ.
 * ③ **الـYield يُقاس**: المنتَج الفعليّ إلى النظريّ من الوصفة.
 *
 * ═══ ولماذا الـYield من الوصفة لا من المخطَّط وحده ═══
 * «المخطَّط ١٠٠ والمنتَج ٩٢» تقول ٪٩٢ وهي نصف الحقيقة: قد يكون النقص لأنّ
 * الموادّ المصروفة لم تكفِ أصلًا. فالمقياس الصادق يقارن المنتَج **بما كانت
 * الموادّ المصروفة تكفي لإنتاجه** — وهو ما يفصل «خسارة تحضير» عن «صرفٍ ناقص».
 *
 * ═══ والمصنَّع داخليًّا يدخل FEFO بلا استثناء ═══
 * دفعة الإنتاج **نفس بنية الدفعة** لا بنيةٌ ثانية: تدخل `balanceId` كما
 * تدخلها دفعة المورّد، فيسري عليها الترتيب بالصلاحيّة حرفيًّا.
 */
import { formatNumber, nextSeq } from '../documents/numberFormat.js';
import { normalizeItemCode } from './itemIdentity.js';
import { explodeRecipe } from './recipe.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;
const day = (v) => str(v).slice(0, 10);

/** بادئة ترقيم دفعات الإنتاج — تمرّ بالمولّد القائم لا بمولّدٍ ثانٍ. */
export const BATCH_PREFIX = 'PB';

/** رقم دفعة إنتاج رسميّ — `PB-2026-0041`. */
export function productionBatchNumber(year, seq) {
  return formatNumber(BATCH_PREFIX, year, nextSeq(num(seq) - 1));
}

/**
 * تاريخا الإنتاج والصلاحيّة للمنتَج ‹FNB-503›.
 *
 * `mfgDate` يوم الاستلام (الإنتاج وقع عندنا لا عند مورّد)، و`expiry` يُشتقّ
 * من `shelfLifeDays`. وبلا مدّةٍ معرَّفة **لا يُخترع تاريخ**: يُعاد فارغًا
 * ويُعلَن نقصُه — وتاريخُ صلاحيّةٍ مخترَع أخطر من غيابه.
 *
 * @returns {{mfgDate:string, expiry:string, problem:string}}
 */
export function batchDates({ producedOn, shelfLifeDays } = {}) {
  const mfgDate = day(producedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mfgDate)) {
    return { mfgDate: '', expiry: '', problem: 'تاريخ الاستلام غير مقروء — الصيغة YYYY-MM-DD.' };
  }
  const days = num(shelfLifeDays);
  if (days <= 0) {
    return { mfgDate, expiry: '', problem: 'مدّة الصلاحيّة غير معرَّفة للمنتَج — تُدخَل يدويًّا ولا تُخترع.' };
  }
  const t = Date.parse(`${mfgDate}T00:00:00Z`);
  return { mfgDate, expiry: new Date(t + days * 86400000).toISOString().slice(0, 10), problem: '' };
}

/**
 * يختم دفعةً وتاريخَين على بنود استلام الإنتاج — **بلا مسّ ما مُلئ بيد**.
 * فمن كتب دفعةً أو صلاحيّةً صراحةً أدرى بواقعه، ولا يُدهس إدخاله.
 *
 * @param {object[]} lines بنود PRC
 * @param {{batchNumber:string, producedOn:string, shelfLifeBySku?:Map}} ctx
 * @returns {{lines:object[], problems:string[]}}
 */
export function stampBatch(lines = [], ctx = {}) {
  const problems = [];
  const out = (Array.isArray(lines) ? lines : []).map((line) => {
    const sku = normalizeItemCode(line?.sku);
    if (!sku || num(line?.qtyProduced) <= 0) return { ...line };

    const shelfLife = num(line?.shelfLifeDays) || num(ctx.shelfLifeBySku?.get?.(sku));
    const dates = batchDates({ producedOn: ctx.producedOn, shelfLifeDays: shelfLife });
    if (dates.problem && !str(line?.expiry)) problems.push(`«${sku}»: ${dates.problem}`);

    return {
      ...line,
      batch: str(line?.batch) || up(ctx.batchNumber),
      mfgDate: str(line?.mfgDate) || dates.mfgDate,
      expiry: str(line?.expiry) || dates.expiry,
    };
  });
  return { lines: out, problems };
}

/* ═══════════════ الـYield ═══════════════ */

/** عتبة فتح استثناء الـYield — نزولًا عن هذه النسبة يُلاحَق. */
export const YIELD_EXCEPTION_PCT = 85;

/**
 * الـYield بمرجعه ‹FNB-503› — **رقمٌ يُفسَّر لا يُطلق**.
 *
 * `planned` من أمر الإنتاج، و`expected` ما كانت الموادّ المصروفة تكفي
 * لإنتاجه (بالوصفة)، و`produced` الواقع. ومنهما حكمان مختلفان:
 *   · `vsPlanned` يقول: هل بلغنا الخطّة؟
 *   · `vsExpected` يقول: هل أهدرنا في التحضير؟ — وهو **مقياس الشيف**.
 * ومن خلطهما لام الطاهيَ على صرفٍ ناقص، أو غفر له هدرًا خبّأه صرفٌ زائد.
 *
 * @returns {{produced, planned, expected, vsPlanned, vsExpected, why, shortIssue}}
 */
export function yieldOf({ produced = 0, planned = 0, expected = 0 } = {}) {
  const p = round3(produced);
  const pl = round3(planned);
  const ex = round3(expected);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

  const vsPlanned = pct(p, pl);
  const vsExpected = pct(p, ex);
  // صرفٌ لا يكفي الخطّة: يُعلَن كي لا يُحمَّل النقصُ على التحضير.
  const shortIssue = ex > 0 && pl > 0 && ex < pl;

  const parts = [`أُنتج ${p}`];
  if (pl > 0) parts.push(`والمخطَّط ${pl} (٪${vsPlanned})`);
  if (ex > 0) parts.push(`وما تكفيه الموادّ المصروفة ${ex} (٪${vsExpected})`);
  if (shortIssue) parts.push('⚠ الموادّ المصروفة أقلّ من الخطّة — النقص من الصرف لا من التحضير');

  return { produced: p, planned: pl, expected: ex, vsPlanned, vsExpected, why: `${parts.join('، ')}.`, shortIssue };
}

/**
 * ما كانت الموادّ المصروفة تكفي لإنتاجه — **عكسُ انفجار الوصفة**.
 *
 * لكلّ مادّةٍ: المصروف ÷ ما تحتاجه وحدةٌ واحدة = عددُ الوحدات الممكن.
 * و**الأقلّ هو الحاكم** (المادّة المقيِّدة) — فوصفةٌ تحتاج مادّتين لا
 * تُنتج أكثر ممّا تسمح به أشحّهما.
 *
 * @returns {{expected:number, limitedBy:string, problems:string[]}}
 */
export function expectedFromIssued(index, itemsBySku, outputSku, issuedBySku, opts = {}) {
  const perUnit = explodeRecipe(index, itemsBySku, outputSku, 1, opts);
  const problems = [...perUnit.problems];

  const inputs = perUnit.lines.filter((l) => normalizeItemCode(l.sku) !== normalizeItemCode(outputSku));
  if (!inputs.length) {
    return { expected: 0, limitedBy: '', problems: [...problems, `«${up(outputSku)}» بلا وصفةٍ سارية — لا يُحسب له متوقَّع.`] };
  }

  let expected = Infinity;
  let limitedBy = '';
  for (const input of inputs) {
    const need = num(input.qty);
    if (need <= 0) continue;
    const have = num(issuedBySku?.get?.(normalizeItemCode(input.sku)));
    const possible = have / need;
    if (possible < expected) {
      expected = possible;
      limitedBy = normalizeItemCode(input.sku);
    }
  }
  if (!Number.isFinite(expected)) return { expected: 0, limitedBy: '', problems };
  return { expected: round3(expected), limitedBy, problems };
}

/**
 * استثناء Yield منخفض — من نوعٍ يُضاف إلى السجلّ القائم.
 * ويُقاس بـ`vsExpected` (مقياس التحضير) لا بـ`vsPlanned`: فالنقص عن الخطّة
 * بسبب صرفٍ ناقص ليس خطأ إنتاج.
 */
export function yieldException(batch, result, { thresholdPct = YIELD_EXCEPTION_PCT } = {}) {
  const measured = result?.vsExpected ?? result?.vsPlanned;
  if (measured == null || measured >= num(thresholdPct)) return null;
  return {
    type: 'low_yield',
    sku: up(batch?.sku),
    qty: round3(num(result.expected) - num(result.produced)),
    location: up(batch?.warehouse),
    reason: `Yield ٪${measured} دون العتبة ٪${thresholdPct} — ${result.why}`,
  };
}

/**
 * حكم التخصيص ‹FNB-503›: **دفعةٌ رُفضت جودتُها لا تُخصَّص لفرع.**
 * والمعلَّقة (بلا قرار) تُعلَن ولا تُخصَّص — فبضاعةٌ لم تُفحص قد تكون سليمة،
 * وتخصيصُها قبل الحكم يُخرجها من يد الجودة.
 */
export function allocationVerdict(batch) {
  const status = str(batch?.qcStatus).toLowerCase();
  if (status === 'rejected') {
    return { ok: false, problem: `الدفعة «${up(batch?.batch)}» مرفوضةٌ جودةً — لا تُخصَّص لفرع.` };
  }
  if (status !== 'passed') {
    return { ok: false, problem: `الدفعة «${up(batch?.batch)}» بلا قرار جودة — الجودة قبل التعبئة والتخصيص.` };
  }
  return { ok: true, problem: '' };
}
