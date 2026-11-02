/**
 * اختبارات إصلاحات تقارير المخزون الجوهريّة (المرحلة ر) — بالأسماء الحقيقيّة
 * للحقول التي كان التقريرُ يقرؤها خطأً فيُنتج صفرًا أو فرقًا كاذبًا أو مضاعفًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { STOCK_REPORTS } from './stockReports.js';

const def = (id) => STOCK_REPORTS.find((r) => r.id === id);

test('★★ AQ-12: المحجوزُ يُقرأ من qtyReserved لا reserved، فالمتاحُ يخصمه', () => {
  const report = def('location-balances');
  const [row] = report.rows({
    balances: [{ sku: 'A', warehouse: 'WH001', qty: 100, qtyReserved: 30, unitCost: 2 }],
  });
  assert.equal(row.reserved, 30, 'المحجوزُ من qtyReserved (كان صفرًا بقراءة reserved)');
  assert.equal(row.available, 70, 'المتاح = ١٠٠ − ٣٠');
  assert.equal(row.value, 200);
});

test('★ AQ-12: الرجوعُ إلى reserved توافقيٌّ إن غاب qtyReserved', () => {
  const [row] = def('location-balances').rows({ balances: [{ sku: 'A', qty: 50, reserved: 20 }] });
  assert.equal(row.reserved, 20);
  assert.equal(row.available, 30);
});

test('★★ AQ-11: عدُّ CC من count2/count1، وADJ من actualQty — لا countedQty الغائب', () => {
  const report = def('count-variance');
  const rows = report.rows({
    documents: [
      { type: 'CC', number: 'CC-1', state: 'approved', header: { countDate: '2026-10-21' }, lines: [{ sku: 'A', bookQty: 100, count2: 90 }] },
      { type: 'ADJ', number: 'ADJ-1', state: 'done', header: { adjustmentDate: '2026-10-22' }, lines: [{ sku: 'A', bookQty: 100, actualQty: 90 }] },
    ],
  });
  const cc = rows.find((r) => r.docType === 'CC');
  const adj = rows.find((r) => r.docType === 'ADJ');
  assert.equal(cc.countedQty, 90, 'CC: count2');
  assert.equal(cc.variance, -10, 'عجزٌ ١٠ لا −١٠٠ كاذب');
  assert.equal(adj.countedQty, 90, 'ADJ: actualQty');
  assert.equal(adj.variance, -10);
});

test('★★★ AQ-14: عمودُ النوع يفصل CC عن ADJ، فيُرشَّح النوعُ الواحد فلا يُضاعَف الفرق', () => {
  const report = def('count-variance');
  const rows = report.rows({
    documents: [
      { type: 'CC', number: 'CC-1', state: 'approved', header: { countDate: '2026-10-21' }, lines: [{ sku: 'A', bookQty: 100, count2: 98 }] },
      { type: 'ADJ', number: 'ADJ-1', state: 'done', header: { adjustmentDate: '2026-10-22' }, lines: [{ sku: 'A', bookQty: 100, actualQty: 98 }] },
    ],
  });
  // صفّان متمايزان بالنوع — المستخدمُ يرشّح ADJ وحدَها للفرق الصافي (−٢) لا −٤.
  assert.deepEqual(rows.map((r) => r.docType).sort(), ['ADJ', 'CC']);
  const adjOnly = rows.filter((r) => r.docType === 'ADJ');
  assert.equal(adjOnly.reduce((s, r) => s + r.variance, 0), -2, 'ADJ وحدَها = الفرق الصافي مرّةً واحدة');
  // وعمودُ النوع مُعلَنٌ في الأعمدة والمرشّحات.
  assert.ok(report.columns.some((c) => c.key === 'docType'));
  assert.ok(report.filters.some((f) => f.key === 'docType'));
});
