/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  صبُّ تصدير Firebase في قاعدة الجهاز (م٣ · الفصل) — أداةُ التشغيل
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * الهدف: **الاستقلالُ عن قوقل.** بعد `firestore-export.mjs` (ينتج `db/dump/*.ndjson`)،
 * تقرأ هذه الأداةُ التصديرَ وتصبُّه في **ملفّ قاعدة الجهاز نفسِه** الذي يفتحه
 * التطبيقُ (`%APPDATA%\ly.brandzo.hub\bhome.sqlite3`)، ثمّ **تطابق الأعدادَ بصفر
 * فرقٍ** مقابل جرد التصدير — شرطَ العبور قبل قلب الراية.
 *
 * ★★★ نسخٌ لا نقل، باتّجاهٍ واحد: لا يلمس Firebase. والمنطقُ المُختبَر في
 *     `src/services/migrate/importDump.js` و`_db/localSqlite/` — وهذه الأداةُ غلافُ
 *     قراءةِ ملفّاتٍ وفتحِ القاعدة (نفسُ جسر `db.rs`: bhome_db_query/exec/batch).
 *
 * التشغيل (Node 22+ فيه node:sqlite):
 *   node scripts/sqlite-import.mjs                 # من db/dump إلى قاعدة الجهاز
 *   node scripts/sqlite-import.mjs --dry           # يعدّ ويطابق بلا كتابة
 *   node scripts/sqlite-import.mjs --db=<path> --dump=<dir>
 *
 * المخرَج: عددُ ما أُدخل، وجدولُ مطابقةٍ لكلّ مسار، ورمزُ خروجٍ 0 عند صفر فرق.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { createLocalDb } from '../src/services/_db/localSqlite/localDb.js';
import { createSqlStore } from '../src/services/_db/localSqlite/sqlStore.js';
import { parseDumpEntry, importDocuments, expandCounts } from '../src/services/migrate/importDump.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ═══════════════════ الوسائط ═══════════════════ */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const DRY = flag('dry');
const DUMP_DIR = resolve(val('dump') || join(ROOT, 'db', 'dump'));
const DEFAULT_DB = process.env.APPDATA
  ? join(process.env.APPDATA, 'ly.brandzo.hub', 'bhome.sqlite3')
  : join(ROOT, 'bhome.sqlite3');
const DB_PATH = resolve(val('db') || DEFAULT_DB);

/* ═══════════════════ جسرُ SQLite (نظيرُ db.rs) ═══════════════════ */

function openDoor(dbPath) {
  if (!DRY) mkdirSync(dirname(dbPath), { recursive: true });
  const sq = new DatabaseSync(DRY ? ':memory:' : dbPath);
  // المخطّطُ نفسُه الذي يُرحّله db.rs — آمنٌ على قاعدةٍ قائمة (CREATE … IF NOT EXISTS).
  sq.exec(readFileSync(join(ROOT, 'src-tauri', 'migrations', '001-kv-docs.sql'), 'utf8'));
  const invoke = async (cmd, a) => {
    if (cmd === 'bhome_db_query') return sq.prepare(a.sql).all(...(a.params || []));
    if (cmd === 'bhome_db_exec') return sq.prepare(a.sql).run(...(a.params || [])).changes;
    if (cmd === 'bhome_db_batch') {
      sq.exec('BEGIN');
      try {
        for (const s of a.stmts) sq.prepare(s.sql).run(...(s.params || []));
        sq.exec('COMMIT');
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
      return undefined;
    }
    throw new Error(`أمرٌ مجهول: ${cmd}`);
  };
  return { sq, door: createLocalDb({ store: createSqlStore(invoke) }) };
}

/* ═══════════════════ قراءةُ التصدير ═══════════════════ */

/** يقرأ كلَّ ملفّات `*.ndjson` ⟵ مدخلاتُ إدخالٍ مع عددِ كلّ ملفّ. */
export function readDumpEntries(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.ndjson'));
  const entries = [];
  const perFile = {};
  for (const file of files) {
    const base = file.slice(0, -'.ndjson'.length);
    const lines = readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean);
    perFile[base] = lines.length;
    for (const line of lines) entries.push(parseDumpEntry(base, line));
  }
  return { entries, perFile, files };
}

/* ═══════════════════ المسار ═══════════════════ */

async function main() {
  if (!existsSync(DUMP_DIR)) {
    console.error(`X  لا مجلّدَ تصدير: ${DUMP_DIR}`);
    console.error('   صدّر أوّلًا: db\\تصدير-البيانات.bat');
    process.exit(1);
  }

  console.log(`-  التصدير: ${DUMP_DIR}`);
  console.log(`-  قاعدة الجهاز: ${DRY ? '(تجربةٌ جافّةٌ — ذاكرةٌ، بلا كتابة)' : DB_PATH}\n`);

  const { entries, files } = readDumpEntries(DUMP_DIR);
  const { sq, door } = openDoor(DB_PATH);

  if (!DRY) {
    let done = 0;
    await importDocuments(door, entries, {
      onProgress: ({ imported, total }) => {
        if (imported - done >= 2000 || imported === total) {
          process.stdout.write(`\r   أُدخل ${imported.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`);
          done = imported;
        }
      },
    });
    console.log('');
  } else {
    // تجربةٌ جافّة: نُدخل في الذاكرة لنطابق دون لمس قاعدة الجهاز.
    await importDocuments(door, entries);
  }

  // المطابقة: جرد التصدير مقابل أعداد kv_docs الفعليّة.
  const manifestPath = join(DUMP_DIR, '_manifest.json');
  const actualRows = sq.prepare('SELECT collection, COUNT(*) AS n FROM kv_docs GROUP BY collection').all();
  const actual = Object.fromEntries(actualRows.map((r) => [r.collection, Number(r.n) || 0]));

  let allMatch = true;
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const expected = {};
    for (const [path, info] of Object.entries(manifest.paths || {})) {
      if (info && typeof info.count === 'number') expected[path] = info.count;
    }
    const rec = expandCounts(expected, actual);
    allMatch = rec.allMatch;
    console.log(`\n=== المطابقة (${rec.rows.length} مسارًا) ===`);
    for (const r of rec.rows.filter((x) => x.diff !== 0)) {
      console.log(`  XX  ${r.path.padEnd(34)} متوقَّع ${r.want} · فعليّ ${r.got} · فرق ${r.diff}`);
    }
    console.log(allMatch ? '  ✓  صفرُ فرقٍ — مُطابَقٌ تمامًا' : '  X  يوجد فرقٌ — لا يُقطَع قبل حلّه');
  } else {
    console.log('\n!  لا _manifest.json — عُرض العددُ بلا مطابقة.');
  }

  const total = entries.length;
  console.log(`\n=== الخلاصة ===`);
  console.log(`  الملفّات:  ${files.length}`);
  console.log(`  المستندات: ${total.toLocaleString('en-US')}`);
  if (!DRY) console.log(`  القاعدة:   ${DB_PATH}`);

  process.exit(allMatch ? 0 : 1);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((err) => {
    console.error('\nX  فشل الصبّ:', err?.message || err);
    process.exit(1);
  });
}
