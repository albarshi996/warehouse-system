/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها، والقاعدةُ تحمي حزمةَ المتصفّح. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  استيرادُ النسخة إلى PostgreSQL — يولّد SQL ولا يتّصل بشيء
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ **بلا تبعيّةٍ جديدة**: لا `pg` ولا سائقَ اتّصال. يقرأ `db/dump/*.ndjson`
 *   ويكتب `db/dump/_import.sql`، ثمّ يُنفَّذ داخل الحاوية بـ`psql`.
 *   والمخرَجُ **ملفٌّ يُقرأ ويُراجَع قبل تنفيذه** — لا كتابةً عمياء.
 *
 * ★★ **معادُ التشغيل بلا تكرار** (البند ٩): كلُّ إدراجٍ `ON CONFLICT DO UPDATE`
 *    على المفتاح الطبيعيّ. شغّله عشرَ مرّاتٍ ⇒ نفسُ الصفوف، لا نسخةَ ثانية.
 *
 * ★★★ **بلا فقدٍ بالبرهان**: كلُّ حقلٍ لا نعرف له عمودًا يذهب إلى `extra`
 *     ويُطبع في التقرير باسمه. فما لم نخطّط له يُحفظ ويُعلن، ولا يُرمى صامتًا.
 *
 * التشغيل:
 *   node scripts/pg-import.mjs                    # يولّد الملفّ
 *   node scripts/pg-import.mjs --apply            # يولّد ثمّ ينفّذ
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = join(ROOT, 'db', 'dump');
const OUT = join(DUMP, '_import.sql');
const APPLY = process.argv.includes('--apply');

/* ═══════════════════ الخرائطُ المشتركة ═══════════════════ */

// ★★ تعريفٌ واحدٌ لا نسختان: حاويةُ المزامنة تكتب في **نفس** الجداول بنفس
//    المفاتيح. وانحرافُ الخريطتين يُنتج فرقًا يظهر بعد أسابيع ولا يُفسَّر.
import { MAPS, buildUpsert } from '../db/sync/pg-maps.js';

/* ═══════════════════ التوليد ═══════════════════ */

function rowsOf(file) {
  const p = join(DUMP, `${file}.ndjson`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const sql = [];
const report = [];

sql.push('-- مولَّدٌ آليًّا بـ scripts/pg-import.mjs — لا يُحرَّر يدويًّا.');
sql.push('-- معادُ التشغيل: كلُّ إدراجٍ ON CONFLICT DO UPDATE على المفتاح الطبيعيّ.');
sql.push('BEGIN;');
sql.push('');

for (const map of MAPS) {
  const rows = rowsOf(map.file);
  if (rows === null) {
    report.push({ table: map.table, count: 0, note: `الملفّ «${map.file}.ndjson» غير موجود` });
    continue;
  }

  const built = buildUpsert(map, rows);
  if (!built.count) {
    report.push({ table: map.table, count: 0, note: 'لا صفوف' });
    continue;
  }

  sql.push(`-- ${map.table}: ${built.count} صفًّا`);
  sql.push(built.sql);
  sql.push('');

  report.push({ table: map.table, count: built.count, extra: built.extra });
}

sql.push('COMMIT;');
writeFileSync(OUT, sql.join('\n'), 'utf8');

/* ═══════════════════ التقرير ═══════════════════ */

console.log('=== IMPORT PLAN ===\n');
for (const r of report) {
  console.log(`  ${String(r.count).padStart(6)}  ${r.table.padEnd(14)}${r.note ? '  ! ' + r.note : ''}`);
  if (r.extra && r.extra.length) {
    console.log(`          -> extra: ${r.extra.join(', ')}`);
  }
}
console.log(`\n  SQL written: db/dump/_import.sql`);

if (!APPLY) {
  console.log('\n  (not applied. re-run with --apply)');
  process.exit(0);
}

console.log('\n=== APPLYING ===\n');
try {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'warehouse-postgres', 'psql', '-U', 'warehouse', '-d', 'warehouse', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: readFileSync(OUT), encoding: 'utf8' }
  );
  if (out.trim()) console.log(out);
  console.log('  OK - applied.');
} catch (err) {
  console.error('  FAILED:', err.stderr || err.message);
  process.exit(1);
}
