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

/** فئاتُ المصروف النقديّ (طلب المالك: إعاشة · نظافة · مناولة · أخرى). */
export const CUSTODY_CATEGORIES = ['إعاشة', 'نظافة', 'مناولة', 'أخرى'];

/** نوعا القيد. */
export const CUSTODY_KINDS = { RECEIPT: 'receipt', EXPENSE: 'expense' };

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
    if (e?.kind === CUSTODY_KINDS.EXPENSE) spent += amountOf(e);
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
