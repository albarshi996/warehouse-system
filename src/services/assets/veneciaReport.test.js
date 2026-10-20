/**
 * اختباراتُ تقرير مخزن فينسيا — الموديلُ الواحدُ الذي يقرأ منه المخرجان،
 * والمصنَّفُ المنسَّقُ **مقروءًا من بايتاته** كما يقرؤه إكسل.
 *
 * وأثقلُ ما هنا: أنّ أرقامَ التقرير **هي أرقامُ اللوحة نفسُها** — فتقريرٌ
 * يُرسَل للإدارة ويخالف ما يراه المالك على الشاشة أسوأُ من تقريرٍ لا يخرج.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

import { VENECIA_EXPORT_COLUMNS, veneciaSnapshot } from './veneciaModel.js';
import { cardsSnapshot } from './veneciaCards.js';
import {
  CARD_REPORT_COLUMNS,
  NUMERIC_COLUMNS,
  REPORT_TITLE,
  ISSUED_REPORT_COLUMNS,
  SCRAP_REPORT_COLUMNS,
  buildVeneciaReport,
  cardReportRows,
  issuedReportRows,
  scrapReportRows,
} from './veneciaReport.js';
import { buildReportWorkbook, reportFileName } from './veneciaReportExcel.js';

const seed = JSON.parse(
  readFileSync(new URL('../../data/venecia-assets-seed.json', import.meta.url), 'utf8')
);

const line = (over = {}) => ({ population: 'issue', assetNo: 'BRZ-0001', assetName: 'خشب باركي', qty: 10, ...over });
const card = (over = {}) => ({
  number: 'VENISS-2026-0001',
  kind: 'issue',
  state: 'posted',
  cardDate: '2026-10-19',
  party: 'سراج',
  destination: 'مشروع الرحبة',
  purpose: '',
  lines: [line()],
  ...over,
});

// ── صفوفُ البطاقات ───────────────────────────────────────────────────────

test('صفوفُ البطاقات بعشرة أعمدةٍ بترتيبها', () => {
  const [row] = cardReportRows([card()]);
  assert.deepEqual(Object.keys(row), CARD_REPORT_COLUMNS);
  assert.equal(row['الرقم'], 'VENISS-2026-0001');
  assert.equal(row['الاتّجاه'], 'بطاقة صرف');
  assert.equal(row['الحالة'], 'مصروفة');
  assert.equal(row['بنود'], 1);
  assert.equal(row['الوحدات'], 10);
  assert.equal(row['الأثر'], -10);
});

test('★★★ وأثرُ المسودّة صفرٌ — وإلّا وَعَد مجموعُ العمود بحركةٍ لم تقع', () => {
  const [draft] = cardReportRows([card({ state: 'draft', number: '' })]);
  assert.equal(draft['الوحدات'], 10, 'الوحداتُ تُذكر — فالبطاقةُ موجودة');
  assert.equal(draft['الأثر'], 0, 'والأثرُ صفرٌ — فهي لم تُحرّك شيئًا');
  const [cancelled] = cardReportRows([card({ state: 'cancelled' })]);
  assert.equal(cancelled['الأثر'], 0);
});

test('والإدخالُ أثرُه موجب', () => {
  const [row] = cardReportRows([card({ kind: 'receipt', number: 'VENRCV-2026-0001' })]);
  assert.equal(row['الأثر'], 10);
  assert.equal(row['الحالة'], 'مُدخَلة');
});

// ── الموديل ──────────────────────────────────────────────────────────────

test('★★★ أرقامُ التقرير هي أرقامُ اللوحة نفسُها — لا حسابٌ ثانٍ ينحرف', () => {
  const cards = [card(), card({ kind: 'receipt', number: 'VENRCV-2026-0001', lines: [line({ qty: 4 })] })];
  const rep = buildVeneciaReport(seed.assets, cards, { asOf: '2026-10-19' });
  const snap = veneciaSnapshot(seed.assets);
  const moves = cardsSnapshot(cards);

  const get = (label) => rep.summary.find((s) => s.label === label)?.value;
  assert.equal(get('أصولٌ في الجرد'), snap.assets);
  assert.equal(get('يحتاج تدخّلًا'), snap.needsAttention);
  assert.equal(get('لم يُجرَد'), snap.count.pending);
  assert.equal(get('صُرف بالبطاقات'), moves.issued.units);
  assert.equal(get('أُدخل بالبطاقات'), moves.received.units);
  assert.deepEqual(rep.byPopulation, snap.perPopulation);
});

test('ولقطةُ البذرة في التقرير: ١٠٤ أصلًا · ٢٧٣٩ وحدة', () => {
  const rep = buildVeneciaReport(seed.assets, [], { asOf: '2026-10-19' });
  assert.equal(rep.title, REPORT_TITLE);
  assert.equal(rep.assetsSheet.rows.length, 104);
  assert.equal(rep.assetsSheet.totals['الكمية'], 2739);
  assert.deepEqual(rep.assetsSheet.columns, VENECIA_EXPORT_COLUMNS);
});

test('★ والتصنيفُ يحمل وحداتِه لا عددَ أصوله فقط — فمئةُ صنفٍ بوحدةٍ ليست كصنفٍ بمئة', () => {
  const rep = buildVeneciaReport(seed.assets, [], { asOf: '2026-10-19' });
  const athath = rep.byCategory.find((c) => c.label === 'اثاث');
  assert.equal(athath.value, 9, 'تسعةُ أصول');
  // 120+1+1+1+2+1+5+14+75 — محسوبةٌ من البذرة نفسِها لا مقدَّرة.
  assert.equal(athath.note, '220 وحدة');
  // ومجموعُ وحدات التصنيفات كلِّها = وحداتُ الجرد.
  const units = rep.byCategory.reduce((s, c) => s + Number(String(c.note).replace(/\D/g, '')), 0);
  assert.equal(units, 2739);
});

test('والمكهَّنُ خارجَ التصنيفات والوحدات', () => {
  const assets = [
    { ...seed.assets[0], qty: 10 },
    { ...seed.assets[1], qty: 7, archived: true },
  ];
  const rep = buildVeneciaReport(assets, [], { asOf: '2026-10-19' });
  assert.equal(rep.summary.find((s) => s.label === 'أصولٌ في الجرد').value, 1);
  assert.equal(rep.summary.find((s) => s.label === 'مكهَّن').value, 1);
  assert.equal(rep.byCategory.reduce((s, c) => s + c.value, 0), 1);
});

test('والتصفياتُ والنطاقُ يُذكران في التقرير — فلا يُقرأ جزءٌ على أنّه الكلّ', () => {
  const rep = buildVeneciaReport(seed.assets.slice(0, 5), [], {
    asOf: '2026-10-19',
    scope: 'بضاعة الصرف · تصنيف اثاث',
    filters: [{ label: 'المجموعة', value: 'بضاعة الصرف' }],
  });
  assert.equal(rep.scope, 'بضاعة الصرف · تصنيف اثاث');
  assert.deepEqual(rep.filters, [{ label: 'المجموعة', value: 'بضاعة الصرف' }]);
  assert.equal(rep.asOf, '2026-10-19');
});

test('★ وبلا `asOf` لا يُخترع تاريخٌ من ساعة الجهاز', () => {
  assert.equal(buildVeneciaReport([], []).asOf, '');
});

// ── المصنَّف المنسَّق ─────────────────────────────────────────────────────

function roundTrip(wb) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const back = XLSX.read(buf, { type: 'buffer' });
  return {
    names: back.SheetNames,
    sheet: (n) => XLSX.utils.sheet_to_json(back.Sheets[n], { header: 1, defval: '' }),
  };
}

test('★★★ المصنَّفُ ثلاثُ أوراقٍ تُقرأ من بايتاته', () => {
  const rep = buildVeneciaReport(seed.assets, [card()], { asOf: '2026-10-19' });
  const out = roundTrip(buildReportWorkbook(XLSX, rep));
  assert.deepEqual(out.names, ['الملخّص', 'الجرد', 'بطاقات الحركة', 'المصروف', 'المخرَّد']);
});

test('وورقةُ الجرد: ترويسةٌ ثمّ ١٠٤ صفًّا ثمّ سطرُ مجاميع', () => {
  const rep = buildVeneciaReport(seed.assets, [], { asOf: '2026-10-19' });
  const rows = roundTrip(buildReportWorkbook(XLSX, rep)).sheet('الجرد');
  assert.deepEqual(rows[0], VENECIA_EXPORT_COLUMNS);
  assert.equal(rows.length, 1 + 104 + 1);
  const totals = rows[rows.length - 1];
  assert.equal(totals[0], 'المجموع (104)');
  assert.equal(totals[VENECIA_EXPORT_COLUMNS.indexOf('الكمية')], 2739);
});

test('★★★ والمجاميعُ أرقامٌ لا نصوص — فتُجمَع في إكسل بلا تحويل', () => {
  const rep = buildVeneciaReport(seed.assets, [card()], { asOf: '2026-10-19' });
  const out = roundTrip(buildReportWorkbook(XLSX, rep));
  const rows = out.sheet('الجرد');
  const totals = rows[rows.length - 1];
  assert.equal(typeof totals[VENECIA_EXPORT_COLUMNS.indexOf('الكمية')], 'number');
  const cardRows = out.sheet('بطاقات الحركة');
  const cardTotals = cardRows[cardRows.length - 1];
  assert.equal(typeof cardTotals[CARD_REPORT_COLUMNS.indexOf('الأثر')], 'number');
  assert.equal(cardTotals[CARD_REPORT_COLUMNS.indexOf('الأثر')], -10);
});

test('وورقةُ الملخّص تذكر العنوانَ والتاريخَ وكلَّ بنود اللقطة', () => {
  const rep = buildVeneciaReport(seed.assets, [], { asOf: '2026-10-19' });
  const rows = roundTrip(buildReportWorkbook(XLSX, rep)).sheet('الملخّص');
  const flat = rows.map((r) => r.join(' | ')).join('\n');
  assert.ok(flat.includes(REPORT_TITLE));
  assert.ok(flat.includes('2026-10-19'));
  for (const s of rep.summary) assert.ok(flat.includes(s.label), `غاب بندُ «${s.label}» عن الملخّص`);
  assert.ok(flat.includes('التصنيفات'));
  assert.ok(flat.includes('الحالات'));
});

test('★ والأعمدةُ الرقميّةُ معلومةٌ لكلّ ورقة — وإلّا خرجت المجاميعُ نصًّا', () => {
  assert.deepEqual(NUMERIC_COLUMNS['الجرد'], ['الكمية', 'الكمية المعدودة', 'فرق الجرد']);
  assert.deepEqual(NUMERIC_COLUMNS['بطاقات الحركة'], ['بنود', 'الوحدات', 'الأثر']);
  // ★★★ والأعمدةُ المعروفةُ تُشتقُّ **من التقرير نفسِه** لا من خريطةٍ مكتوبةٍ
  // هنا بيد: كانت `sheet === 'الجرد' ? … : …` ثنائيّةً، فأيُّ ورقةٍ ثالثةٍ
  // تُضاف تقع على فرعٍ لا يخصّها فيسقط الحارسُ على عملٍ صحيح. وهو نفسُ
  // الاقترانِ باسم الورقة الذي أُخرج من `buildReportWorkbook` من قبل.
  const sample = buildVeneciaReport([], [], {});
  const columnsBySheet = new Map(
    [sample.assetsSheet, sample.cardsSheet, sample.issuedSheet, sample.scrapSheet].map((sh) => [
      sh.name,
      sh.columns,
    ])
  );
  for (const [sheet, cols] of Object.entries(NUMERIC_COLUMNS)) {
    const known = columnsBySheet.get(sheet);
    assert.ok(known, `ورقةٌ في NUMERIC_COLUMNS لا وجودَ لها في التقرير: ${sheet}`);
    for (const c of cols) assert.ok(known.includes(c), `عمودٌ رقميٌّ لا وجودَ له: ${c} في ${sheet}`);
  }
});

test('وجردٌ فارغٌ يُخرج تقريرًا لا يرمي', () => {
  const out = roundTrip(buildReportWorkbook(XLSX, buildVeneciaReport([], [], { asOf: '2026-10-19' })));
  assert.deepEqual(out.names, ['الملخّص', 'الجرد', 'بطاقات الحركة', 'المصروف', 'المخرَّد']);
  assert.deepEqual(out.sheet('الجرد')[0], VENECIA_EXPORT_COLUMNS);
});

test('اسمُ الملفّ يُنظَّف وبامتدادٍ واحد', () => {
  assert.equal(reportFileName('تقرير-2026-10-19'), 'تقرير-2026-10-19.xlsx');
  assert.equal(reportFileName('a/b:c'), 'abc.xlsx');
  assert.equal(reportFileName(''), 'تقرير-مخزن-فينسيا.xlsx');
});

// ═══ ورقتا المصروف والمخرَّد ‹VEN-301 ذيل› ═══

const issueCard = (over = {}) => ({
  number: 'VENISS-2026-0001',
  kind: 'issue',
  state: 'posted',
  cardDate: '2026-10-20',
  party: 'سعيد الحسناوي',
  destination: 'مشروع الرحبة',
  lines: [{ assetNo: 'BRZ-0063', assetName: 'أعمدة انارة', category: 'كهرباء', qty: 11 }],
  ...over,
});

test('★★★ المصروفُ سطرٌ لكلّ بندٍ لا لكلّ بطاقة', () => {
  const rows = issuedReportRows([
    issueCard({
      lines: [
        { assetNo: 'BRZ-0063', assetName: 'أعمدة', category: 'كهرباء', qty: 11 },
        { assetNo: 'BRZ-0070', assetName: 'مواسير', category: 'سباكه', qty: 4 },
      ],
    }),
  ]);
  assert.equal(rows.length, 2, 'بطاقةٌ ببندَين ⇒ سطران');
  assert.deepEqual(rows.map((r) => r['رقم الأصل']), ['BRZ-0063', 'BRZ-0070']);
  assert.equal(rows[0]['المستلِم'], 'سعيد الحسناوي', 'وكلُّ سطرٍ يحمل مستلِمَه');
  assert.equal(rows[1]['السند'], 'VENISS-2026-0001', 'ورقمَ سنده');
});

test('★★★ المسودّةُ تدخل مُميَّزةً والملغاةُ لا تدخل (قرار المالك 2026-10-21)', () => {
  const rows = issuedReportRows([
    issueCard(),
    issueCard({ state: 'draft', number: '' }),
    issueCard({ state: 'cancelled' }),
  ]);
  assert.equal(rows.length, 2, 'المثبَّتةُ والمسودّةُ — والملغاةُ وحدَها خارج');
  assert.deepEqual(rows.map((r) => r['الحالة']), ['مثبَّت', 'لم تُثبَّت']);
  assert.equal(rows[1]['السند'], 'بلا رقم', 'والمسودّةُ تُقال بلا رقمٍ لا بشرطةٍ تُشبه الرقم');
});

test('★★★ والمجموعُ لا يَعِد بما لم يقع: الكمّيّةُ تُجمَع والمقيَّدُ لا يشمل المسودّة', () => {
  const rows = issuedReportRows([
    issueCard({ lines: [{ assetNo: 'B1', qty: 2 }] }),
    issueCard({ state: 'draft', number: '', lines: [{ assetNo: 'B2', qty: 11 }] }),
  ]);
  assert.deepEqual(rows.map((r) => r['الكمية']), [2, 11], 'كلتاهما تقول كمّيّتَها');
  assert.deepEqual(rows.map((r) => r['المقيَّد في الرصيد']), [2, 0], 'والمسودّةُ صفرٌ في الرصيد');
});

test('★★ ومجاميعُ الورقة تفرّق الاثنين', () => {
  const r = buildVeneciaReport(
    [],
    [issueCard({ lines: [{ assetNo: 'B1', qty: 2 }] }), issueCard({ state: 'draft', number: '', lines: [{ assetNo: 'B2', qty: 11 }] })],
    {}
  );
  assert.equal(r.issuedSheet.totals['الكمية'], 13);
  assert.equal(r.issuedSheet.totals['المقيَّد في الرصيد'], 2);
});

test('والإدخالُ ليس صرفًا', () => {
  assert.deepEqual(issuedReportRows([issueCard({ kind: 'receipt' })]), []);
});

test('أعمدةُ المصروف تطابق مفاتيحَ صفوفه', () => {
  const [row] = issuedReportRows([issueCard()]);
  assert.deepEqual(Object.keys(row).sort(), [...ISSUED_REPORT_COLUMNS].sort());
});

test('بطاقةٌ بلا بنودٍ لا ترمي', () => {
  assert.deepEqual(issuedReportRows([issueCard({ lines: undefined })]), []);
  assert.deepEqual(issuedReportRows(null), []);
});

test('★★★ المخرَّدُ هو المكهَّنُ وحدَه — ومعه سببُه', () => {
  const rows = scrapReportRows([
    { id: 'BRZ-0002', assetName: 'مواسير', qty: 3, condition: 'معطل', archived: true, archiveReason: 'تلفٌ نهائيّ', archivedBy: 'محمد', archivedAt: '2026-10-18T09:00:00Z' },
    { id: 'BRZ-0003', assetName: 'خشب', qty: 5, archived: false },
  ]);
  assert.equal(rows.length, 1, 'القائمُ ليس مخرَّدًا');
  assert.equal(rows[0]['سبب التخريد'], 'تلفٌ نهائيّ');
  assert.equal(rows[0]['من خرّده'], 'محمد');
  assert.equal(rows[0]['تاريخ التخريد'], '2026-10-18');
});

test('★★ ومخرَّدٌ بلا سببٍ يُعرض شرطةً لا فراغًا — فالعمودُ يُقرأ', () => {
  const [r] = scrapReportRows([{ id: 'B', assetName: 'x', qty: 1, archived: true }]);
  assert.equal(r['سبب التخريد'], '—');
  assert.equal(r['تاريخ التخريد'], '', 'وتاريخٌ غائبٌ يبقى فارغًا ولا يُخترع');
});

test('ختمُ Firestore يُقرأ يومًا كما يُقرأ النصّ', () => {
  const stamp = { toDate: () => new Date(2026, 9, 18) };
  const [r] = scrapReportRows([{ id: 'B', assetName: 'x', qty: 1, archived: true, archivedAt: stamp }]);
  assert.equal(r['تاريخ التخريد'], '2026-10-18');
});

test('أعمدةُ المخرَّد تطابق مفاتيحَ صفوفه', () => {
  const [row] = scrapReportRows([{ id: 'B', assetName: 'x', qty: 1, archived: true }]);
  assert.deepEqual(Object.keys(row).sort(), [...SCRAP_REPORT_COLUMNS].sort());
});

test('★★★ وملخّصُ المخرَّد هو مجموعُ ورقته — لا حسابان يفترقان', () => {
  const assets = [
    { id: 'B1', assetName: 'a', qty: 3, archived: true, archiveReason: 'ت' },
    { id: 'B2', assetName: 'b', qty: 7, archived: true, archiveReason: 'ت' },
    { id: 'B3', assetName: 'c', qty: 5 },
  ];
  const r = buildVeneciaReport(assets, [], {});
  const line = r.summary.find((x) => x.label.includes('مخرَّد'));
  assert.equal(line.value, r.scrapSheet.rows.length);
  assert.match(line.note, new RegExp(`${r.scrapSheet.totals['الكمية']} وحدة`));
  assert.equal(r.scrapSheet.totals['الكمية'], 10);
});

test('★★ ومجموعُ المصروف هو مجموعُ أسطره', () => {
  const r = buildVeneciaReport([], [issueCard()], {});
  for (const col of ['الكمية', 'المقيَّد في الرصيد']) {
    const sum = r.issuedSheet.rows.reduce((n, x) => n + x[col], 0);
    assert.equal(r.issuedSheet.totals[col], sum, col);
  }
});

test('★★★ والورقتان في المصنَّف المنسَّق — تُقرآن من بايتاته', () => {
  const r = buildVeneciaReport(
    [{ id: 'B1', assetName: 'مواسير', qty: 3, archived: true, archiveReason: 'تلف' }],
    [issueCard()],
    { asOf: '2026-10-21' }
  );
  const out = roundTrip(buildReportWorkbook(XLSX, r));
  assert.ok(out.names.includes('المصروف'), 'ورقةُ المصروف موجودة');
  assert.ok(out.names.includes('المخرَّد'), 'وورقةُ المخرَّد');
  assert.ok(out.sheet('المصروف').flat().includes('سعيد الحسناوي'), 'والمستلِمُ فيها');
  assert.ok(out.sheet('المخرَّد').flat().includes('تلف'), 'وسببُ التخريد فيها');
});

test('★★ والكمّيّةُ رقمٌ يُجمَع في إكسل لا نصّ', () => {
  assert.deepEqual(NUMERIC_COLUMNS['المصروف'], ['الكمية', 'المقيَّد في الرصيد']);
  assert.deepEqual(NUMERIC_COLUMNS['المخرَّد'], ['الكمية']);
});

// ═══ ★★★ مُحمِّلُ مكتبة التنسيق ‹VEN-301 ذيل٤› ═══
// العطب: كان يُعيد `window.XLSX` الموجودَ أيًّا كان. وصفحاتُ البوّابة تحمل
// النسخةَ القياسيّةَ من SheetJS لأغراضٍ أخرى، **وهي تتجاهل `cell.s` بصمت** —
// فمن حمّلها مرّةً في الجلسة لا يرى تنسيقًا أبدًا بعدها. ولا اختبارَ يُمسك
// ذلك: الدالّةُ تلمس DOM فلا تُحمَّل في Node، فالمرساةُ تقرأ المصدرَ نصًّا.
const EXCEL_SRC = readFileSync(new URL('./veneciaReportExcel.js', import.meta.url), 'utf8');

test('★★★ لا يُقبل `window.XLSX` اختصارًا بلا علامةِ المنسِّقة', () => {
  assert.ok(
    !/if\s*\(typeof window !== 'undefined' && window\.XLSX\)/.test(EXCEL_SRC),
    'الاختصارُ على مجرّد وجود XLSX عاد — وهو يُخرج الملفَّ بلا تنسيقٍ بلا شكوى'
  );
  assert.match(EXCEL_SRC, /window\.__bzSheetStyled && window\.XLSX/, 'الاختصارُ مشروطٌ بالعلامة');
});

test('★★ والعلامةُ تُرفع بعد المنسِّقة وحدَها لا بعد الاحتياطيّة', () => {
  // ★ المواضعُ تُقاس على **نداءات الحقن** لا على ذكر الاسم: اسمُ الاحتياطيّة
  // مذكورٌ في الشرح أعلاه أيضًا، و`indexOf` عليه يقع على التعليق لا الكود.
  const styled = EXCEL_SRC.indexOf('inject(`${lib}/xlsx-js-style.bundle.js`)');
  const mark = EXCEL_SRC.indexOf('window.__bzSheetStyled = true');
  const fallback = EXCEL_SRC.indexOf('inject(`${lib}/xlsx.full.min.js`)');
  assert.ok(styled > 0, 'المنسِّقةُ تُحقن');
  assert.ok(fallback > 0, 'والاحتياطيّةُ موجودة');
  assert.ok(mark > styled, 'والعلامةُ تُرفع بعد حقن المنسِّقة');
  assert.ok(mark < fallback, 'وقبل مسار الاحتياط — فالاحتياطيّةُ لا تُعلَّم');
});

test('★ والاحتياطيّةُ باقيةٌ — ملفٌّ بلا تنسيقٍ أفضلُ من زرٍّ لا يفعل شيئًا', () => {
  assert.match(EXCEL_SRC, /\.catch\(\(\) => inject\(`\$\{lib\}\/xlsx\.full\.min\.js`\)\)/);
});
