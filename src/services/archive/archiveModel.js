/**
 * منطق الأرشيف الدوريّ الخالص — بلا Firestore وبلا DOM.
 *
 * الأرشيف طبقتان تُدمجان في قائمةٍ واحدة:
 *   1. **بذرة ثابتة** (`archiveSeed.js`) — التقارير والمحاضر الرسمية النهائية
 *      المنسوخة إلى `public/archive/`، تُفتح حيًّا من أيّ جهاز. لكلٍّ `path`.
 *   2. **رفعٌ حيّ** (`archive_documents` في Firestore) — يرفعه المالك في أيّ
 *      وقت؛ حمولته base64 (نصّ HTML أو PDF/صورة) أو `storageUrl` للكبير.
 *
 * الفكرة الحاكمة: الأرشيف **المصدر الأوّل المعتمد** للتقارير الدورية والمحاضر —
 * لا ملفّاتٌ متناثرة على سطح المكتب. لذا لكلّ وثيقةٍ **رقمٌ إشاريّ** وتاريخٌ
 * وتصنيف، وواحدةٌ تُعلَّم `primary` فتكون المرجع المعتمد لأحدث دورة.
 *
 * ── طبقة دورة الحياة ──
 * الوثيقة ليست ملفًّا يُرفع ويُنسى: لها **نوعٌ** ودرجةُ **سرّية** وتاريخُ
 * **انتهاء** تُشتقّ منه حالتها، وكلماتٌ مفتاحية ونصٌّ مستخرَج يُبحث فيهما.
 * الحالة تُحسَب ولا تُخزَّن (عدا الثلاث المخزَّنة) فلا تكذب على مرور الزمن.
 */

/** تصنيفا الأرشيف — يمليان التبويبات في الواجهة. */
export const ARCHIVE_CATEGORIES = {
  report: 'التقارير',
  minutes: 'محاضر الاجتماعات',
};

/**
 * أنواع الوثيقة العشرون — قيمها عربيّةٌ لأنّها **معروضة** لا مفاتيح منطق،
 * ولا يتفرّع عليها سلوك. المجهول يُقبل كما هو (لا نُسقط مُدخَلًا لنوعٍ جديد).
 */
export const DOC_TYPES = [
  'عقد', 'مشروع', 'مخطّط هندسيّ', 'مراسلة رسميّة', 'محضر اجتماع',
  'اعتماد مستنديّ', 'أمر شراء', 'فاتورة', 'مستخلَص', 'ترخيص',
  'ملفّ مورّد', 'ملفّ عميل', 'ملفّ موظّف', 'تقرير', 'سياسة',
  'إجراء', 'نموذج', 'بريد صادر', 'بريد وارد', 'أخرى',
];

/** درجات السرّية — مفاتيح لاتينيّة (منطق) وتسمياتٌ عربيّة (عرض). */
export const CONFIDENTIALITY = {
  public: 'عام',
  internal: 'داخليّ',
  secret: 'سرّي',
  top_secret: 'سرّي للغاية',
};

/** الحالات **المخزَّنة** — يختارها المستخدم وتُكتب في الوثيقة. */
export const STORED_STATUSES = {
  draft: 'مسودّة',
  active: 'نشط',
  approved: 'معتمد',
};

/** الحالات **المشتقّة** — تُحسَب من تاريخ الانتهاء ولا تُكتب أبدًا. */
export const DERIVED_STATUSES = {
  expiring: 'ينتهي قريبًا',
  expired: 'منتهية',
};

/** كلّ الحالات معًا للعرض. */
export const STATUS_LABELS = { ...STORED_STATUSES, ...DERIVED_STATUSES };

/** عتبة التنبيه: الوثيقة «تنتهي قريبًا» إن بقي لانتهائها هذا العدد أو أقلّ. */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * يحوّل لحظةً (بالميلي ثانية) إلى تاريخٍ بصيغة `YYYY-MM-DD`.
 *
 * **لا يقرأ الساعة** — تُمرَّر إليه `nowMs` من طبقة الواجهة أو الخدمة. المنطق
 * الخالص لا يسأل عن الوقت: من سأل الساعة بنفسه صار اختبارُه يمرّ اليوم ويسقط
 * غدًا. عُرفُ المستودع، يحرسه `npm run audit`.
 */
export function todayISO(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** يحوّل `YYYY-MM-DD` إلى وقتٍ بتوقيت UTC؛ `null` لما ليس تاريخًا. */
function utcOf(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * كم يومًا يفصل `dateStr` عن `today`؟ موجبٌ للمستقبل، سالبٌ للماضي،
 * و`null` إن كان أحدهما بلا تاريخ. الحساب بـUTC فلا تُزحزحه المنطقة الزمنيّة.
 */
export function daysUntil(dateStr, today) {
  const a = utcOf(dateStr);
  const b = utcOf(today);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * حالة الوثيقة الفعليّة — تُحسَب ولا تُقرأ من الحقل وحده:
 *   · المسودّة تبقى مسودّة (لم تدخل الخدمة بعد فلا معنى لانتهائها).
 *   · بلا تاريخ انتهاء ⇒ الحالة المخزَّنة كما هي.
 *   · مضى تاريخ الانتهاء ⇒ `expired` مهما كانت المخزَّنة (الانتهاء يعلو الاعتماد).
 *   · بقي ≤ ٣٠ يومًا ⇒ `expiring`.
 * المخزَّنة المجهولة تُردّ إلى `active` فلا تسقط وثيقةٌ قديمة بلا حقل حالة.
 */
export function docStatus(doc = {}, today) {
  const stored = STORED_STATUSES[doc.status] ? doc.status : 'active';
  if (stored === 'draft') return 'draft';
  const left = daysUntil(doc.expiry, today);
  if (left === null) return stored;
  if (left < 0) return 'expired';
  if (left <= EXPIRY_WARNING_DAYS) return 'expiring';
  return stored;
}

/** تسمية الحالة للعرض (المجهولة تُعرض كما هي لا فارغة). */
export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || '');
}

/** تسمية درجة السرّية (الغائب = «عام»). */
export function confidentialityLabel(level) {
  return CONFIDENTIALITY[level] || CONFIDENTIALITY.public;
}

/** التصنيف معروفٌ أم لا (نردّ المجهول إلى «تقرير» فلا يسقط مُدخَل). */
export function categoryLabel(cat) {
  return ARCHIVE_CATEGORIES[cat] || ARCHIVE_CATEGORIES.report;
}

/**
 * يوحّد النصّ العربيّ للبحث: يحذف التشكيل والتطويل، ويردّ صور الهمزة إلى «ا»،
 * والتاء المربوطة إلى «ه»، والألف المقصورة إلى «ي». بهذا يجد «الاعتماد» من
 * «الإعتماد»، و«سري» من «سرّي» — وهو ما يفصل بحثًا يعمل من بحثٍ يبدو يعمل.
 */
export function normalizeArabic(text) {
  return String(text || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .toLowerCase()
    .trim();
}

/** الحقول التي يمسحها البحث الشامل — الرقم والعنوان وما وراءهما. */
function haystack(doc = {}) {
  return [
    doc.refNumber, doc.title, doc.note, doc.period, doc.keywords,
    doc.ocrText, doc.type, doc.dept, doc.section, doc.project,
    doc.issuer, doc.client, doc.fileName, doc.byName,
  ].filter(Boolean).join(' ');
}

/**
 * هل تطابق الوثيقة نصّ البحث؟ الاستعلام الفارغ يطابق الكلّ. تُقسَّم الكلمات
 * ويُشترط وجودها **جميعًا** (بحثُ «و») فيضيق النطاق كلّما زاد المستخدم كلمة.
 */
export function matchesQuery(doc = {}, query = '') {
  const q = normalizeArabic(query);
  if (!q) return true;
  const hay = normalizeArabic(haystack(doc));
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/**
 * حقول دورة الحياة المشتركة بين الطبقتين — كلّها **اختيارية**: وثيقةٌ كُتبت
 * قبل هذه الطبقة تُقرأ اليوم بلا نقصان (نشطة · عامّة · بلا انتهاء).
 */
function lifecycleFields(doc = {}) {
  return {
    type: doc.type || '',
    status: STORED_STATUSES[doc.status] ? doc.status : 'active',
    confidential: CONFIDENTIALITY[doc.confidential] ? doc.confidential : 'public',
    expiry: doc.expiry || '',
    keywords: doc.keywords || '',
    ocrText: doc.ocrText || '',
    dept: doc.dept || '',
    section: doc.section || '',
    project: doc.project || '',
    issuer: doc.issuer || '',
    client: doc.client || '',
    signature: doc.signature || null,
    tracking: Array.isArray(doc.tracking) ? doc.tracking : [],
    versionCount: Number(doc.versionCount) || 0,
    approvedBy: doc.approvedBy || '',
    approvedDate: doc.approvedDate || '',
  };
}

/**
 * يوحّد مُدخَل البذرة الثابتة إلى شكل العرض الموحّد.
 * البذرة تُفتح بمسارٍ ثابت (`path`) لا حمولة base64.
 */
export function normalizeSeed(entry = {}) {
  return {
    ...lifecycleFields(entry),
    id: entry.id,
    source: 'seed',
    category: entry.category === 'minutes' ? 'minutes' : 'report',
    refNumber: entry.refNumber || '',
    title: entry.title || 'بلا عنوان',
    date: entry.date || '',
    period: entry.period || '',
    note: entry.note || '',
    format: entry.format || 'pdf',
    path: entry.path || '',
    fileData: null,
    storageUrl: null,
    primary: Boolean(entry.primary),
    editable: false,
  };
}

/**
 * يوحّد وثيقة Firestore مرفوعة إلى شكل العرض الموحّد.
 * القراءة تتسامح مع الحقول الغائبة فلا تنهار الواجهة على وثيقةٍ قديمة.
 */
export function normalizeLive(doc = {}) {
  return {
    ...lifecycleFields(doc),
    id: doc.id,
    source: 'live',
    category: doc.category === 'minutes' ? 'minutes' : 'report',
    refNumber: doc.refNumber || '',
    title: doc.title || 'بلا عنوان',
    date: doc.date || '',
    period: doc.period || '',
    note: doc.note || '',
    format: doc.format || 'pdf',
    path: '',
    fileData: doc.fileData || null,
    storageUrl: doc.storageUrl || null,
    fileName: doc.fileName || '',
    primary: Boolean(doc.primary),
    byName: doc.byName || '',
    editable: true,
  };
}

/** يرتّب بالأحدث تاريخًا؛ وما لا تاريخ له في الآخر (لا يتصدّر الفارغ). */
export function byDateDesc(a, b) {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return String(b.date).localeCompare(String(a.date));
}

/**
 * يدمج البذرة الثابتة مع المرفوع حيًّا في قائمةٍ واحدة موحّدة الشكل، مرتّبةٍ
 * بالأحدث. لا يُلغي أحدهما الآخر — البذرة مرجعٌ دائم، والحيّ يُضاف فوقها.
 */
export function mergeArchive(seed = [], liveById = {}) {
  const seeds = (seed || []).map(normalizeSeed);
  const live = Object.values(liveById || {})
    .filter(Boolean)
    .map((d) => normalizeLive(d));
  return [...seeds, ...live].sort(byDateDesc);
}

/** يصفّي قائمة الأرشيف على تصنيفٍ بعينه (report | minutes). */
export function byCategory(list, category) {
  return (list || []).filter((x) => x.category === category);
}

/**
 * المصفاة الموحّدة للشاشة: تصنيفٌ ونصُّ بحثٍ وحالةٌ محسوبة ودرجةُ سرّية ونوع.
 * كلّ معيارٍ غائبٍ لا يصفّي — فاستدعاءٌ بلا معايير يُعيد القائمة كما هي.
 */
export function filterArchive(list, criteria = {}, today) {
  const { category, query, status, confidential, type } = criteria;
  return (list || []).filter((doc) => {
    if (category && doc.category !== category) return false;
    if (status && docStatus(doc, today) !== status) return false;
    if (confidential && doc.confidential !== confidential) return false;
    if (type && doc.type !== type) return false;
    return matchesQuery(doc, query);
  });
}

/**
 * الوثائق التي تنتهي خلال `days` يومًا (ولمّا تنتهِ بعد) — مرتّبةً بالأقرب
 * انتهاءً أوّلًا، فأوّل الصفّ هو أعجل ما يحتاج تدخّلًا.
 */
export function expiringSoon(list, days = EXPIRY_WARNING_DAYS, today) {
  return (list || [])
    .filter((doc) => {
      if (docStatus(doc, today) === 'draft') return false;
      const left = daysUntil(doc.expiry, today);
      return left !== null && left >= 0 && left <= days;
    })
    .sort((a, b) => daysUntil(a.expiry, today) - daysUntil(b.expiry, today));
}

/** الوثائق التي مضى تاريخ انتهائها (تحذيرٌ أحمر — لا تجميل). */
export function expiredDocs(list, today) {
  return (list || []).filter((doc) => docStatus(doc, today) === 'expired');
}

/** مُدخَل تتبّعٍ واحد — ملحق-فقط، بوقتٍ نصّيّ (المصفوفات لا تقبل طوابع الخادم). */
export function trackEntry(action, byName, at) {
  return { action: String(action || ''), byName: byName || 'غير معروف', at };
}

/**
 * لقطةٌ عدديّة للرأس: كم تقريرًا وكم محضرًا، وهل ثمّة مصدرٌ معتمد (primary)،
 * وكم وثيقةً تنتهي قريبًا وكم منتهية — الرقمان الأخيران هما ما يستدعي تدخّلًا.
 */
export function archiveSummary(list, today) {
  const all = list || [];
  const primary = all.find((x) => x.primary) || null;
  return {
    total: all.length,
    reports: byCategory(all, 'report').length,
    minutes: byCategory(all, 'minutes').length,
    live: all.filter((x) => x.source === 'live').length,
    expiring: expiringSoon(all, EXPIRY_WARNING_DAYS, today).length,
    expired: expiredDocs(all, today).length,
    primary,
  };
}
