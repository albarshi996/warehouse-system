/**
 * استيراد شيت الأصناف — من ملف إكسيل إلى الماستر السحابي.
 *
 * هذه هي **الحلقة التي كانت مفقودة**: طبقة إكسيل كانت مبنيّة بالكامل
 * (تحقّق · مرادفات عناوين · تشكيل) ولا يستدعيها أحد، وREADME يعترف:
 * «يتبقّى ربط الاستيراد بكتابات حقيقية». هذا الملف يربطها.
 *
 * المسار: ملف ← قراءة وتحقّق (excelImport) ← **معاينة** ← كتابة دفعية (itemService).
 * لا كتابة إلا بعد أن يرى المدير ماذا سيتغيّر — الاستيراد يمسّ مرجع البوابة كلّها.
 */
import { importSheet } from '../excel/excelImport.js';
import { subscribeItems, upsertItems, normalizeSku, normalizeBarcodes } from '../itemService.js';
import { DATASETS } from '../excel/excelSchema.js';

/** الأدوار التي تملك الاستيراد (قرار المالك 2026-07-15). تطابق firestore.rules. */
export const IMPORT_ROLES = ['admin', 'warehouse_manager'];

export function canImport(role) {
  return IMPORT_ROLES.includes(role);
}

/** يقرأ الأصناف الحالية مرّة واحدة (لبناء المعاينة وضمّ الباركودات). */
function fetchExistingOnce() {
  return new Promise((resolve, reject) => {
    const unsub = subscribeItems(
      (items) => {
        unsub();
        resolve(new Map(items.map((i) => [normalizeSku(i.sku), i])));
      },
      (err) => {
        unsub();
        reject(err);
      },
      { includeArchived: true }
    );
  });
}

/**
 * يحلّل الملف ويبني معاينة كاملة **بلا أي كتابة**.
 *
 * @returns {Promise<{
 *   ok: boolean, rows: object[], errors: object[], summary: object,
 *   plan: { created: object[], updated: object[], unchanged: object[], newBarcodes: number },
 *   existingBySku: Map<string, object>
 * }>}
 */
export async function analyzeItemsFile(file) {
  const result = await importSheet(file, 'items');
  const existingBySku = await fetchExistingOnce();

  const created = [];
  const updated = [];
  const unchanged = [];
  let newBarcodes = 0;

  for (const row of result.rows) {
    const id = normalizeSku(row.sku);
    const prior = existingBySku.get(id);
    if (!prior) {
      created.push(row);
      newBarcodes += (row.barcodes || []).length;
      continue;
    }
    const priorCodes = new Set(normalizeBarcodes(prior.barcodes || []));
    const added = normalizeBarcodes(row.barcodes || []).filter((c) => !priorCodes.has(c));
    newBarcodes += added.length;

    const diff = diffFields(prior, row);
    if (diff.length === 0 && added.length === 0) unchanged.push(row);
    else updated.push({ ...row, _diff: diff, _addedBarcodes: added });
  }

  return { ...result, plan: { created, updated, unchanged, newBarcodes }, existingBySku };
}

/** الحقول التي سيغيّرها الشيت فعلًا على صنف قائم — لعرضها في المعاينة. */
function diffFields(prior, row) {
  const out = [];
  for (const col of DATASETS.items.columns) {
    const f = col.field;
    if (f === 'sku' || f === 'barcode') continue;
    if (row[f] === undefined || row[f] === '') continue;
    const before = prior[f];
    const after = col.type === 'number' ? Number(row[f]) || 0 : String(row[f]).trim();
    const beforeCmp = col.type === 'number' ? Number(before) || 0 : String(before ?? '').trim();
    if (String(beforeCmp) !== String(after)) out.push({ field: f, labelAr: col.labelAr, before: beforeCmp, after });
  }
  return out;
}

/**
 * يكتب المعاينة المعتمدة إلى الماستر.
 * يُستدعى **بعد** `analyzeItemsFile` وبعد موافقة المستخدم على ما سيتغيّر.
 */
export async function commitItemsImport(analysis) {
  if (!analysis?.ok) throw new Error('لا يُستورد ملف فيه أخطاء — صحّح الصفوف المعلَّمة أولًا.');
  const toWrite = [...analysis.plan.created, ...analysis.plan.updated];
  if (toWrite.length === 0) return { created: 0, updated: 0 };
  return upsertItems(toWrite, { existingBySku: analysis.existingBySku });
}
