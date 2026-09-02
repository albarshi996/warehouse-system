/**
 * اختبارات جلسة الممرّ.
 *
 * جوهرُها ثلاثة: **الجلسةُ ممرٌّ لا خانة** · **والقيدُ يُجمَع ولا يُستبدل**
 * (فالتصحيح قيدٌ عكسيّ) · **والدفتريُّ من أوّل قيدٍ لا آخره**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_SESSION_TYPE,
  findSessionFor,
  linesFromScans,
  scanPayload,
  scanProblems,
  scansOfBin,
  scopePrefix,
  sessionCovers,
  sessionDraft,
  sessionLabel,
  sessionScopeFor,
  sessionSummary,
} from './binSession.js';

const OPEN = { id: 'op1', type: BIN_SESSION_TYPE, status: 'open', code: 'K7M2QX', warehouse: 'RH', zone: 'A' };
const LABELS = { zone: 'الممرّ', rack: 'الجهة', bay: 'الرفّ', level: 'الخانة' };
const RAHBA = { code: 'WH001', name: 'الرحبة', binPrefix: 'RH' };

test('★★ النطاقُ أوّلُ مقطعين — المستودعُ والممرّ', () => {
  assert.deepEqual(sessionScopeFor('RH-A-R-01-01'), { warehouse: 'RH', zone: 'A' });
  assert.deepEqual(sessionScopeFor('TR-J-L-05-10'), { warehouse: 'TR', zone: 'J' });
  assert.deepEqual(sessionScopeFor('ليس كودًا'), { warehouse: '', zone: '' }, 'ولا تُخترع جلسةٌ لكودٍ معطوب');
  assert.equal(scopePrefix({ warehouse: 'RH', zone: 'A' }), 'RH-A');
});

test('التسميةُ تُقرأ من المستودع — «الممرّ A · الرحبة»', () => {
  assert.equal(sessionLabel({ warehouse: 'RH', zone: 'A' }, RAHBA, LABELS), 'الممرّ A · الرحبة');
  assert.equal(sessionLabel({ warehouse: 'RH', zone: 'A' }, null, {}), 'الممرّ A · RH', 'وبلا مستودعٍ تُقال البادئة');
});

test('★★★ جلسةٌ واحدةٌ للممرّ — فعاملان فيه يكتبان في سجلٍّ واحد', () => {
  assert.equal(sessionCovers(OPEN, 'RH-A-R-01-01'), true);
  assert.equal(sessionCovers(OPEN, 'RH-A-L-05-10'), true, 'كلُّ خانات الممرّ A');
  assert.equal(sessionCovers(OPEN, 'RH-B-R-01-01'), false, 'وممرٌّ آخر جلسةٌ أخرى');
  assert.equal(sessionCovers(OPEN, 'TR-A-R-01-01'), false, 'ومستودعٌ آخر كذلك');
  assert.equal(sessionCovers({ ...OPEN, status: 'closed' }, 'RH-A-R-01-01'), false, 'والمقفلةُ لا تُستأنف');
  assert.equal(sessionCovers({ ...OPEN, type: 'count' }, 'RH-A-R-01-01'), false, 'ولا تُخلط بجرد الشاشة العامّ');
});

test('الاستئنافُ يجد المفتوحةَ ولا يفتح ثانيةً', () => {
  const ops = [{ ...OPEN, id: 'other', zone: 'B' }, OPEN];
  assert.equal(findSessionFor(ops, 'RH-A-R-01-01')?.id, 'op1');
  assert.equal(findSessionFor(ops, 'RH-Z-R-01-01'), null);
  assert.equal(findSessionFor([], 'RH-A-R-01-01'), null);
});

test('★★ حمولةُ المسحة تحمل الخانةَ والدفعةَ والدفتريّ', () => {
  const p = scanPayload({
    bin: 'rh-a-r-01-01',
    item: { sku: 'wnw-001', barcode: '6281006521', nameAr: 'زيت', batch: 'B1', expiry: '2027-06-30' },
    qty: 9,
    bookQty: 12,
  });
  assert.equal(p.bin, 'RH-A-R-01-01', 'ويُطبَّع الكود');
  assert.equal(p.sku, 'WNW-001');
  assert.equal(p.name, 'زيت');
  assert.equal(p.qty, 9, 'المعدود');
  assert.equal(p.bookQty, 12, 'والدفتريُّ لحظةَ العدّ');
  assert.equal(p.opType, BIN_SESSION_TYPE);
});

test('أعطابُ المسحة تقول الصواب', () => {
  assert.deepEqual(scanProblems({ bin: 'RH-A-R-01-01', item: { sku: 'A' }, qty: 1 }), []);
  assert.match(scanProblems({ bin: '', item: { sku: 'A' }, qty: 1 })[0], /لا خانةَ محدَّدة/);
  assert.match(scanProblems({ bin: 'RH-A-R-01-01', item: {}, qty: 1 })[0], /لم يُعرَف الصنف/);
  assert.match(scanProblems({ bin: 'RH-A-R-01-01', item: { sku: 'A' }, qty: 0 })[0], /أكبر من صفر/);
});

const SCANS = [
  { bin: 'RH-A-R-01-01', sku: 'WNW-001', barcode: '6281006521', name: 'زيت', batch: 'B1', expiry: '2027-06-30', qty: 5, bookQty: 12 },
  { bin: 'RH-A-R-01-01', sku: 'WNW-001', barcode: '6281006521', name: 'زيت', batch: 'B1', expiry: '2027-06-30', qty: 4, bookQty: 99 },
  { bin: 'RH-A-R-01-01', sku: 'WNW-002', barcode: '6281006538', name: 'سكّر', batch: '', qty: 3, bookQty: 3 },
  { bin: 'RH-A-R-01-02', sku: 'WNW-003', barcode: '6281006545', name: 'أرزّ', batch: '', qty: 7, bookQty: 0 },
];

test('★★ ملخّصُ الجلسة: كم مسحةً وكم خانةً وكم صنفًا وكم عُدّ', () => {
  const s = sessionSummary(SCANS);
  assert.equal(s.scanCount, 4);
  assert.equal(s.binCount, 2);
  assert.equal(s.skuCount, 3);
  assert.equal(s.counted, 19, '5 + 4 + 3 + 7');
  assert.deepEqual(sessionSummary([]), { scanCount: 0, binCount: 0, skuCount: 0, counted: 0 });
});

test('قيودُ خانةٍ بعينها — «ما عددتَه هنا»', () => {
  assert.equal(scansOfBin(SCANS, 'RH-A-R-01-01').length, 3);
  assert.equal(scansOfBin(SCANS, 'RH-A-R-01-02').length, 1);
  assert.deepEqual(scansOfBin(SCANS, ''), []);
});

test('★★★ المسحاتُ تُجمَع في بندٍ واحد — والعاملُ قد يمسح ثلاثةَ كراتين', () => {
  const lines = linesFromScans(SCANS);
  assert.equal(lines.length, 3, 'ثلاثةُ بنودٍ من أربع مسحات');
  const oil = lines.find((l) => l.sku === 'WNW-001');
  assert.equal(oil.count1, 9, '5 + 4 — جمعٌ لا استبدال');
  assert.equal(oil.bookQty, 12, '★ والدفتريُّ من **أوّل** قيدٍ لا آخره');
  assert.equal(oil.bin, 'RH-A-R-01-01');
  assert.equal(oil.batch, 'B1');
});

test('★★ وكلُّ بندٍ يحمل خانتَه — فالجلسةُ ممرٌّ والبنودُ خاناتُه', () => {
  const lines = linesFromScans(SCANS);
  assert.deepEqual(lines.map((l) => l.bin), ['RH-A-R-01-01', 'RH-A-R-01-01', 'RH-A-R-01-02']);
  assert.deepEqual(linesFromScans([{ sku: 'A', qty: 1 }]), [], 'ومسحةٌ بلا خانةٍ لا تُنتج بندًا');
});

test('★★★ محضرُ الجلسة: zone هي الممرّ، والبنودُ تحمل خاناتِها', () => {
  const draft = sessionDraft(OPEN, SCANS, { warehouseCode: 'WH001', today: '2026-09-02' });
  assert.equal(draft.type, 'CC');
  assert.equal(draft.header.zone, 'RH-A', 'الممرُّ لا خانةٌ واحدة');
  assert.equal(draft.header.warehouse, 'WH001', 'وكودُ البوّابة لا بادئةُ الملصق');
  assert.equal(draft.header.sessionCode, 'K7M2QX');
  assert.equal(draft.lines.length, 3);
  assert.equal(sessionDraft(OPEN, [], {}), null, 'ولا محضرَ بلا قيد');
});
