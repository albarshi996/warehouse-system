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

/**
 * بذرة الطبقة المالية (SAP-16) — شجرة حسابات وقيود وأسطر ومدفوعات.
 *
 * لماذا بذرةٌ أصلًا وقد كانت أوامر الشراء تبدأ فارغة عمدًا؟ لأنّ تلك تُملأ
 * بالدفع من البوابة — والدفع **مختوم** الآن. فالمالية لا تصل إلا سحبًا، ولو
 * تُركت فارغة لظهرت شاشة المرآة خاوية ولم يُعرف أهي فارغةٌ أم معطوبة.
 *
 * الأرقام **تدريبيّة صرفة**: أسماء الحسابات تصنيفيّة لا أرقام حساباتٍ معتمدة
 * (§16.4 ‹549›)، والمبالغ تتّسق مع مثال القبول في الخطة (١٤٬٠٠٠ · ٤٬٠٠٠).
 * لا تُقرأ بوصفها بيانات إنتاج.
 */
function seedAccounts() {
  return [
    { id: 11, code: '1101', name: 'الصندوق', account_type: 'asset_cash', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 12, code: '1102', name: 'البنك', account_type: 'asset_cash', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 13, code: '1201', name: 'العملاء', account_type: 'asset_receivable', reconcile: true, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 14, code: '1301', name: 'المخزون — متاح', account_type: 'asset_current', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 15, code: '1302', name: 'المخزون — تحت الفحص', account_type: 'asset_current', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 16, code: '2101', name: 'الموردون', account_type: 'liability_payable', reconcile: true, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 17, code: '2102', name: 'استلامات غير مفوترة', account_type: 'liability_current', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 18, code: '4101', name: 'المبيعات', account_type: 'income', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 19, code: '5101', name: 'تكلفة المبيعات', account_type: 'expense_direct_cost', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
    { id: 20, code: '5201', name: 'فروقات وتسويات المخزون', account_type: 'expense', reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: [1, 'LYD'] },
  ];
}

function seedMovesFinance() {
  return [
    { id: 901, name: 'BILL/2026/0001', ref: false, move_type: 'in_invoice', state: 'posted', date: '2026-08-10', invoice_date: '2026-08-10', invoice_date_due: '2026-09-09', partner_id: [4, 'شركة الريشة الذهبية'], journal_id: [2, 'المشتريات'], currency_id: [1, 'LYD'], amount_total: 14000, amount_residual: 4000, company_id: [1, 'براندزو'], reversed_entry_id: false, invoice_origin: 'PO-2026-0009' },
    { id: 902, name: 'INV/2026/0001', ref: false, move_type: 'out_invoice', state: 'posted', date: '2026-08-11', invoice_date: '2026-08-11', invoice_date_due: '2026-09-10', partner_id: [7, 'متجر فينسيا'], journal_id: [3, 'المبيعات'], currency_id: [1, 'LYD'], amount_total: 8500, amount_residual: 8500, company_id: [1, 'براندزو'], reversed_entry_id: false, invoice_origin: 'DN-2026-0004' },
    { id: 903, name: 'MISC/2026/0007', ref: 'تسوية جرد', move_type: 'entry', state: 'posted', date: '2026-08-12', invoice_date: false, invoice_date_due: false, partner_id: false, journal_id: [5, 'قيود متنوّعة'], currency_id: [1, 'LYD'], amount_total: 320, amount_residual: 0, company_id: [1, 'براندزو'], reversed_entry_id: false, invoice_origin: 'ADJ-2026-0002' },
    { id: 904, name: 'RBILL/2026/0001', ref: false, move_type: 'in_refund', state: 'draft', date: '2026-08-13', invoice_date: '2026-08-13', invoice_date_due: false, partner_id: [4, 'شركة الريشة الذهبية'], journal_id: [2, 'المشتريات'], currency_id: [1, 'LYD'], amount_total: 450, amount_residual: 450, company_id: [1, 'براندزو'], reversed_entry_id: false, invoice_origin: 'SRN-2026-0003' },
  ];
}

function seedMoveLines() {
  return [
    { id: 9011, move_id: [901, 'BILL/2026/0001'], account_id: [14, 'المخزون — متاح'], partner_id: [4, 'شركة الريشة الذهبية'], name: 'بضاعة مستلمة', debit: 14000, credit: 0, balance: 14000, date: '2026-08-10', currency_id: [1, 'LYD'] },
    { id: 9012, move_id: [901, 'BILL/2026/0001'], account_id: [16, 'الموردون'], partner_id: [4, 'شركة الريشة الذهبية'], name: 'التزام المورّد', debit: 0, credit: 14000, balance: -14000, date: '2026-08-10', currency_id: [1, 'LYD'] },
    { id: 9021, move_id: [902, 'INV/2026/0001'], account_id: [13, 'العملاء'], partner_id: [7, 'متجر فينسيا'], name: 'مديونيّة العميل', debit: 8500, credit: 0, balance: 8500, date: '2026-08-11', currency_id: [1, 'LYD'] },
    { id: 9022, move_id: [902, 'INV/2026/0001'], account_id: [18, 'المبيعات'], partner_id: [7, 'متجر فينسيا'], name: 'إيراد مبيعات', debit: 0, credit: 8500, balance: -8500, date: '2026-08-11', currency_id: [1, 'LYD'] },
    { id: 9031, move_id: [903, 'MISC/2026/0007'], account_id: [20, 'فروقات وتسويات المخزون'], partner_id: false, name: 'عجز جرد', debit: 320, credit: 0, balance: 320, date: '2026-08-12', currency_id: [1, 'LYD'] },
    { id: 9032, move_id: [903, 'MISC/2026/0007'], account_id: [14, 'المخزون — متاح'], partner_id: false, name: 'تخفيض المخزون', debit: 0, credit: 320, balance: -320, date: '2026-08-12', currency_id: [1, 'LYD'] },
  ];
}

function seedPayments() {
  return [
    { id: 701, name: 'PAY/2026/0001', payment_type: 'outbound', partner_type: 'supplier', partner_id: [4, 'شركة الريشة الذهبية'], amount: 10000, currency_id: [1, 'LYD'], date: '2026-08-12', state: 'posted', journal_id: [4, 'البنك'] },
    { id: 702, name: 'PAY/2026/0002', payment_type: 'inbound', partner_type: 'customer', partner_id: [7, 'متجر فينسيا'], amount: 2500, currency_id: [1, 'LYD'], date: '2026-08-13', state: 'draft', journal_id: [1, 'الصندوق'] },
  ];
}

/** Per-model in-memory tables. Rebuilt on module init (page load). */
const store = {
  'product.product': seedProducts(),
  'stock.move': seedMoves(),
  'account.account': seedAccounts(),
  'account.move': seedMovesFinance(),
  'account.move.line': seedMoveLines(),
  'account.payment': seedPayments(),
  // أوامر الشراء والاستلامات تبدأ فارغة: جسر المزامنة يملؤها بدفع مستندات البوابة
  // الحقيقيّة (create('purchase.order'/'stock.picking', …)) — فالمرآة تعكس واقعك
  // لا بيانات وهميّة.
  'purchase.order': [],
  'stock.picking': [],
};

/** Next id per model, seeded above the highest existing id. */
const nextId = {
  'product.product': 1000,
  'stock.move': 2000,
  'purchase.order': 3000,
  'stock.picking': 4000,
  'account.account': 5000,
  'account.move': 6000,
  'account.move.line': 7000,
  'account.payment': 8000,
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
  store['purchase.order'] = [];
  store['stock.picking'] = [];
  nextId['product.product'] = 1000;
  nextId['stock.move'] = 2000;
  nextId['purchase.order'] = 3000;
  nextId['stock.picking'] = 4000;
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
