/**
 * اختبارات الأصناف المعلّقة (I-د).
 *
 * تتحقّق من: المعرّف حتميّ فلا يتكرّر السجلّ مهما مُسح الباركود · تكرار
 * المشاهدة لا يمحو أثر المشاهدة الأولى · لا يدخل الماستر صنفٌ بلا كود واسم
 * عربي · الرفض بلا سبب مرفوض · والمبتوت لا يُعاد البتّ فيه.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PENDING_STATES,
  pendingId,
  newSighting,
  repeatPatch,
  canDecide,
  approvalVerdict,
  toMasterItem,
  rejectionVerdict,
  pendingSummary,
} from './pendingModel.js';

test('المعرّف حتميّ ومطبَّع — الأصفار البادئة لا تُنشئ سجلًّا ثانيًا', () => {
  assert.equal(pendingId('00251'), pendingId('251'), 'التطبيع يوحّد الصيغتين');
  assert.equal(pendingId('  8059692041626 '), '8059692041626');
  // غير الرقمي يُصغَّر (سلوك `normalizeBarcode` عبر النظام كله) فيطابق
  // `IP34927` و`ip34927` سجلًّا واحدًا — وهو المقصود.
  assert.equal(pendingId('IP34927'), pendingId('ip34927'));
  assert.equal(pendingId('IP34927'), 'ip34927');
  assert.equal(pendingId(''), '');
});

test('مشاهدة أولى: سجلّ كامل بحالة «بانتظار المراجعة»', () => {
  const s = newSighting(
    { barcode: '00777', name: 'صنف مجهول', operationType: 'جرد', qty: 3 },
    { uid: 'u1', name: 'أمين المخزن' }
  );
  assert.equal(s.barcode, '777');
  assert.equal(s.rawBarcode, '00777', 'الصيغة الخام تبقى للتدقيق');
  assert.equal(s.state, 'pending');
  assert.equal(s.seenCount, 1);
  assert.equal(s.lastQty, 3);
  assert.equal(s.firstSeenByName, 'أمين المخزن');
});

test('لا يُسجَّل معلّق بلا باركود', () => {
  assert.throws(() => newSighting({ barcode: '' }), /لا باركود/);
  assert.throws(() => newSighting({}), /لا باركود/);
});

test('تكرار المشاهدة لا يمسّ أثر المشاهدة الأولى', () => {
  const patch = repeatPatch({ barcode: '777', name: 'اسم حقيقي', qty: 9 }, { name: 'موظّف آخر' });
  assert.equal(patch.lastQty, 9);
  assert.equal(patch.lastSeenByName, 'موظّف آخر');
  assert.equal(patch.name, 'اسم حقيقي');
  assert.ok(!('firstSeenByName' in patch), 'من رآه أولًا لا يُدهس');
  assert.ok(!('seenCount' in patch), 'العدّاد يزيد بالخادم لا بقيمة محسوبة محليًّا');
});

test('اسمٌ هو الباركود نفسه لا يُحدِّث الاسم', () => {
  const patch = repeatPatch({ barcode: '00777', name: '777', qty: 1 }, {});
  assert.ok(!('name' in patch), 'الاسم الوهمي (= الباركود) لا يُكتب');
});

test('الاعتماد يرفض صنفًا بلا كود أو بلا اسم عربي', () => {
  const rec = newSighting({ barcode: '777' }, {});
  assert.equal(approvalVerdict(rec, { sku: '', nameAr: 'اسم' }).ok, false);
  assert.match(approvalVerdict(rec, { sku: '', nameAr: 'اسم' }).problems[0], /كود الصنف/);
  assert.equal(approvalVerdict(rec, { sku: 'A1', nameAr: '' }).ok, false);
  assert.match(approvalVerdict(rec, { sku: 'A1', nameAr: '' }).problems[0], /الاسم العربي/);
  assert.equal(approvalVerdict(rec, { sku: 'A1', nameAr: 'صنف' }).ok, true);
});

test('المبتوت فيه لا يُعاد البتّ فيه', () => {
  const rec = { ...newSighting({ barcode: '777' }, {}), state: 'approved' };
  assert.equal(canDecide(rec), false);
  assert.match(approvalVerdict(rec, { sku: 'A1', nameAr: 'صنف' }).problems[0], /بُتّ فيه/);
  assert.match(rejectionVerdict(rec, 'سبب').problems[0], /بُتّ فيه/);
});

test('الرفض بلا سبب مرفوض', () => {
  const rec = newSighting({ barcode: '777' }, {});
  assert.equal(rejectionVerdict(rec, '').ok, false);
  assert.match(rejectionVerdict(rec, '   ').problems[0], /سبب الرفض/);
  assert.equal(rejectionVerdict(rec, 'باركود مورّد لا يخصّنا').ok, true);
});

test('التحويل للماستر يضمّ الباركود المعلّق إلى فهرس الاستدعاء', () => {
  const rec = newSighting({ barcode: '00251' }, {});
  const item = toMasterItem(rec, {
    sku: 'a1', nameAr: '  صنف أول  ', nameEn: 'Item', category: 'عطور', unitPrice: '12.5',
    barcodes: ['0000999'],
  });
  assert.equal(item.sku, 'A1', 'الكود يُرفع لحروف كبيرة');
  assert.equal(item.nameAr, 'صنف أول');
  assert.equal(item.unitPrice, 12.5);
  assert.deepEqual(item.barcodes.sort(), ['251', '999'], 'الباركود المعلّق داخل الفهرس ومطبَّع');
  assert.equal(item.unit, 'piece', 'الوحدة الافتراضية');
});

test('الملخّص يرتّب الأكثر تكرارًا أولًا', () => {
  const recs = [
    { state: 'pending', seenCount: 2, barcode: 'a' },
    { state: 'pending', seenCount: 11, barcode: 'b' },
    { state: 'approved', seenCount: 99, barcode: 'c' },
    { state: 'rejected', seenCount: 1, barcode: 'd' },
  ];
  const s = pendingSummary(recs);
  assert.deepEqual([s.total, s.pending, s.approved, s.rejected], [4, 2, 1, 1]);
  assert.deepEqual(s.hottest.map((r) => r.barcode), ['b', 'a'], 'المبتوت فيه خارج القائمة الساخنة');
});

test('حالات السجلّ الثلاث معرَّفة بتسمياتها', () => {
  assert.deepEqual(Object.keys(PENDING_STATES), ['pending', 'approved', 'rejected']);
  for (const s of Object.values(PENDING_STATES)) {
    assert.ok(s.label && s.emoji && s.color);
  }
});
