/**
 * مخزنُ المحلّ الفعّال — الافتراضُ `null`، الضبطُ والبثّ، وصمودُ التخزين.
 * يُبرهَن في Node (بلا `window`) عبر مسارِ المستمعين في الذاكرة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getActiveShop,
  setActiveShop,
  subscribeActiveShop,
  ACTIVE_SHOP_KEY,
} from './shopStore.js';

test('الافتراضُ null = كلُّ المحلّات', () => {
  setActiveShop(null);
  assert.equal(getActiveShop(), null);
});

test('الضبطُ والقراءةُ ذهابًا وإيابًا', () => {
  setActiveShop('S1');
  assert.equal(getActiveShop(), 'S1');
  setActiveShop('S2');
  assert.equal(getActiveShop(), 'S2');
});

test('الفارغُ يُطبَّع إلى null (كلُّ المحلّات)', () => {
  setActiveShop('S1');
  assert.equal(setActiveShop('   '), null);
  assert.equal(getActiveShop(), null);
  assert.equal(setActiveShop(''), null);
});

test('الاشتراكُ يُنادى عند التغيّر، والإلغاءُ يوقفه', () => {
  setActiveShop(null);
  const seen = [];
  const off = subscribeActiveShop((s) => seen.push(s));
  setActiveShop('S7');
  setActiveShop('S8');
  off();
  setActiveShop('S9'); // بعد الإلغاء: لا يُسجَّل
  assert.deepEqual(seen, ['S7', 'S8']);
});

test('مستمعٌ يرمي لا يُسقط البقيّة', () => {
  setActiveShop(null);
  const seen = [];
  const offBad = subscribeActiveShop(() => {
    throw new Error('مستمعٌ معطوب');
  });
  const offGood = subscribeActiveShop((s) => seen.push(s));
  assert.doesNotThrow(() => setActiveShop('S3'));
  assert.deepEqual(seen, ['S3']);
  offBad();
  offGood();
});

test('صمودُ التخزين: localStorage يرمي ⟵ احتياطيٌّ في الذاكرة', () => {
  const thrower = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  globalThis.localStorage = thrower;
  try {
    assert.doesNotThrow(() => setActiveShop('S4'));
    assert.equal(getActiveShop(), 'S4', 'القيمةُ من الاحتياطيّ في الذاكرة');
  } finally {
    delete globalThis.localStorage;
    setActiveShop(null);
  }
});

test('ثابتا المفتاح معلنان', () => {
  assert.equal(ACTIVE_SHOP_KEY, 'bz.activeShop');
});
