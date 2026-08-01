/** اختبارات مصفوفة الصلاحيات (المحور ٢-ب) — النموذج + دمجها في حارس الصفحات. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMatrix,
  overrideFor,
  setOverride,
  countOverrides,
} from './accessMatrix.js';
import { canOpenPath, allowedPathsFor, landingPathFor } from './pageAccess.js';

test('normalizeMatrix: يتسامح مع العطب ويطبّع المسارات', () => {
  assert.deepEqual(normalizeMatrix(null), { overrides: {} });
  assert.deepEqual(normalizeMatrix({}), { overrides: {} });
  assert.deepEqual(normalizeMatrix({ overrides: 'junk' }), { overrides: {} });

  const m = normalizeMatrix({
    overrides: {
      viewer: { allow: ['/dashboard/tasks/', '/dashboard/tasks', 7, 'no-slash'], deny: [] },
      fleet: 'junk',
    },
  });
  assert.deepEqual(m.overrides.viewer.allow, ['/dashboard/tasks']); // بلا تكرار ولا شرطة ختامية
  assert.equal(m.overrides.fleet, undefined);
});

test('normalizeMatrix: الحجب يغلب — المسار المحجوب يُشطب من السماح', () => {
  const m = normalizeMatrix({
    overrides: { viewer: { allow: ['/dashboard/kpis'], deny: ['/dashboard/kpis'] } },
  });
  assert.deepEqual(m.overrides.viewer.allow, []);
  assert.deepEqual(m.overrides.viewer.deny, ['/dashboard/kpis']);
});

test('setOverride: لا يمسّ الأصل ويدور الحالات، وإزالة آخر تجاوز تمسح الدور', () => {
  const base = { overrides: {} };
  const withAllow = setOverride(base, 'viewer', '/dashboard/tasks', 'allow');
  assert.deepEqual(base, { overrides: {} }); // الأصل سليم
  assert.equal(overrideFor(withAllow, 'viewer', '/dashboard/tasks'), 'allow');

  const withDeny = setOverride(withAllow, 'viewer', '/dashboard/tasks', 'deny');
  assert.equal(overrideFor(withDeny, 'viewer', '/dashboard/tasks'), 'deny');

  const cleared = setOverride(withDeny, 'viewer', '/dashboard/tasks', null);
  assert.equal(overrideFor(cleared, 'viewer', '/dashboard/tasks'), null);
  assert.equal(cleared.overrides.viewer, undefined);
  assert.equal(countOverrides(cleared), 0);
});

test('canOpenPath: بلا مصفوفة (null) يبقى السلوك الأصلي حرفيًّا', () => {
  assert.equal(canOpenPath('viewer', '/dashboard/users'), false);
  assert.equal(canOpenPath('viewer', '/dashboard/reports'), true);
  assert.equal(canOpenPath('admin', '/dashboard/users'), true);
});

test('canOpenPath: السماح يمنح والحجب يمنع، والافتراضي يبقى للكتالوج', () => {
  const m = normalizeMatrix({
    overrides: {
      viewer: { allow: ['/dashboard/tasks'], deny: ['/dashboard/reports'] },
    },
  });
  assert.equal(canOpenPath('viewer', '/dashboard/tasks', m), true); // كان ممنوعًا
  assert.equal(canOpenPath('viewer', '/dashboard/reports', m), false); // كان مسموحًا
  assert.equal(canOpenPath('viewer', '/dashboard/studies', m), true); // افتراضي الكتالوج
});

test('canOpenPath: يستحيل قفل المدير العام بالمصفوفة', () => {
  const m = normalizeMatrix({ overrides: { admin: { allow: [], deny: ['/dashboard'] } } });
  assert.equal(canOpenPath('admin', '/dashboard', m), true);
  assert.equal(canOpenPath('admin', '/dashboard/users', m), true);
});

test('allowedPathsFor: السماح الإضافي يظهر في القائمة والحجب يسقطها', () => {
  const m = normalizeMatrix({
    overrides: { viewer: { allow: ['/dashboard/tasks'], deny: ['/dashboard/reports'] } },
  });
  const paths = allowedPathsFor('viewer', m);
  assert.ok(paths.includes('/dashboard/tasks'));
  assert.ok(!paths.includes('/dashboard/reports'));
});

test('landingPathFor: حجب صفحة الهبوط يحوّل لغيرها المسموح', () => {
  const before = landingPathFor('fleet');
  const m = normalizeMatrix({ overrides: { fleet: { allow: [], deny: [before] } } });
  const after = landingPathFor('fleet', m);
  assert.notEqual(after, before);
  assert.equal(canOpenPath('fleet', after, m), true);
});
