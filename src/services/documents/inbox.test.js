/**
 * اختبارات صندوق المستندات (F5).
 *
 * تتحقّق من: عمر الحالة يُقاس من آخر نقلة لا من الإنشاء · المتأخّر يُكشف
 * بمهلة حالته والمنجَز لا يتأخّر أبدًا · «بانتظار اعتمادي» يحترم دور
 * المستخدم فلا يُغرَق بما لا يخصّه · الترتيب يقدّم المتأخّر ثم الأقدم ·
 * البحث يطبّع العربية ويشمل عنوان النوع · وCSV يهرّب ويحمل BOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STALE_DAYS,
  toMillis,
  ageInState,
  isStale,
  awaitingMyApproval,
  sortByUrgency,
  normalizeAr,
  filterDocs,
  inboxStats,
  toCsv,
  csvFileName,
  isSourceRecord,
  partyText,
  preOpeningNote,
  SINCE_OPENING_NOTE,
} from './inbox.js';
import { OPENING_DAY } from './actualWork.js';

const NOW = Date.parse('2026-08-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** يبني طابعًا بنمط Firestore (seconds) قبل `n` يومًا. */
const daysAgo = (n) => ({ seconds: Math.floor((NOW - n * DAY) / 1000) });

const doc = (over = {}) => ({
  id: 'd1',
  type: 'GRN',
  number: 'GRN-2026-0001',
  state: 'submitted',
  createdByName: 'أمين المخزن',
  createdAt: daysAgo(10),
  updatedAt: daysAgo(1),
  ...over,
});

// ═══════════ الوقت والعمر ═══════════

test('toMillis يقرأ صيغ الطوابع المختلفة ولا يخترع تاريخًا', () => {
  assert.equal(toMillis({ seconds: 1000 }), 1000000);
  assert.equal(toMillis({ toMillis: () => 555 }), 555);
  assert.equal(toMillis(new Date(NOW)), NOW);
  assert.equal(toMillis(NOW), NOW);
  assert.equal(toMillis('2026-08-01T12:00:00Z'), NOW);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('ليس تاريخًا'), null);
});

test('العمر يُقاس من آخر نقلة لا من الإنشاء', () => {
  // أُنشئ قبل 10 أيام لكنه انتقل لحالته الحالية قبل يوم واحد
  assert.equal(ageInState(doc(), NOW), 1);
  // بلا updatedAt يقع على createdAt
  assert.equal(ageInState({ createdAt: daysAgo(4) }, NOW), 4);
  assert.equal(ageInState({}, NOW), null, 'بلا تاريخ لا نفترض صفرًا');
});

test('المتأخّر يُكشف بمهلة حالته', () => {
  assert.equal(isStale(doc({ updatedAt: daysAgo(1) }), NOW), false, 'يوم واحد ضمن مهلة المُرسَل');
  assert.equal(isStale(doc({ updatedAt: daysAgo(5) }), NOW), true, 'خمسة أيام تتجاوز مهلة المُرسَل');
  assert.equal(isStale(doc({ state: 'approved', updatedAt: daysAgo(4) }), NOW), false, 'المعتمَد مهلته أوسع');
  assert.equal(isStale(doc({ state: 'approved', updatedAt: daysAgo(9) }), NOW), true);
  assert.equal(isStale(doc({ state: 'draft', updatedAt: daysAgo(10) }), NOW), false, 'المسودّة تُترك عمدًا');
  assert.equal(isStale(doc({ state: 'draft', updatedAt: daysAgo(20) }), NOW), true, 'لكنها بعد أسبوعين نُسيت');
});

test('🏁 المنجَز لا يتأخّر أبدًا مهما طال', () => {
  assert.equal(isStale(doc({ state: 'done', updatedAt: daysAgo(999) }), NOW), false);
  assert.equal(STALE_DAYS.done, undefined, 'لا مهلة للمنجَز أصلًا');
});

test('بلا تاريخ لا حكم بالتأخّر — لا نتّهم مستندًا بما لا نعرفه', () => {
  assert.equal(isStale({ state: 'submitted' }, NOW), false);
});

// ═══════════ بانتظار اعتمادي ═══════════

const QUEUE = [
  doc({ id: 'a', type: 'GRN', state: 'submitted' }),   // يعتمده مفتّش الجودة
  doc({ id: 'b', type: 'PO', state: 'submitted' }),    // يعتمده المدير المالي
  doc({ id: 'c', type: 'GP', state: 'submitted' }),    // يعتمده ضابط البوابة
  doc({ id: 'd', type: 'GRN', state: 'draft' }),       // ليس مُرسَلًا أصلًا
];

test('«بانتظار اعتمادي» يحترم الدور فلا يُغرَق المستخدم بما لا يخصّه', () => {
  const qc = awaitingMyApproval(QUEUE, { role: 'qc_inspector' });
  assert.deepEqual(qc.map((d) => d.id), ['a'], 'مفتّش الجودة لا يرى أوامر الشراء');

  const gate = awaitingMyApproval(QUEUE, { role: 'gate_officer' });
  assert.deepEqual(gate.map((d) => d.id), ['c'], 'ضابط البوابة يرى تصاريح الخروج وحدها');

  const finance = awaitingMyApproval(QUEUE, { role: 'finance_manager' });
  assert.deepEqual(finance.map((d) => d.id), ['b']);
});

test('الأدمن يرى كل مُرسَل — والمسودّة ليست بانتظار أحد', () => {
  const admin = awaitingMyApproval(QUEUE, { role: 'admin' });
  assert.deepEqual(admin.map((d) => d.id).sort(), ['a', 'b', 'c']);
  assert.ok(!admin.some((d) => d.state === 'draft'));
});

test('دور بلا صلاحية اعتماد لا يرى شيئًا', () => {
  assert.deepEqual(awaitingMyApproval(QUEUE, { role: 'viewer' }), []);
  assert.deepEqual(awaitingMyApproval(QUEUE, {}), []);
});

// ═══════════ الترتيب ═══════════

test('الترتيب يقدّم المتأخّر، ثم الأقدم انتظارًا — لا الأحدث', () => {
  const list = [
    doc({ id: 'fresh', updatedAt: daysAgo(0) }),
    doc({ id: 'stale-old', updatedAt: daysAgo(9) }),
    doc({ id: 'stale-new', updatedAt: daysAgo(3) }),
    doc({ id: 'ok', updatedAt: daysAgo(1) }),
  ];
  assert.deepEqual(
    sortByUrgency(list, NOW).map((d) => d.id),
    ['stale-old', 'stale-new', 'ok', 'fresh']
  );
});

// ═══════════ البحث والتصفية ═══════════

test('التطبيع العربي يوحّد الهمزات والتاء المربوطة', () => {
  assert.equal(normalizeAr('الأصناف'), normalizeAr('الاصناف'));
  assert.equal(normalizeAr('مذكّرة'), 'مذكره');
  assert.equal(normalizeAr('GRN'), 'grn');
});

test('البحث يشمل عنوان النوع العربي لا رمزه فقط', () => {
  const list = [doc({ id: 'a', type: 'GRN' }), doc({ id: 'b', type: 'PO', number: 'PO-2026-0001' })];
  assert.deepEqual(filterDocs(list, { q: 'استلام' }).map((d) => d.id), ['a'], 'الموظّف يكتب «استلام» لا GRN');
  assert.deepEqual(filterDocs(list, { q: 'PO-2026' }).map((d) => d.id), ['b']);
  assert.deepEqual(filterDocs(list, { q: 'امين' }).map((d) => d.id).sort(), ['a', 'b'], 'البحث بالاسم مطبَّعًا');
  assert.equal(filterDocs(list, { q: 'لا شيء' }).length, 0);
});

test('التصفية بالنوع والحالة تتراكب مع البحث', () => {
  const list = [
    doc({ id: 'a', type: 'GRN', state: 'submitted' }),
    doc({ id: 'b', type: 'GRN', state: 'done' }),
    doc({ id: 'c', type: 'PO', state: 'submitted' }),
  ];
  assert.deepEqual(filterDocs(list, { type: 'GRN' }).map((d) => d.id), ['a', 'b']);
  assert.deepEqual(filterDocs(list, { state: 'submitted' }).map((d) => d.id), ['a', 'c']);
  assert.deepEqual(filterDocs(list, { type: 'GRN', state: 'submitted' }).map((d) => d.id), ['a']);
  assert.equal(filterDocs(list, {}).length, 3, 'بلا مرشّحات تمرّ كلّها');
});

// ═══════════ الإحصاءات ═══════════

test('اللقطة تعدّ الحالات والمتأخّر وغير المرقَّم', () => {
  const list = [
    doc({ state: 'draft', number: null, updatedAt: daysAgo(1) }),
    doc({ state: 'submitted', updatedAt: daysAgo(9) }),
    doc({ state: 'approved', updatedAt: daysAgo(1) }),
    doc({ state: 'done', updatedAt: daysAgo(99) }),
  ];
  const s = inboxStats(list, NOW);
  assert.equal(s.total, 4);
  assert.deepEqual([s.draft, s.submitted, s.approved, s.done], [1, 1, 1, 1]);
  assert.equal(s.stale, 1, 'المنجَز القديم لا يُحسب متأخّرًا');
  assert.equal(s.unnumbered, 1);
});

// ═══════════ التصدير ═══════════

test('CSV يحمل BOM — وإلا وصلت العربية مشوّهة في إكسل', () => {
  const csv = toCsv([doc()], NOW);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'BOM مفقود');
  assert.ok(csv.includes('الرقم'));
  assert.ok(csv.includes('GRN-2026-0001'));
});

test('CSV يهرّب علامات الاقتباس والفواصل فلا تنكسر الأعمدة', () => {
  const csv = toCsv([doc({ createdByName: 'اسم, فيه "اقتباس"' })], NOW);
  assert.ok(csv.includes('"اسم, فيه ""اقتباس"""'));
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2, 'صفّان: العناوين والبيانات');
});

test('CSV يترجم الحالة والنوع للعربية ويكتب التأخّر صراحةً', () => {
  const csv = toCsv([doc({ state: 'submitted', updatedAt: daysAgo(9) })], NOW);
  assert.ok(csv.includes('بانتظار الاعتماد'));
  assert.ok(csv.includes('مذكرة استلام البضائع وفحص الجودة'));
  assert.ok(csv.includes('"نعم"'), 'عمود المتأخّر');
});

test('اسم الملف يحمل التبويب والتاريخ', () => {
  assert.equal(csvFileName('بانتظار-اعتمادي', NOW), 'BHOME-مستندات-بانتظار-اعتمادي-2026-08-01.csv');
});

test('قائمة فارغة لا تنهار', () => {
  assert.deepEqual(awaitingMyApproval([], {}), []);
  assert.deepEqual(sortByUrgency(null, NOW), []);
  assert.equal(inboxStats(null, NOW).total, 0);
  assert.ok(toCsv([], NOW).includes('الرقم'));
});

// ═══════════ ‹ODOO-ORD› سجلّاتُ أودو لا تتأخّر ═══════════

test('★★ أمرُ أودو المعتمَدُ لا يصير «متأخّرًا» — سجلٌّ راقدٌ لا ورقةٌ نُسيت', () => {
  for (const type of ['OSO', 'OPO']) {
    const order = doc({ type, state: 'approved', updatedAt: daysAgo(30), header: { sourceSystem: 'Odoo' } });
    assert.equal(isSourceRecord(order), true);
    assert.equal(isStale(order, NOW), false, `${type}: معتمَدٌ منذ ثلاثين يومًا ولا ينتظر أحدًا هنا`);
  }
  // ومستندُ المصدر المنجَز كذلك — والحكمُ من المخطّط (`sourcePosted`) لا من حالته.
  for (const type of ['SRI', 'SRO', 'SXO', 'SXI', 'SRA']) {
    assert.equal(isStale(doc({ type, state: 'approved', updatedAt: daysAgo(30) }), NOW), false, type);
  }
  // والضابط: أمرُ الشراء المحلّيُّ المعتمَدُ ما زال يتأخّر كما كان.
  assert.equal(isSourceRecord(doc({ type: 'PO' })), false);
  assert.equal(isStale(doc({ type: 'PO', state: 'approved', updatedAt: daysAgo(9) }), NOW), true);
  assert.equal(isSourceRecord(null), false);
});

test('★ الفرزُ بالإلحاح لا يقدّم أمرَ أودو على مستندٍ متأخّرٍ حقًّا', () => {
  const order = doc({ id: 'oso', type: 'OSO', state: 'approved', updatedAt: daysAgo(30) });
  const late = doc({ id: 'late', type: 'GRN', state: 'submitted', updatedAt: daysAgo(5) });
  assert.deepEqual(sortByUrgency([order, late], NOW).map((d) => d.id), ['late', 'oso']);
  assert.equal(inboxStats([order, late], NOW).stale, 1);
});

test('★ الطرفُ partner أودو أوّلًا — لا كودُ المستودع', () => {
  assert.equal(partyText({ header: { partner: 'صيدلية الوسط', partnerCode: 'C042' } }, 'WH001'), 'صيدلية الوسط (C042)');
  assert.equal(partyText({ header: { partner: 'صيدلية الوسط' } }, 'WH001'), 'صيدلية الوسط');
  assert.equal(partyText({ header: { partner: 'C042', partnerCode: 'C042' } }), 'C042', 'لا تكرارَ للرمز');
  assert.equal(partyText({ header: { supplier: 'الريشة' } }, 'الريشة (S1)'), 'الريشة (S1)', 'المحلّيُّ كما أعلنته partyFields');
  assert.equal(partyText({ header: { partnerCode: 'C042' } }), 'C042');
  assert.equal(partyText(null), '');
});

test('★★ ما أُخفي من التجارب يُقال بعدده وبعربيّةٍ صحيحة — والصفرُ لا سطرَ له', () => {
  assert.equal(preOpeningNote(0), '');
  assert.equal(preOpeningNote(-3), '');
  assert.equal(preOpeningNote(undefined), '');
  assert.match(preOpeningNote(1), /^أُخفي مستندٌ واحد من تجارب ما قبل الافتتاح/);
  assert.match(preOpeningNote(2), /^أُخفي مستندان من/);
  assert.match(preOpeningNote(5), /^أُخفي 5 مستندات من/);
  assert.match(preOpeningNote(52), /^أُخفي 52 مستندًا من/);
  assert.match(preOpeningNote(52, { open: true }), /^أُخفي 52 مستندًا مفتوحًا من/);
  assert.match(preOpeningNote(1, { open: true }), /^أُخفي مستندٌ مفتوحٌ واحد من/);
  assert.ok(preOpeningNote(7).includes(OPENING_DAY), 'الحدُّ يُعلَن بتاريخه');
  assert.ok(preOpeningNote(7).includes('لم يُحذف'), 'الإخفاءُ ليس حذفًا');
  assert.ok(SINCE_OPENING_NOTE.includes(OPENING_DAY));
});
