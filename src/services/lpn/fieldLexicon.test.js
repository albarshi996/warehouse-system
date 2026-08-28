/**
 * اختبارات معجم التنفيذ الميدانيّ — العربيّةُ أصلٌ واحتياط، ولا فراغَ أبدًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LANG,
  FIELD_LANGS,
  dirOf,
  isFieldLang,
  lexiconKeys,
  missingIn,
  t,
} from './fieldLexicon.js';

test('★★★ لا فراغَ أبدًا — كلُّ مفتاحٍ في كلّ لغةٍ يعيد نصًّا', () => {
  for (const { id } of FIELD_LANGS) {
    for (const key of lexiconKeys()) {
      const v = t(id, key);
      assert.ok(typeof v === 'string' && v.trim().length > 0, `«${key}» فارغٌ في «${id}»`);
    }
  }
});

test('★★ العربيّةُ احتياطٌ لا فراغ — لغةٌ مجهولةٌ تعرض الأصل', () => {
  for (const lang of ['de', '', null, undefined, 'zz']) {
    assert.equal(t(lang, 'record_sighting'), t(DEFAULT_LANG, 'record_sighting'));
  }
});

test('★ ومفتاحٌ مجهولٌ يعود ظاهرًا — عطبٌ يُرى لا زرٌّ فارغ', () => {
  assert.equal(t('en', 'key_that_does_not_exist'), 'key_that_does_not_exist');
  assert.equal(t('ar', ''), '');
});

test('★★ الترجماتُ الثلاثُ كاملةٌ — والنقصُ يُقاس لا يُظنّ', () => {
  for (const { id } of FIELD_LANGS) {
    assert.deepEqual(missingIn(id), [], `مفاتيحُ ناقصةٌ في «${id}»`);
  }
});

test('★ ولا ترجمةَ هي نفسُها المفتاح — دليلُ نسيانٍ لا ترجمة', () => {
  for (const key of lexiconKeys()) {
    for (const { id } of FIELD_LANGS) {
      assert.notEqual(t(id, key), key, `«${key}» في «${id}» لم يُترجَم بعد`);
    }
  }
});

test('اتّجاهُ الكتابة يتبع اللغة — والمجهولةُ تُعامَل معاملةَ الأصل', () => {
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('en'), 'ltr');
  assert.equal(dirOf('fr'), 'ltr');
  assert.equal(dirOf('zz'), 'rtl', 'المجهولةُ لا تقلب التخطيط');
  assert.ok(isFieldLang('fr'));
  assert.ok(!isFieldLang('de'));
});
