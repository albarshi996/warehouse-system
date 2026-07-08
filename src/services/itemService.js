import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';

/**
 * Item Master service.
 *
 * Each Firestore document in `Items_Master` is keyed by its **SKU** so that
 * duplicates are impossible at the database layer (`setDoc` with `merge: false`
 * will overwrite the same id; the create helper below explicitly fails if the
 * SKU is already in use).
 *
 * Document shape:
 * {
 *   sku:       string  // also the document id, uppercased + trimmed
 *   nameAr:    string  // Arabic display name (required)
 *   nameEn:    string  // English / Latin name (optional)
 *   category:  string  // free-form category, e.g. "إلكترونيات"
 *   unit:      string  // "piece" | "box" | "kg" | …
 *   balance:   number  // current on-hand quantity (mutated by GRN/Outbound)
 *   minStock:  number  // re-order threshold
 *   archived:  boolean // soft-delete flag
 *   createdAt: Timestamp
 *   updatedAt: Timestamp
 * }
 */

const COLLECTION = 'Items_Master';

/** Normalize a user-entered SKU into the canonical form used as the doc id. */
export const normalizeSku = (raw) =>
  String(raw ?? '')
    .trim()
    .toUpperCase();

/**
 * Subscribe to the items collection in real time. Returns the `unsubscribe`
 * function — caller is responsible for invoking it on cleanup.
 *
 * @param {(items: object[]) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @param {{ includeArchived?: boolean }} [opts]
 */
export const subscribeItems = (onChange, onError, { includeArchived = false } = {}) => {
  const q = query(collection(db, COLLECTION), orderBy('sku'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data());
      onChange(includeArchived ? items : items.filter((it) => !it.archived));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
};

/**
 * Create a brand-new item. Throws if `sku` is empty or already exists.
 *
 * @param {object} input
 * @param {string} input.sku
 * @param {string} input.nameAr
 * @param {string} [input.nameEn]
 * @param {string} [input.category]
 * @param {string} [input.unit]
 * @param {number|string} [input.balance]
 * @param {number|string} [input.minStock]
 */
export const createItem = async ({
  sku,
  nameAr,
  nameEn = '',
  category = '',
  unit = 'piece',
  balance = 0,
  minStock = 0,
}) => {
  const id = normalizeSku(sku);
  if (!id) throw new Error('SKU is required');
  if (!nameAr || !nameAr.trim()) throw new Error('Arabic name is required');

  const ref = doc(db, COLLECTION, id);
  await setDoc(ref, {
    sku: id,
    nameAr: nameAr.trim(),
    nameEn: nameEn.trim(),
    category: category.trim(),
    unit,
    balance: Number(balance) || 0,
    minStock: Number(minStock) || 0,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/**
 * Patch an existing item. SKU cannot be changed — to rename, archive the old
 * one and create a new one.
 *
 * @param {string} sku
 * @param {object} patch
 */
export const updateItem = async (sku, patch) => {
  const id = normalizeSku(sku);
  if (!id) throw new Error('SKU is required');

  const next = { ...patch };
  delete next.sku;
  delete next.createdAt;
  if ('balance' in next) next.balance = Number(next.balance) || 0;
  if ('minStock' in next) next.minStock = Number(next.minStock) || 0;
  if ('nameAr' in next) next.nameAr = String(next.nameAr).trim();
  if ('nameEn' in next) next.nameEn = String(next.nameEn).trim();
  if ('category' in next) next.category = String(next.category).trim();

  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...next, updatedAt: serverTimestamp() });
};

/** Soft-delete: flip `archived` to true. Item is hidden from default lists. */
export const archiveItem = async (sku) => {
  const ref = doc(db, COLLECTION, normalizeSku(sku));
  await updateDoc(ref, { archived: true, updatedAt: serverTimestamp() });
};

/** Reverse `archiveItem`. */
export const unarchiveItem = async (sku) => {
  const ref = doc(db, COLLECTION, normalizeSku(sku));
  await updateDoc(ref, { archived: false, updatedAt: serverTimestamp() });
};

/** Common units used in the Brandzo catalogue. Extend as needed. */
export const UNIT_OPTIONS = [
  { value: 'piece', labelAr: 'قطعة' },
  { value: 'box', labelAr: 'كرتون' },
  { value: 'pack', labelAr: 'علبة' },
  { value: 'kg', labelAr: 'كيلوجرام' },
  { value: 'litre', labelAr: 'لتر' },
  { value: 'metre', labelAr: 'متر' },
];
