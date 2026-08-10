import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTECTION_POLICIES,
  DISPOSITIONS,
  expiryStatus,
  daysBetween,
  parseDay,
  policyFor,
  isConsignable,
  returnVerdict,
  dispositionFor,
  customerStockAlerts,
  customerStockSummary,
  policyVerdict,
} from './protectionModel.js';

const TODAY = '2026-08-10';

/* ═══════════ التواريخ والصلاحية ═══════════ */

test('قراءة اليوم بـUTC لا تتزحزح بالمنطقة الزمنيّة', () => {
  assert.equal(daysBetween('2026-08-01', '2026-08-10'), 9);
  assert.equal(parseDay('ليس تاريخًا'), null);
  assert.equal(daysBetween(null, TODAY), null);
});

test('حالة الصلاحية أربع لا اثنتان', () => {
  assert.equal(expiryStatus('2026-09-30', TODAY).status, 'valid');
  assert.equal(expiryStatus('2026-08-25', TODAY).status, 'near', 'داخل ٣٠ يومًا');
  assert.equal(expiryStatus('2026-08-01', TODAY).status, 'expired');
  assert.equal(expiryStatus('', TODAY).status, 'unknown');
  assert.equal(expiryStatus('2026-08-25', TODAY).daysLeft, 15);
});

/* ═══════════ اختيار السياسة ═══════════ */

test('سياسة الصنف تسبق سياسة الفئة تسبق الافتراضيّة', () => {
  const policies = {
    bySku: { A: { type: 'full_return' } },
    byCategory: { 'مستحضرات': { type: 'expired_only' } },
    default: { type: 'none' },
  };
  assert.equal(policyFor({ sku: 'a' }, policies).type, 'full_return', 'الصنف يفوز');
  assert.equal(policyFor({ sku: 'B', category: 'مستحضرات' }, policies).type, 'expired_only');
  assert.equal(policyFor({ sku: 'Z' }, policies).type, 'none');
});

test('الإيداع أمانةً لا يجوز إلّا لسياسةٍ تسمح به', () => {
  assert.equal(isConsignable({ type: 'none' }), false);
  assert.equal(isConsignable({ type: 'full_return' }), true);
  assert.equal(isConsignable({ type: 'until_expiry' }), true);
});

/* ═══════════ ★ المصير من الحال لا من السياسة ═══════════ */

test('★ حقّ الإرجاع الكامل لا يُعيد التالف إلى رفّ البيع', () => {
  const v = returnVerdict({
    policy: { type: 'full_return' },
    condition: 'تالف',
    expiry: '2027-01-01',
    asOf: TODAY,
  });
  assert.equal(v.allowed, true, 'يُقبل الاسترداد');
  assert.equal(v.disposition, DISPOSITIONS.scrap.id, 'ومصيره الإتلاف لا الرفّ');
});

test('★ المنتهي داخل الحماية يُستردّ ويُتلَف — لا يُباع ثانيةً', () => {
  const v = returnVerdict({
    policy: { type: 'until_expiry' },
    condition: 'منتهي',
    expiry: '2026-07-01',
    asOf: TODAY,
  });
  assert.equal(v.allowed, true);
  assert.equal(v.disposition, DISPOSITIONS.scrap.id);
  assert.match(v.reason, /الإتلاف لا الرفّ/);
});

test('السليم يعود للمخزون، والمقارب يُحجَز للفحص', () => {
  assert.equal(dispositionFor('سليم', 'valid'), DISPOSITIONS.restock.id);
  assert.equal(dispositionFor('سليم', 'near'), DISPOSITIONS.inspect.id, 'المقارب لا يُعاد بلا فحص');
  assert.equal(dispositionFor('ناقص', 'valid'), DISPOSITIONS.inspect.id);
  assert.equal(dispositionFor('حالٌ غريب', 'valid'), DISPOSITIONS.inspect.id, 'المجهول لا يعود للرفّ');
});

/* ═══════════ السياسات الستّ ═══════════ */

test('«لا إرجاع» يمنع ويطلب اعتماد المشرف للاستثناء', () => {
  const v = returnVerdict({ policy: { type: 'none' }, condition: 'سليم', asOf: TODAY });
  assert.equal(v.allowed, false);
  assert.equal(v.needsApproval, true);
  assert.match(v.reason, /بيعٌ قاطع/);
});

test('«المنتهي فقط» يرفض السليم ويقبل المنتهي والمقارب', () => {
  const base = { policy: { type: 'expired_only' }, asOf: TODAY };
  assert.equal(returnVerdict({ ...base, condition: 'سليم', expiry: '2027-01-01' }).allowed, false);
  assert.equal(returnVerdict({ ...base, condition: 'منتهي', expiry: '2026-07-01' }).allowed, true);
  assert.equal(returnVerdict({ ...base, condition: 'سليم', expiry: '2026-08-20' }).allowed, true, 'المقارب مقبول');
});

test('«حماية ٩٠ يومًا» تُقاس من تاريخ التسليم', () => {
  const p = { type: 'window_days', windowDays: 90 };
  const inside = returnVerdict({ policy: p, condition: 'سليم', deliveredOn: '2026-06-01', asOf: TODAY, expiry: '2027-01-01' });
  assert.equal(inside.allowed, true);
  assert.equal(inside.daysSinceDelivery, 70);

  const outside = returnVerdict({ policy: p, condition: 'سليم', deliveredOn: '2026-01-01', asOf: TODAY, expiry: '2027-01-01' });
  assert.equal(outside.allowed, false);
  assert.match(outside.reason, /انقضت نافذة الحماية/);
});

test('«حماية بمدّة» بلا تاريخ تسليم أو بلا مدّة تُرفض بسببٍ مكتوب', () => {
  assert.match(returnVerdict({ policy: { type: 'window_days' }, condition: 'سليم', asOf: TODAY }).reason, /غير محدّدة/);
  assert.match(
    returnVerdict({ policy: { type: 'window_days', windowDays: 90 }, condition: 'سليم', asOf: TODAY }).reason,
    /لا تاريخ تسليم/
  );
});

test('«استبدال لا إرجاع» يُنتج مصير الاستبدال دائمًا', () => {
  const v = returnVerdict({ policy: { type: 'exchange_only' }, condition: 'سليم', asOf: TODAY, expiry: '2027-01-01' });
  assert.equal(v.allowed, true);
  assert.equal(v.disposition, DISPOSITIONS.exchange.id);
});

test('سياسة مجهولة لا تُقبل صامتةً', () => {
  const v = returnVerdict({ policy: { type: 'خيالية' }, condition: 'سليم', asOf: TODAY });
  assert.equal(v.allowed, false);
  assert.equal(v.needsApproval, true);
});

/* ═══════════ تنبيهات ما لدى العملاء ═══════════ */

const bal = (over = {}) => ({
  sku: 'A',
  customerCode: 'C-01',
  batch: 'B1',
  qty: 10,
  unitCost: 5,
  expiry: '2027-01-01',
  ...over,
});

test('التنبيهات تكشف المنتهي والمقارب عند العميل', () => {
  const rows = customerStockAlerts(
    [bal({ expiry: '2026-07-01' }), bal({ sku: 'B', expiry: '2026-08-20' }), bal({ sku: 'C', expiry: '2027-05-01' })],
    { default: { type: 'full_return' } },
    { asOf: TODAY }
  );
  assert.equal(rows.length, 2, 'الصالح لا يُنبَّه عليه');
  assert.equal(rows[0].expiryStatus, 'expired', 'الأخطر أوّلًا');
  assert.equal(rows[0].severity, 'high');
});

test('★ التنبيه ينقذ المال: نافذة حمايةٍ توشك على الانقضاء', () => {
  const rows = customerStockAlerts(
    [bal({ expiry: '2027-01-01' })],
    { default: { type: 'window_days', windowDays: 90 } },
    { asOf: TODAY, deliveredByKey: { 'A__C-01__B1': '2026-05-20' } }
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].flags.map((f) => f.text).join(' '), /تنقضي الحماية بعد/);
});

test('الملخّص يعدّ العملاء والقيمة والمخاطر', () => {
  const s = customerStockSummary(
    [bal({ expiry: '2026-07-01' }), bal({ customerCode: 'C-02', sku: 'B' })],
    { default: { type: 'full_return' } },
    { asOf: TODAY }
  );
  assert.equal(s.customers, 2);
  assert.equal(s.lines, 2);
  assert.equal(s.totalQty, 20);
  assert.equal(s.totalValue, 100);
  assert.equal(s.expired, 1);
  assert.equal(s.high, 1);
});

test('تعريف السياسة يُحرَس قبل الحفظ', () => {
  assert.equal(policyVerdict({ type: 'window_days' }).ok, false);
  assert.equal(policyVerdict({ type: 'window_days', windowDays: 90 }).ok, true);
  assert.equal(policyVerdict({ type: 'until_expiry', graceDays: 30 }).ok, true);
  assert.equal(policyVerdict({ type: 'لا-شيء' }).ok, false);
  assert.ok(Object.keys(PROTECTION_POLICIES).length === 6);
});
