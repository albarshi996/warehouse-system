/**
 * وجهُ التجهيز وحدّاه — متى يُزوَّد وبكم. منطقٌ خالصٌ بلا Firebase وبلا ساعة.
 *
 * ‹WMS-301› · الفجوة و-٤: لا `minQty` ولا `maxQty` في سيّد المواقع، ولا مهمّةَ
 * تزويدٍ تُولَّد. فخانةُ السحب تفرغ، **فيقف المجهّزُ أمام رفٍّ خالٍ** وفي
 * المستودع مئةُ كرتونٍ من الصنف نفسِه على طبليّةٍ في الممرّ الخلفيّ. والعطبُ
 * ليس في المخزون بل في أنّ **لا أحدَ يعلم** — لا تنبيهَ ولا طابورَ ولا تقرير.
 *
 * ═══ أربعُ قواعدَ تحكم هذا الملفّ ═══
 *
 * ① **لا حدَّ مخترَعًا.** خانةٌ لم تُعلَن وجهَ تجهيزٍ بحدٍّ معلَن **لا تُنتج
 *    مهمّةً أبدًا**. ومن صفّر الغائبَ جعل كلَّ خانةٍ في المستودع وجهًا حدُّه
 *    صفرٌ — فطابورُ تزويدٍ بألف مهمّةٍ في أوّل يوم، يُهمَل كلُّه.
 *
 * ② **النقصُ إلى الحدّ الأعلى لا إلى الأدنى.** تزويدٌ يلمس العتبةَ يعود غدًا:
 *    العاملُ يمشي عشرين مترًا ليضع كرتونةً، فيفرغ الرفُّ بعد ساعةٍ ويُستدعى
 *    ثانيةً. والتزويدُ **يملأ**.
 *
 * ③ **المحجوزُ يُخصَم قبل الحكم.** خانةٌ فيها مئةٌ كلُّها محجوزةٌ لأمرٍ
 *    يُشحَن اليوم **خانةٌ فارغةٌ عملًا**. ومن قرأ `qty` وحدَه رأى امتلاءً
 *    وهميًّا ولم يُزوِّد، فوقف المجهّزُ أمام رصيدٍ لا يملكه.
 *
 * ④ **«أعرف أنّها فارغة» ≠ «لا أعرف».** خانةٌ لا صفَّ رصيدٍ لها في قائمةٍ
 *    مُمرَّرةٍ كاملةً فارغةٌ يقينًا. وقائمةٌ لم تُمرَّر أصلًا جهلٌ — فلا
 *    تُولَّد لها مهمّة.
 */

import { normalizeLocationCode, shortLabelOf } from './locationCode.js';
import { balanceLocationCode } from './locationsModel.js';
import { availableQty } from '../ledger/reservations.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const up = (v) => String(v ?? '').trim().toUpperCase();
const round = (n) => Math.round(n * 1000) / 1000;

/** مستوياتُ حالة الوجه — ولكلٍّ نبرةٌ ونصّ. والأحمرُ للفارغ وحده (حوكمةُ الواجهة). */
export const FACE_LEVELS = Object.freeze({
  empty: { id: 'empty', labelAr: 'فارغ', tone: 'warn', rank: 3, hint: 'المجهّزُ يقف أمامه الآن — تزويدٌ فوريّ.' },
  low: { id: 'low', labelAr: 'تحت الحدّ', tone: 'attention', rank: 2, hint: 'بلغ عتبتَه — يُزوَّد قبل أن يفرغ.' },
  ok: { id: 'ok', labelAr: 'كافٍ', tone: 'ok', rank: 1, hint: 'فوق الحدّ الأدنى — لا تزويد.' },
  unknown: { id: 'unknown', labelAr: 'غيرُ معلوم', tone: 'muted', rank: 0, hint: 'لا حدَّ معلَنٌ أو لا رصيدَ مُمرَّر — فلا حكم.' },
});

/** أهذا الموقعُ وجهَ تجهيزٍ معلَنًا؟ — إعلانٌ صريحٌ لا اشتقاقٌ من الاسم. */
export function isPickFace(location) {
  return location?.pickFace === true;
}

/**
 * مواصفةُ التزويد — أو `null` حين لا تكفي للحكم (القاعدة ①).
 *
 * ولا يكفي الإعلانُ وحده: وجهٌ بلا حدٍّ أعلى لا يُعرف **إلى كم** يُزوَّد،
 * فلا مواصفةَ له. وحدٌّ أدنى غائبٌ يسقط إلى صفرٍ **فقط إن أُعلن الأعلى** —
 * أي «زوِّده حين يفرغ».
 *
 * @returns {{sku:string, min:number, max:number}|null}
 */
export function replenishSpec(location) {
  if (!isPickFace(location)) return null;
  const max = num(location?.replenishMax);
  if (max === null || max <= 0) return null;
  const minRaw = num(location?.replenishMin);
  const min = minRaw === null ? 0 : minRaw;
  if (min > max) return null; // مقلوبٌ — و`locationProblems` يردّه عند الحفظ
  return { sku: up(location?.pickSku), min, max };
}

/**
 * رصيدُ وجهٍ واحدٍ لصنفٍ واحد — الموجودُ والمتاحُ وعددُ الدفعات.
 *
 * ★ والصنفُ يُقرأ من المواصفة إن عُرِّف، وإلّا **من رصيد الخانة نفسِها**:
 * وجهٌ لم يُخصَّص لصنفٍ يحمل ما وُضع فيه، وهو حالُ أكثر المستودعات الحقيقيّة
 * قبل أن تُضبط التخصيصات.
 */
export function faceStock(location, balances, { sku } = {}) {
  const code = normalizeLocationCode(location?.code);
  const want = up(sku) || up(location?.pickSku);
  const rows = (balances || []).filter((b) => balanceLocationCode(b) === code);
  const mine = want ? rows.filter((b) => up(b.sku) === want || up(b.barcode) === want) : rows;

  const onHand = mine.reduce((s, b) => s + (num(b.qty) || 0), 0);
  const available = mine.reduce((s, b) => s + availableQty(b), 0);
  const skus = new Set(mine.map((b) => up(b.sku) || up(b.barcode)).filter(Boolean));
  return {
    code,
    sku: want || (skus.size === 1 ? [...skus][0] : ''),
    skus: [...skus],
    rows: mine.length,
    onHand: round(onHand),
    available: round(available),
    reserved: round(onHand - available),
  };
}

/**
 * حالةُ وجه التجهيز — وهي **حكمٌ لا رقم**.
 *
 * @param {object} location الموقع
 * @param {Array|null} balances الأرصدة — و`null` تعني «لم تُمرَّر» (القاعدة ④)
 * @param {{sku?:string}} [opts]
 * @returns {{level:string, label:string, tone:string, code:string, shortLabel:string,
 *            sku:string, min:number|null, max:number|null, onHand:number|null,
 *            available:number|null, reserved:number|null, shortfall:number, reason:string}}
 */
export function pickFaceState(location, balances, { sku } = {}) {
  const code = normalizeLocationCode(location?.code);
  const base = {
    code,
    shortLabel: code ? shortLabelOf(code) : '',
    sku: up(sku) || up(location?.pickSku),
    min: null,
    max: null,
    onHand: null,
    available: null,
    reserved: null,
    shortfall: 0,
    ...levelOf('unknown'),
  };

  if (!isPickFace(location)) return { ...base, reason: 'ليس وجهَ تجهيزٍ معلَنًا.' };
  const spec = replenishSpec(location);
  if (!spec) {
    const max = num(location?.replenishMax);
    return {
      ...base,
      reason:
        max === null || max <= 0
          ? 'وجهُ تجهيزٍ بلا حدٍّ أعلى — فإلى أيّ كمّيّةٍ يُزوَّد؟'
          : 'حدّا الوجه مقلوبان — الأدنى أكبرُ من الأعلى.',
    };
  }
  // ④ قائمةٌ لم تُمرَّر جهلٌ لا فراغ.
  if (!Array.isArray(balances)) {
    return { ...base, min: spec.min, max: spec.max, reason: 'لم تُمرَّر الأرصدة — ولا يُحكَم بالفراغ من جهل.' };
  }

  const stock = faceStock(location, balances, { sku: sku || spec.sku });
  const available = stock.available;
  const level = available <= 0 ? 'empty' : available <= spec.min ? 'low' : 'ok';
  // ② النقصُ إلى الأعلى لا إلى الأدنى.
  const shortfall = level === 'ok' ? 0 : round(spec.max - available);

  return {
    ...base,
    ...levelOf(level),
    sku: stock.sku,
    skus: stock.skus,
    min: spec.min,
    max: spec.max,
    onHand: stock.onHand,
    available,
    reserved: stock.reserved,
    shortfall: Math.max(0, shortfall),
    reason: reasonOf(level, stock, spec),
  };
}

function levelOf(id) {
  const meta = FACE_LEVELS[id] || FACE_LEVELS.unknown;
  return { level: meta.id, label: meta.labelAr, tone: meta.tone, rank: meta.rank, hint: meta.hint };
}

function reasonOf(level, stock, spec) {
  // ③ المحجوزُ يُسمّى صريحًا — وإلّا قرأ المديرُ «فارغ» ورأى في الجرد مئة.
  const held = stock.reserved > 0 ? ` (فيه ${stock.onHand} ومنها ${stock.reserved} محجوزةٌ لأوامرَ قائمة)` : '';
  if (level === 'empty') return `لا متاحَ في الوجه${held} — المجهّزُ يقف أمامه.`;
  if (level === 'low') return `المتاح ${stock.available} ≤ الحدّ الأدنى ${spec.min}${held} — يُزوَّد إلى ${spec.max}.`;
  return `المتاح ${stock.available} فوق الحدّ الأدنى ${spec.min}${held}.`;
}

/**
 * كلُّ الأوجه المحتاجةِ تزويدًا — مرتَّبةً **بالعجز لا بالعمر**.
 *
 * ★★ والفارغُ يسبق الناقصَ حتمًا: مجهّزٌ واقفٌ الآن أهمُّ من خانةٍ ستفرغ
 * بعد ساعة. ثمّ الأكبرُ عجزًا، ثمّ الكودُ أبجديًّا كي يكون الترتيبُ حتميًّا
 * فلا يتبدّل بين فتحةٍ وأخرى بلا سبب.
 *
 * @param {Array} locations سيّد المواقع
 * @param {Array} balances  الأرصدة
 * @param {{warehouse?:string}} [opts]
 */
export function facesNeedingReplenish(locations, balances, { warehouse } = {}) {
  const wh = up(warehouse);
  const states = (locations || [])
    .filter((l) => isPickFace(l) && l?.status !== 'archived')
    .filter((l) => !wh || up(l?.warehouse) === wh)
    .map((l) => pickFaceState(l, balances));

  const needing = states.filter((s) => s.level === 'empty' || s.level === 'low');
  needing.sort(
    (a, b) =>
      FACE_LEVELS[b.level].rank - FACE_LEVELS[a.level].rank ||
      b.shortfall - a.shortfall ||
      (a.code < b.code ? -1 : 1)
  );
  return {
    faces: needing,
    all: states,
    counts: {
      total: states.length,
      empty: states.filter((s) => s.level === 'empty').length,
      low: states.filter((s) => s.level === 'low').length,
      ok: states.filter((s) => s.level === 'ok').length,
      unknown: states.filter((s) => s.level === 'unknown').length,
    },
  };
}

/** سطرٌ يُقرأ على لوحةٍ — ولا يُقال «فارغ» بلا ذكر المحجوز. */
export function faceSummary(state) {
  if (!state?.code) return '';
  const where = state.shortLabel || state.code;
  if (state.level === 'unknown') return `${where}: ${state.reason}`;
  return `${where} — ${state.label}: ${state.reason}${state.shortfall ? ` النقص ${state.shortfall}.` : ''}`;
}
