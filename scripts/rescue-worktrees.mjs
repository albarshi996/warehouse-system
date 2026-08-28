#!/usr/bin/env node
/**
 * إنقاذُ العمل غير المحفوظ — `npm run rescue`
 *
 * ═══ العطبُ الذي يمنعه ═══
 * جرد 2026-08-28: **٢٢ شجرةَ عملٍ فيها عملٌ غيرُ محفوظ**، أكبرُها ٤٨ ملفًّا
 * مهجورةً منذ أربعة أسابيع. ومجلّدٌ يُمسح يمحو ما فيه بلا أثر — وقد وقع فعلًا:
 * خمسُ مجموعاتِ قواعدَ منشورةٌ في Firebase ولا وجودَ لكودها في أيّ كوميت.
 *
 * ═══ ★★★ ولا يلمس شجرةَ عملٍ واحدة ═══
 * الطريقةُ الساذجة `git commit` في كلّ شجرة **تُحرّك HEAD تحت اثنتين وعشرين
 * جلسة** — فتجد جلسةٌ نفسَها في حالةٍ لم تصنعها. وهذا سبيلٌ إلى فوضى أكبر من
 * التي نصلحها.
 *
 * فالمستعمَل هنا **سباكةُ git**: فهرسٌ مؤقّتٌ في ملفٍّ منفصل ← `write-tree` ←
 * `commit-tree` ← فرعُ إنقاذ. والنتيجة: كوميتٌ كاملٌ يحمل كلّ شيء، **وشجرةُ
 * العمل لم تتغيّر بحرف**: لا HEAD تحرّك، ولا فهرسٌ لُمس، ولا ملفٌّ نُقل.
 * تفتح الجلسةُ غدًا فتجد عملَها كما تركته — ومعه نسخةٌ محفوظةٌ في فرع.
 *
 * ═══ ولا يُدفع شيء ═══
 * فروعٌ محلّيّةٌ فقط. الدفعُ بأمر المالك وحده (الدستور، بند ٣).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanWorktrees, listWorktrees } from './guard-worktrees.mjs';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';
const GREEN = '\x1b[32m';
const GOLD = '\x1b[33m';
const RED = '\x1b[31m';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

/** بادئةُ فروع الإنقاذ — تُميّزها فلا تختلط بفروع العمل. */
export const RESCUE_PREFIX = 'wip/';

/** اسمُ فرع الإنقاذ لشجرةٍ في يوم — حتميٌّ فإعادةُ التشغيل لا تُضاعف. */
export function rescueBranchName(worktreeName, stamp) {
  const safe = String(worktreeName).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  return `${RESCUE_PREFIX}${safe}-${stamp}`;
}

/**
 * ★★ ينقذ شجرةً واحدة **بلا لمسها**.
 *
 * @returns {{ok:boolean, branch?:string, sha?:string, reason?:string}}
 */
export function rescueWorktree(wtPath, branchName) {
  // فهرسٌ مؤقّتٌ خارج المستودع — فلا يُمسّ `.git/index` الذي تعمل عليه الجلسة.
  const idx = path.join(os.tmpdir(), `bz-rescue-${process.pid}-${Math.abs(hash(wtPath))}.idx`);
  try {
    const env = { ...process.env, GIT_INDEX_FILE: idx };
    // `add -A` يحترم `.gitignore` — فلا `node_modules` ولا `dist`.
    git(['add', '-A'], { cwd: wtPath, env });
    const tree = git(['write-tree'], { cwd: wtPath, env });

    const head = git(['rev-parse', 'HEAD'], { cwd: wtPath });
    const headTree = git(['rev-parse', 'HEAD^{tree}'], { cwd: wtPath });
    if (tree === headTree) return { ok: false, reason: 'لا فرقَ عن آخر كوميت' };

    const message =
      `wip(rescue): حفظُ عملٍ غير مُودَعٍ من ${path.basename(wtPath)}\n\n` +
      `أُنشئ آليًّا بـ\`npm run rescue\` (جرد 2026-08-28) كي لا يضيع عملٌ يعيش في\n` +
      `مجلّدٍ بلا كوميت. **ولم تُلمس شجرةُ العمل**: لا HEAD تحرّك ولا فهرسٌ مُسّ —\n` +
      `بُني الكوميتُ بفهرسٍ مؤقّتٍ منفصل (write-tree ثمّ commit-tree).\n\n` +
      `لاستئناف العمل عليه:  git checkout ${branchName}\n` +
      `ولمقارنته بفرعه:      git diff ${head}..${branchName}\n`;

    const sha = git(['commit-tree', tree, '-p', head, '-m', message], { cwd: wtPath });
    git(['branch', '-f', branchName, sha], { cwd: wtPath });
    return { ok: true, branch: branchName, sha: sha.slice(0, 7) };
  } catch (e) {
    return { ok: false, reason: (e?.stderr || e?.message || 'خطأٌ غير معروف').toString().split('\n')[0] };
  } finally {
    try {
      fs.unlinkSync(idx);
    } catch {
      /* الفهرسُ المؤقّت لم يُنشأ — لا شيء يُحذف */
    }
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ═══════════════ التشغيل ═══════════════ */

if (process.argv[1] && process.argv[1].endsWith('rescue-worktrees.mjs')) {
  const dry = process.argv.includes('--dry');
  const stamp = (process.argv.find((a) => a.startsWith('--stamp=')) || '--stamp=').slice(8) || 'now';

  const scan = scanWorktrees(ROOT, Date.now());
  const byName = new Map(listWorktrees(ROOT).map((w) => [path.basename(w.path), w.path]));

  console.info(`\n${BOLD}إنقاذُ العمل غير المحفوظ${OFF}${dry ? `${DIM} — تجربةٌ بلا كتابة${OFF}` : ''}\n`);
  if (scan.dirty === 0) {
    console.info(`  ${GREEN}◆ لا شيء يحتاج إنقاذًا${OFF}\n`);
    process.exit(0);
  }

  let saved = 0;
  let skipped = 0;
  for (const row of scan.rows) {
    const wtPath = byName.get(row.name);
    if (!wtPath) continue;
    const branch = rescueBranchName(row.name, stamp);

    if (dry) {
      console.info(`  ${DIM}·${OFF} ${row.name.padEnd(44)} ${String(row.count).padStart(3)} ملفًّا → ${branch}`);
      saved += 1;
      continue;
    }

    const r = rescueWorktree(wtPath, branch);
    if (r.ok) {
      console.info(`  ${GREEN}✔${OFF} ${row.name.padEnd(44)} ${String(row.count).padStart(3)} ملفًّا → ${branch} ${DIM}(${r.sha})${OFF}`);
      saved += 1;
    } else {
      console.info(`  ${GOLD}—${OFF} ${row.name.padEnd(44)} ${DIM}${r.reason}${OFF}`);
      skipped += 1;
    }
  }

  console.info(
    `\n  ${BOLD}${saved}${OFF} شجرةً ${dry ? 'ستُنقَذ' : 'أُنقذت'}` +
      (skipped ? ` · ${skipped} تُخطّيت` : '') +
      `\n  ${DIM}فروعٌ محلّيّةٌ بلا دفع. ولم تُلمس شجرةُ عملٍ واحدة — افتح أيّ جلسةٍ تجدها كما تركتها.${OFF}\n`
  );
  if (!dry) console.info(`  ${DIM}للمراجعة: git branch --list '${RESCUE_PREFIX}*'${OFF}\n`);
  if (skipped && !dry) console.info(`  ${RED}راجع المتخطَّاة يدويًّا قبل حذف أيّ مجلّد.${OFF}\n`);
}
