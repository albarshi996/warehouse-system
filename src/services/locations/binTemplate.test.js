/**
 * اختبارات قوالب الترقيم.
 *
 * جوهرُها اثنان: **القالبُ بياناتٌ تُحلّ إلى المخطّط القائم** (فلا مولّدَ ثانٍ)،
 * و**التوليدُ إضافيٌّ لا استبداليّ** — يحسب الناقصَ ولا يمسّ القائم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LETTERS,
  countForTemplate,
  approvedNumbering,
  driftedWarehouses,
  generationPlan,
  numberingDrift,
  letterValues,
  numberingOf,
  paramDefaults,
  resolveLevels,
  schemeFromTemplate,
  templateById,
  templateProblems,
  warehousePlan,
} from './binTemplate.js';
import { expandScheme } from './locationScheme.js';

/** قالبُ ملصقات المالك — ممرٌّ · جهة · رفّ · خانة. */
const DOUBLE = {
  id: 'double-sided-racks',
  nameAr: 'رفوفٌ مزدوجةُ الجهة',
  params: [
    { key: 'aisles', labelAr: 'عدد الممرّات', min: 1, max: 26, default: 10 },
    { key: 'racks', labelAr: 'عدد الرفوف في الجهة', min: 1, max: 99, default: 5 },
    { key: 'bins', labelAr: 'عدد الخانات في الرفّ', min: 1, max: 99, default: 10 },
  ],
  levels: [
    { key: 'zone', kind: 'letters', count: 'aisles' },
    { key: 'rack', kind: 'list', values: ['L', 'R'] },
    { key: 'bay', kind: 'range', from: 1, to: 'racks', pad: 2 },
    { key: 'level', kind: 'range', from: 1, to: 'bins', pad: 2 },
    { key: 'position', enabled: false },
  ],
};

const TEMPLATES = [DOUBLE];
const RAHBA = { code: 'WH001', nameAr: 'الرحبة', binPrefix: 'RH', templateId: DOUBLE.id, templateParams: { aisles: 26, racks: 5, bins: 10 } };
const TRIPOLI = { code: 'WH002', nameAr: 'طرابلس', binPrefix: 'TR', templateId: DOUBLE.id, templateParams: { aisles: 10, racks: 5, bins: 10 } };

test('الحروفُ متتابعةٌ ومحصورةٌ بالأبجديّة', () => {
  assert.deepEqual(letterValues(3), ['A', 'B', 'C']);
  assert.equal(letterValues(MAX_LETTERS).length, 26);
  assert.equal(letterValues(99).length, 26, 'ما بعد Z يلزمه مقطعٌ آخر لا حرفٌ ثالثٌ وعشرون');
  assert.deepEqual(letterValues(0), []);
});

test('★★★ القالبُ يُحلّ إلى المخطّط القائم — فلا مولّدَ ثانٍ ولا حارسَ ثانٍ', () => {
  const scheme = schemeFromTemplate(DOUBLE, { binPrefix: 'RH', params: { aisles: 26, racks: 5, bins: 10 } });
  assert.equal(scheme.warehouse, 'RH');
  const { codes } = expandScheme(scheme);
  assert.equal(codes.length, 2600);
  assert.equal(codes[0], 'RH-A-L-01-01');
  assert.equal(codes[codes.length - 1], 'RH-Z-R-05-10');
});

test('★★ ثلاثةُ أرقامٍ تغيّر المقاس ولا تغيّر الترميز', () => {
  assert.equal(countForTemplate(DOUBLE, { binPrefix: 'TR', params: { aisles: 10, racks: 5, bins: 10 } }), 1000);
  assert.equal(countForTemplate(DOUBLE, { binPrefix: 'X', params: { aisles: 2, racks: 1, bins: 3 } }), 12, '2×2×1×3');
  const small = expandScheme(schemeFromTemplate(DOUBLE, { binPrefix: 'X', params: { aisles: 2, racks: 1, bins: 3 } })).codes;
  assert.deepEqual(small.slice(0, 4), ['X-A-L-01-01', 'X-A-L-01-02', 'X-A-L-01-03', 'X-A-R-01-01']);
});

test('الوسائطُ الافتراضيّة تُقرأ من القالب، والمستوى المعطَّل يبقى معطَّلًا', () => {
  assert.deepEqual(paramDefaults(DOUBLE), { aisles: 10, racks: 5, bins: 10 });
  const levels = resolveLevels(DOUBLE, {});
  assert.equal(levels.length, 5);
  assert.equal(levels[4].enabled, false, 'الصندوقُ معطَّلٌ في هذا الترميز');
  assert.equal(levels[0].values.length, 10, 'وبلا وسائطَ يُقرأ الافتراضيّ');
});

test('★★ وسيطٌ خارج حدّه يُحصر ولا يُنتج مليونَ كودٍ بغلطةِ رقم', () => {
  const huge = countForTemplate(DOUBLE, { binPrefix: 'X', params: { aisles: 999, racks: 999, bins: 999 } });
  assert.ok(huge <= 26 * 2 * 99 * 99, 'الحدودُ تُطبَّق قبل التوليد');
  const problems = templateProblems(DOUBLE, { binPrefix: 'X', params: { aisles: 999, racks: 999, bins: 999 } });
  assert.ok(problems.some((p) => /الحدّ/.test(p) || /الممرّات/.test(p)), 'ويُقال السبب: ' + problems.join(' · '));
});

test('أعطابُ القالب تقول الصواب — ولا قالبَ يعني قل «اختر قالبًا»', () => {
  assert.deepEqual(templateProblems(DOUBLE, { binPrefix: 'RH', params: { aisles: 26, racks: 5, bins: 10 } }), []);
  assert.match(templateProblems(null, {})[0], /اختر قالب/);
  assert.ok(templateProblems(DOUBLE, { binPrefix: '', params: { aisles: 2, racks: 1, bins: 1 } }).length, 'وبلا بادئةٍ لا يُولَّد');
  assert.match(templateProblems(DOUBLE, { binPrefix: 'X', params: { aisles: 'كثير' } }).join(' · '), /يحتاج رقمًا/);
});

test('القالبُ بمعرّفه — والمجهولُ يعود null ولا يُخمَّن أوّلُ قالب', () => {
  assert.equal(templateById(TEMPLATES, DOUBLE.id)?.nameAr, 'رفوفٌ مزدوجةُ الجهة');
  assert.equal(templateById(TEMPLATES, 'لا وجود له'), null);
  assert.equal(templateById(TEMPLATES, ''), null);
});

test('مستودعٌ بلا قالبٍ يُقال عنه ذلك ولا يُخمَّن له واحد', () => {
  assert.equal(numberingOf({ code: 'WH009' }), null);
  assert.equal(numberingOf(RAHBA)?.templateId, DOUBLE.id);
  const plan = warehousePlan({ code: 'WH009', binPrefix: 'ZZ' }, { templates: TEMPLATES, existingCodes: [] });
  assert.equal(plan.ready, false);
  assert.match(plan.problems[0], /بلا قالب ترقيم/);
});

test('★★★ التوليدُ إضافيٌّ لا استبداليّ — يحسب الناقصَ وحدَه', () => {
  const all = expandScheme(schemeFromTemplate(DOUBLE, { binPrefix: 'TR', params: TRIPOLI.templateParams })).codes;
  const half = all.slice(0, 400);
  const plan = warehousePlan(TRIPOLI, { templates: TEMPLATES, existingCodes: half });
  assert.equal(plan.total, 1000);
  assert.equal(plan.have, 400);
  assert.equal(plan.missing.length, 600);
  assert.ok(!plan.missing.some((c) => half.includes(c)), 'ولا يُعاد كتابةُ كودٍ قائم');
  assert.equal(plan.ready, true);
});

test('★★★ والضغطةُ الثانيةُ بلا أثر — فالزرُّ آمنٌ عند التكرار', () => {
  const all = expandScheme(schemeFromTemplate(DOUBLE, { binPrefix: 'TR', params: TRIPOLI.templateParams })).codes;
  const plan = warehousePlan(TRIPOLI, { templates: TEMPLATES, existingCodes: all });
  assert.equal(plan.have, 1000);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.ready, false, 'ولا شيءَ يُعرض للتوليد');
});

test('★★ والتوسيعُ يضيف الجديدَ وحدَه: ٢٦ ممرًّا ⟶ ٣٠ لا يمسّ القائم', () => {
  const at26 = expandScheme(schemeFromTemplate(DOUBLE, { binPrefix: 'RH', params: { aisles: 26, racks: 5, bins: 10 } })).codes;
  // الأبجديّةُ تنتهي عند Z، فالتوسيعُ الحقيقيّ يكون في الرفوف أو الخانات.
  const wider = { ...RAHBA, templateParams: { aisles: 26, racks: 6, bins: 10 } };
  const plan = warehousePlan(wider, { templates: TEMPLATES, existingCodes: at26 });
  assert.equal(plan.total, 3120, '26 × 2 × 6 × 10');
  assert.equal(plan.have, 2600);
  assert.equal(plan.missing.length, 520, 'الرفُّ السادسُ وحدَه');
  assert.ok(plan.missing.every((c) => c.includes('-06-')), 'وكلُّ ناقصٍ في الرفّ الجديد');
});

test('★★ خطّةُ الكلّ تعرض حالةَ كلّ مستودعٍ حتّى المكتمل — والصمتُ ليس جوابًا', () => {
  const tr = expandScheme(schemeFromTemplate(DOUBLE, { binPrefix: 'TR', params: TRIPOLI.templateParams })).codes;
  const plan = generationPlan({
    warehouses: [RAHBA, TRIPOLI, { code: 'WH003', nameAr: 'مستودعٌ بلا قالب', binPrefix: 'XX' }],
    templates: TEMPLATES,
    existingCodes: tr,
  });
  assert.equal(plan.rows.length, 3, 'صفٌّ لكلّ مستودع');
  assert.equal(plan.totalMissing, 2600, 'الرحبةُ كاملةً — وطرابلسُ مكتملة');
  assert.equal(plan.readyCount, 1);
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.rows.find((r) => r.warehouseCode === 'WH002').missing.length, 0);
  assert.equal(plan.rows.find((r) => r.warehouseCode === 'WH002').have, 1000);
});

test('★★★ أكوادُ مستودعٍ لا تُحسب لمستودعٍ آخر — والبادئةُ هي الفاصل', () => {
  const mixed = ['TR-A-L-01-01', 'RH-A-L-01-01', 'RH-A-L-01-02'];
  assert.equal(warehousePlan(TRIPOLI, { templates: TEMPLATES, existingCodes: mixed }).have, 1);
  assert.equal(warehousePlan(RAHBA, { templates: TEMPLATES, existingCodes: mixed }).have, 2);
});

test('★★ والزائدُ عن القالب يُعلَن ولا يُخفى — قالبٌ صُغِّر بعد التوليد', () => {
  const at6 = expandScheme(schemeFromTemplate(DOUBLE, { binPrefix: 'TR', params: { aisles: 10, racks: 6, bins: 10 } })).codes;
  const shrunk = { ...TRIPOLI, templateParams: { aisles: 10, racks: 5, bins: 10 } };
  const plan = warehousePlan(shrunk, { templates: TEMPLATES, existingCodes: at6 });
  assert.equal(plan.total, 1000, 'القالبُ الحاليّ يصف ألفًا');
  assert.equal(plan.have, 1200, 'وعلى الأرض ألفٌ ومئتان');
  assert.equal(plan.extra, 200, 'فمئتان خارجَ القالب — تُعلَن ولا تُحذف');
  assert.deepEqual(plan.missing, [], 'ولا ينقص شيء');
  assert.equal(plan.ready, false);
});

test('★★★ والإسنادُ المعتمد يعمل من أوّل مرّة — قبل حفظ أيّ قالب', () => {
  // بلا هذا الرجوع يقول الزرُّ «بلا قالب» لكلّ مستودعٍ في أوّل يوم، وهو أسوأ
  // ما يقوله زرٌّ وُجد ليختصر الطريق.
  const bare = { code: 'WH001', nameAr: 'الرحبة' };
  const assignments = [{ warehouseCode: 'WH001', binPrefix: 'RH', templateId: DOUBLE.id, params: { aisles: 26, racks: 5, bins: 10 } }];
  const plan = warehousePlan(bare, { templates: TEMPLATES, existingCodes: [], assignments });
  assert.equal(plan.binPrefix, 'RH', 'والبادئةُ من الإسناد لا من كود المستودع');
  assert.equal(plan.total, 2600);
  assert.equal(plan.missing.length, 2600);
  assert.equal(plan.source, 'assignment', 'ويُقال إنّه معتمدٌ غيرُ محفوظ');
  assert.equal(plan.ready, true);

  const savedWins = warehousePlan(
    { ...bare, binPrefix: 'RH', templateId: DOUBLE.id, templateParams: { aisles: 2, racks: 1, bins: 1 } },
    { templates: TEMPLATES, existingCodes: [], assignments }
  );
  assert.equal(savedWins.total, 4, 'والمحفوظُ على الوثيقة يتقدّم على الإسناد');
  assert.equal(savedWins.source, 'saved');
});

/** الإسنادُ المعتمد كما في البذرة. */
const ASSIGN = [{ warehouseCode: 'WH001', binPrefix: 'RH', templateId: DOUBLE.id, params: { aisles: 26, racks: 5, bins: 10 } }];
const LABELLED = {
  ...DOUBLE,
  segmentLabels: { zone: 'الممرّ', rack: 'الجهة', bay: 'المستوى', level: 'الخانة' },
  valueLabels: { rack: { L: 'يسار', R: 'يمين' } },
};
const TPL2 = [LABELLED];

test('★★★ حزمةُ الترقيم المعتمدة — ما يُكتب على وثيقة المستودع', () => {
  const a = approvedNumbering(ASSIGN[0], TPL2);
  assert.equal(a.binPrefix, 'RH');
  assert.equal(a.templateId, DOUBLE.id);
  assert.equal(a.segmentLabels.bay, 'المستوى');
  assert.equal(a.scheme.warehouse, 'RH');
  assert.equal(expandScheme(a.scheme).codes.length, 2600);
  assert.equal(approvedNumbering(null, TPL2), null);
  assert.equal(approvedNumbering({ templateId: 'مجهول' }, TPL2), null, 'وقالبٌ مجهولٌ لا يُعتمد');
});

test('★★★ الفرقُ يُقاس ويُسمّى — ومستودعٌ مطابقٌ لا يُعرض له زرّ', () => {
  const approved = approvedNumbering(ASSIGN[0], TPL2);
  const matching = { code: 'WH001', ...approved };
  assert.equal(numberingDrift(matching, { assignments: ASSIGN, templates: TPL2 }).differs, false, 'المطابقُ لا فرقَ له');

  // تسميةٌ قديمة («الرفّ» بدل «المستوى») ⟵ فرقٌ يُسمّى.
  const stale = { ...matching, segmentLabels: { ...approved.segmentLabels, bay: 'الرفّ' } };
  const d = numberingDrift(stale, { assignments: ASSIGN, templates: TPL2 });
  assert.equal(d.differs, true);
  assert.deepEqual(d.fields, ['تسميات المقاطع']);
  assert.equal(d.approved.segmentLabels.bay, 'المستوى', 'ومعه ما يُكتب');

  // ★ والمقاسُ والمخطّطُ حقلان مستقلّان، ويُسمّيان مستقلَّين: مستودعٌ عُدّل
  //   مقاسُه ولم يُعَد توليدُ مخطّطه حالةٌ حقيقيّة — والزرُّ يقول أيّهما تخلّف.
  const resized = { ...matching, templateParams: { aisles: 26, racks: 6, bins: 10 } };
  assert.deepEqual(numberingDrift(resized, { assignments: ASSIGN, templates: TPL2 }).fields, ['المقاس']);

  const staleScheme = { ...matching, scheme: schemeFromTemplate(LABELLED, { binPrefix: 'RH', params: { aisles: 2, racks: 1, bins: 1 } }) };
  assert.deepEqual(numberingDrift(staleScheme, { assignments: ASSIGN, templates: TPL2 }).fields, ['المخطّط']);
});

test('★★ وترتيبُ المفاتيح ليس فرقًا — فلا يُعلَن فرقٌ ليس فرقًا', () => {
  const approved = approvedNumbering(ASSIGN[0], TPL2);
  const shuffled = {
    code: 'WH001',
    ...approved,
    templateParams: { bins: 10, aisles: 26, racks: 5 },
    segmentLabels: { level: 'الخانة', bay: 'المستوى', rack: 'الجهة', zone: 'الممرّ' },
  };
  assert.equal(numberingDrift(shuffled, { assignments: ASSIGN, templates: TPL2 }).differs, false);
});

test('★★ ومستودعٌ بلا إسنادٍ معتمدٍ لا يُقاس عليه فرق', () => {
  assert.deepEqual(numberingDrift({ code: 'WH009' }, { assignments: ASSIGN, templates: TPL2 }), {
    differs: false, fields: [], approved: null,
  });
  const list = driftedWarehouses(
    [{ code: 'WH001', binPrefix: 'RH' }, { code: 'WH009' }],
    { assignments: ASSIGN, templates: TPL2 }
  );
  assert.equal(list.length, 1, 'المستودعُ بلا إسنادٍ لا يُعدّ منحرفًا');
  assert.equal(list[0].warehouse.code, 'WH001');
});
