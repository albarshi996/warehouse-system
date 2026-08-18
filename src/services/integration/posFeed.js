/**
 * تغذية نقطة البيع ‹FNB-704› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما هو محجوبٌ وما ليس ═══
 * قرار **مصدر** البيانات (Foodics مباشرةً · أودو · ملفّ يوميّ) لم يُحسم
 * بعد (ق-O06). لكنّ ثلاثةً من معايير المهمّة الأربعة **لا تتوقّف عليه**:
 *   · **الاتّجاه** محسومٌ بنصّ الخطة: تُسحب ولا تُدفع — البوابة لا تكتب في
 *     نقطة البيع، فهي ليست مصدر مبيعاتٍ بل قارئتها.
 *   · **POS Accuracy** يُقاس بعد الوصول، أيًّا كان الطريق.
 *   · **انقطاع المصدر** يُكشف بغياب البيانات لا بنوع الموصِّل.
 * فتُبنى الثلاثة الآن، ويبقى **الموصِّل بعينه** وحده معلَّقًا — لا يُبنى
 * موصِّلٌ لمصدرٍ قد لا يُختار، ولا تتعطّل الطبقة بانتظار قرار.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const day = (v) => str(v).slice(0, 10);

/**
 * المصادر الممكنة لبيانات نقطة البيع — **معلَنةٌ بلا اختيار**.
 * `ready` تقول أيّها له موصِّل اليوم: الملفّ اليوميّ وحده، لأنّه الطريق
 * المتاح دائمًا مهما كان القرار — ولا ينتظر ربطًا تقنيًّا.
 */
export const POS_SOURCES = Object.freeze({
  file: { id: 'file', labelAr: 'ملفّ يوميّ يُرفع', ready: true, note: 'متاحٌ دائمًا — لا ينتظر ربطًا تقنيًّا' },
  odoo: { id: 'odoo', labelAr: 'عبر أودو بعد استيعابه', ready: false, note: 'ينتظر ق-O06' },
  foodics: { id: 'foodics', labelAr: 'Foodics مباشرةً', ready: false, note: 'ينتظر ق-O06' },
});

/**
 * ★ سياسة التغذية — **الاتّجاه محسومٌ لا ينتظر ق-O06**.
 * «المبيعات تُسحب ولا تُدفع»: البوابة قارئةُ مبيعاتٍ لا مصدرُها، ودفعُها
 * إلى نقطة البيع يجعل لرقمِ البيع مصدرَين.
 */
export const POS_POLICY = Object.freeze({
  scope: 'pos_sales',
  labelAr: 'مبيعات نقطة البيع',
  direction: 'pull',
  quantities: true,
  references: true,
  money: 'pull',
  timing: 'manual',
  onConflict: 'adopt',
  why: 'البوابة تقرأ المبيعات ولا تكتبها — ودفعُها يجعل لرقم البيع مصدرَين.',
});

/** أيّ مصدرٍ جاهزٌ اليوم؟ — للعرض ولمنع الوعد بما لم يُربط. */
export function readySources() {
  return Object.values(POS_SOURCES).filter((s) => s.ready).map((s) => s.id);
}

/**
 * حكم اختيار مصدرٍ ‹FNB-704›: المصدر غير الجاهز **يُعلَن ولا يُفعَّل**.
 * فتفعيلُ موصِّلٍ لم يُبنَ يُنتج صمتًا يُظنّ بياناتٍ فارغة.
 */
export function sourceVerdict(sourceId) {
  const src = POS_SOURCES[str(sourceId)];
  if (!src) return { ok: false, problem: `مصدرٌ غير معروف «${sourceId}» — المعروف: ${Object.keys(POS_SOURCES).join(' · ')}.` };
  if (!src.ready) return { ok: false, problem: `«${src.labelAr}» لم يُربط بعد (${src.note}) — يُعلَن ولا يُفعَّل.` };
  return { ok: true, problem: '' };
}

/* ═══════════════ POS Accuracy ═══════════════ */

/**
 * ★ دقّة نقطة البيع ‹FNB-704› — «POS Accuracy» في نصّ الخطة (سطر 323).
 *
 * المقياس: **نسبة المبيعات المطابقة لأصناف بيعٍ معرَّفة**. وما لا يطابق
 * لا يُهمَل: يُسمّى صنفًا صنفًا كي يُصحَّح الماستر — فدقّةٌ ٪٩٠ بلا معرفة
 * الـ١٠٪ رقمٌ لا يُعالَج.
 *
 * @param {object[]} sales صفوف مبيعاتٍ مطبَّعة `{sku, qty}`
 * @param {Map|Set} knownItems أصناف البيع المعرَّفة
 * @returns {{accuracy, matched, total, unknown, why}}
 */
export function posAccuracy(sales = [], knownItems = new Set()) {
  const known = knownItems instanceof Map ? new Set(knownItems.keys()) : new Set(knownItems);
  const unknown = new Map();
  let matched = 0;
  let total = 0;

  for (const s of Array.isArray(sales) ? sales : []) {
    const sku = normalizeItemCode(s?.sku);
    const qty = num(s?.qty);
    if (!sku || qty <= 0) continue;
    total += qty;
    if (known.has(sku)) matched += qty;
    else unknown.set(sku, num(unknown.get(sku)) + qty);
  }

  const accuracy = total > 0 ? Math.round((matched / total) * 1000) / 10 : null;
  return {
    accuracy,
    matched,
    total,
    // ما لا يطابق يُسمّى — الأكثر أثرًا أوّلًا.
    unknown: [...unknown.entries()].map(([sku, qty]) => ({ sku, qty })).sort((a, b) => b.qty - a.qty),
    why:
      total > 0
        ? `${matched} من ${total} وحدةً تطابق أصناف بيعٍ معرَّفة (٪${accuracy})` +
          (unknown.size ? ` — و${unknown.size} صنفًا غير معرَّف يحتاج ضبط الماستر.` : '.')
        : 'لا مبيعاتٍ في المدّة — لا تُحسب دقّةٌ على فراغ.',
  };
}

/* ═══════════════ انقطاع المصدر ═══════════════ */

/** بعد كم يومٍ بلا بياناتٍ يُعدّ المصدر منقطعًا. */
export const FEED_GRACE_DAYS = 2;

/**
 * ★★ انقطاع المصدر ‹FNB-704›: **يُعلَن ولا يُسكِت الاستهلاك النظريّ بصمت.**
 *
 * وهذا أخطر ما في الطبقة: مصدرٌ توقّف بلا إعلان يجعل الاستهلاك النظريّ
 * صفرًا، فيبدو كلّ فرعٍ **مهدِرًا** بينما العطب في التغذية لا في المطبخ.
 *
 * @param {{branch, lastFeedDay}} feed آخر يومٍ وصلت فيه بيانات
 * @param {{today, graceDays}} [opts]
 * @returns {object|null} مدخل استثناءٍ جاهز، أو `null` إن كانت التغذية حيّة
 */
export function feedOutageException(feed, { today, graceDays = FEED_GRACE_DAYS } = {}) {
  const last = Date.parse(`${day(feed?.lastFeedDay)}T00:00:00Z`);
  const now = Date.parse(`${day(today)}T00:00:00Z`);
  if (!Number.isFinite(now)) return null;

  // لم تصل بياناتٌ قطّ: انقطاعٌ من نوعٍ آخر — يُعلَن كذلك.
  if (!Number.isFinite(last)) {
    return {
      type: 'approval_stale',
      location: up(feed?.branch),
      reason: 'لم تصل بيانات نقطة بيعٍ قطّ لهذا الفرع — الاستهلاك النظريّ لا يُحسب، ولا يعني ذلك أنّه صفر.',
    };
  }

  const elapsed = Math.round((now - last) / 86400000);
  if (elapsed <= num(graceDays)) return null;
  return {
    type: 'approval_stale',
    location: up(feed?.branch),
    reason:
      `انقطعت تغذية نقطة البيع منذ ${elapsed} يومًا (آخرها ${day(feed.lastFeedDay)}) — ` +
      'الاستهلاك النظريّ لهذه المدّة **غير محسوب** لا صفر، فلا يُقاس عليه انحراف.',
  };
}

/**
 * ★ هل تصلح هذه المدّة لقياس الانحراف؟ ‹FNB-704›
 * مدّةٌ فيها انقطاعٌ **لا يُقاس عليها** — ومن قاس عليها اتّهم فرعًا بريئًا.
 */
export function measurableWindow({ branch, from, to, feedDays = [] } = {}) {
  const days = new Set((Array.isArray(feedDays) ? feedDays : []).map(day));
  const start = Date.parse(`${day(from)}T00:00:00Z`);
  const end = Date.parse(`${day(to)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { ok: false, missing: [], problem: 'مدّةٌ غير مقروءة.' };
  }

  const missing = [];
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!days.has(d)) missing.push(d);
  }
  if (!missing.length) return { ok: true, missing: [], problem: '' };
  return {
    ok: false,
    missing,
    problem:
      `${missing.length} يومًا بلا تغذيةٍ في «${up(branch)}» (${missing.slice(0, 3).join(' · ')}` +
      `${missing.length > 3 ? ' …' : ''}) — لا يُقاس انحرافُ استهلاكٍ على مدّةٍ ناقصة.`,
  };
}
