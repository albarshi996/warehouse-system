/**
 * اختبارات نحو كود موقع التخزين — الهويّة التي يقوم عليها مفتاح الرصيد لاحقًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_SEGMENTS,
  formatLocationCode,
  isDescendantOf,
  isValidLocationCode,
  locationCodeProblem,
  normalizeLocationCode,
  parentCodeOf,
  parseLocationCode,
  shortLabelOf,
} from './locationCode.js';

const FULL = 'MAIN-A01-R01-B09-LF-P01';

test('التطبيع: حروفٌ صغيرة وأرقامٌ عربية ومسافاتٌ وفواصلُ متكرّرة تلتقي في صيغةٍ واحدة', () => {
  assert.equal(normalizeLocationCode('main-a01-r01-b09-lf-p01'), FULL);
  assert.equal(normalizeLocationCode('  MAIN-A01-R01-B09-LF-P01  '), FULL);
  assert.equal(normalizeLocationCode('MAIN--A01'), 'MAIN-A01');
  assert.equal(normalizeLocationCode('MAIN A01'), 'MAIN-A01', 'المسافة فاصلٌ لا خطأ — العامل يكتبها');
  assert.equal(normalizeLocationCode('MAIN_A01'), 'MAIN-A01');
  assert.equal(normalizeLocationCode('-MAIN-A01-'), 'MAIN-A01');
  assert.equal(normalizeLocationCode('MAIN-A٠١'), 'MAIN-A01', 'الأرقام العربية-الهندية تُغرَّب فلا يصير الرفّ رفّين');
  assert.equal(normalizeLocationCode(null), '');
});

test('الفكّ: ستّة مقاطع بأسمائها والعمق', () => {
  const p = parseLocationCode(FULL);
  assert.deepEqual(
    { warehouse: p.warehouse, zone: p.zone, rack: p.rack, bay: p.bay, level: p.level, position: p.position },
    { warehouse: 'MAIN', zone: 'A01', rack: 'R01', bay: 'B09', level: 'LF', position: 'P01' }
  );
  assert.equal(p.depth, 6);
  assert.equal(CODE_SEGMENTS.length, 6);
});

test('المقاطع تُختصر من الآخر: منطقةٌ كاملة موقعٌ صالح والغائب فارغٌ لا مصفَّر', () => {
  const p = parseLocationCode('MAIN-A01');
  assert.equal(p.depth, 2);
  assert.equal(p.zone, 'A01');
  assert.equal(p.rack, '', 'الغائب يُحذف ولا يُصفَّر — LOC-O01 معلَّق وهذا سلوكه المعلَن');
  assert.ok(isValidLocationCode('MAIN-A01-R01'));
});

test('مقطعٌ واحد مرفوض — «MAIN» مستودعٌ لا موقع', () => {
  assert.match(locationCodeProblem('MAIN'), /مقطعين على الأقلّ/);
  assert.equal(parseLocationCode('MAIN'), null);
});

test('أكثر من ستّة مقاطع مرفوض', () => {
  assert.match(locationCodeProblem('MAIN-A01-R01-B09-LF-P01-X02'), /لا يتجاوز 6 مقاطع/);
});

test('المحارف: اللاتينيّ الكبير والأرقام فقط — وما يكسر معرّف Firestore مرفوض', () => {
  assert.match(locationCodeProblem('MAIN-A01/R01'), /محرفًا غير مسموح/, '«/» تكسر معرّف المستند');
  assert.match(locationCodeProblem('MAIN-A01.R01'), /محرفًا غير مسموح/, '«.» تكسر معرّف المستند');
  assert.match(locationCodeProblem('MAIN-رف1'), /محرفًا غير مسموح/, 'العربية تُنتج مفتاحين لموقعٍ واحد');
  assert.match(locationCodeProblem('MAIN-A01-VERYLONGSEGMENT'), /أطول من 12/);
});

test('🔒 ★★ التصادم مع الرموز المحجوزة يُرفض — وبسببه الصحيح لا بسببٍ آخر', () => {
  // لو تأخّر هذا الفحص خلف عدد المقاطع لَما أُطلق أبدًا: كلّ رمزٍ محجوز إمّا
  // مقطعٌ واحد أو يحمل «:». فالاختبار يحرس **ترتيب** الفحص لا وجودَه فقط.
  for (const reserved of ['RECEIVING', 'QUARANTINE', 'STAGING', 'TRANSIT', 'SCRAP', 'RETURNS', 'MAINTENANCE', 'ADJUSTMENT']) {
    assert.match(locationCodeProblem(reserved), /رمزٌ محجوز/, `${reserved} موقعُ نظامٍ لا يصلح كود موقع`);
  }
  assert.match(locationCodeProblem('VAN:ABC-123'), /رمزٌ محجوز/, 'بادئة المركبة محجوزة');
  assert.match(locationCodeProblem('CUST:C001'), /رمزٌ محجوز/, 'بادئة العميل محجوزة');
  assert.match(locationCodeProblem('RECEIVING-A01'), /موقعُ نظامٍ محجوز/, 'ولا يصلح موقعُ نظامٍ مستودعًا');
});

test('★★ الحارس لا يمنع ما يجب أن يمرّ: كودٌ عاديّ يشبه المحجوز لا يُرفض', () => {
  assert.equal(locationCodeProblem('MAIN-A01'), '', 'كودٌ سليمٌ يمرّ بلا شكوى');
  assert.ok(isValidLocationCode('WH2-B12-R03'), 'مستودعٌ باسمٍ آخر يمرّ');
  assert.ok(isValidLocationCode('RECEIVING2-A01'), 'اسمٌ يبدأ بحروف موقع نظامٍ وليس هو لا يُرفض');
  assert.ok(isValidLocationCode('VANS-A01'), '«VANS» ليست بادئة المركبة «VAN:»');
});

test('البناء من المقاطع: الغائب يُحذف من الآخر', () => {
  assert.equal(formatLocationCode({ warehouse: 'MAIN', zone: 'A01', rack: 'R01' }), 'MAIN-A01-R01');
  assert.equal(formatLocationCode({ warehouse: 'main', zone: 'a01' }), 'MAIN-A01');
  assert.equal(formatLocationCode({ warehouse: 'MAIN' }), '', 'المستودع وحده ليس موقعًا');
});

test('البناء: فجوةٌ في الوسط تُرفض — الترتيب هو المعنى', () => {
  assert.equal(
    formatLocationCode({ warehouse: 'MAIN', rack: 'R01' }),
    '',
    'رفٌّ بلا منطقة يقفز مستوًى فيكذب على قارئه'
  );
});

test('المختصر الذي يراه العامل: MAIN-A01-R01-B09-LF-P01 ⟵ R01-09-F', () => {
  assert.equal(shortLabelOf(FULL), 'R01-09-F');
  assert.equal(shortLabelOf('MAIN-A01-R01-B09'), 'R01-09');
  assert.equal(shortLabelOf('MAIN-A01'), 'A01', 'بلا رفٍّ تُعرض المنطقة');
  assert.equal(shortLabelOf('MAIN-A01-R01-B9-L2'), 'R01-9-2', 'تُسقط بادئةُ حرفٍ واحدٍ فقط');
});

test('الشجرة من الكود نفسه: الأب والسليل', () => {
  assert.equal(parentCodeOf(FULL), 'MAIN-A01-R01-B09-LF');
  assert.equal(parentCodeOf('MAIN-A01'), '', 'المنطقة جذرٌ في الشجرة');
  assert.ok(isDescendantOf(FULL, 'MAIN-A01'));
  assert.ok(!isDescendantOf('MAIN-A01', FULL));
  assert.ok(!isDescendantOf(FULL, FULL), 'الموقع ليس سليل نفسه');
  assert.ok(!isDescendantOf('MAIN-A011', 'MAIN-A01'), 'المطابقة بالمقطع لا بالبادئة النصّية');
});
