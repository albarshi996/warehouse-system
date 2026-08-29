#!/usr/bin/env node
/**
 * npm run sync — اجلب ما بُني في المستودع الشقيق إلى هنا، بهويّة هذا المكان.
 *
 * **المشكلة:** المستودعان نسختان من نظامٍ واحد يفترقان في تسعة مواضع هويّة فقط.
 * فنقلُ عملٍ من أحدهما إلى الآخر كان انتقاءً يدويًّا كوميتًا كوميتًا (١٤٥ كوميتًا
 * في أوّل مزامنة)، ثمّ إصلاحًا يدويًّا لمواضع الهويّة التي يعيدها النقل إلى صيغة
 * المصدر. عملٌ طويل يُنسى نصفُه، ونصفُه المنسيّ لا يظهر إلّا بعد النشر.
 *
 * **الحلّ:** أمرٌ واحد يفعل الترتيب كلّه ويقف قبل الدفع:
 *   ١. حرّاس: الشجرة نظيفة · الفرع `main` · الريموت يطابق البطاقة.
 *   ٢. جلبٌ بالعنوان مرّةً واحدة (بلا ربط ريموتٍ دائم — قاعدة `WORKSPACE.md`).
 *   ٣. حارس المحو: إن كان هنا عملٌ خارج مواضع الهويّة ليس عند الشقيق، يقف ويعرضه.
 *   ٤. دمجٌ يرجّح الشقيق عند التعارض — لأنّ ما هنا زيادةً عليه هو الهويّة وحدها.
 *   ٥. استرجاع البطاقة، ثمّ ختم الهويّة، ثمّ توليد الخريطة والهيكل.
 *   ٦. فحصٌ يثبت أنّ الفرق عن الشقيق صار مواضعَ الهويّة لا غير — ثمّ كوميت.
 *
 * لا يدفع. الدفع بأمر المالك وحده («ارفع») — وقبله البوابة الخضراء.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { atRiskOfErasure, tokensOf } from '../src/services/workspace/identity.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ESC = String.fromCharCode(27);
const RED = `${ESC}[31m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const OFF = `${ESC}[0m`;

const force = process.argv.includes('--force');

/** يشغّل git ويعيد مخرجاته نصًّا؛ الفشل يرمي. */
function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

/** مثل `git` لكنّه يبتلع الفشل ويعيد `null` — لِما يُسأل عنه لا لِما يُشترط. */
function gitSoft(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

/**
 * **مسارات الملفّات من git — خامّةً لا مُقتبَسة.** الموضع الوحيد الذي تُقرأ فيه.
 *
 * git يُخرج الاسم غير اللاتينيّ مُقتبَسًا ومهرَّبًا بالثمانيّ
 * (`"docs/\330\271\331\202\330\257…"`) ما لم يُطفأ `core.quotePath` — وهو مطفأٌ
 * على جهاز المالك ومشتعلٌ في مُشغّل GitHub. فكان الاسم العربيّ يعود بشكلٍ لا
 * يعرفه `git show`، فيُحسب الملفّ مفقودًا فعملًا سيُمحى، فيقف حارسُ المحو ويسقط
 * التشغيل — «يعمل عندي» بحرفيّته. و`-z` يُنهيها من جذرها: فصلٌ بالمحرف الصفر
 * بلا اقتباسٍ ولا تهريب، مهما كان الإعداد.
 */
function changedPaths(...args) {
  return git('diff', '--name-only', '-z', ...args)
    .split('\0')
    .filter(Boolean);
}

/** يُظهر مخرجات الأمر للمستخدم مباشرةً (للأوامر الطويلة كالدمج والتوليد). */
function run(cmd, args) {
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
}

function stop(title, body) {
  console.error(`\n${RED}${BOLD}  ✕ ${title}${OFF}\n\n${body}\n`);
  process.exit(1);
}

function step(n, text) {
  console.info(`${DIM}  [${n}/6]${OFF} ${text}`);
}

/** يوحّد شكل عنوان الريموت إلى `owner/repo` (https أو ssh، بـ`.git` أو بدونها). */
function toSlug(url) {
  return String(url)
    .trim()
    .replace(/\.git$/i, '')
    .replace(/^git@[^:]+:/i, '')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .toLowerCase();
}

const card = JSON.parse(readFileSync(join(root, 'workspace.json'), 'utf8'));
const sibling = card.sibling;
const me = tokensOf(card);
const you = tokensOf(sibling);

console.info(
  `\n${BOLD}  مزامنة: ${sibling.name} ${DIM}(${sibling.repo})${OFF}${BOLD} ← إلى → ${card.name} ${DIM}(${card.repo})${OFF}\n`
);

// ═══ ١. الحرّاس ═══════════════════════════════════════════════════════════
step(1, 'حرّاس المكان والحال');

const origin = gitSoft('remote', 'get-url', 'origin');
if (origin && toSlug(origin) !== toSlug(card.repo)) {
  stop(
    'تعارض هويّة',
    `  البطاقة تقول:  ${card.repo}\n  وريموت git يقول: ${toSlug(origin)}\n\n  ${DIM}صحّح أحدهما قبل أيّ مزامنة.${OFF}`
  );
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') {
  stop('الفرع ليس main', `  أنت على «${branch}». المزامنة تُجرى على main وحده.`);
}

if (git('status', '--porcelain')) {
  stop(
    'الشجرة ليست نظيفة',
    `  التزم بما عندك أو خبّئه أوّلًا — الدمج يخلط المُعدَّل بالمجلوب.\n\n${DIM}${git('status', '--short')}${OFF}`
  );
}

// ═══ ٢. الجلب ═════════════════════════════════════════════════════════════
step(2, `جلب main من ${sibling.remote}`);
git('fetch', '--quiet', sibling.remote, 'main');
const theirTip = git('rev-parse', '--short', 'FETCH_HEAD');
const base = git('merge-base', 'HEAD', 'FETCH_HEAD');
const ahead = Number(git('rev-list', '--count', 'FETCH_HEAD..HEAD'));
const behind = Number(git('rev-list', '--count', 'HEAD..FETCH_HEAD'));

console.info(
  `${DIM}      عنده ${behind} كوميتًا ليست هنا · وهنا ${ahead} ليست عنده · الأصل المشترك ${git('rev-parse', '--short', base)}${OFF}`
);

if (behind === 0) {
  console.info(`\n${GREEN}${BOLD}  ✓ متزامنان — لا جديد عند ${sibling.name}.${OFF}\n`);
  process.exit(0);
}

// ═══ ٣. حارس المحو ════════════════════════════════════════════════════════
step(3, 'حارس المحو — هل هنا عملٌ خارج الهويّة؟');

/**
 * مولَّداتٌ يُعاد بناؤها بعد الدمج، فلا معنى لقياس فرقها قبله:
 * البطاقة نفسها، والوثيقة المولَّدة منها، وخريطتا المعمار، ودليلُ الاستخدام.
 */
const GENERATED = new Set([
  'workspace.json',
  'WORKSPACE.md',
  'architecture.json',
  'src/generated/arch-wiki.html',
  'public/دليل-استخدام-البوابة.html',
]);

/** نصُّ ملفٍّ عند مرجعٍ ما، أو `null` إن لم يكن موجودًا هناك. */
function blob(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** نصُّ ملفٍّ كما هو على القرص الآن (بعد الدمج والختم). */
function disk(file) {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch {
    return null;
  }
}

/**
 * الملفّات التي تختلف عن الشقيق بما **لا يفسّره الختم** — أي عملٌ سيُمحى بالترجيح.
 *
 * السؤال عن المضمون لا عن الاسم: لا يكفي أن يكون الملفّ في جدول الهويّة، إذ قد
 * تكون فيه سطورُ عملٍ إلى جانب سطور الهويّة (سكربتٌ أُضيف في `package.json` مثلًا)
 * فتُمحى صامتةً.
 *
 * والحكم في `atRiskOfErasure` — يشترط أن نكون غيّرنا شيئًا عن **الأصل المشترك**
 * قبل أن يشتكي، فلا يصيح لمجرّد أنّ الشقيق تقدّم علينا.
 */
function atRisk(files, readOurs, baseRef) {
  return files.filter((f) => {
    if (GENERATED.has(f)) return false;
    return atRiskOfErasure({
      file: f,
      ours: readOurs(f),
      theirs: blob('FETCH_HEAD', f),
      base: baseRef ? blob(baseRef, f) : null,
      me,
      you,
    });
  });
}

const oursOnly = ahead ? atRisk(changedPaths(base, 'HEAD'), (f) => blob('HEAD', f), base) : [];

if (oursOnly.length && !force) {
  stop(
    `${oursOnly.length} ملفًّا هنا خارج جدول الهويّة وليست عند الشقيق`,
    `  الدمج يرجّح الشقيق، فهذه ستُمحى:\n\n${oursOnly.map((f) => `    · ${f}`).join('\n')}\n\n` +
      `  ${DIM}انقلها إلى الشقيق أوّلًا (cherry-pick)، أو أعِد الأمر بـ --force وأنت تعلم.${OFF}`
  );
}
if (oursOnly.length) {
  console.info(
    `${YELLOW}      --force: ${oursOnly.length} ملفًّا محلّيًّا سيُمحى بترجيح الشقيق.${OFF}`
  );
}

// ═══ ٤. الدمج ═════════════════════════════════════════════════════════════
step(4, `دمج ${theirTip} بترجيح الشقيق`);
try {
  run('git', ['merge', '-X', 'theirs', '--no-ff', '--no-commit', '--quiet', 'FETCH_HEAD']);
} catch {
  const unmerged = changedPaths('--diff-filter=U');
  if (unmerged.length) {
    stop(
      'تعارضٌ لا يحلّه الترجيح (حذفٌ مقابل تعديل غالبًا)',
      `${unmerged.map((f) => `    · ${f}`).join('\n')}\n\n` +
        `  ${DIM}احسمها يدويًّا ثمّ: npm run identity:apply && npm run arch && git commit${OFF}\n` +
        `  ${DIM}أو تراجَع كلّيًّا: git merge --abort${OFF}`
    );
  }
}

// ═══ ٥. الهويّة والتوليد ══════════════════════════════════════════════════
step(5, 'استرجاع البطاقة · ختم الهويّة · توليد الخريطة');
git('checkout', 'HEAD', '--', 'workspace.json');
run('node', ['scripts/identity.mjs', '--apply']);
run('node', ['scripts/build-arch.mjs']);
run('node', ['scripts/build-org.mjs']);
// ★ ودليلُ الاستخدام معها: صفحتُه تحمل **مسارَ النشر وعنوانَه** في كلّ رابطٍ من
// روابطها، فلو لم تُعَد هنا لَحملت عنوانَ الشقيق إلى هذا المستودع — فيقرأ
// الموظّفُ «افتح ‹موقعًا ليس موقعك›»، ويُسقطها حارسُ الهويّة في المسح الشامل
// قبل أن يصل البناءُ الذي كان يُعيد توليدها. (رُصد 2026-08-28.)
run('node', ['scripts/build-scm-manual.mjs']);
run('node', ['scripts/build-usage-guide.mjs']);

// ═══ ٦. البيّنة والكوميت ══════════════════════════════════════════════════
step(6, 'البيّنة: ما الذي يفرّقنا عن الشقيق الآن؟');
run('node', ['scripts/identity.mjs']);

git('add', '-A');
const delta = changedPaths('FETCH_HEAD');
const stray = atRisk(delta, disk);

console.info(`${DIM}      الفرق عن الشقيق: ${delta.length} ملفًّا${OFF}`);
console.info(delta.map((f) => `${DIM}        · ${f}${OFF}`).join('\n'));

if (stray.length && !force) {
  stop(
    `${stray.length} ملفًّا يفرّقنا عن الشقيق بما لا يفسّره الختم`,
    `${stray.map((f) => `    · ${f}`).join('\n')}\n\n  ${DIM}راجعها: git diff FETCH_HEAD -- <ملفّ> · ثمّ git merge --abort للتراجع.${OFF}`
  );
}

git(
  'commit',
  '--no-verify',
  '-m',
  `chore(sync): مزامنة من ${sibling.repo} حتّى ${theirTip}\n\n` +
    `${behind} كوميتًا من ${sibling.name}. الهويّة مختومة من workspace.json،\n` +
    `والفرق عن الشقيق بعدها ${delta.length} ملفّ هويّةٍ لا غير.`
);

console.info(
  `\n${GREEN}${BOLD}  ✓ تمّت المزامنة — ${git('rev-parse', '--short', 'HEAD')}${OFF}\n\n` +
    `  ${DIM}البوابة الخضراء قبل الدفع:${OFF}  npm test && npm run audit && npm run build\n` +
    `  ${DIM}ثمّ:${OFF}  git push origin main\n`
);
