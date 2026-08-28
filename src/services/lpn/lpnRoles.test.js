/**
 * اختبارات الأدوار المخزنيّة — دورٌ واحدٌ للموظّف وخريطةٌ تقول ماذا يفعل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIELD_OPS,
  FIELD_ROLES,
  PORTAL_TO_FIELD,
  ROLE_OPS,
  canDo,
  fieldRolesOf,
  opProblem,
  opsOf,
  seesBookQtyWhileCounting,
  warehouseProblem,
  roleSummary,
  uiGate,
} from './lpnRoles.js';
import { ROLE_NAV } from '../auth/navAccess.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('أدوار خطة ٧ الثمانية كلُّها ممثَّلة', () => {
  assert.equal(Object.keys(FIELD_ROLES).length, 8);
  for (const r of ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER', 'COUNTER', 'GOVERNANCE', 'SUPERVISOR', 'ADMIN']) {
    assert.ok(FIELD_ROLES[r], `«${r}» موجود`);
    assert.ok(ROLE_OPS[r], `وله عملياتٌ معرَّفة`);
  }
});

test('★★ خريطةُ أدوار البوابة إلى الميدان — دورٌ واحدٌ للموظّف لا نظامان', () => {
  assert.deepEqual(fieldRolesOf('storekeeper'), ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER']);
  assert.deepEqual(fieldRolesOf('inventory_auditor'), ['COUNTER']);
  assert.deepEqual(fieldRolesOf('viewer'), [], 'المشاهد لا ينفّذ ميدانيًّا');
});

test('★★★ فصلُ المهامّ: من يكوّن الطبلية لا يعتمدها', () => {
  assert.ok(canDo('storekeeper', 'RECEIVE'), 'أمين المخزن يستلم');
  assert.ok(!canDo('storekeeper', 'APPROVE'), 'ولا يعتمد ما كوّنه');
  assert.ok(canDo('warehouse_manager', 'APPROVE'));
  assert.ok(canDo('qc_inspector', 'APPROVE'), 'ومفتّش الجودة صاحبُها الطبيعيّ');
  assert.ok(!canDo('qc_inspector', 'RECEIVE'), 'ولا يستلم ما سيعتمده');
});

test('★★ التجاوز والتسوية للمشرف — لا للمنفّذ', () => {
  assert.ok(!canDo('storekeeper', 'OVERRIDE'), 'المنفّذ لا يتجاوز بنفسه');
  assert.ok(!canDo('storekeeper', 'ADJUST'), 'ولا يعتمد تسوية');
  assert.ok(canDo('warehouse_manager', 'OVERRIDE'));
  assert.ok(canDo('warehouse_manager', 'ADJUST'));
});

test('★★ رسالةُ المنع تقول من يملكها — فيذهب الموظّف إليه لا يبحث', () => {
  const p = opProblem('storekeeper', 'APPROVE');
  assert.match(p, /اعتماد الحوكمة/);
  assert.match(p, /موظّف الحوكمة/, 'تسمّي المالك');
  assert.equal(opProblem('warehouse_manager', 'APPROVE'), '');
  assert.match(opProblem('storekeeper', 'FLY'), /غير معروفة/);
});

test('🔒 حصرُ المستودع: الموظّف يعمل في مستودعه — والمديران فوق الحصر', () => {
  assert.match(
    warehouseProblem('storekeeper', { userWarehouse: 'MAIN', targetWarehouse: 'TRP' }),
    /راجع مشرفك/
  );
  assert.equal(warehouseProblem('storekeeper', { userWarehouse: 'MAIN', targetWarehouse: 'main' }), '', 'التطبيع');
  assert.equal(warehouseProblem('warehouse_manager', { userWarehouse: 'MAIN', targetWarehouse: 'TRP' }), '');
  assert.equal(warehouseProblem('storekeeper', { userWarehouse: '', targetWarehouse: 'TRP' }), '', 'بلا مستودعٍ مسجَّل لا حصر');
});

test('★★★ الجردُ الأعمى ليس صلاحيّةً بل قاعدةَ الطبقة — لا لأحد', () => {
  assert.equal(seesBookQtyWhileCounting(), false);
});

test('🔒 درس ل-١٨: كلّ دورٍ في الخريطة موجودٌ في نظام أدوار البوابة', () => {
  // شاشةٌ تمنح دورًا لا تعرفه القاعدة تعني صلاحيّةً تُمنح ولا تُنفَّذ.
  for (const role of Object.keys(PORTAL_TO_FIELD)) {
    assert.ok(ROLE_NAV[role] || role === 'admin', `الدور «${role}» معروفٌ في navAccess`);
  }
});

test('🔒 كلّ دورٍ في الخريطة مذكورٌ في firestore.rules — فلا تسمح شاشةٌ بما تمنعه القاعدة', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  for (const role of Object.keys(PORTAL_TO_FIELD)) {
    assert.ok(rules.includes(`'${role}'`), `الدور «${role}» غير مذكورٍ في القواعد — عملُه سيرتدّ من الخادم`);
  }
});

test('كلّ عمليةٍ في المصفوفة معرَّفةٌ في قائمة العمليات — ولا عمليةَ بلا مالك', () => {
  for (const [role, ops] of Object.entries(ROLE_OPS)) {
    for (const op of ops) assert.ok(Object.hasOwn(FIELD_OPS, op), `«${op}» لدور «${role}» غير معرَّفة`);
  }
  for (const op of Object.keys(FIELD_OPS)) {
    const owners = Object.values(ROLE_OPS).filter((ops) => ops.includes(op));
    assert.ok(owners.length > 0, `العملية «${op}» بلا مالكٍ واحد`);
  }
  assert.deepEqual(opsOf('viewer'), []);
});

/* ── ‹LPN-511› بوّابةُ الشاشة ──────────────────────────────────────── */

test('★★★ الدورُ المجهول يمرّ — منعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم', () => {
  // العطبُ الذي يحرسه هذا الاختبار وقع فعلًا: قراءةٌ فشلت فعاد الدور
  // `viewer`، فمُنع المديرُ العام صامتًا وهو لا يفهم لماذا.
  for (const unknown of ['', null, undefined, 'viewer', 'دورٌ لم يُخرَّط بعد']) {
    const g = uiGate(unknown, 'RECEIVE');
    assert.ok(g.allowed, `«${unknown}» حُجب — والشاشةُ لا تعرف من هو`);
    assert.equal(g.known, false);
    assert.equal(g.message, '');
  }
});

test('★★ والدورُ المعروف يُحكم بالمصفوفة — ويُقال له من يملكها', () => {
  const auditor = uiGate('inventory_auditor', 'APPROVE');
  assert.ok(!auditor.allowed, 'موظّف الجرد لا يعتمد');
  assert.ok(auditor.known);
  assert.match(auditor.message, /موظّف الحوكمة/, 'يُقال له إلى من يذهب');

  assert.ok(uiGate('inventory_auditor', 'COUNT').allowed);
  assert.ok(uiGate('storekeeper', 'RECEIVE').allowed);
  assert.ok(!uiGate('storekeeper', 'APPROVE').allowed, 'من يكوّن الطبلية لا يعتمدها');
  assert.ok(uiGate('admin', 'OVERRIDE').allowed);
});

test('★ الملخّصُ للعرض لا للمنع — ويعلن جهلَه بالدور المجهول', () => {
  const s = roleSummary('storekeeper');
  assert.ok(s.known);
  assert.ok(s.fieldLabels.length > 0 && s.opLabels.length > 0);

  const u = roleSummary('viewer');
  assert.equal(u.known, false);
  assert.deepEqual(u.fieldLabels, [], 'لا يُخترع له دورٌ ميدانيّ');
});
