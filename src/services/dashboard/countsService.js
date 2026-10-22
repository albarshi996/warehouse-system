/**
 * ‹ODOO-ORD› عدّاداتُ اللوحات — تجميعٌ لا اشتراك.
 *
 * لوحةُ اللوجستيات كانت تشترك في الرحلات وأوامر الصيانة والعُهد والعملاء والموردين **كاملةً** لتعرض `.length` وحدَه.
 * والعدُّ بـ`getCountFromServer` قراءةٌ واحدةٌ لكلّ ألف — ونفسُ ما يفعله `countLocations` في سيّد المواقع.
 */
import { collection, getCountFromServer, query, where, Timestamp, db } from '../_db/index.js';

/**
 * عددُ مستندات مجموعة — كلُّها، أو ما طابعُه في `sinceField` منذ `sinceMs`.
 * @returns {Promise<number>}
 */
export async function countCollection(name, { sinceField = '', sinceMs = null } = {}) {
  const ref = collection(db, name);
  const q = sinceField && Number.isFinite(sinceMs) ? query(ref, where(sinceField, '>=', Timestamp.fromMillis(sinceMs))) : ref;
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
