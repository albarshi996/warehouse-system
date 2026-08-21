import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  documentLineProgress,
  legacyLineContributions,
  sourceLineQuantity,
  targetLineQuantity,
  lineOutcomes,
  progressOutcomes,
} from './documentLineProgress.js';

const po = {
  id: 'po-1', type: 'PO', number: 'PO-1',
  lines: [{ lineId: 'po-line-1', sku: 'A', description: 'صنف أ', qty: 100, uom: 'قطعة' }],
};

function relation(id, quantity, targetId = `grn-${id}`, targetLineId = `grn-line-${id}`) {
  return {
    id,
    linkType: 'BASE',
    source: { documentId: 'po-1', documentType: 'PO', lineId: 'po-line-1', lineNumber: 1 },
    target: { documentId: targetId, documentType: 'GRN', lineId: targetLineId, lineNumber: 1 },
    linkedQuantity: quantity,
  };
}

test('100 ثم 60 يعطي تنفيذًا جزئيًا ومفتوحًا 40 مع drilldown', () => {
  const progress = documentLineProgress(po, [relation('r-60', 60)]);
  assert.deepEqual(progress.totals, {
    requested: 100,
    executed: 60,
    accepted: 0,
    rejected: 0,
    open: 40,
    excess: 0,
    unaccepted: null,
    status: 'partial',
  });
  assert.equal(progress.lines[0].contributions[0].relationId, 'r-60');
  assert.equal(progress.lines[0].contributions[0].target.documentId, 'grn-r-60');
});

test('60 ثم 40 من طفلين من النوع نفسه يكمل 100 بلا إسقاط أحدهما', () => {
  const progress = documentLineProgress(po, [relation('r-60', 60), relation('r-40', 40)]);
  assert.equal(progress.totals.executed, 100);
  assert.equal(progress.totals.open, 0);
  assert.equal(progress.totals.status, 'complete');
  assert.equal(progress.lines[0].contributions.length, 2);
});

test('التجاوز لا يُخفى: 60 + 41 يظهر excess=1 ومشكلة صريحة', () => {
  const progress = documentLineProgress(po, [relation('r-60', 60), relation('r-41', 41)]);
  assert.equal(progress.totals.status, 'over');
  assert.equal(progress.totals.excess, 1);
  assert.ok(progress.issues.includes('executed-exceeds-requested'));
});

test('طفل الجودة يفصل المفحوص إلى مقبول ومرفوض ويبقي غير المقبول ظاهرًا', () => {
  const grn = {
    id: 'grn-source', type: 'GRN', number: 'GRN-1',
    lines: [{ lineId: 'grn-source-line', sku: 'A', qtyReceived: 100 }],
  };
  const qc = {
    id: 'qc-1', type: 'QC', number: 'QC-1',
    lines: [{ lineId: 'qc-line', sku: 'A', qtyInspected: 60, qtyAccepted: 55, qtyRejected: 5 }],
  };
  const link = {
    id: 'grn-qc', linkType: 'BASE', linkedQuantity: 60,
    source: { documentId: grn.id, documentType: grn.type, lineId: 'grn-source-line' },
    target: { documentId: qc.id, documentType: qc.type, lineId: 'qc-line' },
  };
  const progress = documentLineProgress(grn, [link], [qc]);
  assert.equal(progress.totals.accepted, 55);
  assert.equal(progress.totals.rejected, 5);
  assert.equal(progress.totals.unaccepted, 45);
  assert.equal(progress.lines[0].contributions[0].classified, true);
});

test('فرعا QC يصنفان التخزين قبولًا وإشعار الرفض رفضًا', () => {
  const qc = {
    id: 'qc-source', type: 'QC', lines: [{ lineId: 'qc-source-line', sku: 'A', qtyInspected: 100 }],
  };
  const links = [
    {
      id: 'putaway', linkType: 'BASE', linkedQuantity: 90,
      source: { documentId: 'qc-source', documentType: 'QC', lineId: 'qc-source-line' },
      target: { documentId: 'put-1', documentType: 'PUTAWAY', lineId: 'put-line' },
    },
    {
      id: 'srn', linkType: 'TARGET', linkedQuantity: 10,
      source: { documentId: 'qc-source', documentType: 'QC', lineId: 'qc-source-line' },
      target: { documentId: 'srn-1', documentType: 'SRN', lineId: 'srn-line' },
    },
  ];
  const progress = documentLineProgress(qc, links);
  assert.equal(progress.totals.executed, 100);
  assert.equal(progress.totals.accepted, 90);
  assert.equal(progress.totals.rejected, 10);
});

test('REFERENCE وRETURN وREVERSAL وCORRECTION لا تُحتسب تنفيذًا تلقائيًا', () => {
  const links = ['REFERENCE', 'RETURN', 'REVERSAL', 'CORRECTION'].map((linkType, index) => ({
    ...relation(`other-${index}`, 100), linkType,
  }));
  const progress = documentLineProgress(po, links);
  assert.equal(progress.totals.executed, 0);
  assert.equal(progress.totals.open, 100);
});

test('المستندات القديمة تُقرأ بعلاقة links وبهوية فهرس دون mutation', () => {
  const oldPo = {
    id: 'po-old', type: 'PO', number: 'PO-OLD',
    lines: [{ sku: 'A', qty: 50 }, { sku: 'A', qty: 30 }],
  };
  const oldGrn = {
    id: 'grn-old', type: 'GRN', number: 'GRN-OLD',
    links: { PO: { id: 'po-old', number: 'PO-OLD' } },
    lines: [{ sku: 'A', qtyReceived: 20 }, { sku: 'A', qtyReceived: 10 }],
  };
  const snapshot = structuredClone({ oldPo, oldGrn });
  const progress = documentLineProgress(oldPo, [], [oldGrn]);
  assert.equal(progress.lines[0].executed, 20);
  assert.equal(progress.lines[1].executed, 10, 'التكرار الثاني لا يندمج في الأول');
  assert.ok(progress.lines.every((line) => line.contributions[0].legacy));
  assert.deepEqual({ oldPo, oldGrn }, snapshot, 'قراءة فقط بلا ترحيل أو mutation');
});

test('العلاقة السطرية الجديدة تفوز فلا يكرر fallback القديم كميتها', () => {
  const oldPo = { id: 'po-old', type: 'PO', lines: [{ sku: 'A', qty: 50 }] };
  const child = {
    id: 'grn-old', type: 'GRN', links: { PO: { id: 'po-old' } },
    lines: [{ sku: 'A', qtyReceived: 20 }],
  };
  const stored = {
    id: 'stored', linkType: 'BASE', linkedQuantity: 20,
    source: { documentId: 'po-old', documentType: 'PO', lineId: 'legacy-line-0001' },
    target: { documentId: 'grn-old', documentType: 'GRN', lineId: 'legacy-line-0001' },
  };
  assert.equal(legacyLineContributions(oldPo, [child], [stored]).length, 0);
  assert.equal(documentLineProgress(oldPo, [stored], [child]).totals.executed, 20);
});

test('خرائط الكمية تقرأ معنى كل مرحلة ولا تفترض qty دائمًا', () => {
  assert.equal(sourceLineQuantity('GRN', { qtyOrdered: 100, qtyReceived: 60 }), 60);
  assert.equal(sourceLineQuantity('PICK', { qtyRequested: 100, qtyPicked: 40 }), 40);
  assert.equal(targetLineQuantity('TRC', { qtyShipped: 50, qtyReceived: 47 }), 47);
  assert.equal(targetLineQuantity('PO', { qty: 12 }), 12);
});

test('مدخل فارغ آمن ولا يخترع سطرًا أو كمية', () => {
  const progress = documentLineProgress(null, null, null);
  assert.equal(progress.lines.length, 0);
  assert.equal(progress.totals.status, 'empty');
  assert.equal(progress.totals.requested, 0);
});


/* ═══════════ نتائج السطر مجموعةً بمصادرها (SAP-9 · ف‑٢١) ═══════════ */

test('★★ المثال الحاكم: 100 مستلَمة · 97 مقبولة · 3 مرفوضة — ولكلٍّ مصدره', () => {
  const po = {
    id: 'po1',
    type: 'PO',
    number: 'PO-2026-0009',
    lines: [{ lineId: 'L1', sku: 'S1', description: 'ستاند', qty: 100 }],
  };
  const relations = [
    { id: 'r1', linkType: 'TARGET', source: { documentId: 'po1', documentType: 'PO', lineId: 'L1' }, target: { documentId: 'g1', documentType: 'GRN', documentNumber: 'GRN-0007', lineId: 'x' }, linkedQuantity: 100 },
  ];
  const related = [{ id: 'g1', type: 'GRN', number: 'GRN-0007', lines: [{ sku: 'S1', qtyReceived: 100, qtyAccepted: 97, qtyRejected: 3 }] }];

  const progress = documentLineProgress(po, relations, related);
  const [line] = progress.lines;
  const out = lineOutcomes(line);

  assert.equal(out.requested, 100);
  assert.equal(out.executed.qty, 100, 'المستلَم');
  assert.equal(out.open, 0, 'لا مفتوح بعد استلام الكلّ');
  // ولكلّ رقمٍ مستنده — وإلا فهو رقمٌ مقطوع الصلة لا يصلح للعرض.
  assert.equal(out.executed.documents[0].documentNumber, 'GRN-0007');
  assert.equal(out.executed.documents[0].documentId, 'g1');
  assert.equal(out.executed.documents[0].qty, 100);
});

test('★★ لا رقمَ بلا مصدر — كلّ مجموعةٍ تحمل مستنداتها', () => {
  const po = { id: 'p', type: 'PO', number: 'PO-1', lines: [{ lineId: 'L1', sku: 'S1', qty: 60 }] };
  const relations = [
    { id: 'a', linkType: 'TARGET', source: { documentId: 'p', documentType: 'PO', lineId: 'L1' }, target: { documentId: 'g1', documentType: 'GRN', documentNumber: 'GRN-1', lineId: 'x' }, linkedQuantity: 40 },
    { id: 'b', linkType: 'TARGET', source: { documentId: 'p', documentType: 'PO', lineId: 'L1' }, target: { documentId: 'g2', documentType: 'GRN', documentNumber: 'GRN-2', lineId: 'y' }, linkedQuantity: 20 },
  ];
  const out = lineOutcomes(documentLineProgress(po, relations, []).lines[0]);
  assert.equal(out.executed.qty, 60);
  assert.equal(out.executed.documents.length, 2, 'استلامان يظهران استلامَين لا واحدًا');
  assert.deepEqual(out.executed.documents.map((d) => d.documentNumber).sort(), ['GRN-1', 'GRN-2']);
  assert.equal(out.executed.documents.reduce((s, d) => s + d.qty, 0), 60, 'المجموع يطابق الرقم المعروض');
});

test('★ استلامان لنفس المستند يُجمعان في صفٍّ واحد لا صفّين', () => {
  const po = { id: 'p', type: 'PO', number: 'PO-1', lines: [{ lineId: 'L1', sku: 'S1', qty: 50 }] };
  const relations = [
    { id: 'a', linkType: 'TARGET', source: { documentId: 'p', documentType: 'PO', lineId: 'L1' }, target: { documentId: 'g1', documentType: 'GRN', documentNumber: 'GRN-1', lineId: 'x' }, linkedQuantity: 30 },
    { id: 'b', linkType: 'TARGET', source: { documentId: 'p', documentType: 'PO', lineId: 'L1' }, target: { documentId: 'g1', documentType: 'GRN', documentNumber: 'GRN-1', lineId: 'y' }, linkedQuantity: 20 },
  ];
  const out = lineOutcomes(documentLineProgress(po, relations, []).lines[0]);
  assert.equal(out.executed.documents.length, 1);
  assert.equal(out.executed.documents[0].qty, 50);
});

test('★ سطرٌ بلا تنفيذ: أرقامٌ صفريّة ومصادرُ فارغة لا undefined', () => {
  const out = lineOutcomes({ requested: 20, open: 20, contributions: [] });
  assert.equal(out.executed.qty, 0);
  assert.deepEqual(out.executed.documents, []);
  assert.deepEqual(out.accepted.documents, []);
  assert.deepEqual(out.rejected.documents, []);
  assert.equal(out.open, 20);
  // ومدخلٌ فاسد لا يُسقط الشاشة.
  for (const bad of [null, undefined, {}, { contributions: 'س' }]) {
    const o = lineOutcomes(bad);
    assert.equal(o.executed.qty, 0);
    assert.ok(Array.isArray(o.rejected.documents));
  }
});

test('★★ progressOutcomes تحفظ ترتيب الأسطر — فالصفّ الثالث هو الثالث', () => {
  const po = { id: 'p', type: 'PO', number: 'PO-1', lines: [{ lineId: 'a', sku: 'A', qty: 1 }, { lineId: 'b', sku: 'B', qty: 2 }, { lineId: 'c', sku: 'C', qty: 3 }] };
  const rows = progressOutcomes(documentLineProgress(po, [], []));
  assert.deepEqual(rows.map((r) => r.line.sku), ['A', 'B', 'C']);
  assert.deepEqual(rows.map((r) => r.outcomes.requested), [1, 2, 3]);
  assert.deepEqual(progressOutcomes(null), []);
});
