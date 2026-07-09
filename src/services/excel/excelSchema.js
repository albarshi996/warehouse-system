/**
 * Excel <-> app schema definitions.
 *
 * Defines the canonical datasets (Items_Master, Inbound_Log, Outbound_Log) and,
 * for each, the columns, their types, whether they are required, and the set of
 * accepted header labels (Arabic + English aliases) so imported spreadsheets
 * don't have to match one exact header spelling.
 *
 * The canonical field names deliberately match the shapes used by
 * itemService.js / logService.js and src/services/odoo/odooMapper.js, so an
 * imported row can flow straight into Firestore OR Odoo unchanged.
 */

/**
 * @typedef {Object} ColumnDef
 * @property {string}   field     canonical field name
 * @property {string}   labelAr   default Arabic header used when EXPORTING
 * @property {'string'|'number'} type
 * @property {boolean}  required
 * @property {string[]} aliases   accepted header labels when IMPORTING (lowercased match)
 * @property {boolean} [nonNegative] number columns that must be >= 0
 */

/** @type {Record<string, { key:string, labelAr:string, columns: ColumnDef[] }>} */
export const DATASETS = {
  items: {
    key: 'items',
    labelAr: 'الأصناف (Items_Master)',
    columns: [
      { field: 'sku', labelAr: 'الكود SKU', type: 'string', required: true, aliases: ['sku', 'الكود', 'كود', 'كود الصنف', 'رقم الصنف', 'item code', 'code', 'default_code'] },
      { field: 'nameAr', labelAr: 'الاسم (عربي)', type: 'string', required: true, aliases: ['namear', 'الاسم', 'الاسم بالعربي', 'اسم الصنف', 'name', 'الصنف'] },
      { field: 'nameEn', labelAr: 'الاسم (إنجليزي)', type: 'string', required: false, aliases: ['nameen', 'الاسم بالانجليزي', 'name en', 'english name'] },
      { field: 'category', labelAr: 'الفئة', type: 'string', required: false, aliases: ['category', 'الفئة', 'التصنيف', 'المجموعة', 'categ'] },
      { field: 'unit', labelAr: 'الوحدة', type: 'string', required: false, aliases: ['unit', 'الوحدة', 'وحدة القياس', 'uom'] },
      { field: 'balance', labelAr: 'الرصيد', type: 'number', required: false, nonNegative: true, aliases: ['balance', 'الرصيد', 'الكمية', 'المتوفر', 'qty', 'quantity', 'qty_available'] },
      { field: 'minStock', labelAr: 'الحد الأدنى', type: 'number', required: false, nonNegative: true, aliases: ['minstock', 'الحد الأدنى', 'حد الطلب', 'min stock', 'reorder'] },
    ],
  },
  inbound: {
    key: 'inbound',
    labelAr: 'الوارد (Inbound_Log)',
    columns: [
      { field: 'itemCode', labelAr: 'الكود SKU', type: 'string', required: true, aliases: ['sku', 'itemcode', 'الكود', 'كود الصنف', 'item code', 'code'] },
      { field: 'qty', labelAr: 'الكمية', type: 'number', required: true, nonNegative: true, aliases: ['qty', 'الكمية', 'العدد', 'quantity', 'الوارد'] },
      { field: 'date', labelAr: 'التاريخ', type: 'string', required: false, aliases: ['date', 'التاريخ', 'تاريخ'] },
      { field: 'supplier', labelAr: 'المورّد', type: 'string', required: false, aliases: ['supplier', 'المورد', 'المورّد', 'الجهة', 'vendor'] },
      { field: 'note', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['note', 'ملاحظات', 'ملاحظة', 'البيان', 'remarks'] },
    ],
  },
  outbound: {
    key: 'outbound',
    labelAr: 'الصادر (Outbound_Log)',
    columns: [
      { field: 'itemCode', labelAr: 'الكود SKU', type: 'string', required: true, aliases: ['sku', 'itemcode', 'الكود', 'كود الصنف', 'item code', 'code'] },
      { field: 'qty', labelAr: 'الكمية', type: 'number', required: true, nonNegative: true, aliases: ['qty', 'الكمية', 'العدد', 'quantity', 'الصادر'] },
      { field: 'date', labelAr: 'التاريخ', type: 'string', required: false, aliases: ['date', 'التاريخ', 'تاريخ'] },
      { field: 'customer', labelAr: 'العميل', type: 'string', required: false, aliases: ['customer', 'العميل', 'الجهة', 'المستلم', 'الزبون'] },
      { field: 'note', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['note', 'ملاحظات', 'ملاحظة', 'البيان', 'remarks'] },
    ],
  },
};

/** Normalize a header cell for alias matching (trim, lowercase, collapse spaces). */
export const normalizeHeader = (h) =>
  String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Build a lookup from every accepted header alias → canonical column def, for
 * a given dataset. Used by the importer to resolve arbitrary spreadsheet headers.
 *
 * @param {string} datasetKey  'items' | 'inbound' | 'outbound'
 * @returns {Map<string, ColumnDef>}
 */
export function buildHeaderIndex(datasetKey) {
  const ds = DATASETS[datasetKey];
  if (!ds) throw new Error(`Unknown dataset: ${datasetKey}`);
  const index = new Map();
  for (const col of ds.columns) {
    index.set(normalizeHeader(col.field), col);
    index.set(normalizeHeader(col.labelAr), col);
    for (const alias of col.aliases) index.set(normalizeHeader(alias), col);
  }
  return index;
}

/** Coerce a raw cell to a number, returning NaN when it isn't numeric. */
export function toNumber(raw) {
  if (raw === '' || raw == null) return 0;
  // Tolerate Arabic-Indic digits and thousands separators.
  const western = String(raw)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/,/g, '')
    .trim();
  const n = Number(western);
  return Number.isFinite(n) ? n : NaN;
}
