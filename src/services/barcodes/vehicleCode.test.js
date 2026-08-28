/**
 * اختبارات هويّة المركبة — «إثبات أنّ التحميل تمّ على السيارة الصحيحة،
 * لا اختيارها من قائمة».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VEHICLE_TYPES,
  formatVehicleCode,
  parseVehicleCode,
  suggestVehicleType,
  vehicleBarcodeCard,
  vehicleCodeProblem,
  vehicleCounterKey,
  vehicleMatchVerdict,
  vehicleTypeLabel,
} from './vehicleCode.js';

test('★ الصورة التي كتبها النصّ حرفيًّا', () => {
  assert.equal(formatVehicleCode({ branch: 'RH', vehicleType: 'TRK', seq: 1 }), 'VEH-RH-TRK-001');
  assert.equal(formatVehicleCode({ branch: 'rh', vehicleType: 'van', seq: 42 }), 'VEH-RH-VAN-042');
});

test('★ لا هويّةً عرجاء — ما لا يُبنى سليمًا يُعاد فارغًا', () => {
  assert.equal(formatVehicleCode({ branch: '', vehicleType: 'TRK', seq: 1 }), '');
  assert.equal(formatVehicleCode({ branch: 'RH', vehicleType: 'TR-K', seq: 1 }), '', 'الشرطة تكسر المقطع');
  assert.equal(formatVehicleCode({ branch: 'RH', vehicleType: 'TRK', seq: 0 }), '');
  assert.equal(formatVehicleCode({ branch: 'RH', vehicleType: 'TRK', seq: 1000 }), '');
});

test('الفكّ يعيد الفرع والنوع والتسلسل — وعنوان النوع بالعربية', () => {
  const p = parseVehicleCode('veh-rh-trk-001');
  assert.equal(p.code, 'VEH-RH-TRK-001');
  assert.equal(p.branch, 'RH');
  assert.equal(p.typeLabel, 'شاحنة');
  assert.equal(p.seq, 1);
  assert.equal(parseVehicleCode('W01-A01'), null);
  assert.equal(vehicleTypeLabel('XYZ'), 'XYZ', 'ونوعٌ لا نعرفه يُعرض برمزه لا بفراغ');
  assert.equal(Object.keys(VEHICLE_TYPES).length, 6);
});

test('الحكم يقول الصورة الصحيحة', () => {
  assert.equal(vehicleCodeProblem('VEH-RH-TRK-001'), '');
  assert.match(vehicleCodeProblem(''), /مطلوبة/);
  assert.match(vehicleCodeProblem('VEH-RH-TRK'), /بادئة المركبة/);
  assert.match(vehicleCodeProblem('W01-A01'), /ليس هويّة مركبة/);
});

test('لكلّ فرعٍ ونوعٍ عدّادُه — فلا يفيض ولا يتصادم', () => {
  assert.equal(vehicleCounterKey({ branch: 'RH', vehicleType: 'TRK' }), 'VEH-RH-TRK');
  assert.equal(vehicleCounterKey({ branch: 'RH' }), '');
});

test('★ اقتراح النوع من الوصف الحرّ — اقتراحٌ يصحّحه المدير لا حكمٌ قاطع', () => {
  assert.equal(suggestVehicleType({ vehicleType: 'REF' }), 'REF', 'الحقل الصريح يتقدّم');
  assert.equal(suggestVehicleType({ desc: 'شاحنة مبرَّدة' }), 'REF');
  assert.equal(suggestVehicleType({ desc: 'تريلا نقل' }), 'TRL');
  assert.equal(suggestVehicleType({ model: 'Hilux بيك أب' }), 'PKP');
  assert.equal(suggestVehicleType({}), 'TRK', 'والافتراض شاحنة');
});

test('★★ البطاقة تجمع التسعة من المصادر القائمة — والسائق من الرحلة لا من المركبة', () => {
  const card = vehicleBarcodeCard(
    { id: 'v-1', barcode: 'VEH-RH-TRK-001', plateNo: '12-3456', internalNo: 'TRK-09', status: 'جاهزة' },
    {
      trip: { id: 'TRIP-7', driverName: 'سالم', state: 'enroute' },
      visits: [{ vehicleId: 'v-1', door: 'w01-dock-out-01' }, { vehicleId: 'v-1', door: 'W01-DOCK-OUT-01' }],
      units: [{ code: 'LPN-MAIN-20260827-000001', orderRef: 'SO-9' }],
      parcels: [{ code: 'SHP-RH-20260827-000125-01', orderRef: 'SO-9' }],
    }
  );
  assert.equal(card.valid, true);
  assert.equal(card.internalNo, 'TRK-09');
  assert.equal(card.plateNo, '12-3456');
  assert.equal(card.typeLabel, 'شاحنة');
  assert.equal(card.branch, 'RH');
  assert.equal(card.driverName, 'سالم', 'الهويّة تثبت والسائق يُقرأ من الرحلة');
  assert.equal(card.tripId, 'TRIP-7');
  assert.deepEqual(card.doors, ['W01-DOCK-OUT-01'], 'وتُطبَّع الأبواب فلا يتكرّر بابٌ واحد');
  assert.equal(card.unitCodes.length, 1);
  assert.equal(card.parcelCodes.length, 1);
  assert.deepEqual(card.orderRefs, ['SO-9']);
});

test('البطاقة تعمل لمركبةٍ بلا باركودٍ بعد — تقترح نوعها وتقول إنّها بلا هويّة', () => {
  const card = vehicleBarcodeCard({ id: 'v-2', plateNo: '9-9999', desc: 'فان توزيع', branch: 'ben' });
  assert.equal(card.code, '');
  assert.equal(card.valid, false);
  assert.equal(card.vehicleType, 'VAN');
  assert.equal(card.branch, 'BEN');
  assert.deepEqual(card.doors, []);
});

test('★★ المطابقة تمنع أخطر خطأٍ عند الباب — التحميل على السيارة الخطأ', () => {
  const wrong = vehicleMatchVerdict('VEH-RH-TRK-002', { expectedCode: 'VEH-RH-TRK-001', expectedPlate: '12-3456' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.message, /المطلوبة «VEH-RH-TRK-001»/);
  assert.match(wrong.message, /لوحة 12-3456/, 'واللوحة في الرسالة — العامل يقرؤها على الحديد');

  assert.equal(vehicleMatchVerdict('veh-rh-trk-001', { expectedCode: 'VEH-RH-TRK-001' }).ok, true);
  assert.equal(vehicleMatchVerdict('VEH-RH-TRK-001', {}).ok, true, 'وبلا متوقَّعٍ تُقبل أيّ مركبةٍ صالحة');
  assert.equal(vehicleMatchVerdict('W01-A01', { expectedCode: 'VEH-RH-TRK-001' }).ok, false);
});
