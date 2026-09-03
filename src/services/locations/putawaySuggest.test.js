/**
 * اختبارات محرّك اقتراح المواقع — الترتيب والتعليل والرفض والتجاوز.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseVerdict, handlingNeedOf, overrideEntry, scoreLocation, suggestLocations, WEIGHTS } from './putawaySuggest.js';
import { shapeLocation } from './locationsModel.js';

const loc = (code, over = {}) => ({ code, warehouse: 'E5', status: 'active', storageType: 'ambient', capacity: { qty: 100 }, mixItems: true, mixBatches: true, ...over });
const bal = (code, over = {}) => ({ bin: code, warehouse: 'E5', sku: 'A', batch: 'B1', qty: 10, ...over });
const LINE = { sku: 'A', barcode: '629', batch: 'B1', qty: 20, warehouse: 'E5' };

/**
 * كلّ نداءٍ في هذا الملفّ، مجموعًا في مكانٍ واحد — مادّةُ قفل الهجرة أدناه.
 * وكلّما أُضيفت عيّنةٌ إلى اختبارٍ جديد فحقُّها أن تُضاف هنا معها.
 */
const SAMPLES = [
  { line: LINE, locations: [], balances: [] },
  { line: LINE, locations: [loc('WH2-A01', { warehouse: 'WH2' })], balances: [] },
  { line: { ...LINE, qty: 0 }, locations: [loc('E5-A01')], balances: [] },
  { line: LINE, locations: [loc('E5-A01'), loc('E5-A02')], balances: [bal('E5-A02')] },
  {
    line: LINE,
    locations: [loc('E5-A01'), loc('E5-A02'), loc('E5-A03')],
    balances: [bal('E5-A02', { batch: 'B9' }), bal('E5-A03')],
  },
  { line: LINE, locations: [loc('E5-A01')], balances: [bal('E5-A01', { qty: 30 })] },
  { line: LINE, locations: [loc('E5-A01', { capacity: {} })], balances: [bal('E5-A01', { qty: 9999 })] },
  { line: LINE, locations: [loc('E5-A01', { capacity: { qty: 35 } })], balances: [bal('E5-A01', { qty: 30 })] },
  {
    line: LINE,
    locations: [
      loc('E5-A01', { status: 'stopped' }),
      loc('E5-A02', { status: 'maintenance' }),
      loc('E5-A03', { status: 'full' }),
      loc('E5-A04', { capacity: { qty: 10 } }),
      loc('E5-A05'),
    ],
    balances: [bal('E5-A04', { qty: 10 })],
  },
  {
    line: { ...LINE, storageType: 'frozen' },
    locations: [loc('E5-A01'), loc('E5-A02', { storageType: 'frozen' })],
    balances: [],
  },
  { line: LINE, locations: [loc('E5-A01', { storageType: 'frozen' })], balances: [] },
  { line: LINE, locations: [loc('E5-A01', { mixItems: false })], balances: [bal('E5-A01', { sku: 'Z' })] },
  { line: LINE, locations: [loc('E5-A01', { allowedItems: ['Z'] })], balances: [] },
  { line: LINE, locations: [loc('E5-A01', { distance: 40 }), loc('E5-A02', { priority: 10 })], balances: [] },
];

test('🔒★★★ قفلُ الهجرة: كلّ عيّنةٍ قائمةٍ تُسجَّل بالنتيجة نفسِها بعد أن يصير كلُّ موقعٍ «مختلطًا»', () => {
  // ═══ لماذا هذا الحارس قبل غيره؟ ═══
  // بُعدُ المناولة يدخل على سيّدٍ فيه آلافُ المواقع وملصقاتُها مطبوعة. فإن
  // بدّل حكمًا واحدًا في بندٍ واحد، فقد بدّل ترتيبًا يقرؤه عاملٌ اليوم — بلا
  // أن يطلب أحدٌ ذلك. والقفلُ يقيس الادّعاء ولا يصدّقه: **النتيجة نفسُها
  // كائنًا بكائن** قبل الحقل وبعده.
  for (const sample of SAMPLES) {
    const before = suggestLocations(sample);

    // ① الحقل يُكتب صراحةً بقيمته الافتراضيّة على كلّ موقع.
    const mixed = suggestLocations({ ...sample, locations: sample.locations.map((l) => ({ ...l, handling: 'mixed' })) });
    assert.deepEqual(mixed, before, `«مختلط» بدّل حكمًا: ${sample.locations.map((l) => l.code).join(' · ') || '—'}`);

    // ② والمسارُ الحقيقيّ: الموقع يمرّ بالنموذج (كما يفعل الحفظ) فيكتسب
    //    `handling` و`capacity.pallets` معًا — وهي هجرةُ السيّد الفعليّة.
    const shaped = suggestLocations({ ...sample, locations: sample.locations.map(shapeLocation) });
    assert.deepEqual(shaped, before, `التسويةُ بالنموذج بدّلت حكمًا: ${sample.locations.map((l) => l.code).join(' · ') || '—'}`);
  }
});

test('★★ لا يُخترع اقتراح: بلا سيّد مواقع تُعاد قائمةٌ فارغة بسببٍ معلَن', () => {
  const r = suggestLocations({ line: LINE, locations: [], balances: [] });
  assert.deepEqual(r.candidates, []);
  assert.match(r.problem, /سيّد المواقع فارغ/, 'السبب يُقال — لا رفٌّ عشوائيّ يبدو ذكيًّا');
});

test('لا مواقع للمستودع المطلوب ⇒ سببٌ يذكره', () => {
  const r = suggestLocations({ line: LINE, locations: [loc('WH2-A01', { warehouse: 'WH2' })], balances: [] });
  assert.equal(r.candidates.length, 0);
  assert.match(r.problem, /لا مواقع معرَّفة للمستودع «E5»/);
});

test('كمّيّة صفر ⇒ لا اقتراح', () => {
  const r = suggestLocations({ line: { ...LINE, qty: 0 }, locations: [loc('E5-A01')], balances: [] });
  assert.match(r.problem, /كمّيّة البند صفر/);
});

test('★★ التجميع يتقدّم: الصنف والدفعة نفسهما يفوزان على الفارغ', () => {
  const r = suggestLocations({
    line: LINE,
    locations: [loc('E5-A01'), loc('E5-A02')],
    balances: [bal('E5-A02')], // الصنف والدفعة هنا
  });
  assert.equal(r.candidates[0].code, 'E5-A02', 'التجميع يُقصّر السحب لاحقًا');
  assert.match(r.candidates[0].reasons.join(' '), /الصنف والدفعة نفسهما/);
  assert.ok(r.candidates[0].score > r.candidates[1].score);
});

test('الصنف نفسه بدفعةٍ أخرى يتقدّم على الفارغ ويتأخّر عن الدفعة نفسها', () => {
  const r = suggestLocations({
    line: LINE,
    locations: [loc('E5-A01'), loc('E5-A02'), loc('E5-A03')],
    balances: [bal('E5-A02', { batch: 'B9' }), bal('E5-A03')],
  });
  assert.deepEqual(r.candidates.slice(0, 3).map((c) => c.code), ['E5-A03', 'E5-A02', 'E5-A01']);
});

test('★★ السعة قبل/بعد تُحسب وتُعرض — وهي ما يراه العامل قبل أن يقرّر', () => {
  const r = suggestLocations({ line: LINE, locations: [loc('E5-A01')], balances: [bal('E5-A01', { qty: 30 })] });
  const c = r.candidates[0];
  assert.deepEqual(c.capacityBefore, { used: 30, remaining: 70, capacity: 100 });
  assert.deepEqual(c.capacityAfter, { used: 50, remaining: 50, capacity: 100 });
});

test('★★ «لا سقفَ ⇒ لا منع»: موقعٌ بلا سعةٍ يُقترح ولا يُعدّ ممتلئًا', () => {
  const r = suggestLocations({ line: LINE, locations: [loc('E5-A01', { capacity: {} })], balances: [bal('E5-A01', { qty: 9999 })] });
  assert.equal(r.candidates.length, 1);
  assert.match(r.candidates[0].reasons.join(' '), /سعة غير محدودة/);
  assert.equal(r.candidates[0].capacityAfter.remaining, null);
});

test('السعة الجزئية تُقترح ويُقال إنّها لا تكفي كاملةً', () => {
  const r = suggestLocations({ line: LINE, locations: [loc('E5-A01', { capacity: { qty: 35 } })], balances: [bal('E5-A01', { qty: 30 })] });
  assert.match(r.candidates[0].reasons.join(' '), /تكفي 5 من 20/);
});

test('🔒 ★★ الممتلئ والموقوف وتحت الصيانة لا يُقترحون — ويظهرون بأسبابهم', () => {
  const r = suggestLocations({
    line: LINE,
    locations: [
      loc('E5-A01', { status: 'stopped' }),
      loc('E5-A02', { status: 'maintenance' }),
      loc('E5-A03', { status: 'full' }),
      loc('E5-A04', { capacity: { qty: 10 } }), // بلغ سعته
      loc('E5-A05'),
    ],
    balances: [bal('E5-A04', { qty: 10 })],
  });
  assert.deepEqual(r.candidates.map((c) => c.code), ['E5-A05'], 'يبقى الصالح وحده');
  assert.equal(r.rejected.length, 4);
  for (const rj of r.rejected) assert.ok(rj.reason.length > 0, `${rj.code} رُفض بلا سبب`);
  assert.match(r.rejected.find((x) => x.code === 'E5-A04').reason, /بلغ سعته/);
});

test('نوع التخزين: المجمَّد لا يُقترح للعاديّ، والمطابق يُكافأ', () => {
  const frozenLine = { ...LINE, storageType: 'frozen' };
  const r = suggestLocations({
    line: frozenLine,
    locations: [loc('E5-A01'), loc('E5-A02', { storageType: 'frozen' })],
    balances: [],
  });
  assert.deepEqual(r.candidates.map((c) => c.code), ['E5-A02']);
  assert.match(r.rejected[0].reason, /يحتاج تخزينًا «frozen»/);
  assert.match(r.candidates[0].reasons.join(' '), /نوع التخزين مطابق/);
});

test('★★ بلا متطلَّب نوعٍ للصنف لا يُمنع شيء — ولا يُخترع للصنف قيدٌ لم يُعرَّف', () => {
  const r = suggestLocations({ line: LINE, locations: [loc('E5-A01', { storageType: 'frozen' })], balances: [] });
  assert.equal(r.candidates.length, 1, 'الصنف بلا متطلَّب ⇒ كلّ الأنواع مقبولة');
});

test('سياسة الخلط والأصناف المسموحة ترفضان بسببٍ مكتوب', () => {
  const noMix = suggestLocations({
    line: LINE,
    locations: [loc('E5-A01', { mixItems: false })],
    balances: [bal('E5-A01', { sku: 'Z' })],
  });
  assert.match(noMix.rejected[0].reason, /لا يقبل خلط الأصناف/);

  const restricted = suggestLocations({ line: LINE, locations: [loc('E5-A01', { allowedItems: ['Z'] })], balances: [] });
  assert.match(restricted.rejected[0].reason, /محصورٌ بأصناف/);
});

test('الأولويّة تُقدّم والبُعد يُؤخّر', () => {
  const r = suggestLocations({
    line: LINE,
    locations: [loc('E5-A01', { distance: 40 }), loc('E5-A02', { priority: 10 })],
    balances: [],
  });
  assert.equal(r.candidates[0].code, 'E5-A02');
  assert.equal(WEIGHTS.distance < 0, true, 'البُعد وزنٌ سالب');
});

test('★★ حكم الاختيار: الصالح يمرّ بلا سبب، والمرفوض تجاوزٌ يحتاج سببًا — لا منعًا', () => {
  const locations = [loc('E5-A01'), loc('E5-A02', { status: 'stopped' })];
  const good = chooseVerdict('E5-A01', { line: LINE, locations, balances: [] });
  assert.deepEqual(good, { ok: true, override: false, reason: '', needsReason: false });

  const bad = chooseVerdict('E5-A02', { line: LINE, locations, balances: [] });
  assert.equal(bad.ok, false);
  assert.equal(bad.override, true, 'يمرّ تجاوزًا — العمل لا يتوقّف');
  assert.equal(bad.needsReason, true);
  assert.match(bad.reason, /متوقّف/);
});

test('موقعٌ غير مسجَّل: تجاوزٌ مُعلَّل لا رفضٌ صامت', () => {
  const v = chooseVerdict('E5-Z99', { line: LINE, locations: [loc('E5-A01')], balances: [] });
  assert.equal(v.override, true);
  assert.match(v.reason, /غير مسجَّل/);
});

test('★★ سبب التجاوز إلزاميّ — والفارغ يُرفض', () => {
  const empty = overrideEntry({ code: 'E5-A02', line: LINE, verdict: { reason: 'متوقّف' }, note: '   ' });
  assert.equal(empty.ok, false);
  assert.match(empty.problem, /إلزاميّ/);
  assert.equal(empty.entry, null);

  const ok = overrideEntry({ code: 'E5-A02', line: LINE, verdict: { reason: 'متوقّف' }, note: 'الرفّ أُصلح ولم تُحدَّث حالته', profile: { name: 'عليّ', role: 'storekeeper' } });
  assert.equal(ok.ok, true);
  assert.equal(ok.entry.action, 'putaway-location-override');
  assert.equal(ok.entry.locationCode, 'E5-A02');
  assert.equal(ok.entry.systemVerdict, 'متوقّف', 'يُحفظ حكم النظام مع سبب المخالف');
  assert.equal(ok.entry.byName, 'عليّ');
});

test('التقييم المباشر يُعيد التسمية التي يراها العامل — الكودَ كاملًا', () => {
  const s = scoreLocation(loc('MAIN-A01-R01-B09-LF'), { line: LINE, balances: [] });
  assert.equal(s.ok, true);
  assert.equal(s.shortLabel, 'MAIN-A01-R01-B09-LF');
});

/* ═══════════════════════════════════════════════════════════════════════
 * التخزين بالطبلية مقابل التخزين بالصنف ‹JR-601› — بُعدُ المناولة
 * ═══════════════════════════════════════════════════════════════════════ */

const PALLET_LINE = { ...LINE, uom: 'طبلية' };

test('★★ حاجةُ المناولة تُشتقّ من وحدة القيد — لا حقلٌ جديدٌ يُملأ صنفًا صنفًا', () => {
  assert.equal(handlingNeedOf({ uom: 'طبلية' }), 'pallet');
  assert.equal(handlingNeedOf({ uom: 'PLT' }), 'pallet', 'والمرادفاتُ تُقرأ كما في سيّد الوحدات');
  assert.equal(handlingNeedOf({ uom: 'كرتون' }), 'carton');
  assert.equal(handlingNeedOf({ uom: 'صندوق' }), 'carton');
  assert.equal(handlingNeedOf({ uom: 'قطعة' }), 'piece');
  assert.equal(handlingNeedOf({ uom: 'دستة' }), 'piece', 'الدستة قطعٌ معدودة');
  assert.equal(handlingNeedOf({ uom: 'كيلو' }), '', 'الوزن لا يقول شيئًا عن المناولة');
  assert.equal(handlingNeedOf({}), '', 'وبلا وحدةٍ لا قيد');
});

test('★★★ معاملُ الطبليّة يُقرأ عند غياب الوحدة — والنصُّ القديم `unit` لا يُقرأ أبدًا', () => {
  // لو قُرئ `unit` لَانقلبت الميزةُ على الأصناف كلّها في لحظة، وهي على كلّ
  // صنفٍ منذ الأزل. ولو قُرئ معاملُ الصندوق لَصار كلُّ بندٍ بلا وحدةٍ
  // «صندوقًا» فأُغلقت في وجهه واجهاتُ الالتقاط كلُّها — منعٌ بُني على شيوع.
  assert.equal(handlingNeedOf({}, { uomFactors: { pallet: 48 } }), 'pallet');
  assert.equal(handlingNeedOf({}, { unit: 'طبلية' }), '', 'النصُّ القديم لا يكفي');
  assert.equal(handlingNeedOf({}, { uomFactors: { carton: 12 } }), '', 'ومعاملُ الكرتون لا يُلزم');
  assert.equal(handlingNeedOf({}, { uomFactors: { pallet: 0 } }), '', 'ومعاملٌ صفرٌ ليس تعريفًا');
  assert.equal(handlingNeedOf({ uom: 'قطعة' }, { uomFactors: { pallet: 48 } }), 'piece', 'ووحدةُ القيد تتقدّم');
});

test('★★ طبليّةٌ إلى رفّ «بالقطعة»: تُرفض بسببها المكتوب — و«المختلط» يمرّ', () => {
  const r = suggestLocations({
    line: PALLET_LINE,
    locations: [
      loc('E5-A01', { handling: 'piece' }),
      loc('E5-A02', { handling: 'mixed' }),
      loc('E5-A03'), // بلا حقلٍ أصلًا — وهو حالُ كلّ موقعٍ قديم
    ],
    balances: [],
  });
  assert.deepEqual(r.candidates.map((c) => c.code).sort(), ['E5-A02', 'E5-A03']);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].code, 'E5-A01');
  assert.match(r.rejected[0].reason, /يُناوَل بالطبلية وهذا الرفّ بالقطعة/, 'الرفض بلا سببٍ شكوى لا معلومة');
});

test('★★ التوافقُ يُكافأ: رفُّ الطبالي يتقدّم على المختلط للبند نفسِه', () => {
  const r = suggestLocations({
    line: PALLET_LINE,
    locations: [loc('E5-A01'), loc('E5-A02', { handling: 'pallet' })],
    balances: [],
  });
  assert.equal(r.candidates[0].code, 'E5-A02');
  assert.match(r.candidates[0].reasons.join(' '), /نوع المناولة مطابق/);
  assert.equal(r.candidates[0].score - r.candidates[1].score, WEIGHTS.handlingMatch, 'الفارقُ وزنُ التوافق وحدَه');
});

test('★★★ الفارغُ على أيّ طرفٍ يمرّ — ولا يُخترع للبند قيدٌ ولا للرفّ', () => {
  // بندٌ بلا وحدةٍ في رفٍّ للطبالي: يمرّ (لا حاجةَ معلَنة).
  const noNeed = suggestLocations({ line: LINE, locations: [loc('E5-A01', { handling: 'pallet' })], balances: [] });
  assert.equal(noNeed.candidates.length, 1);
  assert.equal(noNeed.candidates[0].reasons.join(' ').includes('المناولة'), false, 'ولا يُكافأ توافقٌ لم يُعلَن');

  // وبندٌ بالطبالي في رفٍّ بلا إعلان: يمرّ كذلك.
  const noRule = suggestLocations({ line: PALLET_LINE, locations: [loc('E5-A01')], balances: [] });
  assert.equal(noRule.candidates.length, 1);

  // ونوعُ المناولة لا يمسّ نوع التخزين: مجمَّدٌ يُخزَّن بالطبالي، والبُعدان يجتمعان.
  const both = suggestLocations({
    line: { ...PALLET_LINE, storageType: 'frozen' },
    locations: [loc('E5-A01', { storageType: 'frozen', handling: 'pallet' })],
    balances: [],
  });
  assert.equal(both.candidates.length, 1, 'المجمَّدُ بالطبالي ليس تناقضًا');
  assert.match(both.candidates[0].reasons.join(' '), /نوع التخزين مطابق/);
  assert.match(both.candidates[0].reasons.join(' '), /نوع المناولة مطابق/);
});

test('★★ سعةُ الطبالي: الصفرُ بلا سقفٍ لا ممتلئ، والسقفُ المبلوغ يُرفض بسببه', () => {
  const pallets = new Map([['E5-A01', [{}, {}, {}]], ['E5-A02', [{}, {}, {}]]]);

  const loose = suggestLocations({
    line: PALLET_LINE,
    locations: [loc('E5-A01', { capacity: { qty: 100, pallets: 0 } })],
    balances: [],
    pallets,
  });
  assert.equal(loose.candidates.length, 1, 'صفرٌ يعني «بلا سقف» — وإلّا توقّف المستودع أوّل يوم');

  const capped = suggestLocations({
    line: PALLET_LINE,
    locations: [loc('E5-A02', { capacity: { qty: 100, pallets: 3 } })],
    balances: [],
    pallets,
  });
  assert.equal(capped.candidates.length, 0);
  assert.match(capped.rejected[0].reason, /بلغ سعته من الطبالي \(3\)/);

  // ★★★ وبلا فهرسٍ مُمرَّرٍ لا حكم: لا يُحسب امتلاءٌ من جهل.
  const blind = suggestLocations({
    line: PALLET_LINE,
    locations: [loc('E5-A02', { capacity: { qty: 100, pallets: 3 } })],
    balances: [],
  });
  assert.equal(blind.candidates.length, 1, 'مستدعٍ لا يعرف الطبالي لا يُحاسَب على سعتها');
});

test('حكمُ الاختيار يعرف المناولة أيضًا — تجاوزٌ مُعلَّل لا منع', () => {
  const locations = [loc('E5-A01', { handling: 'piece' })];
  const v = chooseVerdict('E5-A01', { line: PALLET_LINE, locations, balances: [] });
  assert.equal(v.ok, false);
  assert.equal(v.override, true, 'يمرّ تجاوزًا — العمل لا يتوقّف');
  assert.match(v.reason, /بالقطعة/);
});
