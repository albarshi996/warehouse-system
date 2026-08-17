/**
 * خطّة السحب الموجّه — منطق خالص بلا Firebase.
 *
 * يجيب عن سؤال العامل الوحيد: **«أين أجد هذا الصنف، وكم آخذ من كلّ رفّ؟»**
 *
 * ═══ ما كان ناقصًا في `fefoViolations` القائم ═══
 * ① **لا يصفّي بالمستودع** — يقارن أرصدة المخازن كلّها، فيُنتج «مخالفة» كاذبة
 *    لأنّ في مخزنٍ آخر تشغيلةً أقدم لا يستطيع العامل الوصول إليها أصلًا.
 * ② **لا يعرف الموقع** — يقول «خالفتَ» ولا يقول «اسحب من هنا».
 * ③ **تحذيرٌ لا مانع** — لا يُستدعى عند الإنجاز، فالمخالفة تُسجَّل ولا تُمنع.
 *
 * وهذا الملفّ يسدّ الثلاثة، **وحدوده مُعلَنة**: ما لا يملك بياناتٍ للحكم عليه
 * يمرّ كما اليوم. حارسٌ يمنع ما يجب أن يمرّ أسوأ من الفجوة التي يسدّها.
 */

import { allocateFefo } from '../ledger/reservations.js';
import { expiryStatus } from '../balances/balanceKey.js';
import { normalizeLocationCode, shortLabelOf } from './locationCode.js';
import { routeDistance, travelDistance } from './travelGrid.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();

/** هويّة الصنف في البند — الكود ثمّ الباركود، كما في مفتاح الرصيد. */
function lineItem(line) {
  return up(line?.sku) || up(line?.barcode);
}

/**
 * يستبعد المنتهي من الصرف العاديّ.
 *
 * `nowMs` يُمرَّر صراحةً ولا تُقرأ الساعة هنا — منطقٌ خالصٌ لا يتقلّب اختباره
 * بتغيّر اليوم (نفس عقد `expiryStatus`). وبلا `nowMs` لا استبعاد: من لم
 * يُمرّر تاريخًا لا يريد الحكم.
 */
export function sellableStock(balances, nowMs) {
  if (!nowMs) return balances || [];
  return (balances || []).filter((b) => expiryStatus(b?.expiry, nowMs) !== 'expired');
}

/**
 * خطّة سحب بندٍ واحد: من أيّ رفٍّ وكم، بترتيب FEFO.
 *
 * @returns {{picks:Array, allocated:number, shortfall:number, ok:boolean, problem:string}}
 */
export function planLine({ line, balances, warehouse, nowMs } = {}) {
  const qty = num(line?.qtyRequested ?? line?.qty);
  const item = lineItem(line);
  if (!item) return { picks: [], allocated: 0, shortfall: qty, ok: false, problem: 'البند بلا كود ولا باركود.' };
  if (qty <= 0) return { picks: [], allocated: 0, shortfall: 0, ok: false, problem: 'الكمّيّة المطلوبة صفر.' };

  const pool = sellableStock(balances, nowMs);
  const result = allocateFefo(
    { sku: line?.sku, barcode: line?.barcode, qty, warehouse: warehouse || line?.warehouse },
    pool
  );

  const picks = result.allocations.map((a) => ({
    bin: normalizeLocationCode(a.bin),
    shortLabel: a.bin ? shortLabelOf(a.bin) : '',
    batch: a.batch,
    expiry: a.expiry,
    qty: a.qty,
    balanceId: a.balanceId,
    warehouse: a.warehouse,
  }));

  return {
    picks,
    allocated: result.allocated,
    shortfall: result.shortfall,
    ok: result.ok,
    problem: result.shortfall > 0 ? `المتاح أقلّ من المطلوب بـ${result.shortfall}.` : '',
  };
}

/**
 * خطّة المستند كلّه — لكلّ بندٍ مواقعه وكمّيّاته.
 * ومسار السحب مرتَّبٌ **بالموقع** لا بترتيب البنود: العامل يمشي الممرّ مرّةً
 * واحدة بدل أن يذهب ويعود.
 */
export function pickPlan(pickDoc, balances, { nowMs, grid = null } = {}) {
  const warehouse = up(pickDoc?.header?.warehouse);
  const lines = (pickDoc?.lines || []).map((line, index) => ({
    index,
    sku: line?.sku || '',
    barcode: line?.barcode || '',
    description: line?.description || '',
    requested: num(line?.qtyRequested ?? line?.qty),
    ...planLine({ line, balances, warehouse, nowMs }),
  }));

  const shortages = lines.filter((l) => l.shortfall > 0);
  const path = pickPathOrder(lines, grid);
  return {
    warehouse,
    lines,
    path,
    /** ★ مقياس المسار — يُعرض للمشرف مع أساسه لا رقمًا عاريًا (EXE-802). */
    route: routeDistance(path.map((s) => s.bin), grid),
    /** بأيّ شيءٍ رُتّب المسار — يُعلَن ولا يُخمَّن. */
    pathBasis: pathBasisOf(path, grid),
    shortages,
    ok: shortages.length === 0,
  };
}

/**
 * مسار السحب: صفٌّ لكلّ (موقع × بند).
 *
 * ═══ الترتيب بالمشي حين تتوفّر الشبكة، وبالكود حين لا تتوفّر ‹EXE-802› ═══
 * الترتيب بالكود يُقصّر المشي **غالبًا** لأنّ الكود هرميّ — لكنّه يجهل أنّ
 * ممرَّين متجاورين في الترتيب قد يكونا متباعدَين في المبنى، وأنّ العودة إلى
 * أوّل الممرّ بعد بلوغ آخره مشيٌ مضاعف. فمتى مُرّرت الشبكة رُتّب المسار
 * **بأقرب تالٍ فعلًا** (nearest-neighbour من أوّل موقعٍ بالكود).
 *
 * ★★ **وبلا شبكةٍ لا انكسار**: يعود الترتيب إلى الكود حرفيًّا كما كان — لا
 * ترتيبَ عشوائيّ ولا خطأ. فالشبكة تحسّن ولا تُشترط، ومستودعٌ لم تُعرَّف
 * مواقعه بعد يبقى يعمل كما عمل أمس.
 *
 * ولماذا «أقرب تالٍ» لا المسار الأمثل؟ لأنّ الأمثل مسألةُ بائعٍ متجوّل: كلفتها
 * أُسّيّة، وربحُها على عشرين موقعًا لا يُذكر أمام تقريبٍ يخطئ بخطوات. والصدق
 * أن يُقال إنّه تقريب — وهو مقالٌ في `pathBasis`.
 */
export function pickPathOrder(plannedLines, grid = null) {
  const steps = [];
  for (const line of plannedLines || []) {
    for (const p of line.picks || []) {
      steps.push({
        bin: p.bin,
        shortLabel: p.shortLabel,
        sku: line.sku,
        description: line.description,
        batch: p.batch,
        expiry: p.expiry,
        qty: p.qty,
        lineIndex: line.index,
      });
    }
  }

  const byCode = steps.sort(
    (a, b) => String(a.bin).localeCompare(String(b.bin)) || String(a.sku).localeCompare(String(b.sku))
  );
  if (!grid?.points?.size) return byCode;

  // أقرب تالٍ — والبداية أوّل موقعٍ بالكود كي يبقى المسار ثابتًا للاختبار
  // ولا يتغيّر بتغيّر ترتيب البنود في المستند.
  const remaining = byCode.slice();
  const ordered = [];
  let current = remaining.shift();
  if (!current) return byCode;
  ordered.push(current);

  while (remaining.length) {
    let bestIndex = 0;
    let bestMeters = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      // الصفّ نفسه موقعًا: صفرٌ لا مسافة — بنودٌ عدّة على رفٍّ واحد تُجمَع.
      if (remaining[i].bin === current.bin) {
        bestIndex = i;
        bestMeters = 0;
        break;
      }
      const leg = travelDistance(current.bin, remaining[i].bin, grid);
      // ما لا يُحسب لا يتصدّر: يبقى إلى آخر المسار بدل أن يُخمَّن قربه.
      const meters = leg.meters === null ? Infinity : leg.meters;
      if (meters < bestMeters) {
        bestMeters = meters;
        bestIndex = i;
      }
    }
    current = remaining.splice(bestIndex, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

/** بأيّ شيءٍ رُتّب المسار — نصٌّ يُعرض مع الرقم لا يُخمَّن. */
export function pathBasisOf(path, grid) {
  if (!grid?.points?.size) {
    return { id: 'code', label: 'مرتَّبٌ بكود الموقع — لا شبكةَ ممرّاتٍ معرَّفة بعد' };
  }
  const known = (path || []).filter((s) => grid.points.has(String(s.bin || ''))).length;
  if (!known) return { id: 'code', label: 'مرتَّبٌ بكود الموقع — لا موقعَ من هذه المهمّة في الشبكة' };
  return {
    id: 'grid',
    label: grid.approximate
      ? 'مرتَّبٌ بأقصر مشيٍ تقريبيّ عبر الشبكة (من ترتيب الأكواد)'
      : 'مرتَّبٌ بأقصر مشيٍ عبر الشبكة المُدخَلة',
    covered: known,
    total: (path || []).length,
  };
}

/**
 * مخالفات FEFO **بالموقع وداخل المستودع الواحد**.
 *
 * تُعيد لكلّ مخالفةٍ «اسحب من هنا بدلًا منه» — فالحارس الذي يقول «خالفتَ»
 * ولا يقول «الصواب» يُطفَأ بعد أسبوع.
 */
export function fefoLocationViolations(pickDoc, balances, { nowMs } = {}) {
  const out = [];
  const warehouse = up(pickDoc?.header?.warehouse);
  const pool = sellableStock(balances, nowMs);

  for (const line of pickDoc?.lines || []) {
    const picked = num(line?.qtyPicked);
    if (picked <= 0) continue;

    const item = lineItem(line);
    if (!item) continue;

    // ① التصفية بالمستودع — تشغيلةٌ في مخزنٍ آخر ليست متاحةً لهذا العامل.
    const lots = pool.filter(
      (b) => (up(b?.sku) === item || up(b?.barcode) === item) && num(b?.qty) > 0 && (!warehouse || up(b?.warehouse) === warehouse)
    );
    if (!lots.length) continue;

    const pickedExpiry = String(line?.expiry ?? '').trim();
    // بلا صلاحيةٍ على البند لا معيار — يمرّ كما اليوم.
    if (!pickedExpiry) continue;

    const dated = lots.filter((b) => String(b?.expiry ?? '').trim());
    if (!dated.length) continue;

    const earliest = dated.reduce((a, b) => (Date.parse(a.expiry) <= Date.parse(b.expiry) ? a : b));
    if (Date.parse(earliest.expiry) >= Date.parse(pickedExpiry)) continue;

    // ② ويُقال أين توجد الأقدم.
    out.push({
      sku: line.sku || line.barcode,
      description: line.description || '',
      pickedExpiry,
      pickedBin: normalizeLocationCode(line?.bin),
      earliestExpiry: earliest.expiry,
      earliestBatch: earliest.batch || '',
      earliestQty: num(earliest.qty),
      earliestBin: normalizeLocationCode(earliest.bin),
      message: `سُحب ما ينتهي ${pickedExpiry} وفي ${earliest.bin ? `الرفّ ${shortLabelOf(earliest.bin)}` : 'المخزن'} ${num(earliest.qty)} تنتهي ${earliest.expiry} — اسحب منها أوّلًا.`,
    });
  }
  return out;
}

/**
 * حارس إنجاز السحب — ③ يصير **مانعًا** بعد أن كان تحذيرًا.
 *
 * ★★ وحدوده مُعلَنة، ولكلٍّ اختبار:
 *  · بندٌ بلا صلاحية، أو مخزونٌ بلا صلاحية ⇒ **يمرّ** (لا معيار للحكم).
 *  · بلا أرصدةٍ محمَّلة ⇒ **يمرّ** (لا نمنع لأنّنا لا نعرف).
 *  · وسببٌ مكتوب في رأس المستند (`fefoOverrideReason`) يحوّل المنع إلى
 *    تحذيرٍ مقيَّد — نفس عقد التجاوز الذي اعتمده المالك في التخزين.
 *
 * @returns {{problems:string[], warnings:string[], violations:Array}}
 */
export function pickPostingProblems(pickDoc, balances, { nowMs } = {}) {
  const violations = fefoLocationViolations(pickDoc, balances, { nowMs });
  if (!violations.length) return { problems: [], warnings: [], violations };

  const reason = String(pickDoc?.header?.fefoOverrideReason ?? '').trim();
  const messages = violations.map((v) => `${v.sku}: ${v.message}`);

  if (reason) {
    return {
      problems: [],
      warnings: [...messages, `أُجيزت المخالفة بسبب: ${reason}`],
      violations,
    };
  }
  return {
    problems: [
      ...messages,
      'لإتمام السحب رغم ذلك اكتب سبب المخالفة في رأس المستند (fefoOverrideReason) — ويُحفظ في السجلّ.',
    ],
    warnings: [],
    violations,
  };
}
