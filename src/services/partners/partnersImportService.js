/**
 * استيراد شيت شركاء الأعمال (موردون/عملاء) — من إكسيل إلى الماستر السحابي.
 * توأم `itemsImportService.js`: يقرأ ويتحقّق (excelImport) ← **يبني معاينة**
 * (جديد/محدَّث/بلا تغيير/بلا رمز) ← يكتب دفعيًّا بعد موافقة المدير.
 *
 * لا كتابة إلا بعد أن يرى المدير ماذا سيتغيّر — الاستيراد يمسّ مرجع الشركاء.
 */
import { importSheet } from '../excel/excelImport.js';
import { subscribePartners, upsertPartners, normalizePartnerCode } from './partnerService.js';
import { DATASETS } from '../excel/excelSchema.js';

/** الأدوار التي تملك الاستيراد — تطابق firestore.rules (isManager). */
export const IMPORT_ROLES = ['admin', 'warehouse_manager'];
export const canImport = (role) => IMPORT_ROLES.includes(role);

/** مفتاح مجموعة البيانات في excelSchema لكل نوع شريك. */
const DATASET_OF = { supplier: 'suppliers', customer: 'customers' };

/** يقرأ شركاء النوع الحاليين مرّة واحدة (لبناء المعاينة). */
function fetchExistingOnce(kind) {
  return new Promise((resolve, reject) => {
    const unsub = subscribePartners(
      kind,
      (rows) => {
        unsub();
        resolve(new Map(rows.map((r) => [normalizePartnerCode(r.code), r])));
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
 * @param {'supplier'|'customer'} kind
 * @param {File} file
 */
export async function analyzePartnersFile(kind, file) {
  const dataset = DATASET_OF[kind];
  if (!dataset) throw new Error(`نوع شريك غير معروف: «${kind}»`);
  const result = await importSheet(file, dataset);
  const existingByCode = await fetchExistingOnce(kind);

  const created = [];
  const updated = [];
  const unchanged = [];
  // صفوف بلا رمز: لا يمكن كتابتها (الرمز معرّف المستند) — تُفرز وتُعرض صراحةً.
  const skipped = [];

  for (const row of result.rows) {
    const id = normalizePartnerCode(row.code);
    if (!id) {
      skipped.push(row);
      continue;
    }
    const prior = existingByCode.get(id);
    if (!prior) {
      created.push(row);
      continue;
    }
    const diff = diffFields(dataset, prior, row);
    if (diff.length === 0) unchanged.push(row);
    else updated.push({ ...row, _diff: diff });
  }

  return { ...result, plan: { created, updated, unchanged, skipped }, existingByCode };
}

/** الحقول التي سيغيّرها الشيت فعلًا على شريكٍ قائم — لعرضها في المعاينة. */
function diffFields(dataset, prior, row) {
  const out = [];
  for (const col of DATASETS[dataset].columns) {
    const f = col.field;
    if (f === 'code') continue;
    if (row[f] === undefined || row[f] === '') continue;
    const after = col.type === 'number' ? Number(row[f]) || 0 : String(row[f]).trim();
    const before = col.type === 'number' ? Number(prior[f]) || 0 : String(prior[f] ?? '').trim();
    if (String(before) !== String(after)) out.push({ field: f, labelAr: col.labelAr, before, after });
  }
  return out;
}

/**
 * يكتب المعاينة المعتمدة إلى الماستر.
 * يُستدعى **بعد** `analyzePartnersFile` وموافقة المستخدم على ما سيتغيّر.
 * @param {'supplier'|'customer'} kind
 */
export async function commitPartnersImport(kind, analysis) {
  if (!analysis?.ok) throw new Error('لا يُستورد ملف فيه أخطاء — صحّح الصفوف المعلَّمة أولًا.');
  const toWrite = [...analysis.plan.created, ...analysis.plan.updated];
  if (toWrite.length === 0) return { created: 0, updated: 0, skipped: analysis.plan.skipped.length };
  return upsertPartners(kind, toWrite, { existingByCode: analysis.existingByCode });
}
