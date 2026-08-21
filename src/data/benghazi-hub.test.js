/**
 * حارس بذرة أحياء بنغازي — `benghazi-hub.js`.
 *
 * البيانات هنا تُرسم على خريطةٍ حقيقيّة، ولا شيء في الشاشة يمنع إحداثيّةً
 * خاطئة من الظهور: حيٌّ بخط طولٍ مقلوبٍ يُرسم في وسط البحر، ولا خطأ ولا
 * تحذير — صورةٌ خاطئة تُقرأ على أنّها الحقيقة. فالحدود الجغرافيّة هنا حارسٌ
 * يمسك ما لا تمسكه العين.
 *
 * وكانت هذه البيانات داخل وسم `script` في الصفحة، فلم يكن يبلغها اختبار.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { BENGHAZI_NEIGHBORHOODS as HOODS } from './benghazi-hub.js';

/** مستطيلٌ يحيط ببنغازي وضواحيها بسخاء — خارجه خطأٌ لا اجتهاد. */
const BOUNDS = { latMin: 31.8, latMax: 32.4, lngMin: 19.9, lngMax: 20.7 };

const REQUIRED = [
  'id',
  'neighborhood',
  'lat',
  'lng',
  'class',
  'sector',
  'population',
  'income',
  'flow',
  'infra',
  'market_type',
  'market_match',
  'segments_present',
  'gap',
  'notes',
];

const CLOSED = {
  class: ['A', 'B', 'C', 'D'],
  market_match: ['مطابق', 'جزئي', 'غير مطابق'],
  sector: [1, 2, 3, 4, 5],
};

test('البذرة ليست فارغة، ولكلّ حيٍّ حقولُه كلّها', () => {
  assert.ok(HOODS.length >= 100, `عدد الأحياء ${HOODS.length} — هبوطٌ مفاجئ يعني بترًا لا تحريرًا`);
  const incomplete = HOODS.filter((h) => REQUIRED.some((k) => h[k] === undefined)).map(
    (h) => `${h.id}:${h.neighborhood}`
  );
  assert.deepEqual(incomplete, [], 'أحياءٌ بحقولٍ ناقصة');
});

test('المعرّف والاسم فريدان — فلا يبتلع حيٌّ حيًّا في الفهرسة', () => {
  const ids = HOODS.map((h) => h.id);
  const names = HOODS.map((h) => h.neighborhood);
  assert.equal(new Set(ids).size, ids.length, 'معرّفٌ مكرّر');
  assert.equal(new Set(names).size, names.length, 'اسمُ حيٍّ مكرّر');
  assert.deepEqual(
    ids.filter((i) => !Number.isInteger(i) || i <= 0),
    [],
    'معرّفٌ ليس عددًا صحيحًا موجبًا'
  );
});

test('★ كلّ حيٍّ داخل حدود بنغازي — الحارس الذي يمنع حيًّا في البحر', () => {
  const outside = HOODS.filter(
    (h) =>
      !Number.isFinite(h.lat) ||
      !Number.isFinite(h.lng) ||
      h.lat < BOUNDS.latMin ||
      h.lat > BOUNDS.latMax ||
      h.lng < BOUNDS.lngMin ||
      h.lng > BOUNDS.lngMax
  ).map((h) => `${h.neighborhood} (${h.lat}, ${h.lng})`);
  assert.deepEqual(outside, [], 'إحداثيّاتٌ خارج بنغازي — غالبًا خطُّ طولٍ وعرضٍ متبادلان');
});

test('الحقول المغلقة لا تقبل قيمةً مستجدّة بلا قرار', () => {
  for (const [field, allowed] of Object.entries(CLOSED)) {
    const strays = [...new Set(HOODS.map((h) => h[field]))].filter((v) => !allowed.includes(v));
    assert.deepEqual(strays, [], `قيمٌ غير معروفة في ${field}`);
  }
});

test('السكّان عددٌ موجب، والشرائح قائمةٌ من رموز الفئات', () => {
  const badPop = HOODS.filter((h) => !Number.isFinite(h.population) || h.population <= 0).map(
    (h) => h.neighborhood
  );
  assert.deepEqual(badPop, [], 'عدد سكّانٍ غير صالح');

  const badSeg = HOODS.filter(
    (h) => !Array.isArray(h.segments_present) || h.segments_present.some((s) => !CLOSED.class.includes(s))
  ).map((h) => h.neighborhood);
  assert.deepEqual(badSeg, [], 'شريحةٌ ليست من رموز الفئات A–D');
});

test('القطاعات الخمسة كلّها مأهولة — فلا قطاع يُذكر في الواجهة وهو فارغ', () => {
  const empty = CLOSED.sector.filter((s) => !HOODS.some((h) => h.sector === s));
  assert.deepEqual(empty, [], 'قطاعٌ بلا حيٍّ واحد');
});
