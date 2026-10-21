/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المطابقة — Firestore ⇄ PostgreSQL، وصفرُ فرقٍ شرطُ عبور
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **هذا هو الحَكَم، لا المزامنة.** المزامنةُ تقول «نقلتُ كذا»، وهذه تقول
 *     «الطرفان متطابقان أو ليسا». والفرقُ جوهريّ: عطبُ العلامة المائيّة
 *     **لا يُظهر خطأً في المزامنة أبدًا** — يُظهر صفوفًا لم تُقرأ، وهي بطبيعتها
 *     صامتة. فلا يكشفها إلّا قراءةٌ كاملةٌ تُقارَن.
 *
 * ★★ وثمنُها مقصود: قراءةٌ كاملةٌ لكلّ مسارٍ منمذَج (١٣٦٩ قراءةً بقياس
 *    2026-09-02). ولهذا **لا تعمل في الحلقة** — تُشغَّل يدويًّا أو مرّةً
 *    يوميًّا، وقبل أيّ تحويلٍ إلزامًا.
 *
 * ★ وللقراءة فقط من الطرفين: لا `setDoc` ولا `UPDATE`. لا تُصلح، بل تُبلّغ.
 *
 * التشغيل:
 *   FIREBASE_EMAIL=… FIREBASE_PASSWORD=… node scripts/reconcile.mjs
 *   node scripts/reconcile.mjs --only=Items_Master
 *
 * المخرَج: تقريرٌ لكلّ مسار، وخروجٌ بـ1 عند أوّل فرق.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// ⚠️ قراءةٌ فقط — ولا وحدةَ كتابةٍ في هذا النطاق.
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

import { MAPS } from '../db/sync/pg-maps.js';

const PAGE = 500;
// نفسُ اتّفاق `db/sync/sync.mjs`: أمرٌ كاملٌ كي يُمرَّر عبر الحاوية من الجهاز.
const PSQL_CMD = (process.env.SYNC_PSQL || process.env.PSQL_BIN || 'psql').split(/\s+/);

const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()) : [];

/** المفتاحُ الطبيعيُّ لكلّ جدول، وحقلُ الختم الذي يُقارَن. */
const KEYS = {
  items: { pk: 'sku', firestoreKey: (r) => r.sku || r.__id, mark: 'updated_at', srcMark: 'updatedAt' },
  documents: { pk: 'id', firestoreKey: (r) => r.__id, mark: 'updated_at', srcMark: 'updatedAt' },
  users: { pk: 'uid', firestoreKey: (r) => r.__id, mark: null, srcMark: null },
  warehouses: { pk: 'code', firestoreKey: (r) => r.code, mark: null, srcMark: null },
  counters: { pk: null, firestoreKey: (r) => r.__id, mark: null, srcMark: null },
};

function psqlRows(sql) {
  const out = execFileSync(
    PSQL_CMD[0],
    [...PSQL_CMD.slice(1), '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-F', '\t'],
    { input: sql, encoding: 'utf8' }
  ).trim();
  return out ? out.split('\n').map((l) => l.split('\t')) : [];
}

/** يقرأ مسارًا كاملًا من Firestore، صفحةً صفحة. */
async function readAll(db, path) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const parts = [orderBy(documentId()), fsLimit(PAGE)];
    if (cursor) parts.push(startAfter(cursor));
    const snap = await getDocs(query(collection(db, path), ...parts));
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data();
      rows.push({
        __id: d.id,
        sku: data.sku,
        code: data.code,
        // الختمُ وحدَه يُقارَن — لا كلَّ حقل. عطبُ العلامة يظهر هنا.
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      });
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE) break;
  }
  return rows;
}

/** يقارن ثانيةً بثانية — الفروقُ دون الثانية ضجيجُ تحويلٍ لا فرقُ بيانات. */
const sameInstant = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.floor(Date.parse(a) / 1000) === Math.floor(Date.parse(b) / 1000);
};

async function main() {
  const email = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;
  if (!email || !password) {
    console.error('X  FIREBASE_EMAIL and FIREBASE_PASSWORD are required.');
    process.exit(1);
  }

  const app = initializeApp({
    apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PUBLIC_FIREBASE_APP_ID,
  });

  const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  const cred = await signInWithEmailAndPassword(getAuth(app), email, password);
  console.log(`-  signed in: ${cred.user.email}\n`);

  const targets = MAPS.filter((m) => !m.path.includes('/'))
    .filter((m) => !ONLY.length || ONLY.includes(m.path) || ONLY.includes(m.table));

  let totalDiff = 0;
  console.log('=== RECONCILE ===\n');

  for (const map of targets) {
    const spec = KEYS[map.table];
    if (!spec || !spec.pk) {
      console.log(`  --  ${map.table.padEnd(12)} تُخطّى: لا مفتاحَ مطابقةٍ معرَّف`);
      continue;
    }

    const src = await readAll(db, map.path);
    const markCol = spec.mark ? `, ${spec.mark}` : '';
    const dst = psqlRows(`SELECT ${spec.pk}${markCol} FROM ${map.table};`);

    const srcMap = new Map(src.map((r) => [String(spec.firestoreKey(r) ?? ''), r]));
    const dstMap = new Map(dst.map((r) => [r[0], r[1] ?? null]));

    const missing = [...srcMap.keys()].filter((k) => !dstMap.has(k));
    const extra = [...dstMap.keys()].filter((k) => !srcMap.has(k));

    const stale = [];
    if (spec.mark) {
      for (const [k, row] of srcMap) {
        if (!dstMap.has(k)) continue;
        if (!sameInstant(row.updatedAt, dstMap.get(k))) stale.push(k);
      }
    }

    const diff = missing.length + extra.length + stale.length;
    totalDiff += diff;

    const mark = diff === 0 ? 'ok' : 'XX';
    console.log(
      `  ${mark}  ${map.table.padEnd(12)} firestore=${String(src.length).padStart(5)}` +
        ` postgres=${String(dst.length).padStart(5)}` +
        ` | ناقص=${missing.length} زائد=${extra.length} متقادم=${stale.length}`
    );

    // ★ الفرقُ يُسمّى بمفاتيحه — «يوجد فرق» بلا اسمٍ لا يُصلَح.
    for (const [label, list] of [['ناقصٌ من postgres', missing], ['زائدٌ في postgres', extra], ['ختمٌ متقادم', stale]]) {
      if (list.length) {
        console.log(`        ${label}: ${list.slice(0, 20).join(', ')}${list.length > 20 ? ` … (+${list.length - 20})` : ''}`);
      }
    }
  }

  console.log(`\n  المجموع: ${totalDiff === 0 ? 'صفرُ فرق' : `${totalDiff} فرقًا`}`);
  process.exit(totalDiff === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nX  reconcile failed:', err?.message || err);
  process.exit(1);
});
