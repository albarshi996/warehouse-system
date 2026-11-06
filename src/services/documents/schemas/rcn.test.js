/**
 * اختبارات إذن الاستلام المخزنيّ (RCN) — نظيرُ ISS نحو الداخل: التحذيراتُ تطلب
 * بندًا مستلَمًا وتتبّعًا، والقيمةُ تُحسب من البنود، والأدوارُ تفصل من يستلم عمّن
 * يعتمد، والقيدُ **يُدخل** البضاعة إلى المستودع فعلًا فيزيد الرصيد (لا ورقةٌ بلا أثر).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rcn, { receiptValue, totalReceipt, receiptWarnings } from './rcn.js';
import { postingRuleFor, WAREHOUSE } from '../../ledger/postingRules.js';
import { EXTERNAL } from '../../ledger/locations.js';
import { financialImpactFor } from '../../odoo/financialImpact.js';

test('★ التحذيراتُ تطلب بندًا مستلَمًا وتتبّعَ التشغيلة', () => {
  // مستندٌ بلا بندٍ مستلَم لا يُقيَّد.
  assert.ok(receiptWarnings({ lines: [] }).some((w) => /لا بند مستلَم/.test(w)));
  assert.ok(receiptWarnings({ lines: [{ qty: 0 }] }).some((w) => /لا بند مستلَم/.test(w)));
  // بندٌ بلا تشغيلةٍ ولا صلاحيّةٍ يقطع التتبّع.
  assert.ok(receiptWarnings({ lines: [{ qty: 3 }] }).some((w) => /تشغيلة|تتبّع/.test(w)));
  // بندٌ مكتملٌ لا يُحذَّر منه.
  assert.deepEqual(receiptWarnings({ lines: [{ qty: 3, batch: 'B1' }] }), []);
});

test('★ القيمةُ كمّيّةٌ × تكلفة، والإجماليّ مجموعُها', () => {
  assert.equal(receiptValue({ qty: 4, unitCost: 25 }), 100);
  assert.equal(receiptValue({ qty: 0, unitCost: 25 }), 0);
  assert.equal(totalReceipt([{ qty: 4, unitCost: 25 }, { qty: 2, unitCost: 10 }]), 120);
});

test('★★ الأدوارُ تفصل: المدقّق/المدير يعتمد، وأمينُ المخزن يُنشئ ويُنجز', () => {
  assert.ok(rcn.roles.create.length && rcn.roles.approve.length && rcn.roles.complete.length);
  assert.ok(rcn.roles.create.includes('storekeeper'), 'أمينُ المخزن يُنشئ الاستلام');
  assert.ok(rcn.roles.approve.includes('inventory_auditor'), 'مدقّقُ الجرد يعتمد');
  assert.ok(!rcn.roles.approve.includes('storekeeper'), 'من يستلم لا يعتمد استلامه');
  assert.equal(rcn.signatures.length, 3, 'ثلاثُ خاناتِ توقيع');
  assert.ok(typeof rcn.warnings === 'function');
});

test('★★★ القيدُ يُدخل البضاعة إلى المستودع فعلًا — استلامٌ يزيد الرصيد لا ورقة', () => {
  const rule = postingRuleFor('RCN');
  assert.ok(rule, 'RCN بلا قاعدة قيدٍ — استلامٌ لا يزيد رصيدًا');
  // اتّجاهُ الدخول: من خارج الدفتر إلى المستودع (عكسُ ISS).
  assert.equal(rule.from, EXTERNAL);
  assert.equal(rule.to, WAREHOUSE);
  assert.equal(rule.qtyField, 'qty');
  assert.equal(rule.costField, 'unitCost');
  assert.equal(rule.reason, 'receipt-in');
  // الموقعُ يخصّ الوجهة — الرفُّ الذي توضع عليه البضاعة.
  assert.equal(rule.binSide, 'to');
  // والأثرُ الماليّ يطابق الحركة: يحرّك مخزونًا، محلّيٌّ لا مرآةَ أودو له.
  const impact = financialImpactFor('RCN');
  assert.equal(impact.stockEffect, true, 'العقدُ الماليّ يوافق قاعدةَ القيد');
  assert.equal(impact.financial, false, 'استلامٌ محلّيٌّ بلا قيدِ مرآةٍ من أودو');
});
