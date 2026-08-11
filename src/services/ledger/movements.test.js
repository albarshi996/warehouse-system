/**
 * اختبارات بناء الحركات — نوع الصنف والوحدات داخل الدفتر (م٣-أ · م٣-ب).
 *
 * الاختباران الحاكمان  يحرسان الترحيل: بلا خريطة أصنافٍ ولصنفٍ غير
 * معرَّف الوحدات، **لا يتغيّر رقم واحد**. وما بينهما تفعيلٌ صنفًا صنفًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMoves } from './movements.js';


/* ═══════════ نوع الصنف والوحدات في الدفتر (م٣-أ · م٣-ب) ═══════════ */

test('★★ الترحيل: بلا خريطة أصناف لا يتغيّر رقم واحد', () => {
  const doc = {
    id: 'D1', type: 'GRN', number: 'GRN-1',
    header: { warehouse: 'MAIN', receivedAt: '2026-08-11' },
    lines: [{ sku: 'A', qtyReceived: 20, uom: 'box' }],
  };
  const before = buildMoves(doc);
  const after = buildMoves(doc, { items: null });
  assert.equal(before.moves[0].qty, 20);
  assert.equal(after.moves[0].qty, 20, 'الرقم نفسه حرفيًّا');
});

test('★★ صنفٌ قديم غير معرَّف الوحدات: يمرّ رقمه كما هو ولو كانت وحدته صندوقًا', () => {
  const items = new Map([['A', { sku: 'A', unit: 'piece' }]]); // بلا baseUom ولا uomFactors
  const doc = {
    id: 'D2', type: 'GRN', number: 'GRN-2',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 20, uom: 'box' }],
  };
  const r = buildMoves(doc, { items });
  assert.deepEqual(r.problems, [], 'لا يُرفض');
  assert.equal(r.moves[0].qty, 20, 'ولا يُحوَّل');
});

test('★★ صنفٌ معرَّف: يُقيَّد بوحدة الأساس ويحفظ وحدة الإدخال', () => {
  const items = new Map([['A', { sku: 'A', baseUom: 'piece', uomFactors: { box: 12 } }]]);
  const doc = {
    id: 'D3', type: 'GRN', number: 'GRN-3',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 20, uom: 'box' }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves[0].qty, 240, 'الدفتر بالأساس');
  assert.equal(r.moves[0].entryQty, 20, 'والأصل محفوظ');
  assert.equal(r.moves[0].entryUom, 'box');
  assert.equal(r.moves[0].baseUom, 'piece');
});

test('★ الخدمة تخرج من القيد وتُسجَّل في skipped — لا تُبتلع صامتة', () => {
  const items = new Map([
    ['A', { sku: 'A', itemType: 'sale' }],
    ['FEE', { sku: 'FEE', itemType: 'service' }],
  ]);
  const doc = {
    id: 'D4', type: 'GRN', number: 'GRN-4',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 5 }, { sku: 'FEE', qtyReceived: 1 }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].sku, 'A');
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].sku, 'FEE');
});

test('★ صنفٌ معرَّف بوحدةٍ لا معامل لها: يُرفض بسببٍ مكتوب لا يُقيَّد بالخطأ', () => {
  const items = new Map([['A', { sku: 'A', baseUom: 'piece', uomFactors: { box: 12 } }]]);
  const doc = {
    id: 'D5', type: 'GRN', number: 'GRN-5',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 3, uom: 'pallet' }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves.length, 0);
  assert.match(r.problems[0], /لا معامل تحويل/);
});
