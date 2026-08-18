/**
 * حارس أدوار القطاع ‹FNB-107›.
 *
 * أخطر ما يحرسه: **لا دورٌ يفقد صلاحيّةً** بإضافة أدوارٍ جديدة، و**القاعدة
 * مطابقةٌ للشاشة حرفيًّا** (درس ل‑١٨: قاعدةٌ أضيق من الشاشة تعني زرًّا يعمل
 * ثمّ يُرفض حيًّا، وأوسعُ منها تعني بابًا مفتوحًا لا يُنتبه له).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, DEFAULT_ROLE, MANAGER_ROLES, FNB_ROLES, FNB_OWNED_INPUTS, getRole, isAdmin } from './roles.js';
import { flatItems } from './navCatalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** الأدوار الستّة عشر التي كانت قبل القطاع — لا يفقد أحدها شيئًا. */
const PRE_FNB_ROLES = [
  'admin', 'warehouse_manager', 'storekeeper', 'qc_inspector', 'gate_officer',
  'purchase_officer', 'finance_manager', 'return_manager', 'inventory_auditor',
  'viewer', 'department_user', 'fleet', 'treasury', 'labor_supervisor',
  'sales_rep', 'sales_supervisor',
];

test('★★ لا دورٌ يُفقد: الستّة عشر السابقة كلّها باقيةٌ بمعرّفاتها', () => {
  for (const id of PRE_FNB_ROLES) {
    assert.ok(ROLES[id], `الدور «${id}» اختفى`);
    assert.equal(ROLES[id].id, id);
    assert.ok(ROLES[id].label, `الدور «${id}» بلا اسمٍ عربيّ`);
  }
  assert.equal(Object.keys(ROLES).length, PRE_FNB_ROLES.length + 2, 'دوران اثنان فقط أُضيفا');
});

test('دورا القطاع معرَّفان: صاحبُ المدخل ومصدرُ البيانات', () => {
  assert.deepEqual(FNB_ROLES, ['fnb_manager', 'branch_manager']);
  for (const id of FNB_ROLES) {
    assert.ok(ROLES[id], `دور القطاع «${id}» غير معرَّف`);
    assert.equal(getRole(id).id, id);
  }
  // وليسا مديرَين: الهيكل قرارُ الإدارة لا القطاع.
  assert.equal(MANAGER_ROLES.includes('fnb_manager'), false);
  assert.equal(isAdmin('fnb_manager'), false);
});

test('المدخلات التسعة التي يملكها القطاع مُعلَنةٌ سجلًّا — ملكيّةٌ لا مجرّد حقل', () => {
  assert.equal(FNB_OWNED_INPUTS.length, 9);
  for (const key of ['brands', 'branches', 'menu', 'openingPlans', 'campaigns', 'salesForecast']) {
    assert.ok(FNB_OWNED_INPUTS.includes(key), `المدخل «${key}» من القسم «أولًا» غائب`);
  }
});

test('الدور المجهول يسقط إلى الأقلّ صلاحيّة — لا إلى دورٍ جديد', () => {
  assert.equal(getRole('fnb_boss').id, DEFAULT_ROLE);
  assert.equal(getRole(undefined).id, DEFAULT_ROLE);
});

test('★ مطابقة الشاشة بالقاعدة: كلّ دورٍ في كتالوج التنقّل معرَّفٌ في السيّد', () => {
  const declared = new Set(Object.keys(ROLES));
  for (const item of flatItems()) {
    for (const role of item.roles || []) {
      assert.ok(declared.has(role), `الشاشة «${item.path}» تمنح دورًا غير معرَّف: «${role}»`);
    }
  }
});

test('★ مطابقة ل‑١٨: من يكتب الشجرة في الشاشة يكتبها في القاعدة', () => {
  const screen = fs.readFileSync(path.join(ROOT, 'src/components/brandzo-erp/org/OrgDimensions.jsx'), 'utf8');
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

  // الشاشة تمنح مدير القطاع الدخول…
  assert.match(screen, /VIEWER_ROLES\s*=\s*\[[^\]]*'fnb_manager'/);
  // …والقاعدة تقبل كتابته على المجموعة نفسها.
  const block = rules.slice(rules.indexOf('match /org_locations/'), rules.indexOf('match /org_locations/') + 320);
  assert.match(block, /isFnbManager\(\)/, 'القاعدة أضيق من الشاشة — زرٌّ يعمل ثمّ يُرفض حيًّا');
  // ولا حذف — الموقع يُعطَّل ولا يُمحى.
  assert.match(block, /allow delete: if false/);
});

test('مدير القطاع ليس فاعلًا مخزنيًّا — لا يقيّد حركةً ولا يعتمد صرفًا', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const actor = rules.slice(rules.indexOf('function isStockActor()'), rules.indexOf('function isStockActor()') + 420);
  assert.equal(actor.includes('fnb_manager'), false, 'دور القطاع تسرّب إلى فاعلي المخزون');
});
