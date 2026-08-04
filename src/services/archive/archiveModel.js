/**
 * منطق الأرشيف الدوريّ الخالص — بلا Firestore وبلا DOM.
 *
 * الأرشيف طبقتان تُدمجان في قائمةٍ واحدة:
 *   1. **بذرة ثابتة** (`archiveSeed.js`) — التقارير والمحاضر الرسمية النهائية
 *      المنسوخة إلى `public/archive/`، تُفتح حيًّا من أيّ جهاز. لكلٍّ `path`.
 *   2. **رفعٌ حيّ** (`archive_documents` في Firestore) — يرفعه المالك في أيّ
 *      وقت؛ حمولته base64 (نصّ HTML أو PDF/صورة). لكلٍّ `fileData` أو `storageUrl`.
 *
 * الفكرة الحاكمة: الأرشيف **المصدر الأوّل المعتمد** للتقارير الدورية والمحاضر —
 * لا ملفّاتٌ متناثرة على سطح المكتب. لذا لكلّ وثيقةٍ **رقمٌ إشاريّ** وتاريخٌ
 * وتصنيف، وواحدةٌ تُعلَّم `primary` فتكون المرجع المعتمد لأحدث دورة.
 */

/** تصنيفا الأرشيف — يمليان التبويبات في الواجهة. */
export const ARCHIVE_CATEGORIES = {
  report: 'التقارير',
  minutes: 'محاضر الاجتماعات',
};

/** التصنيف معروفٌ أم لا (نردّ المجهول إلى «تقرير» فلا يسقط مُدخَل). */
export function categoryLabel(cat) {
  return ARCHIVE_CATEGORIES[cat] || ARCHIVE_CATEGORIES.report;
}

/**
 * يوحّد مُدخَل البذرة الثابتة إلى شكل العرض الموحّد.
 * البذرة تُفتح بمسارٍ ثابت (`path`) لا حمولة base64.
 */
export function normalizeSeed(entry = {}) {
  return {
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
 * لقطةٌ عدديّة للرأس: كم تقريرًا وكم محضرًا، وهل ثمّة مصدرٌ معتمد (primary).
 */
export function archiveSummary(list) {
  const all = list || [];
  const primary = all.find((x) => x.primary) || null;
  return {
    total: all.length,
    reports: byCategory(all, 'report').length,
    minutes: byCategory(all, 'minutes').length,
    live: all.filter((x) => x.source === 'live').length,
    primary,
  };
}
