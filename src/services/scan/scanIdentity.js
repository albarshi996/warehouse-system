/**
 * هويّةُ الممسوح — «يقرأ الباركود أوّلًا، يظهر الاسم، ثمّ تُكتب البيانات»
 * (طلب المالك · 2026-10-02 · شاشات التنفيذ الميدانيّ كلّها).
 *
 * ═══ ما كان يقع فعلًا ═══
 * في شاشة الاستلام الميدانيّ: العاملُ يمسح الباركود، فتُقيَّد القراءةُ
 * **فورًا** بالكمّيّة والدفعة اللتين كانتا في الحقول من قبل، وتظهر رسالةٌ
 * نصُّها `قُبلت: 6281007021234`. أي أنّ العاملَ:
 *   · لا يرى **اسمَ** ما مسحه — يرى رقمًا من ثلاثة عشر خانة.
 *   · ولا يعرف أهو الصنفُ المقصودُ أم جارُه على الرفّ.
 *   · ويكتشف الخطأ **بعد** أن دخل الطبلية، لا قبله.
 *
 * ★★★ وهذا هو العطبُ بعينه: **الباركودُ هويّةٌ لا يقرؤها إنسان.** ١٣ رقمًا
 * تتشابه في أوّلها وآخرها، والفرقُ بين «لبن ٢٠٠مل» و«لبن ٥٠٠مل» خانةٌ واحدة
 * في الوسط. فعرضُ الرقم تأكيدٌ لا يؤكّد شيئًا — والعاملُ يقرّ بما لم يره.
 *
 * ═══ العقدُ الجديد: تعرَّفْ ثمّ أدخِلْ ثمّ أكِّدْ ═══
 *   ١. المسحُ **يُعرّف ولا يقيّد**: يُترجَم الباركودُ إلى صنفٍ ووحدة.
 *   ٢. فتظهر **بطاقةُ هويّة**: الاسمُ أوّلًا وبخطٍّ كبير، ثمّ الرمزُ والوحدة،
 *      ومعها حكمٌ على انتمائه للأمر (متوقَّع · غيرُ متوقَّع · مجهول).
 *   ٣. ثمّ تُكتب البيانات (الكمّيّة · الدفعة · الصلاحية) والحقلُ الناقصُ
 *      **مسمّى**.
 *   ٤. ثمّ يُؤكَّد.
 *
 * ★★ ولا يُلغي هذا سرعةَ المسح المتتابع: الصنفُ **نفسُه** يُمسح كرتونةً تلو
 * كرتونة، فإعادةُ مسحِ ما هو معروضٌ الآن **تزيد الكمّيّة** ولا تُعيد التعريف
 * (`isRescanOfSame`). فمن يعمل بسرعةٍ يبقى سريعًا، ومن يمسح صنفًا جديدًا
 * يُوقَف ليرى ما مسح.
 *
 * منطق خالص: بلا Firestore وبلا DOM وبلا React.
 */

import { normalizeScanned } from './scanEngine.js';

const text = (v) => String(v ?? '').trim();

/* ═══════════════ أطوارُ البطاقة ═══════════════ */

/**
 * أطوارُ الشاشة الثلاثة — ما يُرى في كلّ طور.
 *
 * `idle` ليس «فراغًا» بل **دعوةٌ صريحة**: شاشةٌ خاليةٌ بحقلٍ وامضٍ لا تقول
 * للعامل الجديد ماذا يفعل. فلها نصُّها كغيرها.
 */
export const SCAN_PHASES = Object.freeze({
  idle: { id: 'idle', title: 'امسح الباركود', hint: 'وجّه الكاميرا إلى الباركود، أو امسح بجهاز القراءة، أو اكتب الرمز.' },
  identified: { id: 'identified', title: 'تعرَّفَ النظامُ على الصنف', hint: 'راجع الاسم، ثمّ اكتب الكمّيّة والبيانات، ثمّ أكّد.' },
  unknown: { id: 'unknown', title: 'باركودٌ غيرُ معروف', hint: 'لا يُقيَّد مجهولٌ — يُسجَّل استثناءً تراجعه الحوكمة.' },
});

/* ═══════════════ التعريف ═══════════════ */

/**
 * يترجم قراءةً إلى **هويّةٍ معروضة** — ولا يقيّد شيئًا.
 *
 * @param {string} raw الباركود كما وصل
 * @param {Function} resolve دالّةُ الترجمة الخاصّة بالشاشة (`resolveScan` مثلًا)
 * @param {{expectedCodes?:string[], expectedSkus?:string[], uomLabel?:Function}} [ctx]
 * @returns {{
 *   phase: string, code: string, item: object|null, sku: string, name: string,
 *   uom: string, uomText: string, factor: number|null,
 *   expectation: 'expected'|'unexpected'|'unknown-order',
 *   lines: {label:string, value:string}[],
 *   problem: string,
 * }}
 */
export function identifyScan(raw, resolve, ctx = {}) {
  const code = normalizeScanned(raw);
  if (!code) {
    return blank('قراءةٌ فارغة — امسح الباركود ثانيةً.');
  }

  const resolved = typeof resolve === 'function' ? resolve(code) : null;
  const item = resolved?.item || null;

  if (!item) {
    return {
      ...blank(''),
      phase: SCAN_PHASES.unknown.id,
      code,
      problem: `الباركود «${code}» غير معروف في ماستر الأصناف.`,
    };
  }

  const sku = text(item.sku || item.code || item.id);
  // الاسمُ **أوّلُ ما يُعرض**، ولا يُترك فارغًا أبدًا: صنفٌ بلا اسمٍ عربيّ
  // يُعرض برمزه — ورمزٌ خيرٌ من فراغٍ تحت عنوان «الصنف».
  const name = text(item.nameAr || item.name || item.nameEn) || sku || code;
  const uom = text(resolved?.uom);
  const uomText = typeof ctx.uomLabel === 'function' ? text(ctx.uomLabel(uom)) || uom : uom;

  const expectation = expectationOf({ sku, code, item }, ctx);

  const lines = [
    { label: 'الرمز', value: sku || '—' },
    { label: 'الباركود الممسوح', value: code },
    { label: 'الوحدة', value: uomText || '—' },
  ];
  // المعامِلُ يُعرض حين يكون غيرَ واحد: «كرتونة = 12 وحدة» هو ما يمنع إدخال
  // 12 حيث تكفي 1. وإخفاؤه حين يساوي 1 يمنع ضجيجًا بلا معنى.
  if (Number.isFinite(resolved?.factor) && resolved.factor !== 1) {
    lines.push({ label: 'المعامل', value: `1 ${uomText || uom} = ${resolved.factor}` });
  }

  return {
    phase: SCAN_PHASES.identified.id,
    code,
    item,
    sku,
    name,
    uom,
    uomText,
    factor: Number.isFinite(resolved?.factor) ? resolved.factor : null,
    expectation,
    lines,
    problem: '',
  };
}

function blank(problem) {
  return {
    phase: SCAN_PHASES.idle.id,
    code: '',
    item: null,
    sku: '',
    name: '',
    uom: '',
    uomText: '',
    factor: null,
    expectation: 'unknown-order',
    lines: [],
    problem: problem || '',
  };
}

/**
 * هل هذا الصنفُ متوقَّعٌ في الأمر الجاري؟
 *
 * ★ و`unknown-order` حالةٌ ثالثةٌ لا تُخلط بـ«غير متوقَّع»: شاشةٌ تعمل بلا
 * أمرٍ مرجعيّ (جردٌ حرٌّ مثلًا) لا تملك حكمًا — فلا تقول «غيرُ متوقَّع» عن
 * صنفٍ لا قائمةَ تُقاس عليه. والادّعاءُ بجهلٍ أسوأ من الصمت.
 */
export function expectationOf({ sku, code }, { expectedCodes, expectedSkus } = {}) {
  const codes = (expectedCodes || []).map((c) => normalizeScanned(c)).filter(Boolean);
  const skus = (expectedSkus || []).map((s) => text(s).toUpperCase()).filter(Boolean);
  if (!codes.length && !skus.length) return 'unknown-order';
  if (skus.includes(text(sku).toUpperCase())) return 'expected';
  if (codes.includes(normalizeScanned(code))) return 'expected';
  return 'unexpected';
}

/** شارةُ التوقّع — نصًّا ونبرةً. و`unknown-order` بلا شارة: لا حكمَ بلا مرجع. */
export function expectationBadge(expectation) {
  if (expectation === 'expected') return { tone: 'ok', label: 'ضمن الأمر' };
  if (expectation === 'unexpected') return { tone: 'warn', label: 'غيرُ مذكورٍ في الأمر' };
  return null;
}

/* ═══════════════ إعادةُ المسح ═══════════════ */

/**
 * هل هذه القراءةُ إعادةً لما هو معروضٌ الآن؟
 *
 * ★★ عليها يقوم بقاءُ السرعة: الكرتونةُ الثانيةُ من الصنف نفسِه لا تُعيد
 * دورةَ التعريف كلَّها — تزيد العدّادَ وتُبقي البطاقة. ولولاها لصار العقدُ
 * الجديدُ عقوبةً على من يعمل بسرعة، ولالتُمس طريقٌ حوله.
 */
export function isRescanOfSame(identity, raw) {
  const code = normalizeScanned(raw);
  return Boolean(code) && Boolean(identity?.code) && identity.code === code;
}

/* ═══════════════ جاهزيّةُ التأكيد ═══════════════ */

/**
 * ما ينقص قبل التأكيد — قائمةُ **أسماءٍ عربيّة** لا رايةُ `false`.
 *
 * ★★ والفرقُ عمليّ: «أكمل البيانات» تُوقف العاملَ أمام أربعة حقولٍ لا يعرف
 * أيَّها المقصود، و«تنقص: الكمّيّة · تاريخ الصلاحية» تُنهي الأمر في ثانية.
 *
 * @param {object} identity
 * @param {{qty?:string|number, batch?:string, expiry?:string}} values
 * @param {{needsQty?:boolean, needsBatch?:boolean, needsExpiry?:boolean}} [req]
 */
export function missingForCommit(identity, values = {}, req = {}) {
  const missing = [];
  if (!identity?.item) return ['باركودٌ معرَّف'];

  if (req.needsQty !== false) {
    const n = Number(values.qty);
    // الفارغُ والصفرُ والسالبُ وغيرُ الرقميّ — كلُّها «لا كمّيّة»، وتُسمّى واحدةً
    // فلا يُقال «الكمّيّة غيرُ صالحة» لحقلٍ لم يُلمَس بعد.
    if (text(values.qty) === '' || !Number.isFinite(n) || n <= 0) missing.push('الكمّيّة');
  }
  if (req.needsBatch && !text(values.batch)) missing.push('رقم الدفعة');
  if (req.needsExpiry && !text(values.expiry)) missing.push('تاريخ الصلاحية');
  return missing;
}

/** هل يجوز التأكيد الآن؟ */
export function canCommit(identity, values, req) {
  return identity?.phase === SCAN_PHASES.identified.id && missingForCommit(identity, values, req).length === 0;
}

/** نصُّ ما ينقص — أو `''` حين لا ينقص شيء. */
export function missingText(identity, values, req) {
  const missing = missingForCommit(identity, values, req);
  return missing.length ? `تنقص: ${missing.join(' · ')}` : '';
}

/**
 * نصُّ تأكيدِ القبول — **بالاسم لا بالرقم**.
 *
 * كان: `قُبلت: 6281007021234`. وصار: `قُبلت: لبن طازج 500مل — 3 كرتونة`.
 * وهذا كلُّ الفرق بين إقرارٍ يُقرأ وإقرارٍ يُوقَّع على بياض.
 */
export function acceptedText(identity, qty) {
  const n = Number(qty);
  const amount = Number.isFinite(n) && n > 0 ? `${n}${identity?.uomText ? ` ${identity.uomText}` : ''}` : '';
  const name = text(identity?.name) || text(identity?.code) || 'الصنف';
  return amount ? `قُبلت: ${name} — ${amount}` : `قُبلت: ${name}`;
}
