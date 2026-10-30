/**
 * رايةُ المنصّة — القرارُ الخالصُ يُختبَر بلا بيئة بناء.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isDesktopFrom } from './platform.js';

test('isDesktopFrom: الرايةُ النصّيّةُ "true" وحدَها تعني مكتبيًّا', () => {
  assert.equal(isDesktopFrom({ PUBLIC_IS_DESKTOP: 'true' }), true);
  assert.equal(isDesktopFrom({ PUBLIC_IS_DESKTOP: 'false' }), false);
  assert.equal(isDesktopFrom({}), false, 'الويبُ (بلا راية) ليس مكتبيًّا');
  assert.equal(isDesktopFrom(undefined), false, 'بلا بيئةٍ لا يتعطّل');
  assert.equal(isDesktopFrom(null), false);
  assert.equal(isDesktopFrom({ PUBLIC_IS_DESKTOP: true }), false, 'منطقيٌّ لا نصٌّ ⟵ لا يُعدّ مكتبيًّا');
});
