/**
 * 🔒 حارسُ إعداد Dependabot — كي لا تعود القفزةُ الكبرى إلى أدوات النشر.
 *
 * ═══ ولماذا حارسٌ لملفّ إعدادٍ من ثلاثين سطرًا؟ ═══
 * لأنّه انكسر صامتًا مرّةً بالفعل (SEC-000): استُثنيت القفزاتُ الكبرى للمكتبات
 * **ونُسي استثناؤها لأدوات GitHub**، فلم يُنبّه أحدٌ ولم يفشل بناء — وإنّما
 * فُتحت خمسةُ طلباتٍ تُرقّي `checkout 4→7` و`setup-node 4→7` و`github-script 7→9`
 * و`configure-pages 5→6` و`tauri-action 0→1`. **وهذه الأدواتُ هي التي تبني
 * الموقعَ وتنشره**: لو دُمج أحدُها وأوقف النشر، لدُفع تغييرٌ ولم يظهر على
 * الموقع — عطبٌ يُكتشف بعد أيّام لا بعد دقائق.
 *
 * والنسيانُ لا يُمنع بالتذكّر بل بحارسٍ يفشل. فهذا الحارسُ يقرأ الملفّ نفسَه،
 * ويُسقط التعليقات أوّلًا — كي لا يمرَّ استثناءٌ **مُعلَّقٌ بالتعليق**.
 *
 * الخطّة: docs/خطة-تحصين-التبعيات.md · المهمّة SEC-000
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CONFIG = path.join(ROOT, '.github', 'dependabot.yml');

/**
 * قارئٌ صغيرٌ خاصٌّ بهذا الملفّ — بلا مكتبةِ YAML عمدًا: `js-yaml` نفسُها من
 * المكتبات التي تُرقّيها هذه الخطّة، فلا يُبنى حارسُ الترقية على المُرقَّى.
 * يُعيد لكلّ منظومةٍ (`package-ecosystem`) سطورَها بعد إسقاط التعليقات.
 */
function readEcosystemBlocks(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line)) // ★ التعليقُ لا يُحصَّن به
    .filter((line) => line.trim() !== '');

  const blocks = new Map();
  let current = null;
  for (const line of lines) {
    const head = line.match(/^\s*-\s*package-ecosystem:\s*['"]?([\w-]+)['"]?\s*$/);
    if (head) {
      current = head[1];
      blocks.set(current, []);
      continue;
    }
    if (current && /^\s{4,}\S/.test(line)) blocks.get(current).push(line);
    else if (/^\S/.test(line)) current = null;
  }
  return blocks;
}

function ignoresMajorBumps(blockLines) {
  const body = blockLines.join('\n');
  const ignoreAt = body.indexOf('ignore:');
  if (ignoreAt === -1) return false;
  const rest = body.slice(ignoreAt);
  return /dependency-name:\s*['"]\*['"]/.test(rest) && /version-update:semver-major/.test(rest);
}

test('★★★ أدواتُ GitHub مستثناةٌ من القفزات الكبرى — وهي التي تبني الموقعَ وتنشره', () => {
  const text = fs.readFileSync(CONFIG, 'utf8');
  const blocks = readEcosystemBlocks(text);

  assert.ok(
    blocks.has('github-actions'),
    'اختفت منظومةُ github-actions من dependabot.yml — فلا فحصَ لأدوات النشر أصلًا',
  );
  assert.ok(
    ignoresMajorBumps(blocks.get('github-actions')),
    'عادت القفزةُ الكبرى إلى أدوات النشر (SEC-000): قفزةٌ في checkout أو setup-node قد توقف النشرَ صامتًا',
  );
});

test('★★ والمكتباتُ مستثناةٌ كما كانت — لا يُصلَح جانبٌ ويُكسَر الآخر', () => {
  const blocks = readEcosystemBlocks(fs.readFileSync(CONFIG, 'utf8'));

  assert.ok(blocks.has('npm'), 'اختفت منظومةُ npm من dependabot.yml');
  assert.ok(
    ignoresMajorBumps(blocks.get('npm')),
    'سقط استثناءُ القفزات الكبرى للمكتبات — وقفزةٌ في Astro أو Firebase تكسر البوّابة كلَّها',
  );
});

test('★ والحارسُ لا يُخدع باستثناءٍ مُعلَّقٍ بالتعليق', () => {
  const commentedOut = [
    'version: 2',
    'updates:',
    '  - package-ecosystem: github-actions',
    '    directory: /',
    '    # ignore:',
    "    #   - dependency-name: '*'",
    "    #     update-types: ['version-update:semver-major']",
  ].join('\n');

  const blocks = readEcosystemBlocks(commentedOut);
  assert.equal(
    ignoresMajorBumps(blocks.get('github-actions')),
    false,
    'الحارسُ قبِل استثناءً مكتوبًا داخل تعليق — فهو يطمئنُّ بلا أساس',
  );
});

test('★ ويفشل فعلًا حين يُنزع الاستثناء — نقضٌ لا دعوى', () => {
  const withoutIgnore = [
    'version: 2',
    'updates:',
    '  - package-ecosystem: github-actions',
    '    directory: /',
    '    schedule:',
    '      interval: monthly',
  ].join('\n');

  const blocks = readEcosystemBlocks(withoutIgnore);
  assert.ok(blocks.has('github-actions'), 'القارئُ لم يرَ المنظومةَ أصلًا — فالحارسُ يقيس فراغًا');
  assert.equal(ignoresMajorBumps(blocks.get('github-actions')), false);
});
