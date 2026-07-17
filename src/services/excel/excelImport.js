import * as XLSX from 'xlsx';
import {
  DATASETS,
  buildHeaderIndex,
  toNumber,
  detectHeaderRow,
  resolveHeaderCell,
  splitMulti,
  normalizeBarcode,
} from './excelSchema.js';

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

  // الورقة المطلوبة إن وُجدت، وإلا **أول ورقة** لا رمي خطأ — فملفٌّ برقة واحدة
  // باسم مختلف (شيت جرد يدوي) يُستورد بدل أن يُرفض لعدم تطابق اسم الورقة.
  const requested = opts.sheetName;
  const sheetName = requested && workbook.Sheets[requested] ? requested : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('الملف لا يحوي أي ورقة عمل. | The file has no worksheet.');
  }

  // Read as arrays-of-arrays so we control header resolution ourselves.
  // `raw: false` keeps long barcodes as text — otherwise SheetJS hands us
  // 8059692040599 as a float and it prints as 8.05969e+12.
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });
  const errors = [];

  if (matrix.length < 2) {
    return {
      ok: false,
      dataset: datasetKey,
      rows: [],
      errors: [{ row: 1, column: '-', message: 'الملف لا يحتوي على صف عناوين وبيانات. | File has no header + data rows.' }],
      summary: { total: 0, valid: 0, invalid: 0, missingColumns: ds.columns.filter((c) => c.required).map((c) => c.field), headerRow: 1, sheetName },
    };
  }

  // ── Resolve headers ──────────────────────────────────────────────────────
  // العناوين ليست بالضرورة في الصف الأول — نُرجّحها بفحص أول 10 صفوف.
  const detected = detectHeaderRow(matrix, datasetKey, opts.maxHeaderScan ?? 10);
  const headerRowIdx = detected.hits > 0 ? detected.index : 0;
  const headerRow = matrix[headerRowIdx];
  const headerIndex = buildHeaderIndex(datasetKey);
  /** column position -> ColumnDef */
  const posToCol = new Map();
  const seenFields = new Set();
  headerRow.forEach((cell, pos) => {
    const col = resolveHeaderCell(cell, headerIndex);
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
  /** sku -> موضعه في `rows` — لدمج الصفوف التي تحمل نفس الصنف. */
  const skuAt = new Map();
  let invalid = 0;
  let merged = 0;

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const rawRow = matrix[i];
    const rowNum = i + 1; // 1-based spreadsheet row number
    const shaped = {};
    let rowHasError = false;

    for (const [pos, col] of posToCol.entries()) {
      const raw = rawRow[pos];

      if (col.multi) {
        shaped[col.field] = splitMulti(raw);
        continue;
      }

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
    const isBlank = Object.values(shaped).every(
      (v) => v === '' || v === 0 || v == null || (Array.isArray(v) && v.length === 0)
    );
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

      // عمودا «Bar Code» و«Bar Code - Code» باركودان لنفس الصنف — يُضمّان.
      shaped.barcodes = [...new Set([...(shaped.barcode || []), ...(shaped.barcodeAlt || [])])];
      delete shaped.barcode;
      delete shaped.barcodeAlt;

      // الهوية العملية اليوم هي الباركود («حاوية الكود» تُملأ من أودو لاحقًا)،
      // فصفٌّ بلا كود **وبلا باركود** لا سبيل إلى التعرّف عليه أبدًا.
      if (!sku && shaped.barcodes.length === 0) {
        errors.push({
          row: rowNum,
          column: 'barcode',
          message: `الصفّ بلا كود صنف وبلا باركود — لا سبيل للتعرّف على هذا الصنف. | Row has neither code nor barcode.`,
        });
        rowHasError = true;
      }

      // مفتاح الدمج: الكود إن وُجد، وإلا **أول باركود** — لأن «حاوية الكود»
      // تبقى فارغة حتى ربط أودو، فالدمج بالكود وحده كان سيدمج كل الصفوف
      // الفارغة الكود في صنف واحد. (اسم الصنف لا يصلح مفتاحًا: يتغيّر ويتكرّر.)
      const mergeKey = sku || shaped.barcodes[0] || '';

      // تكرار المفتاح **ليس خطأً** — الصنف الواحد قد يحمل عدّة باركودات، وهكذا
      // تبدو الشيتات الحقيقية: صفّ لكل باركود. ندمج الباركودات ونُبقي بيانات
      // أول صفّ. (قرار المالك 2026-07-15: نعم، الباركود قد يتعدّد.)
      if (mergeKey && !rowHasError && skuAt.has(mergeKey)) {
        const target = rows[skuAt.get(mergeKey)];
        const before = target.barcodes.length;
        for (const code of shaped.barcodes) {
          if (!target.barcodes.includes(code)) target.barcodes.push(code);
        }
        if (target.barcodes.length > before) merged++;
        // اختلاف الاسم بين صفّين لنفس الكود مؤشّر خطأ في الشيت — نُنبّه ولا نمنع.
        if (shaped.nameAr && target.nameAr && shaped.nameAr !== target.nameAr) {
          errors.push({
            row: rowNum,
            column: 'nameAr',
            severity: 'warning',
            message: `الكود «${sku}» يحمل اسمين مختلفين («${target.nameAr}» و«${shaped.nameAr}») — اعتُمد الأول. | Same SKU, different names.`,
          });
        }
        continue; // دُمج — لا يُضاف صفًّا مستقلًّا
      }
      if (mergeKey && !rowHasError) skuAt.set(mergeKey, rows.length);
    } else if (datasetKey === 'balances') {
      // الهوية: باركود أو كود — أحدهما يكفي، وغيابهما معًا يجعل الرصيد بلا صاحب.
      shaped.barcode = normalizeBarcode(shaped.barcode);
      shaped.sku = String(shaped.sku ?? '').trim().toUpperCase();
      if (!shaped.barcode && !shaped.sku) {
        errors.push({
          row: rowNum,
          column: 'barcode',
          message: 'رصيد بلا باركود وبلا كود — لا يُعرف صاحبه. | Balance row has no item identity.',
        });
        rowHasError = true;
      }
      // ملاحظة: **لا نشترط qty > 0** هنا خلافًا للسجلّات — رصيد الصفر رقم
      // مشروع ومهمّ (يعني «الصنف نفد من هذا المخزن»)، وحذفه يُبقي رصيدًا
      // قديمًا كاذبًا في النظام.
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

  // التنبيهات لا تُبطل الاستيراد — الأخطاء وحدها تفعل.
  const blocking = errors.filter((e) => e.severity !== 'warning');

  return {
    ok: blocking.length === 0,
    dataset: datasetKey,
    rows,
    errors,
    summary: {
      total: rows.length + invalid,
      valid: rows.length,
      invalid,
      merged,
      missingColumns,
      headerRow: headerRowIdx + 1,
      sheetName,
      detectedColumns: [...seenFields],
    },
  };
}
