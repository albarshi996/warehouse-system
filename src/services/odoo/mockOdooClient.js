/**
 * Offline mock Odoo client — the "training simulator".
 *
 * Implements the EXACT same interface as the real client
 * (authenticate / searchRead / create / write / unlink) but operates on a
 * fixed, in-memory dataset. It performs NO network I/O whatsoever and imports
 * neither Firebase nor the real proxy, so a training session can never touch a
 * real Odoo instance or the real Firestore.
 *
 * The dataset is seeded fresh on every page load (deterministic — no random
 * ids, no clock), so trainees can experiment freely and simply reload to reset.
 */

/** Deterministic seed for product.product (Odoo-style field names). */
function seedProducts() {
  return [
    { id: 101, default_code: 'SKU-1001', name: 'زيت محرك 5W-30', x_name_en: 'Engine Oil 5W-30', categ_id: [2, 'زيوت'], uom_id: [1, 'علبة'], qty_available: 120, x_min_stock: 30 },
    { id: 102, default_code: 'SKU-1002', name: 'فلتر هواء', x_name_en: 'Air Filter', categ_id: [3, 'قطع غيار'], uom_id: [2, 'قطعة'], qty_available: 45, x_min_stock: 20 },
    { id: 103, default_code: 'SKU-1003', name: 'إطار 205/55 R16', x_name_en: 'Tyre 205/55 R16', categ_id: [4, 'إطارات'], uom_id: [2, 'قطعة'], qty_available: 8, x_min_stock: 12 },
    { id: 104, default_code: 'SKU-1004', name: 'بطارية 70 أمبير', x_name_en: 'Battery 70Ah', categ_id: [3, 'قطع غيار'], uom_id: [2, 'قطعة'], qty_available: 22, x_min_stock: 10 },
    { id: 105, default_code: 'SKU-1005', name: 'سائل تبريد', x_name_en: 'Coolant', categ_id: [2, 'زيوت'], uom_id: [1, 'علبة'], qty_available: 60, x_min_stock: 25 },
    { id: 106, default_code: 'SKU-1006', name: 'مساحات زجاج', x_name_en: 'Wiper Blades', categ_id: [3, 'قطع غيار'], uom_id: [5, 'طقم'], qty_available: 3, x_min_stock: 15 },
    { id: 107, default_code: 'SKU-1007', name: 'شمعات إشعال', x_name_en: 'Spark Plugs', categ_id: [3, 'قطع غيار'], uom_id: [5, 'طقم'], qty_available: 40, x_min_stock: 18 },
    { id: 108, default_code: 'SKU-1008', name: 'فلتر زيت', x_name_en: 'Oil Filter', categ_id: [3, 'قطع غيار'], uom_id: [2, 'قطعة'], qty_available: 75, x_min_stock: 30 },
  ];
}

/** Deterministic seed for stock.move (inbound = positive dest, kept simple). */
function seedMoves() {
  return [
    { id: 501, product_id: [101, '[SKU-1001] زيت محرك 5W-30'], product_uom_qty: 50, date: '2026-06-01 09:00:00', x_direction: 'in' },
    { id: 502, product_id: [103, '[SKU-1003] إطار 205/55 R16'], product_uom_qty: 20, date: '2026-06-02 11:30:00', x_direction: 'in' },
    { id: 503, product_id: [103, '[SKU-1003] إطار 205/55 R16'], product_uom_qty: 12, date: '2026-06-03 14:10:00', x_direction: 'out' },
    { id: 504, product_id: [104, '[SKU-1004] بطارية 70 أمبير'], product_uom_qty: 8, date: '2026-06-04 10:05:00', x_direction: 'out' },
    { id: 505, product_id: [106, '[SKU-1006] مساحات زجاج'], product_uom_qty: 30, date: '2026-06-05 08:45:00', x_direction: 'in' },
  ];
}

/** Per-model in-memory tables. Rebuilt on module init (page load). */
const store = {
  'product.product': seedProducts(),
  'stock.move': seedMoves(),
};

/** Next id per model, seeded above the highest existing id. */
const nextId = {
  'product.product': 1000,
  'stock.move': 2000,
};

function allocId(model) {
  nextId[model] = (nextId[model] ?? 1000) + 1;
  return nextId[model];
}

/** Apply a single Odoo domain clause `[field, op, value]` to a record. */
function matchClause(record, [field, op, value]) {
  const actual = record[field];
  switch (op) {
    case '=':
    case '==':
      return actual === value;
    case '!=':
      return actual !== value;
    case 'ilike':
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(value ?? '').toLowerCase());
    case 'like':
      return String(actual ?? '').includes(String(value ?? ''));
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'not in':
      return Array.isArray(value) && !value.includes(actual);
    case '>':
      return Number(actual) > Number(value);
    case '<':
      return Number(actual) < Number(value);
    case '>=':
      return Number(actual) >= Number(value);
    case '<=':
      return Number(actual) <= Number(value);
    default:
      return true;
  }
}

/**
 * Match a record against an Odoo domain. Supports a flat list of `[f,op,v]`
 * clauses ANDed together (the common case). Logical operators ('|','&') are
 * treated as no-ops (still ANDs) — sufficient for the training simulator.
 */
function matchDomain(record, domain = []) {
  return domain
    .filter((clause) => Array.isArray(clause))
    .every((clause) => matchClause(record, clause));
}

/** Project a record down to the requested fields (Odoo always returns `id`). */
function project(record, fields) {
  if (!fields || fields.length === 0) return { ...record };
  const out = { id: record.id };
  for (const f of fields) out[f] = record[f];
  return out;
}

/** Simulated latency-free async so callers can `await` exactly like the real client. */
const resolve = (value) => Promise.resolve(value);

export const authenticate = async () => resolve(1); // mock uid

export const searchRead = async (model, domain = [], fields = [], opts = {}) => {
  const table = store[model] ?? [];
  let rows = table.filter((r) => matchDomain(r, domain));

  if (opts.order) {
    const [key, dir = 'asc'] = String(opts.order).split(/\s+/);
    rows = [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return dir.toLowerCase() === 'desc' ? -cmp : cmp;
    });
  }

  const offset = Number(opts.offset ?? 0) || 0;
  const limit = opts.limit != null ? Number(opts.limit) : undefined;
  if (offset) rows = rows.slice(offset);
  if (limit != null) rows = rows.slice(0, limit);

  return resolve(rows.map((r) => project(r, fields)));
};

export const create = async (model, values) => {
  if (!store[model]) store[model] = [];
  const id = allocId(model);
  store[model].push({ id, ...values });
  return resolve(id);
};

export const write = async (model, ids, values) => {
  const idList = Array.isArray(ids) ? ids : [ids];
  const table = store[model] ?? [];
  for (const rec of table) {
    if (idList.includes(rec.id)) Object.assign(rec, values);
  }
  return resolve(true);
};

export const unlink = async (model, ids) => {
  const idList = Array.isArray(ids) ? ids : [ids];
  store[model] = (store[model] ?? []).filter((rec) => !idList.includes(rec.id));
  return resolve(true);
};

/** Restore the seed dataset (used by a "reset simulator" button). */
export const resetMock = () => {
  store['product.product'] = seedProducts();
  store['stock.move'] = seedMoves();
  nextId['product.product'] = 1000;
  nextId['stock.move'] = 2000;
};

export const mockOdooClient = {
  kind: 'mock',
  authenticate,
  searchRead,
  create,
  write,
  unlink,
  resetMock,
};

export default mockOdooClient;
