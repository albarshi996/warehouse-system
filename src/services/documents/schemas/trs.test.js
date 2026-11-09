/**
 * اختبارات مخطّط النقل المباشر (TRS) — موقع 155.
 *
 * نحرس عقدَ المستند: مسجَّلٌ · يُطبع بلا هويّة (plainPrint) · يحمل منتقيَ أصناف
 * المصدر (warehouseItemPicker) · له قاعدةُ ترحيلٍ تنقل من المصدر إلى الوجهة
 * مباشرةً · أثرُه المخزنيّ معلَن · وأدوارُه تَفصِل من ينقل عمّن يعتمد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import trs, { lineValue, totalValue, directTransferWarnings } from './trs.js';
import { getSchema } from './index.js';
import { postingRuleFor, WAREHOUSE_FROM, WAREHOUSE_TO } from '../../ledger/postingRules.js';
import { FINANCIAL_IMPACT } from '../../odoo/financialImpact.js';
import { SYSTEM_LOCATIONS } from '../../ledger/locations.js';

/* ───────── مسجَّلٌ ويُطبع بلا هويّة ───────── */

test('★★ TRS مسجَّلٌ في SCHEMAS بكوده', () => {
  assert.equal(getSchema('TRS'), trs);
  assert.equal(trs.type, 'TRS');
});

test('★★★ يُطبع بلا هويّة شركة — plainPrint صريحة وكودُ النموذج محايد', () => {
  assert.equal(trs.plainPrint, true);
  assert.equal(/BFP/i.test(trs.formCode), false);
});

test('★ يحمل منتقيَ أصناف المصدر (جزء ٣)', () => {
  assert.equal(trs.warehouseItemPicker, true);
});

test('★ بلا إيموجي في عناوين الأقسام (دستور الواجهات)', () => {
  const titles = trs.sections.map((s) => s.title).join(' ');
  assert.equal(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(titles), false);
});

/* ───────── قاعدةُ الترحيل: نقلٌ مباشرٌ بمستودعَيه ───────── */

test('★★★ قاعدةُ الترحيل تنقل من المصدر إلى الوجهة مباشرةً (لا مخزنَ نقلٍ وسيط)', () => {
  const rule = postingRuleFor('TRS');
  assert.ok(rule, 'لها قاعدةُ ترحيل');
  assert.equal(rule.from, WAREHOUSE_FROM, 'المصدر من رأس المستند');
  assert.equal(rule.to, WAREHOUSE_TO, 'الوجهة من رأس المستند');
  assert.equal(rule.qtyField, 'qty');
  assert.equal(rule.costField, 'unitCost');
  // ★ مقابلُ زيادة الجرد للبنود المضافة = حساب التسوية.
  assert.equal(rule.addSourceAdjust, SYSTEM_LOCATIONS.ADJUSTMENT.code);
});

test('★★ أثرُه المخزنيّ معلَنٌ (stockEffect) بلا أثرٍ ماليٍّ ولا مرآةِ أودو', () => {
  assert.equal(FINANCIAL_IMPACT.TRS.stockEffect, true);
  assert.equal(FINANCIAL_IMPACT.TRS.financial, false);
  assert.equal(FINANCIAL_IMPACT.TRS.odooDoc, null);
});

/* ───────── فصلُ الأدوار ───────── */

test('★ الإنشاءُ لأمين المخزن، والاعتمادُ لمدير المستودع', () => {
  assert.ok(trs.roles.create.includes('storekeeper'));
  assert.deepEqual(trs.roles.approve, ['warehouse_manager']);
  assert.ok(trs.roles.complete.includes('storekeeper'));
});

/* ───────── الحسابات والتحذيرات ───────── */

test('القيمةُ والإجماليّ محسوبان', () => {
  const lines = [{ qty: 5, unitCost: 10 }, { qty: 2, unitCost: 3 }];
  assert.equal(lineValue(lines[0]), 50);
  assert.equal(totalValue(lines), 56);
});

test('★★ تحذيرٌ: مصدرٌ = وجهة، ومستندٌ فارغ، وبندٌ مضافٌ ينبّه', () => {
  const same = directTransferWarnings({ header: { fromWarehouse: 'E5', toWarehouse: 'e5' }, lines: [{ qty: 1 }] });
  assert.ok(same.some((w) => w.includes('المصدر والوجهة')));

  const empty = directTransferWarnings({ header: { fromWarehouse: 'E5', toWarehouse: 'E2' }, lines: [] });
  assert.ok(empty.some((w) => w.includes('فارغ')));

  const added = directTransferWarnings({
    header: { fromWarehouse: 'E5', toWarehouse: 'E2' },
    lines: [{ sku: 'X', qty: 2, addedFromTransfer: true }],
  });
  assert.ok(added.some((w) => w.includes('مُضافًا') || w.includes('زيادةُ جرد')));

  const clean = directTransferWarnings({
    header: { fromWarehouse: 'E5', toWarehouse: 'E2' },
    lines: [{ sku: 'X', qty: 2, batch: 'B1' }],
  });
  assert.equal(clean.length, 0);
});
