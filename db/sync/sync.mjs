/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المزامنةُ الدوريّة — Firestore ⇦ يُقرأ، PostgreSQL ⇨ يُكتب
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **للقراءة فقط من Firestore، بضمانةٍ بنيويّةٍ لا وعديّة**: لا `setDoc`
 *     ولا `updateDoc` ولا `deleteDoc` ولا `writeBatch` في نطاق هذا الملفّ —
 *     غيرُ مستوردةٍ أصلًا، فيستحيل عليه الكتابةُ في Firebase ولو أراد.
 *     وهذا هو نفسُ حدِّ `firestore-export.mjs`، ولنفس السبب: شرطُ المالك
 *     الأوّل «عدم فقد أو تلف أيّ بياناتٍ موجودةٍ حاليًا».
 *
 * ★★ **ولا تبعيّةَ جديدة**: لا سائقَ `pg`. يولّد SQL ويمرّره إلى `psql` —
 *    نفسُ نمط `pg-import.mjs`. فما يعمل هنا يعمل على سيرفر الشركة بلا تغيير.
 *
 * ═══ ثلاثةُ قراراتٍ يقوم عليها هذا الملفّ، وكلُّها مقيسة ═══
 *
 * ★★★ **١ · لا يُقرأ ما لا يُكتب.** المسارُ الذي لا خريطةَ له في `pg-maps.js`
 *     **لا يُستعلَم أصلًا**. قراءتُه تكلّف حصّةً وتُنتج صفوفًا لا جدولَ لها —
 *     أي إنفاقٌ مقابل لا شيء. ويُسجَّل باسمه في `sync_log` بوسم `unmapped`،
 *     فلا يظنّ أحدٌ أنّه يُزامَن.
 *
 * ★★ **٢ · معرّفاتُ الآباء تُقرأ من PostgreSQL لا من Firestore.** المجموعةُ
 *    الفرعيّةُ تحتاج آباءَها، وقراءتُهم من المصدر تعني ١٧٥ قراءةً إضافيّة كلَّ
 *    دورة. وهم **مرآةٌ عندنا فعلًا** — فتُقرأ مجّانًا من الجدول.
 *
 * ★★★ **٣ · الوتيرةُ مُدرَّجة.** والسببُ رقمٌ: الوتيرةُ الموحّدةُ كلَّ دقيقتين
 *     تساوي ٤٥٨٬٦٤٠ قراءةً يوميًّا — تسعةُ أضعاف الحصّة. (البرهانُ في
 *     `watermark.test.js`، والحسابُ في `watermark.js`.)
 *
 * التشغيل:
 *   node db/sync/sync.mjs --once      دورةٌ واحدةٌ ثمّ خروج (للتجربة)
 *   node db/sync/sync.mjs --dry       يقرأ ويحسب ولا يكتب في القاعدة
 *   node db/sync/sync.mjs --plan      يطبع الخطّةَ والكلفةَ ولا يتّصل بشيء
 *   node db/sync/sync.mjs             الحلقةُ الدائمة (داخل الحاوية)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { pathsFromRules, appendOnlyFromRules } from './rules-paths.js';
import { planFor, advanceWatermark, windowStart, isDue, idleReadsPerDay, MODE } from './watermark.js';
import { mapForPath, buildUpsert, lit } from './pg-maps.js';

/**
 * ★★ Firebase يُحمَّل **عند الحاجة لا عند الاستيراد**.
 *
 * والسببُ ليس أناقة: `--plan` يَعِد بأنّه «لا يتّصل بشيء»، ووعدٌ يكسره سطرُ
 * `import` ساكنٌ في أعلى الملفّ وعدٌ كاذب — يسقط الأمرُ في شجرةِ عملٍ بلا
 * حزم، وفي أيّ بيئةٍ لم تُنصَّب فيها المكتبة. فصار الوعدُ صحيحًا بنيويًّا.
 *
 * ⚠️ والقائمةُ مقصودةٌ ومحدودة: **لا `setDoc` ولا `updateDoc` ولا `deleteDoc`
 *    ولا `writeBatch`** — فيستحيل على هذا الملفّ الكتابةُ في Firebase.
 */
async function loadFirebase() {
  const [{ initializeApp }, { getAuth, signInWithEmailAndPassword }, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  const { serialize } = await import('../../scripts/firestore-serialize.mjs');
  return { initializeApp, getAuth, signInWithEmailAndPassword, fs, serialize };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PAGE = 500;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const ONCE = flag('once');
const DRY = flag('dry');
const PLAN_ONLY = flag('plan');

/* ═══════════════════ القاعدة — عبر psql بلا سائق ═══════════════════ */

const PSQL = process.env.PSQL_BIN || 'psql';

/** ينفّذ SQL ويُعيد المخرَج نصًّا. الفشلُ يُرمى ولا يُبتلع. */
function psql(sql, { tuplesOnly = false } = {}) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-q'];
  if (tuplesOnly) args.push('-t', '-A', '-F', '\t');
  return execFileSync(PSQL, args, { input: sql, encoding: 'utf8' });
}

/** صفوفٌ كمصفوفاتِ أعمدة. */
function psqlRows(sql) {
  const out = psql(sql, { tuplesOnly: true }).trim();
  return out ? out.split('\n').map((l) => l.split('\t')) : [];
}

/* ═══════════════════ الخطّة ═══════════════════ */

const RULES = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
const INVENTORY = JSON.parse(readFileSync(join(HERE, 'inventory.measured.json'), 'utf8'));

const PATHS = pathsFromRules(RULES);
const APPEND_ONLY = appendOnlyFromRules(RULES);

// فهرسُ المجموعات معطَّل، ولا يلزم اليوم: لا مسارَ فرعيًّا مُنمذَجًا أصلًا.
// ويصير لازمًا يومَ تُنمذَج أوّلُ مجموعةٍ فرعيّة — وحينها يُنشأ الفهرسُ ويُنشر،
// فترتفع الفرعيّاتُ من «بارد» وتهبط الأرضيّةُ من ١٧٨٠٨ إلى ٦٤٨٠ قراءةً يوميًّا.
const COLLECTION_GROUP = process.env.SYNC_COLLECTION_GROUP === '1';

const PLAN = planFor(INVENTORY, {
  appendOnly: APPEND_ONLY,
  collectionGroup: COLLECTION_GROUP,
  paths: PATHS,
});

/** المساراتُ التي لها جدولٌ فعلًا — وهي وحدَها ما يُقرأ. */
const MAPPED = PATHS.filter((p) => mapForPath(p));

/* ═══════════════════ القراءة من Firestore ═══════════════════ */

/**
 * يقرأ مسارًا صفحةً صفحة، ويُعيد الصفوفَ وعددَ الاستعلامات التي كلّفها.
 * ★ `queries` هو ما تحاسبنا عليه Firestore — قراءةٌ لكلّ استعلامٍ ولو عاد فارغًا.
 */
async function readPath(fb, db, segments, { field, since }) {
  const { collection, query, where, orderBy, limit: fsLimit, startAfter, getDocs, documentId, Timestamp } = fb.fs;

  // ★★★ حارسٌ لا تجميل: `collection(db, 'documents', 'audit')` **مسارُ مستندٍ
  //     لا مجموعة** — فلو مُرِّر مسارٌ فرعيٌّ هنا لقرأ Firestore شيئًا آخر
  //     تمامًا ولم يشتكِ. والمجموعةُ الفرعيّةُ تحتاج معرّفَ أبٍ بين المقطعين،
  //     ولا خريطةَ لأيّ مسارٍ فرعيٍّ اليوم. فيُرفض صراحةً بدل أن يُخطئ صامتًا.
  if (segments.length > 1) {
    throw new Error(
      `مسارٌ فرعيّ «${segments.join('/')}» — يحتاج المرورَ على الآباء، وهو غيرُ مُنفَّذٍ بعد.`
    );
  }

  const rows = [];
  let queries = 0;
  let cursor = null;

  for (;;) {
    const parts = field
      ? [orderBy(field), fsLimit(PAGE)]
      : [orderBy(documentId()), fsLimit(PAGE)];

    if (field && since) {
      parts.unshift(where(field, '>', Timestamp.fromDate(new Date(since))));
    }
    if (cursor) parts.push(startAfter(cursor));

    const snap = await getDocs(query(collection(db, ...segments), ...parts));
    queries += 1;

    for (const d of snap.docs) rows.push({ __id: d.id, ...fb.serialize(d.data()) });
    if (snap.docs.length < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return { rows, queries };
}

/* ═══════════════════ الدورة ═══════════════════ */

/** حالةُ كلّ مسارٍ من القاعدة: العلامةُ المائيّةُ المحفوظة. */
function loadState() {
  const state = {};
  for (const [path, mark] of psqlRows('SELECT path, watermark FROM sync_state;')) {
    state[path] = mark && mark !== '' ? mark : null;
  }
  return state;
}

/** سطرُ سجلٍّ لكلّ مسارٍ في كلّ دورة — والفشلُ يُسمّى. */
function logCycle(entries) {
  if (!entries.length) return;
  const values = entries
    .map(
      (e) =>
        `  (${lit(e.cycleId)}, ${lit(e.path)}, ${lit(e.mode)}, ${e.field ? lit(e.field) : 'NULL'},` +
        ` ${e.windowStart ? `${lit(e.windowStart)}::timestamptz` : 'NULL'},` +
        ` ${e.before ? `${lit(e.before)}::timestamptz` : 'NULL'},` +
        ` ${e.after ? `${lit(e.after)}::timestamptz` : 'NULL'},` +
        ` ${e.queries}, ${e.docs}, ${e.written}, ${e.ok ? 'TRUE' : 'FALSE'},` +
        ` ${e.error ? lit(e.error.slice(0, 2000)) : 'NULL'}, ${lit(e.startedAt)}::timestamptz)`
    )
    .join(',\n');

  psql(
    'INSERT INTO sync_log (cycle_id, path, mode, mark_field, window_start,' +
      ' watermark_before, watermark_after, queries, docs_read, rows_written, ok, error,' +
      ` started_at) VALUES\n${values};`
  );
}

/** يحفظ العلامةَ الجديدة. */
function saveState(path, plan, watermark) {
  psql(
    `INSERT INTO sync_state (path, mode, mark_field, watermark, last_run_at) VALUES (` +
      `${lit(path)}, ${lit(plan.mode)}, ${plan.field ? lit(plan.field) : 'NULL'},` +
      ` ${watermark ? `${lit(watermark)}::timestamptz` : 'NULL'}, now())` +
      ' ON CONFLICT (path) DO UPDATE SET mode = EXCLUDED.mode, mark_field = EXCLUDED.mark_field,' +
      ' watermark = EXCLUDED.watermark, last_run_at = EXCLUDED.last_run_at;'
  );
}

async function runCycle(fb, db, minute) {
  const cycleId = randomUUID();
  // ★ الحالةُ تُقرأ حتّى في `--dry`. ولو أُهملت، لبدأت التجربةُ من الصفر
  //   فقرأت **كلَّ شيءٍ** من Firestore — أي إنفاقُ الحصّة لأجل بروفة.
  const state = loadState();
  const entries = [];
  let totalQueries = 0;
  let totalDocs = 0;

  for (const path of MAPPED) {
    const plan = PLAN[path];
    if (!isDue(PLAN, path, minute)) continue;

    const startedAt = new Date().toISOString();
    const before = plan.mode === MODE.INCREMENTAL ? state[path] || null : null;
    const from = windowStart(before);

    try {
      const { rows, queries } = await readPath(fb, db, path.split('/'), {
        field: plan.mode === MODE.INCREMENTAL ? plan.field : null,
        since: from,
      });

      totalQueries += queries;
      totalDocs += rows.length;

      let written = 0;
      if (rows.length) {
        const built = buildUpsert(mapForPath(path), rows);
        written = built.count;
        if (!DRY) psql(`BEGIN;\n${built.sql}\nCOMMIT;`);
      }

      const after =
        plan.mode === MODE.INCREMENTAL ? advanceWatermark(before, rows, plan.field) : null;

      if (!DRY) saveState(path, plan, after);

      entries.push({
        cycleId, path, mode: plan.mode, field: plan.field, windowStart: from,
        before, after, queries, docs: rows.length, written, ok: true, error: null, startedAt,
      });

      console.log(
        `  ok  ${path.padEnd(24)} ${plan.mode.padEnd(11)}` +
          ` q=${String(queries).padStart(3)} docs=${String(rows.length).padStart(5)}` +
          ` -> ${written}`
      );
    } catch (err) {
      // ★ يُسجَّل ولا يُبتلع: مزامنةٌ تفشل صامتةً تُنتج فرقًا لا يُكتشف.
      const msg = String(err?.code || err?.message || err);
      entries.push({
        cycleId, path, mode: plan.mode, field: plan.field, windowStart: from,
        before, after: null, queries: 0, docs: 0, written: 0, ok: false, error: msg, startedAt,
      });
      console.error(`  XX  ${path.padEnd(24)} ${msg}`);
    }
  }

  if (!DRY) logCycle(entries);
  return { cycleId, paths: entries.length, totalQueries, totalDocs };
}

/* ═══════════════════ المسار ═══════════════════ */

function printPlan() {
  const unmapped = PATHS.filter((p) => !mapForPath(p));
  console.log('=== SYNC PLAN ===\n');
  console.log(`  المساراتُ في القواعد:   ${PATHS.length}`);
  console.log(`  المنمذَجةُ (تُقرأ):      ${MAPPED.length}  ${MAPPED.join(' · ')}`);
  console.log(`  غيرُ المنمذَجة (لا تُقرأ): ${unmapped.length}`);
  console.log(`  فهرسُ المجموعات:       ${COLLECTION_GROUP ? 'مُفعَّل' : 'معطَّل'}\n`);

  for (const path of MAPPED) {
    const p = PLAN[path];
    console.log(
      `  ${path.padEnd(20)} ${p.mode.padEnd(12)} ${String(p.field || '-').padEnd(10)}` +
        ` كلَّ ${String(p.tier).padStart(2)} د   ${p.why}`
    );
  }

  const mappedPlan = Object.fromEntries(MAPPED.map((p) => [p, PLAN[p]]));
  console.log(`\n  أرضيّةُ القراءات (المنمذَجةُ وحدَها): ${idleReadsPerDay(mappedPlan)} / يوم`);
  console.log(`  أرضيّةُ القراءات (الخطّةُ كاملةً):    ${idleReadsPerDay(PLAN)} / يوم`);
  console.log('  الحصّةُ المجّانيّة: 50000 / يوم');
}

async function main() {
  if (PLAN_ONLY) {
    printPlan();
    return;
  }

  const email = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;
  if (!email || !password) {
    console.error('X  FIREBASE_EMAIL and FIREBASE_PASSWORD are required.');
    process.exit(1);
  }

  const fb = await loadFirebase();
  const app = fb.initializeApp({
    apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PUBLIC_FIREBASE_APP_ID,
  });

  const db = fb.fs.initializeFirestore(app, { experimentalForceLongPolling: true });
  const cred = await fb.signInWithEmailAndPassword(fb.getAuth(app), email, password);
  console.log(`-  signed in: ${cred.user.email}`);

  printPlan();

  let minute = 0;
  for (;;) {
    console.log(`\n--- cycle @ minute ${minute} ---`);
    const res = await runCycle(fb, db, minute);
    console.log(`    paths=${res.paths} queries=${res.totalQueries} docs=${res.totalDocs}`);

    if (ONCE) break;
    // خطوةُ دقيقةٍ واحدة: الجدولةُ كلُّها في `isDue` بحسب طبقةِ كلّ مسار.
    await new Promise((r) => setTimeout(r, 60_000));
    minute += 1;
  }
}

main().catch((err) => {
  console.error('\nX  sync failed:', err?.message || err);
  process.exit(1);
});
