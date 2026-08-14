/**
 * حارس ماستر المندوبين (SAP-21 · طلب المالك) — قبل أيّ واجهة (§22 ‹995›).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { repVerdict, canManageReps, REP_MANAGER_ROLES } from './repModel.js';

test('★★ الاسم هو الهويّة: بلا اسمٍ لا مندوب — والحكم يُسمّي الناقص', () => {
  const v = repVerdict({});
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /اسم المندوب مطلوب/);
});

test('★★ الاسم المكرّر يُرفض — سالمان اثنان في التقارير وهما واحد', () => {
  const v = repVerdict({ name: ' سالم ' }, ['سالم', 'أحمد']);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /مسجَّل بالفعل/);
  // والمختلف يمرّ.
  assert.equal(repVerdict({ name: 'خالد' }, ['سالم']).ok, true);
});

test('★ الهاتف اختياريّ — لكنّ المكتوب يجب أن يشبه رقمًا', () => {
  assert.equal(repVerdict({ name: 'سالم' }).ok, true, 'بلا هاتف يمرّ');
  assert.equal(repVerdict({ name: 'سالم', phone: '0912345678' }).ok, true);
  assert.equal(repVerdict({ name: 'سالم', phone: '+218 91 234 5678' }).ok, true);
  assert.equal(repVerdict({ name: 'سالم', phone: 'abc' }).ok, false);
});

test('الحقول تُقصّ وتُطبَّع، والافتراض نشط، ولا حقلَ يُخترع', () => {
  const v = repVerdict({ name: ' سالم ', phone: ' 0912345678 ', vehiclePlate: ' 12-3456 ', notes: ' م ' });
  assert.deepEqual(v.rep, {
    name: 'سالم',
    phone: '0912345678',
    vehiclePlate: '12-3456',
    notes: 'م',
    active: true,
  });
  assert.equal(repVerdict({ name: 'س', active: false }).rep.active, false);
});

test('من يدير المندوبين: المديران ومشرف المبيعات — تطابق القاعدة', () => {
  assert.deepEqual(REP_MANAGER_ROLES, ['admin', 'warehouse_manager', 'sales_supervisor']);
  assert.equal(canManageReps('sales_supervisor'), true);
  assert.equal(canManageReps('sales_rep'), false);
  assert.equal(canManageReps('storekeeper'), false);
});
