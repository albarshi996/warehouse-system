/**
 * اختبارات pageAccess — الأدوار المقيّدة بصفحات بعينها (منطق خالص، بلا Firebase).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RESTRICTED_ROLE_PATHS, restrictedAllowedPaths, isPathAllowed } from './pageAccess.js';

const BASE = '/warehouse-system';

test('الأدوار غير المذكورة في الخريطة: بلا تقييد إطلاقًا', () => {
  assert.equal(restrictedAllowedPaths('admin'), null);
  assert.equal(restrictedAllowedPaths('warehouse_manager'), null);
  assert.equal(restrictedAllowedPaths(undefined), null);
  assert.equal(isPathAllowed('admin', `${BASE}/dashboard/anything`, BASE), true);
  assert.equal(isPathAllowed(undefined, `${BASE}/dashboard/anything`, BASE), true);
});

test('department_user: يصل فقط لصفحاته المسموحة', () => {
  const allowed = restrictedAllowedPaths('department_user');
  assert.ok(Array.isArray(allowed) && allowed.length > 0);
  assert.ok(allowed.includes('/dashboard/hiring-requests'));
  assert.ok(allowed.includes('/dashboard/tasks'));
  assert.ok(allowed.includes('/dashboard/meeting-assistant'));
  assert.ok(allowed.includes('/dashboard/wh-manager-eval'));
});

test('department_user: مسموح بصفحاته وما تحتها، ممنوع من أي صفحة أخرى', () => {
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/hiring-requests`, BASE), true);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/hiring-requests/`, BASE), true);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/tasks`, BASE), true);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/meeting-assistant`, BASE), true);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/wh-manager-eval`, BASE), true);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/warehouses`, BASE), false);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/recruitment`, BASE), false);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard`, BASE), false);
});

test('لا تتطابق صفحة بادئتها مشابهة عرضًا (لا ثغرة startsWith)', () => {
  // "/dashboard/hiring-requests-extra" لا يجوز أن يُقبل بسبب startsWith ساذج.
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/hiring-requests-extra`, BASE), false);
});

test('fleet: يصل لصفحات سلاسل الإمداد التشغيلية الثلاث فقط', () => {
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/vehicles-inventory`, BASE), true);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/fleet-operations`, BASE), true);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/maintenance-center`, BASE), true);
  // العُهد (أثر مالي) واللوحة التنفيذية للمديرَين — لا يصلهما دور الحركة.
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/custody`, BASE), false);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/supply-chain`, BASE), false);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard`, BASE), false);
});

test('كل قيم RESTRICTED_ROLE_PATHS مصفوفات غير فارغة', () => {
  for (const [role, paths] of Object.entries(RESTRICTED_ROLE_PATHS)) {
    assert.ok(Array.isArray(paths) && paths.length > 0, `دور ${role} بلا مسارات`);
  }
});
