/** اختبارات ترقيم الصفحات الخالص (المحور ٧). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clampPage, pageCount, pageSlice, pageInfo } from './pagination.js';

test('pageCount: ١ على الأقلّ ولو فارغًا', () => {
  assert.equal(pageCount(0, 50), 1);
  assert.equal(pageCount(50, 50), 1);
  assert.equal(pageCount(51, 50), 2);
  assert.equal(pageCount(243, 50), 5);
});

test('clampPage: يحصر في المدى الصحيح', () => {
  assert.equal(clampPage(-3, 243, 50), 0);
  assert.equal(clampPage(99, 243, 50), 4); // آخر صفحة
  assert.equal(clampPage(2, 243, 50), 2);
  assert.equal(clampPage(NaN, 243, 50), 0);
});

test('pageSlice: يعيد شريحة الصفحة الصحيحة', () => {
  const items = Array.from({ length: 243 }, (_, i) => i);
  assert.deepEqual(pageSlice(items, 0, 50)[0], 0);
  assert.equal(pageSlice(items, 0, 50).length, 50);
  assert.deepEqual(pageSlice(items, 4, 50), [200, 201, 202, /* … */ ...items.slice(203, 243)]);
  assert.equal(pageSlice(items, 4, 50).length, 43); // آخر صفحة ناقصة
  assert.equal(pageSlice(items, 99, 50).length, 43); // صفحة خارج المدى ⇒ تُحصر لآخر صفحة
  assert.deepEqual(pageSlice(null, 0, 50), []);
});

test('pageInfo: تسمية «from–to / total» صحيحة', () => {
  const a = pageInfo(243, 0, 50);
  assert.equal(a.label, '1–50 / 243');
  assert.equal(a.hasPrev, false);
  assert.equal(a.hasNext, true);
  assert.equal(a.pages, 5);

  const b = pageInfo(243, 4, 50);
  assert.equal(b.label, '201–243 / 243');
  assert.equal(b.hasNext, false);
  assert.equal(b.hasPrev, true);
});

test('pageInfo: القائمة الفارغة تعطي 0–0 / 0 بلا تنقّل', () => {
  const e = pageInfo(0, 0, 50);
  assert.equal(e.label, '0–0 / 0');
  assert.equal(e.hasPrev, false);
  assert.equal(e.hasNext, false);
  assert.equal(e.from, 0);
  assert.equal(e.to, 0);
});
