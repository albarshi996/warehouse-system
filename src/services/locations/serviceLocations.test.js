/**
 * اختبارات مواقع الخدمة — الصور التي كتبها نصّ الطلب، ومنعُ الرصيد المحاسبيّ فيها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SERVICE_INDEX,
  SERVICE_TYPES,
  SERVICE_TYPE_ORDER,
  buildServiceCode,
  buildServiceRange,
  doorFlowOf,
  isServiceLocation,
  serviceCodeProblem,
  serviceLocationCard,
  serviceType,
  serviceTypeOf,
  splitServiceLocations,
  stockPostingProblem,
} from './serviceLocations.js';

test('الأنواع الأربعة بترتيب مشي البضاعة — من باب الاستلام إلى بوّابة الخروج', () => {
  assert.deepEqual(SERVICE_TYPE_ORDER, ['DOCK_IN', 'STAGING', 'DOCK_OUT', 'GATE_OUT']);
  assert.equal(serviceType('staging').labelAr, 'منطقة تجهيز');
  assert.equal(serviceType('لا شيء'), null);
});

test('★★ البناء يُخرج الصور التي كتبها النصّ حرفيًّا', () => {
  assert.equal(buildServiceCode({ warehouse: 'W01', type: 'STAGING', index: 1 }), 'W01-STG-Z01');
  assert.equal(buildServiceCode({ warehouse: 'W01', type: 'DOCK_IN', index: 1 }), 'W01-DOCK-IN-01');
  assert.equal(buildServiceCode({ warehouse: 'W01', type: 'DOCK_OUT', index: 1 }), 'W01-DOCK-OUT-01');
  assert.equal(buildServiceCode({ type: 'GATE_OUT', index: 1 }), 'GATE-OUT-01', 'البوّابة بلا مستودعٍ — نقطةُ مغادرة الموقع كلّه');
});

test('★ البناء يرفض ما لا يصلح بدل أن يُخرج كودًا أعرج', () => {
  assert.equal(buildServiceCode({ type: 'DOCK_IN', index: 1 }), '', 'بابٌ بلا مستودعٍ لا يُبنى');
  assert.equal(buildServiceCode({ warehouse: 'W01', type: 'DOCK_IN', index: 0 }), '');
  assert.equal(buildServiceCode({ warehouse: 'W01', type: 'DOCK_IN', index: MAX_SERVICE_INDEX + 1 }), '');
  assert.equal(buildServiceCode({ warehouse: 'W01', type: 'شيء' }), '');
});

test('★★ النوع مقروءٌ من الكود لا من حقلٍ يُملأ — فلا يفترق الاسمان', () => {
  assert.equal(serviceTypeOf('W01-DOCK-IN-01').id, 'DOCK_IN');
  assert.equal(serviceTypeOf('w01 dock out 03').id, 'DOCK_OUT', 'ويُطبَّع قبل القراءة');
  assert.equal(serviceTypeOf('GATE-OUT-02').id, 'GATE_OUT');
  assert.equal(serviceTypeOf('W01-Z01-A01-R01-L03-B05'), null, 'الرفّ ليس موقع خدمة');
  assert.equal(isServiceLocation('W01-STG-Z01'), true);
  assert.equal(isServiceLocation('W01-A01'), false);
});

test('تدفّق الباب يجسر إلى سجلّ الأبواب القائم', () => {
  assert.equal(doorFlowOf('W01-DOCK-IN-01'), 'inbound');
  assert.equal(doorFlowOf('W01-DOCK-OUT-01'), 'outbound');
  assert.equal(doorFlowOf('GATE-OUT-01'), 'outbound');
  assert.equal(doorFlowOf('W01-STG-Z01'), '', 'منطقة التجهيز ليست بابًا');
  assert.equal(doorFlowOf('W01-A01'), '');
});

test('★ الحكم يقول الصورة الصحيحة — مديرٌ يُنشئ بابًا مرّةً في السنة لا يحفظ النحو', () => {
  assert.equal(serviceCodeProblem('W01-DOCK-OUT-01'), '');
  const notService = serviceCodeProblem('W01-A01');
  assert.match(notService, /ليس موقع خدمة/);
  assert.match(notService, /W01-DOCK-OUT-01/, 'والصورة في الرسالة');
  assert.match(serviceCodeProblem(''), /مطلوب/);
});

test('★ الحكم يفرّق بين بابٍ وباب — وهو الفرق الذي أصرّ عليه النصّ', () => {
  const wrong = serviceCodeProblem('W01-DOCK-IN-01', 'DOCK_OUT');
  assert.match(wrong, /المطلوب باب تحميل/);
  assert.match(wrong, /والممسوح باب استلام/);
  assert.equal(serviceCodeProblem('W01-DOCK-OUT-01', 'DOCK_OUT'), '');
});

test('★★ موقعُ الخدمة لا يحمل رصيدًا محاسبيًّا — وإلّا ازدوج الرصيد', () => {
  const problem = stockPostingProblem('W01-STG-Z01');
  assert.match(problem, /محطّةُ عبورٍ لا تحمل رصيدًا محاسبيًّا/);
  assert.match(problem, /منطقة تجهيز/);
  assert.equal(stockPostingProblem('W01-A01-R01'), '', 'والرفّ يحمل — فلا منع');
});

test('المدى يُولَّد دفعةً وبحاجزٍ ضدّ غلطة الرقم', () => {
  const out = buildServiceRange({ warehouse: 'W01', type: 'DOCK_OUT', from: 1, to: 4 });
  assert.deepEqual(out.codes, ['W01-DOCK-OUT-01', 'W01-DOCK-OUT-02', 'W01-DOCK-OUT-03', 'W01-DOCK-OUT-04']);
  assert.equal(out.problem, '');

  assert.match(buildServiceRange({ warehouse: 'W01', type: 'DOCK_OUT', from: 5, to: 2 }).problem, /المدى يبدأ/);
  assert.match(buildServiceRange({ warehouse: 'W01', type: 'DOCK_OUT', from: 1, to: 500 }).problem, /لا يتجاوز/);
  assert.match(buildServiceRange({ type: 'DOCK_OUT', from: 1, to: 2 }).problem, /راجع المستودع/);
});

test('البطاقة تشتقّ ما تعرضه الشاشة — والفرز يقسم القائمة مرّةً واحدة', () => {
  const card = serviceLocationCard({ code: 'W01-DOCK-OUT-02', nameAr: 'الرصيف الشماليّ', status: 'active' });
  assert.equal(card.typeLabel, 'باب تحميل');
  assert.equal(card.acceptsStock, false);
  assert.equal(card.warehouse, 'W01');
  assert.equal(card.active, true);
  assert.equal(serviceLocationCard({ code: 'W01-A01' }), null);

  const { service, storage } = splitServiceLocations([
    { code: 'W01-STG-Z01' },
    { code: 'W01-A01-R01' },
    { code: 'GATE-OUT-01' },
  ]);
  assert.equal(service.length, 2);
  assert.equal(storage.length, 1);
});

test('كلّ نوعٍ يحمل نوع باركوده — فالمصنّف والمواقع لا يفترقان', () => {
  assert.equal(SERVICE_TYPES.STAGING.kind, 'STAGING');
  assert.equal(SERVICE_TYPES.DOCK_IN.kind, 'DOCK_IN');
  assert.equal(SERVICE_TYPES.DOCK_OUT.kind, 'DOCK_OUT');
  assert.equal(SERVICE_TYPES.GATE_OUT.kind, 'GATE_OUT');
});
