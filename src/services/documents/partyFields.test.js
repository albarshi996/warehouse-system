/**
 * حارس حقول الطرف (SAP-20 · طلب المالك) — قبل أيّ واجهة (§22 ‹995›).
 *
 * البوّابة طلب المالك حرفيًّا: الطرف يُختار من قوائم النظام «من الذين تمّ
 * إنشاؤهم»، و`***` تعرض القائمة، والبحث سهل — والاختيار يملأ الرمز والاسم
 * معًا فلا يفترقان (الشقّ الحيّ من ف‑٤٤).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTY_FIELDS,
  partyFieldFor,
  partyOptions,
  filterPartyOptions,
  applyPartySelection,
} from './partyFields.js';

test('★★ الإعلان يغطّي حقول الطرف الأربعة التي طلبها المالك — وقرائنها', () => {
  for (const key of ['supplier', 'supplierCode', 'customer', 'customerCode', 'warehouse', 'repName']) {
    assert.ok(partyFieldFor(key), `«${key}» حقل طرفٍ معلَن`);
  }
  assert.equal(partyFieldFor('supplierCode').nameKey, 'supplier', 'الرمز قرينه الاسم');
  assert.equal(partyFieldFor('notes'), null, 'وغير الطرف لا يُمسّ');
});

test('★ الخيارات من الماسترات — والمؤرشف لا يُعرض لمستندٍ جديد', () => {
  const lists = {
    suppliers: [
      { code: 'ACME', nameAr: 'أكمي' },
      { code: 'OLD', nameAr: 'مؤرشف', archived: true },
    ],
    customers: [{ code: 'C1', nameAr: 'عميل ليبيا' }],
    warehouses: [{ code: 'E5', nameAr: 'المستودع الرئيسي' }],
    reps: [
      { name: 'سالم', role: 'sales_rep', active: true },
      { name: 'موقوف', role: 'sales_rep', active: false },
      { name: 'مدير', role: 'admin' },
    ],
    vehicles: [{ plate: '12-3456', model: 'هايس' }],
  };
  assert.deepEqual(partyOptions('supplier', lists), [{ code: 'ACME', name: 'أكمي' }]);
  assert.deepEqual(partyOptions('customer', lists), [{ code: 'C1', name: 'عميل ليبيا' }]);
  assert.deepEqual(partyOptions('warehouse', lists), [{ code: 'E5', name: 'المستودع الرئيسي' }]);
  assert.deepEqual(partyOptions('rep', lists), [{ code: 'سالم', name: 'سالم' }], 'المندوب النشط وحده');
  assert.deepEqual(partyOptions('vehicle', lists), [{ code: '12-3456', name: 'هايس' }]);
  assert.deepEqual(partyOptions('bogus', lists), []);
});

test('★★ طلب المالك: `***` تعرض القائمة كلّها، والبحث احتواءٌ بالرمز أو الاسم', () => {
  const options = [
    { code: 'ACME', name: 'شركة أكمي' },
    { code: 'BETA', name: 'مورّد بيتا' },
  ];
  assert.equal(filterPartyOptions(options, '***').length, 2);
  assert.equal(filterPartyOptions(options, '*').length, 2);
  assert.equal(filterPartyOptions(options, '').length, 2, 'والتركيز وحده يفتح القائمة');
  assert.deepEqual(filterPartyOptions(options, 'بيتا').map((o) => o.code), ['BETA']);
  assert.deepEqual(filterPartyOptions(options, 'acm').map((o) => o.code), ['ACME']);
  assert.equal(filterPartyOptions(options, 'xyz').length, 0);
});

test('القائمة الطويلة تُقصّ بحدٍّ معلَن — لا إغراق للشاشة', () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ code: `S${i}`, name: `مورد ${i}` }));
  assert.equal(filterPartyOptions(many, '*').length, 30);
  assert.equal(filterPartyOptions(many, '*', 10).length, 10);
});

test('★★ ف‑٤٤: الاختيار يملأ الرمز والاسم معًا — لا اسمٌ بلا رمز', () => {
  const patches = applyPartySelection('supplier', { code: 'ACME', name: 'أكمي' });
  assert.deepEqual(patches, [
    { key: 'supplierCode', value: 'ACME' },
    { key: 'supplier', value: 'أكمي' },
  ]);
  // ومن حقل الرمز نفس الأثر — قرينان لا حقلان مستقلّان.
  assert.deepEqual(applyPartySelection('supplierCode', { code: 'ACME', name: 'أكمي' }), patches);
});

test('حقل المخزن قيمةٌ واحدة، وغير المعلَن لا يُنتج تحديثًا', () => {
  assert.deepEqual(applyPartySelection('toWarehouse', { code: 'E2', name: 'فرع' }), [
    { key: 'toWarehouse', value: 'E2' },
  ]);
  assert.deepEqual(applyPartySelection('notes', { code: 'x' }), []);
  assert.deepEqual(applyPartySelection('supplier', null), []);
});

test('كلّ إعلانٍ سليم البنية: مصدرٌ ومفتاح رمزٍ على الأقل', () => {
  for (const [key, decl] of Object.entries(PARTY_FIELDS)) {
    assert.ok(decl.source, key);
    assert.ok(decl.codeKey, key);
  }
});
