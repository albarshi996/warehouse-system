/**
 * 🔒 حارسُ ملفّات النشر — اختبارُه.
 *
 * الحارسُ نفسُه وشرحُ علّته في `portability.js`. وهذه الاختباراتُ تحرس **حدَّه**:
 * أن يلتقط ما لا يعبر، وألّا يلتقط ما يعبر. فالطرفان عطبان:
 *   · تفريطٌ ⇒ ينسدّ سيلُ المزامنة ساعةً بعد ساعةٍ برفضٍ لا يسمّي سببه.
 *   · إفراطٌ ⇒ وقفةٌ بلا سبب، فيُدرَّب قارئُها على تجاوزها — ثمّ يتجاوز الحقّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnportable,
  normalizePath,
  unportablePaths,
  handApplyHint,
  WORKFLOW_DIR,
} from './portability.js';

/** الشرطةُ العكسيّة بالرمز — كـ`ESC` في سكربتات المشروع، فلا يبتلعها ناقلٌ بينها. */
const BACKSLASH = String.fromCharCode(92);

test('★★★ ملفُّ نشرٍ في الجذر لا يعبر — وهذا كلُّ سببِ الحارس', () => {
  assert.equal(isUnportable('.github/workflows/astro.yml'), true);
  assert.equal(isUnportable('.github/workflows/sync-from-sibling.yml'), true);
  assert.equal(isUnportable('.github/workflows/desktop-installer.yaml'), true);
});

test('★★★ وما يعبر لا يُدّعى عليه — وإلّا صار الحارسُ ذئبًا يُصاح به كذبًا', () => {
  assert.equal(isUnportable('src/services/workspace/portability.js'), false);
  assert.equal(isUnportable('.github/dependabot.yml'), false, 'dependabot ليس ورك-فلو — يعبر بلا منع');
  assert.equal(
    isUnportable('.github/workflows/README.md'),
    false,
    'ملفٌّ ليس ورك-فلو داخل المجلّد — GitHub لا يمنعه',
  );
  assert.equal(
    isUnportable('docs/.github/workflows/مثال.yml'),
    false,
    'المنعُ على مجلّد الجذر وحده — و`.github` داخل مجلّدٍ فرعيٍّ وثيقةٌ لا ورك-فلو',
  );
});

test('★★ والشكلُ لا يخدعه: بادئةُ ./ وشرطةُ ويندوز العكسيّة', () => {
  assert.equal(isUnportable('./.github/workflows/astro.yml'), true);
  assert.equal(
    isUnportable(['.github', 'workflows', 'astro.yml'].join(BACKSLASH)),
    true,
    'مسارٌ بشرطة ويندوز مرّ بلا كشف — والحارسُ يعمل على ويندوز وعلى مُشغّل GitHub معًا',
  );
  assert.equal(normalizePath(['a', 'b'].join(BACKSLASH)), 'a/b');
});

test('★★ الجملةُ تُصفّى وتُرتَّب وتُنزع تكرارُها — فالرسالةُ تُقرأ لا تُفكّ', () => {
  const out = unportablePaths([
    'src/a.js',
    './.github/workflows/b.yml',
    '.github/workflows/a.yml',
    '.github/workflows/b.yml',
    null,
  ]);
  assert.deepEqual(out, ['.github/workflows/a.yml', '.github/workflows/b.yml']);
});

test('★ ولا ينهار على الفراغ — يُستدعى حيث قد لا يكون هناك فرقٌ أصلًا', () => {
  assert.deepEqual(unportablePaths([]), []);
  assert.deepEqual(unportablePaths(undefined), []);
});

test('★★★ نقضٌ: لو أُلغي شرطُ المجلّد لَمرّ ما لا يجوز مرورُه', () => {
  // الحارسُ يشترط شيئين: المجلّدَ والامتداد. وهذا يثبت أنّ **كليهما** يعمل،
  // فلا يُظنّ الامتدادُ وحده كافيًا ثمّ يُحذف المجلّدُ في تنظيفٍ لاحق.
  assert.equal(isUnportable('src/config.yml'), false, 'الامتدادُ وحده لا يكفي — وإلّا لَشمل كلَّ yml في المشروع');
  assert.equal(isUnportable('.github/workflows/'), false, 'المجلّدُ وحده لا يكفي — لا ملفَّ هنا');
  assert.ok(WORKFLOW_DIR.endsWith('/'), 'لولا الخطُّ المائل الأخير لَطابق `.github/workflows-backup/x.yml`');
  assert.equal(isUnportable('.github/workflows-backup/x.yml'), false);
});

test('★★ ونصُّ العلاج أوامرُ تُنسخ — لأنّه يُقرأ في إشعار فشلٍ ومن يقرؤه يريد أن يخرج', () => {
  const hint = handApplyHint({
    files: ['.github/workflows/astro.yml'],
    siblingRemote: 'https://github.com/warehouse-art/brand-zo-hub.git',
  });
  assert.match(hint, /git fetch https:\/\/github\.com\/warehouse-art\/brand-zo-hub\.git main/);
  assert.match(hint, /git checkout FETCH_HEAD -- \.github\/workflows\/astro\.yml/);
  assert.match(hint, /git push/);
});
