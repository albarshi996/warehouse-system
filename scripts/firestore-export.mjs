/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها، والقاعدةُ تحمي حزمةَ المتصفّح. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  تصديرُ Firestore — نسخٌ لا نقل
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **للقراءة فقط، بضمانةٍ بنيويّةٍ لا وعديّة**: هذا الملفّ لا يستورد
 *     `setDoc` ولا `updateDoc` ولا `deleteDoc` ولا `writeBatch` — غيرُ موجودةٍ
 *     في نطاقه أصلًا، فيستحيل عليه الكتابةُ ولو أراد. وشرطُ المالك الأوّل:
 *     «عدم فقد أو تلف أي بيانات موجودة حاليًا في Firebase».
 *
 * ★★ ولا مفتاحَ حسابِ خدمة: يسجّل الدخولَ ببريد المالك وكلمته، فيمرّ بنفس
 *    بوّابة الصلاحيّات التي يمرّ بها التطبيق. لا تبعيّةَ جديدةً ولا سرَّ جديد.
 *
 * ★ والمساراتُ **تُقرأ من `firestore.rules` متداخلةً** لا من قائمةٍ مكتوبةٍ هنا.
 *   وهذا أُصلح بعد عطبٍ حقيقيّ (2026-09-02): النسخةُ الأولى قرأت الأسماءَ
 *   مسطّحةً، فسألت عن `scans` في الجذر وهي تحت `operations/{id}` — فعادت
 *   `permission-denied` ستَّ عشرة مرّةً فبدت مشكلةَ صلاحيّاتٍ وهي مشكلةُ مسار.
 *   وأسقطت `documents` وهي قلبُ النظام. **فالخطأُ الصامتُ هنا يُخفي بياناتٍ
 *   ولا يُعلن.**
 *
 * التشغيل:
 *   انقر نقرتين على `db/تصدير-البيانات.bat` — أو:
 *   FIREBASE_EMAIL=… FIREBASE_PASSWORD=… node scripts/firestore-export.mjs
 *
 * الخيارات:
 *   --only=documents,items   مساراتٌ بعينها (أو اسمُ الأب فيشمل فروعَه)
 *   --dry                    يعدّ ولا يكتب ملفًّا
 *
 * المخرَج:
 *   db/dump/<collection>.ndjson          سطرٌ لكلّ مستند
 *   db/dump/<parent>__<child>.ndjson     المجموعاتُ الفرعيّة (بحقل `__parent`)
 *   db/dump/_manifest.json               الجردُ الكامل: عددٌ وحقولٌ لكلّ مسار
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// ⚠️ لا شيءَ هنا يكتب. القائمةُ مقصودةٌ ومحدودة.
import {
  initializeFirestore,
  collection,
  query,
  orderBy,
  limit as fsLimit,
  startAfter,
  getDocs,
  documentId,
} from 'firebase/firestore';

// ★★ تعريفٌ واحدٌ لا نسختان — تشاركه حاويةُ المزامنة (`db/sync/sync.mjs`).
import { pathsFromRules } from '../db/sync/rules-paths.js';
import { serialize } from './firestore-serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP_DIR = join(ROOT, 'db', 'dump');
const PAGE = 500;

/* ═══════════════════ الوسائط ═══════════════════ */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const ONLY = (value('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DRY = flag('dry');

/* ═══════════════════ المسارات من القواعد ═══════════════════ */

/**
 * مساراتُ المجموعات — تُقرأ من `firestore.rules` بمحلِّلٍ مشترَكٍ **مختبَر**.
 * ★ وكان التحليلُ هنا نسخةً محلّيّة؛ نُقل إلى وحدةٍ خالصةٍ حين احتاجته
 *   المزامنة، فصار له اختبارٌ يثبّت عطبَ المسار المسطّح (2026-09-02).
 */
const collectionPaths = () => pathsFromRules(readFileSync(join(ROOT, 'firestore.rules'), 'utf8'));

/** اسمُ ملفّ المخرَج لمسار. */
const dumpFile = (path) => join(DUMP_DIR, `${path.replace(/\//g, '__')}.ndjson`);

/* ═══════════════════ التصدير ═══════════════════ */

/**
 * يقرأ صفحةً صفحةً من مسارٍ مبنيٍّ مسبقًا.
 * الصفحاتُ ضروريّة: مجموعةٌ بعشرات الآلاف تُسقط الذاكرةَ لو قُرئت دفعةً.
 */
async function readAll(db, segments, onDoc) {
  let cursor = null;
  let count = 0;
  for (;;) {
    const parts = [orderBy(documentId()), fsLimit(PAGE)];
    if (cursor) parts.push(startAfter(cursor));
    const snap = await getDocs(query(collection(db, ...segments), ...parts));
    if (snap.empty) break;
    for (const d of snap.docs) {
      onDoc(d);
      count += 1;
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE) break;
  }
  return count;
}

/** معرّفاتُ مستنداتِ الأب — تُقرأ من ملفّه المصدَّر. */
function parentIds(parentPath) {
  const f = dumpFile(parentPath);
  if (!existsSync(f)) return null;
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l).__id);
}

/**
 * يصدّر مسارًا — عليا كان أو فرعيًّا.
 * الفرعيُّ يُقرأ **أبًا أبًا**: `operations/{id}/scans` لكلّ معرّفٍ في الأب.
 * ولا نستعمل `collectionGroup` عمدًا — يحتاج فهارسَ قد لا تكون منشورة.
 */
async function exportPath(db, path) {
  const segs = path.split('/');
  const out = DRY ? null : createWriteStream(dumpFile(path), { encoding: 'utf8' });
  const fields = new Map();
  let count = 0;
  let note = null;

  const take = (d, parent) => {
    const data = serialize(d.data());
    for (const k of Object.keys(data)) fields.set(k, (fields.get(k) || 0) + 1);
    if (out) {
      out.write(
        JSON.stringify({ __id: d.id, ...(parent ? { __parent: parent } : {}), ...data }) + '\n'
      );
    }
  };

  if (segs.length === 1) {
    count = await readAll(db, segs, (d) => take(d, null));
  } else {
    // فرعيّة: نمرّ على آبائها. وأبٌ لم يُصدَّر بعدُ ⇒ نُعلن ولا نبتلع.
    const parentPath = segs.slice(0, -1).join('/');
    const ids = parentIds(parentPath);
    if (ids === null) {
      note = `parent "${parentPath}" not exported`;
    } else {
      const leaf = segs[segs.length - 1];
      for (const pid of ids) {
        count += await readAll(db, [parentPath, pid, leaf], (d) => take(d, pid));
      }
    }
  }

  if (out) await new Promise((r) => out.end(r));
  return {
    count,
    fields: Object.fromEntries([...fields.entries()].sort((a, b) => b[1] - a[1])),
    note,
  };
}

/* ═══════════════════ المسار ═══════════════════ */

async function main() {
  const email = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;
  if (!email || !password) {
    console.error('X  FIREBASE_EMAIL and FIREBASE_PASSWORD are required.');
    console.error('   Double-click db\\تصدير-البيانات.bat instead.');
    process.exit(1);
  }

  const app = initializeApp({
    apiKey: process.env.PUBLIC_FIREBASE_API_KEY || 'AIzaSyAWhqQVdhODZT0bdXnbyYzcmpnv11s9qoU',
    authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN || 'brandzo-erp-2026.firebaseapp.com',
    projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID || 'brandzo-erp-2026',
    storageBucket:
      process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || 'brandzo-erp-2026.firebasestorage.app',
    messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '991460523040',
    appId: process.env.PUBLIC_FIREBASE_APP_ID || '1:991460523040:web:d3c6f76b1ff13a1ab8d045',
  });

  const db = initializeFirestore(app, { experimentalForceLongPolling: true });

  process.stdout.write('-  Signing in... ');
  const cred = await signInWithEmailAndPassword(getAuth(app), email, password);
  console.log(`OK  ${cred.user.email}`);

  const all = collectionPaths();
  const targets = ONLY.length
    ? all.filter((p) => ONLY.includes(p) || ONLY.includes(p.split('/')[0]))
    : all;
  const nTop = targets.filter((p) => !p.includes('/')).length;

  mkdirSync(DUMP_DIR, { recursive: true });
  console.log(
    `-  ${targets.length} paths (${nTop} top-level, ${targets.length - nTop} sub)` +
      (DRY ? '   [DRY RUN: counting only, no files written]' : '') +
      '\n'
  );

  const manifest = { exportedAt: null, project: 'brandzo-erp-2026', paths: {} };
  let total = 0;
  let failed = 0;

  for (const path of targets) {
    try {
      const res = await exportPath(db, path);
      manifest.paths[path] = {
        count: res.count,
        fields: res.fields,
        ...(res.note ? { note: res.note } : {}),
      };
      total += res.count;
      const mark = res.count === 0 ? '  ' : 'ok';
      console.log(
        `  ${mark}  ${path.padEnd(34)} ${String(res.count).padStart(7)}` +
          (res.note ? '  ! ' + res.note : '')
      );
    } catch (err) {
      const msg = String(err?.code || err?.message || err);
      // يُسجَّل ولا يُبتلع — الصمتُ هنا يعني فقدًا لا يُكتشف إلّا بعد شهر.
      manifest.paths[path] = { count: null, error: msg };
      failed += 1;
      console.log(`  XX  ${path.padEnd(34)} ${msg}`);
    }
  }

  manifest.exportedAt = new Date().toISOString();
  if (!DRY) {
    writeFileSync(join(DUMP_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Documents:   ${total.toLocaleString('en-US')}`);
  console.log(`  Paths:       ${targets.length - failed} ok, ${failed} failed`);
  if (!DRY) console.log(`  Output:      db/dump/`);

  process.exit(0);
}

// ★★★ حارسُ نقطةِ الدخول: هذا الملفّ صار **يُستورَد** — المزامنةُ تأخذ منه
//     المحلِّلَ والمُسلسِلَ نفسَيهما. وبلا هذا الشرط، مجرّدُ استيرادِه يسجّل
//     الدخولَ ويصدّر كلَّ شيء: أثرٌ جانبيٌّ كارثيٌّ لسطرِ `import` واحد.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err) => {
    console.error('\nX  Export failed:', err?.message || err);
    process.exit(1);
  });
}

export { main as runExport };
