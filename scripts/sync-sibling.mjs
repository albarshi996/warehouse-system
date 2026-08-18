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
import { SPOTS } from '../src/services/workspace/identity.js';

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

/** ما يُسمح أن يختلف هنا عن الشقيق: مواضع الهويّة والوثيقتان المولَّدتان والمولَّد آليًّا. */
const OWNED = new Set([
  ...SPOTS.map((s) => s.file),
  'workspace.json',
  'WORKSPACE.md',
  'AGENTS.md',
  'architecture.json',
  'src/generated/arch-wiki.html',
]);

const oursOnly = ahead
  ? git('diff', '--name-only', base, 'HEAD')
      .split('\n')
      .filter(Boolean)
      .filter((f) => !OWNED.has(f))
  : [];

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
  const unmerged = gitSoft('diff', '--name-only', '--diff-filter=U') || '';
  if (unmerged) {
    stop(
      'تعارضٌ لا يحلّه الترجيح (حذفٌ مقابل تعديل غالبًا)',
      `${unmerged
        .split('\n')
        .map((f) => `    · ${f}`)
        .join(
          '\n'
        )}\n\n  ${DIM}احسمها يدويًّا ثمّ: npm run identity:apply && npm run arch && git commit${OFF}\n` +
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

// ═══ ٦. البيّنة والكوميت ══════════════════════════════════════════════════
step(6, 'البيّنة: ما الذي يفرّقنا عن الشقيق الآن؟');
run('node', ['scripts/identity.mjs']);

git('add', '-A');
const delta = git('diff', '--name-only', 'FETCH_HEAD').split('\n').filter(Boolean);
const stray = delta.filter((f) => !OWNED.has(f));

console.info(`${DIM}      الفرق عن الشقيق: ${delta.length} ملفًّا${OFF}`);
console.info(delta.map((f) => `${DIM}        · ${f}${OFF}`).join('\n'));

if (stray.length && !force) {
  stop(
    `${stray.length} ملفًّا يفرّقنا عن الشقيق خارج جدول الهويّة`,
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
