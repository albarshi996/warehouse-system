/**
 * «العهد النقديّة» — منطقٌ خالصٌ مستقلٌّ (بلا Firestore).
 *
 * ═══ ما هذا، وما ليس هو ═══
 * سجلٌّ نقديٌّ **قائمٌ بذاته** لحمَلة العهد (موقع ١٥٥ ومخزن الرحبة): نقدٌ
 * يُسلَّم لحامل عهدة (استلام) ثمّ يُصرَف منه بفواتيرَ مبوّبة (مصروف)، والرصيدُ
 * الباقي لكلّ حامل. العملةُ **الدينار الليبيّ** — تُحسب كلُّها بوحدته الصغرى
 * الصحيحة (`accounting/money.js`) فلا يتسرّب خطأُ العائم إلى ميزانٍ نقديّ.
 *
 * ★★★ **وليس هو دفترَ القيد المزدوج** (`deriveEntries`/`accounts`/`partnerLedger`)
 *     ولا يمسّه: ذاك قيدُ المصاريف المحاسبيّ، وهذا سجلُّ عُهدةٍ نقديٍّ مستقلّ
 *     بمجموعة Firestore خاصّة (`cash_custody`). ولا علاقةَ له بـ`/dashboard/custody`
 *     (العهدُ **العينيّة** — أجهزةٌ ومعدّات) — تلك منظومةٌ أخرى تمامًا.
 *
 * ═══ نموذج القيد (الوثيقةُ في `cash_custody`) ═══
 *   kind:       'receipt' (استلام عهدة) | 'expense' (مصروف)
 *   custodian:  اسمُ حامل العهدة (نصّ)
 *   amount:     المبلغُ بالوحدة الصغرى الصحيحة (درهم = ١/١٠٠٠ دينار)
 *   category:   فئةُ المصروف (للمصروف فقط) — من `CUSTODY_CATEGORIES`
 *   invoiceNo:  رقمُ الفاتورة (للمصروف)
 *   date:       تاريخٌ ISO «yyyy-mm-dd»
 *   site:       الموقع (١٥٥ · الرحبة …)
 *   note:       ملاحظة
 *
 * ★ **القيودُ ملحق-فقط:** لا تعديلَ ولا حذف — الخطأُ يُصحَّح بقيدٍ مضادّ. ولا
 *   حدَّ على الصرف هنا: السجلُّ **يسمح بالرصيد السالب وينبّه فقط** (التدخّلُ
 *   قرارٌ إداريٌّ لا منعٌ آليّ).
 */

import { activeWarehouses, warehouseSector } from '../locations/warehouseModel.js';
import { normalizeShopCode } from '../shops/shopsService.js';

/** فئاتُ المصروف النقديّ (طلب المالك: إعاشة · نظافة · مناولة · أخرى). */
export const CUSTODY_CATEGORIES = ['إعاشة', 'نظافة', 'مناولة', 'أخرى'];

/**
 * أنواعُ القيد. الاستلامُ والمصروفُ قيدان نقديّان يحرّكان الرصيد؛ و**الاعتماد**
 * (‹توسيع العهدة›) قيدٌ حوكميٌّ **بلا مبلغ** يُصادق مصروفًا تجاوز سقفَ الحامل —
 * يُشير إلى مصروفه بـ`refId` ولا يمسّ رصيدًا (المالُ صُرف فعلًا؛ الاعتمادُ طبقةُ
 * رقابةٍ لا محاسبة). فالقيدان النقديّان وحدَهما يدخلان الرصيدَ والكشف.
 */
export const CUSTODY_KINDS = { RECEIPT: 'receipt', EXPENSE: 'expense', APPROVAL: 'approval' };

/** هل القيدُ نقديٌّ (يحرّك الرصيد)؟ الاعتمادُ ليس كذلك. */
function isCashEntry(entry) {
  return entry?.kind === CUSTODY_KINDS.RECEIPT || entry?.kind === CUSTODY_KINDS.EXPENSE;
}

/**
 * الأدوارُ التي تُدير العهد النقديّة — تطابق `firestore.rules` و`navCatalog`
 * (عدّلها في الثلاثة معًا). المديرُ العامّ ومديرُ المستودع (إدارةٌ عامّة)،
 * والمالية والخزينة (من يُسلّم النقدَ ويصرفه).
 */
export const CUSTODY_WRITER_ROLES = ['admin', 'warehouse_manager', 'finance_manager', 'treasury'];

/** هل يملك هذا الدورُ تسجيلَ قيدِ عهدةٍ نقديّة؟ (حارسُ واجهةٍ وخدمة). */
export function canManageCustody(role) {
  return CUSTODY_WRITER_ROLES.includes(role);
}

/** مبلغُ القيد كعددٍ صحيحٍ من الوحدة الصغرى (لا كسرَ في السجلّ النقديّ). */
function amountOf(entry) {
  return Math.round(Number(entry?.amount) || 0);
}

/** المبلغُ الموقّع بأثره على الرصيد: الاستلامُ يزيد، والمصروفُ ينقص. */
function signedAmount(entry) {
  return entry?.kind === CUSTODY_KINDS.EXPENSE ? -amountOf(entry) : amountOf(entry);
}

/** قيودُ حاملٍ بعينه (أو كلُّها إن لم يُسمَّ حامل). */
function entriesForCustodian(entries, custodian) {
  const list = Array.isArray(entries) ? entries : [];
  if (custodian == null || custodian === '') return list.slice();
  return list.filter((e) => String(e?.custodian || '') === String(custodian));
}

/** تاريخُ القيد مقصوصًا على «yyyy-mm-dd» (يُرتَّب نصًّا ترتيبًا زمنيًّا سليمًا). */
function dayOf(entry) {
  return String(entry?.date || '').slice(0, 10);
}

/** يرتّب القيودَ زمنيًّا تصاعديًّا (بالتاريخ ثمّ بختم الإنشاء عند التساوي). */
function sortedByTime(list) {
  return list
    .slice()
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || (Number(a?.createdAtMs) || 0) - (Number(b?.createdAtMs) || 0));
}

/**
 * أسماءُ حمَلة العهد الظاهرون في القيود — فريدةٌ مرتّبةٌ عربيًّا.
 */
export function listCustodians(entries) {
  const set = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    const c = String(e?.custodian || '').trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
}

/**
 * رصيدُ حامل عهدة: المستلَمُ والمصروفُ والمتبقّي — كلُّها بالوحدة الصغرى.
 * المتبقّي = مجموعُ الاستلامات − مجموعُ المصروفات (قد يكون سالبًا — يُنبَّه لا يُمنَع).
 *
 * @param {Array} entries قيودُ العهد النقديّة.
 * @param {string} [custodian] حاملٌ بعينه؛ أو كلُّ الحمَلة إن أُغفل.
 * @returns {{received:number, spent:number, remaining:number}}
 */
export function custodyBalance(entries, custodian) {
  const list = entriesForCustodian(entries, custodian);
  let received = 0;
  let spent = 0;
  for (const e of list) {
    if (!isCashEntry(e)) continue; // الاعتمادُ لا مبلغَ له فلا يدخل الرصيد
    if (e.kind === CUSTODY_KINDS.EXPENSE) spent += amountOf(e);
    else received += amountOf(e);
  }
  return { received, spent, remaining: received - spent };
}

/**
 * كشفُ عهدةٍ زمنيٌّ لحاملٍ بعينه ضمن مدى اختياريّ.
 *
 *   opening  رصيدٌ افتتاحيٌّ: أثرُ كلّ قيدٍ **قبل** `from` (صفرٌ إن لم يُحدَّد from).
 *   lines    حركاتٌ داخل المدى [from, to] شاملًا الحدّين — لكلّ حركةٍ `signed`
 *            (أثرُها الموقّع) و`running` (الرصيدُ الجاري بعدها).
 *   closing  رصيدٌ ختاميّ = opening + مجموعُ أثر الحركات.
 *
 * ★ والتوازنُ مبنيٌّ لا مُدّعًى: `opening + Σ signed(lines) === closing` دائمًا
 *   (القيودُ خارجَ المدى بعد `to` تُستثنى من الكشف كلِّه — فالختاميُّ رصيدٌ
 *   «حتّى `to`» لا بعده). والقيدُ بلا تاريخٍ يُعدّ أقدمَ فيدخل الافتتاحيّ.
 *
 * @param {Array} entries
 * @param {string} custodian
 * @param {{from?:string, to?:string}} [range]
 * @returns {{opening:number, lines:Array, closing:number}}
 */
export function custodyStatement(entries, custodian, range = {}) {
  const from = range?.from ? String(range.from).slice(0, 10) : '';
  const to = range?.to ? String(range.to).slice(0, 10) : '';
  const list = sortedByTime(entriesForCustodian(entries, custodian));

  let opening = 0;
  const lines = [];
  for (const e of list) {
    if (!isCashEntry(e)) continue; // الاعتمادُ قيدٌ حوكميٌّ لا يظهر في الكشف النقديّ
    const d = dayOf(e);
    const s = signedAmount(e);
    if (from && d < from) {
      opening += s;
      continue;
    }
    if (to && d > to) continue;
    const prev = lines.length ? lines[lines.length - 1].running : opening;
    lines.push({ ...e, signed: s, running: prev + s });
  }
  const closing = lines.length ? lines[lines.length - 1].running : opening;
  return { opening, lines, closing };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ‹توسيع صرف العهدة› السقفُ والاعتماد — طبقةُ حوكمةٍ **اختياريّةٌ بالكامل**.
 *
 * ★★★ **لا إفساد:** حين لا يُضبَط سقفٌ قطّ، تُعيد `custodyCap` دائمًا `null`،
 *     فلا مصروفَ «فوق السقف» ولا اعتمادَ مطلوبٌ ولا قيدَ حوكمةٍ — يسلك النظامُ
 *     كما كان حرفًا بحرف. الطبقةُ تنشط فقط حين يضبط مديرٌ سقفًا عند التسليم.
 *
 * ★ **والسقفُ لا يمنع:** المصروفُ فوق السقف يُسجَّل كأيّ مصروفٍ ويُنقص الرصيد
 *   (المالُ صُرف فعلًا) — ثمّ يُوسَم «بانتظار الاعتماد» حتّى يُصادقه مديرٌ بقيد
 *   اعتمادٍ ملحق. فالرقابةُ تنبّهٌ ومصادقةٌ لاحقة، لا حجزٌ للمال (نمطُ «ينبّه لا
 *   يمنع» نفسُه). والسقفُ المُقيَّمُ هو الأحدثُ المضبوط (آخرُ تسليمٍ يحمل سقفًا).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** قيمةُ سقفٍ صحيحةٌ موجبةٌ من قيد، أو 0. */
function capOf(entry) {
  const c = Math.round(Number(entry?.cap) || 0);
  return c > 0 ? c : 0;
}

/**
 * سقفُ حاملٍ: أحدثُ سقفٍ موجبٍ ضُبط في قيود استلامه، أو `null` إن لم يُضبط قطّ.
 * «الأحدث» بالتاريخ ثمّ بختم الإنشاء — فتسليمٌ جديدٌ بسقفٍ يُحدّث السياسة.
 */
export function custodyCap(entries, custodian) {
  const withCap = entriesForCustodian(entries, custodian).filter(
    (e) => e?.kind === CUSTODY_KINDS.RECEIPT && capOf(e) > 0
  );
  if (!withCap.length) return null;
  const ordered = sortedByTime(withCap); // تصاعديًّا زمنيًّا — فالأخيرُ الأحدث
  return capOf(ordered[ordered.length - 1]);
}

/** هل يتجاوز هذا المصروفُ السقفَ المُمرَّر (فيحتاج اعتمادًا)؟ لا سقفَ ⇒ لا. */
export function expenseNeedsApproval(expense, cap) {
  if (expense?.kind !== CUSTODY_KINDS.EXPENSE) return false;
  if (cap == null) return false;
  return amountOf(expense) > cap;
}

/** هل اعتُمد مصروفٌ بمعرّفه؟ (قيدُ اعتمادٍ ملحقٌ يُشير إليه بـ`refId`). */
export function isExpenseApproved(entries, expenseId) {
  const id = String(expenseId || '');
  if (!id) return false;
  return (Array.isArray(entries) ? entries : []).some(
    (e) => e?.kind === CUSTODY_KINDS.APPROVAL && String(e?.refId || '') === id
  );
}

/**
 * حالةُ مصروفٍ أمام السقف: `'ok'` (لا سقفَ أو دونه) · `'pending'` (فوقه بلا
 * اعتماد) · `'approved'` (فوقه ومعتمَد). يُقيَّم بالسقف الحاليّ لحامله.
 */
export function expenseStatus(entries, expense, cap) {
  if (expense?.kind !== CUSTODY_KINDS.EXPENSE) return 'ok';
  const limit = cap === undefined ? custodyCap(entries, expense.custodian) : cap;
  if (!expenseNeedsApproval(expense, limit)) return 'ok';
  return isExpenseApproved(entries, expense.id) ? 'approved' : 'pending';
}

/**
 * طابورُ الاعتماد: المصروفاتُ التي تجاوزت سقفَ حاملها ولم تُعتمد بعد — الأحدثُ
 * أوّلًا. يُحسب سقفُ كلّ حاملٍ مرّةً (لا لكلّ مصروفٍ على حدة).
 */
export function pendingApprovals(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const capCache = new Map();
  const capFor = (c) => {
    if (!capCache.has(c)) capCache.set(c, custodyCap(list, c));
    return capCache.get(c);
  };
  return list
    .filter((e) => e?.kind === CUSTODY_KINDS.EXPENSE)
    .filter((e) => expenseStatus(list, e, capFor(e.custodian)) === 'pending')
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || (Number(b?.createdAtMs) || 0) - (Number(a?.createdAtMs) || 0));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ‹توسيع صرف العهدة› المواقعُ الديناميّة — من ماستر القطاع/المخزن لا قائمةٍ ثابتة.
 *
 * كانت المواقعُ مثبّتةً (`CUSTODY_SITES = ['155','الرحبة']`)؛ وبعد ربط المخازن
 * بالقطاعات (المرحلة ١) صارت تُشتقّ من **المخازن الحيّة مجمَّعةً بقطاعها (محلِّها)**.
 * والمواقعُ السابقةُ في القيود القديمة — التي لا تطابق مخزنًا حيًّا — تبقى في
 * مجموعةٍ «سابقة» فلا يَعمى عنها التصفيةُ والعرض (لا إفساد للقديم).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** عناوينُ المجموعات الخاصّة (غيرُ أسماء القطاعات). */
export const CUSTODY_UNASSIGNED_SECTOR = '— بلا قطاع —';
export const CUSTODY_LEGACY_SECTOR = '— مواقع سابقة —';

/**
 * مجموعاتُ مواقع العهدة من المخازن الحيّة، مرتّبةً بقطاعها.
 * @param {Array} warehouses وثائقُ المخازن (كلُّها؛ تُرشَّح الحيّةُ داخلًا).
 * @param {Array<{code:string,nameAr:string}>} [shops] القطاعاتُ لتسمية المجموعات.
 * @param {Array<string>} [legacySites] مواقعُ قيودٍ قديمةٍ تُضمَّن إن لم تطابق مخزنًا.
 * @returns {Array<{sector:string, sites:string[]}>} — «بلا قطاع» آخرًا، ثمّ «سابقة».
 */
export function custodySiteGroups(warehouses, shops = [], legacySites = []) {
  const shopName = new Map(
    (Array.isArray(shops) ? shops : []).map((s) => [normalizeShopCode(s?.code), String(s?.nameAr || s?.code || '').trim()])
  );
  const groups = new Map();
  for (const w of activeWarehouses(warehouses)) {
    const code = warehouseSector(w);
    const label = code ? shopName.get(normalizeShopCode(code)) || code : CUSTODY_UNASSIGNED_SECTOR;
    const name = String(w?.name || w?.code || w?.id || '').trim();
    if (!name) continue;
    if (!groups.has(label)) groups.set(label, new Set());
    groups.get(label).add(name);
  }
  const out = [...groups.entries()]
    .map(([sector, set]) => ({ sector, sites: [...set].sort((a, b) => a.localeCompare(b, 'ar')) }))
    .sort((a, b) => {
      if (a.sector === CUSTODY_UNASSIGNED_SECTOR) return 1;
      if (b.sector === CUSTODY_UNASSIGNED_SECTOR) return -1;
      return a.sector.localeCompare(b.sector, 'ar');
    });
  const known = new Set(out.flatMap((g) => g.sites));
  const legacy = [
    ...new Set((Array.isArray(legacySites) ? legacySites : []).map((s) => String(s || '').trim()).filter(Boolean)),
  ].filter((s) => !known.has(s));
  if (legacy.length) out.push({ sector: CUSTODY_LEGACY_SECTOR, sites: legacy.sort((a, b) => a.localeCompare(b, 'ar')) });
  return out;
}

/** تسطيحُ المجموعات إلى أسماء المواقع كلِّها (للتحقّق والافتراض). */
export function custodySiteNames(groups) {
  return (Array.isArray(groups) ? groups : []).flatMap((g) => g.sites || []);
}
