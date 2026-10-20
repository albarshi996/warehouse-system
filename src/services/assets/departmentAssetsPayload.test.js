/**
 * مرساةُ **حمولة سجلّ الأصل** — تقرأ `departmentAssetsService.js` نصًّا.
 *
 * ═══ ★★★ لماذا مرساةٌ لا اختبارُ وحدة؟ ═══
 * `assetPayload` تبني شكلًا ثابتًا: أيُّ حقلٍ لا تذكره **يُمحى قبل أن
 * يُكتب**، بلا خطإٍ ولا رسالة. ووقع هذا فعلًا في مرفقات الصور (‹VEN-401›):
 * مُرّر `hash` و`bytes` إلى خدمةٍ تبني شكلًا ثابتًا فسقطا، **فعمي كاشفُ
 * التكرار في السحابة وهو أخضرُ في الاختبار**. ولم يكشفه إلّا رفعٌ حيّ.
 *
 * والخدمةُ تستورد Firebase فلا تُحمَّل في Node — فتُقرأ **نصًّا**، وهو
 * نمطُ المراسي المستعمَلُ في هذا المستودع.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { EQUIPMENT_KINDS, specFields } from './whDepartment.js';

const SRC = readFileSync(new URL('./departmentAssetsService.js', import.meta.url), 'utf8');

/** مفاتيحُ الكائن الذي تُعيده `assetPayload`. */
function payloadKeys() {
  const body = SRC.match(/function assetPayload\(record\) \{[\s\S]*?\n\}/);
  assert.ok(body, 'لم يُعثَر على assetPayload — تغيّر اسمُها أو شكلُها');
  return [...body[0].matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
}

test('★★★ الحمولةُ تحمل نوعَ المعدّة ومواصفاتِها — وإلّا مُحيت صامتةً', () => {
  const keys = payloadKeys();
  assert.ok(keys.includes('equipmentKind'), 'نوعُ المعدّة يسقط قبل أن يُكتب');
  assert.ok(keys.includes('specs'), 'المواصفاتُ تسقط قبل أن تُكتب');
});

test('وتحمل حقولَ سجلّ الأصل الثلاثةَ عشرَ كما كانت — فلا يفقد أحدٌ شيئًا', () => {
  const keys = payloadKeys();
  for (const k of [
    'id', 'assetType', 'assetName', 'brand', 'serial', 'qty', 'condition',
    'responsible', 'department', 'section', 'location', 'receivedDate', 'notes',
  ]) {
    assert.ok(keys.includes(k), `الحقلُ «${k}» غاب عن الحمولة`);
  }
});

test('★★ والمواصفاتُ تُنقّى على حقول النوع قبل الكتابة — لا تُكتب كما جاءت', () => {
  assert.match(
    SRC,
    /specs:\s*cleanSpecs\(/,
    'المواصفاتُ تُكتب بلا تنقية — فيُخزَّن فيها ما لا ينتمي للنوع'
  );
});

test('★ وكلُّ نوعِ معدّةٍ له حقولٌ معرَّفة (ولو فارغةً لـ«أخرى»)', () => {
  for (const k of EQUIPMENT_KINDS) {
    assert.ok(Array.isArray(specFields(k.id)), `النوع «${k.id}» بلا حقول`);
    for (const f of specFields(k.id)) {
      assert.ok(f.key && f.label, `حقلٌ بلا مفتاحٍ أو عنوانٍ في «${k.id}»`);
    }
  }
});
