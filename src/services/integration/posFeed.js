/**
 * تغذية نقطة البيع ‹FNB-704› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ المصدر المعتمَد: **ملفٌّ يوميّ** (قرار المالك ق-O06 · 2026-08-18) ═══
 * يمرّ بمسار الاستيراد القائم (`excel/`) بمجموعة `posSales` — لا مسارَ
 * رفعٍ ثانٍ. وأربعة أعمدةٍ لا أكثر: اليوم والفرع وصنف البيع والكمّيّة،
 * لأنّ ملفًّا بعشرين عمودًا لا يُملأ يوميًّا وملفًّا بأربعةٍ يُملأ.
 * والمصدران الآخران (أودو · Foodics) يبقيان **معلَنَين غير مفعَّلَين**:
 * قد يُختار أحدهما لاحقًا بلا هدم شيء — فالمُطبِّع والمقاييس مصدر-محايدة.
 *
 * ═══ وثلاثةٌ لا تتوقّف على المصدر أصلًا ═══
 *   · **الاتّجاه**: تُسحب ولا تُدفع — البوابة قارئةُ مبيعاتٍ لا مصدرُها.
 *   · **POS Accuracy** يُقاس بعد الوصول أيًّا كان الطريق.
 *   · **انقطاع المصدر** يُكشف بغياب البيانات لا بنوع الموصِّل.
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
  file: { id: 'file', labelAr: 'ملفّ يوميّ يُرفع', ready: true, note: 'المصدر المعتمَد (ق-O06 · 2026-08-18)' },
  odoo: { id: 'odoo', labelAr: 'عبر أودو بعد استيعابه', ready: false, note: 'معلَنٌ غير مفعَّل — بديلٌ لاحق' },
  foodics: { id: 'foodics', labelAr: 'Foodics مباشرةً', ready: false, note: 'معلَنٌ غير مفعَّل — بديلٌ لاحق' },
});

/** المصدر المعتمَد بقرار المالك — ومجموعة استيراده في مسار `excel/` القائم. */
export const DECIDED_SOURCE = 'file';
export const POS_DATASET = 'posSales';

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

/* ═══════════════ دفعة اليوم الواحد ‹FNB-704› ═══════════════ */

/**
 * ★★ **رفعُ اليوم نفسه مرّتين استبدالٌ لا إضافة.**
 *
 * أخطر ما في الملفّ اليوميّ: يُرفع ملفٌّ ناقص صباحًا ثمّ يُعاد كاملًا مساءً.
 * فلو أُضيف الثاني إلى الأوّل تضاعفت المبيعات، وصار الاستهلاك النظريّ ضعف
 * الحقيقة، **واتُّهم كلّ فرعٍ بأنّه يُخفي**. فالدفعة تُعرَّف بـ(الفرع × اليوم)
 * ورفعُها ثانيةً **يحلّ محلّ** الأولى — وهو ما يفعله الناس فعلًا لا ما نتمنّاه.
 *
 * @param {object[]} rows صفوفٌ مطبَّعة من `normalizeSales`
 * @returns {{batches:object[], problems:string[]}}
 *   كلّ دفعة: `{branch, date, id, rows, qty}` — و`id` حتميٌّ فالإعادة تستبدل.
 */
export function groupIntoBatches(rows = []) {
  const map = new Map();
  const problems = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const branch = up(r?.branch);
    const date = day(r?.date);
    if (!branch) {
      problems.push(`صفٌّ بلا فرعٍ في ${date || 'تاريخٍ مجهول'} — البيع يُنسب لفرعٍ لا للقطاع عامّةً.`);
      continue;
    }
    const id = `${branch}__${date}`;
    const at = map.get(id) || { id, branch, date, rows: [], qty: 0 };
    at.rows.push(r);
    at.qty = Math.round((at.qty + num(r?.qty)) * 1000) / 1000;
    map.set(id, at);
  }
  return { batches: [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.branch.localeCompare(b.branch)), problems };
}

/**
 * حكم رفع دفعةٍ ‹FNB-704› — يُعرض **قبل** الحفظ لا بعده.
 *
 * @param {object} batch دفعةٌ من `groupIntoBatches`
 * @param {{existing?:object, today?:string, branches?:Set|string[]}} [ctx]
 * @returns {{ok, mode:'new'|'replace', warnings:string[], problems:string[]}}
 */
export function batchVerdict(batch, ctx = {}) {
  const problems = [];
  const warnings = [];
  const branch = up(batch?.branch);
  const date = day(batch?.date);

  if (!branch || !date) problems.push('دفعةٌ بلا فرعٍ أو تاريخ.');

  // فرعٌ خارج الشجرة: يُمنع — فمبيعاتٌ لفرعٍ لا نعرفه لا تُنسب إلى أحد.
  const known = ctx.branches instanceof Set ? ctx.branches : new Set([...(ctx.branches || [])].map(up));
  if (known.size && branch && !known.has(branch)) {
    problems.push(`«${branch}» ليس فرعًا في الشجرة — تحقّق من رمزه، فمبيعاتٌ لفرعٍ مجهول لا تُنسب إلى أحد.`);
  }

  // تاريخٌ في المستقبل: خطأ إدخالٍ شائع في الملفّات اليدويّة.
  if (ctx.today && date > day(ctx.today)) {
    problems.push(`تاريخ الدفعة ${date} بعد اليوم — مبيعاتٌ لم تقع بعد.`);
  }

  const existing = ctx.existing;
  const mode = existing ? 'replace' : 'new';
  if (existing) {
    warnings.push(
      `رُفعت مبيعات ${date} لـ«${branch}» من قبل (${num(existing.qty)} وحدة) — ` +
        `هذا الرفع **يحلّ محلّها** بـ${num(batch?.qty)} وحدة، ولا يُضاف إليها.`
    );
  }

  return { ok: problems.length === 0, mode, warnings, problems };
}

/**
 * أيّام الفرع التي وصلت لها دفعات — مدخل `measurableWindow` أعلاه.
 * فتُعرف المدّة الصالحة للقياس من الدفعات نفسها لا من ظنّ.
 */
export function feedDaysOf(batches = [], branch) {
  const b = up(branch);
  return [...new Set(
    (Array.isArray(batches) ? batches : [])
      .filter((x) => !b || up(x?.branch) === b)
      .map((x) => day(x?.date))
      .filter(Boolean)
  )].sort();
}
