/**
 * حارس سياسة المخزون ‹FNB-202›.
 *
 * أخطر ما يحرسه ثلاثة: **الوراثة حقلًا حقلًا** (فرعٌ حدّد سقفًا وحده يرث
 * بقيّته من برانده — والدمج الكائنيّ كان سيُلغي سياسة البراند بلا قصد)،
 * و**الترحيل صفر الأثر** (بلا سياسةٍ لا يتغيّر رقم)، و**أيّام التغطية بندٌ
 * مستقلّ** عن مخزون الأمان لا مرادفٌ له.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLICY, POLICY_SCOPES, policyId, shapePolicy, policyProblems,
  indexPolicies, policyFor, policyGaps,
} from './stockPolicy.js';

const DIMS = { branch: 'BR01', brand: 'BRD1', sector: 'FNB' };

test('★★ الترحيل صفر الأثر: بلا سياسةٍ واحدة تُعاد القيم الافتراضيّة — سلوك اليوم', () => {
  const p = policyFor(indexPolicies([]), 'CHICKEN', DIMS);
  assert.equal(p.leadDays, DEFAULT_POLICY.leadDays);
  assert.equal(p.safetyDays, DEFAULT_POLICY.safetyDays);
  assert.equal(p.parLevel, 0);
  assert.ok(Object.values(p.sources).every((s) => s === 'default'));
});

test('المعرّف حتميّ: إعادة الإدخال تحديثٌ لا تكرار — والناقص يُعاد null', () => {
  assert.equal(policyId({ scope: 'branch', scopeCode: 'br01', sku: 'chicken' }), 'BRANCH__BR01__CHICKEN');
  assert.equal(policyId({ scope: 'branch', sku: 'CHICKEN' }), null);
  assert.equal(policyId({ scope: 'default', scopeCode: 'X', sku: 'Y' }), null);
  assert.deepEqual(POLICY_SCOPES, ['branch', 'brand', 'sector', 'default']);
});

test('★ الوراثة حقلًا حقلًا: الفرع يحدّد سقفه ويرث مهلته من برانده وأمانه من قطاعه', () => {
  const index = indexPolicies([
    { scope: 'sector', scopeCode: 'FNB', sku: 'CHICKEN', safetyDays: 10 },
    { scope: 'brand', scopeCode: 'BRD1', sku: 'CHICKEN', leadDays: 5, safetyDays: 8 },
    { scope: 'branch', scopeCode: 'BR01', sku: 'CHICKEN', parLevel: 120, minQty: 40 },
  ]);
  const p = policyFor(index, 'CHICKEN', DIMS);
  assert.equal(p.parLevel, 120);
  assert.equal(p.sources.parLevel, 'branch');
  assert.equal(p.leadDays, 5, 'المهلة من البراند — الفرع لم يُصرّح بها');
  assert.equal(p.sources.leadDays, 'brand');
  assert.equal(p.safetyDays, 8, 'الأخصّ يفوز: البراند قبل القطاع');
  assert.equal(p.sources.safetyDays, 'brand');
});

test('الأعمّ يصل حين يصمت الأخصّ — وسياسة القطاع وحدها تكفي ثلاثين فرعًا', () => {
  const index = indexPolicies([{ scope: 'sector', scopeCode: 'FNB', sku: 'RICE', leadDays: 21, coverDays: 14 }]);
  const a = policyFor(index, 'RICE', DIMS);
  const b = policyFor(index, 'RICE', { branch: 'BR09', brand: 'BRD2', sector: 'FNB' });
  assert.equal(a.leadDays, 21);
  assert.equal(b.leadDays, 21, 'فرعٌ آخر في القطاع نفسه يرث السياسة نفسها');
  assert.equal(b.sources.coverDays, 'sector');
});

test('★ أيّام التغطية بندٌ مستقلّ عن مخزون الأمان — لا مترادفان', () => {
  const index = indexPolicies([{ scope: 'branch', scopeCode: 'BR01', sku: 'OIL', coverDays: 7, safetyDays: 3 }]);
  const p = policyFor(index, 'OIL', DIMS);
  assert.equal(p.coverDays, 7);
  assert.equal(p.safetyDays, 3);
  assert.notEqual(p.coverDays, p.safetyDays);
  assert.ok('coverDays' in DEFAULT_POLICY && 'safetyDays' in DEFAULT_POLICY);
});

test('المنعُ لما يكذب: أرضيّةٌ فوق السقف — والسالب يُصفَّر لا يُحفظ', () => {
  assert.ok(policyProblems({ scope: 'branch', scopeCode: 'BR01', sku: 'X', minQty: 100, parLevel: 50 })
    .some((p) => p.includes('أرضيّةٌ فوق السقف')));
  assert.ok(policyProblems({ scope: 'branch', scopeCode: 'BR01' }).some((p) => p.includes('بلا صنف')));
  assert.deepEqual(policyProblems({ scope: 'branch', scopeCode: 'BR01', sku: 'X', minQty: 10, parLevel: 50 }), []);
  assert.equal(shapePolicy({ sku: 'X', parLevel: -5 }).parLevel, 0);
});

test('الأصناف بلا سياسة تُسمّى — نقصٌ يُعلَن لا عطبٌ يمنع', () => {
  const index = indexPolicies([{ scope: 'branch', scopeCode: 'BR01', sku: 'CHICKEN', parLevel: 10 }]);
  assert.deepEqual(policyGaps(index, ['chicken', 'RICE', 'OIL'], DIMS), ['OIL', 'RICE']);
  assert.deepEqual(policyGaps(index, ['CHICKEN'], DIMS), []);
});

test('فرعٌ بلا أبعادٍ (خارج الشجرة) يسلك الافتراض ولا ينكسر', () => {
  const index = indexPolicies([{ scope: 'branch', scopeCode: 'BR01', sku: 'X', parLevel: 9 }]);
  const p = policyFor(index, 'X', {});
  assert.equal(p.parLevel, 0);
  assert.equal(p.leadDays, DEFAULT_POLICY.leadDays);
});
