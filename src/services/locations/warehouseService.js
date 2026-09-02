import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { numberingProblems } from './binAnatomy.js';
import { schemeProblems } from './locationScheme.js';

/**
 * Warehouse service.
 *
 * Mirrors the inline subscription used by `WarehouseManager.jsx` so other
 * screens (e.g. the real-time dashboard) can reuse it without
 * duplicating the query.
 *
 * Document shape (all optional except `code`):
 * {
 *   code:      string  // canonical warehouse code, e.g. "WH001"
 *   name:      string  // Arabic display name
 *   manager:   string  // person responsible
 *   status:    string  // e.g. "نشط"
 *   createdAt: Timestamp
 * }
 */

const COLLECTION = 'warehouses';

/**
 * Subscribe to the warehouses collection in real time, ordered by `code`.
 * Returns the `unsubscribe` function — caller is responsible for calling it
 * on cleanup.
 *
 * @param {(warehouses: object[]) => void} onChange
 * @param {(error: Error) => void} [onError]
 */
export const subscribeWarehouses = (onChange, onError) => {
  const q = query(collection(db, COLLECTION), orderBy('code'));
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onChange(docs);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
};

/**
 * ⚠️ يجب أن تطابق `isManager()` في `firestore.rules` (سطر `warehouses`).
 * درسُ ل‑١٨: قائمةٌ تدّعي تطابقًا لا تملكه تمنع من تسمح له القاعدة.
 */
export const WAREHOUSE_ROLES = ['admin', 'warehouse_manager'];

export function canEditWarehouses(role) {
  return WAREHOUSE_ROLES.includes(role);
}

/**
 * حفظُ حزمة ترقيم المستودع — البادئةُ والمخطّطُ وتسمياتُ المقاطع.
 *
 * ═══ لماذا على وثيقة المستودع لا في مجموعةٍ جديدة ═══
 * لأنّها **صفةُ مستودعٍ** لا كيانٌ قائمٌ بذاته: مستودعٌ واحدٌ ومخطّطٌ واحد.
 * ومجموعةٌ ثانيةٌ تعني معرّفين لشيءٍ واحدٍ وقاعدةَ أمنٍ ثانيةً تُنسى.
 *
 * ═══ ولماذا تُحفظ أصلًا (الفجوة التي تسدّها) ═══
 * البانيةُ كانت تولّد ٣٦٠٠ كودٍ ثمّ **تنسى** المخطّط، فلا يبقى في النظام من
 * يعرف أنّ المقطع الثالث في `RH` يعني «الجهة» لا «الرفّ». فيقرأ العاملُ
 * رموزًا صمّاء، ويعرض النظامُ تسمياتٍ لا تصف مستودعَه.
 *
 * @param {string} warehouseId معرّفُ وثيقة المستودع (`addDoc` تولّده — ليس الكود)
 * @param {{binPrefix:string, scheme:object, segmentLabels?:object, valueLabels?:object}} numbering
 * @param {{name?:string}} [me]
 */
export async function saveWarehouseNumbering(warehouseId, numbering, me) {
  const id = String(warehouseId ?? '').trim();
  if (!id) throw new Error('معرّف المستودع مطلوب.');

  const problems = [
    ...numberingProblems(numbering),
    ...(numbering?.scheme ? schemeProblems(numbering.scheme) : []),
  ];
  if (problems.length) throw new Error(problems.join(' · '));

  await updateDoc(doc(db, COLLECTION, id), {
    binPrefix: String(numbering.binPrefix).trim().toUpperCase(),
    scheme: numbering.scheme ?? null,
    segmentLabels: numbering.segmentLabels ?? null,
    valueLabels: numbering.valueLabels ?? null,
    numberingUpdatedAt: serverTimestamp(),
    numberingUpdatedBy: me?.name || auth?.currentUser?.email || 'غير معروف',
    numberingUpdatedByUid: auth?.currentUser?.uid || null,
  });
}
