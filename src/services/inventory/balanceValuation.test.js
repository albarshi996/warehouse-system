/**
 * ‹ODOO-ORD› تقييمُ المخزون من الأرصدة بتكلفة أودو: المستودعان قيمةٌ، والطريقُ بجانبها، والتسويةُ خارجها، وما بلا تكلفةٍ يُعدّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { balanceCost, balanceValuation, itemCostIndex, itemsWithLedger } from './balanceValuation.js';

const bal = (sku, warehouse, qty, unitCost = 0, extra = {}) => ({ sku, barcode: '', warehouse, qty, unitCost, ...extra });

test('القيمة = Σ كمّيّة × تكلفة أودو للمستودعين — والطريقُ بجانبها لا داخلها', () => {
  const v = balanceValuation([
    bal('A', 'WH001', 10, 5),
    bal('A', 'WH002', 4, 5),
    bal('B', 'WH001', 2, 100),
    bal('A', 'TRANSIT', 20, 5),
  ]);
  assert.equal(v.total, 10 * 5 + 4 * 5 + 2 * 100);
  assert.deepEqual(v.onHand, { value: 270, qty: 16, lines: 3 });
  assert.deepEqual(v.transit, { value: 100, qty: 20, lines: 1 });
  assert.deepEqual(v.byWarehouse.WH001, { value: 250, qty: 12, lines: 2 });
  assert.deepEqual(v.byWarehouse.WH002, { value: 20, qty: 4, lines: 1 });
});

test('★★★ حسابُ التسوية مقابلٌ لا مخزون — وكانت `stockValue` تجمعه', () => {
  const v = balanceValuation([bal('A', 'WH001', 10, 5), bal('A', 'ADJUSTMENT', 158, 5), bal('B', 'ADJUSTMENT', -158, 5)]);
  assert.equal(v.total, 50);
  assert.equal(v.transit.value, 0);
});

test('تكلفةُ أودو أوّلًا، ثمّ الماستر، وإلّا «بلا تكلفة» تُعدّ ولا تُلفَّق', () => {
  const items = [{ sku: 'B', costPrice: 7, category: 'عطور' }, { sku: 'A', costPrice: 999 }];
  assert.deepEqual(balanceCost(bal('A', 'WH001', 1, 5), itemCostIndex(items)), { cost: 5, source: 'balance' });
  assert.deepEqual(balanceCost(bal('B', 'WH001', 1, 0), itemCostIndex(items)), { cost: 7, source: 'item' });
  assert.deepEqual(balanceCost(bal('C', 'WH001', 1, 0), itemCostIndex(items)), { cost: 0, source: null });
  const v = balanceValuation([bal('A', 'WH001', 2, 5), bal('B', 'WH001', 3, 0), bal('C', 'WH002', 4, 0)], items);
  assert.equal(v.total, 2 * 5 + 3 * 7, 'تكلفةُ الماستر 999 لا تطغى على تكلفة أودو 5');
  assert.equal(v.costFromItem, 1);
  assert.deepEqual(v.unpriced, { lines: 1, qty: 4 });
});

test('الصفرُ والسالبُ لا قيمةَ لهما ولا يُعدّان بلا تكلفة', () => {
  const v = balanceValuation([bal('A', 'WH001', 0, 5), bal('B', 'WH001', -3, 0), bal('C', 'WH001', 1, 2)]);
  assert.equal(v.total, 2);
  assert.deepEqual(v.unpriced, { lines: 0, qty: 0 });
});

test('بالفئة من الماستر — وما لا صنفَ له «بلا فئة»', () => {
  const items = [{ sku: 'A', category: 'مكياج' }, { sku: 'B', category: 'عطور' }];
  const v = balanceValuation([bal('A', 'WH001', 1, 10), bal('B', 'WH001', 1, 30), bal('Z', 'WH002', 1, 5)], items);
  assert.deepEqual(v.categories.map((c) => [c.category, c.value]), [['عطور', 30], ['مكياج', 10], ['بلا فئة', 5]]);
});

test('الهويّةُ القانونيّة: الباركودُ حين يغيب الكود، وحالةُ الأحرف لا تفرّق', () => {
  const items = [{ sku: '', barcode: '0656272232320', costPrice: 4 }, { sku: 'qd25-34927', costPrice: 6 }];
  const v = balanceValuation([bal('', 'WH001', 2, 0, { barcode: '0656272232320' }), bal('QD25-34927', 'wh001', 1, 0)], items);
  assert.equal(v.total, 2 * 4 + 6);
});

test('الماسترُ برصيد الدفتر وتكلفة أودو الموزونة — للراكد وإعادة الطلب', () => {
  const items = [{ sku: 'A', costPrice: 999, balance: 7 }, { sku: 'B', costPrice: 3 }, { sku: 'C' }];
  const out = itemsWithLedger(items, [bal('A', 'WH001', 10, 4), bal('A', 'WH002', 30, 8), bal('A', 'TRANSIT', 50, 1), bal('B', 'WH001', 2, 0)]);
  assert.equal(out[0].balance, 40, 'المستودعان وحدهما — والطريقُ ليس في اليد');
  assert.equal(out[0].costPrice, (10 * 4 + 30 * 8) / 40);
  assert.equal(out[1].balance, 2);
  assert.equal(out[1].costPrice, 3, 'بلا تكلفة أودو ⟵ تكلفةُ الماستر');
  assert.equal(out[2].balance, 0, 'صنفٌ بلا رصيدٍ في الدفتر رصيدُه صفر لا رصيدُ الماستر القديم');
});

import fs from 'node:fs';

const source = (rel) =>
  fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

test('★★★ كلُّ شاشةٍ تعرض «قيمة المخزون» تقرؤها من الأرصدة بتكلفة أودو — لا رقمان لشيءٍ واحد', () => {
  const logistics = source('../../components/brandzo-erp/dashboard/LogisticsDashboard.jsx');
  assert.match(logistics, /listenBalancesDelta\(/, 'اللوجستيات تشترك في الأرصدة');
  assert.match(logistics, /\{ items, moves, operations, odooDocs, suppliers, customers, counts, balances \}/, 'والأرصدةُ تصل النموذج');
  assert.match(source('../dashboard/logisticsModel.js'), /balanceValuation\(ledger, masterItems\)/);
  const items = source('../../components/brandzo-erp/items/ItemMaster.jsx');
  assert.match(items, /balanceValuation\(balances, items\)\.total/);
  assert.doesNotMatch(items, /stockValue\(/, 'stockValue تجمع حسابَ التسوية');
  const analytics = source('../../components/brandzo-erp/inventory/InventoryAnalytics.jsx');
  assert.match(analytics, /itemsWithLedger\(masterItems, balances\)/);
  assert.match(analytics, /balanceValuation\(balances, masterItems\)/);
});
