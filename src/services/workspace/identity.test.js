/**
 * هدفُ النشر — اختبارات `tokensOf`.
 *
 * كانت هنا ٤١ اختبارًا تحرس آلةَ الهويّة بين مستودعَين شقيقَين. وفُكّ الارتباط
 * 2026-10-18، فزالت الآلةُ وزالت حراستُها. وبقي ما يخدم البناء وحدَه — ومعه
 * حارسٌ واحدٌ جديد: **ألّا يعود الشقيق خِلسةً**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokensOf } from './identity.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const card = JSON.parse(fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'));

test('البطاقة تحمل ما يلزم اشتقاقَ هدف النشر', () => {
  for (const key of ['repo', 'pages', 'name', 'purpose', 'rules']) {
    assert.ok(card[key], `البطاقة بلا ${key}`);
  }
  assert.match(card.repo, /^[^/]+\/[^/]+$/, 'العنوان على صيغة owner/repo');
});

test('tokensOf يشتقّ العنوان والمسار من البطاقة الحقيقيّة', () => {
  const t = tokensOf(card);
  assert.equal(t.slug, card.repo);
  assert.equal(t.host, new URL(card.pages).origin);
  assert.equal(t.base, new URL(card.pages).pathname.replace(/\/+$/, ''));
  assert.ok(t.base.startsWith('/'), 'المسار يبدأ بشرطة — وإلّا كُسرت كلُّ روابط الدليل');
});

test('tokensOf يسقط على بطاقةٍ بلا عنوانٍ صالح — ولا يُخرج مسارًا فارغًا', () => {
  assert.throws(() => tokensOf({ repo: 'بلا-شرطة' }), /owner\/repo/);
  assert.throws(() => tokensOf({}), /owner\/repo/);
  // ★ الحالةُ الخبيثة: عنوانٌ صالحٌ ونشرٌ على جذر النطاق. الختمُ بمسارٍ فارغ
  //   يستبدل كلَّ موضعٍ في الملفّ لا موضعَ المسار — فيُمنع بالرمي لا بالصمت.
  assert.throws(() => tokensOf({ repo: 'a/b', pages: 'https://example.com/' }), /مسارٍ فرعيّ/);
});

test('★ فكُّ الارتباط قائم — لا شقيقَ في البطاقة ولا ورك-فلو مزامنة', () => {
  // ★ حارسٌ على القرار لا على آلةٍ زالت: لو أُعيدت المزامنةُ يومًا بلا قرار،
  //   سقط هذا الاختبار. والعودةُ تُستأنف بقرارٍ يحذفه، لا بإضافةٍ صامتة.
  assert.equal(card.sibling, undefined, 'كتلةُ الشقيق أُسقطت 2026-10-18');
  assert.equal(card.autoSync, undefined, 'وإذنُ المزامنة التلقائيّة معها');
  assert.equal(
    fs.existsSync(path.join(root, '.github', 'workflows', 'sync-from-sibling.yml')),
    false,
    'ورك-فلو المزامنة محذوف'
  );
  assert.equal(
    fs.existsSync(path.join(root, 'scripts', 'sync-sibling.mjs')),
    false,
    'وسكربتُ المزامنة كذلك'
  );
});
