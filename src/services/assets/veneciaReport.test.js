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
  buildVeneciaReport,
  cardReportRows,
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
  assert.deepEqual(out.names, ['الملخّص', 'الجرد', 'بطاقات الحركة']);
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
  for (const [sheet, cols] of Object.entries(NUMERIC_COLUMNS)) {
    const known = sheet === 'الجرد' ? VENECIA_EXPORT_COLUMNS : CARD_REPORT_COLUMNS;
    for (const c of cols) assert.ok(known.includes(c), `عمودٌ رقميٌّ لا وجودَ له: ${c}`);
  }
});

test('وجردٌ فارغٌ يُخرج تقريرًا لا يرمي', () => {
  const out = roundTrip(buildReportWorkbook(XLSX, buildVeneciaReport([], [], { asOf: '2026-10-19' })));
  assert.deepEqual(out.names, ['الملخّص', 'الجرد', 'بطاقات الحركة']);
  assert.deepEqual(out.sheet('الجرد')[0], VENECIA_EXPORT_COLUMNS);
});

test('اسمُ الملفّ يُنظَّف وبامتدادٍ واحد', () => {
  assert.equal(reportFileName('تقرير-2026-10-19'), 'تقرير-2026-10-19.xlsx');
  assert.equal(reportFileName('a/b:c'), 'abc.xlsx');
  assert.equal(reportFileName(''), 'تقرير-مخزن-فينسيا.xlsx');
});
