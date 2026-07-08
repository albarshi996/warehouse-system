import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase.js';

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
