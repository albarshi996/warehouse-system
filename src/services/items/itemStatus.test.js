/**
 * اختبار تحويل عمود «الحالة» في الشيت إلى `archived`.
 * منطق خالص، ونستورده من مصدره دون لمس Firebase (`normalizeStatus` لا تعتمد
 * على الشبكة — لكن `itemService.js` يستورد config/firebase، فننسخ المنطق
 * هنا؟ لا: نُبقيه في مصدره ونستورده عبر مسار لا يمسّ Firebase.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatus } from './itemStatus.js';

test('«موقوف» وأخواتها تُؤرشف الصنف', () => {
  for (const w of ['موقوف', 'متوقف', 'غير نشط', 'ملغي', 'مؤرشف', 'inactive', 'archived', 'disabled', 'no', 'false', '0']) {
    assert.equal(normalizeStatus(w), true, `«${w}» يجب أن تُؤرشف`);
  }
});

test('«نشط» وأخواتها تُبقيه عاملًا', () => {
  for (const w of ['نشط', 'active', 'yes', 'true', '1', 'عامل']) {
    assert.equal(normalizeStatus(w), false, `«${w}» يجب أن يبقى نشطًا`);
  }
});

test('🚨 الفارغ = نشط — وإلا أوقف شيتٌ ناقص العمود الكتالوجَ كلّه', () => {
  assert.equal(normalizeStatus(''), false);
  assert.equal(normalizeStatus(null), false);
  assert.equal(normalizeStatus(undefined), false);
  assert.equal(normalizeStatus('   '), false);
});

test('لا يتأثّر بحالة الأحرف ولا بالمسافات', () => {
  assert.equal(normalizeStatus('  INACTIVE  '), true);
  assert.equal(normalizeStatus(' موقوف '), true);
});
