/**
 * اختبارات نحو الباركود الموحّد — المصنّف الذي يقف بين جهاز المسح وكلّ شاشة.
 * كلُّ صورةٍ هنا **مكتوبةٌ في نصّ الطلب حرفيًّا** — فهي عقدٌ لا تمثيل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARCODE_KINDS,
  LOCATION_KINDS,
  SERVICE_KINDS,
  classifyScan,
  expectKind,
  isLocationKind,
  isServiceKind,
  kindLabel,
  normalizeScan,
  serviceKindOf,
} from './barcodeCode.js';

test('التطبيع: مِفتاح السطر من جهاز الباركود يُقصّ — وهو أكثر ما يُفسد المقارنة صامتًا', () => {
  assert.equal(normalizeScan('LPN-MAIN-20260827-000001\r\n'), 'LPN-MAIN-20260827-000001');
  assert.equal(normalizeScan('  w01 stg z01  '), 'W01-STG-Z01', 'المسافة فاصلٌ لا خطأ');
  assert.equal(normalizeScan('W01--DOCK--IN--01'), 'W01-DOCK-IN-01');
  assert.equal(normalizeScan('VEH-RH-TRK-٠٠١'), 'VEH-RH-TRK-001', 'الأرقام العربية تُغرَّب فلا تصير مركبتين');
  assert.equal(normalizeScan(null), '');
});

test('★★ الطبلية: البادئة الصريحة تُصنَّف، و«PLT» مرادفٌ مقبول يُطبَّع إلى LPN', () => {
  const lpn = classifyScan('LPN-MAIN-20260827-000001');
  assert.equal(lpn.kind, BARCODE_KINDS.PALLET.id);
  assert.equal(lpn.parts.warehouse, 'MAIN');
  assert.equal(lpn.parts.seq, 1);

  const alias = classifyScan('PLT-RH-20260827-000001');
  assert.equal(alias.kind, BARCODE_KINDS.PALLET.id, 'النصّ الحاكم كتب المثال بـPLT وسمّاه LPN — فالمرادف يُقبل');
  assert.equal(alias.code, 'LPN-RH-20260827-000001', 'ويُطبَّع إلى الهويّة القانونيّة، فلا هويّتان لطبليةٍ واحدة');
});

test('★ بادئةٌ صحيحة بنحوٍ فاسد تُردّ بلسان نوعها لا بجهلٍ عامّ', () => {
  const bad = classifyScan('LPN-MAIN-2026-1');
  assert.equal(bad.kind, BARCODE_KINDS.UNKNOWN.id);
  assert.match(bad.problem, /بادئة الطبلية/, 'العامل يقرأ ما أخطأ فيه لا كلمة «غير معروف»');
});

test('مواقع الخدمة الأربعة — بالصور التي كتبها النصّ حرفيًّا', () => {
  assert.equal(classifyScan('W01-STG-Z01').kind, BARCODE_KINDS.STAGING.id);
  assert.equal(classifyScan('W01-DOCK-IN-01').kind, BARCODE_KINDS.DOCK_IN.id);
  assert.equal(classifyScan('W01-DOCK-OUT-01').kind, BARCODE_KINDS.DOCK_OUT.id);
  assert.equal(classifyScan('GATE-OUT-01').kind, BARCODE_KINDS.GATE_OUT.id);
});

test('★★ التصنيف بالعلامة لا بالموضع: بوّابةٌ بلا مستودعٍ وبابٌ بمستودعٍ يمرّان معًا', () => {
  // النصّ كتب `BR-RH-W01-DOCK-OUT-01` (بمستودع) و`BR-RH-GATE-OUT-01` (بلا مستودع).
  // فلو صُنّف بالموضع لسقطت الثانية.
  assert.equal(serviceKindOf(['W01', 'DOCK', 'OUT', '01']), BARCODE_KINDS.DOCK_OUT.id);
  assert.equal(serviceKindOf(['GATE', 'OUT', '01']), BARCODE_KINDS.GATE_OUT.id);
  assert.equal(serviceKindOf('RHB-STG-Z02'), BARCODE_KINDS.STAGING.id, 'يقبل النصّ كما يقبل المقاطع');
});

test('★★ بابٌ بلا اتّجاه لا يُصنَّف بابًا — وإلّا حُمِّلت شاحنةٌ في باب استلام', () => {
  assert.equal(serviceKindOf(['W01', 'DOCK', '01']), '', 'DOCK وحدها لا تكفي');
  const scan = classifyScan('W01-DOCK-01');
  assert.equal(scan.kind, BARCODE_KINDS.LOCATION.id, 'يبقى موقعًا عاديًّا — ولا يُدّعى له اتّجاه');
});

test('★ العلامة مقطعٌ كامل لا جزءٌ من مقطع', () => {
  assert.equal(serviceKindOf(['W01', 'STGX', 'Z01']), '', '«STGX» ليست علامة تجهيز');
  assert.equal(serviceKindOf(['W01', 'GATEWAY', '01']), '', 'ولا «GATEWAY» بوّابة');
});

test('المركبة والشحنة والطرد — والطرد يُميَّز عن شحنته باللاحقة', () => {
  const veh = classifyScan('VEH-RH-TRK-001');
  assert.equal(veh.kind, BARCODE_KINDS.VEHICLE.id);
  assert.deepEqual(veh.parts, { branch: 'RH', vehicleType: 'TRK', seq: '001' });

  const shp = classifyScan('SHP-RH-20260827-000125');
  assert.equal(shp.kind, BARCODE_KINDS.SHIPMENT.id);
  assert.equal(shp.parts.parcel, null);

  const parcel = classifyScan('SHP-RH-20260827-000125-01');
  assert.equal(parcel.kind, BARCODE_KINDS.PARCEL.id, 'الطرد نوعٌ مستقلٌّ عن الشحنة — عليه يقع مسح التحميل');
  assert.equal(parcel.parts.parcel, 1);
  assert.equal(parcel.parts.seq, '000125', 'ويحمل رقم شحنته فيُجمع إليها');
});

test('★★ ترتيب التصنيف: نحوُ الموقع الأوسع يأتي آخرًا وإلّا ابتلع مواقع الخدمة', () => {
  // `W01-STG-Z01` كودُ موقعٍ صالحٌ أيضًا. لو سبق نحوُ الموقع لضاع الفرق بين
  // رفٍّ وبابٍ عند التحميل — وهو الفرق الذي أصرّ عليه النصّ.
  assert.equal(classifyScan('W01-STG-Z01').kind, BARCODE_KINDS.STAGING.id);
  assert.equal(classifyScan('W01-Z01-A01-R01-L03-B05').kind, BARCODE_KINDS.LOCATION.id);
});

test('باركود الصنف التجاريّ أرقامٌ فقط — فلا يلتبس بكود موقع', () => {
  assert.equal(classifyScan('6224000123456').kind, BARCODE_KINDS.ITEM.id);
  assert.equal(classifyScan('12345678').kind, BARCODE_KINDS.ITEM.id);
  assert.equal(classifyScan('123').kind, BARCODE_KINDS.UNKNOWN.id, 'ثلاثة أرقامٍ ليست باركودًا تجاريًّا');
});

test('★ المجهول يقول الصورَ المقبولة — لا كلمة «خطأ» تترك العامل واقفًا', () => {
  const out = classifyScan('???');
  assert.equal(out.kind, BARCODE_KINDS.UNKNOWN.id);
  assert.match(out.problem, /الصور المقبولة/);
  assert.match(out.problem, /طبلية/);

  assert.match(classifyScan('').problem, /لا مسحة/);
});

test('expectKind: الحكم يسمّي المطلوب والممسوح معًا', () => {
  const ok = expectKind('W01-DOCK-OUT-01', BARCODE_KINDS.DOCK_OUT.id);
  assert.equal(ok.ok, true);

  const wrong = expectKind('W01-DOCK-IN-01', BARCODE_KINDS.DOCK_OUT.id);
  assert.equal(wrong.ok, false);
  assert.match(wrong.message, /باب تحميل/);
  assert.match(wrong.message, /باب استلام/);

  const many = expectKind('LPN-MAIN-20260827-000001', [BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id]);
  assert.equal(many.ok, true, 'يقبل أكثر من نوعٍ حيث يقبلهما الميدان');
});

test('التصنيفات الجامعة: خمسةُ مواقعَ منها أربعةُ خدمة', () => {
  assert.equal(LOCATION_KINDS.length, 5);
  assert.equal(SERVICE_KINDS.length, 4);
  assert.equal(isLocationKind(BARCODE_KINDS.LOCATION.id), true);
  assert.equal(isServiceKind(BARCODE_KINDS.LOCATION.id), false, 'الرفّ يحمل رصيدًا — فليس موقع خدمة');
  assert.equal(isServiceKind(BARCODE_KINDS.GATE_OUT.id), true);
  assert.equal(kindLabel('PALLET'), 'طبلية');
  assert.equal(kindLabel('لا شيء'), 'غير معروف');
});

test('★★ المستند الرسميّ يُمسح — «مسح باركود الرحلة أو أمر التحميل»', () => {
  const trip = classifyScan('TRIP-2026-0001');
  assert.equal(trip.kind, BARCODE_KINDS.DOCUMENT.id);
  assert.equal(trip.parts.type, 'TRIP');
  assert.equal(trip.parts.year, 2026);
  assert.equal(classifyScan('dn-2026-0044').kind, BARCODE_KINDS.DOCUMENT.id, 'ويُطبَّع كغيره');
  assert.equal(
    classifyScan('W01-DOCK-OUT-01').kind,
    BARCODE_KINDS.DOCK_OUT.id,
    'وعلامةُ الخدمة تسبق المستند — فلا يُقرأ بابٌ مستندًا'
  );
});

test('★ نحو المستند مقروءٌ من محرّك المستندات نفسه لا منسوخًا', () => {
  // الصيغة المعتمدة `GRN-2026-0001`: نوعٌ حروفًا · سنةٌ أربع خانات · تسلسل.
  assert.notEqual(classifyScan('GRN-26-1').kind, BARCODE_KINDS.DOCUMENT.id, 'سنةٌ ناقصةُ الخانات ليست رقمًا رسميًّا');
  assert.notEqual(classifyScan('W01-2026-0001').kind, BARCODE_KINDS.DOCUMENT.id, 'ونوعٌ فيه رقمٌ ليس نوع مستند');
  assert.equal(classifyScan('W01-2026-0001').kind, BARCODE_KINDS.LOCATION.id, 'بل يبقى كودَ موقعٍ صالحًا كما كان');
});
