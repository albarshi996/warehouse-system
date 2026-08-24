/**
 * اختبارات مجموعات «بدء مستند جديد».
 *
 * الاختبار الأوّل هو **سبب وجود هذا الملفّ**: كان سبعةُ أنواعٍ مبنيّةً في
 * المحرّك ولا زرَّ يبدأها — منها سلسلة الإنتاج كاملةً — لأنّ التصنيف كان
 * مصفوفةً محلّيّةً داخل المكوّن لا يقرؤها حارس. الآن يسقط البناء إن عاد نوعٌ
 * جاهزٌ بلا مدخل.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { START_GROUPS, coveredTypes, uncoveredReadyTypes, plannedTypes } from './startGroups.js';
import { GOVERNED_FORMS } from './schemas/index.js';
import { PRODUCTION_CHAIN } from './chain.js';

test('★ كل نوعٍ جاهزٍ في المحرّك له مدخلُ بدءٍ — لا مستند يُبنى ثمّ لا يُرى', () => {
  const orphans = uncoveredReadyTypes();
  assert.deepEqual(
    orphans,
    [],
    `أنواعٌ مبنيّةٌ ولا زرَّ يبدأها: ${orphans.join('، ')} — أضِفها إلى START_GROUPS`
  );
});

test('★ سلسلة الإنتاج مغطّاة — وهي التي كشفت العطب', () => {
  const covered = coveredTypes();
  for (const t of PRODUCTION_CHAIN) {
    assert.ok(covered.has(t), `${t} خارج مجموعات البدء`);
  }
});

test('لا نوعَ في مجموعتين — المدخل المكرّر يوهم بمستندين', () => {
  const seen = new Map();
  for (const g of START_GROUPS) {
    for (const t of g.types) {
      if (seen.has(t)) {
        assert.fail(`«${t}» في «${seen.get(t)}» و«${g.title}» معًا`);
      }
      seen.set(t, g.title);
    }
  }
});

test('كل مجموعة تحمل عنوانًا وأيقونةً وأنواعًا', () => {
  assert.ok(START_GROUPS.length > 0);
  for (const g of START_GROUPS) {
    assert.ok(g.title && typeof g.title === 'string', 'عنوانٌ غائب');
    assert.ok(g.icon && typeof g.icon === 'string', `«${g.title}» بلا أيقونة`);
    assert.ok(Array.isArray(g.types) && g.types.length > 0, `«${g.title}» بلا أنواع`);
  }
});

test('كل نوعٍ مصنَّفٍ معروفٌ في خارطة النماذج — لا رمزَ مخترع', () => {
  const known = new Set(GOVERNED_FORMS.map((f) => f.type));
  for (const t of coveredTypes()) {
    assert.ok(known.has(t), `«${t}» مصنَّفٌ ولا وجود له في GOVERNED_FORMS`);
  }
});

test('المصنَّف غير الجاهز يُعلَن ولا يُعدّ عطبًا — العرض يفلتر بـready', () => {
  assert.ok(Array.isArray(plannedTypes()));
});
