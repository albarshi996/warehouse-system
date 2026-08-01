/**
 * خدمة مصفوفة الصلاحيات — القراءة والكتابة السحابية لـ`access_control/matrix`.
 *
 * القاعدة (في `firestore.rules`): القراءة لكل مصادَق (يحتاجها حارس الواجهة
 * والقائمة)، والكتابة للمدير العام وحده، مع سجلّ نسخ ملحق-فقط `versions`.
 *
 * ⚠️ حتى ينشر المالك القاعدة الجديدة: القراءة سترتدّ permission-denied —
 * الدوالّ هنا تبتلع ذلك وتعيد null، فيعمل الحارس بالكتالوج وحده (سقوط آمن).
 */
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '../../config/firebase.js';
import { normalizeMatrix, EMPTY_MATRIX } from './accessMatrix.js';

const COL = 'access_control';
const DOC_ID = 'matrix';

const matrixRef = () => doc(db, COL, DOC_ID);

/** اشتراك حيّ: يسلّم المصفوفة المطبَّعة، أو null عند تعذّر القراءة (سقوط آمن). */
export function subscribeMatrix(cb) {
  return onSnapshot(
    matrixRef(),
    (snap) => cb(snap.exists() ? normalizeMatrix(snap.data()) : { ...EMPTY_MATRIX, overrides: {} }),
    () => cb(null)
  );
}

/** جلبة واحدة — للحارس وقائمة الأدوار. null عند التعذّر (يُكمل بالكتالوج). */
export async function fetchMatrixOnce() {
  try {
    const snap = await getDoc(matrixRef());
    return snap.exists() ? normalizeMatrix(snap.data()) : { overrides: {} };
  } catch {
    return null;
  }
}

/**
 * حفظ (admin فقط بالقاعدة) + قيد نسخة في سجلّ ملحق-فقط.
 * فشل قيد السجلّ وحده لا يُفشل الحفظ — المصفوفة نفسها هي الجوهر.
 */
export async function saveMatrix(matrix, meta = {}) {
  const clean = normalizeMatrix(matrix);
  await setDoc(matrixRef(), {
    overrides: clean.overrides,
    updatedAt: serverTimestamp(),
    updatedBy: meta.updatedBy || null,
    updatedByName: meta.updatedByName || null,
  });
  try {
    await addDoc(collection(db, COL, DOC_ID, 'versions'), {
      overrides: clean.overrides,
      at: serverTimestamp(),
      by: meta.updatedBy || null,
    });
  } catch (err) {
    console.warn('حُفظت المصفوفة لكن قيد النسخة في السجلّ فشل:', err?.code || err);
  }
  return clean;
}
