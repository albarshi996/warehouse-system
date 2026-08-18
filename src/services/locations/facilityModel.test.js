/**
 * حارس نوع المنشأة ومناطق المطبخ ‹FNB-106›.
 *
 * أخطر ما يحرسه: **الترحيل صفر الأثر** — مستودعٌ قائم بلا نوعٍ مصرَّح يبقى
 * مستودعًا بسلوك اليوم حرفيًّا؛ و**وحدة الإنتاج لا تفقد شيئًا** ممّا يقدر
 * عليه المستودع بل تزيد؛ والتدفّق **لا يَعِد بمستندٍ لم يُبنَ**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACILITY_TYPES, DEFAULT_FACILITY_TYPE, normalizeFacilityType, facilityTypeOf,
  producesGoods, productionUnits, facilityWarnings,
  KITCHEN_ZONES, kitchenZoneSeed, kitchenZoneGaps,
  KITCHEN_FLOW, flowReadiness,
} from './facilityModel.js';
import { shapeLocation, locationProblems, STORAGE_TYPES } from './locationsModel.js';
import { getSchema } from '../documents/schemas/index.js';

test('★★ الترحيل صفر الأثر: مستودعٌ بلا نوعٍ مصرَّح هو مستودع — سلوك اليوم حرفيًّا', () => {
  assert.equal(facilityTypeOf({ code: 'MAIN' }), DEFAULT_FACILITY_TYPE);
  assert.equal(facilityTypeOf({ code: 'MAIN', facilityType: '' }), 'warehouse');
  assert.equal(facilityTypeOf({ code: 'MAIN', facilityType: 'مجهول' }), 'warehouse');
  assert.equal(producesGoods(facilityTypeOf({ code: 'MAIN' })), false);
});

test('★ وحدة الإنتاج تزيد ولا تنقص: تقدر على كلّ ما يقدر عليه المستودع وتُنتج فوقه', () => {
  const wh = FACILITY_TYPES.warehouse;
  const pu = FACILITY_TYPES.production_unit;
  for (const cap of ['receives', 'stores', 'issues']) {
    assert.equal(pu[cap], wh[cap], `وحدة الإنتاج فقدت «${cap}» — الإنتاج زيادةٌ لا استبدال`);
  }
  assert.equal(wh.produces, false);
  assert.equal(pu.produces, true);
});

test('المرادفات: «مطبخ مركزي» و«central kitchen» تُعرَّف وحدةَ إنتاج — ولا تسقط صامتةً', () => {
  assert.equal(normalizeFacilityType('مطبخ مركزي'), 'production_unit');
  assert.equal(normalizeFacilityType('Central Kitchen'), 'production_unit');
  assert.equal(normalizeFacilityType('مخزن'), 'warehouse');
  assert.equal(normalizeFacilityType('صالة'), ''); // المجهول يُعلَن مجهولًا.
});

test('حارس «مطبخٌ واحد يخدم الشبكة»: واحدةٌ تمرّ صامتة واثنتان تُنبَّهان ولا تُمنعان', () => {
  const one = [{ code: 'MAIN' }, { code: 'CK1', facilityType: 'production_unit' }];
  assert.deepEqual(facilityWarnings(one), []);
  const two = [...one, { code: 'CK2', facilityType: 'مطبخ مركزي' }];
  assert.equal(facilityWarnings(two).length, 1);
  assert.match(facilityWarnings(two)[0], /CK1 · CK2/);
  assert.deepEqual(productionUnits(two).map((u) => u.code), ['CK1', 'CK2']);
});

test('★ المناطق الستّ بذرةُ مواقعٍ تمرّ بسيّد المواقع القائم — لا سيّدَ مناطقَ ثانٍ', () => {
  assert.equal(KITCHEN_ZONES.length, 6);
  const seed = kitchenZoneSeed('CK1');
  assert.equal(seed.length, 6);
  // كلّ منطقةٍ كودٌ صالح يجتاز حارس سيّد المواقع نفسه.
  for (const row of seed) {
    const shaped = shapeLocation(row);
    assert.deepEqual(locationProblems(shaped), [], `المنطقة ${row.code} لم تجتز سيّد المواقع`);
    assert.equal(shaped.warehouse, 'CK1');
  }
  assert.deepEqual(seed.map((s) => s.code).sort(), [
    'CK1-CLD', 'CK1-DRY', 'CK1-DSP', 'CK1-FRZ', 'CK1-PCK', 'CK1-STG',
  ]);
  // وأنواع التخزين من السجلّ القائم لا مخترَعة.
  for (const z of KITCHEN_ZONES) assert.ok(STORAGE_TYPES[z.storageType], `نوع تخزينٍ مخترَع: ${z.storageType}`);
  // الثلاث الحراريّة موجودة: تجميدٌ وتبريدٌ وجافّ.
  assert.deepEqual(
    KITCHEN_ZONES.filter((z) => !z.flow).map((z) => z.storageType),
    ['frozen', 'chilled', 'ambient']
  );
});

test('نقص المناطق يُنبَّه ولا يمنع — منشأةٌ تُجهَّز على مراحل لا تتوقّف', () => {
  assert.deepEqual(kitchenZoneGaps('CK1', kitchenZoneSeed('CK1').map(shapeLocation)), []);
  // بلا تجميدٍ ولا تبريد: يُسمَّى الناقص بعينه.
  const partial = [shapeLocation({ code: 'CK1-DRY', storageType: 'ambient' })];
  const gaps = kitchenZoneGaps('CK1', partial);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /مجمَّد/);
  assert.match(gaps[0], /مبرَّد/);
});

test('★ التدفّق الستّ لا يَعِد بمستندٍ لم يُبنَ — والمعلَّق يسمّي مهمّته', () => {
  assert.deepEqual(KITCHEN_FLOW.map((s) => s.id), [
    'receiving', 'storage', 'production', 'packaging', 'dispatch', 'delivery',
  ]);
  // كلّ نوعٍ مذكورٍ في مرحلةٍ جاهزة **موجودٌ فعلًا** في محرّك المستندات.
  for (const stage of KITCHEN_FLOW) {
    for (const type of stage.docTypes) {
      assert.ok(getSchema(type), `المرحلة «${stage.id}» تَعِد بمستند «${type}» غير مبنيّ`);
    }
  }
  const { ready, pending } = flowReadiness();
  assert.ok(ready.includes('receiving') && ready.includes('dispatch'));
  assert.deepEqual(pending, [
    { stage: 'production', task: 'FNB-502' },
    { stage: 'packaging', task: 'FNB-502' },
  ]);
});
