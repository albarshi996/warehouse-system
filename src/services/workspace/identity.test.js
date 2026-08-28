/**
 * اختبارات هويّة المستودع — `identity.js`.
 *
 * القسم الأوّل منطقٌ خالص: اشتقاق الرموز والختم والفحص.
 * والقسم الثاني **حارسُ انحرافٍ على المستودع الحقيقيّ**: يقرأ `workspace.json`
 * وملفّات جدول المواضع من القرص، ويثبت أنّ أيّ رمزٍ للشقيق لم يتسرّب إليها.
 * وهو موضعه هنا عمدًا: `npm test` حاجزٌ صلب في خطّ النشر، فيصير استحالةُ نشر
 * نسخةٍ بهويّة المستودع الآخر مضمونةً بالبناء لا بالتذكّر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  KINDS,
  SPOTS,
  BLOCK_START,
  BLOCK_END,
  tokensOf,
  stamp,
  leaks,
  lf,
  atRiskOfErasure,
  replaceBlock,
  agentsBlock,
  workspaceDoc,
  isSweepExempt,
  identityOnly,
  SWEEP_REGENERATED,
} from './identity.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const card = JSON.parse(fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'));

const PERSONAL = { repo: 'albarshi996/warehouse-system' };
const COMPANY = { repo: 'warehouse-art/brand-zo-hub' };

// ═══ اشتقاق الرموز ════════════════════════════════════════════════════════

test('الرموز تُشتقّ من العنوان وحده حين لا رابط نشرٍ صريح', () => {
  assert.deepEqual(tokensOf(PERSONAL), {
    slug: 'albarshi996/warehouse-system',
    host: 'https://albarshi996.github.io',
    base: '/warehouse-system',
    name: 'warehouse-system',
  });
});

test('رابط النشر الصريح يتقدّم على الاشتقاق — لنطاقٍ مستقلّ لاحقًا', () => {
  const t = tokensOf({
    repo: 'warehouse-art/brand-zo-hub',
    pages: 'https://hub.example.ly/portal/',
  });
  assert.equal(t.host, 'https://hub.example.ly');
  assert.equal(t.base, '/portal');
  assert.equal(t.name, 'brand-zo-hub', 'اسم الحزمة يبقى من العنوان لا من الرابط');
});

test('بطاقةٌ بلا عنوان صالح تتوقّف بدل أن تختم فراغًا', () => {
  assert.throws(() => tokensOf({ repo: 'warehouse-system' }), /owner\/repo/);
  assert.throws(() => tokensOf({}), /owner\/repo/);
});

test('رابط نشرٍ بلا مسارٍ فرعيّ يتوقّف — الختم بمسارٍ فارغ يمحو ما لا يقصده', () => {
  assert.throws(() => tokensOf({ repo: 'a/b', pages: 'https://x.ly/' }), /مسارٍ فرعيّ/);
});

// ═══ الختم ════════════════════════════════════════════════════════════════

const me = tokensOf(PERSONAL);
const you = tokensOf(COMPANY);

test('ختم package.json: العنوان الكامل قبل الاسم المجرّد، فلا يتمزّق أحدهما', () => {
  const src = [
    '  "name": "brand-zo-hub",',
    '  "url": "git+https://github.com/warehouse-art/brand-zo-hub.git"',
    '  "homepage": "https://github.com/warehouse-art/brand-zo-hub#readme"',
  ].join('\n');
  const out = stamp(src, you, me, ['slug', 'name']);
  assert.equal(
    out,
    [
      '  "name": "warehouse-system",',
      '  "url": "git+https://github.com/albarshi996/warehouse-system.git"',
      '  "homepage": "https://github.com/albarshi996/warehouse-system#readme"',
    ].join('\n')
  );
});

test('ختم رابطٍ كامل: المضيف ثمّ المسار', () => {
  const out = stamp('https://warehouse-art.github.io/brand-zo-hub/dashboard/', you, me, [
    'host',
    'base',
  ]);
  assert.equal(out, 'https://albarshi996.github.io/warehouse-system/dashboard/');
});

test('الختم ساكن: تشغيله مرّتين كتشغيله مرّة', () => {
  const src = "site: 'https://warehouse-art.github.io', base: '/brand-zo-hub'";
  const once = stamp(src, you, me, ['host', 'base']);
  assert.equal(stamp(once, you, me, ['host', 'base']), once);
});

test('الختم يعود بالنصّ كما كان إذا خُتم ذهابًا وإيابًا', () => {
  const src = '"name": "brand-zo-hub" — https://warehouse-art.github.io/brand-zo-hub/';
  const there = stamp(src, you, me, KINDS);
  assert.equal(stamp(there, me, you, KINDS), src);
});

test('لا يُختم رمزٌ خارج ما يخصّ الموضع', () => {
  const src = '"name": "brand-zo-hub" و https://warehouse-art.github.io';
  assert.equal(
    stamp(src, you, me, ['host']),
    '"name": "brand-zo-hub" و https://albarshi996.github.io'
  );
});

// ═══ الفحص ════════════════════════════════════════════════════════════════

test('الفحص يذكر الرموز المتسرّبة، ويسكت عن النظيف', () => {
  assert.deepEqual(leaks('base: /brand-zo-hub', you, ['base']), ['/brand-zo-hub']);
  assert.deepEqual(leaks('base: /warehouse-system', you, ['base']), []);
});

test('الفحص لا يشتكي من رمزٍ خارج ما يخصّ الموضع', () => {
  assert.deepEqual(leaks('"name": "brand-zo-hub"', you, ['host']), []);
});

// ═══ الكتلة المولَّدة ═════════════════════════════════════════════════════

test('استبدال كتلة الهويّة لا يمسّ ما حول العلامتين', () => {
  const src = `رأس\n${BLOCK_START}\nقديم\n${BLOCK_END}\nذيل`;
  const out = replaceBlock(src, 'جديد');
  assert.equal(out, `رأس\n${BLOCK_START}\nجديد\n${BLOCK_END}\nذيل`);
});

test('غياب العلامتين يتوقّف بدل أن يكتب في مكانٍ مجهول', () => {
  assert.throws(() => replaceBlock('بلا علامات', 'جديد'), /identity:start/);
});

test('الكتلة والبطاقة تذكران المستودعين معًا، وتبدآن بمَن نحن فيه', () => {
  const block = agentsBlock(card);
  assert.ok(block.includes(card.repo), 'الكتلة تذكر المستودع الحاليّ');
  assert.ok(block.includes(card.sibling.repo), 'وتذكر الشقيق');
  assert.ok(block.indexOf(card.repo) < block.indexOf(card.sibling.repo), 'والحاليّ أوّلًا');

  const doc = workspaceDoc(card);
  assert.ok(doc.includes('npm run sync'), 'البطاقة تُعلّم أمر المزامنة');
  for (const spot of SPOTS) assert.ok(doc.includes(spot.file), `البطاقة تسرد ${spot.file}`);
});

// ═══ حارس المحو — اتّجاه السؤال ═══════════════════════════════════════════

/**
 * المشهد: `package.json` في المستودعَين. الأصل المشترك يحمل هويّة الشقيق
 * (فالتاريخ مشترك من عنده)، ونسختنا تحمل هويّتنا.
 */
const pkg = (name, script) =>
  `{\n  "name": "${name}",\n  "scripts": {\n    "plan": "${script}"\n  },\n  "url": "https://github.com/${name === 'warehouse-system' ? 'albarshi996/warehouse-system' : 'warehouse-art/brand-zo-hub'}"\n}\n`;

// «نحن» هنا المستودع الشخصيّ (me) و«الشقيق» مستودع الشركة (you).
const OURS = (script) => pkg('warehouse-system', script);
const THEIRS = (script) => pkg('brand-zo-hub', script);

test('★ تقدُّمُ الشقيق وحده ليس خطرًا — وهذا ما كان يُسقط المزامنة كلّ ساعة', () => {
  // لم نغيّر شيئًا منذ الأصل المشترك (سوى ختم الهويّة الذي يفعله الدمج نفسه)،
  // والشقيق أضاف سكربتًا. لا شيء عندنا يُفقد.
  const base = THEIRS('a && b');
  const ours = OURS('a && b');
  const theirs = THEIRS('a && b && c');
  assert.equal(
    identityOnly({ file: 'package.json', ours, theirs, me, you }),
    false,
    'المقدّمة: نسختنا تخالف الشقيق فعلًا — ولذلك كان الحارس القديم يصيح'
  );
  assert.equal(
    atRiskOfErasure({ file: 'package.json', ours, theirs, base, me, you }),
    false,
    'ومع ذلك لا خطر: لم نغيّر شيئًا عن الأصل المشترك'
  );
});

test('عملٌ حقيقيٌّ عندنا وليس عند الشقيق — يُوقَف كما يجب', () => {
  const base = THEIRS('a && b');
  const ours = OURS('a && b && سكربتُ إدارة تقنية المعلومات');
  const theirs = THEIRS('a && b');
  assert.equal(atRiskOfErasure({ file: 'package.json', ours, theirs, base, me, you }), true);
});

test('غيّرنا وغيّر الشقيق التغيير نفسه — فلا شيء يُفقد', () => {
  const base = THEIRS('a && b');
  const ours = OURS('a && b && c');
  const theirs = THEIRS('a && b && c');
  assert.equal(atRiskOfErasure({ file: 'package.json', ours, theirs, base, me, you }), false);
});

test('ملفٌّ لا نملكه لا يُعدّ خطرًا', () => {
  assert.equal(
    atRiskOfErasure({ file: 'package.json', ours: null, theirs: THEIRS('a'), base: THEIRS('a'), me, you }),
    false
  );
});

/**
 * ═══ ملفٌّ خارج جدول المواضع — والقفلُ الذي كلّفه ═══
 *
 * `identityOnly` تُعيد `false` لكلّ ملفٍّ ليس في `SPOTS`، فالشرطان معًا يصيران
 * «نعم» تلقائيًّا **ولو كانت النسختان متطابقتين حرفًا بحرف**.
 *
 * ★ وكلّف ذلك قفلًا كاملًا 2026-08-28: تغييرٌ في `.github/workflows/astro.yml`
 * — **ولا تستطيع الأتمتةُ دفعَ ملفّات النشر** (GitHub يمنع `GITHUB_TOKEN` من
 * `workflows`) — فنُقل بيدٍ إلى المستودعَين فصارا **متطابقَين**، ومع ذلك أوقف
 * الحارسُ المزامنةَ لأنّ الملفّ ليس في الجدول. ولا مخرجَ إلّا `--force`.
 */
test('★★★ ملفٌّ خارج الجدول ونسختانا متطابقتان — لا خطر (وكان يصيح)', () => {
  const same = 'name: Deploy\njobs:\n  build:\n    run: npm run prebuild\n';
  const base = 'name: Deploy\njobs:\n  build:\n    run: node scripts/build-arch.mjs\n';
  assert.equal(
    identityOnly({ file: '.github/workflows/astro.yml', ours: same, theirs: same, me, you }),
    false,
    'المقدّمة: الملفّ خارج الجدول فـidentityOnly تقول «لا» حتّى للمتطابقَين'
  );
  assert.equal(
    atRiskOfErasure({ file: '.github/workflows/astro.yml', ours: same, theirs: same, base, me, you }),
    false,
    'ما يساوي نسخةَ الشقيق لا يُفقد بترجيح الشقيق — ولو لم يكن في الجدول'
  );
});

test('★★ وفرقُ نهايات الأسطر وحدَه ليس عملًا يُفقد', () => {
  const ours = 'name: Deploy\r\njobs:\r\n  build: x\r\n';
  const theirs = 'name: Deploy\njobs:\n  build: x\n';
  const base = 'name: Deploy\njobs:\n  build: y\n';
  assert.equal(
    atRiskOfErasure({ file: '.github/workflows/astro.yml', ours, theirs, base, me, you }),
    false,
    'CRLF مقابل LF ليس اختلافَ محتوى — والمقارنةُ تمرّ بـlf()'
  );
});

test('★★ وملفٌّ خارج الجدول لم نمسَّه أصلًا — لا خطر ولو تقدّم الشقيق', () => {
  const base = 'a: 1\n';
  const ours = 'a: 1\n'; // لم نغيّر شيئًا
  const theirs = 'a: 1\nb: 2\n'; // الشقيق تقدّم وحدَه
  assert.equal(
    atRiskOfErasure({ file: '.github/workflows/astro.yml', ours, theirs, base, me, you }),
    false,
    'تقدّمُ الشقيق وحدَه لا يُفقدنا شيئًا — وهو الخطأُ الأوّلُ نفسُه في ثوبٍ آخر'
  );
});

test('★ وعملٌ حقيقيٌّ في ملفٍّ خارج الجدول ما زال يُوقَف — لم يُفتح الباب', () => {
  const base = 'a: 1\n';
  const ours = 'a: 1\nسطرٌ كتبته إدارةُ تقنية المعلومات هنا وحدَها\n';
  const theirs = 'a: 1\nb: 2\n';
  assert.equal(
    atRiskOfErasure({ file: '.github/workflows/astro.yml', ours, theirs, base, me, you }),
    true,
    'التليينُ ذهب أبعدَ ممّا يجب — صار يبتلع عملًا حقيقيًّا'
  );
});

// ═══ حارس الانحراف على المستودع الحقيقيّ ══════════════════════════════════

test('كلّ موضعٍ في الجدول موجودٌ على القرص — الجدول لا يذكر ملفًّا رحل', () => {
  const gone = SPOTS.map((s) => s.file).filter((f) => !fs.existsSync(path.join(root, f)));
  assert.deepEqual(gone, [], 'مواضع هويّة في الجدول بلا ملفّات');
});

test('لم يتسرّب رمزٌ من هويّة الشقيق إلى أيّ موضع في هذا المستودع', () => {
  const sibling = tokensOf(card.sibling);
  const dirty = [];
  for (const spot of SPOTS) {
    const text = fs.readFileSync(path.join(root, spot.file), 'utf8');
    const found = leaks(text, sibling, spot.kinds);
    if (found.length) dirty.push(`${spot.file} ← ${found.join(' · ')}`);
  }
  assert.deepEqual(dirty, [], 'العلاج: npm run identity:apply');
});

test('البطاقة وكتلة الدستور مطابقتان للمولَّد من workspace.json', () => {
  // المقارنة بـ`lf` لا بالبايت: المولّد يكتب `\n` وgit يستخرج `\r\n` على ويندوز،
  // فكان هذا الاختبار وحده يسقط أبدًا هناك — أحمرُ كاذبٌ يُعمي عن أحمرَ صادق.
  const doc = fs.readFileSync(path.join(root, 'WORKSPACE.md'), 'utf8');
  assert.equal(
    lf(doc),
    lf(workspaceDoc(card)),
    'WORKSPACE.md مولَّد — العلاج: npm run identity:apply'
  );

  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.equal(
    lf(agents),
    lf(replaceBlock(agents, agentsBlock(card))),
    'كتلة الهويّة في AGENTS.md'
  );
});

test('نهايةُ سطر ويندوز لا تُوهم الحارس باختلاف — CRLF وLF نصٌّ واحد', () => {
  const doc = workspaceDoc(card);
  const windows = doc.replace(/\n/g, '\r\n');
  assert.notEqual(windows, doc, 'المحاكاة صنعت نصًّا مختلفًا بالبايت فعلًا');
  assert.equal(lf(windows), lf(doc), 'وبعد التوحيد هما نصٌّ واحد');

  // والمسار الحقيقيّ: دستورٌ بنهايات ويندوز وكتلةٌ مولَّدة بـLF — مزيجٌ يجب أن يمرّ.
  const agents = lf(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).replace(/\n/g, '\r\n');
  assert.equal(
    lf(agents),
    lf(replaceBlock(agents, agentsBlock(card))),
    'كتلة الهويّة في دستورٍ CRLF'
  );
});

test('.gitattributes يُثبّت `eol=lf` للوثيقتين المولَّدتين — وإلّا عاد الأحمر الكاذب', () => {
  // الحارس يسأل git نفسه لا يبحث عن نصٍّ في الملفّ: نمطٌ مكتوبٌ لا يُطابق
  // (اسمٌ عربيّ أو مجلّدٌ خاطئ) يمرّ من فحص النصّ ويسقط من فحص الآليّة.
  const generated = ['WORKSPACE.md', 'AGENTS.md'];
  const out = execFileSync('git', ['check-attr', 'eol', '--', ...generated], {
    cwd: root,
    encoding: 'utf8',
  });
  const undeclared = out
    .trim()
    .split('\n')
    .filter((line) => !line.endsWith(': lf'));
  assert.deepEqual(undeclared, [], 'وثيقةٌ مولَّدة بلا `eol=lf` في .gitattributes');
});

/** امتداداتٌ لا نصَّ فيها — تُتجاوَز في المسح الشامل توفيرًا للوقت لا تسامحًا. */
const BINARY = /\.(png|jpe?g|gif|ico|webp|pdf|zip|woff2?|ttf|eot|mp[34]|xlsx?|docx?|pptx?)$/i;

test('لا رمزَ للشقيق في ملفٍّ متعقَّبٍ خارج جدول المواضع والمستثنيات المعلنة', () => {
  const sibling = tokensOf(card.sibling);
  const spots = new Set(SPOTS.map((s) => s.file));
  // ★ والمولَّداتُ التي تُعيد المزامنةُ بناءها تُتجاوَز هنا كما تُتجاوَز في المسح
  // المعكوس: هي تحمل هويّةَ من وصلت إليه بعد أوّل مزامنةٍ تُعيد بناءها، والحكمُ
  // عليها قبلَ ذلك حكمٌ على حالةٍ عابرة. (وقع 2026-08-28: دليلُ الاستخدام
  // المولَّد أوقف المزامنةَ وهو مقدَّرٌ أن يُعاد بناؤه في الخطوة التالية.)
  const regenerated = new Set(SWEEP_REGENERATED);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

  const leaked = [];
  for (const file of tracked) {
    if (spots.has(file) || isSweepExempt(file) || regenerated.has(file) || BINARY.test(file))
      continue;
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue; // ملفٌّ متعقَّبٌ غير موجودٍ على القرص (checkout جزئيّ) — ليس شأن هذا الاختبار
    }
    const found = leaks(text, sibling, KINDS);
    if (found.length) leaked.push(`${file} ← ${found.join(' · ')}`);
  }

  assert.deepEqual(
    leaked,
    [],
    'رمزُ الشقيق في ملفٍّ لا يحرسه أحد. القرار: إمّا يُضاف إلى SPOTS فيُختم، وإمّا إلى SWEEP_EXEMPT بسببٍ مكتوب'
  );
});

/**
 * ═══ والمسحُ المعكوس — رمزُنا نحن ═══
 *
 * ★★★ **وُضع لأنّ الأوّلَ لا يُطلق هنا أبدًا.** المسحُ أعلاه يبحث عن رمز
 * **الشقيق**، ورمزُ الشقيق لا يكتبه أحدٌ عندنا سهوًا — والذي يُكتب سهوًا هو
 * **رمزُنا نحن**: مسارُ نشرِنا أو عنوانُه مثبَّتًا في ملفٍّ لا يُختم. وهو صحيحٌ
 * هنا فلا يشكو أحد، **وخطأٌ هناك** حيث المسارُ غيرُ مسارنا.
 *
 * فالعطبُ يسافر ولا ينفجر إلّا في المستودع الآخر بعد ساعاتٍ أو أيّام — وقد وقع:
 * سطران مثبَّتان في `scripts/build-usage-guide.mjs` ومثالٌ في تعليقٍ داخل
 * `src/services/scan/cameraScanner.js` **أوقفا مزامنةَ مستودع الشركة يومين
 * و٧٥ كوميتًا** (2026-08-26 → 2026-08-28)، ولا اختبارَ عندنا كان يراهما.
 *
 * وهو الدرسُ نفسُه المكتوب في `feedback-green-locally-red-in-ci`: **حارسٌ يقرأ
 * حالةَ بيئةٍ واحدةٍ يكذب في الأخرى — والسؤالُ أيَّتُهما.**
 */
test('★★★ ولا رمزَ لنا نحن مثبَّتًا في ملفٍّ يُزامَن — فيصحّ هنا ويخطئ هناك', () => {
  const ours = tokensOf(card);
  const spots = new Set(SPOTS.map((s) => s.file));
  const regenerated = new Set(SWEEP_REGENERATED);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

  const hardcoded = [];
  for (const file of tracked) {
    if (spots.has(file) || isSweepExempt(file) || regenerated.has(file) || BINARY.test(file)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    // `name` وحدَه يُستثنى: كلمةٌ عامّةٌ تقع في نصٍّ عربيٍّ بلا قصدِ عنوان.
    const found = leaks(text, ours, ['slug', 'host', 'base']);
    if (found.length) hardcoded.push(`${file} ← ${found.join(' · ')}`);
  }

  assert.deepEqual(
    hardcoded,
    [],
    'مسارُ نشرِنا أو عنوانُه مثبَّتٌ بيدٍ في ملفٍّ يُزامَن — ولو في تعليق. ' +
      'يُقرأ من `workspace.json` (`tokensOf`)، أو يُضاف الملفُّ إلى SPOTS فيُختم، ' +
      'أو إلى SWEEP_REGENERATED إن كانت المزامنةُ تُعيد بناءه'
  );
});

test('★★ وقائمةُ المولَّدات هنا لا تفترق عمّا تُعيد المزامنةُ بناءه فعلًا', () => {
  const sync = fs.readFileSync(path.join(root, 'scripts/sync-sibling.mjs'), 'utf8');
  for (const file of SWEEP_REGENERATED) {
    assert.ok(
      sync.includes(`'${file}'`),
      `«${file}» معفًى هنا بحجّة أنّ المزامنةَ تُعيد بناءه، ولا ذكرَ له في scripts/sync-sibling.mjs`
    );
  }
});

test('الاستثناء يطابق الاسم التامّ وبادئةَ المجلّد وملفّات الاختبار، لا ما سواها', () => {
  assert.ok(isSweepExempt('workspace.json'));
  assert.ok(isSweepExempt('docs/archive/PROJECT_MEMORY.md'), 'بادئة مجلّد');
  assert.ok(isSweepExempt('src/services/auth/pageAccess.test.js'), 'ثوابت الاختبارات');
  assert.ok(!isSweepExempt('docs/archive.md'), 'بادئة المجلّد لا تبتلع ملفًّا مجاورًا');
  assert.ok(!isSweepExempt('src/pages/dashboard/archive.astro'));
});

// ═══ حارس المحو: هل يفسّر الختمُ وحدَه الفرق؟ ═════════════════════════════

test('فرقٌ يفسّره الختم وحدَه ⇒ لا شيء يُمحى', () => {
  const theirs = "site: 'https://warehouse-art.github.io', base: '/brand-zo-hub'";
  const ours = "site: 'https://albarshi996.github.io', base: '/warehouse-system'";
  assert.equal(identityOnly({ file: 'astro.config.mjs', ours, theirs, me, you }), true);
});

test('★ سطرُ عملٍ داخل ملفّ هويّة يُكشف — وهو الخطأ الذي تمرّ به قائمةُ الأسماء', () => {
  const theirs = '{\n  "name": "brand-zo-hub",\n  "scripts": { "a": "x" }\n}';
  const ours = '{\n  "name": "warehouse-system",\n  "scripts": { "a": "x", "b": "y" }\n}';
  assert.equal(
    identityOnly({ file: 'package.json', ours, theirs, me, you }),
    false,
    'سكربتٌ أضافته إدارة تقنية المعلومات كان سيُمحى صامتًا'
  );
});

test('الدستور يُقاس خارج كتلة الهويّة وحدها', () => {
  const wrap = (who, body) => `# دستور\n${BLOCK_START}\n> أنت في ${who}\n${BLOCK_END}\n${body}`;
  assert.equal(
    identityOnly({
      file: 'AGENTS.md',
      ours: wrap('أ', 'قواعد'),
      theirs: wrap('ب', 'قواعد'),
      me,
      you,
    }),
    true,
    'اختلاف الكتلة وحده مقبول — فهي مولَّدة'
  );
  assert.equal(
    identityOnly({
      file: 'AGENTS.md',
      ours: wrap('أ', 'قواعدنا'),
      theirs: wrap('ب', 'قواعد'),
      me,
      you,
    }),
    false,
    'قاعدةٌ خارج الكتلة تُكشف'
  );
});

test('ملفٌّ لا يعرفه الجدول، أو غائبٌ عند أحدهما، يُعدّ في خطر', () => {
  assert.equal(identityOnly({ file: 'docs/it-note.md', ours: 'x', theirs: 'x', me, you }), false);
  assert.equal(identityOnly({ file: 'package.json', ours: 'x', theirs: null, me, you }), false);
});

test('البطاقة تحمل ما يلزم المزامنة: عنوان الشقيق ومجلّده وريموته', () => {
  for (const key of ['name', 'repo', 'purpose', 'rules', 'folder']) {
    assert.ok(card[key], `البطاقة بلا ${key}`);
    assert.ok(card.sibling[key], `كتلة الشقيق بلا ${key}`);
  }
  assert.match(card.sibling.remote, /^https:\/\/github\.com\//, 'ريموت الشقيق للجلب لمرّةٍ واحدة');
  assert.notEqual(card.repo, card.sibling.repo, 'البطاقة تشير إلى نفسها شقيقًا');
});

test('★ إذنُ المزامنة التلقائيّة صريحٌ في الطرفين، وواحدٌ لا اثنان', () => {
  assert.equal(typeof card.autoSync, 'boolean', 'autoSync يُعلَن ولا يُترك ضمنيًّا');
  assert.equal(typeof card.sibling.autoSync, 'boolean', 'وكذلك في كتلة الشقيق');
  assert.notEqual(
    card.autoSync,
    card.sibling.autoSync,
    'لو سحب الطرفان تلقائيًّا لتقاذفا المزامنة بلا نهاية — واحدٌ يسحب والآخر مصدر'
  );
});

// ═══ المسارات غير اللاتينيّة: العطب الذي أسقط المزامنة في CI ══════════════

test('★ في جدول المواضع أسماءٌ عربيّة — وهي التي تكشف عطب اقتباس المسارات', () => {
  const arabic = SPOTS.filter((s) => /[\u0600-\u06FF]/.test(s.file));
  assert.ok(
    arabic.length >= 2,
    'وجودها في الجدول مقصود: تُبقي العطب مكشوفًا في أوّل تشغيل بدل أن يكمن'
  );
  for (const s of arabic) assert.ok(fs.existsSync(path.join(root, s.file)), s.file);
});

test('★ الاقتباس مشتعلًا كما في CI: `-z` تُعيد المسار العربيّ خامًّا لا مهرَّبًا', () => {
  // `core.quotePath` مطفأٌ على جهاز المالك ومشتعلٌ في مُشغّل GitHub، فبدونه
  // يعود الاسم `"docs/\330\271…"` ولا يعرفه `git show` — وهذا ما أوقف المزامنة.
  const quoted = execFileSync('git', ['-c', 'core.quotePath=true', 'ls-files', '--', 'docs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(quoted, /^"/m, 'الاقتباس يحدث فعلًا — وإلّا فالاختبار لا يحرس شيئًا');

  const raw = execFileSync('git', ['-c', 'core.quotePath=true', 'ls-files', '-z', '--', 'docs'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const arabic = raw.filter((f) => /[\u0600-\u06FF]/.test(f));
  assert.ok(arabic.length > 0, 'في docs أسماء عربيّة');
  for (const f of arabic) {
    assert.ok(!f.startsWith('"'), `عاد خامًّا: ${f}`);
    assert.ok(fs.existsSync(path.join(root, f)), `ويُفتح بمساره: ${f}`);
  }
});

test('★ سكربت المزامنة يقرأ مسارات git في موضعٍ واحدٍ وبـ`-z` دائمًا', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'sync-sibling.mjs'), 'utf8');
  assert.equal(
    (src.match(/--name-only/g) || []).length,
    1,
    'قراءة المسارات في دالّةٍ واحدة — فلا يُنسى `-z` في نسخةٍ ثانية'
  );
  assert.match(src, /'--name-only',\s*'-z'/, '`-z` ملازمةٌ لها');
  assert.match(src, /split\('\\0'\)/, 'والفصل بالمحرف الصفر');
});

test('ورك-فلو المزامنة التلقائيّة موجودٌ ومحكومٌ بالبطاقة لا بعنوانٍ مثبَّت', () => {
  const file = path.join(root, '.github', 'workflows', 'sync-from-sibling.yml');
  assert.ok(fs.existsSync(file), 'ملفّ المزامنة التلقائيّة');
  const yml = fs.readFileSync(file, 'utf8');
  assert.match(yml, /workspace\.json/, 'الإذن يُقرأ من البطاقة');
  assert.match(yml, /autoSync/, 'وبمفتاح autoSync تحديدًا');
  assert.ok(
    !yml.includes(card.repo) && !yml.includes(card.sibling.repo),
    'لا عنوان مستودعٍ مثبَّتٌ في الورك-فلو — وإلّا عمل في المستودع الخطأ بعد المزامنة'
  );
  assert.match(yml, /npm test/, 'البوّابة الخضراء قبل الدفع');
  assert.match(yml, /gh workflow run astro\.yml/, 'إطلاق النشر — فالدفع بالتوكن لا يُطلقه');
});
