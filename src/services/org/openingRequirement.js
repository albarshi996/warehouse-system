/**
 * شدّة الافتتاح ‹FNB-204› — `Opening Supply Requirement` — منطق خالص.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * «بحيث لا يتم تجهيز كل افتتاح جديد يدويًا من الصفر» (سطر 108). والقطاع
 * يستهدف **٢٠ إلى ٣٠ مطعمًا ومفهومًا مختلفًا** (سطر 22) — فالتوليد ليس
 * ترفًا بل شرطُ سعة: ثلاثون شدّة افتتاحٍ تُجهَّز يدويًّا صنفًا صنفًا عملُ
 * أشهر، ونصفُها يُنسى.
 *
 * ═══ لماذا لا مستندٌ جديد ═══
 * الشدّة **نوعُ طلبٍ يُولَّد** لا مستندٌ أربعون: هي طلب نقلٍ (TR) بكمّيّاتٍ
 * محسوبة من ملفّ الفرع. ومن بنى لها مخطّطًا مستقلًّا ضاعف سلسلةً كاملة
 * (مراجعة · اعتماد · حجز · سحب · شحن · استلام) لينالَ حقلًا واحدًا.
 *
 * ═══ ومن أين تأتي الكمّيّة ═══
 * من **الملفّ لا من التخمين**: الأصناف المعتمَدة × Par Level، فإن غاب
 * السقف فمن الطاقة التشغيليّة (وجبات/يوم × أيّام التغطية × نصيب الصنف من
 * الوجبة عبر الوصفة). وكلّ كمّيّةٍ **تحمل مصدرها** — فرقمٌ بلا مرجعٍ في
 * شدّة افتتاحٍ يُراجَع بالتخمين أو يُعتمد بالثقة، وكلاهما خطأ.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { policyFor } from '../intelligence/stockPolicy.js';
import { explodeRecipe } from '../items/recipe.js';
import { replenishes, BRANCH_STATES } from './branchProfile.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;

/** مصادر الكمّيّة، من الأوثق إلى الأضعف — والترتيب نفسه هو الأسبقيّة. */
export const QTY_SOURCES = Object.freeze({
  par: { id: 'par', labelAr: 'Par Level من السياسة' },
  min: { id: 'min', labelAr: 'الحدّ الأدنى من السياسة' },
  capacity: { id: 'capacity', labelAr: 'محسوبة من الطاقة التشغيليّة والوصفة' },
  none: { id: 'none', labelAr: 'لا مصدر — تحتاج إدخالًا يدويًّا' },
});

/**
 * يبني شدّة افتتاحٍ لفرع.
 *
 * @param {object} branch صفّ الفرع (وفيه `profile`)
 * @param {object} ctx
 *   `policies` فهرس السياسات · `dims` أبعاد الفرع · `recipes` فهرس الوصفات ·
 *   `itemsBySku` فهرس الماستر · `coverDays` أيّام التغطية الافتراضيّة
 * @returns {{ok:boolean, branch:string, lines:object[], problems:string[], warnings:string[]}}
 *   كلّ سطر: `{sku, qty, uom, source, why}` — ولا كمّيّةَ بلا مرجع.
 */
export function buildOpeningRequirement(branch, ctx = {}) {
  const code = up(branch?.code);
  const profile = branch?.profile || null;
  const problems = [];
  const warnings = [];

  if (!code) problems.push('لا رمز فرع.');
  if (branch && branch.level !== 'branch') problems.push('شدّة الافتتاح للفروع وحدها.');
  if (!profile) {
    problems.push('لا ملفّ تشغيليّ لهذا الفرع — الشدّة تُولَّد من الملفّ لا من فراغ.');
    return { ok: false, branch: code, lines: [], problems, warnings };
  }

  // الأصناف: المعتمَدة أوّلًا، وإلّا فمكوّنات المنيو المعتمد عبر الوصفات.
  const approved = (profile.allowedSkus || []).map(normalizeItemCode).filter(Boolean);
  const menu = (profile.menuSkus || []).map(normalizeItemCode).filter(Boolean);
  const recipes = ctx.recipes || new Map();
  const itemsBySku = ctx.itemsBySku || new Map();

  let skus = [...new Set(approved)];
  const fromMenu = new Map(); // sku ← كم وحدةً لكلّ وجبةٍ واحدة
  if (menu.length) {
    // نصيبُ كلّ مادّةٍ من **وجبةٍ واحدة** — يُجمع عبر أصناف المنيو كلّها.
    for (const menuSku of menu) {
      const exploded = explodeRecipe(recipes, itemsBySku, menuSku, 1);
      for (const line of exploded.lines) {
        if (line.sku === menuSku) continue; // بلا وصفة: لا نصيبَ يُحسب.
        fromMenu.set(line.sku, round3((fromMenu.get(line.sku) || 0) + line.qty));
      }
    }
    if (!approved.length) skus = [...fromMenu.keys()].sort();
  }

  if (!skus.length) {
    problems.push('لا أصنافَ معتمَدة ولا منيو بوصفاتٍ — لا يُولَّد من فراغ.');
    return { ok: false, branch: code, lines: [], problems, warnings };
  }

  const coverDays = num(ctx.coverDays) > 0 ? num(ctx.coverDays) : 7;
  const covers = num(profile.coversPerDay);
  const lines = [];

  for (const sku of skus) {
    const policy = ctx.policies ? policyFor(ctx.policies, sku, ctx.dims || {}) : null;
    const par = num(policy?.parLevel);
    const min = num(policy?.minQty);
    const perCover = num(fromMenu.get(sku));

    let qty = 0;
    let source = 'none';
    let why = '';

    if (par > 0) {
      qty = par;
      source = 'par';
      why = `Par Level ${par} (سياسة ${policy.sources.parLevel}).`;
    } else if (min > 0) {
      qty = min;
      source = 'min';
      why = `الحدّ الأدنى ${min} (سياسة ${policy.sources.minQty}) — لا Par Level مضبوط.`;
    } else if (perCover > 0 && covers > 0) {
      qty = round3(perCover * covers * coverDays);
      source = 'capacity';
      why = `${perCover} لكلّ وجبة × ${covers} وجبة/يوم × ${coverDays} أيّام تغطية.`;
    } else {
      why = perCover > 0
        ? 'الوصفة تعرف نصيب الوجبة، والطاقة التشغيليّة غير مضبوطة في الملفّ.'
        : 'لا Par Level ولا حدٌّ أدنى ولا وصفةٌ تربطه بالمنيو.';
    }

    lines.push({
      sku,
      qty,
      uom: str(itemsBySku.get(sku)?.baseUom || itemsBySku.get(sku)?.unit),
      source,
      why,
    });
  }

  const blind = lines.filter((l) => l.source === 'none');
  if (blind.length) {
    warnings.push(
      `${blind.length} صنفًا بلا مصدرِ كمّيّة (${blind.slice(0, 5).map((l) => l.sku).join(' · ')}` +
        `${blind.length > 5 ? ' …' : ''}) — تُترك صفرًا وتُدخَل يدويًّا، ولا تُخمَّن.`
    );
  }
  if (!covers) warnings.push('الطاقة التشغيليّة غير مضبوطة في ملفّ الفرع — تعذّر الحساب من الوصفة.');

  return { ok: problems.length === 0, branch: code, lines, problems, warnings };
}

/**
 * الشدّة كطلب نقلٍ (TR) جاهزٍ للمراجعة — **نوعُ طلبٍ يُولَّد لا مستندٌ جديد**.
 * والأصفار تُحمل معها عمدًا: يراها المراجع ويملؤها، ولا تُحذف فتُنسى.
 */
export function toTransferRequest(requirement, { fromWarehouse = '', requestDate = '' } = {}) {
  return {
    type: 'TR',
    header: {
      requestDate: str(requestDate),
      fromWarehouse: up(fromWarehouse),
      toWarehouse: up(requirement?.branch),
      costCenter: up(requirement?.branch),
      purpose: 'شدّة افتتاح',
    },
    lines: (requirement?.lines || []).map((l) => ({
      sku: l.sku,
      qty: l.qty,
      uom: l.uom,
      notes: l.why,
    })),
  };
}

/**
 * نسخُ شدّةٍ من فرعٍ إلى فرعٍ من **المفهوم نفسه** (سطر 108: «لا يُجهَّز كلّ
 * افتتاحٍ من الصفر»). ويُرفض النسخ عبر المفاهيم: شدّةُ مقهًى ليست شدّةَ مخبز.
 */
export function copyOpeningFrom(sourceBranch, targetBranch) {
  const sc = sourceBranch?.profile?.concept;
  const tc = targetBranch?.profile?.concept;
  if (!sc || !tc) return { ok: false, problem: 'أحد الفرعين بلا نوع نشاطٍ محدَّد — لا يُنسخ بالتخمين.', skus: [] };
  if (sc !== tc) return { ok: false, problem: `المفهومان مختلفان (${sc} ≠ ${tc}) — شدّةُ مفهومٍ لا تصلح لآخر.`, skus: [] };
  const skus = [...new Set([...(sourceBranch.profile.allowedSkus || []), ...(sourceBranch.profile.menuSkus || [])].map(normalizeItemCode).filter(Boolean))];
  return { ok: true, problem: '', skus: skus.sort() };
}

/* ═══════════════ الانتقال من الافتتاح إلى التغذية ═══════════════ */

/**
 * حكم انتقال حالة الفرع ‹FNB-204› — «يتحوّل من شدّة الافتتاح إلى نظام إعادة
 * تغذية مستمرّ» (سطر 112): **انتقالُ حالةٍ بحدثٍ مسجَّل لا حذفُ مستند**.
 *
 * الانتقالات المسموحة تُعلَن سجلًّا: مَن أوقف فرعًا يُعيده تشغيلًا، ومَن
 * افتتحه لا يُعيده «قيد تجهيز» — الماضي لا يُلغى.
 */
export const STATE_TRANSITIONS = Object.freeze({
  planned: ['opening', 'suspended'],
  opening: ['operating', 'suspended'],
  operating: ['suspended'],
  suspended: ['operating'],
});

/**
 * أيُسمح بهذا الانتقال؟ ولماذا لا.
 * @returns {{ok:boolean, problem:string}}
 */
export function transitionVerdict(from, to, branch = null) {
  const f = str(from) || 'planned';
  const t = str(to);
  if (!BRANCH_STATES[t]) return { ok: false, problem: `حالةٌ غير معروفة «${t}».` };
  if (f === t) return { ok: false, problem: 'الحالة نفسها — لا انتقال.' };
  if (!(STATE_TRANSITIONS[f] || []).includes(t)) {
    return { ok: false, problem: `لا انتقال من «${BRANCH_STATES[f]?.labelAr || f}» إلى «${BRANCH_STATES[t].labelAr}» — الماضي لا يُلغى.` };
  }
  // ولا يُعلَن التشغيل المستمرّ بلا تاريخ افتتاح: الحالة تسبق واقعَها.
  if (t === 'operating' && branch && !str(branch?.profile?.openingDate)) {
    return { ok: false, problem: 'لا انتقال إلى التشغيل المستمرّ بلا تاريخ افتتاحٍ في الملفّ.' };
  }
  return { ok: true, problem: '' };
}

/** أيُخدَم هذا الفرع بالمقترح الدوريّ أم بشدّة الافتتاح؟ */
export function servedBy(branch) {
  return replenishes(branch?.profile?.state) ? 'replenishment' : 'opening';
}
