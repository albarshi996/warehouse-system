/**
 * شبكة الممرّات والمسافة ‹EXE-801› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ العطب (ف ت‑٩) ═══
 * الكود هرميّ (`MAIN-A01-R01-B09-LF-P01`) وهذا يكفي **للهويّة** ولا يكفي
 * **للمسافة**: لا x/y/z ولا اتجاه وصولٍ ولا ممرٍّ أحاديّ الاتجاه ولا نقطة
 * دخول. فترتيب `pickPlan` بالكود لا بالمشي — وقد يُرسل العامل إلى آخر الممرّ
 * ثمّ يُعيده إلى أوّله.
 *
 * ═══ ★★ قرار المالك (ت-O07 · 2026-08-17): **شبكةٌ تقريبيّة من ترتيب الأكواد** ═══
 * لا مخطّطَ هندسيّ بمقاسات. فتُشتقّ الشبكة من الكود نفسه: المنطقة **ممرّ**،
 * وترتيب الرفّ والخانة **موضعٌ على طوله**، والمستوى **ارتفاع**. ولأنّها
 * مشتقّةٌ لا مقيسة فكلّ رقمٍ يخرج من هنا يحمل `approximate:true` وسببَه —
 * **ورقمُ مسافةٍ يُعرض كأنّه مقيس أسوأ من غيابه**، وهي القاعدة نفسها التي
 * حكمت «المتوقّع» في سلسلة الطلب وعنصر الانتقال في الزمن المعياريّ.
 *
 * ومتى دخلت إحداثيّاتٌ حقيقيّة في حقول الموقع الاختياريّة، حلّت محلّ المشتقّ
 * **لذلك الموقع وحده** وصار أساسه `measured` — فلا انتظارَ لمخطّطٍ كامل.
 *
 * ═══ والمسافة عبر الشبكة لا بالخطّ المستقيم ═══
 * موقعان في ممرّين متجاورين قد يبعدان مترين هوائيًّا وأربعين مشيًا: لا يُخترق
 * الرفّ. فالنموذج **ممرٌّ ومعبرٌ عرضيّ**: يخرج العامل من ممرّه إلى المعبر،
 * يمشي عليه، ثمّ يدخل الممرّ الثاني. وهو أبسط نماذج المستودعات وأقربها لواقع
 * صفٍّ من الرفوف.
 */

import { CODE_SEGMENTS, normalizeLocationCode, parseLocationCode } from './locationCode.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v) => String(v ?? '').trim();

/**
 * أبعادٌ **مبدئيّة معلَنة** في مصدرٍ واحد — تُضبط بقياسٍ حقيقيّ متى توفّر.
 * (نمط `WEIGHTS` وأنصبة المراحل وثواني المعياريّ.)
 */
export const GRID_DEFAULTS = Object.freeze({
  /** طول الخانة الواحدة على امتداد الممرّ. */
  bayMeters: 1.2,
  /** المسافة بين ممرٍّ وجاره — عرض الممرّ مع صفّ الرفوف بينهما. */
  aisleMeters: 3.5,
  /**
   * الارتفاع **لا يُمشى**: صعودُ مستوًى تكلفتُه زمنٌ (رافعة/سلّم) لا مسافة.
   * فيُحوَّل إلى «مترٍ مكافئ» معلَنٍ كي يدخل الترتيب بلا أن يُدَّعى أنّه مشي.
   */
  levelEquivalentMeters: 2,
});

/** أساس النقطة: مشتقٌّ من الكود، أو مُدخَلٌ في حقول الموقع. */
export const POINT_SOURCE = Object.freeze({
  derived: { id: 'derived', label: 'مشتقٌّ من ترتيب الكود', approximate: true },
  declared: { id: 'declared', label: 'إحداثيّاتٌ مُدخَلة', approximate: false },
});

/**
 * ترتيبٌ طبيعيّ: يفصل الأرقام عن الحروف كي يقع `A2` قبل `A10`.
 * والترتيب النصّيّ وحده يجعل `A10` قبل `A2` — فيقلب صفَّ الممرّات كلَّه.
 */
export function naturalRank(a, b) {
  const split = (v) => s(v).match(/\d+|\D+/g) || [];
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const p = x[i] ?? '';
    const q = y[i] ?? '';
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) {
      if (Number(p) !== Number(q)) return Number(p) - Number(q);
    } else if (p !== q) {
      return p < q ? -1 : 1;
    }
  }
  return 0;
}

/** مفتاح الموضع على طول الممرّ: الرفّ ثمّ الخانة — الترتيب هو المعنى. */
function alongKey(parsed) {
  return [parsed.rack, parsed.bay].filter(Boolean).join('-');
}

/**
 * يبني الشبكة من قائمة المواقع **مرّةً واحدة**.
 *
 * لماذا مرّةً واحدة؟ لأنّ رتبة الممرّ رتبةٌ **نسبيّة**: تُعرف بمقارنة كلّ
 * المناطق لا بقراءة موقعٍ منفرد. وحسابُها لكلّ استدعاءٍ يجعل المسافة تتغيّر
 * بتغيّر ما مُرِّر — وهو أسوأ من كونها تقريبيّة.
 *
 * @param {Array} locations مواقع (`shapeLocation`) أو أكوادٌ نصّيّة
 * @param {object} [settings] أبعادٌ تُبدّل الافتراضات
 * @returns {{points:Map, settings:object, warehouses:object, approximate:boolean, declared:number}}
 */
export function buildGrid(locations, settings = {}) {
  const dims = { ...GRID_DEFAULTS, ...settings };
  const rows = (locations || [])
    .map((l) => (typeof l === 'string' ? { code: l } : l))
    .map((l) => ({ ...l, code: normalizeLocationCode(l?.code) }))
    .filter((l) => l.code);

  // ① رتبة الممرّ داخل كلّ مستودع، ورتبة الموضع داخل كلّ ممرّ.
  const warehouses = new Map();
  for (const l of rows) {
    const p = parseLocationCode(l.code);
    if (!p) continue;
    const wh = warehouses.get(p.warehouse) || { aisles: new Set(), along: new Map() };
    const aisle = s(l.aisle) || p.zone || '';
    wh.aisles.add(aisle);
    if (!wh.along.has(aisle)) wh.along.set(aisle, new Set());
    wh.along.get(aisle).add(alongKey(p));
    warehouses.set(p.warehouse, wh);
  }

  const index = new Map();
  for (const [wh, data] of warehouses) {
    const aisles = [...data.aisles].sort(naturalRank);
    const along = new Map();
    for (const [aisle, keys] of data.along) {
      along.set(aisle, [...keys].sort(naturalRank));
    }
    index.set(wh, { aisles, along });
  }

  // ② نقطةٌ لكلّ موقع.
  const points = new Map();
  let declared = 0;
  for (const l of rows) {
    const p = parseLocationCode(l.code);
    if (!p) continue;
    const wh = index.get(p.warehouse);
    const aisle = s(l.aisle) || p.zone || '';
    const y = num(l.y);
    const x = num(l.x);
    const z = num(l.z);
    const hasDeclared = x !== null && y !== null;
    if (hasDeclared) declared += 1;

    const aisleRank = wh ? Math.max(0, wh.aisles.indexOf(aisle)) : 0;
    const alongRank = wh ? Math.max(0, (wh.along.get(aisle) || []).indexOf(alongKey(p))) : 0;

    points.set(l.code, {
      code: l.code,
      warehouse: p.warehouse,
      aisle,
      x: x !== null ? x : alongRank,
      y: y !== null ? y : aisleRank,
      z: z !== null ? z : levelIndexOf(p.level),
      source: hasDeclared ? POINT_SOURCE.declared.id : POINT_SOURCE.derived.id,
      approximate: !hasDeclared,
      /** يُخزَّن ويُعرض **ولا يدخل الحساب التقريبيّ** — ينتظر مخطّطًا حقيقيًّا. */
      approach: s(l.approach),
      entryPoint: normalizeLocationCode(l.entryPoint),
    });
  }

  return {
    points,
    settings: dims,
    warehouses: Object.fromEntries([...index].map(([k, v]) => [k, { aisles: v.aisles.length }])),
    /** الشبكة تقريبيّةٌ ما لم تكن كلّ نقاطها مُدخَلة. */
    approximate: declared < points.size,
    declared,
    total: points.size,
  };
}

/** رتبة المستوى من رمزه: `L1`/`LF`/`LG` — والمجهول أرضيّ. */
export function levelIndexOf(level) {
  const v = s(level).toUpperCase();
  if (!v) return 0;
  const digits = v.match(/\d+/);
  if (digits) return Number(digits[0]);
  // LG أرضيّ · LF أوّل — تسمياتٌ شائعة في الأكواد الحرفيّة.
  return { LG: 0, LF: 1, LS: 2, LT: 3 }[v] ?? 0;
}

/** نقطة موقعٍ من الشبكة — و`null` إن لم يكن فيها. */
export function gridPointOf(code, grid) {
  return grid?.points?.get(normalizeLocationCode(code)) || null;
}

/**
 * المسافة بين موقعين **عبر الشبكة**.
 *
 * نموذج الممرّ والمعبر: من كان في ممرٍّ آخر خرج إلى المعبر ثمّ دخل — فلا
 * يُخترق الرفّ. وفي الممرّ نفسه المسافة فرقُ الموضع مباشرةً.
 *
 * @returns {{meters:number|null, approximate:boolean, path:string, note:string}}
 */
export function travelDistance(fromCode, toCode, grid) {
  const a = gridPointOf(fromCode, grid);
  const b = gridPointOf(toCode, grid);
  const dims = grid?.settings || GRID_DEFAULTS;

  if (!a || !b) {
    return {
      meters: null,
      approximate: true,
      path: 'unknown',
      note: 'موقعٌ خارج الشبكة — لا مسافةَ تُحسب، ولا تُخترَع.',
    };
  }
  if (a.warehouse !== b.warehouse) {
    return {
      meters: null,
      approximate: true,
      path: 'cross-warehouse',
      note: 'مستودعان مختلفان — المسافة بينهما نقلٌ لا مشي.',
    };
  }

  const approximate = a.approximate || b.approximate;
  const levels = Math.abs(a.z - b.z) * dims.levelEquivalentMeters;

  if (a.aisle === b.aisle) {
    const meters = Math.abs(a.x - b.x) * dims.bayMeters + levels;
    return {
      meters: round1(meters),
      approximate,
      path: 'same-aisle',
      note: approximate ? 'تقديرٌ من ترتيب الأكواد — لا قياسٌ ميدانيّ.' : '',
    };
  }

  // ★ الخروج إلى المعبر ثمّ الدخول — لا خطٌّ مستقيم يخترق الرفوف.
  const out = a.x * dims.bayMeters;
  const across = Math.abs(a.y - b.y) * dims.aisleMeters;
  const back = b.x * dims.bayMeters;
  return {
    meters: round1(out + across + back + levels),
    approximate,
    path: 'cross-aisle',
    note: approximate
      ? 'تقديرٌ من ترتيب الأكواد عبر المعبر العرضيّ — لا قياسٌ ميدانيّ.'
      : 'عبر المعبر العرضيّ.',
  };
}

/**
 * مسافة تتابعٍ من المواقع بالترتيب المعطى — لا يُعاد ترتيبها هنا.
 * (الترتيب قرارُ `pickPlan` في EXE-802؛ وهذا يقيس ما قرّره.)
 */
export function routeDistance(codes, grid) {
  const list = (codes || []).map(normalizeLocationCode).filter(Boolean);
  let meters = 0;
  let approximate = false;
  let unknown = 0;
  for (let i = 1; i < list.length; i += 1) {
    const leg = travelDistance(list[i - 1], list[i], grid);
    if (leg.meters === null) {
      unknown += 1;
      approximate = true;
      continue;
    }
    meters += leg.meters;
    if (leg.approximate) approximate = true;
  }
  return {
    meters: round1(meters),
    stops: list.length,
    legs: Math.max(0, list.length - 1),
    unknown,
    approximate,
    /** ★ لا رقمَ بلا وصفٍ لأساسه — والشاشة تعرض هذا النصّ مع الرقم. */
    note: unknown
      ? `${unknown} مسافةً تعذّر حسابها (مواقع خارج الشبكة) — الإجمالي ناقص.`
      : approximate
        ? 'إجماليٌّ تقريبيّ من ترتيب الأكواد — لا قياسٌ ميدانيّ.'
        : '',
  };
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

/** الحقول الاختياريّة التي تقبلها المواقع للشبكة — قائمةٌ واحدة يحرسها الاختبار. */
export const GRID_FIELDS = Object.freeze(['x', 'y', 'z', 'approach', 'aisle', 'entryPoint']);

/** ولا حقلَ منها في مقاطع الكود — الشبكة تصف الموقع ولا تغيّر هويّته. */
export const CODE_FIELDS = CODE_SEGMENTS;
