/**
 * اختبارات «زرّ الرجوع يُغلق الطبقة»:
 *   - فتح الطبقة يُسجّل مدخلًا في التاريخ، والرجوع يُغلقها ولا يغادر الصفحة.
 *   - الطبقات المتراكمة تُغلق من الأعلى إلى الأسفل، وقفزةٌ واحدة للأسفل
 *     تُغلق ما فوقها كلَّه (فلا تبقى شاشةٌ معلّقة).
 *   - الإغلاق بالزرّ يستهلك مدخل التاريخ فلا يتراكم فيه ما لا يقابله شيء.
 *
 * تُختبر بتاريخٍ وهميّ في Node — الوحدة مبنيّة على بيئةٍ مُمرَّرة لهذا الغرض.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOverlayHistory, OVERLAY_KEY } from './overlayHistory.js';

/** تاريخ متصفّح مصغَّر: مكدّس حالات + إطلاق `popstate` عند الرجوع. */
function fakeEnv() {
  const entries = [null];
  let at = 0;
  const listeners = [];
  return {
    entries,
    get index() {
      return at;
    },
    history: {
      get state() {
        return entries[at];
      },
      pushState(state) {
        entries.splice(at + 1);
        entries.push(state);
        at = entries.length - 1;
      },
      go(delta) {
        at = Math.max(0, Math.min(entries.length - 1, at + delta));
        listeners.forEach((fn) => fn({ state: entries[at] }));
      },
    },
    addEventListener(type, fn) {
      if (type === 'popstate') listeners.push(fn);
    },
    /** ما يفعله المستخدم بزرّ الرجوع (أو زرّ الهاتف). */
    back() {
      this.history.go(-1);
    },
  };
}

test('فتح طبقة يُسجّل مدخلًا في التاريخ بالعنوان نفسه', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  oh.open(() => {}, 'present');
  assert.equal(env.entries.length, 2);
  assert.ok(env.entries[1][OVERLAY_KEY].startsWith('present#'));
  assert.equal(oh.size(), 1);
});

test('زرّ الرجوع يُغلق الطبقة ولا يغادر الصفحة', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  let closed = 0;
  oh.open(() => { closed += 1; }, 'present');

  env.back();

  assert.equal(closed, 1);
  assert.equal(oh.size(), 0);
  assert.equal(env.index, 0); // عُدنا لمدخل الصفحة نفسه — لا تنقّل
});

test('طبقتان: الرجوع يُغلق العليا وحدها', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  const order = [];
  oh.open(() => order.push('present'), 'present');
  oh.open(() => order.push('dialog'), 'dialog');

  env.back();
  assert.deepEqual(order, ['dialog']);
  assert.equal(oh.size(), 1);

  env.back();
  assert.deepEqual(order, ['dialog', 'present']);
  assert.equal(oh.size(), 0);
});

test('قفزة واحدة تحت طبقتين تُغلقهما معًا من الأعلى للأسفل', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  const order = [];
  const bottom = oh.open(() => order.push('present'), 'present');
  oh.open(() => order.push('dialog'), 'dialog');

  oh.close(bottom); // إغلاق الطبقة السفلى بالزرّ

  assert.deepEqual(order, ['dialog', 'present']);
  assert.equal(oh.size(), 0);
  assert.equal(env.index, 0);
});

test('الإغلاق بالزرّ يستهلك مدخل التاريخ فلا يتراكم مدخلٌ ميّت', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  for (let i = 0; i < 3; i += 1) {
    const key = oh.open(() => {}, 'present');
    oh.close(key);
  }
  assert.equal(env.index, 0);
  assert.equal(oh.size(), 0);
});

test('إغلاق طبقة ليست مفتوحة يُعيد false — فتُخفيها الصفحة بنفسها', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  assert.equal(oh.close(null), false);
  assert.equal(oh.close('present#404'), false);
  assert.equal(env.index, 0);
});

test('طبقةٌ تعثّرت في إغلاقها لا تمنع إغلاق ما تحتها', () => {
  const env = fakeEnv();
  const oh = createOverlayHistory(env);
  let bottomClosed = false;
  const bottom = oh.open(() => { bottomClosed = true; }, 'present');
  oh.open(() => { throw new Error('تعذّر الإخفاء'); }, 'dialog');

  oh.close(bottom);
  assert.equal(bottomClosed, true);
  assert.equal(oh.size(), 0);
});

test('حالة التاريخ السابقة لا تُمحى — نُضيف مفتاحنا إليها', () => {
  const env = fakeEnv();
  env.entries[0] = { scroll: 120 };
  const oh = createOverlayHistory(env);
  oh.open(() => {}, 'present');
  assert.equal(env.entries[1].scroll, 120);
});
