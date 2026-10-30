/**
 * التحديثُ التلقائيّ — الحارسُ الخالصُ يُختبَر في Node (بلا Tauri ولا شبكة).
 *
 * المسارُ الفعليُّ (check/downloadAndInstall) يحتاج محرّكَ Tauri حيًّا، فيُتحقَّق
 * في CI/الجهاز؛ وهنا نُثبت أنّ **الحارسَ** يمنع أيَّ محاولةٍ خارجَ المكتبيّ — فلا
 * يُحمَّل محرّكُ Tauri ولا يُكسر بناءُ الويب.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAutoUpdate } from './autoUpdate.js';

test('★★★ خارجَ البناء المكتبيّ (الويب/Node): لا يُحاول التحديثَ — not-desktop', async () => {
  // isDesktop()=false في Node (لا PUBLIC_IS_DESKTOP)، فيعود فورًا بلا استيراد الإضافة.
  const r = await runAutoUpdate();
  assert.deepEqual(r, { ok: false, reason: 'not-desktop' });
});

test('★ لا يرمي أبدًا، ولا يستدعي onStatus خارجَ المكتبيّ', async () => {
  let called = false;
  const r = await runAutoUpdate({ onStatus: () => { called = true; } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-desktop');
  assert.equal(called, false, 'لا إشعارَ خارجَ المكتبيّ');
});
