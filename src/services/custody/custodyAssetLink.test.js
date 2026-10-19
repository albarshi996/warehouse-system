/**
 * ‹WH-501› ربطُ سند العهدة برقم الأصل — الحكمُ ومرساةُ الحمولة.
 *
 * ═══ ★★★ الثقبُ الذي يسدّه ═══
 * كان السندُ يصف الجهازَ نصًّا (`itemDesc`) ولا يحمل رقمًا، فسؤالُ «من يحمل
 * BRZ-0042؟» بلا جواب. والـPDA الواحدُ مسجَّلٌ في `department_assets` وفي
 * `custodies` ولا شيءَ يربطهما.
 *
 * ★★ و`issueCustody` تبني شكلًا ثابتًا: حقلٌ لا تذكره **يُمحى قبل أن يُكتب**
 * بلا خطإٍ ولا رسالة — وهو العطبُ الذي أعمى كاشفَ تكرار الصور (‹VEN-401›)
 * ولم يُكشف إلّا برفعٍ حيّ. فمرساةٌ تقرأ المصدر نصًّا (الخدمةُ تستورد
 * Firebase فلا تُحمَّل في Node).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { custodyVerdict } from './custodyModel.js';

const base = {
  employeeName: 'أحمد الشريف',
  itemDesc: 'Zebra TC21',
  condition: 'جيد',
};

test('السندُ بلا رقمِ أصلٍ يمرّ — فعهدةُ «مفاتيح مخزن» لا أصلَ لها', () => {
  assert.deepEqual(custodyVerdict(base), { ok: true, problems: [] });
  assert.equal(custodyVerdict({ ...base, assetNo: '' }).ok, true);
  assert.equal(custodyVerdict({ ...base, assetNo: '   ' }).ok, true);
});

test('ورقمٌ صحيحٌ يمرّ', () => {
  assert.deepEqual(custodyVerdict({ ...base, assetNo: 'BRZ-0042' }), { ok: true, problems: [] });
  assert.equal(custodyVerdict({ ...base, assetNo: ' BRZ-0042 ' }).ok, true);
});

test('★★★ ورقمٌ مشوّهٌ يُرفض — فرابطٌ لا يُطابق شيئًا أسوأُ من لا رابط', () => {
  for (const bad of ['BRZ-42', 'brz-0042', '0042', 'BRZ_0042', 'جهاز']) {
    const v = custodyVerdict({ ...base, assetNo: bad });
    assert.equal(v.ok, false, `قُبل رقمٌ مشوّه: ${bad}`);
    assert.match(v.problems[0], /BRZ-0001/);
  }
});

test('ولا يُخلّ بالحكم القائم: الاسمُ والوصفُ والحالةُ ما زالت مطلوبة', () => {
  const v = custodyVerdict({ assetNo: 'BRZ-0042' });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 3);
  assert.ok(v.problems.some((p) => p.includes('اسم الموظف')));
  assert.ok(v.problems.some((p) => p.includes('وصف العهدة')));
  assert.ok(v.problems.some((p) => p.includes('حالة العهدة')));
});

test('★★★ ومرساةٌ: الحمولةُ المكتوبةُ تحمل `assetNo` — وإلّا مُحي صامتًا', () => {
  const src = readFileSync(new URL('./custodyService.js', import.meta.url), 'utf8');
  const body = src.match(/export async function issueCustody[\s\S]*?\n\}/);
  assert.ok(body, 'لم يُعثَر على issueCustody');
  assert.match(
    body[0],
    /assetNo:\s*String\(record\.assetNo/,
    'رقمُ الأصل لا يُكتب في السند — فالربطُ يعمى في السحابة وهو أخضرُ في الاختبار'
  );
  // والحقولُ القائمةُ باقيةٌ كما هي — فلا يفقد السندُ شيئًا بالإضافة.
  for (const k of ['employeeName', 'itemDesc', 'serial', 'condition', 'value', 'issueDate']) {
    assert.match(body[0], new RegExp(`${k}:`), `الحقلُ «${k}» غاب عن السند`);
  }
});
