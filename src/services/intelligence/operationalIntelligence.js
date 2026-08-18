/**
 * الذكاء التشغيليّ (م‑٩) — خمسة اقتراحات، كلٌّ برقمه ومرجعه.
 *
 * ═══ المبدأ الحاكم هنا ═══
 * **الرقم بلا مرجعٍ لا يُعرض** (المبدأ السابع)، و**الاقتراح بلا سببٍ لا يُتَّبع**.
 * فكلّ اقتراحٍ هنا يحمل: ما اقترحه، ولماذا، وممّ حُسب. ونظامٌ يقول «اطلب ٤٠٠
 * قطعة» بلا أن يقول «لأنّك تبيع ١٣ يوميًّا ويصلك المورّد في ٢١ يومًا» يُتجاهَل
 * في الأسبوع الثاني.
 *
 * ═══ وما لا يُخمَّن ═══
 * صنفٌ بلا تاريخ بيعٍ كافٍ **لا يُقترح له شيء**: اقتراحٌ من عيّنةٍ صغيرة أسوأ
 * من صمت، لأنّه يُلبَس ثوب الحساب. والحدّ الأدنى معلَنٌ في كلّ دالّة.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */
import { haversineMeters } from '../field/geo.js';
import { policyFor } from './stockPolicy.js';

const num = (v) => Number(v) || 0;
const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const round = (n, d = 2) => Math.round(num(n) * 10 ** d) / 10 ** d;
const day = (v) => str(v).slice(0, 10);

const daysBetween = (a, b) => {
  const x = Date.parse(`${day(a)}T00:00:00Z`);
  const y = Date.parse(`${day(b)}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((x - y) / 86400000) : null;
};

/* ═══════════════ ١ و٢. التزويد التلقائيّ والطلب المقترح ═══════════════ */

/** أقلّ عددِ أيّامٍ لتاريخٍ يُبنى عليه اقتراح. أقلّ منه صمتٌ لا تخمين. */
export const MIN_HISTORY_DAYS = 14;

/**
 * معدّل الاستهلاك اليوميّ لصنف — من حركات الخروج في الدفتر.
 * @returns {{rate:number, days:number, total:number, enough:boolean}}
 */
export function consumptionRate(moves = [], sku, today) {
  const code = up(sku);
  const out = (moves || []).filter(
    (m) => up(m.sku) === code && m.to === null && day(m.postedAtDay || m.date)
  );
  if (!out.length) return { rate: 0, days: 0, total: 0, enough: false };

  const dates = out.map((m) => day(m.postedAtDay || m.date)).sort();
  const span = daysBetween(today || dates[dates.length - 1], dates[0]) || 0;
  const days = Math.max(1, span);
  const total = out.reduce((s, m) => s + num(m.qty), 0);
  return { rate: round(total / days, 3), days, total, enough: days >= MIN_HISTORY_DAYS };
}

/**
 * **التزويد التلقائيّ:** متى يُطلب هذا الصنف وكم؟
 *
 * `نقطة إعادة الطلب = (المعدّل اليوميّ × مهلة التوريد) + مخزون الأمان`
 * وهي معادلةٌ معروفة — والقيمة هنا أنّها تُحسب من **دفترنا** لا من تقدير.
 *
 * @returns {{sku, onHand, rate, leadDays, reorderPoint, suggestQty, daysLeft, urgency, why}|null}
 */
export function replenishmentFor({ item, moves = [], onHand = 0, today, leadDays = 14, safetyDays = 7, policy = null, inTransit = 0 }) {
  const sku = up(item?.sku);
  if (!sku) return null;

  const c = consumptionRate(moves, sku, today);
  if (!c.enough) return null; // صمتٌ لا تخمين

  const rate = c.rate;
  if (rate <= 0) return null;

  // ‹FNB-202› السياسة السارية (صنف×فرع بالوراثة الثلاثيّة) تتقدّم على
  // الوسيطَين العامَّين — وغيابها يُبقي سلوك اليوم حرفيًّا.
  const lead = num(policy?.leadDays) > 0 ? num(policy.leadDays) : num(leadDays);
  const safe = policy?.safetyDays != null ? num(policy.safetyDays) : num(safetyDays);
  const coverDays = num(policy?.coverDays);
  const parLevel = num(policy?.parLevel);
  const minQty = num(policy?.minQty);

  const safety = round(rate * safe);
  // الحدّ الأدنى المصرَّح يرفع نقطة إعادة الطلب ولا يخفضها: من كتب «لا تنزل
  // عن ٤٠» يريد أرضيّةً لا سقفًا محسوبًا أقلّ منها.
  const reorderPoint = Math.max(round(rate * lead + safety), minQty);
  const daysLeft = round(num(onHand) / rate, 1);

  // ‹FNB-301› «الكمّيّات بالطريق» تُطرح: ما هو قادمٌ لا يُطلب ثانيةً.
  const available = num(onHand) + num(inTransit);

  // أيّام التغطية بندٌ مستقلّ: اطلب ما يكفي (المهلة + التغطية) لا المهلة وحدها.
  const targetQty = round(reorderPoint + rate * (coverDays > 0 ? coverDays : lead));
  // وPar Level سقفٌ يُحترم — لا يُطلب فوق ما يسع الفرع.
  const ceiling = parLevel > 0 ? parLevel : targetQty;
  const suggestRaw = available < reorderPoint ? round(Math.min(targetQty, ceiling) - available) : 0;
  const suggestQty = suggestRaw > 0 ? suggestRaw : 0;

  const parts = [
    `تبيع ${rate} يوميًّا (${c.total} خلال ${c.days} يومًا)`,
    `والتوريد ${lead} يومًا${policy?.sources?.leadDays && policy.sources.leadDays !== 'default' ? ` (سياسة ${policy.sources.leadDays})` : ''}`,
    `والأمان ${safe} أيّام`,
  ];
  if (coverDays > 0) parts.push(`والتغطية المطلوبة ${coverDays} يومًا`);
  if (num(inTransit) > 0) parts.push(`وبالطريق ${round(inTransit)}`);
  if (parLevel > 0) parts.push(`وسقف الفرع ${parLevel}`);
  parts.push(`المتبقّي يكفي ${daysLeft} يومًا`);

  return {
    sku,
    nameAr: str(item?.nameAr),
    onHand: round(onHand),
    inTransit: round(inTransit),
    rate,
    leadDays: lead,
    reorderPoint,
    parLevel,
    suggestQty,
    daysLeft,
    urgency: daysLeft <= lead ? 'now' : daysLeft <= lead + safe ? 'soon' : 'ok',
    // المرجع: لماذا هذا الرقم بالضبط.
    why: `${parts.join('، ')}.`,
  };
}

/**
 * التزويد لكلّ الأصناف — المستعجل أوّلًا.
 *
 * ‹FNB-301› `branch` **يقصر الحساب على فرعٍ واحد**: رصيدُه هو، واستهلاكه هو،
 * وسياسته هو. وبلا `branch` يبقى السلوك القديم حرفيًّا (المنشأة كلّها) —
 * فلا ينكسر مستدعٍ قائم.
 */
export function replenishmentPlan({
  items = [], moves = [], balances = [], today, leadDays, safetyDays,
  branch = '', policies = null, dims = null, inTransitBySku = null,
}) {
  const branchCode = up(branch);
  // رصيد الفرع وحده حين طُلب فرع — ورصيد المنشأة كلّها حين لم يُطلب.
  const onHandBySku = new Map();
  for (const b of balances || []) {
    if (branchCode && up(b.warehouse) !== branchCode) continue;
    const k = up(b.sku);
    onHandBySku.set(k, num(onHandBySku.get(k)) + num(b.qty));
  }
  // واستهلاكه هو: حركات الخروج المختومة بهذا الفرع (ختم FNB-104) أو من مستودعه.
  const scopedMoves = branchCode
    ? (moves || []).filter((m) => up(m.orgBranch) === branchCode || up(m.from) === branchCode)
    : moves;

  return (items || [])
    .map((item) =>
      replenishmentFor({
        item,
        moves: scopedMoves,
        onHand: onHandBySku.get(up(item?.sku)) || 0,
        today,
        leadDays: num(item?.leadDays) || leadDays,
        safetyDays,
        // سياسة (صنف × فرع) بالوراثة الثلاثيّة — وغيابها يُبقي الوسيطَين.
        policy: policies ? policyFor(policies, item?.sku, dims || { branch: branchCode }) : null,
        // «الكمّيّات بالطريق» من `openDemand` — ما هو قادمٌ لا يُطلب ثانيةً.
        inTransit: num(inTransitBySku?.get?.(up(item?.sku))),
      })
    )
    .map((r) => (r && branchCode ? { ...r, branch: branchCode } : r))
    .filter((r) => r && r.suggestQty > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * **الطلب المقترح لعميل:** ما اعتاد شراءه ولم يشترِه هذه الزيارة.
 * يُبنى على تكراره هو لا على متوسّط السوق — فلكلّ متجرٍ سلّته.
 */
export function suggestedOrder({ documents = [], customerCode, minTimes = 3 }) {
  const code = up(customerCode);
  if (!code) return [];

  const mine = (documents || []).filter(
    (d) => ['VSI', 'INV', 'SO'].includes(d?.type) && up(d.header?.customerCode) === code && d.state === 'done'
  );
  if (mine.length < 2) return []; // زيارةٌ واحدة ليست عادة

  const stats = new Map();
  for (const d of mine) {
    const seen = new Set();
    for (const l of d.lines || []) {
      const sku = up(l?.sku);
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      const s = stats.get(sku) || { sku, times: 0, qty: 0, lastDate: '' };
      s.times += 1;
      s.qty += num(l.qty);
      const dd = day(d.header?.saleDate || d.header?.invoiceDate || d.header?.orderDate);
      if (dd > s.lastDate) s.lastDate = dd;
      stats.set(sku, s);
    }
  }

  return [...stats.values()]
    .filter((s) => s.times >= minTimes)
    .map((s) => ({
      sku: s.sku,
      avgQty: round(s.qty / s.times, 1),
      times: s.times,
      lastDate: s.lastDate,
      why: `اشتراه ${s.times} مرّاتٍ من أصل ${mine.length} زيارة، بمعدّل ${round(s.qty / s.times, 1)} في المرّة. آخر مرّة ${s.lastDate}.`,
    }))
    .sort((a, b) => b.times - a.times);
}

/* ═══════════════ ٣. تحسين خطّ السير ═══════════════ */

/**
 * ترتيبٌ أقصر لزياراتٍ من نقطة انطلاق — **الجار الأقرب**.
 *
 * ليست الحلّ الأمثل (وهو مسألةٌ صعبة حسابيًّا)، لكنّها تُقصّر المسافة فعليًّا
 * وتُحسب في أجزاء الثانية على هاتف. والأهمّ أنّها تُخرج **الفرق** فيُرى المكسب:
 * ترتيبٌ لا يُقصّر شيئًا لا يستحقّ أن يُقلب به يومُ مندوب.
 */
export function optimizeRoute(start, stops = []) {
  const valid = (stops || []).filter((s) => s?.coords?.lat != null && s?.coords?.lng != null);
  if (valid.length < 2) return { order: valid, originalM: 0, optimizedM: 0, savedM: 0, savedPct: 0 };

  const pathLength = (from, list) => {
    let total = 0;
    let cur = from;
    for (const s of list) {
      total += haversineMeters(cur, s.coords) || 0;
      cur = s.coords;
    }
    return Math.round(total);
  };

  const remaining = [...valid];
  const order = [];
  let cur = start;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineMeters(cur, s.coords);
      if (d !== null && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const [next] = remaining.splice(best, 1);
    order.push(next);
    cur = next.coords;
  }

  const originalM = pathLength(start, valid);
  const optimizedM = pathLength(start, order);
  const savedM = Math.max(0, originalM - optimizedM);
  return {
    order,
    originalM,
    optimizedM,
    savedM,
    savedPct: originalM > 0 ? Math.round((savedM / originalM) * 100) : 0,
    why: savedM > 0 ? `يوفّر ${(savedM / 1000).toFixed(1)} كم من أصل ${(originalM / 1000).toFixed(1)} كم.` : 'الترتيب الحاليّ قريبٌ من الأمثل.',
  };
}

/* ═══════════════ ٤. رفيق المندوب ═══════════════ */

/**
 * ما يحتاج المندوب أن يعرفه **قبل أن يدخل المتجر** — لا بعد أن يخرج.
 * ثلاثة أسطر: كم عليه · ماذا يشتري عادةً · ما الذي يستحقّ الانتباه.
 */
export function repCompanion({ customerCode, customerName, exposure = null, documents = [], visits = [], today }) {
  const code = up(customerCode);
  const suggestions = suggestedOrder({ documents, customerCode: code });
  const lastVisit = (visits || [])
    .filter((v) => up(v.customerCode) === code && v.state === 'checked_out')
    .map((v) => day(v.checkOutAtDay || v.date))
    .filter(Boolean)
    .sort()
    .pop();

  const alerts = [];
  if (exposure?.verdict === 'block') alerts.push(`تجاوز سقف الائتمان — البيع ممنوعٌ حتّى يفكّه المالي.`);
  else if (exposure?.verdict === 'warn') alerts.push(`اقترب من سقفه (${exposure.usedPct}٪) — المتاح ${exposure.available}.`);
  if (lastVisit && today) {
    const gap = daysBetween(today, lastVisit);
    if (gap !== null && gap > 30) alerts.push(`آخر زيارة قبل ${gap} يومًا — متجرٌ يكاد يُفقَد.`);
  }
  if (!suggestions.length && documents.length) alerts.push('لا نمط شراءٍ ثابت بعد — الاقتراح يحتاج ثلاث مرّات.');

  return {
    customerCode: code,
    customerName: str(customerName) || code,
    balance: exposure?.balance ?? null,
    available: exposure?.available ?? null,
    lastVisit: lastVisit || '',
    suggestions: suggestions.slice(0, 5),
    alerts,
  };
}

/* ═══════════════ ٥. اكتشاف المتاجر المكرّرة ═══════════════ */

/** أقصى مسافةٍ يُشتبه معها بأنّ متجرَين واحد. */
export const DUPLICATE_RADIUS_M = 60;

/**
 * متاجر مكرّرة: قريبةٌ جدًّا أو متطابقةُ الهاتف أو الاسم.
 *
 * **يُبلَّغ ولا يُدمَج**: الدمج قرارٌ بشريّ. ومتجران في مبنًى واحد قد يكونان
 * متجرَين حقًّا، ودمجٌ خاطئ يخلط ذمّتَين ولا يُفكّ بسهولة.
 */
export function findDuplicateStores(customers = [], { radiusM = DUPLICATE_RADIUS_M } = {}) {
  const rows = (customers || []).filter((c) => str(c?.code));
  const pairs = [];

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      const reasons = [];

      const phoneA = str(a.phone).replace(/\D/g, '');
      const phoneB = str(b.phone).replace(/\D/g, '');
      if (phoneA && phoneA === phoneB) reasons.push('نفس رقم الهاتف');

      if (str(a.nameAr) && str(a.nameAr) === str(b.nameAr)) reasons.push('نفس الاسم حرفيًّا');

      const d = haversineMeters(a.coords, b.coords);
      if (d !== null && d <= radiusM) reasons.push(`يبعدان ${Math.round(d)}م فقط`);

      if (reasons.length) {
        pairs.push({
          a: { code: up(a.code), nameAr: str(a.nameAr) },
          b: { code: up(b.code), nameAr: str(b.nameAr) },
          distanceM: d === null ? null : Math.round(d),
          reasons,
          confidence: reasons.length >= 2 ? 'high' : 'low',
          why: `${reasons.join(' · ')} — يُراجَع ولا يُدمَج آليًّا: دمجٌ خاطئ يخلط ذمّتَين.`,
        });
      }
    }
  }
  return pairs.sort((x, y) => (y.reasons.length - x.reasons.length) || (x.distanceM ?? 1e9) - (y.distanceM ?? 1e9));
}
