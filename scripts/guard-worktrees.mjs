#!/usr/bin/env node
/**
 * حارسُ أشجار العمل — `npm run guard` (ويُستدعى من `npm run where`).
 *
 * ═══ العطبُ الذي وقع فعلًا 2026-08-28 ═══
 * جلستان تعملان على المشروع نفسِه ولا ترى إحداهما الأخرى، فعدّلتا **سطرَ
 * `gate_officer` نفسَه** في `navAccess.js` في يومٍ واحد. وأسوأُ منه: قواعدُ
 * Firestore لخمس مجموعاتٍ (`barcodes` · `dock_sessions` · `shipments` …)
 * **نُشرت في Firebase ولا وجودَ لها في أيّ كوميت** — لأنّ عملَها بقي في
 * مجلّدٍ بلا حفظ. فبحثتُ في ١١٨ فرعًا و٣٤ كوميتًا سائبًا وقلتُ «لا وجود لها»
 * وهي أمامي في شجرةِ عملٍ لم أنظر فيها.
 *
 * ═══ ولماذا يُدمج في `where` لا يُترك أمرًا مستقلًّا؟ ═══
 * لأنّ `npm run where` **أوّلُ أمرٍ في كلّ جلسة** بنصّ الدستور. وحارسٌ يحتاج
 * أن يتذكّره أحدٌ ليس حارسًا. فمن يفتح جلسةً يرى فورًا: **أين عملٌ غيرُ محفوظ،
 * ومن يعمل الآن على ما أعمل عليه.**
 *
 * ولا يمنع شيئًا ولا يحذف شيئًا — **يُعلن ويُسمّي**. والقرارُ للإنسان.
 *
 * لا شبكة ولا Firebase — قراءةُ git فقط، فيصلح للـCI.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';
const GOLD = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

/** ملفّاتٌ مشتركةٌ يتصادم عليها وكيلان — قِيست من عطبِ 2026-08-28. */
export const SHARED_FILES = Object.freeze([
  'src/services/auth/navCatalog.js',
  'src/services/auth/navAccess.js',
  'firestore.rules',
  'src/data/usage-guide.json',
  'SESSION_HANDOFF.md',
  'architecture.json',
]);

/** كم يومًا حتّى يُعدّ العملُ غيرُ المحفوظ «مهجورًا» فيُرفع صوتُ التحذير. */
export const STALE_DAYS = 7;

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** أشجارُ العمل كما يراها git — بمسارها وفرعها. */
export function listWorktrees(root) {
  const out = [];
  let cur = null;
  for (const line of git(['worktree', 'list', '--porcelain'], root).split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9).trim(), branch: '' };
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice(7).replace('refs/heads/', '').trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * حصيلةُ شجرةٍ واحدة: كم ملفًّا غيرَ محفوظ، وأيُّ ملفٍّ مشتركٍ منها.
 *
 * ★ والملفُّ المشترك يُسمّى بعينه: «٣٨ ملفًّا» لا تقول شيئًا، أمّا
 * «تعدّل `navAccess.js` وأنت تعدّله» فتوقف اليد.
 */
export function inspectWorktree(wt, nowMs) {
  if (!fs.existsSync(wt.path)) return null;
  const status = git(['status', '--short'], wt.path).split('\n').filter(Boolean);
  if (status.length === 0) return null;

  const files = status.map((l) => l.slice(3).trim());
  const shared = SHARED_FILES.filter((f) => files.some((x) => x === f || x.endsWith(`/${f}`)));
  const lastIso = git(['log', '-1', '--format=%cI'], wt.path).trim();
  const lastMs = lastIso ? Date.parse(lastIso) : NaN;
  const days = Number.isFinite(lastMs) && Number.isFinite(nowMs) ? Math.floor((nowMs - lastMs) / 86400000) : null;

  return { name: path.basename(wt.path), branch: wt.branch, count: status.length, shared, days };
}

/** الحصيلةُ كلُّها — مرتّبةً: ما يتصادم أوّلًا، ثمّ الأكبرُ عملًا. */
export function scanWorktrees(root, nowMs) {
  const rows = listWorktrees(root)
    .map((w) => inspectWorktree(w, nowMs))
    .filter(Boolean)
    .sort((a, b) => (b.shared.length - a.shared.length) || (b.count - a.count));

  return {
    rows,
    dirty: rows.length,
    colliding: rows.filter((r) => r.shared.length > 0),
    stale: rows.filter((r) => r.days !== null && r.days >= STALE_DAYS),
  };
}

/** نصُّ التقرير — يُعاد نصًّا كي يُختبر بلا طباعة. */
export function guardReport(scan) {
  if (scan.dirty === 0) return `  ${GREEN}◆ لا شجرةَ عملٍ فيها تعديلٌ غيرُ محفوظ${OFF}`;

  const lines = [
    `  ${GOLD}${BOLD}◆ ${scan.dirty} شجرةَ عملٍ فيها تعديلٌ غيرُ محفوظ${OFF}` +
      (scan.stale.length ? `${DIM} — منها ${scan.stale.length} مهجورةٌ منذ ${STALE_DAYS}+ أيّام${OFF}` : ''),
  ];

  if (scan.colliding.length) {
    lines.push(
      `  ${RED}${BOLD}⚠ ${scan.colliding.length} منها تعدّل ملفًّا مشتركًا — تصادمٌ محتمَل:${OFF}`
    );
    for (const r of scan.colliding.slice(0, 5)) {
      lines.push(`    ${RED}·${OFF} ${r.name} ${DIM}(${r.branch})${OFF} → ${r.shared.join(' · ')}`);
    }
  }

  const others = scan.rows.filter((r) => r.shared.length === 0).slice(0, 3);
  for (const r of others) {
    lines.push(`    ${DIM}· ${r.name} — ${r.count} ملفًّا${r.days !== null ? ` · آخر كوميت قبل ${r.days} يومًا` : ''}${OFF}`);
  }
  const hidden = scan.dirty - Math.min(scan.colliding.length, 5) - others.length;
  if (hidden > 0) lines.push(`    ${DIM}· و${hidden} أخرى — القائمة كاملةً: npm run guard${OFF}`);

  lines.push(`  ${DIM}لا يمنع شيئًا ولا يحذف — يُعلن. وقبل تعديل ملفٍّ مشترك: انظر من يعدّله معك.${OFF}`);
  return lines.join('\n');
}

/* ═══════════════ التشغيل المباشر ═══════════════ */

// ★ `fileURLToPath` لا `new URL().pathname`: مسارُ هذا المشروع عربيٌّ
// (`العمليات اليومية`) فيصل من الرابط **مُرمَّزًا** — وهو المزلقُ نفسُه الذي
// أُصلح في سكربت المزامنة. والخطأُ صامت: يعود المسارُ سليمَ الشكل، ويعود
// `git` بفراغٍ فيُقال «لا شجرةَ فيها عملٌ غيرُ محفوظ» وهي إحدى وعشرون.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && process.argv[1].endsWith('guard-worktrees.mjs')) {
  const scan = scanWorktrees(ROOT, Date.now());
  console.info(`\n${BOLD}حارسُ أشجار العمل${OFF}\n`);
  console.info(guardReport(scan));

  if (process.argv.includes('--all') && scan.dirty > 0) {
    console.info(`\n${BOLD}القائمة كاملةً:${OFF}`);
    for (const r of scan.rows) {
      const mark = r.shared.length ? `${RED}⚠${OFF}` : ' ';
      console.info(
        `  ${mark} ${r.name.padEnd(42)} ${String(r.count).padStart(3)} ملفًّا` +
          (r.days !== null ? ` · ${String(r.days).padStart(3)} يومًا` : '') +
          (r.shared.length ? ` · ${RED}${r.shared.join(' · ')}${OFF}` : '')
      );
    }
  }
  console.info('');
}
