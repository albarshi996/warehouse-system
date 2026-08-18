#!/usr/bin/env node
/**
 * npm run where — يجيب سؤالًا واحدًا قبل أيّ عمل: في أيّ مستودعٍ أنا، وبأيّ قواعد، وإلى أين أدفع؟
 *
 * يقرأ `workspace.json` ثمّ يقابله بريموت git الفعليّ. الاختلاف يوقف التنفيذ بخطأ،
 * لأنّ بطاقة هويّةٍ منسوخة إلى المستودع الخطأ أخطر من غيابها: تطمئنك وأنت في المكان الغلط.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ESC = String.fromCharCode(27);
const COLORS = { cyan: `${ESC}[36m`, gold: `${ESC}[33m`, red: `${ESC}[31m` };
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const OFF = `${ESC}[0m`;

/** يوحّد شكل عنوان الريموت إلى `owner/repo` ليقارَن بأمان (https أو ssh، بـ.git أو بدونها). */
function toSlug(url) {
  return String(url)
    .trim()
    .replace(/\.git$/i, '')
    .replace(/^git@[^:]+:/i, '')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .toLowerCase();
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const ws = JSON.parse(readFileSync(join(root, 'workspace.json'), 'utf8'));
const originUrl = git('remote', 'get-url', 'origin');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '(غير معروف)';

if (originUrl && toSlug(originUrl) !== toSlug(ws.repo)) {
  console.error(
    `\n${COLORS.red}${BOLD}  ✕ تعارض هويّة${OFF}\n\n` +
      `  بطاقة الهويّة تقول:  ${ws.repo}\n` +
      `  وريموت git يقول:    ${toSlug(originUrl)}\n\n` +
      `  ${DIM}توقّف. إمّا أنّ workspace.json نُسخ إلى المستودع الخطأ، وإمّا أنّ الريموت تغيّر.\n` +
      `  صحّح أحدهما قبل أيّ عمل — لا تدفع وأنت في هذه الحالة.${OFF}\n`
  );
  process.exit(1);
}

const c = COLORS[ws.color] ?? COLORS.cyan;
const push = originUrl ? `origin ← ${toSlug(originUrl)}` : '(لا ريموت origin)';

console.info(
  `\n${c}${BOLD}  ● ${ws.name}${OFF}${c} — ${ws.repo}${OFF}\n\n` +
    `  · الغرض: ${ws.purpose}\n` +
    `  · القواعد: ${ws.rules}\n` +
    `  · تدفع إلى: ${push}\n` +
    `  · الفرع الحاليّ: ${branch}\n` +
    `  · النشر: ${ws.pages}\n\n` +
    `  ${DIM}المستودع الآخر — ${ws.sibling.name} (${ws.sibling.repo}): ${ws.sibling.purpose}\n` +
    `  لجلب ما بُني هناك كلّه — بهويّة هذا المكان، وبلا دفع:\n` +
    `    npm run sync\n` +
    `  ولنقل تصليحٍ مفردٍ دون ربط ريموتٍ دائم:\n` +
    `    git fetch ${ws.sibling.remote} main && git cherry-pick <sha>${OFF}\n`
);
