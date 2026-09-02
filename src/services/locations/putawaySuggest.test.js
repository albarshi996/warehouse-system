/**
 * اختبارات محرّك اقتراح المواقع — الترتيب والتعليل والرفض والتجاوز.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseVerdict, overrideEntry, scoreLocation, suggestLocations, WEIGHTS } from './putawaySuggest.js';

const loc = (code, over = {}) => ({ code, warehouse: 'E5', status: 'active', storageType: 'ambient', capacity: { qty: 100 }, mixItems: true, mixBatches: true, ...over });
const bal = (code, over = {}) => ({ bin: code, warehouse: 'E5', sku: 'A', batch: 'B1', qty: 10, ...over });
const LINE = { sku: 'A', barcode: '629', batch: 'B1', qty: 20, warehouse: 'E5' };

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
