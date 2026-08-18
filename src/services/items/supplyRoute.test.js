/**
 * حارس مسارات التوريد ‹FNB-203›.
 *
 * أخطر ما يحرسه: **المسار الثالث** (مورّد ← الفرع مباشرةً) — الذي أسقطته
 * القراءة الأولى للمستند، وأثرُه في **القيد** لا في العرض؛ و**الترحيل صفر
 * الأثر** (صنفٌ بلا مسار يسلك ما يسلكه اليوم)؛ و**الأصناف المعتمَدة بلا
 * تسجيل الفرع عميلًا** — فذاك ممنوعٌ بحارسٍ صريح.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPLY_ROUTES, ROUTE_NODES, DEFAULT_ROUTE, normalizeRoute, routeOf,
  receivesAtBranch, chainOf, receiptRouteWarnings,
  allowedItemsFor, isItemAllowed, unapprovedItems,
} from './supplyRoute.js';
import { getSchema } from '../documents/schemas/index.js';
import { shapeImportedItem, SHAPED_FIELDS } from './itemShape.js';

test('★ المسارات الخمسة كلّها معرَّفة بعُقَدها — ولا واحدٌ يسقط', () => {
  assert.equal(Object.keys(SUPPLY_ROUTES).length, 5);
  const labels = Object.values(SUPPLY_ROUTES).map((r) => r.labelAr);
  assert.ok(labels.some((l) => l.includes('مخزن مركزيّ ← فرع')));
  assert.ok(labels.some((l) => l.includes('مطبخ مركزيّ ← فرع')));
  assert.ok(labels.some((l) => l.includes('الفرع مباشرةً')), 'المسار الثالث غائب');
  // وكلّ عقدةٍ مذكورةٍ معرَّفةٌ في السجلّ.
  for (const route of Object.values(SUPPLY_ROUTES)) {
    for (const node of route.nodes) assert.ok(ROUTE_NODES[node], `عقدةٌ غير معرَّفة: ${node}`);
  }
});

test('★★ الترحيل صفر الأثر: صنفٌ بلا مسارٍ مصرَّح يسلك مسار اليوم', () => {
  assert.equal(routeOf({ sku: 'A' }), DEFAULT_ROUTE);
  assert.equal(routeOf({ sku: 'A', supplyRoute: '' }), DEFAULT_ROUTE);
  assert.equal(routeOf({ sku: 'A', supplyRoute: 'مسارٌ مخترَع' }), DEFAULT_ROUTE);
  assert.equal(receivesAtBranch({ sku: 'A' }), false);
  assert.deepEqual(SUPPLY_ROUTES[DEFAULT_ROUTE].nodes, ['supplier', 'central_warehouse', 'restaurant']);
});

test('المرادفات: «مباشر» و«direct» تُعرَّف المسار الثالث — ولا تسقط صامتةً', () => {
  assert.equal(normalizeRoute('مباشر'), 'supplier_direct');
  assert.equal(normalizeRoute('Direct'), 'supplier_direct');
  assert.equal(normalizeRoute('توريد مباشر'), 'supplier_direct');
  assert.equal(normalizeRoute('عبر المطبخ'), 'supplier_kitchen_branch');
  assert.equal(normalizeRoute('بالطائرة'), ''); // المجهول يُعلَن مجهولًا.
});

test('★ كلّ مستندٍ في كلّ سلسلةٍ مبنيٌّ فعلًا — لا وعدَ بما لم يُبنَ', () => {
  for (const route of Object.values(SUPPLY_ROUTES)) {
    for (const type of route.docChain) {
      assert.ok(getSchema(type), `المسار «${route.id}» يَعِد بمستند «${type}» غير مبنيّ`);
    }
  }
  // والمسار المباشر أقصر: لا نقلَ بين مستودعَين فيه.
  assert.deepEqual(chainOf('supplier_direct'), ['PR', 'PO', 'GRN', 'QC']);
  assert.ok(!chainOf('supplier_direct').includes('TRN'));
});

test('★★ خطر المسار الثالث: موضع الاستلام يُحرَس بالاتّجاهين — ويُنبَّه لا يُمنع', () => {
  const items = new Map([
    ['BREAD', { sku: 'BREAD', supplyRoute: 'supplier_direct' }],
    ['RICE', { sku: 'RICE' }], // افتراضيّ: عبر المخزن.
  ]);
  const branches = ['BR01', 'BR02'];

  // ① صنفٌ مباشرٌ يُستلم في المخزن المركزيّ ⇒ تحذير: البضاعة لم تدخله.
  const atCentral = receiptRouteWarnings([{ sku: 'BREAD' }], items, { warehouse: 'MAIN', branchWarehouses: branches });
  assert.equal(atCentral.length, 1);
  assert.match(atCentral[0], /BREAD/);
  assert.match(atCentral[0], /يقلب الرصيد/);

  // ② وصنفٌ عاديّ يُستلم في فرعٍ ⇒ تحذير: تخطّى المخزن.
  const atBranch = receiptRouteWarnings([{ sku: 'RICE' }], items, { warehouse: 'BR01', branchWarehouses: branches });
  assert.equal(atBranch.length, 1);
  assert.match(atBranch[0], /تخطّى المخزن/);

  // ③ والصواب صامتٌ في الحالتين.
  assert.deepEqual(receiptRouteWarnings([{ sku: 'BREAD' }], items, { warehouse: 'BR01', branchWarehouses: branches }), []);
  assert.deepEqual(receiptRouteWarnings([{ sku: 'RICE' }], items, { warehouse: 'MAIN', branchWarehouses: branches }), []);
});

test('بلا قائمة فروعٍ لا يُحكم — لا حكمَ بجهلنا بالمستودعات', () => {
  const items = new Map([['BREAD', { sku: 'BREAD', supplyRoute: 'supplier_direct' }]]);
  assert.deepEqual(receiptRouteWarnings([{ sku: 'BREAD' }], items, { warehouse: 'MAIN' }), []);
});

test('★ الأصناف المعتمَدة قائمةٌ على صفّ الفرع — بلا تسجيله عميلًا', () => {
  const profile = { allowedSkus: ['chicken', 'CHICKEN', ' rice '] };
  assert.deepEqual(allowedItemsFor(profile), ['CHICKEN', 'RICE']);
  assert.equal(isItemAllowed(profile, 'chicken'), true);
  assert.equal(isItemAllowed(profile, 'CAVIAR'), false);
  // والطلب غير المعتمَد يُسمّى ولا يُمنع — قد يكون احتياجًا طارئًا.
  assert.deepEqual(unapprovedItems(profile, [{ sku: 'RICE' }, { sku: 'CAVIAR' }, { sku: 'TRUFFLE' }]), ['CAVIAR', 'TRUFFLE']);
});

test('★ القائمة الفارغة تعني «الكلّ مسموح» لا «لا شيء» — فرعٌ لم يُضبط لا يتعطّل', () => {
  assert.equal(isItemAllowed({}, 'ANYTHING'), true);
  assert.equal(isItemAllowed({ allowedSkus: [] }, 'ANYTHING'), true);
  assert.deepEqual(unapprovedItems({}, [{ sku: 'X' }, { sku: 'Y' }]), []);
});

test('الحقل يدخل تشكيل الصنف بالنمط القائم — استيرادٌ يكتبه كما يكتب النوع والوحدة', () => {
  assert.ok(SHAPED_FIELDS.includes('supplyRoute'));
  const writes = shapeImportedItem({ supplyRoute: 'مباشر' });
  assert.equal(writes.supplyRoute, 'supplier_direct');
  // والفارغ لا يُكتب — لا يُدهس مسارٌ قائم بفراغ.
  assert.equal('supplyRoute' in shapeImportedItem({}), false);
});
