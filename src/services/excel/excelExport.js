import * as XLSX from 'xlsx';
import { DATASETS } from './excelSchema.js';

/**
 * Excel export gateway.
 *
 * Generates `.xlsx` files from the app's canonical data shapes
 * (Items_Master / Inbound_Log / Outbound_Log). Column order and Arabic headers
 * come from the shared schema so an exported file re-imports cleanly (round-trip
 * safe).
 *
 * These functions trigger a browser download (they call `XLSX.writeFile`), so
 * they must run client-side (inside a React island / event handler).
 */

/**
 * Turn an array of records into an array-of-arrays (header row + data rows)
 * following the dataset's column order.
 *
 * @param {string} datasetKey
 * @param {object[]} records
 * @returns {any[][]}
 */
function toMatrix(datasetKey, records) {
  const ds = DATASETS[datasetKey];
  if (!ds) throw new Error(`Unknown dataset: ${datasetKey}`);
  const header = ds.columns.map((c) => c.labelAr);
  const body = (records ?? []).map((rec) =>
    ds.columns.map((c) => {
      const val = rec[c.field];
      return val == null ? '' : val;
    })
  );
  return [header, ...body];
}

/**
 * Build a workbook (in memory) from one or more datasets.
 * Pass `[{ datasetKey, records, sheetName? }]`.
 *
 * @param {{ datasetKey:string, records:object[], sheetName?:string }[]} sheets
 * @returns {import('xlsx').WorkBook}
 */
export function buildWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { datasetKey, records, sheetName } of sheets) {
    const ds = DATASETS[datasetKey];
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(datasetKey, records));
    ws['!cols'] = ds.columns.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, (sheetName ?? ds.labelAr).slice(0, 31));
  }
  return wb;
}

/** Sanitize a user/derived filename and ensure a single .xlsx extension. */
function ensureXlsxName(name, fallback) {
  const base = String(name ?? '').trim() || fallback;
  const clean = base.replace(/[\\/:*?"<>|]/g, '').trim();
  return clean.toLowerCase().endsWith('.xlsx') ? clean : `${clean}.xlsx`;
}

/**
 * Export a single dataset to a downloaded .xlsx file.
 *
 * @param {string} datasetKey  'items' | 'inbound' | 'outbound'
 * @param {object[]} records
 * @param {{ fileName?: string }} [opts]
 */
export function exportDataset(datasetKey, records, opts = {}) {
  try {
    const wb = buildWorkbook([{ datasetKey, records }]);
    const fileName = ensureXlsxName(opts.fileName, `Brandzo_${datasetKey}`);
    XLSX.writeFile(wb, fileName);
    return fileName;
  } catch (error) {
    console.error('Failed to export Excel file: ', error);
    throw new Error('تعذّر توليد ملف Excel. | Failed to generate the Excel file.');
  }
}

/** Convenience wrappers matching the three canonical collections. */
export const exportItemsMaster = (items, opts) => exportDataset('items', items, opts);
export const exportInboundLog = (entries, opts) => exportDataset('inbound', entries, opts);
export const exportOutboundLog = (entries, opts) => exportDataset('outbound', entries, opts);

/**
 * Export a downloadable, correctly-headed BLANK template for a dataset so users
 * know exactly which columns the importer expects.
 *
 * @param {string} datasetKey
 */
export function exportTemplate(datasetKey) {
  return exportDataset(datasetKey, [], { fileName: `Brandzo_template_${datasetKey}` });
}
