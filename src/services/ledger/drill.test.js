/**
 * حارس الحفر التحليليّ (SAP-13 · ف‑٢٩) — قبل أيّ واجهة (§22 ‹995›).
 *
 * البوّابتان الحاكمتان: §18 ‹921› (الرقم يفتح القائمة التي تكوّنه لا صفحة
 * عامّة) و§18 ‹922› (**مجموع التفاصيل يطابق المؤشّر**) — والثانية تُفرض
 * هنا فرضًا: تفكيكُ كلّ رقمٍ يجب أن يساويه حرفيًّا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { orderedBreakdown, committedBreakdown, inStockBreakdown } from './drill.js';
import { itemOpenDemand } from './openDemand.js';
import { itemQuantities } from '../items/itemIdentity.js';

const row = (doc, header, lines) => ({ document: { ...doc, header }, lines });

const PO_ROWS = [
  row({ id: 'po1', type: 'PO', number: 'PO-1' }, { warehouse: 'E5' }, [
    { sku: 'ITM-1', open: 40 },
    { sku: 'ITM-1', open: 10 }, // سطران في المستند نفسه — يُجمعان صفًّا واحدًا
    { sku: 'OTHER', open: 7 },
  ]),
  row({ id: 'po2', type: 'PO', number: 'PO-2' }, { warehouse: 'E2' }, [{ sku: 'ITM-1', open: 5 }]),
];
const TR_ROWS = [
  row({ id: 'tr1', type: 'TR', number: 'TR-1' }, { fromWarehouse: 'E5', toWarehouse: 'E2' }, [
    { sku: 'ITM-1', open: 8 },
  ]),
];
const BALANCES = [
  { id: 'b1', warehouse: 'E5', batch: 'B1', qty: 100, qtyReserved: 30 },
  { id: 'b2', warehouse: 'E2', batch: 'B2', qty: 20, qtyReserved: 0 },
];

test('★★ §18 ‹922›: مجموع تفكيك «المطلوب» يطابق رقم البطاقة حرفيًّا', () => {
  const keys = ['ITM-1'];
  const breakdown = orderedBreakdown(keys, { poRows: PO_ROWS, trRows: TR_ROWS });
  const indicator = itemOpenDemand(keys, { poRows: PO_ROWS, trRows: TR_ROWS });
  assert.equal(breakdown.total, indicator.ordered, 'القائمة تفسّر رقمها بلا عجز ولا زيادة');
  assert.equal(breakdown.total, 63); // 40+10+5 شراءً + 8 نقلًا واردًا
});

test('★★ الرقم يتفكّك مستنداتٍ بهويّاتها — بابُ النزول للمستند والسطر', () => {
  const { rows } = orderedBreakdown(['ITM-1'], { poRows: PO_ROWS, trRows: TR_ROWS });
  const po1 = rows.find((r) => r.docId === 'po1');
  assert.equal(po1.qty, 50, 'سطرا المستند الواحد يُجمعان');
  assert.equal(po1.docNumber, 'PO-1');
  assert.equal(po1.why, 'أمر شراء مفتوح');
  const tr1 = rows.find((r) => r.docId === 'tr1');
  assert.equal(tr1.why, 'نقلٌ وارد مفتوح');
  assert.equal(rows.length, 3);
});

test('★★ تفكيك «المحجوز» يطابق رقمه: وعودات البيع + النقل الصادر', () => {
  const keys = ['ITM-1'];
  const breakdown = committedBreakdown(keys, { balances: BALANCES, trRows: TR_ROWS });
  const q = itemQuantities({
    balances: BALANCES,
    committedInTransit: itemOpenDemand(keys, { trRows: TR_ROWS }).committedInTransit,
  });
  assert.equal(breakdown.total, q.committed); // 30 وعدًا + 8 عبورًا = 38
  assert.equal(breakdown.rows.find((r) => r.balanceId === 'b1').why, 'محجوز لوعد بيع');
  assert.equal(breakdown.rows.find((r) => r.docId === 'tr1').why, 'نقلٌ صادر مفتوح');
});

test('★★ تفكيك «الموجود» أرصدةٌ بمواقعها وتشغيلاتها — ومجموعها هو الرقم', () => {
  const breakdown = inStockBreakdown(BALANCES);
  const q = itemQuantities({ balances: BALANCES });
  assert.equal(breakdown.total, q.inStock);
  assert.equal(breakdown.rows.length, 2);
  assert.equal(breakdown.rows[0].batch, 'B1'); // الدفعة — آخر درجات النزول §18 ‹903›
});

test('الفارغ صادق: لا صفوف ومجموعٌ صفر — لا رقم يتيم', () => {
  assert.deepEqual(orderedBreakdown(['X'], {}), { rows: [], total: 0 });
  assert.deepEqual(inStockBreakdown([]), { rows: [], total: 0 });
  assert.equal(committedBreakdown(['X'], {}).total, 0);
});
