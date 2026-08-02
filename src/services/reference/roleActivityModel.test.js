/**
 * اختبار نموذج «سجلّ حركة الأدوار» الحيّ — يحرس الدمج والترتيب والحساب.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toMillis,
  buildActivity,
  activitySummary,
  activeRoles,
  usedActions,
} from './roleActivityModel.js';

test('toMillis: يقبل رقمًا و{seconds} وtoMillis وISO والغياب', () => {
  assert.equal(toMillis(1000), 1000);
  assert.equal(toMillis({ seconds: 2 }), 2000);
  assert.equal(toMillis({ toMillis: () => 5000 }), 5000);
  assert.equal(toMillis('2026-08-02T00:00:00Z'), Date.parse('2026-08-02T00:00:00Z'));
  assert.equal(toMillis(null), 0);
  assert.equal(toMillis(undefined), 0);
});

test('buildActivity: يشتقّ إنشاءً واعتمادًا من المستند وحركةً من الدفتر', () => {
  const docs = [
    { id: 'd1', type: 'GRN', number: 'BFP-GRN-2026-0001', state: 'approved',
      createdByRole: 'storekeeper', createdByName: 'أمين', createdAt: { seconds: 100 },
      approvedByRole: 'qc_inspector', approvedByName: 'مفتّش', approvedAt: { seconds: 200 } },
  ];
  const moves = [
    { id: 'd1__000', docType: 'GRN', docNumber: 'BFP-GRN-2026-0001', postedByRole: 'storekeeper',
      postedByName: 'أمين', postedAt: { seconds: 300 }, nameAr: 'صنف', qty: 5, from: 'SUPPLIER', to: 'WH1', reasonLabel: 'استلام' },
  ];
  const entries = buildActivity({ docs, moves });
  assert.equal(entries.length, 3, 'إنشاء + اعتماد + ترحيل = 3 قيود');
  // مرتّبة بالأحدث: الترحيل (300) ثم الاعتماد (200) ثم الإنشاء (100)
  assert.deepEqual(entries.map((e) => e.action), ['posted', 'approved', 'create']);
  assert.equal(entries[0].roleId, 'storekeeper');
  assert.equal(entries[1].roleId, 'qc_inspector');
});

test('buildActivity: مسودّة بلا رقم تُعلَّم، والحدّ يُحترَم', () => {
  const docs = [{ id: 'd2', type: 'PR', number: null, state: 'draft', createdByName: 'x', createdAt: { seconds: 1 } }];
  const entries = buildActivity({ docs, moves: [], limit: 1 });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].docNumber, '(مسودّة)');
});

test('activitySummary: يعدّ الأدوار والاعتمادات والمستندات (بلا المسودّة)', () => {
  const entries = [
    { action: 'create', roleId: 'storekeeper', docNumber: '(مسودّة)' },
    { action: 'approved', roleId: 'qc_inspector', docNumber: 'BFP-GRN-2026-0001' },
    { action: 'posted', roleId: 'storekeeper', docNumber: 'BFP-GRN-2026-0001' },
  ];
  const s = activitySummary(entries);
  assert.equal(s.total, 3);
  assert.equal(s.roles, 2);
  assert.equal(s.approvals, 1);
  assert.equal(s.docs, 1, 'المسودّة لا تُحسب مستندًا متأثّرًا');
});

test('activeRoles: مرتّبة بعدد القيود تنازليًّا', () => {
  const entries = [
    { roleId: 'a' }, { roleId: 'b' }, { roleId: 'a' }, { roleId: 'a' },
  ];
  const roles = activeRoles(entries);
  assert.equal(roles[0].id, 'a');
  assert.equal(roles[0].count, 3);
  assert.equal(roles[1].id, 'b');
});

test('usedActions: بالترتيب المنطقيّ للدورة، فقط الموجود', () => {
  const entries = [{ action: 'posted' }, { action: 'create' }, { action: 'approved' }];
  const used = usedActions(entries).map((u) => u.action);
  assert.deepEqual(used, ['create', 'approved', 'posted']);
});
