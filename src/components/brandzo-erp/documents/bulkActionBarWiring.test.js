/**
 * حارسُ وصلِ شريط الإجراء الجماعيّ — أنّ ما يقرؤه المكوّن من `plan.action`
 * موجودٌ فعلًا في `BULK_ACTIONS`.
 *
 * ═══ لماذا هذا الاختبار موجود ═══
 * كان المكوّن يقرأ `plan.action.needsReason` — وهو عَلَمُ `amendGuard` لوحدةٍ
 * أخرى، لا عَلَمُ الإجراءات الجماعيّة (`needsNote`). فكانت القراءة `undefined`
 * فلا يُرسم حقلُ السبب أبدًا، بينما `noteMissing` يُحسب من `needsNote` الصحيح
 * فيقفل زرَّ التنفيذ. والنتيجة أنّ **الرفض والإغلاق والإلغاء الجماعيّ ظلّت
 * معطّلةً في الإنتاج**: الشاشة تقول «اكتب السببَ ليُفتَح التنفيذ» ولا حقلَ
 * يُكتب فيه (قِيس حيًّا 2026-10-19).
 *
 * ★★★ والاختباراتُ القائمة كلُّها على الطبقة الخالصة، فكانت خضراءَ وهي تصف
 * `needsNote` وصفًا صحيحًا — والعطبُ في الوصلة لا في المنطق. ولهذا يقرأ هذا
 * الحارسُ **نصَّ المكوّن** لا سلوكَه: هو الموضع الوحيد الذي ينكشف فيه الخلط.
 *
 * ★★ وهو أوسعُ من منع الكلمة الواحدة عمدًا: يلتقط **كلّ** خاصّيّةٍ يقرؤها
 * المكوّن على `plan.action` ويشترط وجودَها في `BULK_ACTIONS`. فأيُّ خطأٍ
 * إملائيٍّ قادمٍ يسقط هنا، لا هذا وحده.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BULK_ACTIONS } from '../../../services/documents/bulkActions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'BulkActionBar.jsx'), 'utf8');

/** الخصائصُ المعرَّفة فعلًا على إجراءٍ جماعيّ. */
const defined = new Set(Object.keys(BULK_ACTIONS[0]));

test('كلُّ خاصّيّةٍ يقرؤها الشريط على plan.action معرَّفةٌ في BULK_ACTIONS', () => {
  // نتجاهل أسطر التعليق كي لا يُسقط الشرحُ أعلاه الاختبارَ بذكره للاسم الخاطئ.
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');

  const read = [...code.matchAll(/plan\.action\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.ok(read.length > 0, 'المكوّن لا يقرأ شيئًا من plan.action — تغيّرت البنية فراجع الحارس.');

  const unknown = [...new Set(read)].filter((p) => !defined.has(p));
  assert.deepEqual(
    unknown,
    [],
    `الشريط يقرأ خاصّيّةً لا وجود لها في BULK_ACTIONS: ${unknown.join(' · ')}. ` +
      `المعرَّف: ${[...defined].join(' · ')}`
  );
});

test('حقلُ السبب مشروطٌ بالعَلَم نفسِه الذي يُحسب منه قفلُ الزرّ', () => {
  // `noteMissing` في الطبقة الخالصة يُحسب من `needsNote`؛ فإن رسم الشريطُ
  // الحقلَ بعَلَمٍ آخر عاد العطبُ نفسُه بصورةٍ جديدة.
  assert.match(
    source,
    /\{plan\.action\.needsNote\s*&&\s*\(/,
    'حقلُ السبب يجب أن يُرسم تحت `plan.action.needsNote` — وهو العَلَم الذي يقفل الزرّ.'
  );
});

test('كلُّ إجراءٍ يشترط سببًا له عَلَمٌ منطقيٌّ صريح', () => {
  for (const action of BULK_ACTIONS) {
    assert.equal(
      typeof action.needsNote,
      'boolean',
      `الإجراء ${action.id} بلا عَلَم needsNote صريح — فلا يُعرف أيحتاج سببًا أم لا.`
    );
  }
  // الثلاثةُ التي كانت معطّلةً حيًّا — تُذكر بأسمائها كي لا يسقط الحارسُ صامتًا
  // لو أُعيدت تسميتُها يومًا.
  for (const id of ['reject', 'close', 'cancel']) {
    const action = BULK_ACTIONS.find((a) => a.id === id);
    assert.ok(action, `الإجراء ${id} غائبٌ عن BULK_ACTIONS.`);
    assert.equal(action.needsNote, true, `الإجراء ${id} يجب أن يشترط سببًا مكتوبًا.`);
  }
});
