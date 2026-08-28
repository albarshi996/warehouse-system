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
import { scanWorktrees, guardReport } from './guard-worktrees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ESC = String.fromCharCode(27);
const COLORS = {
  cyan: `${ESC}[36m`,
  gold: `${ESC}[33m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
};
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

/** مثل `git` لكنّه يميّز الفشل من المخرَج الفارغ — العدّ يحتاج هذا التمييز. */
function count(...args) {
  const out = git(...args);
  const n = Number(out);
  return out !== '' && Number.isFinite(n) ? n : null;
}

/**
 * الفارق مع الشقيق — جلبٌ قصيرٌ لطرفه ثمّ عدٌّ في الاتّجاهين.
 * يُتجاوَز بصمتٍ إن تعذّرت الشبكة: بطاقةُ المكان لا يجوز أن تحبس الجلسة
 * لأنّ الاتّصال بطيء، فالغياب هنا سكوتٌ لا خطأ.
 */
function siblingGap() {
  try {
    execFileSync('git', ['fetch', '--quiet', ws.sibling.remote, 'main'], {
      cwd: root,
      timeout: 6000,
      stdio: 'ignore',
    });
  } catch {
    return null;
  }
  const theirs = count('rev-list', '--count', 'HEAD..FETCH_HEAD');
  const ours = count('rev-list', '--count', 'FETCH_HEAD..HEAD');
  return theirs === null || ours === null ? null : { theirs, ours };
}

/**
 * سطرُ الفارق — ومعناه يختلف باختلاف الدور:
 * المستقبِل يسأل «هل عنده ما ليس عندي؟»، والمصدرُ يسأل «هل بلغه ما عندي؟».
 * وسؤالُ المصدر لا يعنيه تقدّمُ الشقيق بكوميتات دمجٍ وهويّة، فلا يُنبَّه بها.
 */
function gapLine() {
  const gap = siblingGap();
  if (!gap) return `  ${DIM}◆ تعذّر قياس الفارق مع الشقيق (لا اتّصال؟)${OFF}`;
  if (ws.autoSync) {
    return gap.theirs > 0
      ? `  ${COLORS.gold}◆ عند الشقيق ${gap.theirs} كوميتًا ليست هنا — تصل تلقائيًّا، أو الآن بـ npm run sync${OFF}`
      : `  ${COLORS.green}◆ ملحوقٌ بالشقيق — لا جديد عنده${OFF}`;
  }
  if (gap.ours === 0) return `  ${COLORS.green}◆ الشقيق ملحوقٌ بك — وصله كلّ عملك${OFF}`;
  return ws.sibling.autoSync
    ? `  ${DIM}◆ الشقيق متأخّر ${gap.ours} كوميتًا — ومزامنتُه التلقائيّة تلحقه خلال ساعة${OFF}`
    : `  ${COLORS.gold}◆ الشقيق متأخّر ${gap.ours} كوميتًا — زامِنه من مجلّده: npm run sync${OFF}`;
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
    `${gapLine()}\n\n` +
    `  ${DIM}المستودع الآخر — ${ws.sibling.name} (${ws.sibling.repo}): ${ws.sibling.purpose}\n` +
    `  لجلب ما بُني هناك كلّه — بهويّة هذا المكان، وبلا دفع:\n` +
    `    npm run sync\n` +
    `  ولنقل تصليحٍ مفردٍ دون ربط ريموتٍ دائم:\n` +
    `    git fetch ${ws.sibling.remote} main && git cherry-pick <sha>${OFF}\n`
);

/**
 * ★★★ حارسُ أشجار العمل — يُطبع هنا لأنّ هذا **أوّلُ أمرٍ في كلّ جلسة**.
 *
 * عطبُ 2026-08-28: جلستان عدّلتا سطرَ `gate_officer` نفسَه في يومٍ واحد، وخمسُ
 * قواعدِ Firestore نُشرت ولا وجودَ لها في أيّ كوميت — لأنّ عملَها بقي في
 * مجلّدٍ بلا حفظ. وحارسٌ يحتاج أن يتذكّره أحدٌ ليس حارسًا، فأُلحق بما يُقرأ
 * حتمًا. ويُعلن ولا يمنع — والقرارُ للإنسان.
 */
console.info(guardReport(scanWorktrees(root, Date.now())) + '\n');
