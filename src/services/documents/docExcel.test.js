/**
 * اختبارات إكسل المستندات — الاستيرادُ والتصدير.
 *
 * ★★★ والبياناتُ هنا **قذرةٌ بقصد**: شعارٌ فوق العناوين · أعمدةٌ مبدَّلةُ
 * الترتيب · تشكيلٌ في العنوان · كمّيّةٌ نصّيّة · تاريخٌ رقمٌ تسلسليّ · صفوفٌ
 * فارغةٌ في الذيل. لأنّ الدرسَ محفوظ: بياناتُ الاختبار النظيفةُ أعطت ٢٦
 * اختبارًا أخضرَ ثمّ سقطت المنظومةُ في أوّل دقيقةٍ حيّة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeHeaderText,
  lineHeaderIndex,
  lineTemplateHeaders,
  lineTemplateMatrix,
  supportsLineImport,
  detectLineHeaderRow,
  parseLinesMatrix,
  normalizeDateCell,
  mergeImportedLines,
  importSummaryLine,
  reportSheetMatrix,
  reportSheetWidths,
  reportFileName,
  linesSheetMatrix,
} from './docExcel.js';
import { getSchema } from './schemas/index.js';
import { tableSection } from './schemaUtils.js';
import { REPORT_COLUMNS } from './docReport.js';

const GRN = getSchema('GRN');

/* ═══════════════ تطبيعُ العناوين ═══════════════ */

test('التطبيعُ يُسقط التشكيلَ والأقواسَ والمسافاتِ والترقيم', () => {
  assert.equal(normalizeHeaderText('الكمّيّة'), normalizeHeaderText('الكمية'));
  assert.equal(normalizeHeaderText('الدفعة (Batch)'), normalizeHeaderText('الدفعه'));
  assert.equal(normalizeHeaderText('  الكمية :  '), normalizeHeaderText('الكمية'));
  assert.equal(normalizeHeaderText('الكمية *'), normalizeHeaderText('الكمية'));
  assert.equal(normalizeHeaderText('إجمالي'), normalizeHeaderText('اجمالي'));
  assert.equal(normalizeHeaderText(null), '');
});

test('★★ فهرسُ العناوين يقبل العربيَّ ومفتاحَ الحقل — فالرحلةُ ذهابًا وإيابًا تعمل', () => {
  const index = lineHeaderIndex(GRN);
  assert.equal(index.get(normalizeHeaderText('الكمية المستلمة'))?.key, 'qtyReceived');
  assert.equal(index.get(normalizeHeaderText('qtyReceived'))?.key, 'qtyReceived');
  assert.equal(index.get(normalizeHeaderText('الدفعة (Batch)'))?.key, 'batch');
});

test('★★★ الأعمدةُ من مخطّط النوع — لا قائمةَ مكتوبةً تصلح لنوعٍ وتكذب على غيره', () => {
  // الحارس: عناوينُ القالب هي **عناوينُ جدولِ المخطّط** حرفًا بحرف.
  for (const type of ['GRN', 'PO', 'PICK', 'CC']) {
    const schema = getSchema(type);
    const cols = tableSection(schema)?.columns || [];
    if (!cols.length) continue;
    assert.deepEqual(
      lineTemplateHeaders(schema),
      cols.map((c) => c.label || c.key),
      `${type}: عناوينُ القالب فارقت مخطّطَه`
    );
  }
});

test('نوعٌ بلا جدولِ بنودٍ لا يُخترع له عمود', () => {
  const noTable = { type: 'X', sections: [{ kind: 'fields', fields: [] }] };
  assert.deepEqual(lineTemplateHeaders(noTable), []);
  assert.deepEqual(lineTemplateMatrix(noTable), []);
  assert.equal(supportsLineImport(noTable), false);
  assert.equal(supportsLineImport(GRN), true);
});

/* ═══════════════ ترجيحُ صفّ العناوين ═══════════════ */

test('★★★ العناوينُ تُرجَّح ولا تُفترَض في الصفّ الأوّل — والشعارُ فوقها حالٌ غالبة', () => {
  const matrix = [
    ['شركة برندزو — مستودع طرابلس'],
    [],
    ['رمز SKU', 'الكمية المستلمة', 'الدفعة'],
    ['A-1', 5, 'B-9'],
  ];
  const { index, hits } = detectLineHeaderRow(matrix, GRN);
  assert.equal(index, 2, 'افتُرض الصفُّ الأوّل فقُرئ الشعارُ عنوانًا');
  assert.ok(hits >= 3);
});

test('وبلا شعارٍ يُوجَد الصفُّ الأوّل', () => {
  const { index } = detectLineHeaderRow([['رمز SKU', 'الكمية المستلمة'], ['A-1', 2]], GRN);
  assert.equal(index, 0);
});

/* ═══════════════ الاستيراد ═══════════════ */

test('استيرادٌ نظيفٌ يُعيد الصفوفَ مُشكَّلةً بمفاتيح المخطّط', () => {
  const matrix = [
    ['رمز SKU', 'الكمية المستلمة', 'الدفعة (Batch)'],
    ['A-1', 5, 'B-9'],
    ['A-2', 3, 'B-10'],
  ];
  const r = parseLinesMatrix(matrix, GRN);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [
    { sku: 'A-1', qtyReceived: 5, batch: 'B-9' },
    { sku: 'A-2', qtyReceived: 3, batch: 'B-10' },
  ]);
  assert.equal(r.summary.valid, 2);
  assert.equal(r.summary.invalid, 0);
});

test('★★ ترتيبُ الأعمدة لا يهمّ — المطابقةُ بالعنوان لا بالموضع', () => {
  const matrix = [
    ['الدفعة', 'الكمية المستلمة', 'رمز SKU'],
    ['B-9', 5, 'A-1'],
  ];
  const r = parseLinesMatrix(matrix, GRN);
  assert.deepEqual(r.rows, [{ batch: 'B-9', qtyReceived: 5, sku: 'A-1' }]);
});

test('★★★ الرقمُ غيرُ الرقميّ خطأٌ لا صفر — ولا تنقص بضاعةٌ صامتةً', () => {
  const matrix = [
    ['رمز SKU', 'الكمية المستلمة'],
    ['A-1', '١٢ كرتون'],
    ['A-2', 4],
  ];
  const r = parseLinesMatrix(matrix, GRN);
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 1, 'الصفُّ الفاسدُ دخل');
  assert.equal(r.rows[0].sku, 'A-2');
  assert.equal(r.errors.length, 1);
  // الخطأُ يُسمّى بصفّه **كما يُرى في إكسل** وبعموده.
  assert.equal(r.errors[0].row, 2);
  assert.match(r.errors[0].column, /الكمية المستلمة/);
  assert.match(r.errors[0].message, /ليس رقمًا/);
});

test('★★ والأرقامُ العربيّةُ الخالصةُ تُقبل — فالموظّفُ يكتب بلوحته', () => {
  const r = parseLinesMatrix([['رمز SKU', 'الكمية المستلمة'], ['A-1', '١٢']], GRN);
  assert.equal(r.rows[0].qtyReceived, 12);
});

test('وفواصلُ الآلاف تُقبل — إكسل يُخرجها نصًّا أحيانًا', () => {
  const r = parseLinesMatrix([['رمز SKU', 'الكمية المستلمة'], ['A-1', '1,250']], GRN);
  assert.equal(r.rows[0].qtyReceived, 1250);
});

test('★★ السالبُ مرفوضٌ بسببٍ مكتوب — والإرجاعُ مستندٌ عكسيٌّ لا رقمٌ سالب', () => {
  const r = parseLinesMatrix([['رمز SKU', 'الكمية المستلمة'], ['A-1', -5]], GRN);
  assert.equal(r.rows.length, 0);
  assert.match(r.errors[0].message, /سالب/);
  // بلا تشكيلٍ في النمط: «عكسيٌّ» تحمل ضمّةً وشدّةً، ومطابقةُ النصّ المشكَّل
  // حرفيًّا تسقط على محرفٍ لا يُرى في المحرّر.
  assert.match(r.errors[0].message, /عكسي/);
});

test('★★ الأعمدةُ المجهولةُ تُسمّى ولا تُسقط الملفّ', () => {
  const matrix = [
    ['رمز SKU', 'الكمية المستلمة', 'ملاحظاتُ المورّد الخاصّة'],
    ['A-1', 5, 'شيء'],
  ];
  const r = parseLinesMatrix(matrix, GRN);
  assert.equal(r.ok, true, 'عمودٌ مجهولٌ أسقط ملفًّا صالحًا');
  assert.deepEqual(r.rows, [{ sku: 'A-1', qtyReceived: 5 }]);
  assert.deepEqual(r.unknownColumns, ['ملاحظاتُ المورّد الخاصّة']);
});

test('والأعمدةُ الناقصةُ تُسمّى — فيُعرف ما لم يُملأ', () => {
  const r = parseLinesMatrix([['رمز SKU'], ['A-1']], GRN);
  assert.ok(r.matchedColumns.includes('sku'));
  assert.ok(r.missingColumns.includes('qtyReceived'));
  assert.ok(!r.missingColumns.includes('sku'));
});

test('★ الصفوفُ الفارغةُ في الذيل تُتجاهل — إكسل يُخرجها دائمًا', () => {
  const matrix = [
    ['رمز SKU', 'الكمية المستلمة'],
    ['A-1', 5],
    [],
    ['', ''],
    [null, null],
  ];
  const r = parseLinesMatrix(matrix, GRN);
  assert.equal(r.rows.length, 1);
  assert.equal(r.summary.total, 1, 'الفراغُ عُدّ صفًّا');
});

test('ملفٌّ بلا عمودٍ مفهومٍ يُبلّغ العناوينَ المتوقَّعة لا «فشل»', () => {
  const r = parseLinesMatrix([['عمود١', 'عمود٢'], ['x', 'y']], GRN);
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0);
  assert.match(r.errors[0].message, /العناوينُ المتوقَّعة/);
  assert.match(r.errors[0].message, /رمز SKU/);
});

test('نوعٌ بلا جدولٍ يُبلّغ أنّه لا يُستورَد إليه', () => {
  const r = parseLinesMatrix([['أيّ شيء']], { type: 'X', sections: [] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /لا يحمل جدولَ بنود/);
});

test('★★ سقفُ الصفوف يُعلَن ولا يُقطع صامتًا', () => {
  const matrix = [['رمز SKU', 'الكمية المستلمة'], ...Array.from({ length: 10 }, (_, i) => [`A-${i}`, 1])];
  const r = parseLinesMatrix(matrix, GRN, { maxRows: 4 });
  assert.equal(r.rows.length, 4);
  assert.ok(r.errors.some((e) => /تجاوز الملفُّ/.test(e.message)), 'القطعُ وقع بلا إبلاغ');
});

test('parseLinesMatrix يقبل الفارغ', () => {
  const r = parseLinesMatrix([], GRN);
  assert.equal(r.rows.length, 0);
  assert.equal(r.ok, false);
  assert.equal(parseLinesMatrix(null, GRN).rows.length, 0);
});

/* ═══════════════ التواريخ ═══════════════ */

test('★★★ الرقمُ التسلسليُّ يُحوَّل تاريخًا — وبلا هذا تُحفظ «46000» صلاحيةً', () => {
  // 2026-09-08 في تسلسل إكسل (مرجع 1899-12-30).
  const serial = Math.round((Date.UTC(2026, 8, 8) - Date.UTC(1899, 11, 30)) / 86400000);
  assert.equal(normalizeDateCell(serial), '2026-09-08');
  assert.equal(normalizeDateCell(String(serial)), '2026-09-08');
});

test('النصُّ القياسيُّ يمرّ كما هو، والـDate يُحوَّل بأجزائه المحلّيّة', () => {
  assert.equal(normalizeDateCell('2026-09-08'), '2026-09-08');
  assert.equal(normalizeDateCell('2026-09-08T10:00:00'), '2026-09-08');
  // ★ منتصفُ الليل محلّيًّا يبقى يومَه — لا ينزاح إلى أمس كما يفعل toISOString.
  assert.equal(normalizeDateCell(new Date(2026, 8, 8, 0, 30)), '2026-09-08');
});

test('وما لا يُفهم يبقى كما كتبه المستخدم — لا يُخترع تاريخ', () => {
  assert.equal(normalizeDateCell('قريبًا'), 'قريبًا');
  assert.equal(normalizeDateCell(''), '');
  assert.equal(normalizeDateCell(null), '');
});

test('★ وتاريخُ الصلاحية في الاستيراد يُطبَّع — فعمودُ التاريخ يُعرف من المخطّط', () => {
  const serial = Math.round((Date.UTC(2027, 0, 15) - Date.UTC(1899, 11, 30)) / 86400000);
  const r = parseLinesMatrix([['رمز SKU', 'تاريخ الصلاحية'], ['A-1', serial]], GRN);
  assert.equal(r.rows[0].expiryDate, '2027-01-15');
});

/* ═══════════════ الدمج ═══════════════ */

test('★★ الإلحاقُ هو الافتراض — والاستبدالُ لا يكون افتراضًا أبدًا', () => {
  const existing = [{ sku: 'OLD', qtyReceived: 1 }, {}, {}];
  const imported = [{ sku: 'NEW', qtyReceived: 2 }];
  const appended = mergeImportedLines(existing, imported);
  assert.equal(appended[0].sku, 'OLD', 'الإلحاقُ محا القائم');
  assert.equal(appended[1].sku, 'NEW');
  // والصفوفُ الفارغةُ تبقى عددًا — فلا تُفقد مساحةُ الكتابة اليدويّة.
  assert.equal(appended.length, 4);
  assert.deepEqual(appended.slice(2), [{}, {}]);
});

test('والاستبدالُ يمحو عند طلبه صريحًا', () => {
  const out = mergeImportedLines([{ sku: 'OLD' }], [{ sku: 'NEW' }], 'replace');
  assert.deepEqual(out, [{ sku: 'NEW' }]);
});

test('الدمجُ يُسقط الصفوفَ المستوردةَ الفارغة', () => {
  const out = mergeImportedLines([], [{}, { sku: 'A' }, null], 'append');
  assert.deepEqual(out, [{ sku: 'A' }]);
});

test('الدمجُ يقبل الفارغ', () => {
  assert.deepEqual(mergeImportedLines(null, null), []);
  assert.deepEqual(mergeImportedLines(undefined, [{ sku: 'A' }]), [{ sku: 'A' }]);
});

test('سطرُ النتيجة يُبلّغ العددَ والمرفوضَ والمجهول', () => {
  const r = parseLinesMatrix(
    [['رمز SKU', 'الكمية المستلمة', 'عمودٌ غريب'], ['A-1', 'س', 'x'], ['A-2', 2, 'y']],
    GRN
  );
  const line = importSummaryLine(r);
  assert.match(line, /2/);
  assert.match(line, /مرفوض/);
  assert.match(line, /عمودٌ غريب/);
  assert.match(importSummaryLine(null), /لم يُقرأ/);
});

/* ═══════════════ التصدير ═══════════════ */

const ts = (ms) => ({ toMillis: () => ms });
const DOCS = [
  {
    id: 'a',
    type: 'GRN',
    state: 'approved',
    number: 'GRN-1',
    createdByName: 'أحمد',
    createdAt: ts(Date.UTC(2026, 8, 10, 10)),
    updatedAt: ts(Date.UTC(2026, 8, 12, 10)),
    header: { receivedAt: '2026-09-08', supplier: 'مخابز الزاوية', supplierCode: 'SUP-4' },
    lines: [{ sku: 'A-1', qtyReceived: 5 }],
  },
];

test('★★ ورقةُ التقرير تحمل شرطَها في الصفّ الأوّل ثمّ العناوين', () => {
  const m = reportSheetMatrix(DOCS, { party: 'الزاوية', from: '2026-09-01', to: '2026-09-30' }, Date.now());
  assert.match(String(m[0][0]), /تقرير المستندات/);
  assert.match(String(m[0][0]), /الزاوية/);
  assert.match(String(m[1][0]), /صُدِّر/);
  assert.deepEqual(m[2], REPORT_COLUMNS.map((c) => c.label));
  assert.equal(m.length, 4);
});

test('★★★ والرحلةُ ذهابًا وإيابًا: عناوينُ التقرير المُصدَّر تُرجَّح عند إعادة القراءة', () => {
  // الملفُّ المُصدَّر عناوينُه في الصفّ الثالث — والمُرجِّحُ يجدها.
  const m = reportSheetMatrix(DOCS, {}, Date.now());
  const fakeSchema = { type: 'R', sections: [{ kind: 'table', columns: REPORT_COLUMNS.map((c) => ({ key: c.key, label: c.label, kind: 'text' })) }] };
  const { index, hits } = detectLineHeaderRow(m, fakeSchema);
  assert.equal(index, 2, 'عناوينُ ملفِّنا المُصدَّر لا تُرجَّح — فلا تُقرأ عودةً');
  assert.equal(hits, REPORT_COLUMNS.length);
});

test('صفوفُ التقرير تحمل الطرفَ وتواريخَه', () => {
  const m = reportSheetMatrix(DOCS, {}, Date.now());
  const row = m[3];
  const partyAt = REPORT_COLUMNS.findIndex((c) => c.key === 'party');
  assert.match(String(row[partyAt]), /مخابز الزاوية/);
});

test('عرضُ الأعمدة بعددِ الأعمدة، والطرفُ أوسعُها', () => {
  const widths = reportSheetWidths();
  assert.equal(widths.length, REPORT_COLUMNS.length);
  const partyAt = REPORT_COLUMNS.findIndex((c) => c.key === 'party');
  assert.ok(widths[partyAt].wch >= 30);
});

test('اسمُ الملفّ يحمل النطاقَ أو تاريخَ اليوم، وينتهي بـxlsx', () => {
  assert.match(reportFileName({ from: '2026-09-01', to: '2026-09-30' }), /2026-09-01_2026-09-30\.xlsx$/);
  assert.match(reportFileName({}, Date.UTC(2026, 9, 2)), /2026-10-02\.xlsx$/);
});

test('★ ورقةُ بنودِ مستندٍ تُصدَّر بعناوين مخطّطه وتعود بلا خسارة', () => {
  const m = linesSheetMatrix(GRN, [{ sku: 'A-1', qtyReceived: 5, batch: 'B-9' }, {}]);
  assert.deepEqual(m[0], lineTemplateHeaders(GRN));
  assert.equal(m.length, 2, 'الصفُّ الفارغُ صُدِّر');
  // والعودة: ما صُدِّر يُقرأ كما كان.
  const back = parseLinesMatrix(m, GRN);
  assert.deepEqual(back.rows, [{ sku: 'A-1', qtyReceived: 5, batch: 'B-9' }]);
});

test('ورقةُ بنودٍ لنوعٍ بلا جدولٍ فارغة', () => {
  assert.deepEqual(linesSheetMatrix({ type: 'X', sections: [] }, [{ a: 1 }]), []);
});

test('★ وساعةٌ غائبةٌ لا تُسقط التصدير — ولا يُرمى استثناءٌ لأجل سطرِ ترويسة', () => {
  // حارسُ `npm run audit` §5 منع `Date.now()` في المنطق الخالص، فصار الاستدعاءُ
  // بلا ساعةٍ ممكنًا — و`new Date(undefined).toISOString()` يرمي.
  const m = reportSheetMatrix(DOCS, {}, undefined);
  assert.equal(m.length, 4);
  assert.match(String(m[1][0]), /صُدِّر/);
  assert.match(reportFileName({}, undefined), /export\.xlsx$/);
  // والنطاقُ يفوز على الساعة حين وُجد.
  assert.match(reportFileName({ from: '2026-09-01', to: '2026-09-01' }, undefined), /2026-09-01\.xlsx$/);
});
