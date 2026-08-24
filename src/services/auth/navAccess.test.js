/**
 * اختبارات تقييد القائمة الجانبية — `navAccess.js`.
 *
 * ⚠️ سبب وجود هذا الملف: كشف تدقيق 23.07.2026 أن ملف الاستئناف يدّعي
 * «16/16 اختبارًا لتقييد القائمة» بينما **لم يكن هناك ملف اختبار إطلاقًا** —
 * أي أن مصدر الصلاحيات الوحيد كان بلا أي تغطية. هذا الملف يسدّ الادّعاء.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_NAV, NAV_GROUP_LABELS, canSeeGroup, canSeeItem, canSeeHome, groupsFor, duplicateIndexes } from './navAccess.js';
import { ROLES } from './roles.js';
import { NAV_GROUPS } from './navCatalog.js';

test('كل دور في roles.js له مصفوفة مجموعات في ROLE_NAV', () => {
  for (const id of Object.keys(ROLES)) {
    assert.ok(Array.isArray(ROLE_NAV[id]), `الدور «${id}» بلا مصفوفة مجموعات`);
  }
});

test('كل مفتاح مجموعة في ROLE_NAV موجود فعلًا في كتالوج القائمة', () => {
  const real = new Set(NAV_GROUPS.map((g) => g.key));
  for (const [role, groups] of Object.entries(ROLE_NAV)) {
    for (const key of groups) {
      assert.ok(real.has(key), `الدور «${role}» يشير لمجموعة غير موجودة: ${key}`);
    }
  }
});

test('كل مجموعة في الكتالوج لها تسمية ويراها دور واحد على الأقل', () => {
  for (const g of NAV_GROUPS) {
    assert.ok(NAV_GROUP_LABELS[g.key], `المجموعة «${g.key}» بلا تسمية`);
    const seen = Object.keys(ROLES).some((r) => canSeeGroup(r, g.key));
    assert.ok(seen, `المجموعة «${g.key}» لا يراها أي دور`);
  }
});

test('الأدمن يرى كل المجموعات وكل العناصر مهما كانت أدوارها', () => {
  for (const g of NAV_GROUPS) {
    assert.equal(canSeeGroup('admin', g.key), true);
  }
  assert.equal(canSeeItem('admin', ['warehouse_manager']), true);
  assert.equal(canSeeItem('admin', ['department_user']), true);
});

test('مدير المستودع يرى كل المجموعات (لكن لا يرث عناصر الأدمن الحصرية)', () => {
  for (const g of NAV_GROUPS) {
    assert.equal(canSeeGroup('warehouse_manager', g.key), true);
  }
  // «إدارة المستخدمين» و«الصلاحيات» محصورتان بالأدمن:
  assert.equal(canSeeItem('warehouse_manager', ['admin']), false);
});

test('أمين المخزن لا يرى الأرشيف ولا الحركة ولا طلبات الإدارات', () => {
  assert.equal(canSeeGroup('storekeeper', 'daily'), true);
  assert.equal(canSeeGroup('storekeeper', 'warehouses'), true);
  assert.equal(canSeeGroup('storekeeper', 'archive'), false);
  assert.equal(canSeeGroup('storekeeper', 'fleet'), false);
  assert.equal(canSeeGroup('storekeeper', 'dept'), false);
});

test('المشاهد يرى التقارير وحدها', () => {
  assert.deepEqual(groupsFor('viewer'), ['reports']);
  assert.equal(canSeeGroup('viewer', 'reports'), true);
  assert.equal(canSeeGroup('viewer', 'daily'), false);
  assert.equal(canSeeGroup('viewer', 'archive'), false);
});

test('دور مجهول يسقط على أقل صلاحية (المشاهد) لا على «يرى كل شيء»', () => {
  assert.deepEqual(groupsFor('غير-موجود'), groupsFor('viewer'));
  assert.equal(canSeeGroup(undefined, 'archive'), false);
  assert.equal(canSeeGroup(null, 'daily'), false);
});

test('canSeeItem: بلا أدوار = متاح لمن يرى المجموعة', () => {
  assert.equal(canSeeItem('storekeeper', undefined), true);
  assert.equal(canSeeItem('storekeeper', []), true);
  assert.equal(canSeeItem('storekeeper', ['admin', 'warehouse_manager']), false);
  assert.equal(canSeeItem('warehouse_manager', ['admin', 'warehouse_manager']), true);
});

test('الأدوار المركّزة (مجموعة واحدة) لا ترى لوحة التحكم الرئيسية', () => {
  assert.equal(canSeeHome('fleet'), false);
  assert.equal(canSeeHome('treasury'), false);
  assert.equal(canSeeHome('viewer'), false);
});

test('الأدوار متعددة المجموعات ترى لوحة التحكم الرئيسية', () => {
  // مستخدم الإدارة صار له منطقتان (dept + procurement) فصار يرى الرئيسية.
  for (const r of ['admin', 'warehouse_manager', 'storekeeper', 'qc_inspector', 'finance_manager', 'department_user']) {
    assert.equal(canSeeHome(r), true, `الدور «${r}» يجب أن يرى الرئيسية`);
  }
});

test('«الحركة» و«أمين الخزينة» مركّزان، و«مستخدم إدارة» بمنطقتيه', () => {
  assert.deepEqual(groupsFor('fleet'), ['fleet']);
  assert.deepEqual(groupsFor('treasury'), ['procurement']);
  assert.deepEqual(groupsFor('department_user'), ['dept', 'procurement']);
  assert.equal(canSeeGroup('fleet', 'daily'), false);
  assert.equal(canSeeGroup('treasury', 'warehouses'), false);
  assert.equal(canSeeGroup('department_user', 'warehouses'), false);
});

test('groupsFor يُعيد نسخة — تعديلها لا يفسد الخريطة', () => {
  const g = groupsFor('storekeeper');
  g.push('archive');
  assert.equal(canSeeGroup('storekeeper', 'archive'), false);
});

/* ═══ مدخلٌ واحدٌ لكل صفحة (تدقيق 24.08.2026) ═══ */

test('duplicateIndexes تُبقي الأوّل وتشير إلى ما تكرّر بعده', () => {
  assert.deepEqual(duplicateIndexes(['/a', '/b', '/a', '/c', '/a']), [2, 4]);
  assert.deepEqual(duplicateIndexes(['/a', '/b', '/c']), []);
  assert.deepEqual(duplicateIndexes([]), []);
});

test('duplicateIndexes تتجاهل الفارغ — الروابط الخارجية بلا مسارٍ كتالوجيّ', () => {
  assert.deepEqual(duplicateIndexes(['', '/a', '', '/a']), [3]);
});

test('★ لا يرى دورٌ واحدٌ صفحةً مرّتين — بعد إزالة التكرار عند العرض', () => {
  for (const role of Object.keys(ROLES)) {
    const paths = [];
    for (const g of NAV_GROUPS) {
      if (!canSeeGroup(role, g.key)) continue;
      for (const it of g.items) {
        if (!canSeeItem(role, it.roles)) continue;
        if (!it.external) paths.push(it.path);
      }
    }
    const shown = paths.filter((_, i) => !duplicateIndexes(paths).includes(i));
    assert.equal(
      new Set(shown).size,
      shown.length,
      `الدور «${role}» يرى صفحةً مرّتين رغم إزالة التكرار`
    );
  }
});

test('التكرار المقصود يبقى في الكتالوج — الحذف يكسر أصحابه', () => {
  const homes = new Map();
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (!homes.has(it.path)) homes.set(it.path, []);
      homes.get(it.path).push(g.key);
    }
  }
  // «المهام» مُدرجة لمستخدم الإدارة في مجموعته، وهو لا يرى «العمليات اليومية».
  assert.ok(homes.get('/dashboard/tasks').includes('dept'));
  assert.equal(canSeeGroup('department_user', 'daily'), false);
});
