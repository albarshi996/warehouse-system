/**
 * اختبارات سجلّ المتابعة — منطق خالص.
 *
 * الخاصّيّة المحورية: **الجدول مرجعٌ يُحتجّ به.** فلا كمّيّةَ بلا وحدة، ولا
 * جمعَ لكرتونٍ مع قطعة، ولا وقتَ نسبيٍّ وحدَه، ولا قيدَ سالبٍ يُخلط بقراءة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLogRows,
  filterLogRows,
  logPeople,
  logTotals,
  workByPerson,
  logExportRows,
} from './monitorLog.js';

const ms = (s) => s?.at ?? null;

const SCANS = [
  { id: 'a', barcode: '801', sku: 'S1', name: 'شامبو', qty: 2, uom: 'CTN', baseQty: 24, byName: 'محمد', at: 1000 },
  { id: 'b', barcode: '802', sku: 'S2', name: 'صابون', qty: 5, uom: 'PCE', baseQty: 5, byName: 'عبدالله', at: 2000 },
  { id: 'c', barcode: '801', sku: 'S1', name: 'شامبو', qty: -12, uom: 'PCE', baseQty: -12, byName: 'رمزي', at: 3000 },
];

/* ───────────────── بناء الصفوف ───────────────── */

test('★ الأحدثُ أوّلًا — وهو ترتيبُ المتابعة', () => {
  const rows = buildLogRows(SCANS, { toMillis: ms });
  assert.deepEqual(rows.map((r) => r.id), ['c', 'b', 'a']);
});

test('★★ الوحدةُ محمولةٌ مع الكمّيّة — «٢» وحدها لا تصلح مرجعًا', () => {
  const [, , first] = buildLogRows(SCANS, { toMillis: ms });
  assert.equal(first.qty, 2);
  assert.equal(first.uom, 'CTN');
  assert.equal(first.baseQty, 24);
  assert.equal(first.base, 24, 'الجمع يقع على الأساس');
});

test('★ الوقتُ المطلق محمولٌ رقمًا — النسبيُّ للعين والمطلقُ للورقة', () => {
  const rows = buildLogRows(SCANS, { toMillis: ms });
  assert.equal(rows[0].atMs, 3000);
});

test('★ القيدُ السالب يُوسم «خصمًا» ولا يُخلط بقراءة', () => {
  const rows = buildLogRows(SCANS, { toMillis: ms });
  assert.equal(rows.find((r) => r.id === 'c').direction, 'out');
  assert.equal(rows.find((r) => r.id === 'a').direction, 'in');
});

test('وحدةٌ بلا معامل تُوسم `uncertain` ولا تُخفى (ق-٢)', () => {
  const [row] = buildLogRows([{ id: 'x', qty: 3, uom: 'CTN', baseQty: null, at: 1 }], { toMillis: ms });
  assert.equal(row.uncertain, true);
  assert.equal(row.base, 3, 'يُقرأ خامًّا ولا يُخترع له تحويل');
});

test('قيدٌ بلا وحدةٍ أصلًا ليس `uncertain` — لا وحدةَ تُحوَّل', () => {
  const [row] = buildLogRows([{ id: 'x', qty: 3, at: 1 }], { toMillis: ms });
  assert.equal(row.uncertain, false);
});

test('★ المعلَّق يبقى ظاهرًا موسومًا — إخفاؤه يُنقص الجدول عن الواقع', () => {
  const rows = buildLogRows([{ id: 'p', qty: 1, _pending: true, at: null }], { toMillis: ms });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pending, true);
});

test('★ ما لا طابعَ له يُقدَّم — فهو آخرُ ما وقع', () => {
  const rows = buildLogRows(
    [
      { id: 'old', qty: 1, at: 5000 },
      { id: 'new', qty: 1, at: null, _pending: true },
    ],
    { toMillis: ms }
  );
  assert.equal(rows[0].id, 'new');
});

test('الاسمُ الفارغ يصير «غير معروف»، والصنفُ بلا اسمٍ يُعرض بباركوده', () => {
  const [row] = buildLogRows([{ id: 'x', barcode: '999', qty: 1, at: 1 }], { toMillis: ms });
  assert.equal(row.byName, 'غير معروف');
  assert.equal(row.name, '999');
});

test('لا ينهار على مُدخَلٍ غير قائمة ولا بلا محوِّل وقت', () => {
  assert.deepEqual(buildLogRows(null), []);
  assert.equal(buildLogRows([{ id: 'x', qty: 1 }])[0].atMs, null);
});

/* ───────────────── التصفية ───────────────── */

const ROWS = buildLogRows(SCANS, { toMillis: ms });

test('تصفيةٌ بالشخص', () => {
  assert.deepEqual(filterLogRows(ROWS, { person: 'محمد' }).map((r) => r.id), ['a']);
  assert.equal(filterLogRows(ROWS, { person: 'all' }).length, 3);
  assert.equal(filterLogRows(ROWS, {}).length, 3);
});

test('★ البحثُ يشمل الاسمَ والباركودَ والكودَ واسمَ العادّ', () => {
  assert.equal(filterLogRows(ROWS, { term: 'شامبو' }).length, 2);
  assert.equal(filterLogRows(ROWS, { term: '802' }).length, 1);
  assert.equal(filterLogRows(ROWS, { term: 's2' }).length, 1, 'غيرُ حسّاسٍ لحالة الأحرف');
  assert.equal(filterLogRows(ROWS, { term: 'رمزي' }).length, 1);
});

test('تصفيةٌ بالاتّجاه', () => {
  assert.deepEqual(filterLogRows(ROWS, { direction: 'out' }).map((r) => r.id), ['c']);
  assert.equal(filterLogRows(ROWS, { direction: 'in' }).length, 2);
});

test('الشخصُ والنصُّ يجتمعان', () => {
  assert.equal(filterLogRows(ROWS, { person: 'محمد', term: 'صابون' }).length, 0);
  assert.equal(filterLogRows(ROWS, { person: 'محمد', term: 'شامبو' }).length, 1);
});

/* ───────────────── المجاميع ───────────────── */

test('★★ الجمعُ بوحدة الأساس — لا يُجمع كرتونٌ مع قطعة', () => {
  const t = logTotals(ROWS);
  assert.equal(t.baseTotal, 24 + 5 - 12, 'الأساس لا الخام (2+5-12)');
  assert.equal(t.scanCount, 3);
  assert.equal(t.itemCount, 2, 'الباركود الواحد صنفٌ واحدٌ ولو تعدّدت قيودُه');
  assert.equal(t.peopleCount, 3);
});

test('المجهولُ يُعدّ ويُعلَن — فالمجموع يُقرأ مع تحفّظه', () => {
  const rows = buildLogRows([{ id: 'x', qty: 3, uom: 'CTN', baseQty: null, at: 1 }], { toMillis: ms });
  assert.equal(logTotals(rows).uncertain, 1);
});

test('يعدّ المعلَّق', () => {
  const rows = buildLogRows([{ id: 'p', qty: 1, _pending: true }], { toMillis: ms });
  assert.equal(logTotals(rows).pending, 1);
});

test('مجاميعُ الفارغ أصفارٌ لا انهيار', () => {
  const t = logTotals([]);
  assert.equal(t.scanCount, 0);
  assert.equal(t.baseTotal, 0);
  assert.equal(logTotals(null).itemCount, 0);
});

/* ───────────────── الأشخاص وتوزيع العمل ───────────────── */

test('قائمةُ الأشخاص مرتّبةٌ بالأكثر قيودًا', () => {
  const rows = buildLogRows(
    [
      { id: '1', qty: 1, byName: 'محمد', at: 1 },
      { id: '2', qty: 1, byName: 'محمد', at: 2 },
      { id: '3', qty: 1, byName: 'رمزي', at: 3 },
    ],
    { toMillis: ms }
  );
  assert.deepEqual(logPeople(rows), [
    { name: 'محمد', count: 2 },
    { name: 'رمزي', count: 1 },
  ]);
});

test('★ توزيعُ العمل يُجيب «ماذا قرأ محمد بالضبط»', () => {
  const w = workByPerson(ROWS);
  const m = w.find((x) => x.name === 'محمد');
  assert.equal(m.scans, 1);
  assert.equal(m.base, 24, 'بوحدة الأساس');
  assert.equal(m.items, 1);
  const r = w.find((x) => x.name === 'رمزي');
  assert.equal(r.base, -12, 'الخصمُ يُنسب لصاحبه سالبًا لا يُخفى');
});

/* ───────────────── صفوف التصدير ───────────────── */

test('★★ التصديرُ يحمل الوحدةَ والأساسَ والاتّجاه — وهي ما يجعله مرجعًا', () => {
  const [row] = logExportRows([ROWS[0]], { formatTime: (v) => `t${v}` });
  assert.equal(row['الوقت'], 't3000');
  assert.equal(row['العادّ'], 'رمزي');
  assert.equal(row['الكمّيّة'], -12);
  assert.equal(row['الوحدة'], 'PCE');
  assert.equal(row['بوحدة الأساس'], -12);
  assert.equal(row['الاتّجاه'], 'خصم');
});

test('المجهولُ يُصدَّر «—» لا صفرًا', () => {
  const rows = buildLogRows([{ id: 'x', qty: 3, uom: 'CTN', baseQty: null, at: 1 }], { toMillis: ms });
  const [row] = logExportRows(rows);
  assert.equal(row['بوحدة الأساس'], '—');
  assert.match(row['ملاحظة'], /وحدةٌ بلا معامل/);
});

test('الملاحظاتُ تجتمع بفاصلٍ واحد ولا تترك فراغًا حين لا شيء', () => {
  const rows = buildLogRows(
    [{ id: 'x', qty: 1, uomMissing: true, collision: true, _pending: true, at: 1 }],
    { toMillis: ms }
  );
  const [row] = logExportRows(rows);
  assert.match(row['ملاحظة'], /صنفٌ بلا وحدة أساس · باركودٌ تصادم · لم يصل الخادم بعد/);
  assert.equal(logExportRows([ROWS[0]])[0]['ملاحظة'], '');
});

test('لا صفوفَ من مُدخَلٍ غير قائمة', () => {
  assert.deepEqual(logExportRows(null), []);
  assert.deepEqual(workByPerson(undefined), []);
  assert.deepEqual(logPeople(null), []);
});
