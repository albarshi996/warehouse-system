/**
 * أبعادُ الصنف — الوزنُ والحجم، ومنهما سعةُ الرفّ بالكيلوغرام والمتر المكعّب.
 * منطقٌ خالصٌ بلا Firebase وبلا DOM وبلا ساعة.
 *
 * ‹WMS-201› · الفجوة و-٢: `CAPACITY_MEASURES` في سيّد المواقع تُعلن خمسةَ
 * مقاييس منها `weightKg` و`volumeM3` — **ولا حقلَ وزنٍ ولا حجمٍ على بطاقة
 * الصنف.** فمقياسان معلَنان في الواجهة، يملأ المالكُ خانتَهما، **ولا يُحتسبان
 * أبدًا**. وهذا أسوأ من غيابهما: حدٌّ مكتوبٌ لا يُطبَّق يُورث ثقةً كاذبة —
 * «الرفُّ محميٌّ بسقف وزن» وهو مكشوف.
 *
 * ═══ ثلاث قواعدَ تحكم هذا الملفّ ═══
 *
 * ① **الغيابُ «لا علم» لا صفر.** صنفٌ بلا وزنٍ معرَّفٍ يُعاد له `null`.
 *    ولو حُسب صفرًا لَبدا رفٌّ يحمل ألفَ كرتونٍ **خاليًا تمامًا** من الوزن،
 *    فيُقبل عليه حملٌ يُسقط الرفّ.
 *
 * ② **المعرفةُ الجزئيّةُ حدٌّ أدنى لا حقيقة.** رفٌّ فيه ثلاثةُ أصنافٍ يُعرف
 *    وزنُ اثنين: المجموعُ **أقلُّ من الواقع حتمًا**. فالرفضُ عليه آمن (إن
 *    تجاوز المعروفُ السقفَ فقد تجاوزه الواقعُ يقينًا)، **والقبولُ عليه ليس
 *    آمنًا**. فتُعلَن `partial` ويُسمّى عددُ ما لا يُعرف — ولا يُقال «متبقٍّ
 *    كذا كيلو» ورقمٌ منها مجهول.
 *
 * ③ **الوزنُ بوحدة الأساس لا بوحدة البند.** `unitWeightKg` وزنُ **وحدةِ أساس
 *    الصنف**، والبندُ مكتوبٌ بالكرتون أو الطبليّة. فعشرةُ كراتينَ لصنفٍ وزنُ
 *    قطعته كيلو ومعاملُ كرتونه اثنا عشر = مئةٌ وعشرون كيلو — لا عشرة. ومن
 *    ضرب في الكمّيّة المكتوبة أنتج رقمًا أصغرَ من الحقيقة باثني عشر ضعفًا.
 */

import { toBase, baseUomOf, uomLabel } from './uomModel.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const up = (v) => String(v ?? '').trim().toUpperCase();

/** تقريبٌ لثلاث منازل — يمنع ذيولَ الفاصلة العائمة في مجاميع طويلة. */
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * وزنُ وحدةِ الأساس بالكيلوغرام — أو `null` حين لا يُعرف (القاعدة ①).
 * والصفرُ والسالبُ يُقرآن «لا علم» أيضًا: وزنٌ صفرٌ لصنفٍ ماديٍّ خطأُ إدخالٍ
 * لا حقيقة.
 */
export function unitWeightKg(item) {
  const w = num(item?.unitWeightKg);
  return w !== null && w > 0 ? w : null;
}

/** حجمُ وحدةِ الأساس بالمتر المكعّب — أو `null`. */
export function unitVolumeM3(item) {
  const v = num(item?.unitVolumeM3);
  return v !== null && v > 0 ? v : null;
}

/** أيحمل هذا الصنفُ بُعدًا معرَّفًا واحدًا على الأقلّ؟ */
export function hasDimensions(item) {
  return unitWeightKg(item) !== null || unitVolumeM3(item) !== null;
}

/**
 * وزنُ بندٍ بالكيلوغرام — بالقاعدة ③: تُحوَّل الكمّيّةُ إلى وحدة الأساس ثمّ
 * تُضرب في وزن الوحدة.
 *
 * @param {{qty?:number, uom?:string}} line
 * @param {object} item بطاقة الصنف
 * @returns {{ok:boolean, kg:number|null, problem:string}}
 *   `kg === null` تعني «لا علم» ومعها `ok:false` **بسببٍ مكتوب** — والمستدعي
 *   يُمرّرها (القاعدة ⑥ في خطّة المتتبّع) لا يُسقِط البند.
 */
export function lineWeightKg(line, item) {
  const unit = unitWeightKg(item);
  if (unit === null) return { ok: false, kg: null, problem: 'لا وزنَ معرَّفٌ لهذا الصنف.' };
  return scaleByBase(line, item, unit, 'كجم');
}

/** حجمُ بندٍ بالمتر المكعّب — بنفس القاعدة حرفًا. */
export function lineVolumeM3(line, item) {
  const unit = unitVolumeM3(item);
  if (unit === null) return { ok: false, m3: null, problem: 'لا حجمَ معرَّفٌ لهذا الصنف.' };
  const r = scaleByBase(line, item, unit, 'م٣');
  return { ok: r.ok, m3: r.kg, problem: r.problem };
}

function scaleByBase(line, item, unitValue, unitLabel) {
  const qty = num(line?.qty);
  if (qty === null) return { ok: false, kg: null, problem: 'كمّيّةٌ غيرُ رقميّة.' };
  if (qty === 0) return { ok: true, kg: 0, problem: '' };

  const written = String(line?.uom ?? '').trim();
  // بندٌ بلا وحدةٍ مكتوبةٍ يُقرأ بوحدة الأساس — وهو ما يفعله النظام اليوم
  // في كلّ حساب، فلا يُخترع هنا سلوكٌ مخالف.
  if (!written) return { ok: true, kg: round(qty * unitValue), problem: '' };

  const converted = toBase(item, qty, written);
  if (!converted.ok) {
    return {
      ok: false,
      kg: null,
      problem: `لا يُحتسب ${unitLabel}: ${converted.problem}`,
    };
  }
  return { ok: true, kg: round(converted.qty * unitValue), problem: '' };
}

/**
 * فهرسُ الحِمل لكلّ موقع — «الموقعُ ← وزنُه وحجمُه».
 *
 * ★★★ ولماذا فهرسٌ يُمرَّر لا وحدةٌ تُستورَد؟ **نفسُ قرار `palletsByBin`
 * حرفًا** (انظر `locationsModel.palletsAt`): الاتّجاه المشروع واحد — الطبقةُ
 * الجديدة تقرأ القائم، والقائمُ لا يعرفها. ولو استورد سيّدُ المواقع — وهو من
 * أقدم ما في الشجرة — وحدةَ أبعادٍ أحدثَ منه، لصار عطبٌ في الأحدث يُسقط
 * الأقدم. والفهرسُ يُبنى مرّةً ويُمرَّر لكلّ المواقع فهو أرخصُ أيضًا.
 *
 * @param {Array} balances الأرصدة الحيّة
 * @param {Map|object} itemsBySku فهرسُ الأصناف — `Map` أو كائنٌ عاديّ
 * @param {Function} [locationOf] قارئُ كود الموقع من الرصيد. غيابُه يقرأ
 *        `bin` ثمّ `location` — نفسُ أولويّة `balanceLocationCode` حرفًا،
 *        ويُمرَّر صريحًا لمن أراد توحيدَ القراءة من موضعٍ واحد.
 * @returns {Map<string, {weightKg:number, volumeM3:number, lines:number, knownWeight:number, knownVolume:number, partial:boolean}>}
 */
export function loadIndexOf(balances, itemsBySku, locationOf) {
  const get = (sku) => {
    if (!itemsBySku) return null;
    if (typeof itemsBySku.get === 'function') return itemsBySku.get(sku) || itemsBySku.get(up(sku)) || null;
    return itemsBySku[sku] || itemsBySku[up(sku)] || null;
  };
  const codeOf =
    typeof locationOf === 'function'
      ? locationOf
      : (b) => up(b?.bin || b?.location || '');

  const index = new Map();
  for (const b of balances || []) {
    const code = up(codeOf(b));
    if (!code) continue;
    const qty = num(b?.qty);
    if (qty === null || qty <= 0) continue;

    const item = get(b?.sku) || get(b?.barcode);
    const cell =
      index.get(code) ||
      { weightKg: 0, volumeM3: 0, lines: 0, knownWeight: 0, knownVolume: 0, partial: false };
    cell.lines += 1;

    // ★ الرصيدُ مكتوبٌ بوحدة الأساس دائمًا (عقدُ `balanceKey`)، فلا تُقرأ له
    // وحدةٌ ولا يُحوَّل — وقراءةُ `b.uom` هنا تُضاعف التحويلَ مرّتين.
    const w = unitWeightKg(item);
    if (w !== null) {
      cell.weightKg = round(cell.weightKg + qty * w);
      cell.knownWeight += 1;
    }
    const v = unitVolumeM3(item);
    if (v !== null) {
      cell.volumeM3 = round(cell.volumeM3 + qty * v);
      cell.knownVolume += 1;
    }
    index.set(code, cell);
  }
  // ② المعرفةُ الجزئيّةُ تُعلَن — بعد أن يُعرف مجموعُ البنود.
  for (const cell of index.values()) {
    cell.partial = cell.knownWeight < cell.lines || cell.knownVolume < cell.lines;
  }
  return index;
}

/**
 * حِملُ موقعٍ من الفهرس — و`null` تعني **لم يُمرَّر الفهرس** لا «صفرَ حمل»،
 * فلا يُحسب فراغٌ من جهل (نفسُ عقد `palletsAt`).
 */
export function loadAt(index, code) {
  if (!index || typeof index.get !== 'function') return null;
  const here = index.get(up(code));
  if (!here) return { weightKg: 0, volumeM3: 0, lines: 0, knownWeight: 0, knownVolume: 0, partial: false };
  return here;
}

/**
 * أيتجاوز هذا البندُ سقفَ وزن الموقع أو حجمَه؟
 *
 * ولا يُحكَم إلّا بثلاثةٍ مجتمعة: **سقفٌ معلَن** و**حِملٌ معلوم** و**وزنٌ
 * محسوبٌ للبند**. وغيابُ أيٍّ منها يُمرّر — حارسٌ يمنع ما يجب أن يمرّ أسوأ
 * من الفجوة التي يسدّها.
 *
 * @returns {{ok:boolean, reason:string, measure:''|'weightKg'|'volumeM3',
 *            used:number|null, capacity:number|null, incoming:number|null, partial:boolean}}
 */
export function capacityProblem(location, { line, item, load } = {}) {
  const pass = { ok: true, reason: '', measure: '', used: null, capacity: null, incoming: null, partial: false };
  if (!location || !load) return pass;

  const checks = [
    {
      measure: 'weightKg',
      capacity: num(location?.capacity?.weightKg),
      used: num(load.weightKg),
      incoming: lineWeightKg(line, item).kg,
      label: 'الوزن',
      unit: 'كجم',
      known: load.knownWeight,
    },
    {
      measure: 'volumeM3',
      capacity: num(location?.capacity?.volumeM3),
      used: num(load.volumeM3),
      incoming: lineVolumeM3(line, item).m3,
      label: 'الحجم',
      unit: 'م٣',
      known: load.knownVolume,
    },
  ];

  for (const c of checks) {
    if (!c.capacity || c.capacity <= 0) continue; // لا سقفَ معلَن
    if (c.incoming === null) continue; // لا وزنَ للبند — لا حكم
    if (c.used === null) continue; // لا حِملَ معلوم
    if (round(c.used + c.incoming) <= c.capacity) continue;

    const partial = Number.isFinite(load.lines) && c.known < load.lines;
    const note = partial
      ? ` (محسوبٌ على ${c.known} من ${load.lines} بندًا — والواقعُ أثقل)`
      : '';
    return {
      ok: false,
      measure: c.measure,
      reason: `${c.label}: الموقع يحمل ${c.used} ${c.unit}${note} وسقفُه ${c.capacity}، والبندُ يزيد ${c.incoming} ${c.unit}.`,
      used: c.used,
      capacity: c.capacity,
      incoming: c.incoming,
      partial,
    };
  }
  return pass;
}

/**
 * سطرُ عرضٍ للحِمل — ومعه **تحفّظُ المعرفة الجزئيّة صريحًا** (القاعدة ②).
 * فلا يُقرأ رقمٌ ناقصٌ وكأنّه الحقيقة.
 */
export function loadSummary(location, load) {
  if (!load) return '';
  const parts = [];
  const capW = num(location?.capacity?.weightKg);
  const capV = num(location?.capacity?.volumeM3);
  if (load.weightKg > 0 || capW) parts.push(`${load.weightKg} كجم${capW ? ` من ${capW}` : ''}`);
  if (load.volumeM3 > 0 || capV) parts.push(`${load.volumeM3} م٣${capV ? ` من ${capV}` : ''}`);
  if (!parts.length) return '';
  const note = load.partial ? ` — محسوبٌ على ما يُعرف وزنُه فقط (${load.knownWeight} من ${load.lines} بندًا)` : '';
  return `${parts.join(' · ')}${note}`;
}

/**
 * سطرُ عرضٍ لأبعاد الصنف على بطاقته — بوحدة الأساس صريحةً.
 * ولماذا تُسمّى الوحدةُ؟ لأنّ «الوزن ١» بلا وحدةٍ لا يُقرأ: كيلو للقطعة أم
 * للكرتون؟ والفرقُ اثنا عشر ضعفًا (القاعدة ③).
 */
export function dimensionsSummary(item) {
  const w = unitWeightKg(item);
  const v = unitVolumeM3(item);
  if (w === null && v === null) return '';
  const base = uomLabel(baseUomOf(item)) || 'الوحدة';
  const parts = [];
  if (w !== null) parts.push(`${w} كجم`);
  if (v !== null) parts.push(`${v} م٣`);
  return `${parts.join(' · ')} لكلّ ${base}`;
}
