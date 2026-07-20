/**
 * اختبارات منطق جرد المركبات الخالص:
 *   - الملخّص يعدّ البنود المعنيّة فقط (إصلاح عدّ «الداخلي» مرتين وبنود النقل المخفية).
 *   - معرّف المركبة حتميّ ونظيف من محارف Firestore الممنوعة.
 *   - رحلة كاملة تصدير→استيراد بلا فقد (بما فيها الملحقات التي كانت تسقط).
 *   - قراءة ملفات الأداة القديمة (أسماء أوراق وتسميات وبنية مختلفة قليلًا).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_ITEMS,
  TRANS_ITEMS,
  emptyInspection,
  relevantItems,
  summarize,
  vehicleIdFor,
  vehicleHeadFrom,
} from './inspectionModel.js';
import { inspectionToSheets, sheetsToInspection, normalizeLabel } from './inspectionExcel.js';

function fullInspection(category = 'سيارة إدارية') {
  const insp = emptyInspection();
  insp.info = {
    category,
    formNo: 'VINSP-2026-0007',
    inspDate: '2026-07-20',
    inspTime: '10:30',
    department: 'الحركة',
    plateNo: '8-648323',
    brand: 'تويوتا',
    model: 'فورتي',
    year: '2021',
    color: 'أبيض',
    vin: '0350923',
    engineNo: 'ENG-1',
    fuelType: 'بنزين',
    odometer: '76800',
    lastService: '2026-05-20',
    lastServiceKm: '70000',
    licExpiry: '2026-11-09',
    receivedFrom: 'أحمد مفتاح القبايلي',
    insNo: 'INS-9',
    insExpiry: '2026-11-10',
    payload: '3.5',
  };
  for (const it of relevantItems(category)) insp.items[it.id] = { status: 'سليم' };
  insp.items.m1 = { status: 'يحتاج متابعة', notes: 'الزيت داكن' };
  insp.tires.fl = { size: '225/75R16', depth: '6', pressure: '35', cond: 'جيد' };
  insp.safety = { spareTire: 'موجود وجيد', triangle: 'موجود', fireExt: 'موجودة وصالحة' };
  insp.accessories = {
    ownerManual: 'موجود',
    partsCatalog: 'غير موجود',
    regCard: 'موجودة وسارية',
    insDoc: 'موجودة وسارية',
    extraKeys: '1',
    jackCard: 'موجود',
    tireWrench: 'موجود',
    gps: 'موجود وفعال',
  };
  insp.overallStatus = 'مقبولة - جاهزة للتشغيل';
  insp.generalNotes = 'لا شيء يُذكر';
  insp.signatures = { mechanic: 'م. الفاحص', receiver: 'المستلم فلان', supervisor: 'المشرف علان' };
  return insp;
}

test('الملخّص: السيارة الإدارية لا تُحاسَب على بنود النقل وتبلغ 100%', () => {
  const insp = fullInspection('سيارة إدارية');
  const s = summarize(insp);
  assert.equal(s.total, ALL_ITEMS.length - TRANS_ITEMS.length);
  assert.equal(s.done, s.total);
  assert.equal(s.pct, 100);
  assert.equal(s.warn, 1);
  assert.equal(s.ok, s.total - 1);
});

test('الملخّص: مركبة النقل تشمل بنود النقل', () => {
  const insp = fullInspection('مركبة نقل');
  const s = summarize(insp);
  assert.equal(s.total, ALL_ITEMS.length);
  assert.equal(s.pct, 100);
});

test('معرّف المركبة: من اللوحة منظّفًا، ثم من الهيكل عند غيابها', () => {
  assert.equal(vehicleIdFor({ info: { plateNo: ' 5 / 123 456 ' } }), 'veh-5-123-456');
  assert.equal(vehicleIdFor({ info: { plateNo: '', vin: 'VIN#77' } }), 'veh-VIN-77');
  assert.equal(vehicleIdFor({ info: {} }), '');
});

test('بطاقة المركبة تستخلص آخر فحص وملخّصه', () => {
  const head = vehicleHeadFrom(fullInspection());
  assert.equal(head.plateNo, '8-648323');
  assert.equal(head.lastInspection.number, 'VINSP-2026-0007');
  assert.equal(head.lastInspection.overallStatus, 'مقبولة - جاهزة للتشغيل');
  assert.equal(head.lastInspection.pct, 100);
});

test('رحلة كاملة: تصدير ثم استيراد بلا فقدان — الملحقات ضمنًا', () => {
  const original = fullInspection('مركبة نقل');
  const sheets = inspectionToSheets(original);
  const restored = sheetsToInspection(sheets);

  assert.deepEqual(restored.info, original.info);
  assert.deepEqual(restored.accessories, original.accessories);
  assert.deepEqual(restored.safety, original.safety);
  assert.deepEqual(restored.tires, original.tires);
  assert.equal(restored.overallStatus, original.overallStatus);
  assert.equal(restored.generalNotes, original.generalNotes);
  assert.deepEqual(restored.signatures, original.signatures);
  for (const it of ALL_ITEMS) {
    assert.equal(restored.items[it.id]?.status, original.items[it.id]?.status, it.label);
  }
  assert.equal(restored.items.m1.notes, 'الزيت داكن');
});

test('تطبيع البنود يطابق «آلية العادم» مع «نظام العادم»', () => {
  assert.equal(
    normalizeLabel('آلية العادم والشكمان - تسريب أو صوت'),
    normalizeLabel('نظام العادم والشكمان - تسريب أو صوت')
  );
});

test('قراءة ملف الأداة القديمة: أوراق وتسميات النسخة المؤرشفة', () => {
  const legacy = {
    info: [
      ['نموذج فحص المركبات المستلمة', '', '', ''],
      ['', '', '', ''],
      ['رقم النموذج', 'Y2026-6-1-2', 'نوع المركبة', 'سيارة إدارية'],
      ['تاريخ الفحص', '2026-06-01', 'وقت الفحص', '11:29'],
      ['الجهة / القسم', 'ركن المال', '', ''],
      ['--- بيانات المركبة ---', '', '', ''],
      ['رقم اللوحة', '8-648323', 'الماركة', 'تويوتا'],
      ['الموديل', 'فورتي', 'سنة الصنع', '2021'],
      ['اللون', 'ابيض', 'نوع الوقود', 'بنزين'],
      ['رقم الهيكل (VIN)', '0350923', 'رقم المحرك', ''],
      ['العداد الحالي (كم)', '76800', 'آخر صيانة عند (كم)', ''],
      ['تاريخ آخر صيانة', '2026-05-20', 'انتهاء الرخصة', '2026-11-09'],
      ['المستلم من', 'احمد مفتاح القبايلي', 'رقم وثيقة التأمين', ''],
      ['انتهاء التأمين', '2026-11-10', 'الحمولة (طن)', ''],
      ['الحكم على المركبة', 'مقبولة - جاهزة للتشغيل', '', ''],
      ['الفاحص الميكانيكي', '', 'المستلم', 'موقّع الاستلام'],
      ['المشرف / المسؤول', '', '', ''],
    ],
    results: [
      ['القسم', 'بند الفحص', 'الحالة', 'الملاحظات'],
      ['الفحص الخارجي', 'الهيكل العام - وجود صدمات أو تشويه', 'سليم', ''],
      ['الفحص الميكانيكي', 'آلية العادم والشكمان - تسريب أو صوت', 'يحتاج متابعة', 'صوت خفيف'],
    ],
    tires: [
      ['الإطار', 'المقاس', 'العمق (ملم)', 'الضغط (PSI)', 'الحالة'],
      ['الأمامي الأيمن 🔵', '225/75R16', '', '', 'جيد'],
      ['الإطار الاحتياطي', 'موجود وجيد', '', '', ''],
    ],
    summary: [
      ['ملخص نتائج الفحص', '', ''],
      ['الحكم العام', 'مقبولة - جاهزة للتشغيل', ''],
    ],
  };

  const insp = sheetsToInspection(legacy);
  assert.equal(insp.info.formNo, 'Y2026-6-1-2');
  assert.equal(insp.info.category, 'سيارة إدارية');
  assert.equal(insp.info.plateNo, '8-648323');
  assert.equal(insp.info.odometer, '76800');
  assert.equal(insp.info.receivedFrom, 'احمد مفتاح القبايلي');
  assert.equal(insp.signatures.receiver, 'موقّع الاستلام');
  assert.equal(insp.items.ext1.status, 'سليم');
  assert.equal(insp.items.m12.status, 'يحتاج متابعة');
  assert.equal(insp.items.m12.notes, 'صوت خفيف');
  assert.deepEqual(insp.tires.fl, { size: '225/75R16', cond: 'جيد' });
  assert.equal(insp.safety.spareTire, 'موجود وجيد');
  assert.equal(insp.overallStatus, 'مقبولة - جاهزة للتشغيل');
});
