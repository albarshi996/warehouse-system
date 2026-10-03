/**
 * سرعةُ دوران الصنف — تصنيفُ A/B/C والراكد، من **دفتر الحركات** لا من تخمين.
 * منطقٌ خالصٌ بلا Firebase وبلا DOM وبلا ساعة.
 *
 * ‹WMS-202› · الفجوة و-٣: قاعدةُ «قرب الموقع من منطقة التجهيز» في محرّك
 * التسكين كانت تعمل بـ`WEIGHTS.distance` وحده — **بُعدٌ مجرَّدٌ لا يعرف
 * السريعَ من الراكد.** فصنفٌ يُسحب عشر مرّاتٍ في اليوم وصنفٌ لم يُطلب منذ
 * سنةٍ يتنافسان على الرفّ القريب بالتساوي، والراكدُ يسبق إن صادف رفًّا فارغًا
 * (`WEIGHTS.emptyLocation`). فيُحتلّ أغلى موضعٍ في المستودع بميّت.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★★★ والقرارُ الحاكمُ هنا: **الدورانُ طلبٌ لا حركة**
 * ═══════════════════════════════════════════════════════════════════════
 *
 * الدفترُ يحمل عشرينَ سببَ حركة، وأكثرُها **مناقلةٌ داخليّة**: `putaway`
 * تخزينٌ، و`transfer-out` نقلٌ بين المخازن، و`van-load` تحميلُ مندوب. ولو
 * عُدَّت حركةً لصار **كلُّ صنفٍ وصل أمس «سريعَ الدوران»** — لأنّه استُلم
 * وخُزِّن فتحرّك مرّتين. ثمّ يُمنح أقربَ رفٍّ إلى التجهيز وهو لم يُطلب قطّ.
 *
 * فالمعدودُ **أسبابُ الطلب وحدها** (`DEMAND_REASONS`)، وهي مُعلَنةٌ قابلةٌ
 * للتبديل من المستدعي — لا مدفونةٌ في شرط.
 *
 * ═══ وأربعُ قواعدَ أُخَر ═══
 *
 * ① **لا ساعةَ تُقرأ.** `nowMs` يُمرَّر، وبلا تمريره لا نافذةَ ولا حكم.
 *
 * ② **«راكد» حكمٌ لا سكوت.** صنفٌ لم يُطلب في النافذة يُصنَّف `DEAD` صريحًا
 *    لا `C` مموَّهًا — فـ`C` «بطيءٌ يُطلب» و`DEAD` «لا يُطلب»، والفرقُ بينهما
 *    هو الفرقُ بين رفٍّ بعيدٍ وقرارِ تصفية.
 *
 * ③ **وفرقُ «راكد» عن «لا أعرف» مقيسٌ لا مفترض.** دفترٌ خالٍ من الطلب في
 *    النافذة كلِّها (مستودعٌ جديد · ترحيلٌ لم يكتمل) **لا يجعل الأصناف كلَّها
 *    راكدة** — يجعلها مجهولةً. فالحكمُ بالركود لا يصحّ إلّا إن كان في النافذة
 *    طلبٌ على غيره.
 *
 * ④ **العتباتُ مُمرَّرةٌ لا مدفونة.** ثمانون في المئة للتراكم A بالعُرف،
 *    وخمسةٌ وتسعون لـB — والمالكُ يبدّلهما بلا كوميت.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * أسبابُ **الطلب** — ما يعني أنّ الصنف خرج لأنّ أحدًا أراده.
 * وما سواها مناقلةٌ داخليّةٌ لا تُحتسب دورانًا (انظر رأس الملفّ).
 */
export const DEMAND_REASONS = Object.freeze([
  'pick', //            سحبٌ لأمر صرف
  'delivery', //        تسليمٌ للعميل
  'van-sale', //        بيعُ مندوب
  'van-return-out', //  خروجٌ من عهدة المندوب إلى العميل
  'material-issue', //  صرفُ موادّ للإنتاج
  'consign-sold', //    أمانةٌ بِيعت
]);

/** العتباتُ العرفيّة — Pareto. والمالكُ يبدّلها وسيطًا. */
export const DEFAULT_THRESHOLDS = Object.freeze({ a: 0.8, b: 0.95 });

/** النافذةُ الافتراضيّة بالأيّام — ربعُ سنةٍ يغطّي موسميّةً قصيرة. */
export const DEFAULT_WINDOW_DAYS = 90;

const DAY = 86400000;

/** تسمياتُ المراتب — تُعرض كما هي ولا تُشتقّ في الشاشات. */
export const RANK_LABELS = Object.freeze({
  A: { labelAr: 'سريعُ الدوران (A)', hint: 'يُطلب كثيرًا — يستحقّ أقربَ رفٍّ إلى التجهيز.' },
  B: { labelAr: 'متوسّطُ الدوران (B)', hint: 'طلبٌ منتظم — الرفوفُ الوسطى.' },
  C: { labelAr: 'بطيءُ الدوران (C)', hint: 'يُطلب قليلًا — الرفوفُ البعيدة تكفيه.' },
  DEAD: { labelAr: 'راكد', hint: 'لم يُطلب في النافذة كلِّها — أبعدُ رفٍّ، ويستحقّ قرارَ تصفية.' },
  '': { labelAr: 'غيرُ مصنَّف', hint: 'لا بياناتِ طلبٍ تكفي للحكم — ولا يُحكَم بجهل.' },
});

/**
 * ختمُ وقتِ الحركة — يُقرأ من عدّة أشكال لأنّ الدفترَ كُتب على سنين.
 *
 * ★★★ و`createdAt` **لا يُقرأ هنا**: ختمُ الإنشاء ليس ختمَ القيد. مستندٌ
 * أُنشئ في يناير وقُيِّد في مارس حركتُه حركةُ مارس — ومن قرأ الإنشاءَ نسب
 * الطلبَ إلى شهرٍ لم يُطلب فيه، فانقلبت الموسميّةُ كلُّها.
 */
export function moveTimeOf(move) {
  const raw = move?.postedAt ?? move?.at ?? move?.movedAt ?? null;
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw.getTime() : null;
  // ختمُ Firestore — `toMillis` أو `{seconds}`.
  if (typeof raw.toMillis === 'function') {
    const ms = raw.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (Number.isFinite(Number(raw?.seconds))) return Number(raw.seconds) * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * يحتسب تصنيفَ الدوران من حركات الدفتر.
 *
 * @param {Array} moves حركاتُ الدفتر (ملحقةٌ-فقط — تُقرأ ولا تُمسّ)
 * @param {object} opts
 * @param {number} opts.nowMs **إلزاميّ** — بلا وقتٍ لا نافذةَ ولا حكم (القاعدة ①)
 * @param {number} [opts.windowDays]
 * @param {string[]} [opts.reasons] أسبابُ الطلب المعدودة
 * @param {{a:number,b:number}} [opts.thresholds]
 * @param {string} [opts.warehouse] حصرُ الحساب بمستودع — دورانُ طرابلس ليس دورانَ الرحبة
 * @param {Function} [opts.timeOf] قارئُ ختم الوقت
 * @returns {{
 *   ranks: Map<string, {rank:string, qty:number, moves:number, share:number, cumShare:number, lastAt:number|null}>,
 *   total:number, countedMoves:number, undated:number, skippedReasons:number,
 *   window:{fromMs:number, toMs:number, days:number}, problem:string, caveat:string,
 *   order:Array
 * }}
 */
export function velocityOf(moves, opts = {}) {
  const {
    nowMs,
    windowDays = DEFAULT_WINDOW_DAYS,
    reasons = DEMAND_REASONS,
    thresholds = DEFAULT_THRESHOLDS,
    warehouse = '',
    timeOf = moveTimeOf,
  } = opts;

  const empty = {
    ranks: new Map(),
    total: 0,
    countedMoves: 0,
    undated: 0,
    skippedReasons: 0,
    window: { fromMs: 0, toMs: 0, days: windowDays },
    problem: '',
    caveat: '',
    order: [],
  };

  if (!Number.isFinite(nowMs)) {
    return { ...empty, problem: 'لم يُمرَّر الوقت — ولا تُقرأ الساعةُ في منطقٍ خالص، فلا نافذةَ ولا حكم.' };
  }
  const days = Math.max(1, num(windowDays));
  const toMs = nowMs;
  const fromMs = nowMs - days * DAY;
  empty.window = { fromMs, toMs, days };

  const wanted = new Set(reasons.map((r) => String(r).trim().toLowerCase()));
  const wh = up(warehouse);

  const byItem = new Map();
  let total = 0;
  let countedMoves = 0;
  let undated = 0;
  let skippedReasons = 0;

  for (const m of moves || []) {
    const reason = String(m?.reason ?? '').trim().toLowerCase();
    if (!wanted.has(reason)) {
      skippedReasons += 1;
      continue;
    }
    // المستودعُ يُقرأ من طرف **الخروج**: الطلبُ استُهلك من هناك.
    if (wh && up(m?.from) !== wh && up(m?.warehouse) !== wh) continue;

    const at = timeOf(m);
    if (at === null) {
      // ★ بلا ختمٍ لا تُحتسب — واحتسابُها يُحمّل النافذةَ حركاتٍ ربّما
      // خارجها، فيُقال «سريع» لصنفٍ ركد منذ سنة. ويُعلَن العددُ تحفّظًا.
      undated += 1;
      continue;
    }
    if (at < fromMs || at > toMs) continue;

    const key = up(m?.sku) || up(m?.barcode);
    if (!key) continue;
    const qty = Math.abs(num(m?.qty));
    if (qty <= 0) continue;

    const cell = byItem.get(key) || { qty: 0, moves: 0, lastAt: null };
    cell.qty += qty;
    cell.moves += 1;
    cell.lastAt = cell.lastAt === null ? at : Math.max(cell.lastAt, at);
    byItem.set(key, cell);
    total += qty;
    countedMoves += 1;
  }

  const caveat = undated
    ? `${undated} حركةَ طلبٍ بلا ختمِ قيدٍ لم تُحتسب — التصنيفُ على ما له تاريخ.`
    : '';

  if (!total) {
    return {
      ...empty,
      undated,
      skippedReasons,
      caveat,
      // ③ لا أعرف ≠ راكد — ولا يُحكَم على الأصناف كلِّها بالركود.
      problem: `لا حركةَ طلبٍ في آخر ${days} يومًا — فلا تصنيفَ دوران (ولا يُحكَم بالركود على أحد).`,
    };
  }

  // ترتيبٌ تنازليٌّ ثمّ تراكمُ باريتو.
  const order = [...byItem.entries()]
    .map(([sku, c]) => ({ sku, ...c, share: c.qty / total }))
    .sort((x, y) => y.qty - x.qty || (x.sku < y.sku ? -1 : 1));

  const aCut = Math.min(1, Math.max(0, num(thresholds?.a) || DEFAULT_THRESHOLDS.a));
  const bCut = Math.min(1, Math.max(aCut, num(thresholds?.b) || DEFAULT_THRESHOLDS.b));

  const ranks = new Map();
  let cum = 0;
  for (const row of order) {
    // ★ الحدُّ يُقاس **قبل** الإضافة لا بعدها: الصنفُ الأوّلُ وحدَه قد يبلغ
    // تسعين في المئة، فقياسُه بعد الإضافة يُخرجه من A — وهو أسرعُ ما عندنا.
    const rank = cum < aCut ? 'A' : cum < bCut ? 'B' : 'C';
    cum += row.share;
    row.cumShare = Math.round(cum * 10000) / 10000;
    row.rank = rank;
    ranks.set(row.sku, {
      rank,
      qty: Math.round(row.qty * 1000) / 1000,
      moves: row.moves,
      share: Math.round(row.share * 10000) / 10000,
      cumShare: row.cumShare,
      lastAt: row.lastAt,
    });
  }

  return {
    ranks,
    total: Math.round(total * 1000) / 1000,
    countedMoves,
    undated,
    skippedReasons,
    window: { fromMs, toMs, days },
    problem: '',
    caveat,
    order,
  };
}

/**
 * مرتبةُ صنفٍ من نتيجة الحساب.
 *
 * `''` تعني **لا أعرف** و`DEAD` تعني **لا يُطلب** — والفرقُ قُرِّر في القاعدة ③:
 * لا يُحكَم بالركود إلّا إن كان في النافذة طلبٌ على غيره.
 */
export function rankOf(result, sku, barcode) {
  if (!result?.ranks || typeof result.ranks.get !== 'function') return '';
  const hit = result.ranks.get(up(sku)) || result.ranks.get(up(barcode));
  if (hit) return hit.rank;
  if (!result.total) return '';
  return 'DEAD';
}

/** تسميةُ المرتبة وإرشادُها — للعرض. */
export function rankLabel(rank) {
  return RANK_LABELS[rank] || RANK_LABELS[''];
}

/**
 * معامِلُ وزن البُعد بحسب المرتبة — **وهو كلُّ أثر هذا الملفّ في التسكين**.
 *
 * `WEIGHTS.distance` سالبٌ (عقوبةٌ على البُعد)، فضربُه في:
 *   · `A` ثلاثةً ⟹ عقوبةٌ مثلَّثة ⟹ **يُلاحق القريب**.
 *   · `B` واحدًا ونصفًا ⟹ ميلٌ معتدل.
 *   · `C` واحدًا ⟹ سلوكُ اليوم.
 *   · `DEAD` سالبَ واحدٍ ⟹ **يُقلب إلى مكافأة** ⟹ يُدفع إلى أبعد رفّ.
 *
 * ★★★ والمجهولُ واحدٌ **حتمًا**: فبلا تصنيفٍ يبقى حكمُ التسكين كما كان حرفًا
 * بحرف — ولا تنقلب أولويّةُ رفٍّ على مستودعٍ لم تُحسب أرقامُه بعد.
 */
export function velocityFactorOf(rank) {
  if (rank === 'A') return 3;
  if (rank === 'B') return 1.5;
  if (rank === 'DEAD') return -1;
  return 1; // C والمجهول سواءٌ — وهو سلوكُ اليوم
}

/**
 * لقطةٌ للعرض على لوحةٍ — كم صنفًا في كلّ مرتبة، ونصيبُها من الطلب.
 */
export function velocitySnapshot(result) {
  const counts = { A: 0, B: 0, C: 0 };
  const shares = { A: 0, B: 0, C: 0 };
  for (const v of result?.ranks?.values?.() || []) {
    counts[v.rank] += 1;
    shares[v.rank] += v.share;
  }
  return {
    counts,
    shares: {
      A: Math.round(shares.A * 1000) / 10,
      B: Math.round(shares.B * 1000) / 10,
      C: Math.round(shares.C * 1000) / 10,
    },
    items: result?.ranks?.size || 0,
    total: result?.total || 0,
    days: result?.window?.days || 0,
    caveat: result?.caveat || '',
    problem: result?.problem || '',
  };
}
