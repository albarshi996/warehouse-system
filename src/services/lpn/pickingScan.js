/**
 * تنفيذ التحضير بالمسح الثلاثيّ — موقعٌ ثمّ طبليةٌ ثمّ صنف. منطق خالص.
 *
 * المشكلة التي يحلّها: السحب بلا مسحٍ يعتمد على أنّ المحضّر **قرأ الورقة
 * صحيحًا ووقف عند الرفّ الصحيح وأخذ الدفعة الصحيحة**. وثلاثتها تُخطئ في
 * يومٍ مزدحم، ولا يُكتشف الخطأ إلّا عند العميل — أو في الجرد بعد شهر.
 *
 * فالمسح الثلاثيّ يجعل كلّ خطوةٍ مبرهنةً لا مظنونة (خطة ٧ سادسًا).
 *
 * ═══ الموانع السبعة (خطة ٧ حرفيًّا) ═══
 * ①موقعٌ مخالف · ②صنفٌ أو دفعةٌ غير مخصّصة · ③كمّيّةٌ أكبر من المطلوب ·
 * ④طبليةٌ محجوزةٌ أو تحت الفحص · ⑤دفعةٌ منتهية · ⑥مخزونٌ غير متاح ·
 * ⑦رصيدٌ سالب. وكلٌّ منها له اختبارٌ يثبته.
 *
 * ═══ ولماذا تُمسح الطبلية أصلًا؟ ═══
 * لأنّ الرفّ قد يحمل طباليَ عدّة من الصنف نفسه بدفعاتٍ مختلفة. فمسحُ الموقع
 * والصنف وحدهما يقول «أخذتُ من هنا» ولا يقول **من أيّ حمولة** — فتضيع
 * الدفعة، ويسقط FEFO، وينقطع نسبُ ما وصل العميل.
 */

import { normalizeLocationCode } from '../locations/locationCode.js';
import { isBlockedForIssue, LPN_FLAGS, stateLabel } from './lpnLifecycle.js';
import { normalizeLpnCode, isValidLpnCode } from './lpnCode.js';
import { currentStep, stepRemaining } from './pickingTask.js';
// ★★ محرّك الوحدات يُستدعى ولا يُقلَّد: خطوةُ التحضير تُقرأ **كما يُقرأ صنف**،
// فلو تغيّرت قاعدةُ الوحدات غدًا تغيّر حكمُ التحضير معها ولا يبقى موضعان.
import { UOM_FAMILIES, checkFraction, convert, familyOf, normalizeUom, uomLabel } from '../items/uomModel.js';
import { scanUomChoices } from '../stock/scanFlow.js';
import { needsPackEntry } from '../items/packEntry.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
/** تقريب ٦ منازل — قاعدةُ المحرّك نفسُها، تمنع تراكم أخطاء العشريّة الثنائيّة. */
const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/** مراحل المسح الثلاث — بترتيبها الحاكم. */
export const SCAN_STAGES = Object.freeze({
  BIN: 'امسح باركود الرفّ',
  PALLET: 'امسح ملصق الطبلية',
  ITEM: 'امسح باركود الصنف',
  QTY: 'أدخل الكمّيّة المسحوبة',
});

/** المرحلة التالية المنتظَرة — تُشتقّ ممّا مُسح لا من عدّادٍ في الشاشة. */
export function nextStage(progress) {
  if (!progress?.bin) return 'BIN';
  if (!progress?.lpn) return 'PALLET';
  if (!progress?.sku) return 'ITEM';
  return 'QTY';
}

/** ① حكم مسح الرفّ: يجب أن يكون رفّ الخطوة الجارية بعينه. */
export function binVerdict(task, code) {
  const step = currentStep(task);
  if (!step) return { ok: false, message: 'لا خطوةَ جارية — المهمّة اكتملت أو أُقفلت.' };
  const wanted = normalizeLocationCode(code);
  if (!wanted) return { ok: false, message: SCAN_STAGES.BIN + ' — لا سحبَ من موقعٍ غير مقروء فعليًّا.' };
  if (wanted !== normalizeLocationCode(step.bin)) {
    return {
      ok: false,
      message: `المطلوب الآن رفّ «${step.bin}» والممسوح «${wanted}» — لا تأخذ صنفًا من موقعٍ غير موقعه المطلوب.`,
    };
  }
  return { ok: true, message: '', step };
}

/** ④ حكم مسح الطبلية: موجودةٌ في الرفّ، وليست موسومةً حاجبًا. */
export function palletVerdict(step, code, unit) {
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) {
    return { ok: false, message: `«${code ?? ''}» ليس ملصق طبلية — ${SCAN_STAGES.PALLET}.` };
  }
  if (!unit) return { ok: false, message: `الطبلية «${lpn}» غير موجودة في السجلّ — سجّلها استثناءً للحوكمة.` };

  if (normalizeLocationCode(unit.bin) !== normalizeLocationCode(step?.bin)) {
    return {
      ok: false,
      message: `الطبلية «${lpn}» مسجَّلةٌ في «${unit.bin || 'بلا موقع'}» لا في «${step?.bin}» — إمّا نُقلت بلا تسجيل وإمّا هذه طبليةٌ أخرى.`,
    };
  }
  // ④ الوسم الحاجب يمنع الصرف — لا الوجود (وهو نصّ خطة ٧: «الصرف من طبلية
  // محجوزة أو تحت الفحص» من الممنوعات).
  if (isBlockedForIssue(unit)) {
    const names = (unit.flags ?? []).filter((f) => Object.hasOwn(LPN_FLAGS, f)).map((f) => `«${LPN_FLAGS[f]}»`).join(' و');
    return { ok: false, message: `الطبلية موسومة ${names} — لا يُصرف منها حتى يُرفع الوسم بقرار حوكمة.` };
  }
  if (!['STORED', 'RESERVED', 'PICKING'].includes(unit.state)) {
    return { ok: false, message: `الطبلية «${stateLabel(unit.state)}» — لا يُسحب منها في هذه الحالة.` };
  }
  return { ok: true, message: '', unit };
}

/** ②⑤ حكم مسح الصنف: مطابقٌ لبند الخطوة، ودفعتُه هي المخصّصة وغير منتهية. */
export function itemVerdict(step, { sku, barcode, batch, expiry } = {}, { asOf } = {}) {
  const scanned = up(sku) || up(barcode);
  if (!scanned) return { ok: false, message: SCAN_STAGES.ITEM };
  if (scanned !== up(step?.sku) && scanned !== up(step?.barcode)) {
    return { ok: false, message: `المطلوب «${step?.sku}» والممسوح «${scanned}» — صنفٌ غير مخصّصٍ لهذه الخطوة.` };
  }
  // ② الدفعة المخصّصة: خُصّصت بـFEFO في الخطّة، فأخذُ غيرها يكسر الترتيب
  // ويترك الأقرب انتهاءً على الرفّ حتى يفسد.
  const wantBatch = up(step?.batch);
  if (wantBatch && up(batch) !== wantBatch) {
    return {
      ok: false,
      message: `المخصَّص دفعة «${wantBatch}» والممسوح «${up(batch) || 'بلا دفعة'}» — الأقرب انتهاءً أوّلًا (FEFO)، وأخذُ غيرها يترك القديم يفسد.`,
    };
  }
  // ⑤ الصلاحية: منتهيةٌ لا تُصرف بحال.
  const exp = String(expiry ?? step?.expiry ?? '').slice(0, 10);
  const today = String(asOf ?? '').slice(0, 10);
  if (exp && today && exp < today) {
    return { ok: false, message: `الدفعة «${up(batch) || wantBatch}» منتهيةٌ منذ ${exp} — لا تُصرف؛ أبلغ الحوكمة لسحبها.` };
  }
  return { ok: true, message: '' };
}

/* ═══════════ وحدةُ الخطوة: من رقمٍ عارٍ إلى كمّيّةٍ لها معنى ═══════════ */

/**
 * ★★★ الكمّيّة الأساس لسحبةٍ — **تُحسب من المعامل ولا تُفترض**.
 *
 * كان هنا `Number(qty)` عاريًا: قرارٌ صامتٌ بأنّ ما كتبه المحضّر أساسٌ. فمن
 * سحب كرتونًا وكتب «١» صار في الحمولة الخارجة «١» — لا اثنا عشر.
 *
 * ثلاثُ حالاتٍ لا تُخلط:
 *   · **خطوةٌ بلا وحدةٍ معلنة** ⇒ الرقمُ أساسٌ ومعاملُه ١ ضمنًا. وهو سلوكُ
 *     اليوم **حرفًا**: مهمّةٌ قديمة لا تتغيّر بقيمةٍ واحدة.
 *   · **وحدةٌ بمعاملٍ معروف** ⇒ الضرب.
 *   · **وحدةٌ بلا معامل** ⇒ `null` — «لا أعرف». ولا يُخترع رقم: المجهولُ
 *     يُوسم ويُستثنى من المجاميع (عقيدةُ `totalBaseQty` و`scanBaseQty` نفسُها).
 *
 * @returns {number|null}
 */
export function pickBaseQty(step, qty) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return null;
  if (!String(step?.uom ?? '').trim()) return n;
  const f = Number(step?.factor);
  if (!Number.isFinite(f) || f <= 0) return null;
  return round6(n * f);
}

/**
 * ★★ لوحةُ خانة الكمّيّة — **الحكمُ أيَّ المسارَين، ومعه ما تعرضه الشاشة.**
 *
 * ═══ ولماذا هنا لا بشرطٍ في JSX ═══
 * لأنّ الشاشة لو سألت «أللخطوة وحدة؟» بشرطها الخاصّ لَافترق حكمُها عن حكم
 * `packEntryVerdict` الذي يسأل `needsPackEntry` — فتعرض الشاشةُ قائمةً
 * ويرفض المحرّكُ ما يُدخل فيها، أو العكس. فالسؤال واحدٌ ويُسأل مرّةً.
 *
 * ★ و`card` بطاقةُ وحداتٍ مصغّرة تُشتقّ من الخطوة، تُمرَّر حرفًا إلى
 * `scanUomChoices` و`baseQtyPreview` و`packEntryVerdict` — فيقرأ محرّكُ
 * الوحدات القائمُ الخطوةَ كما يقرأ صنفًا، ولا يُعاد بناءُ سطرٍ من منطقه.
 *
 * ⚠️ ووحدةُ الأساس تُستنبط من عائلة الوحدة حين لا يختمها المستند: «كرتون»
 * عائلتُه العدّ وأساسُ العدّ «قطعة» — وهو تعريفُ المحرّك لا اختراعَ هنا.
 * ووحدةٌ لا يعرف المحرّكُ عائلتَها («شوال») تبقى بلا أساس، فتذهب الخطوة إلى
 * المسار (ب) حيث يُعلن الواقفُ أمام الرفّ وعاءَه ومحتواه.
 *
 * @returns {{card:object, uom:string, factor:number|null, baseUom:string,
 *            choices:Array<{value:string,label:string}>, mode:'uom'|'pack', label:string}}
 */
export function stepQtyPanel(step) {
  const uom = String(step?.uom ?? '').trim();
  const factor = Number(step?.factor);
  const known = Number.isFinite(factor) && factor > 0 ? factor : null;
  const family = familyOf(uom);
  const baseUom = String(step?.baseUom ?? '').trim() || (family ? UOM_FAMILIES[family].base : '');

  const card = { baseUom, uomFactors: {} };
  if (uom && known !== null) card.uomFactors[normalizeUom(uom) || uom] = known;

  const choices = scanUomChoices(card);
  // ★ وحدةُ الخطوة تبقى في القائمة دائمًا: بها كُتب `required`، وقائمةٌ
  // تُسقطها تُلزم المحضّرَ تحويلًا لم يطلبه أحد. والمجهولةُ المعامل تُقال
  // مجهولةً — الصمتُ هنا يوحي بتحويلٍ معروفٍ وهو غير معروف.
  if (uom && !choices.some((o) => o.value === uom)) {
    choices.unshift({ value: uom, label: known === null ? `${uomLabel(uom)} (معاملٌ غير معرّف)` : uomLabel(uom) });
  }

  return {
    card,
    uom,
    factor: known,
    baseUom,
    choices,
    /*
     * الحكمُ الفاصل — يُسأل `needsPackEntry` ولا يُقلَّد بشرطٍ يشبهه.
     *
     * ووحدةُ الخطوة **تتقدّم عليه**: خطوةٌ أعلنت وحدتَها كُتب بها `required`،
     * فإعلانُ وعاءٍ فوقها يُدخل رقمًا بوحدةٍ ثالثةٍ ويكسر مقارنةَ المطلوب.
     * والمسار (ب) لمن لا وحدةَ له أصلًا — وهو حالُ ألفٍ وأربعين صنفًا اليوم.
     *
     * ⚠️ وحدُّ اللوحة معلَن: بطاقتُها مبنيّةٌ من **الخطوة** لا من بطاقة الصنف،
     * فلا تعرف إلّا وحدةَ الخطوة وثوابتَ عائلتها. ومن أراد أن يُدخل بكرتونٍ
     * لخطوةٍ بالقطعة يلزمه ماستر الأصناف في هذه الشاشة — بابٌ آخر لا هذا.
     */
    mode: !uom && needsPackEntry(card) ? 'pack' : 'uom',
    label: uom ? uomLabel(uom) : '',
  };
}

/**
 * ★★ حكمُ ما كُتب في خانة الكمّيّة — ويعيده **بوحدة الخطوة**.
 *
 * ولماذا يُعاد بوحدة الخطوة لا بوحدة الأساس؟ لأنّ `required` و`picked`
 * مكتوبان بوحدة الخطوة، و`qtyVerdict` يقارن بهما. فمن أدخل «٢ كرتون» لخطوةٍ
 * بالقطعة تُعاد له ٢٤ قطعةً فتقارَن بالمطلوب على أرضيّةٍ واحدة — والخلطُ هنا
 * هو نفسُه العطبُ الذي تسدّه هذه الطبقة، فلا يُعاد ارتكابه من الجهة الأخرى.
 *
 * @returns {{ok:boolean, problem:string,
 *            entry:{qty:number, uom:string, factor:number|null, baseQty:number|null}|null}}
 */
export function pickEntryVerdict(step, { qty, uom } = {}) {
  const panel = stepQtyPanel(step);
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, problem: `الكمّيّة «${qty ?? ''}» غير صالحة — أكبر من صفر.`, entry: null };
  }

  const chosen = String(uom ?? '').trim();
  const same = !panel.uom || !chosen || (normalizeUom(chosen) || chosen) === (normalizeUom(panel.uom) || panel.uom);
  // بلا وحدةٍ مختارةٍ أو بوحدة الخطوة نفسِها: الرقمُ يمرّ كما كُتب — سلوكُ اليوم.
  if (same) return accept(step, panel, n);

  if (!panel.choices.some((o) => o.value === chosen)) {
    return { ok: false, problem: `الوحدة «${uomLabel(chosen)}» ليست من وحدات هذه الخطوة — اخترها من القائمة.`, entry: null };
  }
  const conv = convert(panel.card, n, chosen, panel.uom);
  if (!conv.ok) return { ok: false, problem: conv.problem, entry: null };
  // ⚠️ التحويلُ النازل يُنتج كسرًا: قطعةٌ واحدة من خطوةٍ بالكرتون جزءٌ من اثني
  // عشر، ولا يُسحب من الرفّ كسرُ كرتونة. فحارسُ الكسر يُعاد على **وحدة الخطوة**
  // لا على وحدة الإدخال وحدَها — وإلّا مرّ ما لا يُحمل باليد.
  const fraction = checkFraction(conv.qty, panel.uom);
  if (!fraction.ok) return { ok: false, problem: fraction.problem, entry: null };
  return accept(step, panel, conv.qty);
}

/** قبولٌ ببنائه — شكلُ المخرَج واحدٌ في الحالين فلا تفحص الشاشةُ وجودَ الحقل. */
function accept(step, panel, qty) {
  return {
    ok: true,
    problem: '',
    entry: { qty, uom: panel.uom, factor: panel.factor, baseQty: pickBaseQty(step, qty) },
  };
}

/**
 * ③⑥⑦ حكم الكمّيّة: لا فوق المطلوب، ولا فوق ما تحمله الطبلية، ولا سالب.
 *
 * ★ والفرق بين الحدَّين مقصود: «فوق المطلوب» يحمي **الأمر** من تنفيذٍ زائد،
 * و«فوق المحمول» يحمي **الحقيقة** من رصيدٍ سالب. وقد يقع أحدهما دون الآخر.
 */
export function qtyVerdict(step, unit, qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: `الكمّيّة «${qty}» غير صالحة — أكبر من صفر.` };

  const remaining = stepRemaining(step);
  if (n > remaining) {
    return { ok: false, message: `المطلوب من هذه الخطوة ${remaining} والمدخَل ${n} — لا تأخذ أكثر ممّا طُلب.` };
  }

  const onPallet = (unit?.lines ?? [])
    .filter((l) => up(l.sku) === up(step?.sku) && (!up(step?.batch) || up(l.batch) === up(step?.batch)))
    .reduce((s, l) => s + (Number(l.baseQty ?? l.qty) || 0), 0);

  /*
   * ★★★ والمقارنة **بوحدة الأساس على الجهتين**: ما تحمله الطبلية مجموعُ
   * `baseQty`، وكان يُقابَل بالرقم كما كُتب. فخطوةٌ بالكرتون تدخلها «٢» تُقارَن
   * بستّين قطعةً فتمرّ، والحقيقةُ أنّها أربعٌ وعشرون — الحارسُ كان يقيس
   * بمسطرتين. والمجهولُ المعاملِ يُقاس بخامه: حدٌّ أدنى لا حكمٌ كامل، ولا
   * يُخترع له تحويل (وهو سلوكُ اليوم حرفيًّا لخطوةٍ بلا وحدة).
   */
  const wanted = pickBaseQty(step, n);
  const against = wanted === null ? n : wanted;
  if (onPallet > 0 && against > onPallet) {
    const said = against === n ? `${n}` : `${n} ${uomLabel(step?.uom)} (= ${against})`;
    return {
      ok: false,
      message: `على الطبلية ${onPallet} والمطلوب سحبُ ${said} — الرصيد لا يُسالَب. راجع محتوى الطبلية أو خذ الباقي من طبليةٍ أخرى.`,
    };
  }
  return { ok: true, message: '' };
}

/**
 * الحكم الكامل لمسحةٍ مكتملة — يجمع الأربعة بترتيبها.
 *
 * @returns {{ok:boolean, message:string, stage:string, pick?:object}}
 */
export function pickVerdict(task, { bin, lpn, sku, barcode, batch, expiry, qty }, { unit, asOf } = {}) {
  const b = binVerdict(task, bin);
  if (!b.ok) return { ...b, stage: 'BIN' };
  const step = b.step;

  const p = palletVerdict(step, lpn, unit);
  if (!p.ok) return { ...p, stage: 'PALLET' };

  const i = itemVerdict(step, { sku, barcode, batch, expiry }, { asOf });
  if (!i.ok) return { ...i, stage: 'ITEM' };

  const q = qtyVerdict(step, unit, qty);
  if (!q.ok) return { ...q, stage: 'QTY' };

  return {
    ok: true,
    message: '',
    stage: 'DONE',
    pick: {
      seq: step.seq,
      bin: normalizeLocationCode(bin),
      lpn: normalizeLpnCode(lpn),
      sku: up(step.sku),
      batch: up(step.batch),
      expiry: step.expiry ?? '',
      qty: Number(qty),
      // ★ السحبةُ تخرج بوحدتها ومعاملها وأساسها — فمن قرأها بعد شهرٍ عرف
      // **ماذا** سُحب لا كم رقمًا كُتب. والمجهولُ `null` لا صفرًا.
      uom: String(step.uom ?? '').trim(),
      factor: Number(step.factor) > 0 ? Number(step.factor) : null,
      baseQty: pickBaseQty(step, Number(qty)),
    },
  };
}

/**
 * تطبيق سحبةٍ مقبولة على المهمّة — يعيد مهمّةً **جديدة**.
 * الخطوة تُقفل حين يبلغ المسحوب المطلوب؛ ودونه تبقى مفتوحةً للباقي.
 */
export function applyPick(task, pick) {
  const steps = (task?.steps ?? []).map((s) => {
    if (s.seq !== pick.seq) return s;
    const picked = (Number(s.picked) || 0) + (Number(pick.qty) || 0);
    // ★★ كلّ سحبةٍ تسجّل **من أيّ طبلية** جاءت: خطوةٌ واحدة قد تُستوفى من
    // طبليتين (الأولى نفدت والباقي من الثانية). وبلا هذا يضيع النسب عند
    // تكوين حمولة الصرف، فلا يُعرف أصلُ ما وصل العميل.
    const from = [...(s.picks ?? [])];
    const at = from.find((f) => f.lpn === pick.lpn);
    if (at) at.qty += Number(pick.qty) || 0;
    else if (pick.lpn) from.push({ lpn: pick.lpn, qty: Number(pick.qty) || 0 });
    return { ...s, picked, picks: from, state: picked >= (Number(s.required) || 0) ? 'DONE' : 'PENDING' };
  });
  return { ...task, state: 'IN_PROGRESS', steps };
}

/**
 * سحبات المهمّة مسطّحةً — مدخلُ `buildIssuePallet` عند الإقفال.
 * تُشتقّ من الخطوات ولا تُخزَّن ثانيةً.
 */
export function picksOfTask(task) {
  const out = [];
  for (const s of task?.steps ?? []) {
    for (const p of s.picks ?? []) {
      if (!(Number(p.qty) > 0)) continue;
      const qty = Number(p.qty);
      // ★★★ كان هنا `baseQty: Number(p.qty)` — قرارٌ صامتٌ بأنّ الرقمَ أساسٌ.
      // فالحمولةُ الخارجة تحمل عددَ الكراتين مكتوبًا «قِطَعًا»، ولا يُكشف
      // الفارقُ إلّا في جردٍ بعيد. والآن يُحسب من معامل الخطوة أو لا يُحسب.
      const baseQty = pickBaseQty(s, qty);
      out.push({
        seq: s.seq, lpn: p.lpn, sku: s.sku, batch: s.batch, expiry: s.expiry,
        uom: s.uom ?? '', factor: s.factor ?? null, qty, baseQty,
        // وسمُ «أعلن وحدةً وعجز عن تحويلها» — نفسُ عقد `isUncertainScan`.
        uncertain: baseQty === null,
      });
    }
  }
  return out;
}

/**
 * ما يُسحب من الطبلية الأمّ — بصيغة `removeQty` في طبقة المحتويات.
 * (تُطبَّق هناك لا هنا: موضعٌ واحدٌ يحكم المحتوى.)
 *
 * ⚠️ **حدٌّ معلَنٌ لا يُخفى:** `removeQty` تطابق البنودَ بمفتاح
 * (صنف × دفعة × صلاحية × **وحدة**). فما دامت السحبةُ تخرج من هنا بوحدةٍ
 * وتُقابَل بطبليةٍ أمٍّ خُزّنت بوحدةٍ أخرى، لن يلتقيا — والحلُّ تحويلٌ عند
 * المطابقة يقع في **طبقة المحتويات** لا هنا، فموضعُ حكم المحتوى واحد.
 */
export function takeFromPallet(pick) {
  return { sku: pick.sku, batch: pick.batch, expiry: pick.expiry, uom: pick.uom ?? '', qty: pick.qty };
}

/**
 * ★★★ طبليةُ الصرف من سحباتِ المهمّة (LPN-304) — **هويّةٌ جديدة بنسبها**.
 *
 * ولماذا هويّةٌ جديدة لا امتدادٌ لأمّ؟ لأنّ حمولةَ الصرف **تكوينٌ جديد**:
 * تُجمع من ثلاث طبالٍ أو أربع، فأيّ هويّةٍ من هويّاتها تكذب عن الباقي.
 * والنسب هو ما يحفظ الجواب حين يُسأل: «هذه الكرتونة التالفة عند العميل —
 * من أين جاءت؟» فتُقرأ `parentCodes` صعودًا حتى أوّل استلام.
 *
 * والبنود تُدمج بهويّة (صنف×دفعة×صلاحية×وحدة): سحبتان من طبليتين لدفعةٍ
 * واحدة بندٌ واحد بكمّيّتهما — لا صفّان يُقرآن دفعتين.
 *
 * @param {Array} picks سحباتٌ مقبولة من `pickVerdict`
 * @param {object} opts {code هويّة مولَّدة · warehouse · sourceDoc · actor}
 * @returns {{pallet:object}|{problem:string}}
 */
export function buildIssuePallet(picks, { code, warehouse = '', sourceDoc = null, route = '', branch = '', actor } = {}) {
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) {
    return { problem: `هويّة طبلية الصرف «${code ?? ''}» غير صالحة — تولد من العدّاد لا من اليد.` };
  }
  const list = (picks ?? []).filter((p) => Number(p?.qty) > 0);
  if (list.length === 0) return { problem: 'طبليةُ صرفٍ بلا سحبةٍ واحدة لا تُكوَّن.' };
  if (!String(actor ?? '').trim()) return { problem: 'تكوينُ طبلية الصرف بلا فاعلٍ لا يُسجَّل.' };

  const byKey = new Map();
  const parents = [];
  for (const p of list) {
    const key = [up(p.sku), up(p.batch), String(p.expiry ?? '').slice(0, 10), up(p.uom)].join('__');
    const line = byKey.get(key) ?? {
      sku: up(p.sku), batch: up(p.batch), expiry: String(p.expiry ?? '').slice(0, 10),
      uom: up(p.uom), factor: p.factor ?? null, qty: 0, baseQty: 0,
      // ★ مصادرُ البند نفسه: أيّ طبليةٍ أسهمت وبكم — فالنسب سطريٌّ لا رأسيٌّ
      // فقط، ويُجاب «هذه الكرتونة من أيّ حمولة» لا «من إحدى هذه الأربع».
      from: [],
    };
    line.qty += Number(p.qty) || 0;
    /*
     * ⚠️ **`??` وحدها لا تكفي هنا**: `baseQty === null` تعني «لا أعرف»، ولو
     * سقطت إلى `qty` لَكُتب مجموعٌ مخترَعٌ يبدو محسوبًا. والمجهولُ **يُعدي
     * البندَ كلَّه**: بندٌ نصفُه معلومٌ ونصفُه مجهول مجموعُه مجهول.
     *
     * ★ ولا وسمَ جديدًا يُخترع: `null` هو الوسم نفسُه، و`containmentProblems`
     * و`totalBaseQty` يقرآنه اليوم فيُخرجانه في `uncheckable` ويستثنيانه من
     * المجاميع. أمّا الغياب (`undefined`) فيبقى ساقطًا إلى `qty` كما كان —
     * فمستدعٍ قديمٌ لا يمرّر `baseQty` يحصل على سلوكه حرفًا.
     */
    if (p.baseQty === null) line.baseQty = null;
    else if (line.baseQty !== null) line.baseQty += Number(p.baseQty ?? p.qty) || 0;
    // ومعاملان مختلفان لبندٍ واحد لا يصفهما معاملٌ واحد — فيُمحى ولا يُكذب.
    if (line.factor !== null && (p.factor ?? null) !== line.factor) line.factor = null;
    const src = normalizeLpnCode(p.lpn);
    if (src) {
      if (!parents.includes(src)) parents.push(src);
      const at = line.from.find((f) => f.lpn === src);
      if (at) at.qty += Number(p.qty) || 0;
      else line.from.push({ lpn: src, qty: Number(p.qty) || 0 });
    }
    byKey.set(key, line);
  }

  return {
    pallet: {
      code: lpn,
      state: 'PICKING',
      flags: [],
      warehouse: up(warehouse),
      bin: '',
      lines: [...byKey.values()],
      parentCodes: parents,
      sourceDoc,
      /*
       * ★★★ الوجهةُ تُحمل من المهمّة إلى الحمولة (2026-08-27 · LPN-309).
       *
       * `stagingAssignVerdict` يمنع «طبليةَ فرعٍ في مسار فرعٍ آخر» بمقارنة
       * `unit.route || unit.branch` بمنطقة التجهيز. وكان الحقلان **لا
       * يُكتبان على طبلية الصرف أبدًا** — `route` يعيش على مهمّة التحضير
       * وينتهي عندها. فالمقارنة تقرأ `undefined` والشرط `wanted && given`
       * يسقط، **فالحارسُ لا يُطلق ولو مرّة**. وهو أخطر حارسٍ في هذه الخطوة:
       * عطبُه لا يُكتشف إلّا حين يشتكي فرعٌ من نقصٍ وآخر من زيادة.
       */
      route: up(route),
      branch: up(branch),
      createdBy: String(actor).trim(),
    },
  };
}
