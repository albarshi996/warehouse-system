/**
 * اختبارات الأرشيف الدوريّ الخالصة — تُغني عن فتح متصفّح لصفحة محميّة.
 *
 * تتحقّق من: التحقّق يقبل الصيغ الأربع و**يوجّه** الحمولة بالحجم · الرقم
 * الإشاريّ يقبل `BFP-SCM-PR` ويرفض العبث · الدمج يجمع البذرة والحيّ ويرتّب
 * بالأحدث · الملخّص يعدّ التصنيفين ويلتقط المصدر المعتمد · **دورة الحياة**
 * تُحسَب من تاريخ الانتهاء ولا تُخزَّن · **البحث العربيّ** يتجاوز التشكيل وصور
 * الهمزة · و**التوافق الرجعيّ**: وثيقةٌ كُتبت قبل هذه الطبقة تُقرأ بلا نقصان.
 *
 * كلّ اختبارٍ يمرّر `today` صراحةً — فلا يتحوّل أخضرُ اليوم إلى أحمر غدًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateArchiveFile,
  isValidRefNumber,
  formatOf,
  safeFileName,
  inlineLimitFor,
  MAX_BINARY_BYTES,
  MAX_HTML_BYTES,
  MAX_SOURCE_BYTES,
  ACCEPTED_ARCHIVE_TYPES,
} from './archiveFile.js';
import {
  normalizeSeed,
  normalizeLive,
  mergeArchive,
  byCategory,
  filterArchive,
  archiveSummary,
  categoryLabel,
  byDateDesc,
  docStatus,
  daysUntil,
  normalizeArabic,
  matchesQuery,
  expiringSoon,
  expiredDocs,
  statusLabel,
  confidentialityLabel,
  trackEntry,
  STORED_STATUSES,
  DERIVED_STATUSES,
  EXPIRY_WARNING_DAYS,
} from './archiveModel.js';
import { ARCHIVE_SEED } from './archiveSeed.js';

/** يومٌ ثابت لكلّ الاختبارات الزمنيّة. */
const T = '2026-08-19';

/** ملفٌّ وهميّ — `validateArchiveFile` لا يحتاج متصفّحًا. */
const file = (name, size, type) => ({ name, size, type });

// ═══════════ التحقّق من الملفّ وتوجيهه ═══════════

test('يقبل الصيغ الأربع المعتمدة ويوسمها', () => {
  const cases = [
    ['application/pdf', 'PDF', 'pdf'],
    ['text/html', 'HTML', 'html'],
    ['image/jpeg', 'JPG', 'image'],
    ['image/png', 'PNG', 'image'],
  ];
  for (const [type, kind, format] of cases) {
    const r = validateArchiveFile(file('x', 1000, type));
    assert.ok(r.ok, `${type} يجب أن يُقبل`);
    assert.equal(r.kind, kind);
    assert.equal(r.format, format);
  }
});

test('يرفض الصيغة غير المدعومة والملفّ الفارغ وغياب الملفّ', () => {
  assert.equal(validateArchiveFile(null).ok, false);
  assert.equal(validateArchiveFile(file('a.docx', 10, 'application/msword')).ok, false);
  assert.equal(validateArchiveFile(file('a.pdf', 0, 'application/pdf')).ok, false);
});

test('الصغير يبقى داخل الوثيقة، والأكبر يُوجَّه إلى المخزن لا يُرفض', () => {
  const small = validateArchiveFile(file('a.pdf', 500 * 1024, 'application/pdf'));
  assert.equal(small.route, 'inline');

  const big = validateArchiveFile(file('b.pdf', MAX_BINARY_BYTES + 1024, 'application/pdf'));
  assert.ok(big.ok, 'ما تجاوز الحدّ الداخليّ لم يعد مرفوضًا — صار له مسارٌ ثانٍ');
  assert.equal(big.route, 'storage');
});

test('حدّ الـHTML أوسع من حدّ الـPDF — نفس الحجم ومسارٌ مختلف', () => {
  const mid = MAX_BINARY_BYTES + 1024;
  assert.ok(mid < MAX_HTML_BYTES, 'الاختبار يفترض الحدّ الثنائيّ أصغر');
  assert.equal(validateArchiveFile(file('r.pdf', mid, 'application/pdf')).route, 'storage');
  assert.equal(validateArchiveFile(file('r.html', mid, 'text/html')).route, 'inline');
  assert.equal(inlineLimitFor('text/html'), MAX_HTML_BYTES);
  assert.equal(inlineLimitFor('application/pdf'), MAX_BINARY_BYTES);
});

test('ما فوق السقف المطلق مرفوضٌ قبل قراءته', () => {
  const r = validateArchiveFile(file('huge.pdf', MAX_SOURCE_BYTES + 1, 'application/pdf'));
  assert.equal(r.ok, false);
  assert.match(r.error, /أكبر من أن يُؤرشَف/);
});

test('كل صيغة مقبولة لها وسمٌ في الخريطة، وformatOf يوحّد', () => {
  assert.equal(Object.keys(ACCEPTED_ARCHIVE_TYPES).length, 4);
  assert.equal(formatOf('image/png'), 'image');
  assert.equal(formatOf('application/pdf'), 'pdf');
  assert.equal(formatOf('text/html'), 'html');
  assert.equal(formatOf('application/zip'), 'other');
});

test('safeFileName يُسقط فواصل المسار ويُبقي العربيّة ولا يُعيد فارغًا', () => {
  assert.equal(safeFileName('تقرير/W31?.pdf'), 'تقرير-W31-.pdf');
  assert.equal(safeFileName(''), 'file');
  assert.equal(safeFileName(null), 'file');
  assert.ok(safeFileName('x'.repeat(500)).length <= 120, 'الاسم الطويل يُقصّ');
});

// ═══════════ الرقم الإشاريّ ═══════════

test('الرقم الإشاريّ: يقبل BFP-SCM-PR والفراغ ويرفض العبث', () => {
  assert.ok(isValidRefNumber('BFP-SCM-PR-2026-005'));
  assert.ok(isValidRefNumber('MOM-2026-0001'));
  assert.ok(isValidRefNumber(''), 'الفراغ مقبول — الرقم اختياريّ');
  assert.ok(!isValidRefNumber('bfp-2026-5'), 'الحروف الصغيرة مرفوضة');
  assert.ok(!isValidRefNumber('BFP-SCM-PR-26-5'), 'السنة أربع خانات');
  assert.ok(!isValidRefNumber('لا رقم'));
});

// ═══════════ دورة حياة الوثيقة ═══════════

test('المسودّة تبقى مسودّة مهما مضى أجلها', () => {
  assert.equal(docStatus({ status: 'draft', expiry: '2020-01-01' }, T), 'draft');
});

test('بلا تاريخ انتهاء تبقى الحالة المخزَّنة كما هي', () => {
  assert.equal(docStatus({ status: 'approved' }, T), 'approved');
  assert.equal(docStatus({ status: 'active' }, T), 'active');
});

test('الانتهاء يعلو الاعتماد — المعتمدة التي مضى أجلها منتهية', () => {
  assert.equal(docStatus({ status: 'approved', expiry: '2026-08-18' }, T), 'expired');
});

test('حدّ التنبيه: ٣٠ يومًا داخله و٣١ خارجه', () => {
  assert.equal(EXPIRY_WARNING_DAYS, 30);
  assert.equal(docStatus({ status: 'active', expiry: '2026-09-18' }, T), 'expiring', '+30');
  assert.equal(docStatus({ status: 'active', expiry: '2026-09-19' }, T), 'active', '+31');
});

test('اليوم نفسه «ينتهي قريبًا» لا «منتهية»', () => {
  assert.equal(docStatus({ status: 'active', expiry: T }, T), 'expiring');
});

test('الحالة المخزَّنة المجهولة تُردّ إلى نشط — ولا تُقبل حالةٌ مشتقّة', () => {
  assert.equal(docStatus({ status: 'مجهولة' }, T), 'active');
  assert.equal(docStatus({ status: 'expired' }, T), 'active', 'المشتقّة تُحسَب ولا تُخزَّن');
  assert.ok(!('expired' in STORED_STATUSES));
  assert.ok('expired' in DERIVED_STATUSES);
});

test('daysUntil يوجب للمستقبل ويسلب للماضي ويردّ null بلا تاريخ', () => {
  assert.equal(daysUntil('2026-08-29', T), 10);
  assert.equal(daysUntil('2026-08-09', T), -10);
  assert.equal(daysUntil('', T), null);
  assert.equal(daysUntil('ليس تاريخًا', T), null);
});

test('التسميات تُعرض ولا تُفرغ المجهول', () => {
  assert.equal(statusLabel('expiring'), 'ينتهي قريبًا');
  assert.equal(statusLabel('مجهول'), 'مجهول');
  assert.equal(confidentialityLabel('top_secret'), 'سرّي للغاية');
  assert.equal(confidentialityLabel(''), 'عام', 'الغائب عامّ');
});

// ═══════════ البحث العربيّ ═══════════

test('normalizeArabic يوحّد التشكيل وصور الهمزة والتاء المربوطة', () => {
  assert.equal(normalizeArabic('سرّي للغاية'), normalizeArabic('سري للغايه'));
  assert.equal(normalizeArabic('الإعتماد'), normalizeArabic('الاعتماد'));
  assert.equal(normalizeArabic('مُسْتَخْلَص'), normalizeArabic('مستخلص'));
  assert.equal(normalizeArabic('مصطفــى'), normalizeArabic('مصطفي'), 'التطويل والألف المقصورة');
});

test('البحث يشترط كلّ الكلمات لا إحداها', () => {
  const doc = { title: 'التقرير الأسبوعيّ الشامل' };
  assert.ok(matchesQuery(doc, 'شامل تقرير'));
  assert.ok(!matchesQuery(doc, 'شامل مفقود'));
});

test('البحث يمسح الكلمات المفتاحية والنصّ المستخرَج لا العنوان وحده', () => {
  assert.ok(matchesQuery({ keywords: 'إيجار، مخزن' }, 'ايجار'));
  assert.ok(matchesQuery({ ocrText: 'عقد إيجار مخزن بنغازي' }, 'بنغازي'));
  assert.ok(matchesQuery({ refNumber: 'BFP-SCM-PR-2026-006' }, 'BFP-SCM-PR-2026-006'));
});

test('الاستعلام الفارغ يطابق الكلّ', () => {
  assert.ok(matchesQuery({ title: 'أيّ شيء' }, ''));
  assert.ok(matchesQuery({}, '   '));
});

// ═══════════ الدمج والتصنيف ═══════════

const SEED = [
  { id: 's1', category: 'report', refNumber: 'BFP-SCM-PR-2026-002', title: 'تقرير قديم', date: '2026-07-10', format: 'html', path: '/archive/a.html' },
  { id: 's2', category: 'minutes', refNumber: 'BFP-SCM-PR-2026-004', title: 'محضر', date: '2026-07-20', format: 'pdf', path: '/archive/m.pdf', primary: true },
];

const LIVE = {
  L1: { id: 'L1', category: 'report', title: 'تقرير حيّ أحدث', date: '2026-08-01', format: 'html', fileData: 'data:text/html;base64,PGgxPg==' },
  bad: null,
};

test('normalizeSeed يوحّد البذرة بمسارٍ ثابت لا حمولة', () => {
  const n = normalizeSeed(SEED[0]);
  assert.equal(n.source, 'seed');
  assert.equal(n.editable, false);
  assert.equal(n.path, '/archive/a.html');
  assert.equal(n.fileData, null);
  assert.equal(n.category, 'report');
});

test('normalizeLive يوحّد المرفوع بحمولةٍ وقابليّة تحرير', () => {
  const n = normalizeLive(LIVE.L1);
  assert.equal(n.source, 'live');
  assert.equal(n.editable, true);
  assert.ok(n.fileData.startsWith('data:'));
  assert.equal(n.storageUrl, null, 'بلا مخزنٍ لهذه الوثيقة');
});

test('الوثيقة المرفوعة إلى المخزن تحمل رابطها لا حمولتها', () => {
  const n = normalizeLive({ id: 'L2', storageUrl: 'https://x/y.pdf', fileName: 'y.pdf' });
  assert.equal(n.fileData, null);
  assert.equal(n.storageUrl, 'https://x/y.pdf');
});

test('mergeArchive يجمع البذرة والحيّ ويرتّب بالأحدث ويُسقط الفارغ', () => {
  const list = mergeArchive(SEED, LIVE);
  assert.equal(list.length, 3, 'بذرتان + حيّ واحد (الفارغ مُسقَط)');
  assert.equal(list[0].id, 'L1', 'الأحدث تاريخًا أولًا');
  assert.equal(list[list.length - 1].id, 's1', 'الأقدم آخرًا');
});

test('التصنيف يفصل التقارير عن المحاضر', () => {
  const list = mergeArchive(SEED, LIVE);
  assert.equal(byCategory(list, 'report').length, 2);
  assert.equal(byCategory(list, 'minutes').length, 1);
  assert.equal(categoryLabel('minutes'), 'محاضر الاجتماعات');
  assert.equal(categoryLabel('مجهول'), 'التقارير', 'المجهول يردّ للتقارير');
});

test('الملخّص يعدّ التصنيفين ويلتقط المصدر المعتمد', () => {
  const s = archiveSummary(mergeArchive(SEED, LIVE), T);
  assert.equal(s.total, 3);
  assert.equal(s.reports, 2);
  assert.equal(s.minutes, 1);
  assert.equal(s.live, 1);
  assert.ok(s.primary && s.primary.id === 's2', 'المصدر المعتمد هو المُعلَّم primary');
});

test('الفرز التنازليّ يضع الفارغ تاريخًا في الآخر', () => {
  const arr = [{ date: '' }, { date: '2026-08-01' }, { date: '2026-07-01' }].sort(byDateDesc);
  assert.equal(arr[0].date, '2026-08-01');
  assert.equal(arr[2].date, '', 'بلا تاريخ في الآخر');
});

// ═══════════ المصفاة والتنبيه ═══════════

const LIFE = [
  normalizeLive({ id: 'a', category: 'report', title: 'عقد إيجار', type: 'عقد', expiry: '2026-08-25', confidential: 'secret' }),
  normalizeLive({ id: 'b', category: 'report', title: 'ترخيص نشاط', type: 'ترخيص', expiry: '2026-09-10' }),
  normalizeLive({ id: 'c', category: 'minutes', title: 'محضرٌ منتهٍ', expiry: '2026-01-01' }),
  normalizeLive({ id: 'd', category: 'report', title: 'مسودّة عقد', type: 'عقد', status: 'draft', expiry: '2026-08-20' }),
];

test('filterArchive يجمع التصنيف والحالة والسرّية والنوع ونصّ البحث', () => {
  assert.equal(filterArchive(LIFE, {}, T).length, 4, 'بلا معايير لا تصفية');
  assert.equal(filterArchive(LIFE, { category: 'report' }, T).length, 3);
  assert.equal(filterArchive(LIFE, { status: 'expired' }, T).map((d) => d.id).join(), 'c');
  assert.equal(filterArchive(LIFE, { status: 'draft' }, T).map((d) => d.id).join(), 'd');
  assert.equal(filterArchive(LIFE, { confidential: 'secret' }, T).map((d) => d.id).join(), 'a');
  assert.equal(filterArchive(LIFE, { type: 'عقد' }, T).length, 2);
  assert.equal(filterArchive(LIFE, { type: 'عقد', query: 'ايجار' }, T).map((d) => d.id).join(), 'a');
});

test('expiringSoon يرتّب بالأقرب انتهاءً ويُسقط المسودّة والمنتهي', () => {
  const soon = expiringSoon(LIFE, EXPIRY_WARNING_DAYS, T);
  assert.deepEqual(soon.map((d) => d.id), ['a', 'b'], 'الأقرب أوّلًا، بلا مسودّةٍ ولا منتهٍ');
  assert.deepEqual(expiredDocs(LIFE, T).map((d) => d.id), ['c']);
});

test('الملخّص يعدّ ما ينتهي قريبًا وما انتهى', () => {
  const s = archiveSummary(LIFE, T);
  assert.equal(s.expiring, 2);
  assert.equal(s.expired, 1);
});

test('مُدخَل التتبّع يحمل العملية والفاعل ووقتًا نصّيًّا', () => {
  const e = trackEntry('اعتماد', 'محمد', '2026-08-19T10:00:00.000Z');
  assert.deepEqual(e, { action: 'اعتماد', byName: 'محمد', at: '2026-08-19T10:00:00.000Z' });
  assert.equal(trackEntry('إضافة', '', '2026-08-19T10:00:00.000Z').byName, 'غير معروف', 'الفاعل المجهول لا يُترك فارغًا');
});

// ═══════════ التوافق الرجعيّ ═══════════

test('وثيقةٌ كُتبت قبل طبقة دورة الحياة تُقرأ نشطةً عامّةً بلا انتهاء', () => {
  const old = normalizeLive({ id: 'old', title: 'وثيقة قديمة', date: '2026-01-01' });
  assert.equal(old.status, 'active');
  assert.equal(old.confidential, 'public');
  assert.equal(old.expiry, '');
  assert.deepEqual(old.tracking, []);
  assert.equal(old.versionCount, 0);
  assert.equal(docStatus(old, T), 'active', 'لا تسقط ولا تُعرض منتهية');
});

test('البذرة القائمة تمرّ بالنموذج الموسَّع بحقولها الأصلية سليمة', () => {
  assert.ok(ARCHIVE_SEED.length > 0, 'البذرة ليست فارغة');
  for (const entry of ARCHIVE_SEED) {
    const n = normalizeSeed(entry);
    assert.equal(n.id, entry.id);
    assert.equal(n.refNumber, entry.refNumber || '');
    assert.equal(n.path, entry.path || '');
    assert.equal(n.source, 'seed');
    assert.equal(n.editable, false);
    assert.ok(['report', 'minutes'].includes(n.category));
    assert.equal(docStatus(n, T), 'active', 'البذرة بلا أجلٍ فتبقى نشطة');
  }
});
