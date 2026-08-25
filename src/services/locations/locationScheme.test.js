/**
 * اختبارات مخطّط ترقيم المستودع — «منطقٌ واحد يتغيّر حسب المستودع».
 *
 * أوّلها يثبت أنّ نمط المالك يتحقّق بالمقاطع الستّة القائمة — فلا يُكسر رصيدٌ
 * ولا مستندٌ سابق من أجل مقطعٍ سابع.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_GENERATED,
  countScheme,
  expandScheme,
  levelValues,
  previewScheme,
  schemeProblems,
  shapeScheme,
  toLocationInputs,
} from './locationScheme.js';
import { isValidLocationCode, parseLocationCode } from './locationCode.js';

const rahba = (over = {}) => ({
  warehouse: 'RHB',
  levels: [
    { key: 'zone', label: 'المنطقة', values: ['PIK'] },
    { key: 'rack', label: 'الممرّ', prefix: 'A', from: 1, to: 3, pad: 2 },
    { key: 'bay', label: 'الرفّ', prefix: 'R', from: 1, to: 2, pad: 2 },
    { key: 'level', label: 'المستوى', prefix: 'L', from: 1, to: 4, pad: 2 },
    { key: 'position', label: 'الصندوق', prefix: 'B', from: 1, to: 7, pad: 2 },
  ],
  ...over,
});

test('★★ نمط المالك يتحقّق بالمقاطع الستّة — RHB-PIK-A03-R02-L04-B07', () => {
  const { codes } = expandScheme(rahba());
  assert.ok(codes.includes('RHB-PIK-A03-R02-L04-B07'), 'الكود المطلوب ليس في المولَّد');
  const parts = parseLocationCode('RHB-PIK-A03-R02-L04-B07');
  assert.equal(parts.warehouse, 'RHB');
  assert.equal(parts.zone, 'PIK');
  assert.equal(parts.rack, 'A03');
  assert.equal(parts.bay, 'R02');
  assert.equal(parts.level, 'L04');
  assert.equal(parts.position, 'B07');
});

test('★ كلّ مولَّدٍ كودُ موقعٍ صالحٌ في النواة — لا يُولَّد ما يُرفض عند الحفظ', () => {
  const { codes, rejected } = expandScheme(rahba());
  assert.equal(rejected.length, 0, JSON.stringify(rejected.slice(0, 3)));
  assert.equal(codes.length, 3 * 2 * 4 * 7);
  for (const c of codes) assert.ok(isValidLocationCode(c), `«${c}» غير صالح`);
});

test('★ العدد يُحسب قبل التوليد — فلا يُفاجأ من ضغط «ولّد»', () => {
  assert.equal(countScheme(rahba()), 168);
  assert.equal(countScheme({ warehouse: '', levels: [] }), 0);
});

test('★★ الرحبةُ بلا غرفٍ ومستودعٌ بغرفة — نفس المنطق ومقاطعُ تزيد', () => {
  // الرحبة: أربعة مستويات مفعّلة.
  const plain = expandScheme(rahba()).codes[0];
  assert.equal(plain.split('-').length, 6);

  // مستودعٌ بغرف: تُشغَل «المنطقة» للغرفة وتُزاح البقيّة — نفس المخطّط بقيمٍ أخرى.
  const withRooms = expandScheme({
    warehouse: 'TRP',
    levels: [
      { key: 'zone', label: 'الغرفة', prefix: 'RM', from: 1, to: 2, pad: 2 },
      { key: 'rack', label: 'الممرّ', prefix: 'A', from: 1, to: 2, pad: 2 },
      { key: 'bay', label: 'الرفّ', prefix: 'R', from: 1, to: 2, pad: 2 },
      { key: 'level', enabled: false },
      { key: 'position', enabled: false },
    ],
  });
  assert.equal(withRooms.rejected.length, 0);
  assert.ok(withRooms.codes.includes('TRP-RM02-A01-R02'));
  assert.equal(withRooms.codes[0].split('-').length, 4, 'المستويات تُعطَّل من الآخر فيقصر الكود');
});

test('★ المستوى المعطَّل في الوسط يُرفض — الترتيب هو المعنى', () => {
  const problems = schemeProblems(rahba({
    levels: [
      { key: 'zone', values: ['PIK'] },
      { key: 'rack', enabled: false },
      { key: 'bay', prefix: 'R', from: 1, to: 2 },
      { key: 'level', enabled: false },
      { key: 'position', enabled: false },
    ],
  }));
  assert.ok(problems.some((p) => /تُعطَّل من الآخر لا من الوسط/.test(p)), problems.join(' · '));
});

test('★ مخطّطٌ ينفجر عددًا يُمنع بسببٍ يقول الصواب', () => {
  const problems = schemeProblems(rahba({
    levels: [
      { key: 'zone', values: ['PIK'] },
      { key: 'rack', prefix: 'A', from: 1, to: 50, pad: 2 },
      { key: 'bay', prefix: 'R', from: 1, to: 50, pad: 2 },
      { key: 'level', prefix: 'L', from: 1, to: 10, pad: 2 },
      { key: 'position', prefix: 'B', from: 1, to: 10, pad: 2 },
    ],
  }));
  assert.ok(problems.some((p) => p.includes(String(MAX_GENERATED))), problems.join(' · '));
});

test('مستوًى بلا قيمٍ يُسمّى باسمه في العطب', () => {
  const problems = schemeProblems(rahba({
    levels: [{ key: 'zone', label: 'المنطقة', values: [] }],
  }));
  assert.ok(problems.some((p) => p.includes('المنطقة')), problems.join(' · '));
});

test('القائمة تتقدّم على المدى حين تُملأ', () => {
  assert.deepEqual(levelValues({ key: 'zone', values: ['PIK', 'BLK'], prefix: 'Z', from: 1, to: 9 }), ['PIK', 'BLK']);
  assert.deepEqual(levelValues({ key: 'zone', prefix: 'Z', from: 1, to: 3, pad: 2 }), ['Z01', 'Z02', 'Z03']);
  assert.deepEqual(levelValues({ key: 'zone', enabled: false, prefix: 'Z', from: 1, to: 3 }), []);
});

test('المعاينة تُظهر أوّل الأكواد وآخرها قبل الاعتماد', () => {
  const p = previewScheme(rahba(), { sample: 3 });
  assert.equal(p.total, 168);
  assert.equal(p.first.length, 3);
  assert.equal(p.last.length, 3);
  assert.notDeepEqual(p.first, p.last);
});

test('التحويل لمدخلات الحفظ يحمل المستودع والحالة', () => {
  const inputs = toLocationInputs(['RHB-PIK-A01'], { warehouse: 'RHB' });
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].code, 'RHB-PIK-A01');
  assert.equal(inputs[0].warehouse, 'RHB');
  assert.equal(inputs[0].active, true);
});

test('shapeScheme يرتّب المستويات بترتيب المقاطع مهما جاءت', () => {
  const s = shapeScheme({ warehouse: 'x', levels: [{ key: 'position' }, { key: 'zone' }] });
  assert.deepEqual(s.levels.map((l) => l.key), ['zone', 'rack', 'bay', 'level', 'position']);
  assert.equal(s.warehouse, 'X', 'كود المستودع يُرفع لحروفٍ كبيرة');
});
