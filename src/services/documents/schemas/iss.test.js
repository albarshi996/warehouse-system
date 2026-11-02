/**
 * اختبارات إذن الصرف المخزنيّ (ISS): التحذيراتُ تطلب بندًا مصروفًا وتتبّعًا،
 * والقيمةُ تُحسب من البنود، والأدوارُ تفصل من يصرف عمّن يعتمد، والقيدُ يُخرج
 * البضاعة من المستودع فعلًا (لا مستندٌ بلا أثر).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import iss, { issueValue, totalIssue, issueWarnings } from './iss.js';
import { postingRuleFor } from '../../ledger/postingRules.js';
import { financialImpactFor } from '../../odoo/financialImpact.js';

test('★ التحذيراتُ تطلب بندًا مصروفًا وتتبّعَ التشغيلة', () => {
  // مستندٌ بلا بندٍ مصروف لا يُقيَّد.
  assert.ok(issueWarnings({ lines: [] }).some((w) => /لا بند مصروف/.test(w)));
  assert.ok(issueWarnings({ lines: [{ qty: 0 }] }).some((w) => /لا بند مصروف/.test(w)));
  // بندٌ بلا تشغيلةٍ ولا صلاحيّةٍ يقطع التتبّع.
  assert.ok(issueWarnings({ lines: [{ qty: 3 }] }).some((w) => /تشغيلة|تتبّع/.test(w)));
  // بندٌ مكتملٌ لا يُحذَّر منه.
  assert.deepEqual(issueWarnings({ lines: [{ qty: 3, batch: 'B1' }] }), []);
});

test('★ القيمةُ كمّيّةٌ × تكلفة، والإجماليّ مجموعُها', () => {
  assert.equal(issueValue({ qty: 4, unitCost: 25 }), 100);
  assert.equal(issueValue({ qty: 0, unitCost: 25 }), 0);
  assert.equal(totalIssue([{ qty: 4, unitCost: 25 }, { qty: 2, unitCost: 10 }]), 120);
});

test('★★ الأدوارُ تفصل: المدقّق/المدير يعتمد، وأمينُ المخزن يُنشئ ويُنجز', () => {
  assert.ok(iss.roles.create.length && iss.roles.approve.length && iss.roles.complete.length);
  assert.ok(iss.roles.create.includes('storekeeper'), 'أمينُ المخزن يُنشئ الصرف');
  assert.ok(iss.roles.approve.includes('inventory_auditor'), 'مدقّقُ الجرد يعتمد');
  assert.ok(!iss.roles.approve.includes('storekeeper'), 'من يصرف لا يعتمد صرفه');
  assert.equal(iss.signatures.length, 3, 'ثلاثُ خاناتِ توقيع');
  assert.ok(typeof iss.warnings === 'function');
});

test('★★★ القيدُ يُخرج البضاعة من المستودع فعلًا — صرفٌ لا ورقة', () => {
  const rule = postingRuleFor('ISS');
  assert.ok(rule, 'ISS بلا قاعدة قيدٍ — صرفٌ لا يُنقص رصيدًا');
  assert.equal(rule.qtyField, 'qty');
  assert.equal(rule.costField, 'unitCost');
  assert.equal(rule.reason, 'issue-out');
  // والأثرُ الماليّ يطابق الحركة: يحرّك مخزونًا، محلّيٌّ لا مرآةَ أودو له.
  const impact = financialImpactFor('ISS');
  assert.equal(impact.stockEffect, true, 'العقدُ الماليّ يوافق قاعدةَ القيد');
});
