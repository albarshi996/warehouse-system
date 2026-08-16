/**
 * اختبارات حالة المخزون — وأهمّها حارس ازدواج الحقيقة مع مواقع النظام.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STOCK_STATUS,
  STOCK_STATUSES,
  activeStatuses,
  isDefaultStatus,
  isSellableStatus,
  normalizeStockStatus,
  statusLocationCollisions,
  stockStatusLabel,
} from './stockStatus.js';
import { SYSTEM_LOCATIONS } from './locations.js';

test('🔒 ★★ لا قيمةَ حالةٍ تحمل اسم موقع نظام — وإلّا صار للحقيقة مصدران', () => {
  // صنفٌ في QUARANTINE بحالة OK: أيّهما يُصدَّق؟ هذا الحارس يمنع السؤال أصلًا.
  assert.deepEqual(statusLocationCollisions(), [], 'الحالة تصف ما يتعايش في الرفّ، والموقع يصف المرحلة');
  for (const code of Object.keys(SYSTEM_LOCATIONS)) {
    assert.ok(!Object.hasOwn(STOCK_STATUSES, code), `«${code}» موقعٌ فلا يصلح حالة`);
  }
});

test('★★ الترحيل صفرُ الأثر: الغائب والفارغ ⇒ OK ⇒ سلوك اليوم حرفيًّا', () => {
  assert.equal(normalizeStockStatus(undefined), 'OK');
  assert.equal(normalizeStockStatus(null), 'OK');
  assert.equal(normalizeStockStatus(''), 'OK');
  assert.equal(normalizeStockStatus('   '), 'OK');
  assert.equal(DEFAULT_STOCK_STATUS, 'OK');
  assert.ok(isDefaultStatus(undefined));
});

test('★★ المجهول يسقط إلى OK ولا يُرفض — حارسٌ يمنع ما يجب أن يمرّ أسوأ من الفجوة', () => {
  assert.equal(normalizeStockStatus('خرافة'), 'OK', 'قيمةٌ وصفيّة فاسدة لا توقف قيدًا صحيحًا');
  assert.equal(normalizeStockStatus('WHATEVER'), 'OK');
});

test('القيم المقترَحة معطَّلة حتى يعتمدها المالك (LOC-O02)', () => {
  assert.deepEqual(activeStatuses(), ['OK'], 'لا تُكتب قيمةٌ لم يُقرّها أحد');
  assert.equal(normalizeStockStatus('DAMAGED'), 'OK', 'المقترَح غير المفعَّل يسقط للافتراضيّ');
  assert.equal(STOCK_STATUSES.DAMAGED.active, false);
  assert.equal(STOCK_STATUSES.HOLD.sellable, false, 'ومعناها مثبَّتٌ جاهزًا للاعتماد');
});

test('التطبيع لا يبالي بالحالة الحرفيّة ولا بالفراغ الطرفيّ', () => {
  assert.equal(normalizeStockStatus(' ok '), 'OK');
  assert.equal(normalizeStockStatus('Ok'), 'OK');
});

test('الصرف والتسمية', () => {
  assert.equal(isSellableStatus('OK'), true);
  assert.equal(isSellableStatus(undefined), true, 'الغياب صالحٌ للصرف — سلوك اليوم');
  assert.equal(stockStatusLabel('OK'), 'سليم');
  assert.equal(stockStatusLabel('خرافة'), 'سليم');
});
