/**
 * ذاكرةُ كتالوج الأصناف — منطقٌ خالص، يُختبَر بلا سحابةٍ ولا متصفّح.
 *
 * وُجدت بعد نفادِ حصّةِ Firestore المجّانيّة 2026-09-05 (٦١ ألفَ قراءةٍ مقابل
 * ٣٦ كتابة) — والجردُ في الغد. فكلُّ حالةِ فسادٍ هنا تعني كتالوجًا نصفَ مقروءٍ
 * في يد العادّ، وهو أسوأُ من لا كتالوج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CACHE_TTL_MS,
  packCache,
  unpackCache,
  isFresh,
  selectItems,
} from './itemCache.js';

const ITEMS = [
  { sku: 'A-1', nameAr: 'صنف أوّل', archived: false },
  { sku: 'A-2', nameAr: 'صنف ثانٍ', archived: true },
  { sku: 'A-3', nameAr: 'صنف ثالث' },
];

/* ═══════════════════ الرحلة كاملةً ═══════════════════ */

test('يُغلَّف ثمّ يُفكّ فيعود كما كان', () => {
  const back = unpackCache(packCache(ITEMS, 1000));
  assert.equal(back.at, 1000);
  assert.deepEqual(back.items, ITEMS);
});

test('قائمةٌ فارغةٌ حالةٌ صالحةٌ لا فساد', () => {
  const back = unpackCache(packCache([], 500));
  assert.deepEqual(back.items, []);
  assert.equal(back.at, 500);
});

test('غيرُ المصفوفة تُغلَّف قائمةً فارغةً لا تُسقط التغليف', () => {
  assert.deepEqual(unpackCache(packCache(null, 1)).items, []);
  assert.deepEqual(unpackCache(packCache(undefined, 1)).items, []);
});

/* ═══════════════════ رفضُ كلّ ما لا يُوثق به ═══════════════════ */

test('★★ لا شيءَ ⇒ null', () => {
  assert.equal(unpackCache(null), null);
  assert.equal(unpackCache(undefined), null);
  assert.equal(unpackCache(''), null);
  assert.equal(unpackCache(123), null, 'ليس نصًّا');
});

test('★★ نصٌّ فاسدٌ ⇒ null ولا يرمي', () => {
  assert.equal(unpackCache('{ليس'), null);
  assert.equal(unpackCache('[1,2'), null);
  assert.equal(unpackCache('null'), null);
  assert.equal(unpackCache('"نص"'), null);
  assert.equal(unpackCache('42'), null);
});

test('★★★ نسخةٌ أخرى ⇒ null — تغييرُ الشكل يُبطل القديمَ بلا ترحيل', () => {
  assert.equal(unpackCache(JSON.stringify({ v: 2, at: 1, items: [] })), null);
  assert.equal(unpackCache(JSON.stringify({ at: 1, items: [] })), null, 'بلا نسخة');
});

test('★★★ حقلٌ ناقصٌ أو من نوعٍ خاطئ ⇒ null', () => {
  assert.equal(unpackCache(JSON.stringify({ v: 1, at: 1 })), null, 'بلا items');
  assert.equal(unpackCache(JSON.stringify({ v: 1, items: [] })), null, 'بلا at');
  assert.equal(unpackCache(JSON.stringify({ v: 1, at: 'أمس', items: [] })), null, 'at ليس رقمًا');
  assert.equal(unpackCache(JSON.stringify({ v: 1, at: NaN, items: [] })), null, 'at غيرُ محدود');
  assert.equal(unpackCache(JSON.stringify({ v: 1, at: 1, items: {} })), null, 'items ليست مصفوفة');
});

/* ═══════════════════ الطزاجة ═══════════════════ */

test('حديثةٌ ⇒ طازجة · وقديمةٌ ⇒ لا', () => {
  const now = 1_000_000_000;
  assert.equal(isFresh({ at: now }, now), true, 'اللحظة نفسُها');
  assert.equal(isFresh({ at: now - CACHE_TTL_MS + 1 }, now), true, 'قبل انتهاء المدّة بلحظة');
  assert.equal(isFresh({ at: now - CACHE_TTL_MS }, now), false, 'عند الحدّ تمامًا');
  assert.equal(isFresh({ at: now - CACHE_TTL_MS - 1 }, now), false, 'بعد الحدّ');
});

test('★★★ طابعٌ من المستقبل يُعدّ فاسدًا لا طازجًا', () => {
  const now = 1_000_000_000;
  // ساعةُ الجهاز قد تُضبط للخلف، فتصير ذاكرةٌ قديمةٌ «طازجةً أبدًا» ولا تتجدّد.
  assert.equal(isFresh({ at: now + 1 }, now), false);
  assert.equal(isFresh({ at: now + 10 * CACHE_TTL_MS }, now), false);
});

test('معدومةٌ أو بلا طابعٍ ⇒ ليست طازجة', () => {
  assert.equal(isFresh(null, 1), false);
  assert.equal(isFresh(undefined, 1), false);
  assert.equal(isFresh({}, 1), false);
  assert.equal(isFresh({ at: 'أمس' }, 1), false);
});

test('مدّةٌ مخصَّصةٌ تُحترم', () => {
  assert.equal(isFresh({ at: 900 }, 1000, 200), true);
  assert.equal(isFresh({ at: 700 }, 1000, 200), false);
});

/* ═══════════════════ الترشيح ═══════════════════ */

test('★ الافتراضُ يُخفي المؤرشفة — والغيابُ ليس أرشفة', () => {
  const live = selectItems(ITEMS, false);
  assert.equal(live.length, 2);
  assert.deepEqual(live.map((i) => i.sku), ['A-1', 'A-3'], 'A-3 بلا حقلٍ أصلًا فهو حيّ');
});

test('وبطلبِ المؤرشفة تعود كلُّها', () => {
  assert.equal(selectItems(ITEMS, true).length, 3);
});

test('★★ يُعيد نسخةً لا الأصل — فلا يُفسد المستدعي الذاكرةَ المشتركة', () => {
  const a = selectItems(ITEMS, true);
  a.push({ sku: 'دخيل' });
  assert.equal(ITEMS.length, 3, 'المصدرُ لم يُمسّ');
  assert.equal(selectItems(ITEMS, true).length, 3, 'والاستدعاءُ التالي نظيف');
});

test('مدخلٌ معدومٌ ⇒ قائمةٌ فارغة، لا انهيار', () => {
  assert.deepEqual(selectItems(null, false), []);
  assert.deepEqual(selectItems(undefined, true), []);
});

test('عنصرٌ معدومٌ داخل القائمة لا يُسقط الترشيح', () => {
  assert.doesNotThrow(() => selectItems([null, { sku: 'A' }, undefined], false));
  assert.equal(selectItems([null, { sku: 'A' }], false).length, 2);
});
