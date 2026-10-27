/**
 * قيمُ المحوَّل المحلّيّ — تشفيرٌ وفكٌّ وحلُّ القيم الخادميّة، بلا ساعةٍ تُقرأ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  joinPath,
  splitDocPath,
  genId,
  makeTimestamp,
  encodeValue,
  decodeValue,
  applyData,
  serverTimestampSentinel,
  incrementSentinel,
  arrayUnionSentinel,
  arrayRemoveSentinel,
  isSentinel,
  valueEquals,
} from './localValues.js';

const NOW = 1_700_000_000_000;
const now = () => NOW;

test('المسارات: الوصلُ يطوي الفراغَ والفواصلَ، والفصلُ يفرز المجموعةَ والمعرّف', () => {
  assert.equal(joinPath(['users', 'abc']), 'users/abc');
  assert.equal(joinPath(['vehicles', '', null, 'x']), 'vehicles/x');
  assert.equal(joinPath(['a/b/', '/c']), 'a/b/c');
  assert.deepEqual(splitDocPath('users/abc'), { col: 'users', id: 'abc', path: 'users/abc' });
  assert.deepEqual(splitDocPath('a/b/c/d'), { col: 'a/b/c', id: 'd', path: 'a/b/c/d' });
});

test('المعرّفُ التلقائيُّ عشرون حرفًا من أبجديّةٍ آمنة', () => {
  const id = genId(() => 0.5);
  assert.equal(id.length, 20);
  assert.match(id, /^[A-Za-z0-9]{20}$/);
});

test('★ الطابعُ الزمنيُّ يدور كاملًا: Timestamp ⟵ {__ts__} ⟵ Timestamp', () => {
  const ts = makeTimestamp(NOW);
  const enc = encodeValue({ at: ts, n: 5, who: 'ali' });
  assert.deepEqual(enc, { at: { __ts__: new Date(NOW).toISOString() }, n: 5, who: 'ali' });

  const dec = decodeValue(enc);
  assert.equal(typeof dec.at.toDate, 'function');
  assert.equal(dec.at.toMillis(), NOW);
  assert.equal(dec.n, 5);
});

test('التشفيرُ ينزل في المصفوفات والكائنات المتداخلة', () => {
  const enc = encodeValue({ list: [makeTimestamp(0), { deep: makeTimestamp(1000) }] });
  assert.equal(enc.list[0].__ts__, new Date(0).toISOString());
  assert.equal(enc.list[1].deep.__ts__, new Date(1000).toISOString());
});

test('القيمُ الخادميّة تُعرَف وتُساوى بالقيمة', () => {
  assert.ok(isSentinel(serverTimestampSentinel()));
  assert.ok(isSentinel(incrementSentinel(3)));
  assert.ok(!isSentinel({ plain: 1 }));
  assert.ok(valueEquals(makeTimestamp(10), makeTimestamp(10)), 'طابعان متساويان بالقيمة');
  assert.ok(!valueEquals(1, '1'));
  assert.ok(valueEquals({ a: 1, b: 2 }, { b: 2, a: 1 }), '★ ترتيبُ المفاتيح لا يُفرّق (#7)');
});

test('★★ applyData على أساسٍ فارغ: الكتابةُ الكاملة تحلّ القيمَ على الصفر/الآن', () => {
  const out = applyData(
    {},
    { count: incrementSentinel(5), at: serverTimestampSentinel(), tags: arrayUnionSentinel(['a', 'b']) },
    { now }
  );
  assert.equal(out.count, 5, 'increment على غير الموجود = n');
  assert.equal(out.at.toMillis(), NOW, 'serverTimestamp = الآن المحقون');
  assert.deepEqual(out.tags, ['a', 'b']);
});

test('★★ applyData بالدمج: increment يضيف، arrayUnion يُزيل التكرار، arrayRemove يحذف', () => {
  const base = { count: 10, tags: ['a', 'b'] };
  const merged = applyData(
    base,
    { count: incrementSentinel(3), tags: arrayUnionSentinel(['b', 'c']) },
    { now }
  );
  assert.equal(merged.count, 13);
  assert.deepEqual(merged.tags, ['a', 'b', 'c'], 'b لا يتكرّر');

  const removed = applyData(base, { tags: arrayRemoveSentinel(['a']) }, { now });
  assert.deepEqual(removed.tags, ['b']);
  assert.deepEqual(base.tags, ['a', 'b'], '★ الأصلُ لا يُمسّ (نسخٌ لا تعديلٌ في مكانه)');
});

test('★ مفتاحُ المسار بالنقاط يصل حقلًا متداخلًا دون دهس إخوته', () => {
  const out = applyData({ profile: { name: 'ali', age: 9 } }, { 'profile.age': 10 }, { now });
  assert.deepEqual(out.profile, { name: 'ali', age: 10 });
});

test('الدمجُ العميقُ للكائنات لا يستبدلها كاملةً (deep)', () => {
  const out = applyData({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } }, { now });
  assert.deepEqual(out.a, { x: 1, y: 3, z: 4 });
});

test('★ deep:false يستبدل الخريطةَ المتداخلةَ كاملةً (updateDoc · #3)', () => {
  const replaced = applyData({ s: { theme: 'dark', lang: 'ar', size: 12 } }, { s: { theme: 'light' } }, { now, deep: false });
  assert.deepEqual(replaced.s, { theme: 'light' }, 'lang/size سقطتا — استبدالٌ لا دمج');
  const partial = applyData({ s: { theme: 'dark', lang: 'ar' } }, { 's.theme': 'light' }, { now, deep: false });
  assert.deepEqual(partial.s, { theme: 'light', lang: 'ar' }, 'المسارُ بالنقاط يبقى دمجًا جزئيًّا');
});

test('★ قيمةٌ خادميّةٌ داخل مصفوفةٍ تُرفَض لا تُخزَّن حرفيًّا (#8)', () => {
  assert.throws(() => applyData({}, { items: [incrementSentinel(5)] }, { now }), /داخل مصفوفة/);
  assert.throws(() => applyData({}, { items: [{ x: serverTimestampSentinel() }] }, { now }), /داخل مصفوفة/);
});
