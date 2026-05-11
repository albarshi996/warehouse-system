import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase.js';

/**
 * Inbound / Outbound log service.
 *
 * Provides real-time subscriptions for the two transactional collections
 * written by `inventoryService.js`. The dashboard uses these for the
 * "Total Inbound" and "Total Outbound" KPIs and for any future
 * recent-activity panels.
 *
 * Document shape (Inbound_Log and Outbound_Log share the same skeleton):
 * {
 *   itemCode:   string  // SKU
 *   qty:        number
 *   timestamp:  Timestamp  // serverTimestamp() at write time
 *   …per-flow extras (supplier, customer, batch, etc.)
 * }
 */

const INBOUND = 'Inbound_Log';
const OUTBOUND = 'Outbound_Log';

const subscribeCollection =
  (collectionName) =>
  (onChange, onError, opts = {}) => {
    const constraints = [orderBy('timestamp', 'desc')];
    if (typeof opts.max === 'number' && opts.max > 0) {
      constraints.push(limit(opts.max));
    }
    const q = query(collection(db, collectionName), ...constraints);
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
 * Subscribe to all inbound log entries, newest first.
 * Pass `{ max: N }` to cap the snapshot to the most recent N entries.
 *
 * @param {(entries: object[]) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @param {{ max?: number }} [opts]
 */
export const subscribeInboundLog = subscribeCollection(INBOUND);

/**
 * Subscribe to all outbound log entries, newest first.
 *
 * @param {(entries: object[]) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @param {{ max?: number }} [opts]
 */
export const subscribeOutboundLog = subscribeCollection(OUTBOUND);

/**
 * Sum the `qty` field across a list of log entries. Tolerates missing or
 * non-numeric values by coercing to 0.
 *
 * @param {object[]} entries
 * @returns {number}
 */
export const sumQuantities = (entries) =>
  entries.reduce((acc, entry) => acc + (Number(entry?.qty) || 0), 0);
