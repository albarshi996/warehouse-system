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
import {
  planFor, advanceWatermark, windowStart, isDue, idleReadsPerDay, MODE,
  BUDGET_READS_PER_DAY, readsTodayOrCap, capReached,
} from './watermark.js';
import { mapForPath, genericMapFor, buildUpsert, lit } from './pg-maps.js';
// ★ سلسلةٌ خالصةٌ بلا Firestore (مُتحقَّقٌ منها): اشتقاقُ القيد المزدوج وعقدُ
//   نداء باب القاعدة فقط — لا write APIs، فلا يُخلّ بضمانة هذا الملفّ البنيويّة.
import { ledgerCallBodies, POSTABLE_STATES } from '../../src/services/accounting/ledgerSync.js';
import { LEDGER_DOC_TYPES } from '../../src/services/accounting/deriveEntries.js';

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

/**
 * أمرُ `psql` كاملًا.
 *
 * ★ داخل الحاوية: `psql` مباشرةً (الصورةُ تنصّب `postgresql-client`).
 *   ومن الجهاز: `psql` غيرُ منصَّبٍ عادةً، فيُمرَّر عبر الحاوية —
 *   `SYNC_PSQL="docker exec -i warehouse-postgres psql"`.
 *   وبهذا تُجرَّب المزامنةُ حيًّا قبل بناء الصورة، وهو ما يختصر دورةَ
 *   التجربة من دقائقَ إلى ثوانٍ.
 */
const PSQL_CMD = (process.env.SYNC_PSQL || process.env.PSQL_BIN || 'psql').split(/\s+/);

/** ينفّذ SQL ويُعيد المخرَج نصًّا. الفشلُ يُرمى ولا يُبتلع. */
function psql(sql, { tuplesOnly = false } = {}) {
  const args = [...PSQL_CMD.slice(1), '-v', 'ON_ERROR_STOP=1', '-q'];
  if (tuplesOnly) args.push('-t', '-A', '-F', '\t');
  return execFileSync(PSQL_CMD[0], args, { input: sql, encoding: 'utf8' });
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

/** المساراتُ التي لها جدولٌ مفصَّلٌ — النواةُ المحروسةُ بقيودها. */
const MAPPED = PATHS.filter((p) => mapForPath(p));

/**
 * ═══ المرآةُ الكاملة ═══
 *
 * ★★★ **أمرُ المالك 2026-10-20:** «أيُّ شيءٍ يُحفظ في قوقل موجودٌ في سيرفر
 *     الجهاز». وكانت المزامنةُ تقرأ **خمسةَ مسارات** وتترك ثلاثةً وتسعين —
 *     لا لأنّ الآلةَ تعجز، بل لأنّ `MAPPED` كان يحصرها فيما له جدولٌ مفصَّل.
 *     والخطّةُ (`PLAN`) محسوبةٌ للمسارات الثمانية والتسعين **منذ أوّل يوم**.
 *
 * ★★★ **والميزانيّةُ شرطُ تشغيلٍ لا تعليق:** تُحسب الكلفةُ قبل أن يُقرأ حرف،
 *     وإن تجاوزت الحدَّ **يرجع المزامنُ إلى المنمذَجة وحدَها ويقول لماذا**.
 *     فالعودةُ إلى سلوكٍ أضيقَ خيرٌ من إنفاق حصّةٍ تُوقف البوّابةَ على الناس —
 *     وهو عينُ ما وقع 2026-09-05 حين نفدت الحصّةُ وتوقّفت البوّابةُ ساعات.
 *
 * ويُطفأ بـ`SYNC_FULL_MIRROR=0` — مفتاحُ رجوعٍ بلا إعادةِ بناء.
 */
const FULL_MIRROR_ASKED = process.env.SYNC_FULL_MIRROR !== '0';

/**
 * المرشَّحُ للقراءة لو فُتحت المرآةُ الكاملة — **ومنه تُحسب الكلفة**.
 *
 * ★★★ **وهذا تصحيحٌ لعطبٍ في الحارس نفسِه (2026-10-21):** كانت الكلفةُ تُحسب
 *     على `PLAN` كلِّها، وفيها **ثمانيةٌ وعشرون مسارًا فرعيًّا لا تُقرأ
 *     أصلًا** — فكانت تزن ١٢٬٦٠٠ قراءةٍ وهميّةٍ من أصل ٢٠٬٩٧٧، فيرفض الحارسُ
 *     خطّةً سليمةً ويمنع ما لا ضررَ فيه. **وحارسٌ يمنع الحلالَ يُطفأ يومًا
 *     فيمرّ معه الحرام.** فالكلفةُ تُقاس على ما يُقرأ، لا على ما يُخطَّط له.
 */
const MIRROR_CANDIDATES = PATHS.filter((p) => !p.includes('/'));
const CANDIDATE_PLAN = Object.fromEntries(MIRROR_CANDIDATES.map((p) => [p, PLAN[p]]));
const FULL_MIRROR_COST = idleReadsPerDay(CANDIDATE_PLAN);
const FULL_MIRROR_FITS = FULL_MIRROR_COST <= BUDGET_READS_PER_DAY;
const FULL_MIRROR = FULL_MIRROR_ASKED && FULL_MIRROR_FITS;

/**
 * ★★★ **والمساراتُ الفرعيّةُ تُستثنى بإعلانٍ لا بصمت.** `readPath` يرفضها
 *     صراحةً (مجموعةٌ فرعيّةٌ تحتاج معرّفَ أبٍ بين المقطعين)، **وهي ثمانيةٌ
 *     وعشرون مسارًا**. فلو أُدرجت لرمت خطأً في كلّ دورة: ثمانيةٌ وعشرون
 *     سطرَ خطأٍ كلَّ ساعةٍ في سجلٍّ يقرؤه المالك — وسجلٌّ يصرخ دائمًا سجلٌّ
 *     لا يُقرأ، فيضيع فيه الخطأُ الحقيقيُّ يومَ يقع.
 *
 *     ⇒ فتُستثنى هنا **ويُعلَن عددُها في `--plan`**، ولا يُدَّعى أنّها منسوخة.
 *       وفتحُها يحتاج فهرسَ مجموعاتٍ يُنشر في Firebase (`SYNC_COLLECTION_GROUP`)
 *       أو مرورًا على الآباء — وكلاهما قرارٌ لم يُتّخذ بعد.
 */
const SUB_PATHS = PATHS.filter((p) => p.includes('/'));

/** ما يُقرأ فعلًا هذه الدورة. */
const SYNCED = FULL_MIRROR ? PATHS.filter((p) => !p.includes('/')) : MAPPED;

/**
 * ═══ الكاتبُ الواحد (§3) — تغذيةُ الدفتر المحاسبيّ بالمزامنة ═══
 *
 * ★★★ **مطفأةٌ ما لم تُرفع `SYNC_LEDGER=1`.** قرارُ المالك 2026-10-25: الدفترُ
 *     المحليّ يملك المحاسبة، وآلةُ المزامنة — لا البوّابة — هي كاتبُه الوحيد.
 *     فبعد نسخ المستندات تُشتقّ قيودُها المزدوجةُ وتُكتب عبر باب القاعدة
 *     `post_journal_local` (024). خاملةٌ افتراضيًّا: بدونها لا يُقرأ سطرٌ من
 *     الدفتر ولا يُكتب حرف، والمزامنةُ تعمل كما كانت حرفًا بحرف.
 *
 * ★★ ولا كتابةَ مزدوجة: البوّابةُ تكتب مستندَها في Firebase كما هي، والدفترُ
 *    يُشتقّ من المرآة لا بجانبِ كتابتها — تحوّلٌ لا ازدواج.
 */
const SYNC_LEDGER = process.env.SYNC_LEDGER === '1';

/** خريطةُ مسارٍ: المفصَّلةُ إن وُجدت، وإلّا العامّةُ إلى `mirror_docs`. */
function mapFor(path) {
  return mapForPath(path) || genericMapFor(path, PLAN[path]?.field || null);
}

if (FULL_MIRROR_ASKED && !FULL_MIRROR) {
  console.warn(
    `!  المرآةُ الكاملةُ مطلوبةٌ وتتجاوز الميزانيّة: ${FULL_MIRROR_COST} > ${BUDGET_READS_PER_DAY} قراءةً/يوم.
` +
      '   فيُكتفى بالمسارات المنمذَجة. والعلاجُ: فهرسُ المجموعات، أو رفعُ الميزانيّة بقرارٍ مكتوب.'
  );
}

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

/**
 * يكتب الصفوفَ، **ويعزل الفاسدَ بالتنصيف بدل أن يُسقط الدفعةَ كلَّها**.
 *
 * ★★★ الدرسُ من أوّل تشغيلٍ حيّ: باركودٌ واحدٌ مكرَّرٌ في Firestore رفضته
 *     القاعدة **فبقيت ١١٧٣ صنفًا خارج المرآة**، ورقمُ مستندٍ واحدٌ أسقط ١٧٥
 *     مستندًا. وكانت المزامنةُ ستُعيد الفشلَ نفسَه كلَّ دقيقتين إلى الأبد.
 *
 * ★★ والتنصيفُ لا القراءةُ صفًّا صفًّا: دفعةٌ من ألفٍ فيها فاسدٌ واحدٌ تُعزَل
 *    في نحو عشرِ محاولاتٍ لا ألف. والكلفةُ تتناسب مع عدد الفاسد لا عدد الصفوف.
 *
 * @returns {{written:number, rejected:Array<{id:string, reason:string}>}}
 */
function applyRows(map, rows) {
  if (!rows.length) return { written: 0, rejected: [] };

  const built = buildUpsert(map, rows);
  try {
    psql(`BEGIN;\n${built.sql}\nCOMMIT;`);
    return { written: built.count, rejected: [] };
  } catch (err) {
    if (rows.length === 1) {
      const raw = String(err.stderr || err.message || err);
      // أوّلُ سطرِ خطأٍ حقيقيٍّ من psql — لا كلُّ أثرِ الاستدعاء.
      const line = raw.split('\n').find((l) => /ERROR|DETAIL/.test(l)) || raw.split('\n')[0];
      return { written: 0, rejected: [{ id: rows[0].__id, reason: line.trim().slice(0, 500) }] };
    }
    const mid = Math.floor(rows.length / 2);
    const a = applyRows(map, rows.slice(0, mid));
    const b = applyRows(map, rows.slice(mid));
    return { written: a.written + b.written, rejected: [...a.rejected, ...b.rejected] };
  }
}

/** يسجّل المرفوضَ باسمه — دَينٌ معلومٌ لا فقدٌ صامت. */
function recordRejects(path, rejected) {
  if (!rejected.length) return;
  const values = rejected
    .map((r) => `(${lit(path)}, ${lit(r.id)}, ${lit(r.reason)})`)
    .join(',\n  ');
  psql(
    'INSERT INTO sync_rejects (path, doc_id, reason) VALUES\n  ' + values +
      ' ON CONFLICT (path, doc_id) DO UPDATE SET' +
      ' reason = EXCLUDED.reason, last_seen = now(), attempts = sync_rejects.attempts + 1;'
  );
}

/** صفٌّ أُصلح في المصدر يُشطب من الدَّين — والجدولُ الفارغُ هو الحالةُ السليمة. */
function clearRejects(path, ids) {
  if (!ids.length) return;
  psql(
    `DELETE FROM sync_rejects WHERE path = ${lit(path)} AND doc_id IN (` +
      ids.map(lit).join(', ') + ');'
  );
}

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

/**
 * ═══════════════════ سقفُ القراءة اليوميّ — حارسٌ لا يُخدَع ═══════════════════
 *
 * ★★★ **الدرسُ الذي وُلد منه هذا الحارس (2026-10-21، وثمنُه دُفع):** الخطّةُ
 *     تُصنّف وتيرةَ كلّ مجموعةٍ من `inventory.measured.json`، وهو **مقيسٌ مرّةً
 *     في سبتمبر**. فلمّا فُتحت المرآةُ الكاملةُ قرأ الجردُ `bin_locations = 0`
 *     بينما هي **٨٤٠٢ مستندًا** — فصُنّفت «باردةً · مسحًا كاملًا» ⇒ ٨٤٠٢
 *     قراءةٍ كلَّ ساعة. والمجموعُ المقيس: **١٥٬١٦٤ مستندًا في الدورة الواحدة**،
 *     أي ٣٦٤ ألفًا يوميًّا — **سبعةُ أضعاف الحصّة**. ولم تنجُ البوّابةُ إلّا
 *     لأنّ الدورةَ أُوقفت يدويًّا بعد واحدة.
 *
 *     ⇒ **والعلاجُ ليس جردًا أدقّ.** الجردُ يشيخ دائمًا، وأيُّ حارسٍ يقوم على
 *       صحّته يكذب يومًا. فالسقفُ يُفرض **على ما قُرئ فعلًا**، من سجلِّ
 *       المزامنة نفسِه: رقمٌ لا يأتي من تقدير، ولا يشيخ.
 *
 * ★★ ويُقاس باليوم لا بالدورة: الحصّةُ يوميّةٌ، والدورةُ الواحدةُ قد تكون
 *    بريئةً ومجموعُ أربعٍ وعشرين قاتلًا — وهو بالضبط ما وقع.
 */
const DAILY_READ_CAP = Number(process.env.SYNC_DAILY_READ_CAP) || BUDGET_READS_PER_DAY;

/** ما قُرئ اليومَ فعلًا — من السجلّ، لا من حساب. */
function readsToday() {
  const rows = psqlRows(
    "SELECT coalesce(sum(docs_read), 0) FROM sync_log WHERE started_at >= date_trunc('day', now());"
  );
  // ★ وتعذُّرُ القراءة يُعامَل معاملةَ «أنفقتُ كلَّ شيء» لا معاملةَ الصفر —
  //   والحكمُ في `watermark.js` كي يُختبَر بلا قاعدةٍ ولا حاوية.
  return readsTodayOrCap(rows[0] && rows[0][0], DAILY_READ_CAP);
}

async function runCycle(fb, db, minute) {
  const cycleId = randomUUID();
  // ★ الحالةُ تُقرأ حتّى في `--dry`. ولو أُهملت، لبدأت التجربةُ من الصفر
  //   فقرأت **كلَّ شيءٍ** من Firestore — أي إنفاقُ الحصّة لأجل بروفة.
  const state = loadState();
  const entries = [];
  let totalQueries = 0;
  let totalDocs = 0;

  let spent = DRY ? 0 : readsToday();
  let capHit = false;

  for (const path of SYNCED) {
    const plan = PLAN[path];
    if (!isDue(PLAN, path, minute)) continue;

    // ★★★ ويُفحص **قبل** كلّ مسارٍ لا مرّةً في أوّل الدورة: مجموعةٌ ضخمةٌ
    //     واحدةٌ قد تستنفد الباقيَ وحدَها، فيُوقَف ما بعدها لا ما قبلها.
    if (!DRY && capReached(spent, DAILY_READ_CAP)) {
      if (!capHit) {
        capHit = true;
        console.warn(
          `!  سقفُ القراءة اليوميُّ بلغ حدَّه: ${spent} / ${DAILY_READ_CAP}.` +
            ' يتوقّف ما تبقّى من المسارات حتّى منتصف الليل — والبوّابةُ لا تتأثّر.'
        );
      }
      continue;
    }

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
      spent += rows.length + queries;

      let written = 0;
      let rejected = [];
      if (rows.length && !DRY) {
        const res = applyRows(mapFor(path), rows);
        written = res.written;
        rejected = res.rejected;
        recordRejects(path, rejected);
        // ما مرّ الآن وكان مرفوضًا سابقًا ⇒ أُصلح في المصدر، فيُشطب دَينُه.
        const rejectedIds = new Set(rejected.map((r) => r.id));
        clearRejects(path, rows.map((r) => r.__id).filter((id) => !rejectedIds.has(id)));
      } else if (rows.length) {
        written = rows.length;
      }

      // ★ العلامةُ تتقدّم **رغم الرفض**: صفٌّ فاسدٌ لا يحبس المسارَ إلى الأبد.
      //   ولا فقدَ صامتًا لأنّه مسجَّلٌ باسمه في `sync_rejects`.
      const after =
        plan.mode === MODE.INCREMENTAL ? advanceWatermark(before, rows, plan.field) : null;

      if (!DRY) saveState(path, plan, after);

      entries.push({
        cycleId, path, mode: plan.mode, field: plan.field, windowStart: from,
        before, after, queries, docs: rows.length, written,
        ok: true,
        error: rejected.length ? `${rejected.length} صفًّا مرفوضًا — انظر sync_rejects` : null,
        startedAt,
      });

      console.log(
        `  ok  ${path.padEnd(24)} ${plan.mode.padEnd(11)}` +
          ` q=${String(queries).padStart(3)} docs=${String(rows.length).padStart(5)}` +
          ` -> ${written}` +
          (rejected.length ? `  ⚠ مرفوض: ${rejected.length}` : '')
      );
      for (const r of rejected) console.log(`        ✘ ${r.id} — ${r.reason}`);
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

/** يفكّ JSON من عمود jsonb، ويعيد البديلَ إن تعذّر — فلا صفٌّ معطوبٌ يُسقط الدفعة. */
function safeJson(text, fallback) {
  if (text === undefined || text === null || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * ═══ الكاتبُ الواحد: اشتقاقُ قيود الدفتر من المستندات المنسوخة وكتابتُها ═══
 *
 * ★★★ **يقرأ من PostgreSQL لا من Firestore:** المستنداتُ مرآةٌ عندنا بعد النسخ،
 *     فاشتقاقُ قيودها لا يكلّف حصّةَ قراءةٍ من قوقل. والكتابةُ عبر باب القاعدة
 *     `post_journal_local` وحدَه: مفتاحٌ حتميّ، فإعادةُ الدورة تتخطّى القائمَ
 *     (القفزُ لا الرفض) — فلا قيدَ يُكرَّر ولو جرت الدورةُ ألفَ مرّة.
 *
 * ★★★ **الحالاتُ النهائيّةُ وحدَها** (`POSTABLE_STATES` = منجَز/مغلق): لا تُرحَّل
 *     حالةٌ متغيّرةٌ («معتمَد») تُعدَّل أو تُلغى بعد ترحيلها فتترك قيدًا منحرفًا
 *     أو شبحيًّا. والقرارُ وبرهانُه في `ledgerSync.js`.
 *
 * ★ يُقرأ كلُّ نهائيٍّ ماليٍّ كلَّ دورة؛ وهو محليٌّ (بلا حصّة)، والقائمُ يُتخطّى.
 *   ويُدرَج تقييدٌ تزايديٌّ بالعلامة لاحقًا إن لزم — القرارُ بعد تشغيل المالك.
 */
function postLedger() {
  const typeList = LEDGER_DOC_TYPES.map((t) => lit(t)).join(', ');
  const stateList = POSTABLE_STATES.map((s) => lit(s)).join(', ');
  const rows = psqlRows(
    'SELECT id, type, number, state, header, lines FROM documents' +
      ` WHERE state IN (${stateList}) AND type IN (${typeList});`
  );
  if (!rows.length) {
    console.log('  --  الدفتر: لا مستنداتٍ ماليّةً نهائيّةً بعدُ في المرآة.');
    return;
  }

  const docs = rows.map(([id, type, number, state, header, lines]) => ({
    id, type, number, state, header: safeJson(header, {}), lines: safeJson(lines, []),
  }));

  const bodies = ledgerCallBodies(docs);
  if (!bodies.length) {
    console.log(`  --  الدفتر: ${docs.length} مستندًا، لا قيدَ مشتقًّا (قبل حدّ الافتتاح أو بلا مبلغ).`);
    return;
  }

  const calls = bodies
    .map(
      (b) =>
        `SELECT post_journal_local(${lit(b.p_key)}, ${lit(b.p_date)}::date, ${Number(b.p_amount)}::bigint,` +
        ` ${lit(JSON.stringify(b.p_lines))}::jsonb, ${lit(b.p_memo || '')}, ${lit(b.p_source_type || '')},` +
        ` ${lit(b.p_source_id || '')}, ${b.p_reverses ? lit(b.p_reverses) : 'NULL'},` +
        ` ${b.p_shop ? lit(b.p_shop) : 'NULL'});`
    )
    .join('\n');

  psql(`BEGIN;\n${calls}\nCOMMIT;`);
  console.log(
    `  ok  الدفتر: ${docs.length} مستندًا ⇒ ${bodies.length} قيدًا مزدوجًا رُحّل أو تُخطّي (القفزُ لا الرفض).`
  );
}

/* ═══════════════════ المسار ═══════════════════ */

function printPlan() {
  const unmapped = PATHS.filter((p) => !mapForPath(p));
  console.log('=== SYNC PLAN ===\n');
  console.log(`  المساراتُ في القواعد:   ${PATHS.length}`);
  console.log(`  المنمذَجةُ (جداولُ مفصَّلة): ${MAPPED.length}  ${MAPPED.join(' · ')}`);
  const genericRead = SYNCED.filter((p) => !mapForPath(p)).length;
  console.log(
    `  العامّةُ (mirror_docs):    ${unmapped.length}` +
      (FULL_MIRROR
        ? `  ⟵ منها ${genericRead} تُقرأ`
        : '  ⟵ لا تُقرأ (المرآةُ الكاملةُ مطفأة)')
  );
  console.log(`  المرآةُ الكاملة:         ${FULL_MIRROR ? 'مُفعَّلة' : 'مطفأة'}`);
  console.log(
    `  الفرعيّةُ (غيرُ منسوخة):  ${SUB_PATHS.length}  ⟵ تحتاج فهرسَ مجموعاتٍ أو مرورًا على الآباء`
  );
  console.log(`  تُقرأ هذه الدورة:       ${SYNCED.length}`);
  console.log(`  فهرسُ المجموعات:       ${COLLECTION_GROUP ? 'مُفعَّل' : 'معطَّل'}`);
  console.log(
    `  الدفترُ المحاسبيّ:      ${SYNC_LEDGER ? 'يُغذّى بالمزامنة (post_journal_local)' : 'مطفأ (SYNC_LEDGER=1 لتفعيله)'}\n`
  );

  for (const path of MAPPED) {
    const p = PLAN[path];
    console.log(
      `  ${path.padEnd(20)} ${p.mode.padEnd(12)} ${String(p.field || '-').padEnd(10)}` +
        ` كلَّ ${String(p.tier).padStart(2)} د   ${p.why}`
    );
  }

  const mappedPlan = Object.fromEntries(MAPPED.map((p) => [p, PLAN[p]]));
  console.log(`\n  أرضيّةُ القراءات (المنمذَجةُ وحدَها): ${idleReadsPerDay(mappedPlan)} / يوم`);
  console.log(
    `  أرضيّةُ القراءات (الخطّةُ كاملةً):    ${FULL_MIRROR_COST} / يوم` +
      `   ⟵ الميزانيّة ${BUDGET_READS_PER_DAY}: ${FULL_MIRROR_FITS ? 'داخلها' : 'تجاوزٌ ⇒ تُكتفى بالمنمذَجة'}`
  );
  console.log('  الحصّةُ المجّانيّة: 50000 / يوم');
  for (const path of FULL_MIRROR ? unmapped.slice(0, 6) : []) {
    const p = PLAN[path];
    console.log(`    · ${path.padEnd(22)} ${p.mode.padEnd(12)} كلَّ ${String(p.tier).padStart(2)} د`);
  }
  if (FULL_MIRROR && unmapped.length > 6) console.log(`    · و${unmapped.length - 6} مسارًا آخر`);
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

    // ★ الكاتبُ الواحد: مطفأٌ ما لم تُرفع الراية، ويُتخطّى في `--dry`.
    if (SYNC_LEDGER && !DRY) {
      try {
        postLedger();
      } catch (err) {
        // يُسجَّل ولا يُبتلع: فشلُ الدفتر لا يُسقط المزامنةَ نفسها.
        console.error(`  XX  الدفتر: ${String(err?.message || err)}`);
      }
    }

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
