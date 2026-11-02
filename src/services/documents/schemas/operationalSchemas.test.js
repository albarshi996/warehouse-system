/**
 * اختبارات مخطّطات التشغيل (س): نقل/تاكسي · عمالة · نظافة — التحذيراتُ تمنع
 * الصفرَ وتطلب توثيقَ الواقعة، والأدوارُ تفصل من يصرف عمّن يعتمد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import taxi, { taxiWarnings } from './taxi.js';
import labor, { laborWarnings } from './labor.js';
import clean, { cleanWarnings } from './clean.js';

test('★ التحذيراتُ تمنع قيمةً صفرًا وتطلب توثيقَ الواقعة', () => {
  assert.ok(taxiWarnings({ header: { amount: 0, purpose: 'سوق' } }).some((w) => /صفر/.test(w)));
  assert.ok(taxiWarnings({ header: { amount: 5 } }).some((w) => /الغرض|المسار/.test(w)));
  assert.deepEqual(taxiWarnings({ header: { amount: 5, purpose: 'توريد' } }), []);

  assert.ok(laborWarnings({ header: { amount: 0, task: 'تحميل' } }).some((w) => /صفر/.test(w)));
  assert.ok(laborWarnings({ header: { amount: 5 } }).some((w) => /العمل|الطاقم/.test(w)));
  assert.deepEqual(laborWarnings({ header: { amount: 5, task: 'تحميل' } }), []);

  assert.ok(cleanWarnings({ header: { amount: 0, area: 'المخزن' } }).some((w) => /صفر/.test(w)));
  assert.ok(cleanWarnings({ header: { amount: 5 } }).some((w) => /الجهة|المكان/.test(w)));
  assert.deepEqual(cleanWarnings({ header: { amount: 5, provider: 'شركة' } }), []);
});

test('★★ الأدوارُ تفصل: المالية تعتمد، والخزينةُ تُنفّذ ولا تعتمد', () => {
  for (const s of [taxi, labor, clean]) {
    assert.ok(s.roles.create.length && s.roles.approve.length && s.roles.complete.length, `${s.type}: أدوارٌ ناقصة`);
    assert.ok(s.roles.approve.includes('finance_manager') && !s.roles.approve.includes('treasury'), `${s.type}`);
    assert.ok(s.roles.complete.includes('treasury'), `${s.type}: الخزينةُ تُنفّذ`);
    assert.equal(s.signatures.length, 3, `${s.type}: ثلاثُ خاناتِ توقيع`);
    assert.ok(typeof s.warnings === 'function');
  }
});
