/**
 * وحدات القياس ومعاملات التحويل (م٣-ب · يسدّ ف‑٤).
 *
 * ═══ العطب ═══
 * «صندوق» و«قطعة» و«كيلو» نصوصٌ بلا معنًى حسابيّ. فإذا استُلم بالصناديق وبيع
 * بالقطع، لم يتقابل الرصيدان: يُظهر الدفتر ٢٠ ويُظهر الرفّ ٢٤٠، ولا أحد يعرف
 * أيّهما الصادق — لأنّ كليهما صادقٌ بوحدته.
 *
 * ═══ قاعدتان لا واحدة ═══
 * **داخل العائلة:** المعامل ثابتٌ للجميع. كيلوغرامٌ واحد = ١٠٠٠ غرام دائمًا،
 * ولا يملك صنفٌ أن يخالف.
 * **عبر العائلات:** المعامل خاصٌّ بكلّ صنف. صندوق الشامبو ١٢ قطعة و٦ كيلوغرامات،
 * وصندوق غيره يختلف. فمن جعل «صندوق» وحدةً عامّةً بمعاملٍ واحد أخطأ في الأصل.
 *
 * ═══ الترحيل لا يغيّر رقمًا واحدًا ═══
 * صنفٌ بلا معاملات: وحدته المدخلة **هي** الأساس والمعامل ١. فالتحويل صفرُ أثر
 * حتّى يُعرّف المالك معاملاته صنفًا صنفًا، وغير المعرَّف يستمرّ في العمل.
 *
 * ═══ حارس الكسر ═══
 * ٢٫٥ قطعة تُرفض و٢٫٥ كيلوغرام تُقبل. وليست الحراسة تزيّدًا: نصف قطعةٍ في
 * الدفتر رقمٌ لا يقابله شيءٌ على الرفّ، ويتراكم حتّى يصير عجزًا وهميًّا.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

/** العائلات الأربع ووحدة أساس كلٍّ منها. */
export const UOM_FAMILIES = Object.freeze({
  count: { id: 'count', label: 'عدّ', base: 'piece', allowFraction: false },
  weight: { id: 'weight', label: 'وزن', base: 'kg', allowFraction: true },
  volume: { id: 'volume', label: 'حجم', base: 'litre', allowFraction: true },
  length: { id: 'length', label: 'طول', base: 'metre', allowFraction: true },
});

/**
 * سيّد الوحدات: كلّ وحدةٍ وعائلتها ومعاملها **إلى وحدة الأساس داخل عائلتها**.
 *
 * وحدات العدّ المشتقّة (صندوق · كرتون · طبليّة …) معاملها `null` عمدًا: لا
 * معنى عامّ لـ«صندوق»، فمعامله يأتي من الصنف. وخلطُ هذا هو أصل ف‑٤.
 */
export const UOM_MASTER = Object.freeze({
  // ── عدّ: الأساس قطعة، والمشتقّات بلا معاملٍ عامّ ──
  piece: { id: 'piece', label: 'قطعة', family: 'count', factor: 1 },
  box: { id: 'box', label: 'صندوق', family: 'count', factor: null },
  carton: { id: 'carton', label: 'كرتون', family: 'count', factor: null },
  pack: { id: 'pack', label: 'شدّة', family: 'count', factor: null },
  pallet: { id: 'pallet', label: 'طبليّة', family: 'count', factor: null },
  dozen: { id: 'dozen', label: 'دستة', family: 'count', factor: 12 }, // الدستة ١٢ بالتعريف

  // ── وزن: الأساس كيلوغرام ──
  kg: { id: 'kg', label: 'كيلوغرام', family: 'weight', factor: 1 },
  gram: { id: 'gram', label: 'غرام', family: 'weight', factor: 0.001 },
  ton: { id: 'ton', label: 'طنّ', family: 'weight', factor: 1000 },

  // ── حجم: الأساس لتر ──
  litre: { id: 'litre', label: 'لتر', family: 'volume', factor: 1 },
  ml: { id: 'ml', label: 'مليلتر', family: 'volume', factor: 0.001 },

  // ── طول: الأساس متر ──
  metre: { id: 'metre', label: 'متر', family: 'length', factor: 1 },
  cm: { id: 'cm', label: 'سنتيمتر', family: 'length', factor: 0.01 },
});

/** مرادفات الوحدات كما تُكتب في الشيتات — نفس فلسفة `normalizeUnit` في itemShape. */
const UOM_ALIASES = {
  piece: ['pcs', 'pc', 'unit', 'each', 'ea', 'قطعة', 'قطع', 'حبة', 'حبات', 'وحدة'],
  box: ['صندوق', 'علبة', 'bx'],
  carton: ['ctn', 'كرتون', 'كرتونة', 'كارتون'],
  pack: ['pk', 'packet', 'شدة', 'شدّة', 'باكيت'],
  pallet: ['plt', 'طبلية', 'طبليّة', 'منصة'],
  dozen: ['dz', 'دستة', 'درزن'],
  kg: ['kgs', 'kilo', 'kilogram', 'كيلو', 'كجم', 'كيلوجرام', 'كيلوغرام'],
  gram: ['g', 'gm', 'grams', 'غرام', 'جرام'],
  ton: ['tonne', 'طن', 'طنّ'],
  litre: ['liter', 'l', 'ltr', 'لتر', 'لتره'],
  ml: ['millilitre', 'milliliter', 'مليلتر', 'ملليلتر'],
  metre: ['meter', 'm', 'mtr', 'متر', 'أمتار'],
  cm: ['centimetre', 'centimeter', 'سنتيمتر', 'سم'],
};

/** يحوّل وحدةً مكتوبة بأيّ صيغة إلى معرّفها القياسيّ، أو `''` إن لم تُعرف. */
export function normalizeUom(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (UOM_MASTER[s]) return s;
  for (const [id, aliases] of Object.entries(UOM_ALIASES)) {
    if (aliases.includes(s)) return id;
  }
  return '';
}

/** عائلة وحدةٍ، أو `''`. */
export function familyOf(uom) {
  return UOM_MASTER[normalizeUom(uom)]?.family || '';
}

/** أتقبل هذه الوحدة الكسور؟ العدّ لا. */
export function allowsFraction(uom) {
  const fam = familyOf(uom);
  return fam ? UOM_FAMILIES[fam].allowFraction : true;
}

/**
 * وحدة أساس الصنف: ما يعرّفه الصنف، أو **وحدته المدخلة** إن لم يعرّف شيئًا.
 * وهذا هو الترحيل: بلا تعريفٍ لا تحويل، فلا يتغيّر رقم.
 */
export function baseUomOf(item) {
  return normalizeUom(item?.baseUom) || normalizeUom(item?.unit) || '';
}

/**
 * معامل وحدةٍ **إلى وحدة أساس الصنف**.
 *
 * ثلاث طبقات بالترتيب:
 * ① نفس وحدة الأساس ⇒ ١.
 * ② معاملٌ خاصٌّ بالصنف (`item.uomFactors`) ⇒ يُقدَّم دائمًا، فهو الأدرى.
 * ③ نفس العائلة ⇒ المعامل الثابت (كيلو/غرام). وعبر العائلات بلا تعريفٍ ⇒ `null`.
 *
 * `null` تعني **لا أعرف** لا «صفر»: لا يُحسب رقمٌ من جهل.
 */
export function factorToBase(item, uom) {
  const base = baseUomOf(item);
  const u = normalizeUom(uom);
  if (!u) return null;
  if (!base || u === base) return 1;

  const own = Number(item?.uomFactors?.[u]);
  if (Number.isFinite(own) && own > 0) return own;

  const uMeta = UOM_MASTER[u];
  const bMeta = UOM_MASTER[base];
  if (uMeta && bMeta && uMeta.family === bMeta.family && uMeta.factor && bMeta.factor) {
    return uMeta.factor / bMeta.factor;
  }
  return null;
}

/**
 * كمّيّة بوحدةٍ ما ⇒ كمّيّة بوحدة الأساس.
 * @returns {{ok:boolean, qty:number, base:string, problem:string}}
 */
export function toBase(item, qty, uom) {
  const base = baseUomOf(item);
  const n = Number(qty);
  if (!Number.isFinite(n)) return { ok: false, qty: 0, base, problem: 'كمّيّة غير رقميّة.' };

  const u = normalizeUom(uom);
  const fractionCheck = checkFraction(n, u || base);
  if (!fractionCheck.ok) return { ok: false, qty: 0, base, problem: fractionCheck.problem };

  const f = factorToBase(item, uom);
  if (f === null) {
    return {
      ok: false,
      qty: 0,
      base,
      problem: `لا معامل تحويلٍ من «${uomLabel(uom)}» إلى «${uomLabel(base)}» لهذا الصنف — عرّفه في بطاقة الصنف.`,
    };
  }
  return { ok: true, qty: round(n * f), base, problem: '' };
}

/** كمّيّة بوحدة الأساس ⇒ كمّيّة بوحدةٍ أخرى (للعرض). */
export function fromBase(item, baseQty, uom) {
  const n = Number(baseQty);
  if (!Number.isFinite(n)) return { ok: false, qty: 0, problem: 'كمّيّة غير رقميّة.' };
  const f = factorToBase(item, uom);
  if (f === null || f === 0) {
    return { ok: false, qty: 0, problem: `لا معامل تحويلٍ إلى «${uomLabel(uom)}» لهذا الصنف.` };
  }
  return { ok: true, qty: round(n / f), problem: '' };
}

/** تحويلٌ مباشر بين وحدتَين — عبر الأساس دائمًا، فلا تتراكم أخطاء التقريب. */
export function convert(item, qty, fromUom, toUom) {
  const b = toBase(item, qty, fromUom);
  if (!b.ok) return b;
  const out = fromBase(item, b.qty, toUom);
  return { ...out, base: b.base };
}

/**
 * حارس الكسر: نصف قطعةٍ رقمٌ لا يقابله شيءٌ على الرفّ.
 * @returns {{ok:boolean, problem:string}}
 */
export function checkFraction(qty, uom) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return { ok: false, problem: 'كمّيّة غير رقميّة.' };
  if (Number.isInteger(n)) return { ok: true, problem: '' };
  if (allowsFraction(uom)) return { ok: true, problem: '' };
  return { ok: false, problem: `«${uomLabel(uom)}» لا تقبل الكسور — ${n} ليست كمّيّةً صحيحة.` };
}

/** تسمية وحدةٍ للعرض. المجهول يُعرض كما كُتب لا كـ«غير معروف». */
export function uomLabel(uom) {
  const u = normalizeUom(uom);
  return UOM_MASTER[u]?.label || String(uom ?? '').trim() || '—';
}

/**
 * نصّ العرض المزدوج: «٢٤٠ قطعة، بما يعادل ٢٠ صندوقًا».
 * يُعيد الأساس وحده إن تعذّر التحويل — لا يخترع مكافئًا.
 */
export function displayQty(item, baseQty, preferredUom) {
  const base = baseUomOf(item);
  const head = `${round(baseQty)} ${uomLabel(base)}`;
  const alt = normalizeUom(preferredUom);
  if (!alt || alt === base) return head;
  const conv = fromBase(item, baseQty, alt);
  return conv.ok ? `${head}، بما يعادل ${conv.qty} ${uomLabel(alt)}` : head;
}

/**
 * تحقّقٌ من تعريف معاملات صنف — يُستدعى قبل الحفظ.
 * معاملٌ صفرٌ أو سالبٌ أخطر من غيابه: الغياب يمنع الحساب، والصفر يُنتج صفرًا صامتًا.
 */
export function factorProblems(item) {
  const problems = [];
  const base = baseUomOf(item);
  if (!base) return problems; // بلا أساس: ترحيلٌ صامت، لا خطأ
  if (!UOM_MASTER[base]) problems.push(`وحدة الأساس «${item?.baseUom || item?.unit}» غير معروفة.`);

  for (const [uom, value] of Object.entries(item?.uomFactors || {})) {
    const u = normalizeUom(uom);
    if (!u) {
      problems.push(`الوحدة «${uom}» غير معروفة.`);
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      problems.push(`معامل «${uomLabel(u)}» يجب أن يكون رقمًا موجبًا — الصفر يُنتج صفرًا صامتًا.`);
      continue;
    }
    if (u === base && n !== 1) problems.push(`معامل وحدة الأساس يجب أن يكون ١ لا ${n}.`);

    // معاملٌ يخالف ثابت العائلة تناقضٌ صريح: كيلوغرامٌ لا يساوي ٥٠٠ غرام لصنفٍ دون غيره.
    const uMeta = UOM_MASTER[u];
    const bMeta = UOM_MASTER[base];
    if (uMeta?.family === bMeta?.family && uMeta?.factor && bMeta?.factor) {
      const fixed = uMeta.factor / bMeta.factor;
      if (Math.abs(fixed - n) > 1e-9) {
        problems.push(
          `معامل «${uomLabel(u)}» داخل العائلة ثابتٌ للجميع (${fixed}) — لا يملك صنفٌ أن يخالفه.`
        );
      }
    }
  }
  return problems;
}

/** الوحدات المتاحة لصنف: أساسه + ما عُرّف له + ثوابت عائلته. */
export function availableUoms(item) {
  const base = baseUomOf(item);
  if (!base) return [];
  const fam = UOM_MASTER[base]?.family;
  const set = new Set([base, ...Object.keys(item?.uomFactors || {}).map(normalizeUom).filter(Boolean)]);
  for (const [id, meta] of Object.entries(UOM_MASTER)) {
    if (meta.family === fam && meta.factor) set.add(id);
  }
  return [...set];
}

/**
 * هل عرّف المالك وحدات هذا الصنف صراحةً؟
 *
 * **مفتاح الترحيل الآمن.** صنفٌ لم يُعرَّف: يمرّ رقمه كما هو بلا تحويلٍ ولا
 * حراسةٍ ولا رسائل — سلوك اليوم حرفيًّا. وصنفٌ عُرِّف: يُحوَّل ويُحرَس.
 * فالميزة تدخل صنفًا صنفًا بقرار المالك، لا دفعةً واحدةً على النظام كلّه.
 *
 * `unit` وحده لا يكفي: هو نصٌّ قديمٌ موجودٌ على كلّ صنف، ولو عددناه تعريفًا
 * لانقلبت الميزة على كلّ الأصناف في لحظةٍ واحدة — وهو ما نتجنّبه.
 */
export function hasUomDefinition(item) {
  return Boolean(String(item?.baseUom ?? '').trim() || Object.keys(item?.uomFactors || {}).length);
}

/** تقريبٌ إلى ٦ منازل — يكفي للتجارة ويمنع تراكم أخطاء العشريّة الثنائيّة. */
function round(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}
