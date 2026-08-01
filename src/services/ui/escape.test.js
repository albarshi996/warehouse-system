/** اختبارات المُهرِّب الموحّد (المحور ٤ — إغلاق XSS). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esc, escAttr, escJsAttr, escMultiline } from './escape.js';

test('esc: يبطل حقن الوسوم والسمات', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('escAttr: يهرّب المفردة والخط المائل الخلفي فوق esc', () => {
  assert.equal(escAttr(`' onmouseover='alert(1)`), '&#39; onmouseover=&#39;alert(1)');
  assert.equal(escAttr('`x`'), '&#96;x&#96;');
});

test('escJsAttr: تهريب مزدوج (JS ثم HTML) لمعالِج مضمّن', () => {
  const out = escJsAttr(`'); alert(1); ('`);
  assert.ok(!out.includes("');")); // لم يعد يكسر سلسلة JS
  assert.ok(!out.includes('<'));
});

test('escMultiline: أسطر إلى فقرات مهرَّبة', () => {
  assert.equal(escMultiline('a\n<b>'), '<p>a</p><p>&lt;b&gt;</p>');
  assert.equal(escMultiline('   \n  '), '');
});
