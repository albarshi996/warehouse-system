/**
 * تقرير المستندات — البحث بالتاريخ والطرف والرقم (طلب المالك ١ · 2026-10-02).
 *
 * ما يحلّه: صندوق المستندات كان يبحث في **أربعة حقول** (الرقم · الرمز ·
 * عنوان النوع · اسم المُنشئ)، فمن أراد «كلّ ما جاء من مورّد الزاوية في
 * سبتمبر» لم يجد سبيلًا: الطرف ليس في شبكة البحث، والتاريخ لا يُصفَّى أصلًا.
 * فكان يفتح المستندات واحدًا واحدًا — وهو ما تُلغيه هذه الوحدة.
 *
 * ═══ ثلاثُ قواعدَ حكمت التصميم ═══
 *
 * ★★★ **الطرف يُقرأ من `PARTY_FIELDS` لا من قائمةٍ هنا.** المستند لا يحمل
 * حقلًا اسمه «الطرف»: يحمل `supplier` أو `customer` أو `repName` أو
 * `vehiclePlate` بحسب نوعه. وقائمةٌ مكرّرةٌ هنا تنحرف صامتةً عن المخطّطات
 * لحظةَ يُضاف حقلُ طرفٍ سادس — وهو ما وقع في `startGroups` قبلًا فبقيت
 * سبعةُ أنواعٍ بلا زرّ. فالمصدر واحد: ما أعلنته `partyFields.js`.
 *
 * ★★★ **والتاريخ ثلاثةُ أزمنةٍ لا زمنٌ واحد.** «مستندات يوم الأحد» تعني
 * أحدَ ماذا؟ يومَ كُتب المستند (`createdAt`)، أم يومَ وقعت الواقعة التي
 * يوثّقها (`receivedAt` في الاستلام · `issueDate` في الأمر)، أم يومَ تحرّك
 * آخرَ مرّة (`updatedAt`)؟ الثلاثة تختلف — والاستلامُ المؤرَّخ أمسِ قد
 * يُكتب اليوم. فالأساس **مُعلَنٌ ويختاره الباحث**، ولا يُفترض عنه.
 * وختمُ الواقعة يُقرأ من `TIME_FIELD_MAP` (صنف `event`) — لا من تخمين.
 *
 * ★★★ **والمقارنة بأيّامٍ محلّيّة لا بـ`toISOString`.** ليبيا على UTC+2،
 * فمستندٌ أُنشئ الساعةَ الواحدةَ صباحًا يُعيده `toISOString().slice(0,10)`
 * إلى **اليوم السابق**. ومن بحث عن مستندات اليوم لم يجده. فالتحويل بأجزاء
 * التاريخ المحلّيّة (`getFullYear`/`getMonth`/`getDate`).
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›) — ليُختبَر في Node.
 */

import { PARTY_FIELDS } from './partyFields.js';
import { fieldsByClass } from './timeFields.js';
import { getSchema } from './schemas/index.js';
import { getState } from './states.js';
import { toMillis, normalizeAr, ageInState, isStale } from './inbox.js';

const text = (v) => String(v ?? '').trim();

/* ═══════════════ أساس التاريخ ═══════════════ */

/**
 * أسس التاريخ الثلاثة التي يجوز التصفية عليها.
 *
 * `event` أوّلًا لأنّه **ما يسأل عنه الناس**: «ماذا استلمنا أمس؟» سؤالٌ عن
 * الواقعة لا عن لحظة الكتابة. ولو كان الأساس `created` افتراضًا لأخفى
 * استلامَ أمسِ المُسجَّلَ اليوم — وهو الحال الغالب في المستودع.
 */
export const DATE_BASES = Object.freeze([
  { id: 'event', label: 'تاريخ الواقعة', hint: 'اليوم الذي وقعت فيه العملية — تاريخ الاستلام أو الإصدار كما في المستند' },
  { id: 'created', label: 'تاريخ الإنشاء', hint: 'اليوم الذي كُتب فيه المستند في النظام' },
  { id: 'updated', label: 'آخر تحديث', hint: 'اليوم الذي تحرّك فيه المستند آخر مرّة' },
]);

export const DEFAULT_DATE_BASIS = 'event';

/** هل المعرّف أساسَ تاريخٍ معروفًا؟ */
export function isDateBasis(id) {
  return DATE_BASES.some((b) => b.id === id);
}

/**
 * يوم محلّيّ `YYYY-MM-DD` من ميلي-ثانية.
 *
 * ⚠️ بأجزاء التاريخ المحلّيّة لا بـ`toISOString` — انظر القاعدة الثالثة في
 * رأس الملفّ. والفارق ليس نظريًّا: ساعتان تُزيح يومًا كاملًا.
 */
export function localDay(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * ختمُ الواقعة في رأس المستند — يومًا نصّيًّا، أو `''` إن لم يُصنَّف نوعُه
 * ختمًا أو كان الحقل فارغًا.
 *
 * الحقول تُقرأ من `TIME_FIELD_MAP` بصنف `event`، وقد تكون أكثر من حقل
 * (نادرًا) فيُؤخَذ **أوّلُ مملوءٍ** — ولا يُخترع تاريخ لما لا تاريخ له.
 */
export function eventDay(doc) {
  const keys = fieldsByClass(doc?.type, 'event');
  for (const k of keys) {
    const day = text(doc?.header?.[k]).slice(0, 10);
    if (day) return day;
  }
  return '';
}

/**
 * يوم المستند على الأساس المطلوب.
 *
 * و`event` يتراجع إلى `created` عند غياب الختم — لأنّ البديل أسوأ: مستندٌ
 * بلا ختمٍ يسقط من **كلّ** نطاقٍ زمنيّ فيختفي من التقرير بلا أن يعلم
 * الباحث أنّه اختفى. والتراجع يُعلَن في `dayBasisUsed` كي لا يكون صامتًا.
 */
export function dayOfDoc(doc, basis = DEFAULT_DATE_BASIS) {
  if (basis === 'created') return localDay(toMillis(doc?.createdAt));
  if (basis === 'updated') return localDay(toMillis(doc?.updatedAt) ?? toMillis(doc?.createdAt));
  const stamped = eventDay(doc);
  return stamped || localDay(toMillis(doc?.createdAt));
}

/** أيُّ أساسٍ استُعمل فعلًا لهذا المستند — للإفصاح عن التراجع أعلاه. */
export function dayBasisUsed(doc, basis = DEFAULT_DATE_BASIS) {
  if (basis !== 'event') return basis;
  return eventDay(doc) ? 'event' : 'created';
}

/* ═══════════════ الطرف ═══════════════ */

/**
 * أطرافُ مستندٍ كما أعلنتها `PARTY_FIELDS` — لا قائمةَ أسماءٍ هنا.
 *
 * يُعيد صفًّا لكلّ حقلِ طرفٍ **مملوءٍ** في الرأس: `{key, source, code, name}`.
 * والمكرّر يُدمج: `supplier` و`supplierCode` حقلان في المخطّط وطرفٌ واحد في
 * الواقع، فيُجمعان بمصدرهما وقرينهما لا بمفتاحهما.
 */
export function partiesOf(doc) {
  const header = doc?.header || {};
  const seen = new Map();
  for (const [key, decl] of Object.entries(PARTY_FIELDS)) {
    const code = text(header[decl.codeKey]);
    const name = decl.nameKey ? text(header[decl.nameKey]) : '';
    if (!code && !name) continue;
    // الهويّة بالمصدر وقرينه لا بالمفتاح — فلا يُحسب المورّد طرفين.
    const id = `${decl.source}|${decl.codeKey}`;
    if (seen.has(id)) continue;
    seen.set(id, { key, source: decl.source, code, name });
  }
  return [...seen.values()];
}

/**
 * سطر الطرف للعرض — «الاسم (الرمز)» أو أحدهما، وفراغٌ لمن لا طرفَ له.
 *
 * والفراغ مقصود: مستندُ تسويةٍ داخليٍّ لا طرفَ له، وكتابة «—» في عمودٍ
 * نصفُه فارغٌ ضجيج. العمود يقرّر ما يرسم للفراغ لا هذه الوحدة.
 */
export function partyLabel(doc) {
  const parties = partiesOf(doc);
  if (!parties.length) return '';
  const p = parties[0];
  if (p.name && p.code && p.name !== p.code) return `${p.name} (${p.code})`;
  return p.name || p.code;
}

/** كلُّ نصوص الأطراف مطبَّعةً للبحث — رموزًا وأسماءً. */
function partyHaystack(doc) {
  return partiesOf(doc)
    .flatMap((p) => [p.code, p.name])
    .filter(Boolean)
    .join(' ');
}

/* ═══════════════ التصفية ═══════════════ */

/** معايير فارغة — مرجعٌ واحدٌ تُبنى عليه الشاشة فلا تتفرّق الأسماء. */
export const EMPTY_CRITERIA = Object.freeze({
  q: '',
  number: '',
  party: '',
  type: '',
  state: '',
  from: '',
  to: '',
  basis: DEFAULT_DATE_BASIS,
  staleOnly: false,
});

/**
 * هل يقع يومُ المستند في النطاق؟ النطاق **شاملٌ للطرفين** (`from` و`to`
 * داخلان) — فمن كتب اليوم نفسه في الحدّين أراد ذلك اليوم لا لا شيء.
 *
 * والمقارنة نصّيّةٌ بين `YYYY-MM-DD` — وهي صحيحةٌ معجميًّا لهذه الصيغة،
 * ولا تمرّ بمنطقةٍ زمنيّةٍ ثانية فتنحرف.
 */
export function inDateRange(day, from, to) {
  const f = text(from).slice(0, 10);
  const t = text(to).slice(0, 10);
  if (!f && !t) return true;
  // بلا يومٍ لا حكم: المستند الذي لا تاريخ له يخرج من أيّ نطاقٍ محدَّد —
  // ولا يُدَّعى أنّه فيه.
  if (!day) return false;
  if (f && day < f) return false;
  if (t && day > t) return false;
  return true;
}

/**
 * تصفيةُ التقرير — كلُّ المعايير معًا (AND)، وكلٌّ منها يُتجاهل فارغًا.
 *
 * و`q` يبقى على عقده القديم (رقم · نوع · عنوان · منشئ) **ويزيد الطرف** —
 * فمن كان يكتب اسم المورّد في مربّع البحث ولا يجد، يجد الآن. والتوسيع لا
 * يكسر بحثًا قائمًا: ما كان يُوجَد ما زال يُوجَد.
 *
 * @param {object[]} docs
 * @param {typeof EMPTY_CRITERIA & {nowMs?:number}} criteria
 */
export function filterReport(docs, criteria = EMPTY_CRITERIA) {
  const c = { ...EMPTY_CRITERIA, ...(criteria || {}) };
  const needle = normalizeAr(c.q).trim();
  const numberNeedle = normalizeAr(c.number).trim();
  const partyNeedle = normalizeAr(c.party).trim();
  const basis = isDateBasis(c.basis) ? c.basis : DEFAULT_DATE_BASIS;
  /**
   * ⚠️ **لا `Date.now()` هنا** — المنطقُ الخالص لا يقرأ الساعة بنفسه
   * (يفرضه `npm run audit` §5، وقد أسقطني فعلًا). والسببُ أنّ دالّةً تقرأ
   * الساعةَ لا تُختبَر حتميًّا: نتيجتُها تتغيّر بين تشغيلين.
   *
   * و`staleOnly` بلا ساعةٍ يُعيد **صفرَ صفوف** لا «كلَّ الصفوف»: النتيجةُ
   * الفارغةُ تُرى وتُراجَع، أمّا تجاهلُ الشرط صامتًا فيُعطي قائمةً تبدو
   * صحيحةً وهي ليست ما طُلب.
   */
  const nowMs = Number.isFinite(c.nowMs) ? c.nowMs : null;

  return (docs || []).filter((d) => {
    if (c.type && d?.type !== c.type) return false;
    if (c.state && d?.state !== c.state) return false;
    if (c.staleOnly && !isStale(d, nowMs)) return false;

    if (numberNeedle && !normalizeAr(d?.number).includes(numberNeedle)) return false;
    if (partyNeedle && !normalizeAr(partyHaystack(d)).includes(partyNeedle)) return false;

    if (c.from || c.to) {
      if (!inDateRange(dayOfDoc(d, basis), c.from, c.to)) return false;
    }

    if (!needle) return true;
    const title = getSchema(d?.type)?.titleAr || '';
    const hay = normalizeAr(
      [d?.number, d?.type, title, d?.createdByName, partyHaystack(d)].filter(Boolean).join(' ')
    );
    return hay.includes(needle);
  });
}

/** هل في المعايير تصفيةٌ فعليّة؟ (لرسم «مسح التصفية» ونصّ الفراغ) */
export function hasActiveCriteria(criteria) {
  const c = { ...EMPTY_CRITERIA, ...(criteria || {}) };
  return Boolean(
    text(c.q) || text(c.number) || text(c.party) || c.type || c.state || text(c.from) || text(c.to) || c.staleOnly
  );
}

/**
 * وصفُ التصفية النشطة سطرًا عربيًّا — يُطبع في رأس التقرير المُصدَّر.
 *
 * ولماذا؟ لأنّ ملفًّا مُصدَّرًا يُرسَل بالبريد ويُقرأ بعد أسبوع، فإن لم يحمل
 * **شرطَه** صار جدولَ أرقامٍ بلا معنى: أهو كلُّ المستندات أم مستندات مورّدٍ
 * واحدٍ في أسبوع؟ والملفُّ الذي لا يقول شرطَه يُقرأ خطأً — وهو أسوأ من
 * ملفٍّ لم يُصدَّر.
 */
export function criteriaSummary(criteria) {
  const c = { ...EMPTY_CRITERIA, ...(criteria || {}) };
  const parts = [];
  if (text(c.number)) parts.push(`الرقم يحتوي: ${text(c.number)}`);
  if (text(c.party)) parts.push(`الطرف: ${text(c.party)}`);
  if (c.type) parts.push(`النوع: ${getSchema(c.type)?.titleAr || c.type}`);
  if (c.state) parts.push(`الحالة: ${getState(c.state).label}`);
  if (text(c.from) || text(c.to)) {
    const basisLabel = DATE_BASES.find((b) => b.id === (isDateBasis(c.basis) ? c.basis : DEFAULT_DATE_BASIS))?.label;
    const from = text(c.from);
    const to = text(c.to);
    const range = from && to ? `${from} ← ${to}` : from ? `من ${from}` : `إلى ${to}`;
    parts.push(`${basisLabel}: ${range}`);
  }
  if (c.staleOnly) parts.push('المتأخّر فقط');
  if (text(c.q)) parts.push(`بحث: ${text(c.q)}`);
  return parts.length ? parts.join(' · ') : 'بلا تصفية — كلّ المستندات';
}

/**
 * أيّامُ النطاق المختصرة لاسم الملفّ — `2026-09-01_2026-09-30` أو يومٌ واحد.
 * الفارغ يُعيد `''` فيتولّى المستدعي الافتراض.
 */
export function rangeStamp(criteria) {
  const c = { ...EMPTY_CRITERIA, ...(criteria || {}) };
  const from = text(c.from).slice(0, 10);
  const to = text(c.to).slice(0, 10);
  if (from && to) return from === to ? from : `${from}_${to}`;
  return from || to || '';
}

/* ═══════════════ التجميع ═══════════════ */

/**
 * تجميعُ المصفَّى بيومٍ أو نوعٍ أو طرفٍ أو حالة — صفوفُ ملخّصٍ مرتّبة.
 *
 * ولمَ التجميع في التقرير؟ لأنّ السؤال التالي بعد «أرني مستندات سبتمبر»
 * هو «كم من كلّ نوع؟» — ومن لم يجد الجواب عدّ الصفوف بإصبعه.
 *
 * @param {object[]} docs المصفَّى
 * @param {'day'|'type'|'party'|'state'} by
 */
export function groupReport(docs, by = 'type', basis = DEFAULT_DATE_BASIS) {
  const buckets = new Map();
  for (const d of docs || []) {
    let key;
    let label;
    if (by === 'day') {
      key = dayOfDoc(d, basis) || '';
      label = key || 'بلا تاريخ';
    } else if (by === 'party') {
      key = partyLabel(d);
      label = key || 'بلا طرف';
    } else if (by === 'state') {
      key = text(d?.state);
      label = getState(d?.state).label;
    } else {
      key = text(d?.type);
      label = getSchema(d?.type)?.titleAr || key;
    }
    const row = buckets.get(key) || { key, label, count: 0 };
    row.count += 1;
    buckets.set(key, row);
  }
  const rows = [...buckets.values()];
  // اليوم يُرتَّب زمنيًّا (الأحدث أوّلًا) وغيرُه بالعدد — فالسؤال يختلف.
  return by === 'day'
    ? rows.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    : rows.sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1));
}

/* ═══════════════ صفوف التصدير ═══════════════ */

/** عناوينُ التقرير — واحدةٌ للشاشة وللإكسل وللـCSV، فلا تفترق ثلاثة أعمدة. */
export const REPORT_COLUMNS = Object.freeze([
  { key: 'number', label: 'الرقم' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'stateLabel', label: 'الحالة' },
  { key: 'party', label: 'الطرف (مورّد/عميل)' },
  { key: 'eventDate', label: 'تاريخ الواقعة' },
  { key: 'createdDate', label: 'تاريخ الإنشاء' },
  { key: 'createdByName', label: 'أنشأه' },
  { key: 'approvedByName', label: 'اعتمده' },
  { key: 'lineCount', label: 'عدد البنود' },
  { key: 'ageDays', label: 'أيام في الحالة' },
  { key: 'stale', label: 'متأخّر' },
  { key: 'updatedAt', label: 'آخر تحديث' },
]);

/**
 * صفٌّ مسطَّحٌ للتصدير — قيمٌ نصّيّةٌ وأرقامٌ فقط، بلا عقدة React.
 *
 * دالّةٌ خالصةٌ واحدةٌ يقرأها CSV والإكسل معًا: حين كان لكلٍّ بناؤه افترق
 * عمودٌ بينهما صامتًا (درسُ `itemsExportRows`).
 */
export function reportRow(doc, nowMs) {
  const age = ageInState(doc, nowMs);
  const updated = toMillis(doc?.updatedAt || doc?.createdAt);
  return {
    number: text(doc?.number) || 'مسودّة',
    typeLabel: getSchema(doc?.type)?.titleAr || text(doc?.type),
    stateLabel: getState(doc?.state).label,
    party: partyLabel(doc),
    eventDate: eventDay(doc),
    createdDate: localDay(toMillis(doc?.createdAt)),
    createdByName: text(doc?.createdByName),
    approvedByName: text(doc?.approvedByName),
    lineCount: (doc?.lines || []).filter((l) => l && Object.values(l).some((v) => text(v))).length,
    ageDays: age == null ? '' : age,
    stale: isStale(doc, nowMs) ? 'نعم' : 'لا',
    updatedAt: updated ? `${localDay(updated)} ${new Date(updated).toTimeString().slice(0, 5)}` : '',
  };
}

/**
 * كلُّ الصفوف — بترتيب ما وصل (الفرز مسؤوليّة المستدعي).
 * و`nowMs` **يُمرَّر ولا يُقرأ هنا**: المنطقُ الخالص لا يقرأ الساعة (حارس `npm run audit` §5).
 */
export function reportRows(docs, nowMs) {
  return (docs || []).map((d) => reportRow(d, nowMs));
}
