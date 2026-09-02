/**
 * اختبارات تكويد المواقع.
 *
 * جوهرُها ثلاثة: **الخطواتُ تُشتقّ من مخطّط المستودع لا تُكتب بيد** ·
 * **والهويّةُ تبقى الكودَ القانونيّ والباركودُ حقلٌ عليه** ·
 * **والتالي يُقترح فيمشي الموظّف بالتتابع**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ADDRESS_KEYS,
  addressComplete,
  addressLabel,
  alreadyBound,
  bindingProblems,
  codeFromAddress,
  codingProgress,
  codingSteps,
  currentStep,
  findByBarcode,
  nextAddress,
  normalizeBinBarcode,
  suggestAddress,
} from './binCoding.js';

/** مستودعٌ صغيرٌ ليُقرأ الاختبار: ممرّان · جهتان · مستويان · ثلاثُ خانات. */
const SMALL = {
  code: 'WH001',
  name: 'الرحبة',
  binPrefix: 'RH',
  segmentLabels: { zone: 'الممرّ', rack: 'الجهة', bay: 'المستوى', level: 'الخانة' },
  valueLabels: { rack: { L: 'يسار', R: 'يمين' } },
  scheme: {
    warehouse: 'RH',
    levels: [
      { key: 'zone', enabled: true, values: ['A', 'B'] },
      { key: 'rack', enabled: true, values: ['L', 'R'] },
      { key: 'bay', enabled: true, from: 1, to: 2, pad: 2 },
      { key: 'level', enabled: true, from: 1, to: 3, pad: 2 },
      { key: 'position', enabled: false },
    ],
  },
};

const STEPS = codingSteps(SMALL);
const A = { zone: 'A', rack: 'R', bay: '01', level: '01' };

test('★★★ الخطواتُ تُشتقّ من مخطّط المستودع — ولا تُكتب خياراتٌ بيد', () => {
  assert.equal(STEPS.length, 4, 'أربعُ خطواتٍ — والمعطَّلُ يقف بالسلسلة');
  assert.deepEqual(STEPS.map((s) => s.key), ['zone', 'rack', 'bay', 'level']);
  assert.deepEqual(STEPS.map((s) => s.label), ['الممرّ', 'الجهة', 'المستوى', 'الخانة']);
  assert.deepEqual(STEPS[0].options.map((o) => o.value), ['A', 'B']);
  assert.deepEqual(STEPS[1].options.map((o) => o.text), ['يسار', 'يمين'], 'والحرفُ يُنطق للعامل');
  assert.deepEqual(STEPS[2].options.map((o) => o.value), ['01', '02']);
  assert.equal(STEPS[3].options.length, 3);
  assert.deepEqual(ADDRESS_KEYS.slice(0, 4), ['zone', 'rack', 'bay', 'level']);
});

test('مستودعٌ بلا مخطّطٍ لا خطواتٍ له — ولا تُخترع', () => {
  assert.deepEqual(codingSteps({ code: 'WH009', binPrefix: 'ZZ' }), []);
  assert.deepEqual(codingSteps(null), []);
});

test('★★★ الكودُ القانونيُّ يُبنى من البادئة والعنوان — والهويّةُ هو لا الباركود', () => {
  assert.equal(codeFromAddress('RH', A, STEPS), 'RH-A-R-01-01');
  assert.equal(codeFromAddress('rh', { zone: 'b', rack: 'l', bay: '02', level: '03' }, STEPS), 'RH-B-L-02-03');
  assert.equal(codeFromAddress('RH', { zone: 'A', rack: 'R' }, STEPS), 'RH-A-R', 'وناقصٌ يقف حيث وقف');
  assert.equal(codeFromAddress('', A, STEPS), '', 'وبلا بادئةٍ لا كود');
  assert.equal(codeFromAddress('RH', { rack: 'R', bay: '01' }, STEPS), 'RH', 'وفجوةٌ في الوسط تقف');
});

test('الويزارد يعرف أين يقف', () => {
  assert.equal(currentStep({}, STEPS), 0);
  assert.equal(currentStep({ zone: 'A' }, STEPS), 1);
  assert.equal(currentStep({ zone: 'A', rack: 'R', bay: '01' }, STEPS), 3);
  assert.equal(currentStep(A, STEPS), -1, 'واكتمل');
  assert.equal(addressComplete(A, STEPS), true);
  assert.equal(addressComplete({ zone: 'A' }, STEPS), false);
  assert.equal(addressComplete(A, []), false, 'ولا اكتمالَ بلا خطوات');
});

test('★★ وصفُ العنوان بالعربيّة — «الممرّ A · الجهة يمين · المستوى 01 · الخانة 01»', () => {
  assert.equal(addressLabel(A, STEPS), 'الممرّ A · الجهة يمين · المستوى 01 · الخانة 01');
  assert.equal(addressLabel({ zone: 'A', rack: 'L' }, STEPS), 'الممرّ A · الجهة يسار');
  assert.equal(addressLabel({}, STEPS), '');
});

test('★★★ الاقتراحُ من الملصق الناطق — ولا يُفترض بلا تأكيد', () => {
  const s = suggestAddress('RH-A-R-01-01', { binPrefix: 'RH', steps: STEPS });
  assert.deepEqual(s.address, A);
  assert.equal(s.source, 'barcode', 'وتقول الشاشةُ من أين جاء');

  // باركودٌ أصمُّ ⟶ يبدأ الويزاردُ من أوّله.
  assert.deepEqual(suggestAddress('8059692043057', { binPrefix: 'RH', steps: STEPS }).address, {});
  assert.equal(suggestAddress('8059692043057', { binPrefix: 'RH', steps: STEPS }).source, '');

  // ملصقُ مستودعٍ آخر لا يُقترح.
  assert.deepEqual(suggestAddress('TR-A-R-01-01', { binPrefix: 'RH', steps: STEPS }).address, {});

  // ★ ولا يُقترح مقطعٌ ليس من خيارات المستودع — «الممرّ Z» ليس في A/B.
  assert.deepEqual(suggestAddress('RH-Z-R-01-01', { binPrefix: 'RH', steps: STEPS }).address, {});
  // ويُقترح ما صحّ ويقف عند أوّل ما لا يصحّ.
  assert.deepEqual(suggestAddress('RH-A-R-09-01', { binPrefix: 'RH', steps: STEPS }).address, { zone: 'A', rack: 'R' });
});

const LOCS = [
  { code: 'RH-A-R-01-01', barcode: '8059692043057' },
  { code: 'RH-A-R-01-02', barcode: '' },
  { code: 'RH-A-L-01-01', barcode: '6281006521' },
];

test('★★ البحثُ العكسيّ: الباركودُ يدلّ على موقعه — والكودُ نفسُه يُقبل', () => {
  assert.equal(findByBarcode(LOCS, '8059692043057')?.code, 'RH-A-R-01-01');
  assert.equal(findByBarcode(LOCS, ' 8059692043057 ')?.code, 'RH-A-R-01-01', 'ويُطبَّع');
  assert.equal(findByBarcode(LOCS, 'RH-A-R-01-02')?.code, 'RH-A-R-01-02', 'والملصقُ الناطقُ يعمل بلا ربط');
  assert.equal(findByBarcode(LOCS, 'لا وجود له'), null);
  assert.equal(normalizeBinBarcode(' rh-a '), 'RH-A');
});

test('★★★ ثلاثةُ تصادماتٍ تُمنع — وكلُّها تقع في المخزن حقيقةً', () => {
  // سليم.
  assert.deepEqual(bindingProblems({ barcode: '999', code: 'RH-A-R-01-02', locations: LOCS }), []);

  // ملصقٌ نُزع ولُصق في مكانٍ ثانٍ.
  assert.match(
    bindingProblems({ barcode: '8059692043057', code: 'RH-A-R-01-02', locations: LOCS })[0],
    /مربوطٌ سلفًا بـ«RH-A-R-01-01»/
  );

  // رفٌّ واحدٌ بملصقين.
  assert.match(
    bindingProblems({ barcode: '777', code: 'RH-A-R-01-01', locations: LOCS })[0],
    /مربوطٌ سلفًا بباركودٍ آخر/
  );

  // عنوانٌ لم يُولَّد بعد.
  assert.match(
    bindingProblems({ barcode: '777', code: 'RH-Z-R-05-10', locations: LOCS })[0],
    /غير معرَّفٍ في سيّد المواقع/
  );

  assert.match(bindingProblems({ barcode: '', code: 'RH-A-R-01-02', locations: LOCS })[0], /لا باركودَ ليُربط/);
  assert.match(bindingProblems({ barcode: '999', code: '', locations: LOCS })[0], /غير مكتمل/);
});

test('★★ والربطُ ثانيةً بالباركود نفسِه بلا أثرٍ ولا رسالةِ عطب', () => {
  assert.equal(alreadyBound({ barcode: '8059692043057', code: 'RH-A-R-01-01', locations: LOCS }), true);
  assert.equal(alreadyBound({ barcode: '999', code: 'RH-A-R-01-01', locations: LOCS }), false);
  assert.deepEqual(bindingProblems({ barcode: '8059692043057', code: 'RH-A-R-01-01', locations: LOCS }), []);
});

test('★★★ التالي يُقترح فيمشي الموظّفُ بالتتابع — والحملُ يصعد', () => {
  assert.deepEqual(nextAddress(A, STEPS), { zone: 'A', rack: 'R', bay: '01', level: '02' });
  // آخرُ خانةٍ في المستوى ⟶ المستوى التالي.
  assert.deepEqual(nextAddress({ zone: 'A', rack: 'R', bay: '01', level: '03' }, STEPS), { zone: 'A', rack: 'R', bay: '02', level: '01' });
  // آخرُ مستوًى في الجهة ⟶ الجهةُ الأخرى.
  assert.deepEqual(nextAddress({ zone: 'A', rack: 'L', bay: '02', level: '03' }, STEPS), { zone: 'A', rack: 'R', bay: '01', level: '01' });
  // آخرُ جهةٍ في الممرّ ⟶ الممرّ التالي.
  assert.deepEqual(nextAddress({ zone: 'A', rack: 'R', bay: '02', level: '03' }, STEPS), { zone: 'B', rack: 'L', bay: '01', level: '01' });
  // ★ وآخرُ خانةٍ في المستودع تقف ولا تلتفّ صامتةً إلى الأوّل.
  assert.equal(nextAddress({ zone: 'B', rack: 'R', bay: '02', level: '03' }, STEPS), null);
  assert.equal(nextAddress({ zone: 'A' }, STEPS), null, 'وناقصٌ لا تاليَ له');
});

test('★★ تقدّمُ التكويد: كم كُوِّد من كم', () => {
  assert.deepEqual(codingProgress(LOCS, 'RH'), { total: 3, bound: 2, remaining: 1 });
  assert.deepEqual(codingProgress(LOCS, 'TR'), { total: 0, bound: 0, remaining: 0 });
  assert.deepEqual(codingProgress([], 'RH'), { total: 0, bound: 0, remaining: 0 });
});

test('★★★ التوليدُ لا يمسح الربط — وهذا مزلقُ الدمج الصامت', () => {
  // `saveLocationsBulk` يكتب بـ`merge:true` من `shapeLocation`. فلو عرف
  // النموذجُ حقلَ الباركود لَكتبه فارغًا مع كلّ توليد — فتمسح ضغطةُ «ولّد
  // الناقص» ربطَ ثلاثةِ آلافِ ملصقٍ بلا صوت. فالحارسُ يقرأ النموذج نفسَه.
  const model = readFileSync(new URL('./locationsModel.js', import.meta.url), 'utf8');
  const shape = model.slice(model.indexOf('export function shapeLocation'), model.indexOf('/** الحقول الستّة'));
  assert.ok(shape.length > 200, 'قُرئت الدالّة');
  assert.ok(!shape.includes('barcode'), 'shapeLocation لا يعرف الباركود — والربطُ يُكتب وحدَه');

  const service = readFileSync(new URL('./locationsService.js', import.meta.url), 'utf8');
  assert.ok(service.includes('export async function bindLocationBarcode'), 'وله كاتبٌ مستقلّ');
  const bind = service.slice(service.indexOf('export async function bindLocationBarcode'));
  assert.ok(bind.includes('updateDoc('), 'يُحدّث الحقولَ الثلاثةَ وحدَها');
  assert.ok(!bind.includes('shapeLocation('), 'ولا يمرّ بالنموذج');
});
