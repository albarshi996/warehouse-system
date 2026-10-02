/**
 * اختبارات تقرير المستندات — التاريخ والطرف والرقم.
 *
 * الحرّاس هنا نقضيّة: كلُّ قاعدةٍ في رأس `docReport.js` لها اختبارٌ **يفشل
 * لو أُزيلت القاعدة** — لا اختبارٌ يؤكّد ما يفعله الكود أصلًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DATE_BASES,
  DEFAULT_DATE_BASIS,
  isDateBasis,
  localDay,
  eventDay,
  dayOfDoc,
  dayBasisUsed,
  partiesOf,
  partyLabel,
  EMPTY_CRITERIA,
  inDateRange,
  filterReport,
  hasActiveCriteria,
  criteriaSummary,
  rangeStamp,
  groupReport,
  REPORT_COLUMNS,
  reportRow,
  reportRows,
} from './docReport.js';
import { PARTY_FIELDS } from './partyFields.js';
import { fieldsByClass } from './timeFields.js';

/** طابع Firestore مزيّف — بالشكل الذي يقرأه `toMillis`. */
const ts = (ms) => ({ toMillis: () => ms });

/** يوم محلّيّ من أجزاءٍ محلّيّة — المرجع الذي نقيس عليه بلا UTC. */
function localMs(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min).getTime();
}

const GRN = (over = {}) => ({
  id: 'd1',
  type: 'GRN',
  state: 'approved',
  number: 'GRN-2026-000012',
  createdByName: 'أحمد الشريف',
  createdAt: ts(localMs(2026, 9, 10)),
  updatedAt: ts(localMs(2026, 9, 12)),
  header: { receivedAt: '2026-09-08', supplier: 'مخابز الزاوية', supplierCode: 'SUP-004' },
  lines: [{ sku: 'A-1', qty: 5 }],
  ...over,
});

/* ═══════════════ أساس التاريخ ═══════════════ */

test('أسس التاريخ ثلاثةٌ معلَنة، وتاريخ الواقعة هو الافتراض', () => {
  assert.deepEqual(DATE_BASES.map((b) => b.id), ['event', 'created', 'updated']);
  assert.equal(DEFAULT_DATE_BASIS, 'event');
  // ★ الافتراض ليس تفصيلًا: لو كان `created` لأخفى استلامَ أمسِ المسجَّلَ اليوم.
  assert.ok(isDateBasis('event') && isDateBasis('created') && isDateBasis('updated'));
  assert.equal(isDateBasis('whatever'), false);
  for (const b of DATE_BASES) assert.ok(b.label && b.hint, `${b.id} بلا عنوانٍ أو شرح`);
});

test('★★★ اليومُ محلّيٌّ لا UTC — ومستندُ الواحدة صباحًا لا يُنسب إلى أمس', () => {
  // ليبيا على UTC+2. الساعةُ 00:30 محلّيًّا من اليوم العاشر هي 22:30 من التاسع
  // بـUTC — فـ`toISOString().slice(0,10)` يُعيد التاسع. هذا هو العطب المحروس.
  const ms = localMs(2026, 9, 10, 0, 30);
  assert.equal(localDay(ms), '2026-09-10');

  // والنقض: لو كانت الدالّة تستعمل toISOString لافترقت عنها في منطقةٍ موجبة.
  const utcDay = new Date(ms).toISOString().slice(0, 10);
  const tzOffsetMin = new Date(ms).getTimezoneOffset();
  if (tzOffsetMin < 0) {
    // منطقةٌ شرق غرينتش (ليبيا منها) — الفرقُ يجب أن يظهر.
    assert.notEqual(localDay(ms), utcDay, 'المنطقةُ موجبةٌ ومع ذلك طابَق UTC — الدالّةُ لا تقرأ الأجزاء المحلّيّة');
  }
});

test('localDay يرفض ما لا يُقرأ ولا يخترع يومًا', () => {
  assert.equal(localDay(null), '');
  assert.equal(localDay(undefined), '');
  assert.equal(localDay(NaN), '');
  assert.equal(localDay(Infinity), '');
});

test('★★ ختمُ الواقعة يُقرأ من سجلّ الأزمنة لا من قائمةٍ محلّيّة', () => {
  // `GRN` ختمُه `receivedAt` بحسب TIME_FIELD_MAP — نثبت أنّ الوحدة تقرأ منه.
  assert.deepEqual(fieldsByClass('GRN', 'event'), ['receivedAt']);
  assert.equal(eventDay(GRN()), '2026-09-08');

  // ونوعٌ بلا ختمٍ مصنَّف لا يُخترع له تاريخ.
  assert.equal(eventDay({ type: 'NOPE', header: { someDate: '2026-01-01' } }), '');
  assert.equal(eventDay({ type: 'GRN', header: {} }), '');
});

test('dayOfDoc يقرأ الأساس المطلوب — والثلاثة تختلف فعلًا', () => {
  const d = GRN();
  assert.equal(dayOfDoc(d, 'event'), '2026-09-08');
  assert.equal(dayOfDoc(d, 'created'), '2026-09-10');
  assert.equal(dayOfDoc(d, 'updated'), '2026-09-12');
  // ★ ثلاثةُ أيّامٍ مختلفة لمستندٍ واحد — وهذا سببُ وجود الأساس أصلًا.
  assert.equal(new Set([dayOfDoc(d, 'event'), dayOfDoc(d, 'created'), dayOfDoc(d, 'updated')]).size, 3);
});

test('★★ الواقعةُ الغائبة تتراجع إلى الإنشاء — ولا تسقط من التقرير صامتةً', () => {
  const noStamp = GRN({ header: { supplier: 'س' } });
  assert.equal(eventDay(noStamp), '');
  // التراجع يقع...
  assert.equal(dayOfDoc(noStamp, 'event'), '2026-09-10');
  // ...ويُعلَن، فلا يكون صامتًا.
  assert.equal(dayBasisUsed(noStamp, 'event'), 'created');
  assert.equal(dayBasisUsed(GRN(), 'event'), 'event');
  assert.equal(dayBasisUsed(GRN(), 'updated'), 'updated');
});

test('الأساسُ المجهول يرتدّ إلى الافتراض ولا يُسقط التصفية', () => {
  const rows = filterReport([GRN()], { basis: 'nonsense', from: '2026-09-08', to: '2026-09-08' });
  assert.equal(rows.length, 1, 'الأساسُ المجهول عُومل كأساسٍ حقيقيٍّ فأسقط الصفّ');
});

/* ═══════════════ الطرف ═══════════════ */

test('★★★ الطرفُ يُقرأ من PARTY_FIELDS — فلا تنحرف قائمةٌ مكرّرة', () => {
  // الحارس: كلُّ مصدرٍ معلَنٍ في PARTY_FIELDS يجب أن يجده `partiesOf` حين
  // يُملأ حقلُه. لو أُضيف حقلُ طرفٍ سادس غدًا ونُسي هنا — يسقط هذا.
  const sources = new Set(Object.values(PARTY_FIELDS).map((d) => d.source));
  for (const decl of Object.values(PARTY_FIELDS)) {
    const doc = { type: 'GRN', header: { [decl.codeKey]: 'X-1' } };
    const found = partiesOf(doc);
    assert.equal(found.length, 1, `الحقل ${decl.codeKey} لم يُقرأ طرفًا`);
    assert.equal(found[0].source, decl.source);
  }
  assert.ok(sources.size >= 5, 'عددُ المصادر انحدر — راجع PARTY_FIELDS');
});

test('★★ المورّدُ طرفٌ واحدٌ لا طرفان — الرمزُ والاسمُ قرينان', () => {
  const parties = partiesOf(GRN());
  assert.equal(parties.length, 1, 'supplier و supplierCode حُسبا طرفين');
  assert.equal(parties[0].code, 'SUP-004');
  assert.equal(parties[0].name, 'مخابز الزاوية');
});

test('سطرُ الطرف يجمع الاسم والرمز، ويخلو لمن لا طرفَ له', () => {
  assert.equal(partyLabel(GRN()), 'مخابز الزاوية (SUP-004)');
  // رمزٌ بلا اسم.
  assert.equal(partyLabel({ type: 'GRN', header: { supplierCode: 'SUP-009' } }), 'SUP-009');
  // اسمٌ بلا رمز.
  assert.equal(partyLabel({ type: 'GRN', header: { supplier: 'مورّد نقديّ' } }), 'مورّد نقديّ');
  // ولا تكرار حين يتطابقان.
  assert.equal(partyLabel({ type: 'GRN', header: { supplier: 'س', supplierCode: 'س' } }), 'س');
  // والفراغُ فراغٌ — لا «—» ولا «غير معروف».
  assert.equal(partyLabel({ type: 'ADJ', header: {} }), '');
  assert.equal(partyLabel(null), '');
});

test('العميلُ يُقرأ كما المورّد — ومستندُ البيع له طرفُه', () => {
  const inv = { type: 'INV', header: { customer: 'بقالة النور', customerCode: 'CUS-77' } };
  assert.equal(partyLabel(inv), 'بقالة النور (CUS-77)');
});

/* ═══════════════ النطاق الزمنيّ ═══════════════ */

test('النطاقُ شاملٌ للطرفين — ويومٌ واحدٌ في الحدّين يعني ذلك اليوم', () => {
  assert.equal(inDateRange('2026-09-08', '2026-09-08', '2026-09-08'), true);
  assert.equal(inDateRange('2026-09-08', '2026-09-01', '2026-09-30'), true);
  assert.equal(inDateRange('2026-09-01', '2026-09-01', '2026-09-30'), true);
  assert.equal(inDateRange('2026-09-30', '2026-09-01', '2026-09-30'), true);
  assert.equal(inDateRange('2026-08-31', '2026-09-01', '2026-09-30'), false);
  assert.equal(inDateRange('2026-10-01', '2026-09-01', '2026-09-30'), false);
});

test('حدٌّ واحدٌ يكفي — ومن لا حدَّ له يمرّ كلُّه', () => {
  assert.equal(inDateRange('2026-09-08', '2026-09-01', ''), true);
  assert.equal(inDateRange('2026-08-08', '2026-09-01', ''), false);
  assert.equal(inDateRange('2026-09-08', '', '2026-09-30'), true);
  assert.equal(inDateRange('2026-10-08', '', '2026-09-30'), false);
  assert.equal(inDateRange('', '', ''), true);
});

test('★ بلا يومٍ لا دعوى: المستندُ عديمُ التاريخ يخرج من نطاقٍ محدَّد', () => {
  assert.equal(inDateRange('', '2026-09-01', '2026-09-30'), false);
});

/* ═══════════════ التصفية ═══════════════ */

const SET = [
  GRN(),
  GRN({
    id: 'd2',
    type: 'GRN',
    number: 'GRN-2026-000013',
    state: 'submitted',
    // ⚠️ التواريخُ والمنشئُ يُصرَّحان هنا ولا يُورَثان من المصنع: حين ورثهما
    // تطابق يومُ إنشائه ومنشئُه مع d1، فصارت تصفيةٌ صحيحةٌ تُعيد صفَّين —
    // والخطأُ كان في البيّنة لا في المقيس.
    createdByName: 'سعاد بن عامر',
    createdAt: ts(localMs(2026, 10, 1)),
    updatedAt: ts(localMs(2026, 10, 1)),
    header: { receivedAt: '2026-10-02', supplier: 'شركة طرابلس', supplierCode: 'SUP-010' },
  }),
  {
    id: 'd3',
    type: 'INV',
    state: 'done',
    number: 'INV-2026-000500',
    createdByName: 'سالم',
    createdAt: ts(localMs(2026, 9, 20)),
    updatedAt: ts(localMs(2026, 9, 21)),
    header: { invoiceDate: '2026-09-20', customer: 'بقالة النور', customerCode: 'CUS-77' },
    lines: [],
  },
];

test('التصفيةُ الفارغة لا تُسقط شيئًا', () => {
  assert.equal(filterReport(SET, EMPTY_CRITERIA).length, 3);
  assert.equal(filterReport(SET).length, 3);
  assert.equal(filterReport(null).length, 0);
});

test('★★★ التصفيةُ بالطرف — وهي ما لم يكن ممكنًا قبل هذه الوحدة', () => {
  const byName = filterReport(SET, { party: 'الزاوية' });
  assert.deepEqual(byName.map((d) => d.id), ['d1']);

  const byCode = filterReport(SET, { party: 'SUP-010' });
  assert.deepEqual(byCode.map((d) => d.id), ['d2']);

  const customer = filterReport(SET, { party: 'النور' });
  assert.deepEqual(customer.map((d) => d.id), ['d3']);
});

test('التصفيةُ بالرقم جزئيّةٌ لا مطابقةً تامّة — فمن حفظ آخر ثلاثة أرقامٍ يجد', () => {
  assert.deepEqual(filterReport(SET, { number: '000012' }).map((d) => d.id), ['d1']);
  assert.deepEqual(filterReport(SET, { number: 'GRN' }).map((d) => d.id), ['d1', 'd2']);
  assert.equal(filterReport(SET, { number: 'لا-وجود-له' }).length, 0);
});

test('★★ التصفيةُ باليوم على أساس الواقعة — وهو ما يسأل عنه الناس', () => {
  // استلامُ d1 وقع 09-08 وكُتب 09-10. من سأل عن يوم الاستلام يريد d1.
  assert.deepEqual(filterReport(SET, { from: '2026-09-08', to: '2026-09-08' }).map((d) => d.id), ['d1']);
  // وعلى أساس الإنشاء لا يظهر في ذلك اليوم — فالأساس يغيّر الجواب فعلًا.
  assert.equal(filterReport(SET, { basis: 'created', from: '2026-09-08', to: '2026-09-08' }).length, 0);
  assert.deepEqual(filterReport(SET, { basis: 'created', from: '2026-09-10', to: '2026-09-10' }).map((d) => d.id), ['d1']);
});

test('نطاقُ شهرٍ كامل يجمع ما وقع فيه ويستبعد ما بعده', () => {
  const sept = filterReport(SET, { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(sept.map((d) => d.id), ['d1', 'd3']);
});

test('المعاييرُ تتراكم (AND) — نوعٌ وطرفٌ ونطاقٌ معًا', () => {
  const rows = filterReport(SET, { type: 'GRN', party: 'طرابلس', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(rows.map((d) => d.id), ['d2']);
  // وتضييقٌ واحدٌ مخالفٌ يُفرغ النتيجة.
  assert.equal(filterReport(SET, { type: 'INV', party: 'طرابلس' }).length, 0);
});

test('التصفيةُ بالحالة وبالمتأخّر وحده', () => {
  assert.deepEqual(filterReport(SET, { state: 'done' }).map((d) => d.id), ['d3']);
  // d2 مُرسَلٌ وآخرُ تحديثه 2026-09-12، فبعد شهرٍ هو متأخّرٌ قطعًا (مهلة المُرسَل يومان).
  const now = localMs(2026, 10, 20);
  const stale = filterReport(SET, { staleOnly: true, nowMs: now });
  assert.ok(stale.some((d) => d.id === 'd2'), 'المُرسَلُ المنسيُّ شهرًا لم يُحسب متأخّرًا');
  assert.ok(!stale.some((d) => d.id === 'd3'), 'المنجَزُ لا يتأخّر');
});

test('★★ البحثُ الحرّ توسّع إلى الطرف ولم يفقد ما كان يجده', () => {
  // ما كان يُوجَد: الرقم · الرمز · عنوان النوع · المنشئ.
  assert.equal(filterReport(SET, { q: '000012' }).length, 1);
  assert.equal(filterReport(SET, { q: 'أحمد' }).length, 1);
  assert.ok(filterReport(SET, { q: 'GRN' }).length >= 2);
  // وما زِيد: الطرف.
  assert.deepEqual(filterReport(SET, { q: 'الزاوية' }).map((d) => d.id), ['d1']);
});

test('البحثُ يطبّع العربية — الهمزةُ والتاءُ لا توقفان الباحث', () => {
  const docs = [GRN({ id: 'x', header: { receivedAt: '2026-09-08', supplier: 'إبراهيم للتجارة' } })];
  assert.equal(filterReport(docs, { party: 'ابراهيم' }).length, 1);
  assert.equal(filterReport(docs, { party: 'للتجاره' }).length, 1);
});

/* ═══════════════ وصفُ المعايير ═══════════════ */

test('hasActiveCriteria يفرّق الفارغَ من المصفَّى', () => {
  assert.equal(hasActiveCriteria(EMPTY_CRITERIA), false);
  assert.equal(hasActiveCriteria({}), false);
  assert.equal(hasActiveCriteria(null), false);
  // الأساسُ وحده ليس تصفيةً — فتغييرُه لا يُضيء زرَّ «مسح».
  assert.equal(hasActiveCriteria({ basis: 'created' }), false);
  for (const k of ['q', 'number', 'party', 'type', 'state', 'from', 'to']) {
    assert.equal(hasActiveCriteria({ [k]: 'x' }), true, `${k} لم يُحسب تصفيةً`);
  }
  assert.equal(hasActiveCriteria({ staleOnly: true }), true);
});

test('★★ الملفُّ المُصدَّر يحمل شرطَه — وبلا شرطٍ يُقرأ خطأً', () => {
  assert.equal(criteriaSummary(EMPTY_CRITERIA), 'بلا تصفية — كلّ المستندات');
  const s = criteriaSummary({ party: 'الزاوية', type: 'GRN', from: '2026-09-01', to: '2026-09-30' });
  assert.match(s, /الزاوية/);
  assert.match(s, /2026-09-01/);
  assert.match(s, /2026-09-30/);
  // واسمُ الأساس مكتوبٌ فيُعرف على أيّ تاريخٍ صُفّي.
  assert.match(s, /تاريخ الواقعة/);
  // وعنوانُ النوع عربيٌّ لا رمزُه وحده.
  assert.ok(!/^GRN$/.test(s));
});

test('وصفُ المعايير يميّز الحدَّ الواحد', () => {
  assert.match(criteriaSummary({ from: '2026-09-01' }), /من 2026-09-01/);
  assert.match(criteriaSummary({ to: '2026-09-30' }), /إلى 2026-09-30/);
  assert.match(criteriaSummary({ basis: 'created', from: '2026-09-01', to: '2026-09-02' }), /تاريخ الإنشاء/);
});

test('ختمُ النطاق لاسم الملفّ', () => {
  assert.equal(rangeStamp({ from: '2026-09-01', to: '2026-09-30' }), '2026-09-01_2026-09-30');
  assert.equal(rangeStamp({ from: '2026-09-08', to: '2026-09-08' }), '2026-09-08');
  assert.equal(rangeStamp({ from: '2026-09-08' }), '2026-09-08');
  assert.equal(rangeStamp(EMPTY_CRITERIA), '');
});

/* ═══════════════ التجميع ═══════════════ */

test('التجميعُ بالنوع يرتّب بالعدد', () => {
  const rows = groupReport(SET, 'type');
  assert.equal(rows[0].key, 'GRN');
  assert.equal(rows[0].count, 2);
  // والعنوانُ عربيٌّ لا رمز.
  assert.ok(rows[0].label && rows[0].label !== 'GRN');
});

test('التجميعُ باليوم يرتّب زمنيًّا — الأحدثُ أوّلًا', () => {
  const rows = groupReport(SET, 'day', 'event');
  assert.deepEqual(rows.map((r) => r.key), ['2026-10-02', '2026-09-20', '2026-09-08']);
});

test('التجميعُ بالطرف وبالحالة — وعديمُ الطرف يُسمّى ولا يُحذف', () => {
  const byParty = groupReport([...SET, { type: 'ADJ', state: 'draft', header: {} }], 'party');
  assert.ok(byParty.some((r) => r.label === 'بلا طرف'), 'عديمُ الطرف سقط من التجميع');
  const byState = groupReport(SET, 'state');
  assert.equal(byState.reduce((s, r) => s + r.count, 0), 3);
});

/* ═══════════════ صفوف التصدير ═══════════════ */

test('★★ أعمدةُ التقرير واحدةٌ — وكلُّ عمودٍ له حقلٌ في الصفّ', () => {
  const row = reportRow(GRN(), localMs(2026, 9, 14));
  for (const c of REPORT_COLUMNS) {
    assert.ok(c.key in row, `العمود ${c.key} معلَنٌ بلا قيمةٍ في الصفّ`);
    assert.ok(c.label, `العمود ${c.key} بلا عنوان`);
  }
  // ولا حقلَ في الصفّ بلا عمودٍ يعرضه — فلا بيانٌ يُحسب ولا يُرى.
  for (const k of Object.keys(row)) {
    assert.ok(REPORT_COLUMNS.some((c) => c.key === k), `الحقل ${k} محسوبٌ بلا عمود`);
  }
});

test('صفُّ التصدير يحمل الطرفَ والتاريخين وعددَ البنود', () => {
  const row = reportRow(GRN(), localMs(2026, 9, 14));
  assert.equal(row.number, 'GRN-2026-000012');
  assert.equal(row.party, 'مخابز الزاوية (SUP-004)');
  assert.equal(row.eventDate, '2026-09-08');
  assert.equal(row.createdDate, '2026-09-10');
  assert.equal(row.lineCount, 1);
  assert.equal(row.stale, 'لا');
});

test('المسودّةُ بلا رقمٍ تُسمّى «مسودّة» ولا تُترك فارغةً في الإكسل', () => {
  const row = reportRow(GRN({ number: null, state: 'draft' }), localMs(2026, 9, 14));
  assert.equal(row.number, 'مسودّة');
});

test('★ البنودُ الفارغةُ لا تُعدّ — فعشرةُ صفوفٍ فارغةٍ ليست عشرةَ بنود', () => {
  // المستندُ الجديد يُولد بعشرة صفوفٍ فارغة (NEW_DOCUMENT_ROWS).
  const row = reportRow(GRN({ lines: [{}, { sku: '' }, { sku: 'A-1', qty: 2 }, null] }), Date.now());
  assert.equal(row.lineCount, 1);
});

test('reportRows يصفُّ الكلَّ ويقبل الفارغ', () => {
  assert.equal(reportRows(SET, Date.now()).length, 3);
  assert.deepEqual(reportRows(null), []);
  assert.deepEqual(reportRows([]), []);
});
