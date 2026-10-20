/**
 * اختباراتُ تقرير أصول إدارة المستودعات — والمصنَّفُ **مقروءًا من بايتاته**.
 *
 * وأثقلُ ما هنا أنّ التقريرَ **لا يُخفي ما يكسر التتبّع**: عهدةٌ بلا رقمِ
 * أصلٍ تُذكر بعمودٍ يقول «لا»، وعهدةٌ ترقِّم مجهولًا تُعدّ في الملخّص. فتقريرٌ
 * يُرسل للإدارة ويُظهر كلَّ شيءٍ مرتّبًا بينما الربطُ مكسورٌ أسوأُ من لا تقرير.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { buildReportWorkbook } from './veneciaReportExcel.js';
import {
  WH_ASSET_COLUMNS,
  WH_CUSTODY_COLUMNS,
  buildWhReport,
  whAssetRows,
  whCustodyRows,
} from './whReport.js';
import { custodyIndex } from './whDepartment.js';

const asset = (over = {}) => ({
  id: 'BRZ-0001',
  assetName: 'جهاز مسح باركود',
  brand: 'Zebra',
  serial: 'ZB-77',
  qty: 1,
  condition: 'جيد',
  department: 'مخازن',
  location: 'المستودع',
  notes: '',
  equipmentKind: 'handheld',
  specs: { model: 'TC21', imei: '3561' },
  ...over,
});

const custody = (over = {}) => ({
  number: 'CUST-2026-0001',
  employeeName: 'أحمد الشريف',
  employeeRole: 'أمين مخزن',
  itemKind: 'جهاز مسح باركود (PDA)',
  itemDesc: 'Zebra TC21',
  state: 'active',
  issueDate: '2026-10-01',
  assetNo: 'BRZ-0001',
  value: 1200,
  ...over,
});

function roundTrip(wb) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const back = XLSX.read(buf, { type: 'buffer' });
  return {
    names: back.SheetNames,
    sheet: (n) => XLSX.utils.sheet_to_json(back.Sheets[n], { header: 1, defval: '' }),
  };
}

// ── الصفوف ───────────────────────────────────────────────────────────────

test('صفُّ الأصل يحمل النوعَ والتفاصيلَ والحامل', () => {
  const idx = custodyIndex([custody()]);
  const [row] = whAssetRows([asset()], idx);
  assert.deepEqual(Object.keys(row), [...WH_ASSET_COLUMNS]);
  assert.equal(row['نوع المعدّة'], 'جهاز مسح محمول (PDA)');
  assert.equal(row['التفاصيل'], 'الموديل: TC21 · IMEI: 3561');
  assert.equal(row['بيد'], 'أحمد الشريف');
  assert.equal(row['سند العهدة'], 'CUST-2026-0001');
});

test('★ وأصلٌ حرٌّ يخرج بخانتَي حاملٍ فارغتين لا بنصٍّ مخترَع', () => {
  const [row] = whAssetRows([asset({ id: 'BRZ-0009' })], custodyIndex([custody()]));
  assert.equal(row['بيد'], '');
  assert.equal(row['سند العهدة'], '');
});

test('★★★ وصفُّ العهدة يقول صراحةً أمربوطةٌ هي أم لا', () => {
  const [linked, loose] = whCustodyRows([custody(), custody({ number: 'CUST-2', assetNo: '' })]);
  assert.deepEqual(Object.keys(linked), [...WH_CUSTODY_COLUMNS]);
  assert.equal(linked['مربوطة'], 'نعم');
  assert.equal(linked['رقم الأصل'], 'BRZ-0001');
  assert.equal(loose['مربوطة'], 'لا');
  assert.equal(loose['رقم الأصل'], '');
});

test('وحالةُ السند تُترجَم: مفتوحةٌ أو ما أُغلقت به', () => {
  assert.equal(whCustodyRows([custody()])[0]['الحالة'], 'مفتوحة');
  assert.equal(whCustodyRows([custody({ state: 'returned' })])[0]['الحالة'], 'returned');
});

// ── الموديل ──────────────────────────────────────────────────────────────

test('★★★ والملخّصُ يُظهر ما يكسر التتبّع لا يُخفيه', () => {
  const assets = [asset(), asset({ id: 'BRZ-0002' }), asset({ id: 'BRZ-0003', department: 'مخزن فينسيا' })];
  const cust = [custody(), custody({ number: 'CUST-2', assetNo: '' }), custody({ number: 'CUST-3', assetNo: 'BRZ-9999' })];
  const rep = buildWhReport(assets, cust, { asOf: '2026-10-20' });
  const get = (l) => rep.summary.find((s) => s.label === l)?.value;
  assert.equal(get('أصولُ الإدارة'), 2);
  assert.equal(get('بيد موظّفين'), 1);
  assert.equal(get('حرٌّ بلا حامل'), 1);
  assert.equal(get('عهدٌ بلا رقمِ أصل'), 1);
  assert.equal(get('عهدٌ ترقِّم مجهولًا'), 1);
  assert.equal(get('أصولٌ بإدارةٍ مشابهة'), 1);
  assert.deepEqual(rep.dangling, ['BRZ-9999']);
});

test('★ والمكهَّنُ خارجَ ورقة الأصول وخارجَ العدّ', () => {
  const rep = buildWhReport([asset(), asset({ id: 'BRZ-0002', archived: true })], [], { asOf: '2026-10-20' });
  assert.equal(rep.assetsSheet.rows.length, 1);
  assert.equal(rep.summary.find((s) => s.label === 'أصولُ الإدارة').note, '1 مكهَّن');
});

test('★★ وورقةُ العُهد تحصر عهدَ هذه الإدارة: المربوطَ بأصلٍ فيها والمفتوحَ بلا رقم', () => {
  const rep = buildWhReport(
    [asset()],
    [
      custody(),                                            // مربوطةٌ بأصلٍ عندنا
      custody({ number: 'CUST-2', assetNo: '' }),            // مفتوحةٌ بلا رقم
      custody({ number: 'CUST-3', assetNo: 'BRZ-9999' }),    // ترقِّم مجهولًا — ليست عندنا
      custody({ number: 'CUST-4', assetNo: '', state: 'returned' }), // مغلقةٌ بلا رقم
    ],
    { asOf: '2026-10-20' }
  );
  assert.deepEqual(rep.cardsSheet.rows.map((r) => r['رقم السند']), ['CUST-2026-0001', 'CUST-2']);
});

test('والنطاقُ والتاريخُ يُقالان، وبلا `asOf` لا يُخترع تاريخ', () => {
  const rep = buildWhReport([asset()], [], { asOf: '2026-10-20', scope: 'المحمول فقط' });
  assert.equal(rep.asOf, '2026-10-20');
  assert.equal(rep.scope, 'المحمول فقط');
  assert.equal(buildWhReport([], []).asOf, '');
});

// ── المصنَّف ─────────────────────────────────────────────────────────────

test('★★★ المصنَّفُ ثلاثُ أوراقٍ تُقرأ من بايتاته', () => {
  const rep = buildWhReport([asset()], [custody()], { asOf: '2026-10-20' });
  const out = roundTrip(buildReportWorkbook(XLSX, rep));
  assert.deepEqual(out.names, ['الملخّص', 'الأصول', 'العُهد']);
});

test('وورقةُ الأصول: ترويسةٌ ثمّ صفوفٌ ثمّ مجموعُ الكمّيّة رقمًا', () => {
  const rep = buildWhReport([asset({ qty: 3 }), asset({ id: 'BRZ-0002', qty: 2 })], [], { asOf: '2026-10-20' });
  const rows = roundTrip(buildReportWorkbook(XLSX, rep)).sheet('الأصول');
  assert.deepEqual(rows[0], [...WH_ASSET_COLUMNS]);
  assert.equal(rows.length, 1 + 2 + 1);
  const totals = rows[rows.length - 1];
  assert.equal(totals[0], 'المجموع (2)');
  assert.equal(totals[WH_ASSET_COLUMNS.indexOf('الكمية')], 5);
  assert.equal(typeof totals[WH_ASSET_COLUMNS.indexOf('الكمية')], 'number');
});

test('★★ وورقةُ العُهد تُجمِع القيمةَ رقمًا — فالمجموعُ يُقرأ في إكسل بلا تحويل', () => {
  const rep = buildWhReport([asset()], [custody({ value: 1200 })], { asOf: '2026-10-20' });
  const rows = roundTrip(buildReportWorkbook(XLSX, rep)).sheet('العُهد');
  const totals = rows[rows.length - 1];
  assert.equal(totals[WH_CUSTODY_COLUMNS.indexOf('القيمة')], 1200);
  assert.equal(typeof totals[WH_CUSTODY_COLUMNS.indexOf('القيمة')], 'number');
});

test('والملخّصُ يذكر العنوانَ وكلَّ بنوده', () => {
  const rep = buildWhReport([asset()], [custody()], { asOf: '2026-10-20' });
  const flat = roundTrip(buildReportWorkbook(XLSX, rep)).sheet('الملخّص').map((r) => r.join(' | ')).join('\n');
  assert.ok(flat.includes('إدارة المستودعات'));
  assert.ok(flat.includes('2026-10-20'));
  for (const s of rep.summary) assert.ok(flat.includes(s.label), `غاب بندُ «${s.label}»`);
});

test('وجردٌ فارغٌ يُخرج تقريرًا لا يرمي', () => {
  const out = roundTrip(buildReportWorkbook(XLSX, buildWhReport([], [], { asOf: '2026-10-20' })));
  assert.deepEqual(out.names, ['الملخّص', 'الأصول', 'العُهد']);
  assert.deepEqual(out.sheet('الأصول')[0], [...WH_ASSET_COLUMNS]);
});
