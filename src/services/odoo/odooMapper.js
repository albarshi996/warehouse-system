/**
 * Field mapping between Odoo models and the app's existing data shapes.
 *
 * This is the single source of truth for how an Odoo record maps onto the
 * `Items_Master` / `Inbound_Log` / `Outbound_Log` shapes used everywhere else
 * in the app (see src/services/itemService.js and logService.js). The Excel
 * gateway reuses the SAME canonical shapes, so import/export, Firestore and
 * Odoo all speak one vocabulary.
 *
 * Odoo model conventions used here:
 *   product.product
 *     - default_code   → sku            (the item code)
 *     - name           → nameAr         (display name)
 *     - x_name_en      → nameEn         (custom studio field, optional)
 *     - categ_id       → category       ([id, "name"] many2one tuple)
 *     - uom_id         → unit           ([id, "name"] many2one tuple)
 *     - qty_available  → balance        (computed on-hand qty, read-only in Odoo)
 *     - x_min_stock    → minStock       (custom, optional)
 *   stock.move
 *     - product_id     → itemCode/sku   ([id, "name"] tuple; code parsed from name)
 *     - product_uom_qty→ qty
 *     - date           → timestamp
 */

/** Odoo many2one fields arrive as `[id, "label"]`; pull the label safely. */
export const m2oLabel = (value) => (Array.isArray(value) ? (value[1] ?? '') : (value ?? ''));

/** Odoo many2one id, or null. */
export const m2oId = (value) => (Array.isArray(value) ? (value[0] ?? null) : null);

/**
 * Map an Odoo `product.product` record → the app's Items_Master shape.
 * Missing fields degrade gracefully to the same defaults itemService uses.
 *
 * @param {object} rec  a product.product record from search_read
 * @returns {{ sku:string, nameAr:string, nameEn:string, category:string, unit:string, balance:number, minStock:number, odooId:(number|null) }}
 */
export function productToItem(rec = {}) {
  return {
    sku: String(rec.default_code ?? '').trim(),
    nameAr: String(rec.name ?? '').trim(),
    nameEn: String(rec.x_name_en ?? '').trim(),
    category: m2oLabel(rec.categ_id),
    unit: m2oLabel(rec.uom_id) || 'piece',
    balance: Number(rec.qty_available ?? 0) || 0,
    minStock: Number(rec.x_min_stock ?? 0) || 0,
    odooId: rec.id ?? null,
  };
}

/**
 * Map an Items_Master item → Odoo `product.product` create/write values.
 *
 * NOTE: `qty_available` is COMPUTED in real Odoo (driven by stock.quant), so it
 * is intentionally omitted from write values. Stock levels change through
 * inbound/outbound stock moves, not by writing the product. The offline mock
 * relaxes this so the training console can show balances changing.
 *
 * @param {object} item  Items_Master shape
 * @param {{ allowBalance?: boolean }} [opts]  mock uses allowBalance:true
 * @returns {object} Odoo product.product values
 */
export function itemToProductValues(item = {}, { allowBalance = false } = {}) {
  const values = {
    default_code: String(item.sku ?? '').trim().toUpperCase(),
    name: String(item.nameAr ?? '').trim(),
    x_name_en: String(item.nameEn ?? '').trim(),
    x_min_stock: Number(item.minStock ?? 0) || 0,
  };
  if (item.category) values.x_category_label = String(item.category).trim();
  if (allowBalance && item.balance != null) values.qty_available = Number(item.balance) || 0;
  return values;
}

/**
 * Map an Odoo `stock.move` record → the app's log shape (Inbound/Outbound).
 *
 * @param {object} rec  stock.move record
 * @returns {{ itemCode:string, qty:number, timestamp:(string|null), odooId:(number|null) }}
 */
export function stockMoveToLog(rec = {}) {
  // product_id label is usually "[CODE] Name" — recover the code when present.
  const label = m2oLabel(rec.product_id);
  const codeMatch = /\[([^\]]+)\]/.exec(label);
  return {
    itemCode: codeMatch ? codeMatch[1].trim() : label.trim(),
    qty: Number(rec.product_uom_qty ?? rec.qty ?? 0) || 0,
    timestamp: rec.date ?? null,
    odooId: rec.id ?? null,
  };
}
