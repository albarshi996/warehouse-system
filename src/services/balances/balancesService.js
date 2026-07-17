/**
 * مخزن الأرصدة — الكميات لكل (صنف × مخزن × تشغيلة)، منفصلةً عن تعريفات الأصناف.
 *
 * لماذا مستقلّ عن `Items_Master`؟ لأن التعريف يتغيّر نادرًا والرصيد يوميًّا
 * (قرار المالك 2026-07-15). فرفع ورقة التعريفات لا يمسّ الأرصدة، والعكس.
 *
 * البنية:  balances/{item__warehouse__batch}
 *   sku · barcode · nameAr · warehouse · location · batch · expiry
 *   qty · unitCost · countDate · updatedAt
 *
 * الصلاحية: للمديرَين (isManager) — كتابةً؛ القراءة لأي مصادَق (الجرد
 * والمستندات تحتاج معرفة الرصيد). تُطابق firestore.rules.
 */
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { importSheet } from '../excel/excelImport.js';
import { balanceId } from './balanceKey.js';
import { normalizeSku, normalizeBarcode } from '../itemService.js';

const COL = 'balances';
const BATCH_LIMIT = 500;

export const BALANCES_ROLES = ['admin', 'warehouse_manager'];
export function canEditBalances(role) {
  return BALANCES_ROLES.includes(role);
}

/** يستمع لكل الأرصدة لحظيًّا. */
export function listenBalances(callback, onError) {
  return onSnapshot(
    collection(db, COL),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** أرصدة صنف بعينه (بكوده) عبر كل المخازن والتشغيلات. */
export async function balancesForSku(sku) {
  const id = normalizeSku(sku);
  if (!id) return [];
  const snap = await getDocs(query(collection(db, COL), where('sku', '==', id)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** أرصدة صنف بباركوده. */
export async function balancesForBarcode(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) return [];
  const snap = await getDocs(query(collection(db, COL), where('barcode', '==', code)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** يقرأ كل الأرصدة مرّة (لبناء المعاينة). */
function fetchAllOnce() {
  return new Promise((resolve, reject) => {
    const unsub = listenBalances(
      (rows) => {
        unsub();
        resolve(new Map(rows.map((r) => [r.id, r])));
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });
}

/**
 * يحلّل ورقة الأرصدة ويبني معاينة **بلا كتابة**.
 * يقرأ ورقة «Balances» تحديدًا إن وُجدت، وإلا أول ورقة.
 */
export async function analyzeBalancesFile(file) {
  const result = await importSheet(file, 'balances', { sheetName: pickSheet(file) });
  const existing = await fetchAllOnce();

  const created = [];
  const updated = [];
  const unchanged = [];
  const skipped = []; // صفوف بلا معرّف صالح

  for (const row of result.rows) {
    const id = balanceId(row);
    if (!id) {
      skipped.push(row);
      continue;
    }
    const shaped = { ...row, id };
    const prior = existing.get(id);
    if (!prior) created.push(shaped);
    else if (Number(prior.qty) !== Number(row.qty) || Number(prior.unitCost || 0) !== Number(row.unitCost || 0))
      updated.push({ ...shaped, _before: { qty: prior.qty, unitCost: prior.unitCost } });
    else unchanged.push(shaped);
  }

  return {
    ...result,
    plan: { created, updated, unchanged, skipped },
    existing,
  };
}

/** اسم ورقة الأرصدة — importSheet سيتولّى الاسم؛ نُمرّر Balances إن أمكن. */
function pickSheet() {
  return 'Balances';
}

/** يكتب المعاينة المعتمدة إلى مخزن الأرصدة (دفعات). */
export async function commitBalancesImport(analysis) {
  if (!analysis?.ok) throw new Error('لا تُستورد ورقة فيها أخطاء — صحّح الصفوف المعلَّمة أولًا.');
  const toWrite = [...analysis.plan.created, ...analysis.plan.updated];
  if (toWrite.length === 0) return { created: 0, updated: 0 };

  let created = analysis.plan.created.length;
  let updated = analysis.plan.updated.length;

  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of toWrite.slice(i, i + BATCH_LIMIT)) {
      const { id, _before, ...data } = row;
      batch.set(
        doc(db, COL, id),
        {
          sku: normalizeSku(data.sku),
          barcode: normalizeBarcode(data.barcode),
          nameAr: String(data.nameAr || '').trim(),
          warehouse: String(data.warehouse || '').trim(),
          location: String(data.location || '').trim(),
          batch: String(data.batch || '').trim(),
          expiry: String(data.expiry || '').trim(),
          qty: Number(data.qty) || 0,
          unitCost: Number(data.unitCost) || 0,
          countDate: String(data.countDate || '').trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
  return { created, updated };
}
