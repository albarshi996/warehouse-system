/**
 * اختبارات فئتَي الباركود — الفصل الذي أصرّ عليه النصّ: بنيةُ المدير وتشغيلُ الموظّف.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARCODE_CLASSES,
  GENERATABLE_KINDS,
  classOf,
  generateProblem,
  generateVerdict,
  isStructureKind,
  opProblem,
  originLabel,
  ownsStructure,
  valueSourceProblem,
} from './barcodeKinds.js';
import { BARCODE_KINDS } from './barcodeCode.js';

test('الفئتان تغطّيان الأنواع التسعة التي يولّدها النظام — والصنف ليس منها', () => {
  assert.equal(GENERATABLE_KINDS.length, 9);
  assert.equal(classOf(BARCODE_KINDS.ITEM.id), '', 'باركود الصنف يأتي من المورّد ولا نصنعه');
  assert.equal(classOf(BARCODE_KINDS.DOCK_OUT.id), BARCODE_CLASSES.STRUCTURE.id);
  assert.equal(classOf(BARCODE_KINDS.PARCEL.id), BARCODE_CLASSES.OPERATION.id);
});

test('★★ البنية للمدير والمشرف وحدهما — والموظّف يُردّ برسالةٍ تسمّي من يملكها', () => {
  assert.equal(ownsStructure('admin'), true);
  assert.equal(ownsStructure('warehouse_manager'), true);
  assert.equal(ownsStructure('storekeeper'), false, 'أمين المخزن يستلم ويخزّن ولا يبني أبوابًا');
  assert.equal(ownsStructure('gate_officer'), false);

  const denied = generateProblem(BARCODE_KINDS.GATE_OUT.id, { portalRole: 'storekeeper' });
  assert.match(denied, /باركود بنية/);
  assert.match(denied, /مشرف المخزن|مدير النظام/, 'الرسالة تقول لمن يذهب — لا «ممنوع» تتركه واقفًا');
  assert.equal(generateProblem(BARCODE_KINDS.GATE_OUT.id, { portalRole: 'warehouse_manager' }), '');
});

test('التشغيل يحتاج صلاحيّة المهمّة الميدانيّة نفسها', () => {
  assert.equal(generateProblem(BARCODE_KINDS.PALLET.id, { portalRole: 'storekeeper' }), '', 'أمين المخزن يستلم فيولّد طبلية');
  assert.match(
    generateProblem(BARCODE_KINDS.PALLET.id, { portalRole: 'inventory_auditor' }),
    /صلاحيّة مهمّةٍ ميدانيّة/,
    'العادّ يعدّ ولا يكوّن حمولة'
  );
  assert.equal(generateProblem(BARCODE_KINDS.PARCEL.id, { portalRole: 'gate_officer' }), '', 'ضابط البوابة محمِّلٌ فيعبّئ');
});

test('نوعٌ لا يولّده النظام يُردّ بصراحة', () => {
  assert.match(generateProblem(BARCODE_KINDS.ITEM.id, { portalRole: 'admin' }), /يُقرأ ولا يُنشأ/);
  assert.match(generateProblem('شيء', { portalRole: 'admin' }), /لا يولّده النظام/);
});

test('★★ باركود التشغيل لا يولد إلّا أثناء مهمّةٍ مصرَّح بها — نصّ الطلب حرفيًّا', () => {
  const orphan = generateVerdict(BARCODE_KINDS.PARCEL.id, { portalRole: 'storekeeper' });
  assert.equal(orphan.ok, false);
  assert.match(orphan.message, /مهمّةٍ مصرَّح بها/, 'طردٌ بلا طلبٍ هويّةٌ بلا حمولة');

  const withDoc = generateVerdict(BARCODE_KINDS.PARCEL.id, { portalRole: 'storekeeper', docRef: 'PICK-2026-0044' });
  assert.equal(withDoc.ok, true);
  assert.equal(withDoc.class, BARCODE_CLASSES.OPERATION.id);

  const withTask = generateVerdict(BARCODE_KINDS.PALLET.id, { portalRole: 'storekeeper', taskId: 'RCV-9' });
  assert.equal(withTask.ok, true, 'المهمّة تكفي حيث لا مستند');
});

test('باركود البنية يلزمه سببٌ مكتوب — يبقى في المبنى سنين', () => {
  const noReason = generateVerdict(BARCODE_KINDS.DOCK_IN.id, { portalRole: 'warehouse_manager' });
  assert.equal(noReason.ok, false);
  assert.match(noReason.message, /سبب إنشائه/);

  const ok = generateVerdict(BARCODE_KINDS.DOCK_IN.id, {
    portalRole: 'warehouse_manager',
    reason: 'افتتاح الرصيف الشماليّ',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.class, BARCODE_CLASSES.STRUCTURE.id);
});

test('★★ الموظّف لا يكتب رقم الباركود — الحارس في البناء لا في الواجهة', () => {
  assert.match(
    valueSourceProblem(BARCODE_KINDS.PALLET.id, { value: 'LPN-MAIN-20260827-000009' }),
    /يولّده النظام وفق التسلسل/
  );
  assert.match(valueSourceProblem(BARCODE_KINDS.PARCEL.id, { value: 'SHP-RH-20260827-000125-01' }), /لا يُكتب بيد/);
  assert.equal(
    valueSourceProblem(BARCODE_KINDS.DOCK_OUT.id, { value: 'W01-DOCK-OUT-03' }),
    '',
    'وأمّا الباب فرقمه مكتوبٌ على الحديد — المدير يصف واقعًا لا يخترع تسلسلًا'
  );
  assert.equal(valueSourceProblem(BARCODE_KINDS.PALLET.id, {}), '', 'بلا قيمةٍ ممرَّرة لا مشكلة أصلًا');
});

test('العمليّات على باركودٍ قائم: الإلغاء والتوليد الجماعيّ للمدير، وإعادة الطباعة بصلاحيّةٍ معلنة', () => {
  assert.equal(opProblem('VOID', BARCODE_KINDS.DOCK_OUT.id, { portalRole: 'warehouse_manager' }), '');
  assert.match(opProblem('VOID', BARCODE_KINDS.DOCK_OUT.id, { portalRole: 'storekeeper' }), /المدير أو المشرف/);
  assert.match(opProblem('BULK_GENERATE', BARCODE_KINDS.LOCATION.id, { portalRole: 'storekeeper' }), /المدير أو المشرف/);

  assert.equal(opProblem('PRINT', BARCODE_KINDS.PALLET.id, { portalRole: 'storekeeper' }), '', 'المستلِم يطبع ملصق طبليته');
  assert.match(opProblem('REPRINT', BARCODE_KINDS.PALLET.id, { portalRole: 'storekeeper' }), /صلاحيّة معلنة/);
  assert.equal(opProblem('REPRINT', BARCODE_KINDS.PALLET.id, { portalRole: 'warehouse_manager' }), '');
  assert.match(opProblem('طيران', BARCODE_KINDS.PALLET.id, { portalRole: 'admin' }), /غير معروفة/);
});

test('★ وسمُ العرض مشتقٌّ لا مكتوب — «أُنشئ بواسطة المدير» أو «أثناء العمليّة رقم…»', () => {
  assert.equal(
    originLabel({ class: BARCODE_CLASSES.STRUCTURE.id, createdByName: 'محمد' }),
    'أُنشئ بواسطة المدير محمد'
  );
  assert.equal(
    originLabel({ class: BARCODE_CLASSES.OPERATION.id, createdByName: 'علي', docRef: 'GRN-2026-0012' }),
    'أُنشئ بواسطة الموظّف علي أثناء العمليّة GRN-2026-0012'
  );
  assert.equal(originLabel({ class: BARCODE_CLASSES.OPERATION.id }), 'أُنشئ بواسطة الموظّف', 'ولا يُخترع مرجعٌ غائب');
});

test('isStructureKind يفصل الفئتين بلا التباس', () => {
  assert.equal(isStructureKind(BARCODE_KINDS.VEHICLE.id), true);
  assert.equal(isStructureKind(BARCODE_KINDS.SHIPMENT.id), false);
});
