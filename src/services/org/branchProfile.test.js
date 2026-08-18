/**
 * حارس ملفّ الفرع التشغيليّ ‹FNB-201›.
 *
 * أخطر ما يحرسه: **الملفّ يُغني ولا يُعطّل** (فرعٌ بلا ملفٍّ يعمل كما اليوم)،
 * و**ما يُشتقّ لا يُخزَّن** (أنواع التخزين من سيّد المواقع لا من الملفّ)،
 * و**النقص يُعلَن ولا يمنع** — والمنعُ لما يكذب لا لما ينقص.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONCEPT_TYPES, normalizeConcept, BRANCH_STATES, DEFAULT_BRANCH_STATE, replenishes,
  shapeBranchProfile, hasProfile, profileGaps, profileCompleteness, profileProblems,
  storageAbilities, suppliesOn, WEEK_DAYS,
} from './branchProfile.js';
import { shapeLocation } from '../locations/locationsModel.js';

const FULL = {
  city: 'بنغازي',
  concept: 'qsr',
  openingDate: '2026-09-01',
  state: 'operating',
  menuSkus: ['BURGER', 'FRIES'],
  coversPerDay: 300,
  expectedDailySales: 4500,
  supplyDays: ['sun', 'wed'],
};

test('المفاهيم الستّة من نصّ المستند — و«آخر» بابٌ معلَن لا نصٌّ حرّ', () => {
  for (const id of ['fine_dining', 'casual_dining', 'standard', 'qsr', 'cafe', 'bakery', 'other']) {
    assert.ok(CONCEPT_TYPES[id], `المفهوم «${id}» غائب`);
  }
  assert.equal(normalizeConcept('QSR'), 'qsr');
  assert.equal(normalizeConcept('مقهى'), 'cafe');
  assert.equal(normalizeConcept('شبه راقٍ'), 'casual_dining');
  assert.equal(normalizeConcept('مخبز'), 'bakery');
  assert.equal(normalizeConcept('عربة متنقّلة'), ''); // المجهول يُعلَن مجهولًا…
  // …ثمّ يُحفظ «آخر» بوصفه، فلا يُرفض مفهومٌ جديد ولا يضيع.
  const shaped = shapeBranchProfile({ concept: 'عربة متنقّلة' });
  assert.equal(shaped.concept, 'other');
  assert.equal(shaped.conceptNote, 'عربة متنقّلة');
});

test('حالة الفرع: الافتتاح لا يُقترح له والتشغيل يُقترح — انتقالُ حالةٍ لا مستندَين', () => {
  assert.equal(Object.keys(BRANCH_STATES).length, 4);
  assert.equal(replenishes('opening'), false); // يُخدَم بشدّة الافتتاح.
  assert.equal(replenishes('operating'), true);
  assert.equal(replenishes('suspended'), false);
  assert.equal(shapeBranchProfile({}).state, DEFAULT_BRANCH_STATE);
  assert.equal(replenishes(DEFAULT_BRANCH_STATE), false); // ما لم يُفتح لا يُزوَّد.
});

test('التسوية: المنيو يُطبَّع بلا تكرار، والأيّام تُقرأ قائمةً أو خريطة', () => {
  const p = shapeBranchProfile({ ...FULL, menuSkus: ['burger', 'BURGER', ' fries '] });
  assert.deepEqual(p.menuSkus, ['BURGER', 'FRIES']);
  assert.deepEqual(p.supplyDays, ['sun', 'wed']);
  // وخريطةٌ من الشاشة تُقرأ كما تُقرأ القائمة.
  assert.deepEqual(shapeBranchProfile({ supplyDays: { sun: true, mon: false, thu: true } }).supplyDays, ['sun', 'thu']);
});

test('★★ الملفّ يُغني ولا يُعطّل: فرعٌ بلا ملفٍّ يُعلَن نقصُه ولا يُمنع', () => {
  const bare = { code: 'BR01', level: 'branch' };
  assert.equal(hasProfile(bare), false);
  assert.equal(profileCompleteness(bare), 0);
  assert.equal(profileGaps(bare).length, 1); // جملةٌ واحدة تقول ما ينقص…
  assert.deepEqual(profileProblems(bare), []); // …ولا عطبَ يمنع الحفظ.
});

test('النقص يُسمّى حقلًا حقلًا، والاكتمال يُقاس', () => {
  const partial = { code: 'BR01', level: 'branch', profile: shapeBranchProfile({ concept: 'cafe', city: 'طرابلس' }) };
  const gaps = profileGaps(partial);
  assert.ok(gaps.some((g) => g.includes('تاريخ الافتتاح')));
  assert.ok(gaps.some((g) => g.includes('المنيو المعتمد')));
  assert.ok(profileCompleteness(partial) > 0 && profileCompleteness(partial) < 100);

  const full = { code: 'BR01', level: 'branch', profile: shapeBranchProfile(FULL) };
  assert.deepEqual(profileGaps(full), []);
  assert.equal(profileCompleteness(full), 100);
  assert.equal(hasProfile(full), true);
});

test('★ المنعُ لما يكذب لا لما ينقص: تاريخٌ فاسد · حالةٌ تسبق واقعها · قيمةٌ سالبة · ملفٌّ لغير فرع', () => {
  const bad = (profile, location = {}) => profileProblems({ code: 'X', level: 'branch', profile: shapeBranchProfile(profile), ...location });
  assert.ok(bad({ openingDate: '01-09-2026' }).some((p) => p.includes('YYYY-MM-DD')));
  assert.ok(bad({ state: 'operating' }).some((p) => p.includes('تسبق واقعَها')));
  assert.ok(bad({ coversPerDay: -5 }).some((p) => p.includes('سالبة')));
  // والملفّ للفروع وحدها — لا للقطاع ولا للبراند.
  const onBrand = profileProblems({ code: 'BRD1', level: 'brand', profile: shapeBranchProfile(FULL) });
  assert.ok(onBrand.some((p) => p.includes('للفروع وحدها')));
  // والسليم يمرّ صامتًا.
  assert.deepEqual(bad(FULL), []);
});

test('★ ما يُشتقّ لا يُخزَّن: قدرات التبريد من سيّد المواقع لا من الملفّ', () => {
  const locations = [
    shapeLocation({ code: 'BR01-CLD', storageType: 'chilled' }),
    shapeLocation({ code: 'BR01-DRY', storageType: 'ambient' }),
    shapeLocation({ code: 'BR02-FRZ', storageType: 'frozen' }), // فرعٌ آخر — لا يتسرّب.
  ];
  const a = storageAbilities('BR01', locations);
  assert.equal(a.chilled, true);
  assert.equal(a.ambient, true);
  assert.equal(a.frozen, false);
  assert.equal(a.zones, 2);
  // وفرعٌ بلا مواقع: لا قدراتٍ مزعومة.
  assert.deepEqual(storageAbilities('BR09', locations), { chilled: false, frozen: false, ambient: false, zones: 0 });
});

test('أيّام التوريد تُقرأ بالتاريخ — وبلا تقويمٍ كلُّ يومٍ صالح (لا تعطيل)', () => {
  const p = shapeBranchProfile({ supplyDays: ['sun', 'wed'] });
  assert.equal(suppliesOn(p, '2026-08-16'), true); // الأحد.
  assert.equal(suppliesOn(p, '2026-08-17'), false); // الإثنين.
  assert.equal(suppliesOn(p, '2026-08-19'), true); // الأربعاء.
  assert.equal(suppliesOn(shapeBranchProfile({}), '2026-08-17'), true); // بلا تقويم.
  assert.equal(WEEK_DAYS.length, 7);
});
