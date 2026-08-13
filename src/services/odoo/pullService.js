/**
 * خدمة السحب — أودو ← البوابة، لكلّ نطاقٍ في السجلّ (SAP-16 · يسدّ ف‑٣٨ وف‑٣٩).
 *
 * ═══ ما الذي تغيّر ═══
 * كان السحب دالّةً واحدة (`pullProducts`) للأصناف. صار **عامًّا**: أيّ نطاقٍ
 * في `pullRegistry` يُسحب بالمسار نفسه، فإضافة نطاقٍ لا تحتاج خدمةً جديدة.
 *
 * ═══ المرآة تُستبدل ولا تُدمج ═══
 * كلّ سحبٍ يكتب السجلّات بمعرّفٍ حتميّ من مفتاح النطاق، **ويُعلّم** ما لم يعد
 * في أودو بدل حذفه. الحذف يفقد الأثر، والإبقاء بلا علامةٍ يكذب. فالسجلّ
 * المفقود يُوسم `missingInOdoo` بتاريخه — يُرى ولا يُحتسب.
 *
 * ═══ لا كتابة إلى أودو ═══
 * كلّ ما هنا `searchRead`. والختم عند حدّ النقل يمنع غير ذلك أصلًا
 * (`directionGuard`)، فهذه الخدمة تعمل داخل الاتّجاه لا حوله.
 *
 * ═══ حدٌّ صادق ═══
 * السحب يجري في المتصفّح — لا وظائف سحابيّة على Spark. فما لم تُفتح الصفحة
 * لم يُسحب شيء. ولهذا يُحفظ `lastPulledAt` ويُعرض: مرآةٌ لا تُعلن قِدَمها
 * تكذب بصمت.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { odoo } from './index.js';
import { scopeOf, mirrorDocId, PULL_SCOPE_IDS, financeScopes } from './pullRegistry.js';
import { accountFromOdoo, moveFromOdoo, moveLineFromOdoo, paymentFromOdoo } from './financeMapper.js';

/** مجموعة حالة السحب — مستندٌ لكلّ نطاق. */
export const COL_PULL_STATE = 'odoo_pull_state';

/** مطابق كلّ نطاق. الأصناف ليست هنا: لها مسارها القائم في `odooSyncService`. */
const MAPPERS = {
  accounts: accountFromOdoo,
  moves: moveFromOdoo,
  moveLines: moveLineFromOdoo,
  payments: paymentFromOdoo,
};

function whoami() {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: auth?.currentUser?.email || 'غير معروف',
  };
}

/**
 * يسحب نطاقًا واحدًا من أودو إلى مرآته.
 *
 * @param {string} scopeId معرّف النطاق في `pullRegistry`
 * @returns {Promise<{scope:string, fetched:number, written:number, missing:number, skipped:number}>}
 */
export async function pullScope(scopeId) {
  const scope = scopeOf(scopeId);
  if (!scope) throw new Error(`نطاق سحبٍ مجهول: «${scopeId}».`);
  if (!scope.mirror) throw new Error(`النطاق «${scope.labelAr}» يهبط في نموذجٍ قائم لا في مرآة.`);
  const map = MAPPERS[scope.id];
  if (!map) throw new Error(`النطاق «${scope.labelAr}» بلا مطابق.`);

  const records = await odoo.searchRead(scope.odooModel, scope.domain ?? [], scope.fields, {
    ...(scope.order ? { order: scope.order } : {}),
  });
  const rows = Array.isArray(records) ? records : [];

  // ما هو موجودٌ الآن في المرآة — لنعرف ما اختفى من أودو.
  const mirrorRef = collection(db, scope.mirror);
  const before = await getDocs(mirrorRef);
  const seen = new Set();

  let written = 0;
  let skipped = 0;
  let batch = writeBatch(db);
  let inBatch = 0;

  const flush = async () => {
    if (inBatch === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    inBatch = 0;
  };

  for (const record of rows) {
    const id = mirrorDocId(scope.id, record);
    if (!id) {
      skipped++; // سجلٌّ بلا مفتاحٍ صالح لا يصلح مرآةً — لا يُحفظ بمعرّفٍ عشوائيّ
      continue;
    }
    seen.add(id);
    batch.set(
      doc(db, scope.mirror, id),
      { ...map(record), scope: scope.id, odooModel: scope.odooModel, missingInOdoo: null, pulledAt: serverTimestamp() },
      { merge: true }
    );
    written++;
    if (++inBatch >= 400) await flush(); // حدّ الدفعة في Firestore 500 — نبقى دونه
  }
  await flush();

  // ما اختفى من أودو: يُوسم ولا يُحذف. الحذف يفقد الأثر، والإبقاء بلا علامة يكذب.
  let missing = 0;
  batch = writeBatch(db);
  inBatch = 0;
  for (const snap of before.docs) {
    if (seen.has(snap.id) || snap.data()?.missingInOdoo) continue;
    batch.set(doc(db, scope.mirror, snap.id), { missingInOdoo: serverTimestamp() }, { merge: true });
    missing++;
    if (++inBatch >= 400) await flush();
  }
  await flush();

  const who = whoami();
  await setDoc(
    doc(db, COL_PULL_STATE, scope.id),
    {
      scope: scope.id,
      labelAr: scope.labelAr,
      odooModel: scope.odooModel,
      mirror: scope.mirror,
      lastPulledAt: serverTimestamp(),
      lastCount: written,
      lastMissing: missing,
      lastSkipped: skipped,
      lastError: null,
      byUid: who.byUid,
      byName: who.byName,
    },
    { merge: true }
  );

  return { scope: scope.id, fetched: rows.length, written, missing, skipped };
}

/** يسجّل فشل نطاقٍ في حالته — فالفشل يظهر حالةً لا يختفي (§16.21-١٩ ‹827›). */
async function recordFailure(scopeId, error) {
  const scope = scopeOf(scopeId);
  try {
    await setDoc(
      doc(db, COL_PULL_STATE, scopeId),
      {
        scope: scopeId,
        labelAr: scope?.labelAr ?? scopeId,
        lastError: String(error?.message ?? error ?? 'خطأ غير معروف').slice(0, 400),
        lastErrorAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error('pull state failure log failed:', e);
  }
}

/**
 * يسحب عدّة نطاقات ويُكمل رغم فشل أحدها.
 *
 * لا يرمي: نطاقٌ يفشل يُسجَّل خطؤه ويُكمل الباقي — فلا يحجب حسابٌ مفقود
 * سحبَ القيود كلّها.
 */
export async function pullScopes(scopeIds = []) {
  const ids = (Array.isArray(scopeIds) ? scopeIds : []).filter((id) => scopeOf(id)?.mirror);
  const results = [];
  for (const id of ids) {
    try {
      results.push({ ok: true, ...(await pullScope(id)) });
    } catch (error) {
      await recordFailure(id, error);
      results.push({ ok: false, scope: id, error: String(error?.message ?? error) });
    }
  }
  return results;
}

/** يسحب المالية كلّها — الحسابات ثمّ القيود ثمّ أسطرها ثمّ المدفوعات. */
export function pullFinance() {
  return pullScopes(financeScopes().map((s) => s.id));
}

/** يسحب كلّ نطاقٍ له مرآة. */
export function pullAllMirrors() {
  return pullScopes(PULL_SCOPE_IDS);
}

/* ═══════════════ القراءة الحيّة ═══════════════ */

/** اشتراكٌ حيّ على مرآة نطاق. */
export function listenMirror(scopeId, callback, onError) {
  const scope = scopeOf(scopeId);
  if (!scope?.mirror) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, scope.mirror),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** اشتراكٌ حيّ على حالة السحب لكلّ النطاقات. */
export function listenPullState(callback, onError) {
  return onSnapshot(
    query(collection(db, COL_PULL_STATE), orderBy('scope')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** يحوّل قائمة حالات السحب إلى خريطة `scope → حالة` — للواجهة. */
export function pullStateByScope(rows = []) {
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) if (row?.scope) map[row.scope] = row;
  return map;
}

/** ختم زمنٍ من Firestore إلى ميلي ثانية — أو `null`. */
export function stampMs(stamp) {
  if (!stamp) return null;
  if (typeof stamp?.toMillis === 'function') return stamp.toMillis();
  if (typeof stamp?.seconds === 'number') return stamp.seconds * 1000;
  const parsed = Date.parse(stamp);
  return Number.isFinite(parsed) ? parsed : null;
}
