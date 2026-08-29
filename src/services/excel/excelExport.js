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

/**
 * صفوفُ تصدير الماستر — **الرحلةُ ذهابًا وإيابًا بلا فقد**.
 *
 * الصنفُ يُخزَّن بـ`barcodes[]` (قائمة، فالعبوةُ الواحدة قد تحمل أكثر من
 * باركود)، والشيتُ عمودان: `barcode` و`barcodeAlt`. فلو صُدّر السجلُّ كما
 * هو لخرج العمودان **فارغَين** — تصديرٌ يبدو ناجحًا ويُسقط الباركودات صامتًا،
 * ثمّ يُعاد استيرادُه فيمحوها. فيُفرَد الأوّلُ في `barcode` والباقي في
 * `barcodeAlt` مفصولًا بفاصلة (وهي صيغةُ `splitMulti` نفسُها عند القراءة).
 *
 * دالّةٌ خالصةٌ تُختبر وحدها — والزرُّ في الشاشة يستدعيها لا يُعيد بناءها.
 */
export function itemsExportRows(items) {
  return (items ?? []).map((it) => {
    const codes = (it?.barcodes ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);
    return { ...it, barcode: codes[0] ?? '', barcodeAlt: codes.slice(1).join(', ') };
  });
}

/** Convenience wrappers matching the three canonical collections. */
export const exportItemsMaster = (items, opts) => exportDataset('items', itemsExportRows(items), opts);
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

/**
 * قالبٌ بورقتين: **الأولى تُملأ** (عناوين المخطّط وحدها)، و**الثانية تشرح**
 * (قواعدُ التعبئة ثمّ مثالٌ عاملٌ بترتيب الأعمدة نفسه فيُنسخ كما هو).
 *
 * ولمَ ورقتان؟ لأنّ مثالًا داخل ورقة التعبئة يُستورد بيانًا حقيقيًّا إن نسي
 * المستخدم حذفه — والمستورِد يقرأ **الورقة الأولى** فتبقى نظيفةً بالبناء.
 *
 * والعناوين من `DATASETS` نفسها التي يقرأ بها المستورِد، فما يُكتب يُقرأ.
 *
 * @param {string} datasetKey
 * @param {{title:string, rules:[string,string][], exampleTitle?:string, example?:object[]}} guide
 * @param {{ fileName?: string, sheetName?: string, guideSheetName?: string }} [opts]
 */
export function buildTemplateWorkbook(datasetKey, guide, opts = {}) {
  const ds = DATASETS[datasetKey];
  if (!ds) throw new Error(`Unknown dataset: ${datasetKey}`);

  // ورقةُ التعبئة أوّلًا — والمستورِد يقرأ الأولى، فتبقى ورقةُ الشرح بعيدةً عنه.
  const wb = buildWorkbook([{ datasetKey, records: [], sheetName: opts.sheetName }]);

  const aoa = [[guide.title], []];
  for (const [label, text] of guide.rules ?? []) aoa.push([label, text]);
  if (guide.example?.length) {
    aoa.push([], [guide.exampleTitle ?? 'مثال:']);
    // المثال بترتيب أعمدة ورقة التعبئة نفسه — فيُنسخ كتلةً واحدة بلا إعادة ترتيب.
    aoa.push(ds.columns.map((c) => c.labelAr));
    for (const row of guide.example) aoa.push(ds.columns.map((c) => row[c.field] ?? ''));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 90 }, ...ds.columns.slice(2).map(() => ({ wch: 22 }))];
  XLSX.utils.book_append_sheet(wb, ws, (opts.guideSheetName ?? 'تعليمات').slice(0, 31));
  return wb;
}

/** يُنزّل القالب المبنيّ أعلاه (متصفّح فقط — `writeFile` يُطلق التنزيل). */
export function exportTemplateWithGuide(datasetKey, guide, opts = {}) {
  try {
    const wb = buildTemplateWorkbook(datasetKey, guide, opts);
    const fileName = ensureXlsxName(opts.fileName, `Brandzo_template_${datasetKey}`);
    XLSX.writeFile(wb, fileName);
    return fileName;
  } catch (error) {
    console.error('Failed to export Excel template: ', error);
    throw new Error('تعذّر توليد قالب Excel. | Failed to generate the Excel template.');
  }
}
