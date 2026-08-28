/**
 * اختبارات الكود الكامل — الصورة التي أرادها النصّ على الملصق،
 * والمعرّف الذي لا يجوز أن يتغيّر في مفتاح الرصيد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_COMPANY_CODE,
  buildQualifiedCode,
  displayCodeOf,
  qualifierForCode,
  qualifierOf,
  qualifierPrefix,
  resolveLocationScan,
  stripQualifier,
} from './qualifiedCode.js';

const RH = { company: 'BR', branch: 'RH' };
const WAREHOUSES = [
  { code: 'W01', companyCode: 'BR', branchCode: 'RH' },
  { code: 'W02', companyCode: 'BR', branch: 'BEN' },
];

test('★★ الصور التي كتبها النصّ حرفيًّا تُبنى كما هي', () => {
  assert.equal(buildQualifiedCode('W01-Z01-A01-R01-L03-B05', RH), 'BR-RH-W01-Z01-A01-R01-L03-B05');
  assert.equal(buildQualifiedCode('W01-STG-Z01', RH), 'BR-RH-W01-STG-Z01');
  assert.equal(buildQualifiedCode('W01-DOCK-OUT-01', RH), 'BR-RH-W01-DOCK-OUT-01');
  assert.equal(buildQualifiedCode('GATE-OUT-01', RH), 'BR-RH-GATE-OUT-01');
});

test('البادئة لا تُضاف مرّتين — وكودٌ بلا فرعٍ يُؤهَّل بالشركة وحدها', () => {
  assert.equal(buildQualifiedCode('BR-RH-W01-A01', RH), 'BR-RH-W01-A01');
  assert.equal(buildQualifiedCode('W01-A01', { company: 'BR' }), 'BR-W01-A01');
  assert.equal(buildQualifiedCode('', RH), '');
  assert.equal(qualifierPrefix({}), DEFAULT_COMPANY_CODE);
});

test('★★ المسح يقبل الصورتين — والكاملة تعود إلى المعرّف نفسه', () => {
  assert.equal(stripQualifier('BR-RH-W01-A01-R01', RH).code, 'W01-A01-R01');
  assert.equal(stripQualifier('BR-RH-W01-A01-R01', RH).wasQualified, true);

  const plain = stripQualifier('W01-A01-R01', RH);
  assert.equal(plain.code, 'W01-A01-R01', 'والقانونيّة تمرّ كما هي');
  assert.equal(plain.wasQualified, false);
});

test('★★ ملصقُ فرعٍ آخر يُردّ برسالةٍ تسمّي الفرعين — لا «كود غير معروف»', () => {
  const out = stripQualifier('BR-BEN-W01-A01', RH);
  assert.equal(out.problem !== '', true);
  assert.match(out.problem, /فرع «BEN»/);
  assert.match(out.problem, /فرع «RH»/);
  assert.equal(out.code, 'BR-BEN-W01-A01', 'ولا يُقصّ فيُقيَّد على موقعٍ ليس عندنا');
});

test('★ بادئةٌ لا تحمل رمز شركتنا تُترك للمصنّف — فقد تكون كودًا قانونيًّا لا بادئة', () => {
  const out = stripQualifier('MAIN-A01-R01', RH);
  assert.equal(out.wasQualified, false);
  assert.equal(out.problem, '');
  assert.equal(out.code, 'MAIN-A01-R01');
});

test('التطبيع يسبق كلّ شيء — المسافة والحروف الصغيرة والأرقام العربية', () => {
  assert.equal(stripQualifier('  br rh w01 a01 ', RH).code, 'W01-A01');
  assert.equal(buildQualifiedCode('w01-a01', RH), 'BR-RH-W01-A01');
});

test('resolveLocationScan يردّ المعرّف والصورة المعروضة معًا', () => {
  const out = resolveLocationScan('BR-RH-W01-STG-Z01', RH);
  assert.equal(out.code, 'W01-STG-Z01');
  assert.equal(out.qualified, 'BR-RH-W01-STG-Z01');
  assert.equal(out.problem, '');

  const foreign = resolveLocationScan('BR-BEN-W01-A01', RH);
  assert.match(foreign.problem, /فرع/);
  assert.equal(foreign.qualified, 'BR-BEN-W01-A01', 'والمعروض ما مُسح فعلًا — لا يُجمَّل الخطأ');
});

test('السياق يُقرأ من سجلّ المستودع بصورِ الحقل المختلفة', () => {
  assert.deepEqual(qualifierOf({ companyCode: 'BR', branchCode: 'RH' }), RH);
  assert.deepEqual(qualifierOf({ company: 'BR', site: 'BEN' }), { company: 'BR', branch: 'BEN' });
  assert.deepEqual(qualifierOf(null), { company: 'BR', branch: '' }, 'والافتراض يجعل الملصق صحيحًا اليوم');
});

test('★ السياق يُشتقّ من كود الموقع نفسه — مستودعُه هو المقطع الأوّل', () => {
  assert.deepEqual(qualifierForCode('W01-A01', WAREHOUSES), { company: 'BR', branch: 'RH' });
  assert.deepEqual(qualifierForCode('W02-A01', WAREHOUSES), { company: 'BR', branch: 'BEN' });
  assert.equal(displayCodeOf('W02-A01-R01', WAREHOUSES), 'BR-BEN-W02-A01-R01');
  assert.equal(displayCodeOf('W09-A01', WAREHOUSES), 'BR-W09-A01', 'مستودعٌ لا سجلّ له يُؤهَّل بالشركة وحدها');
});
