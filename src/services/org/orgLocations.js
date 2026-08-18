/**
 * سيّد المواقع التنظيميّة (م٦-أ · يسدّ ف‑٥ وف‑٦).
 *
 * ═══ الفجوتان ═══
 * **ف‑٦:** لا سيّد مواقع تنظيميّة إطلاقًا — لا قطاع ولا براند في البيانات،
 * فنموذج الشركة القائم على القطاعات غير ممثَّلٍ في النظام.
 * **ف‑٥:** مركز التكلفة **نصٌّ حرّ** في حقلَين. فيكتبه موظّفٌ «فرع بنغازي»
 * وآخر «بنغازي» وثالث «BEN»، ثمّ يُسأل: كم كلّفتنا خدمة الفرع؟ فلا جواب.
 *
 * ═══ التوجيه بالملكية لا بالاسم ═══
 * الاسم يتغيّر ويُكتب بصيغٍ شتّى ويتكرّر بين فرعَين. أمّا **الملكية** فبنية:
 * لكلّ موقعٍ أبٌ، والتكلفة تصعد الشجرة إلى جذرها. فسؤال «كم كلّف هذا القطاع؟»
 * يُجاب بجمع أبنائه لا بمطابقة نصوصٍ يكتبها بشر.
 *
 * ═══ الترحيل ═══
 * السيّد **اختياريّ**: نصٌّ لا يطابق أيّ موقع يبقى كما هو ويُوسَم «غير مربوط»،
 * ولا يُمنع مستندٌ من الحفظ. فالبيانات تُنظَّف على مهل، ولا يوم توقّف.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * مستويات الهيكل — من الأعمّ إلى الأخصّ.
 * `parentOf` يحدّد أيّ مستوًى يصلح أبًا: فرعٌ تحت براند، وبراندٌ تحت قطاع.
 */
export const ORG_LEVELS = [
  { id: 'sector', labelAr: 'قطاع', parentOf: null, order: 1 },
  { id: 'brand', labelAr: 'براند', parentOf: 'sector', order: 2 },
  { id: 'branch', labelAr: 'فرع', parentOf: 'brand', order: 3 },
  { id: 'cost_center', labelAr: 'مركز تكلفة', parentOf: 'branch', order: 4 },
];

export const LEVEL_IDS = ORG_LEVELS.map((l) => l.id);

/** مستوًى بمعرّفه. */
export function levelOf(id) {
  return ORG_LEVELS.find((l) => l.id === id) || null;
}

/** فهرسٌ بالرمز — كلّ العمليات تمرّ به فلا مسحٌ خطّيٌّ متكرّر. */
export function indexLocations(locations = []) {
  const map = new Map();
  for (const loc of Array.isArray(locations) ? locations : []) {
    const code = up(loc?.code);
    if (code) map.set(code, { ...loc, code });
  }
  return map;
}

/**
 * سلسلة الملكية من موقعٍ إلى جذره: `[الموقع, أبوه, ...]`.
 * محروسةٌ ضدّ الحلقات — بياناتٌ فاسدة يجب ألّا تُعلّق الشاشة إلى الأبد.
 */
export function ancestryOf(index, code) {
  const chain = [];
  const seen = new Set();
  let current = index?.get?.(up(code)) || null;
  while (current && !seen.has(current.code)) {
    seen.add(current.code);
    chain.push(current);
    current = current.parentCode ? index.get(up(current.parentCode)) || null : null;
  }
  return chain;
}

/**
 * توجيه نصٍّ إلى موقعٍ تنظيميّ — **بالرمز أوّلًا ثمّ بالاسم**.
 *
 * والرمز يُقدَّم لأنّه لا يتكرّر، والاسم قد يتكرّر بين فرعَين. فإن تطابق اسمان
 * أُعيد `ambiguous` ولم يُخترَ أحدهما — واختيارٌ عشوائيٌّ يُحمّل التكلفة على
 * فرعٍ بريء.
 *
 * @returns {{status:'matched'|'unlinked'|'ambiguous', location:object|null, candidates:object[]}}
 */
export function resolveLocation(index, raw) {
  const key = up(raw);
  if (!key) return { status: 'unlinked', location: null, candidates: [] };

  const byCode = index?.get?.(key);
  if (byCode) return { status: 'matched', location: byCode, candidates: [] };

  const byName = [...(index?.values?.() || [])].filter(
    (l) => up(l.nameAr) === key || up(l.nameEn) === key
  );
  if (byName.length === 1) return { status: 'matched', location: byName[0], candidates: [] };
  if (byName.length > 1) return { status: 'ambiguous', location: null, candidates: byName };
  return { status: 'unlinked', location: null, candidates: [] };
}

/** حقول المستندات التي تحمل موقعًا تنظيميًّا — موضعٌ واحد يُغيَّر لو أُضيف حقل. */
export const ORG_FIELDS = ['costCenter', 'budgetCode', 'orgCode', 'branch', 'sector'];

/** رمز الموقع من رأس مستند — أوّل حقلٍ مملوء يفوز. */
export function orgCodeOf(doc) {
  const h = doc?.header || {};
  for (const f of ORG_FIELDS) {
    if (str(h[f])) return str(h[f]);
  }
  return '';
}

/**
 * تحميل تكلفة مستندٍ على موقعه التنظيميّ **وعلى كلّ آبائه**.
 *
 * الصعود ضرورة: تكلفةٌ على «مركز تكلفة صيانة بنغازي» هي أيضًا تكلفةٌ على فرع
 * بنغازي وعلى براندها وعلى قطاعها. ومن حمّلها على الورقة وحدها لم يستطع أن
 * يجيب: كم كلّفنا هذا القطاع؟
 *
 * @param {Map} index فهرس المواقع
 * @param {object[]} entries سطورٌ لها `{orgCode, amount}`
 * @returns {Map<string, {code, nameAr, level, direct, rollup}>}
 */
export function costByLocation(index, entries = []) {
  const out = new Map();
  const touch = (loc) => {
    if (!out.has(loc.code)) {
      out.set(loc.code, {
        code: loc.code,
        nameAr: str(loc.nameAr) || loc.code,
        level: loc.level,
        direct: 0,
        rollup: 0,
      });
    }
    return out.get(loc.code);
  };

  for (const e of Array.isArray(entries) ? entries : []) {
    const amount = money(num(e?.amount));
    if (amount === 0) continue;
    const chain = ancestryOf(index, e?.orgCode);
    if (!chain.length) continue; // غير مربوط — يُحصى منفصلًا لا يُوزَّع بالتخمين
    chain.forEach((loc, depth) => {
      const row = touch(loc);
      if (depth === 0) row.direct = money(row.direct + amount);
      row.rollup = money(row.rollup + amount);
    });
  }
  return out;
}

/** ما لم يُربط بموقع — يُحصى ويُعرض، فلا يذوب في المجموع بصمت. */
export function unlinkedCost(index, entries = []) {
  return money(
    (Array.isArray(entries) ? entries : [])
      .filter((e) => !ancestryOf(index, e?.orgCode).length)
      .reduce((s, e) => s + num(e?.amount), 0)
  );
}

/**
 * تحقّقٌ من سيّد المواقع قبل الحفظ.
 * أخطر ما فيه **الحلقة**: موقعٌ أبوه ابنُه يُعلّق كلّ حسابٍ يصعد الشجرة.
 */
export function locationProblems(locations = []) {
  const problems = [];
  const index = indexLocations(locations);
  const seen = new Set();

  for (const loc of locations || []) {
    const code = up(loc?.code);
    if (!code) {
      problems.push('موقعٌ بلا رمز.');
      continue;
    }
    if (seen.has(code)) problems.push(`الرمز «${code}» مكرّر — والرمز هويّةٌ لا وصف.`);
    seen.add(code);

    if (!str(loc.nameAr)) problems.push(`${code}: بلا اسمٍ عربيّ.`);
    if (!LEVEL_IDS.includes(loc.level)) {
      problems.push(`${code}: مستوًى غير معروف «${loc.level}».`);
      continue;
    }

    const expected = levelOf(loc.level)?.parentOf;
    const parent = str(loc.parentCode) ? index.get(up(loc.parentCode)) : null;
    if (!expected && parent) problems.push(`${code}: قطاعٌ له أب — والقطاع جذر.`);
    if (expected && !str(loc.parentCode)) problems.push(`${code}: ${levelOf(loc.level).labelAr} بلا أب.`);
    if (expected && str(loc.parentCode) && !parent) problems.push(`${code}: أبٌ غير موجود «${loc.parentCode}».`);
    if (expected && parent && parent.level !== expected) {
      problems.push(`${code}: أبوه «${parent.code}» مستواه ${parent.level} والمتوقَّع ${expected}.`);
    }
  }

  // الحلقات: موقعٌ يصل إلى نفسه صعودًا.
  for (const loc of locations || []) {
    const chain = ancestryOf(index, loc?.code);
    const codes = chain.map((c) => c.code);
    if (new Set(codes).size !== codes.length) problems.push(`${up(loc.code)}: حلقةٌ في الملكية.`);
    // `ancestryOf` يقطع الحلقة، فنكشفها بأنّ الجذر ليس قطاعًا.
    if (chain.length && chain[chain.length - 1].parentCode) {
      problems.push(`${up(loc.code)}: سلسلة الملكية لا تنتهي بجذر — حلقةٌ أو أبٌ مفقود.`);
    }
  }
  return problems;
}

/** خيارات العرض مرتّبةً بالمستوى ثمّ بالاسم — لقائمةٍ منسدلة. */
export function locationOptions(locations = [], { level = '' } = {}) {
  return (Array.isArray(locations) ? locations : [])
    .filter((l) => !level || l.level === level)
    .map((l) => ({
      value: up(l.code),
      label: `${str(l.nameAr) || l.code} (${levelOf(l.level)?.labelAr || l.level})`,
      level: l.level,
    }))
    .sort((a, b) => (levelOf(a.level)?.order || 9) - (levelOf(b.level)?.order || 9) || a.label.localeCompare(b.label));
}

/**
 * حارس «الفرع الداخليّ موقعُ مخزونٍ لا عميل» (CC-401).
 *
 * فرعٌ داخليّ سُجّل عميلًا يجعل النقل إليه **بيعًا**: تنشأ ذمّةٌ على أنفسنا
 * وإيرادٌ لا وجود له، ويغيب الرصيد عن مخزوننا وهو في مخازننا. النقل الداخليّ
 * طريقه `TR → TRN → TRC` عبر `TRANSIT` — لا فاتورة.
 *
 * دالّة خالصة تُغذّى بسيّد المواقع وسيّد العملاء وتعيد التداخل بالاسم —
 * تحذيرٌ يُعرض حيث تُدار المواقع، لا مانعُ حفظٍ (البيانات تُنظَّف على مهل).
 */
export function internalBranchProblems(locations = [], customers = []) {
  const customerCodes = new Map(
    (Array.isArray(customers) ? customers : [])
      .map((c) => [up(c?.code), c])
      .filter(([code]) => code)
  );
  const out = [];
  for (const loc of Array.isArray(locations) ? locations : []) {
    if (loc?.level !== 'branch') continue;
    const code = up(loc?.code);
    const hit = code ? customerCodes.get(code) : null;
    if (hit) {
      out.push(
        `الفرع «${str(loc.nameAr) || code}» (${code}) مسجَّلٌ عميلًا باسم «${str(hit.nameAr) || code}» — ` +
          'النقل الداخليّ TR→TRN→TRC عبر TRANSIT، لا بيعٌ يفتح ذمّةً على أنفسنا.'
      );
    }
  }
  return out;
}

/**
 * حكم وجهة الصرف ‹FNB-103› — **توجيه المدير العام حرفيًّا**: «لا يتم صرف أي
 * مادة من المخزن بصورة عامة على حساب F&B فقط، وإنما يتم توثيق الحركة على
 * الفرع الفعلي المستفيد».
 *
 * فرمزٌ مستواه `sector` أو `brand` على حركة خروجٍ **وعاءٌ لا مستفيد** — يُرفض
 * بسببٍ مقروء، **ويُقترح البديل**: فروعُ الوعاء المختار نفسِه — رفضٌ يهدي
 * لا يصدّ. أمّا غير المربوط فيمرّ ويُوسَم (عقد السيّد الاختياريّ): لا منعَ
 * بجهلنا، والبيانات تُنظَّف على مهل.
 *
 * @returns {{ok:boolean, level:string, problem:string, suggestions:{code,nameAr}[]}}
 */
export function dispatchTargetVerdict(index, raw) {
  const res = resolveLocation(index, raw);
  if (res.status !== 'matched') return { ok: true, level: '', problem: '', suggestions: [] };

  const loc = res.location;
  if (loc.level !== 'sector' && loc.level !== 'brand') {
    return { ok: true, level: loc.level, problem: '', suggestions: [] };
  }

  // البديل: فروع هذا الوعاء بعينه — النازلة عنه في الشجرة، النشطة وحدها.
  const suggestions = [...(index?.values?.() || [])]
    .filter((l) => l.level === 'branch' && l.active !== false)
    .filter((l) => ancestryOf(index, l.code).some((a) => a.code === loc.code))
    .map((l) => ({ code: l.code, nameAr: str(l.nameAr) || l.code }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const label = levelOf(loc.level)?.labelAr || loc.level;
  return {
    ok: false,
    level: loc.level,
    problem:
      `«${str(loc.nameAr) || loc.code}» ${label}ٌ — وعاءُ تجميعٍ لا مستفيد. الصرف يُوثَّق على الفرع الفعليّ` +
      (suggestions.length ? `: ${suggestions.slice(0, 6).map((s2) => s2.code).join(' · ')}` : ' — ولا فروعَ نشطة تحته بعد.'),
    suggestions,
  };
}

/** أنواع مستندات الخروج إلى الفروع — عليها يسري حكم الوجهة. */
export const DISPATCH_DOC_TYPES = Object.freeze(['DN', 'TRN']);

/**
 * خروقات الوجهة لمستندٍ — تُدمج مع تحذيرات المخطّط في الشاشة.
 * الحكم **عند الإنشاء لا عند القراءة**: تُحسب للمستند المفتوح للتحرير،
 * والمحفوظ قبل القاعدة لا يُعاد حكمُه.
 */
export function dispatchViolations(docType, doc, index) {
  if (!DISPATCH_DOC_TYPES.includes(up(docType))) return [];
  const code = orgCodeOf(doc);
  if (!code) return [];
  const verdict = dispatchTargetVerdict(index, code);
  return verdict.ok ? [] : [verdict.problem];
}

/**
 * أبعاد مستندٍ كاملةً من رمز موقعه: مركز التكلفة وفرعه وبرانده وقطاعه.
 * للفلاتر والتقارير — الرمز الواحد في الرأس يكفي، والشجرة تُكمل الباقي.
 */
export function dimensionsOf(index, doc) {
  const chain = ancestryOf(index, orgCodeOf(doc));
  const at = (level) => chain.find((l) => l.level === level) || null;
  return {
    orgCode: up(orgCodeOf(doc)),
    matched: chain.length > 0,
    costCenter: at('cost_center'),
    branch: at('branch'),
    brand: at('brand'),
    sector: at('sector'),
  };
}

/**
 * مبلغ مستندٍ لتحميل التكلفة — أوّل عمودٍ ماليٍّ موجود يفوز، ثمّ (كمية × سعر)
 * ثمّ (كمية × تكلفة). صفرٌ ليس عطبًا: مستندٌ بلا مال يُحصى صفرًا لا يُخمَّن.
 */
export function docAmountOf(doc) {
  return money(
    (doc?.lines || []).reduce((total, l) => {
      for (const k of ['lineTotal', 'amount', 'total']) {
        if (l?.[k] != null && l[k] !== '') return total + num(l[k]);
      }
      const qty = num(l?.qty);
      if (qty && num(l?.unitPrice)) return total + qty * num(l?.unitPrice);
      if (qty && num(l?.unitCost)) return total + qty * num(l?.unitCost);
      return total;
    }, 0)
  );
}
