/**
 * عرضُ حالة التحديث — الحارسُ الخالصُ يُختبَر في Node (بلا Tauri ولا React).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeUpdate, UPDATE_PHASES } from './updateView.js';

test('idle/افتراضيّ: زرُّ الفحص، غيرُ منشغلٍ، نبرةٌ محايدة', () => {
  const a = describeUpdate({ phase: 'idle' });
  assert.equal(a.title, 'فحص التحديثات');
  assert.equal(a.busy, false);
  assert.equal(a.tone, 'idle');
  assert.equal(a.icon, 'refresh');
  // غيابُ الطور يُعامَل معاملةَ idle
  assert.deepEqual(describeUpdate(), describeUpdate({ phase: 'idle' }));
  assert.deepEqual(describeUpdate({ phase: 'مجهول' }), describeUpdate({ phase: 'idle' }));
});

test('checking: منشغلٌ بنبرة info', () => {
  const a = describeUpdate({ phase: 'checking' });
  assert.equal(a.busy, true);
  assert.equal(a.tone, 'info');
  assert.equal(a.icon, 'spin');
});

test('available/downloading: يُظهران الإصدارَ ونبرةَ العمل', () => {
  const a = describeUpdate({ phase: 'available', version: '1.0.9' });
  assert.ok(a.title.includes('1.0.9'));
  assert.equal(a.busy, true);
  assert.equal(a.icon, 'down');
  const b = describeUpdate({ phase: 'downloading', version: '1.0.9' });
  assert.ok(b.title.includes('1.0.9'));
  assert.equal(b.busy, true);
});

test('installed: إتمامٌ مع إعادة تشغيل (success, منشغل)', () => {
  const a = describeUpdate({ phase: 'installed' });
  assert.equal(a.tone, 'success');
  assert.equal(a.icon, 'check');
  assert.equal(a.busy, true);
  assert.ok(a.detail.includes('إعادة') || a.detail.includes('تشغيل'));
});

test('★ updated (بعد إعادة التشغيل): رسالةُ اكتمالٍ بالإصدار، غيرُ منشغل', () => {
  const a = describeUpdate({ phase: 'updated', version: '1.0.9' });
  assert.equal(a.tone, 'success');
  assert.equal(a.busy, false);
  assert.ok(a.title.includes('1.0.9'));
  assert.ok(a.detail.includes('بنجاح'));
});

test('uptodate: تأكيدٌ أنّه على الأحدث', () => {
  const a = describeUpdate({ phase: 'uptodate' });
  assert.equal(a.tone, 'success');
  assert.equal(a.busy, false);
});

test('★ failed: نبرةُ تحذيرٍ (أحمر) وتُظهر سببَ الخطأ إن وُجد', () => {
  const a = describeUpdate({ phase: 'failed', error: 'لا اتصال' });
  assert.equal(a.tone, 'warn');
  assert.equal(a.icon, 'warn');
  assert.equal(a.busy, false);
  assert.equal(a.detail, 'لا اتصال');
  // بلا رسالةِ خطأٍ: نصٌّ افتراضيّ
  assert.ok(describeUpdate({ phase: 'failed' }).detail.length > 0);
});

test('كلُّ الأطوار المعلنة تُنتج عرضًا صالحًا', () => {
  for (const p of UPDATE_PHASES) {
    const a = describeUpdate({ phase: p });
    assert.equal(typeof a.title, 'string');
    assert.ok(a.title.length > 0, `title فارغ للطور ${p}`);
    assert.equal(typeof a.busy, 'boolean');
    assert.ok(['idle', 'info', 'success', 'warn'].includes(a.tone));
  }
});
