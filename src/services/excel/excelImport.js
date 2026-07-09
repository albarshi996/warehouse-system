import * as XLSX from 'xlsx';
import { DATASETS, buildHeaderIndex, normalizeHeader, toNumber } from './excelSchema.js';

/**
 * Excel import gateway.
 *
 * Reads a `.xlsx` file (via SheetJS), resolves its headers against the dataset
 * schema (Arabic/English aliases), validates every row, and returns clean rows
 * shaped exactly like Items_Master / Inbound_Log / Outbound_Log — ready to hand
 * to Firestore (itemService/inventoryService) or Odoo (odooMapper) unchanged.
 *
 * Nothing is written anywhere here: validation and shaping only. The caller
 * decides what to do with `rows` after reviewing `errors`.
 *
 * @typedef {Object} ImportError
 * @property {number} row      1-based spreadsheet row number (data rows start at 2)
 * @property {string} column   canonical field or header the error is about
 * @property {string} message  human-readable Arabic/English message
 *
 * @typedef {Object} ImportResult
 * @property {boolean} ok            true when there are zero errors
 * @property {string}  dataset       the dataset key used
 * @property {object[]} rows         valid, shaped rows (invalid rows excluded)
 * @property {ImportError[]} errors  every problem found
 * @property {{ total:number, valid:number, invalid:number, missingColumns:string[] }} summary
 */

/** Turn a File/Blob/ArrayBuffer into a SheetJS workbook. */
async function readWorkbook(input) {
  let data = input;
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    data = await input.arrayBuffer();
  }
  return XLSX.read(data, { type: 'array' });
}

/**
 * Validate + shape a single dataset from the first worksheet of a workbook.
 *
 * @param {File|Blob|ArrayBuffer} input   the .xlsx source
 * @param {string} datasetKey             'items' | 'inbound' | 'outbound'
 * @param {{ sheetName?: string }} [opts]
 * @returns {Promise<ImportResult>}
 */
export async function importSheet(input, datasetKey, opts = {}) {
  const ds = DATASETS[datasetKey];
  if (!ds) throw new Error(`Unknown dataset: ${datasetKey}`);

  let workbook;
  try {
    workbook = await readWorkbook(input);
  } catch (error) {
    console.error('Failed to read Excel file: ', error);
    throw new Error('تعذّر قراءة ملف Excel (قد يكون تالفًا أو بصيغة غير مدعومة). | Could not read the Excel file.');
  }

  const sheetName = opts.sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`لم يُعثر على ورقة العمل "${sheetName}". | Worksheet not found.`);
  }

  // Read as arrays-of-arrays so we control header resolution ourselves.
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  const errors = [];

  if (matrix.length < 2) {
    return {
      ok: false,
      dataset: datasetKey,
      rows: [],
      errors: [{ row: 1, column: '-', message: 'الملف لا يحتوي على صف عناوين وبيانات. | File has no header + data rows.' }],
      summary: { total: 0, valid: 0, invalid: 0, missingColumns: ds.columns.filter((c) => c.required).map((c) => c.field) },
    };
  }

  // ── Resolve headers ──────────────────────────────────────────────────────
  const headerRow = matrix[0];
  const headerIndex = buildHeaderIndex(datasetKey);
  /** column position -> ColumnDef */
  const posToCol = new Map();
  const seenFields = new Set();
  headerRow.forEach((cell, pos) => {
    const col = headerIndex.get(normalizeHeader(cell));
    if (col && !seenFields.has(col.field)) {
      posToCol.set(pos, col);
      seenFields.add(col.field);
    }
  });

  // Report required columns that are entirely missing from the sheet.
  const missingColumns = ds.columns
    .filter((c) => c.required && !seenFields.has(c.field))
    .map((c) => c.field);
  for (const field of missingColumns) {
    errors.push({ row: 1, column: field, message: `عمود إلزامي مفقود: «${field}». | Required column missing.` });
  }

  // ── Validate + shape each data row ───────────────────────────────────────
  const rows = [];
  const seenSku = new Set();
  let invalid = 0;

  for (let i = 1; i < matrix.length; i++) {
    const rawRow = matrix[i];
    const rowNum = i + 1; // 1-based, header is row 1
    const shaped = {};
    let rowHasError = false;

    for (const [pos, col] of posToCol.entries()) {
      const raw = rawRow[pos];

      if (col.type === 'number') {
        const n = toNumber(raw);
        if (Number.isNaN(n)) {
          errors.push({ row: rowNum, column: col.field, message: `قيمة غير رقمية في «${col.labelAr}»: «${raw}». | Non-numeric value.` });
          rowHasError = true;
          continue;
        }
        if (col.nonNegative && n < 0) {
          errors.push({ row: rowNum, column: col.field, message: `قيمة سالبة غير مسموحة في «${col.labelAr}». | Negative value not allowed.` });
          rowHasError = true;
          continue;
        }
        shaped[col.field] = n;
      } else {
        shaped[col.field] = String(raw ?? '').trim();
      }
    }

    // Skip fully blank rows silently — BEFORE required-field validation, so a
    // stray empty row never produces spurious "required field empty" errors.
    const isBlank = Object.values(shaped).every((v) => v === '' || v === 0 || v == null);
    if (isBlank) continue;

    // Required-field presence (only for columns that exist in the sheet).
    for (const col of ds.columns) {
      if (!col.required || !seenFields.has(col.field)) continue;
      const val = shaped[col.field];
      if (val === '' || val == null) {
        errors.push({ row: rowNum, column: col.field, message: `حقل إلزامي فارغ: «${col.labelAr}». | Required field is empty.` });
        rowHasError = true;
      }
    }

    // Dataset-specific extra rules.
    if (datasetKey === 'items') {
      const sku = String(shaped.sku ?? '').trim().toUpperCase();
      shaped.sku = sku;
      if (sku && seenSku.has(sku)) {
        errors.push({ row: rowNum, column: 'sku', message: `تكرار SKU داخل الملف: «${sku}». | Duplicate SKU in file.` });
        rowHasError = true;
      }
      if (sku) seenSku.add(sku);
    } else {
      // logs: normalize itemCode + require qty > 0
      shaped.itemCode = String(shaped.itemCode ?? '').trim().toUpperCase();
      if (seenFields.has('qty') && shaped.qty != null && shaped.qty <= 0) {
        errors.push({ row: rowNum, column: 'qty', message: 'الكمية يجب أن تكون أكبر من صفر. | Quantity must be greater than zero.' });
        rowHasError = true;
      }
    }

    if (rowHasError) {
      invalid++;
    } else {
      rows.push(shaped);
    }
  }

  return {
    ok: errors.length === 0,
    dataset: datasetKey,
    rows,
    errors,
    summary: {
      total: rows.length + invalid,
      valid: rows.length,
      invalid,
      missingColumns,
    },
  };
}
