/**
 * التنبّؤ وإعادة التوازن ‹FNB-804› — منطق خالص.
 *
 * ═══ ما هو مبنيٌّ أصلًا ═══
 * تنبّؤ النفاد قائم (`daysLeft`/`urgency` في محرّك التزويد)، وتنبّؤ
 * الصلاحيّة قائم (`expiryStatus` في مفتاح الرصيد). فالناقص **إعادة
 * التوازن** بين الفروع — وهي ما تُبنى هنا.
 *
 * ═══ ولماذا النقل بين الفروع قبل الشراء ═══
 * فائضٌ قريب الصلاحيّة في فرعٍ ونقصٌ في آخر: شراءُ جديدٍ يُهدر الأوّل
 * ويكلّف مرّتين. والنقل يحلّ الاثنين بحركةٍ واحدة.
 *
 * ═══ وثلاثة قيودٍ لا تُخرق ═══
 * ① **لا يُفرَّغ فرعٌ تحت حدّه** — علاجُ نقصٍ بخلق نقصٍ ليس علاجًا.
 * ② **FEFO يُحترم** — يُنقل الأقرب صلاحيّةً أوّلًا لا الأبعد.
 * ③ **ولا يُنقل ما لا يكفي مدّة الطريق** — صنفٌ ينتهي قبل أن يصل هدرٌ
 *    مُتعمَّد.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;
const day = (v) => str(v).slice(0, 10);

/** أدنى أيّامِ صلاحيّةٍ متبقّية تُجيز النقل — دونها هدرٌ مُتعمَّد. */
export const MIN_SHELF_DAYS_TO_MOVE = 3;

const daysUntil = (expiry, today) => {
  const e = Date.parse(`${day(expiry)}T00:00:00Z`);
  const t = Date.parse(`${day(today)}T00:00:00Z`);
  return Number.isFinite(e) && Number.isFinite(t) ? Math.round((e - t) / 86400000) : null;
};

/**
 * يقترح نقلًا بين الفروع ‹FNB-804›.
 *
 * @param {object[]} positions مواضعُ الصنف في الفروع
 *   `{branch, sku, onHand, minQty, parLevel, rate, expiry}`
 * @param {{today?:string, transitDays?:number}} [opts]
 * @returns {object[]} `{sku, from, to, qty, why, expiry}`
 */
export function rebalanceSuggestions(positions = [], opts = {}) {
  const today = day(opts.today);
  const transitDays = num(opts.transitDays) > 0 ? num(opts.transitDays) : 1;
  const bySku = new Map();

  for (const p of Array.isArray(positions) ? positions : []) {
    const sku = normalizeItemCode(p?.sku);
    if (!sku || !up(p?.branch)) continue;
    bySku.set(sku, [...(bySku.get(sku) || []), { ...p, sku, branch: up(p.branch) }]);
  }

  const out = [];
  for (const [sku, rows] of bySku) {
    // الناقص: تحت الحدّ الأدنى — وحاجتُه ما يُبلّغه سقفه أو حدَّه.
    const needy = rows
      .filter((r) => num(r.minQty) > 0 && num(r.onHand) < num(r.minQty))
      .map((r) => ({ ...r, need: round3((num(r.parLevel) || num(r.minQty)) - num(r.onHand)) }))
      .filter((r) => r.need > 0)
      .sort((a, b) => b.need - a.need);
    if (!needy.length) continue;

    // الفائض: فوق سقفه — **ولا يُفرَّغ تحت حدّه** (القيد ①).
    const donors = rows
      .filter((r) => {
        const ceiling = num(r.parLevel) || num(r.minQty);
        return ceiling > 0 && num(r.onHand) > ceiling;
      })
      .map((r) => {
        const floor = num(r.minQty) || 0;
        return { ...r, spare: round3(num(r.onHand) - Math.max(floor, num(r.parLevel) || 0)) };
      })
      .filter((r) => r.spare > 0)
      // ★ القيد ②: الأقرب صلاحيّةً يُنقل أوّلًا (FEFO).
      .sort((a, b) => {
        const ea = daysUntil(a.expiry, today);
        const eb = daysUntil(b.expiry, today);
        if (ea === null && eb === null) return b.spare - a.spare;
        if (ea === null) return 1;
        if (eb === null) return -1;
        return ea - eb;
      });

    for (const donor of donors) {
      let spare = donor.spare;
      if (spare <= 0) continue;

      // ★ القيد ③: ما لا يكفي مدّة الطريق لا يُنقل.
      const left = daysUntil(donor.expiry, today);
      if (left !== null && left < transitDays + MIN_SHELF_DAYS_TO_MOVE) continue;

      for (const target of needy) {
        if (spare <= 0 || target.need <= 0 || target.branch === donor.branch) continue;
        const qty = round3(Math.min(spare, target.need));
        if (qty <= 0) continue;
        out.push({
          sku,
          from: donor.branch,
          to: target.branch,
          qty,
          expiry: str(donor.expiry),
          why:
            `«${donor.branch}» فوق سقفه بـ${donor.spare}` +
            (left !== null ? ` وصلاحيّته ${left} يومًا` : '') +
            `، و«${target.branch}» تحت حدّه بـ${round3(num(target.minQty) - num(target.onHand))}.`,
        });
        spare = round3(spare - qty);
        target.need = round3(target.need - qty);
      }
    }
  }
  return out;
}

/**
 * ★ حارس القيود ‹FNB-804› — يُشغَّل على المقترحات قبل توليد مستندات النقل.
 * ومقترحٌ يخرق قيدًا **يُرفض بسببه** لا يُنفَّذ بصمت.
 */
export function rebalanceVerdict(suggestion, positions = [], opts = {}) {
  const problems = [];
  const from = (Array.isArray(positions) ? positions : []).find(
    (p) => up(p?.branch) === up(suggestion?.from) && normalizeItemCode(p?.sku) === normalizeItemCode(suggestion?.sku)
  );
  if (!from) return { ok: false, problems: ['المصدر غير معروفٍ في المواضع.'] };

  const after = round3(num(from.onHand) - num(suggestion?.qty));
  if (num(from.minQty) > 0 && after < num(from.minQty)) {
    problems.push(`النقل يُنزل «${up(suggestion.from)}» إلى ${after} تحت حدّه ${num(from.minQty)} — علاجُ نقصٍ بخلق نقصٍ ليس علاجًا.`);
  }

  const left = daysUntil(from.expiry, day(opts.today));
  const transitDays = num(opts.transitDays) > 0 ? num(opts.transitDays) : 1;
  if (left !== null && left < transitDays + MIN_SHELF_DAYS_TO_MOVE) {
    problems.push(`الصلاحيّة ${left} يومًا لا تكفي طريقًا ${transitDays} — نقلٌ ينتهي قبل أن يصل هدرٌ مُتعمَّد.`);
  }
  return { ok: problems.length === 0, problems };
}

/** يحوّل مقترحًا إلى طلب نقلٍ بالسلسلة القائمة — لا مسارَ ثانٍ. */
export function toRebalanceTransfer(suggestion, { requestDate = '' } = {}) {
  return {
    type: 'TR',
    header: {
      requestDate: str(requestDate),
      fromWarehouse: up(suggestion?.from),
      toWarehouse: up(suggestion?.to),
      costCenter: up(suggestion?.to),
      purpose: 'إعادة توازن',
    },
    lines: [{
      sku: normalizeItemCode(suggestion?.sku),
      qty: num(suggestion?.qty),
      expiry: str(suggestion?.expiry),
      notes: str(suggestion?.why),
    }],
  };
}

/**
 * توقّع المبيعات الذي **يُدخله القطاع** مقابل المحسوب من الدفتر ‹FNB-804›.
 * فالتوقّع مدخلٌ يملكه F&B (سطر 58) لا حسابٌ نبتكره — يُقبل ويُقارَن،
 * وفارقُه يُعلَن كي يتعلّم الطرفان.
 */
export function forecastVsComputed({ forecastQty, computedRate, days = 7 } = {}) {
  const forecast = num(forecastQty);
  const computed = round3(num(computedRate) * num(days));
  if (forecast <= 0) {
    return { forecast: 0, computed, variancePct: null, why: 'لا توقّع من القطاع — يُعمَل بالمحسوب من الدفتر.' };
  }
  if (computed <= 0) {
    return { forecast, computed: 0, variancePct: null, why: 'لا تاريخ استهلاكٍ كافٍ — يُعمَل بتوقّع القطاع.' };
  }
  const variancePct = Math.round(((forecast - computed) / computed) * 1000) / 10;
  return {
    forecast,
    computed,
    variancePct,
    why: `توقّع القطاع ${forecast} والمحسوب من الدفتر ${computed} خلال ${days} أيّام (${variancePct >= 0 ? '+' : '−'}٪${Math.abs(variancePct)}).`,
  };
}
