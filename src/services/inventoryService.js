import { collection, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

/**
 * INVENTORY LOGIC OVERVIEW (Excel Methodology):
 *
 * In this system, the 'Balance' of an item is maintained as:
 * Balance = (Total Inbound) - (Total Outbound)
 *
 * When an Inbound record is added, the Balance in 'Items_Master' increases.
 * When an Outbound record is added, the Balance in 'Items_Master' decreases.
 *
 * Firestore's `increment` function is used to ensure atomic updates to the balance,
 * preventing race conditions during concurrent operations.
 */

/**
 * Adds a new record to the 'Inbound_Log' collection and updates the item balance.
 * @param {Object} data - The inbound record data (sku, quantity, supplier, etc.)
 */
export const addInboundRecord = async (data) => {
  try {
    // 1. Add record to Inbound_Log
    const docRef = await addDoc(collection(db, 'Inbound_Log'), {
      ...data,
      timestamp: serverTimestamp(),
    });

    // 2. Update Balance in Items_Master (Balance = Balance + Quantity)
    await updateItemBalance(data.itemCode, data.qty);

    return docRef.id;
  } catch (error) {
    console.error('Error adding inbound record: ', error);
    throw error;
  }
};

/**
 * Adds a new record to the 'Outbound_Log' collection and updates the item balance.
 * @param {Object} data - The outbound record data (sku, quantity, customer, etc.)
 */
export const addOutboundRecord = async (data) => {
  try {
    // 1. Add record to Outbound_Log
    const docRef = await addDoc(collection(db, 'Outbound_Log'), {
      ...data,
      timestamp: serverTimestamp(),
    });

    // 2. Update Balance in Items_Master (Balance = Balance - Quantity)
    // We pass negative quantity to decrement the balance
    await updateItemBalance(data.itemCode, -data.qty);

    return docRef.id;
  } catch (error) {
    console.error('Error adding outbound record: ', error);
    throw error;
  }
};

/**
 * Updates the 'balance' field of a specific item in the 'Items_Master' collection.
 * This handles both inbound (positive change) and outbound (negative change).
 *
 * Logic: New Balance = Current Balance + quantityChange
 *
 * @param {string} itemCode - The document ID of the item in 'Items_Master' (SKU)
 * @param {number} quantityChange - The amount to change the balance by (can be positive or negative)
 */
export const updateItemBalance = async (itemCode, quantityChange) => {
  try {
    const itemRef = doc(db, 'Items_Master', itemCode);

    await updateDoc(itemRef, {
      balance: increment(quantityChange),
      // Also update aggregate fields for historical tracking if needed
      ...(quantityChange > 0
        ? { inbound: increment(quantityChange) }
        : { outbound: increment(Math.abs(quantityChange)) }),
      lastUpdated: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating item balance: ', error);
    throw error;
  }
};
