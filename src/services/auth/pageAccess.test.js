/**
 * اختبارات حارس الصفحات — `pageAccess.js` (منطق خالص، بلا Firebase).
 *
 * أُعيدت كتابتها بعد تدقيق 23.07.2026 الذي كشف أن الحارس كان يقيّد دورين
 * فقط، وأن كل دور آخر يفتح **أي** صفحة بكتابة رابطها. الاختبارات هنا تثبت
 * الإغلاق دورًا-بدور، وتمنع عودة الثغرة باختبار انحراف يقارن الكتالوج
 * بملفات الصفحات الفعلية على القرص.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALWAYS_ALLOWED,
  HOME_PATH,
  canOpenPath,
  allowedPathsFor,
  landingPathFor,
  isPathAllowed,
  toCatalogPath,
} from './pageAccess.js';
import { internalPaths, placementsFor } from './navCatalog.js';
import { ROLES } from './roles.js';

const BASE = '/warehouse-system';

/** الصفحات المحصورة بأدوار في كل مواضعها — تُقرأ من الكتالوج نفسه. */
const ROLE_LOCKED = internalPaths().filter((p) =>
  placementsFor(p).every((s) => Array.isArray(s.roles) && s.roles.length > 0)
);

/* ═══════════ الأدمن وتوحيد المسارات ═══════════ */

test('الأدمن يفتح كل شيء بما فيه مسار غير معروف', () => {
  assert.equal(canOpenPath('admin', '/dashboard/anything'), true);
  assert.equal(canOpenPath('admin', HOME_PATH), true);
  for (const p of internalPaths()) assert.equal(canOpenPath('admin', p), true);
});

test('توحيد المسار: الشرطة الختامية والبادئة والترميز العربي', () => {
  assert.equal(toCatalogPath(`${BASE}/dashboard/products`, BASE), '/dashboard/products');
  assert.equal(toCatalogPath(`${BASE}/dashboard/products/`, BASE), '/dashboard/products');
  assert.equal(toCatalogPath(`${BASE}/dashboard`, BASE), HOME_PATH);
  assert.equal(toCatalogPath(`${BASE}/dashboard/`, BASE), HOME_PATH);
  // المسار العربي يصل من المتصفّح مُرمَّزًا:
  assert.equal(
    toCatalogPath(`${BASE}/dashboard/${encodeURIComponent('تقرير-الدورة-المستندية-الكامل')}`, BASE),
    '/dashboard/تقرير-الدورة-المستندية-الكامل'
  );
});

/* ═══════════ الثغرة المُغلقة ═══════════ */

test('🔒 لا دور غير الأدمن يفتح إدارة المستخدمين أو الصلاحيات', () => {
  for (const role of Object.keys(ROLES)) {
    if (role === 'admin') continue;
    for (const p of ['/dashboard/users', '/dashboard/access-control']) {
      assert.equal(canOpenPath(role, p), false, `الدور «${role}» فتح ${p}`);
    }
  }
});

test('🔒 لا دور خارج المديرَين يفتح التوظيف أو متابعة العمليات أو العُهد', () => {
  const managerOnly = ['/dashboard/recruitment', '/dashboard/operations', '/dashboard/custody', '/dashboard/supply-chain'];
  for (const role of Object.keys(ROLES)) {
    if (role === 'admin' || role === 'warehouse_manager') continue;
    for (const p of managerOnly) {
      assert.equal(canOpenPath(role, p), false, `الدور «${role}» فتح ${p}`);
    }
  }
});

test('🔒 تقييم مدير المستودعات السرّي: الأدمن ومستخدم الإدارة فقط', () => {
  const p = '/dashboard/wh-manager-eval';
  assert.equal(canOpenPath('admin', p), true);
  assert.equal(canOpenPath('department_user', p), true);
  for (const role of Object.keys(ROLES)) {
    if (role === 'admin' || role === 'department_user') continue;
    assert.equal(canOpenPath(role, p), false, `الدور «${role}» فتح التقييم السرّي`);
  }
});

test('🔒 أمين المخزن ومفتّش الجودة محصوران بمجموعاتهما', () => {
  // مسموح:
  assert.equal(canOpenPath('storekeeper', '/dashboard/products'), true);
  assert.equal(canOpenPath('storekeeper', '/dashboard/warehouses'), true);
  assert.equal(canOpenPath('qc_inspector', '/dashboard/documents'), true);
  // ممنوع (كان مفتوحًا قبل الإصلاح):
  assert.equal(canOpenPath('storekeeper', '/dashboard/users'), false);
  assert.equal(canOpenPath('storekeeper', '/dashboard/org-structure'), false);
  assert.equal(canOpenPath('storekeeper', '/dashboard/vehicles-inventory'), false);
  assert.equal(canOpenPath('qc_inspector', '/dashboard/warehouses'), false);
  assert.equal(canOpenPath('qc_inspector', '/dashboard/meetings'), false);
});

test('🔒 صفحة لا يعرفها الكتالوج تُمنع افتراضيًّا لغير الأدمن', () => {
  assert.equal(canOpenPath('storekeeper', '/dashboard/anything'), false);
  // لا ثغرة startsWith ساذجة:
  assert.equal(canOpenPath('warehouse_manager', '/dashboard/hiring-requests-extra'), false);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/hiring-requests-extra`, BASE), false);
});

test('🔒 الدور المجهول أو الغائب يُعامَل بأقل صلاحية لا بأوسعها', () => {
  // قبل الإصلاح كان `undefined` يعني «بلا تقييد إطلاقًا».
  assert.equal(canOpenPath(undefined, '/dashboard/users'), false);
  assert.equal(canOpenPath(null, '/dashboard/products'), false);
  assert.equal(canOpenPath('دور-وهمي', '/dashboard/recruitment'), false);
  assert.equal(isPathAllowed(undefined, `${BASE}/dashboard/users`, BASE), false);
});

/* ═══════════ الأدوار المركّزة (السلوك محفوظ كما كان) ═══════════ */

test('«الحركة»: صفحاته الثلاث فقط، ولا رئيسية', () => {
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/vehicles-inventory`, BASE), true);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/fleet-operations`, BASE), true);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/maintenance-center`, BASE), true);
  // العُهد (أثر مالي) واللوحة التنفيذية للمديرَين — لا يصلهما دور الحركة.
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/custody`, BASE), false);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard/supply-chain`, BASE), false);
  assert.equal(isPathAllowed('fleet', `${BASE}/dashboard`, BASE), false);
});

test('«مستخدم إدارة»: صفحاته الأربع فقط، ولا رئيسية', () => {
  for (const p of ['/dashboard/hiring-requests', '/dashboard/tasks', '/dashboard/meeting-assistant', '/dashboard/wh-manager-eval']) {
    assert.equal(isPathAllowed('department_user', `${BASE}${p}`, BASE), true, `منع ${p}`);
    assert.equal(isPathAllowed('department_user', `${BASE}${p}/`, BASE), true, `الشرطة الختامية كسرت ${p}`);
  }
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/warehouses`, BASE), false);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard/recruitment`, BASE), false);
  assert.equal(isPathAllowed('department_user', `${BASE}/dashboard`, BASE), false);
});

test('صفحة في مجموعتين بأدوار مختلفة: يكفي موضع واحد مسموح', () => {
  // «المهام» في «العمليات اليومية» (بلا قيد) وفي «طلبات الإدارات» (department_user).
  assert.ok(placementsFor('/dashboard/tasks').length >= 2, 'يفترض تكرار المهام في مجموعتين');
  assert.equal(canOpenPath('storekeeper', '/dashboard/tasks'), true);
  assert.equal(canOpenPath('department_user', '/dashboard/tasks'), true);
});

/* ═══════════ وجهة الهبوط ═══════════ */

test('وجهة الهبوط: الرئيسية لمن يراها، وصفحة عمل للمركّزين', () => {
  assert.equal(landingPathFor('admin'), HOME_PATH);
  assert.equal(landingPathFor('storekeeper'), HOME_PATH);
  assert.equal(landingPathFor('fleet'), '/dashboard/vehicles-inventory');
  assert.equal(landingPathFor('department_user'), '/dashboard/hiring-requests');
});

test('وجهة الهبوط مسموحة دائمًا لصاحبها (لا حلقة تحويل لا نهائية)', () => {
  for (const role of Object.keys(ROLES)) {
    assert.equal(canOpenPath(role, landingPathFor(role)), true, `الدور «${role}» يُحوَّل لصفحة ممنوعة عليه`);
  }
});

test('allowedPathsFor: غير فارغة لكل دور ولا تحوي ممنوعًا', () => {
  for (const role of Object.keys(ROLES)) {
    const allowed = allowedPathsFor(role);
    assert.ok(allowed.length > 0, `الدور «${role}» بلا أي صفحة`);
    for (const p of allowed) {
      assert.equal(canOpenPath(role, p), true, `«${role}»: ${p} مسموح ثم ممنوع`);
    }
  }
});

test('كل صفحة محصورة بأدوار يفتحها أصحابها فعلًا', () => {
  for (const p of ROLE_LOCKED) {
    const owners = new Set(placementsFor(p).flatMap((s) => s.roles || []));
    for (const owner of owners) {
      assert.equal(canOpenPath(owner, p), true, `«${owner}» لا يفتح ${p} رغم أنه من أصحابها`);
    }
  }
});

/* ═══════════ اختبار الانحراف — يمنع عودة الصفحات اليتيمة ═══════════ */

const PAGES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../pages/dashboard');

test('انحراف: كل صفحة على القرص لها موضع في الكتالوج أو استثناء صريح', () => {
  const onDisk = fs
    .readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith('.astro'))
    .map((f) => (f === 'index.astro' ? HOME_PATH : `/dashboard/${f.replace(/\.astro$/, '')}`));

  const known = new Set([HOME_PATH, ...ALWAYS_ALLOWED, ...internalPaths()]);
  const orphans = onDisk.filter((p) => !known.has(p));

  assert.deepEqual(
    orphans,
    [],
    `صفحات يتيمة (لا في القائمة ولا في ALWAYS_ALLOWED) — أضِفها لـnavCatalog.js: ${orphans.join(' · ')}`
  );
});

test('انحراف: كل مسار داخلي في الكتالوج له ملف صفحة فعلي', () => {
  const missing = internalPaths().filter(
    (p) => !fs.existsSync(path.join(PAGES_DIR, `${p.replace('/dashboard/', '')}.astro`))
  );
  assert.deepEqual(missing, [], `روابط قائمة بلا صفحات: ${missing.join(' · ')}`);
});
