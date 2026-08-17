/**
 * اختبارات مُحلِّل الموارد ‹EXE-401› — الحالة تُحسب ولا تُخزَّن، ولا سجلّ رابع.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESOURCE_KINDS,
  RESOURCE_STATE,
  filterResources,
  isAssignable,
  pendingKinds,
  resolveResources,
  resourcesSnapshot,
} from './resourcesResolver.js';
import { ASSET_CATEGORIES } from '../maintenance/workOrderModel.js';

const crews = [
  { id: 'c1', crewNo: '1', shift: 'صباحية', members: ['أ', 'ب'], active: true },
  { id: 'c2', crewNo: '2', shift: 'مسائية', members: ['ج'], active: false },
];
// سجلّ الأسطول يسمّي اللوحة `plateNo` — والبذرة تطابق المخزَّن لا تخترع شكلًا.
const vehicles = [{ id: 'v1', plateNo: '12345' }, { id: 'v2', plateNo: '67890' }];
const assets = [
  { id: 'a1', code: 'FK-01', name: 'رافعة شوكية 1', category: 'handling' },
  { id: 'a2', code: 'CH-01', name: 'غرفة تبريد', category: 'cooling' },
];

test('★★ لا مجموعة Firestore جديدة — كلّ نوعٍ يُسمّي مصدره القائم', () => {
  assert.equal(RESOURCE_KINDS.crew.source, 'crews');
  assert.equal(RESOURCE_KINDS.vehicle.source, 'vehicles');
  assert.equal(RESOURCE_KINDS.handling.assetCategory, ASSET_CATEGORIES.handling.id);
});

test('★ نقطة التوسعة معلَنة — ووصلُ مصدرٍ يُسقط وسمَه بلا لمس المنطق', () => {
  // كان الباب هو المعلَّق الوحيد، ووصله ‹EXE-601› بمصدرٍ حقيقيّ (سجلّ الأبواب
  // وإشغالٌ محسوبٌ من زيارات الساحة) فسقط الوسم — وهذا هو معنى «نقطة معلَنة».
  assert.deepEqual(pendingKinds(), [], 'لا نوعَ بلا مصدر بعد ت٦');
  assert.equal(RESOURCE_KINDS.door.source, 'doors');
});

/* ── الباب موردًا ‹EXE-601› ───────────────────────────────────── */

test('★★ الباب مورد يقرؤه المُحلِّل نفسه — لا سجلَّ حالةٍ رابع', () => {
  const doors = [{ code: 'D1', label: 'باب ١' }, { code: 'D2' }];
  const yardVisits = [{ plate: 'BN-7', doorCode: 'D1', stage: 'working', stamps: { atDoorAt: 0 } }];
  const rows = resolveResources({ doors, yardVisits, nowMs: 60000 });
  assert.equal(rows.length, 2);
  const [d1, d2] = rows;
  assert.equal(d1.kind, 'door');
  assert.equal(d1.state, 'busy');
  assert.match(d1.reason, /BN-7/, 'والسبب يقول من يشغله');
  assert.equal(d1.plate, 'BN-7');
  assert.equal(d2.state, 'available');
});

test('صيانة الباب من أوامر الشغل نفسها — بابٌ معطوبٌ أصلٌ كالرافعة', () => {
  const doors = [{ code: 'D1' }];
  const workOrders = [{ id: 'w1', state: 'confirmed', assetCode: 'D1', number: 'WO-9' }];
  const [d1] = resolveResources({ doors, workOrders });
  assert.equal(d1.state, 'maintenance');
  assert.match(d1.reason, /WO-9/);
});

test('الباب المخرَج من الخدمة متوقّفٌ ولا يُسنَد إليه عمل', () => {
  const [d1] = resolveResources({ doors: [{ code: 'D1', active: false }] });
  assert.equal(d1.state, 'stopped');
  assert.equal(isAssignable(d1), false);
});

test('لقطة الموارد تعدّ الأبواب نوعًا كغيره بلا فرعٍ خاصّ', () => {
  const rows = resolveResources({
    crews: [crews[0]],
    doors: [{ code: 'D1' }, { code: 'D2', active: false }],
  });
  const snap = resourcesSnapshot(rows);
  assert.equal(snap.byKind.door.total, 2);
  assert.equal(snap.byKind.door.available, 1);
  assert.equal(snap.byKind.door.out, 1);
  assert.equal(filterResources(rows, { kind: 'door', assignableOnly: true }).length, 1);
});

/* ── الحالة تُحسب ─────────────────────────────────────────────── */

test('★★ الفرقة مشغولةٌ بمهمّتها الجارية — والسبب يقول أيّ مهمّة', () => {
  const laborTasks = [{ id: 't1', crewId: 'c1', state: 'in_progress', docRef: { number: 'PICK-2026-0007' } }];
  const [c1] = resolveResources({ crews: [crews[0]], laborTasks });
  assert.equal(c1.state, 'busy');
  assert.match(c1.reason, /PICK-2026-0007/);
  assert.equal(c1.currentTaskId, 't1');
});

test('★ المتوقّفة مؤقّتًا مشغولةٌ أيضًا — ما بدأ ولم ينتهِ يشغل الفرقة', () => {
  const laborTasks = [{ id: 't2', crewId: 'c1', state: 'paused' }];
  assert.equal(resolveResources({ crews: [crews[0]], laborTasks })[0].state, 'busy');
});

test('★ الفرقة المؤرشَفة خارج الخدمة ولا تُحذف', () => {
  const [, c2] = resolveResources({ crews });
  assert.equal(c2.state, 'stopped');
  assert.match(c2.reason, /مؤرشَفة/);
});

test('★★ الصيانة تسبق الرحلة — مركبةٌ في الورشة لا تُرسَل ولو كانت رحلتها مفتوحة', () => {
  const workOrders = [{ number: 'WO-1', assetCode: '12345', state: 'in_progress' }];
  const trips = [{ id: 'tr1', plate: '12345', state: 'enroute', number: 'TRIP-9' }];
  const [v1] = resolveResources({ vehicles: [vehicles[0]], workOrders, trips });
  assert.equal(v1.state, 'maintenance');
  assert.match(v1.reason, /أمر شغل مفتوح/);
});

test('المركبة في رحلةٍ مشغولة، والخالية متاحة', () => {
  const trips = [{ id: 'tr1', plate: '12345', state: 'enroute', number: 'TRIP-9' }];
  const [v1, v2] = resolveResources({ vehicles, trips });
  assert.equal(v1.state, 'busy');
  assert.match(v1.reason, /TRIP-9/);
  assert.equal(v2.state, 'available');
});

test('★ أمر شغلٍ مُغلق لا يُعطّل موردًا', () => {
  const workOrders = [{ number: 'WO-1', assetCode: '12345', state: 'closed' }];
  assert.equal(resolveResources({ vehicles: [vehicles[0]], workOrders })[0].state, 'available');
});

test('★★ معدّات المناولة وحدها تُحلّ — لا كلّ الأصول', () => {
  const rows = resolveResources({ assets });
  assert.equal(rows.length, 1, 'غرفة التبريد ليست مورد مناولة');
  assert.equal(rows[0].kind, 'handling');
  assert.equal(rows[0].label, 'رافعة شوكية 1');
});

test('الرافعة في الصيانة لا تُسنَد', () => {
  const workOrders = [{ number: 'WO-2', assetCode: 'FK-01', state: 'confirmed' }];
  const [fk] = resolveResources({ assets, workOrders });
  assert.equal(fk.state, 'maintenance');
  assert.equal(isAssignable(fk), false);
});

/* ── لا نسخ ولا اختراع ────────────────────────────────────────── */

test('★★ لا حقلَ يُنسَخ من مصدره — المعرّف يُحيل ولا يُكرّر البيانات', () => {
  const [c1] = resolveResources({ crews: [crews[0]] });
  // ما يظهر هنا محسوبٌ أو مُحال إليه: لا `members` ولا `forkliftDriver` منسوخة.
  assert.equal('members' in c1, false);
  assert.equal('active' in c1, false);
  assert.equal(c1.sourceId, 'c1', 'والمعرّف يقود إلى المصدر');
});

test('★★ المجهول لا يُعامَل متاحًا — الشكّ لا يُرسِل عاملًا', () => {
  assert.equal(RESOURCE_STATE.unknown.assignable, false);
  assert.equal(isAssignable({ state: 'unknown' }), false);
  assert.equal(isAssignable({ state: 'طائر' }), false);
  assert.equal(isAssignable(null), false);
});

/* ── الترشيح واللقطة ─────────────────────────────────────────── */

test('الترشيح بالنوع والحالة والقابل للإسناد', () => {
  const rows = resolveResources({ crews, vehicles, assets });
  assert.equal(filterResources(rows, { kind: 'crew' }).length, 2);
  assert.equal(filterResources(rows, { state: 'stopped' }).length, 1);
  assert.equal(filterResources(rows, { assignableOnly: true }).length, 4, 'الكلّ عدا الفرقة المؤرشَفة');
});

test('اللقطة تعدّ لكلّ نوعٍ متاحه ومشغوله وخارجه', () => {
  const laborTasks = [{ id: 't1', crewId: 'c1', state: 'in_progress' }];
  const snap = resourcesSnapshot(resolveResources({ crews, vehicles, assets, laborTasks }));
  assert.equal(snap.total, 5);
  assert.deepEqual(snap.byKind.crew, { total: 2, available: 0, busy: 1, out: 1 });
  assert.equal(snap.byKind.vehicle.available, 2);
  assert.equal(snap.assignable, 3);
});

test('مصادر فارغة لا تُسقط المحلِّل', () => {
  assert.deepEqual(resolveResources(), []);
  assert.equal(resourcesSnapshot(null).total, 0);
});
