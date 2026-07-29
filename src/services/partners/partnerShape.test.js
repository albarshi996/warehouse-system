/**
 * اختبارات تشكيل شريك الأعمال + حارس توأمة الموردين والعملاء.
 *
 * تتحقّق من: الأرقام تُقسَر والنصوص تُشذَّب والفارغ يُسقَط · الهوية والاسم والحالة
 * لا يشكّلها هذا الملف (تُعالَج في الخدمة) · والموردون والعملاء **توأمان**:
 * نفس مجموعة الحقول تمامًا — فلا تنحرف نسخةٌ عن أختها.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shapeImportedPartner, SHAPED_PARTNER_FIELDS } from './partnerShape.js';
import { DATASETS } from '../excel/excelSchema.js';

test('التشكيل: يقسر الأرقام ويشذّب النصوص ويُسقط الفارغ', () => {
  const out = shapeImportedPartner({
    code: 'S1',           // يُعالَج في الخدمة — لا يُشكَّل هنا
    nameAr: 'مورّد',      // كذلك
    status: 'نشط',        // كذلك
    phone: '  0912  ',
    accountBalance: '1500',
    openOrders: '',       // فارغ — يُسقَط
    creditLimit: 'abc',   // غير رقم → 0
  });
  assert.equal(out.phone, '0912');
  assert.equal(out.accountBalance, 1500);
  assert.equal(out.creditLimit, 0);
  assert.ok(!('openOrders' in out));
  assert.ok(!('code' in out));
  assert.ok(!('nameAr' in out));
  assert.ok(!('status' in out));
});

test('الحقول المُشكَّلة تستبعد الهوية والاسم والحالة', () => {
  assert.ok(!SHAPED_PARTNER_FIELDS.includes('code'));
  assert.ok(!SHAPED_PARTNER_FIELDS.includes('nameAr'));
  assert.ok(!SHAPED_PARTNER_FIELDS.includes('status'));
  assert.ok(SHAPED_PARTNER_FIELDS.includes('accountBalance'));
  assert.ok(SHAPED_PARTNER_FIELDS.includes('phone'));
});

test('توأمة: الموردون والعملاء لهما نفس مجموعة الحقول تمامًا', () => {
  const supFields = DATASETS.suppliers.columns.map((c) => c.field).sort();
  const cusFields = DATASETS.customers.columns.map((c) => c.field).sort();
  assert.deepEqual(supFields, cusFields);
  // والأنواع متطابقة حقلًا حقلًا
  const supType = Object.fromEntries(DATASETS.suppliers.columns.map((c) => [c.field, c.type]));
  const cusType = Object.fromEntries(DATASETS.customers.columns.map((c) => [c.field, c.type]));
  assert.deepEqual(supType, cusType);
});

test('النموذج يحمل أعمدة «موردين v.xlsx» الثمانية الأصلية', () => {
  const fields = DATASETS.suppliers.columns.map((c) => c.field);
  for (const f of ['code', 'nameAr', 'contactPerson', 'phone', 'email', 'accountBalance', 'openOrders', 'openDeliveries']) {
    assert.ok(fields.includes(f), `العمود ${f} مفقود`);
  }
});
