/**
 * توليد بذرة جرد المركبات من ملفات الإكسل المؤرشفة.
 *
 * يقرأ كل ملفات `.xlsx` في مجلد المصدر (ملف لكل مركبة، مُصدَّر من أداة
 * `vehicle-inspection-brandzo.html` القديمة)، يفكّها بنفس محلّل النظام
 * (`inspectionExcel.js`) — فما ينجح هنا ينجح في زر الاستيراد بالمتصفح —
 * ثم يكتب `src/data/vehicles-seed.json` الذي يرفعه زر «رفع البيانات
 * الحالية» في صفحة جرد المركبات دفعةً واحدة.
 *
 * الاستعمال:
 *   node scripts/generate-vehicles-seed.mjs "<مسار مجلد ملفات الجرد>"
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import { sheetsToInspection, workbookToSheets } from '../src/services/vehicles/inspectionExcel.js';
import { vehicleIdFor, summarize } from '../src/services/vehicles/inspectionModel.js';

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('المطلوب: مسار مجلد ملفات جرد المركبات');
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(repoRoot, 'src', 'data', 'vehicles-seed.json');

const files = readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith('.xlsx'));
const records = [];
const problems = [];

for (const file of files.sort()) {
  const wb = XLSX.read(readFileSync(join(sourceDir, file)), { type: 'buffer' });
  const sheets = workbookToSheets(wb, (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }));
  if (!sheets.info) {
    problems.push(`${file}: بلا ورقة «البيانات الأساسية» — تُرك`);
    continue;
  }
  const inspection = sheetsToInspection(sheets);
  let vehicleId = vehicleIdFor(inspection);
  if (!vehicleId) {
    vehicleId = `veh-${basename(file, '.xlsx').trim().replace(/\s+/g, '-')}`;
    problems.push(`${file}: بلا لوحة/هيكل — المعرّف من اسم الملف: ${vehicleId}`);
  }
  const dup = records.find((r) => r.vehicleId === vehicleId);
  if (dup) problems.push(`${file}: معرّف مكرّر مع ${dup.file} (${vehicleId}) — سيُدمجان في مستند واحد`);
  const s = summarize(inspection);
  records.push({ file, vehicleId, summary: s, inspection });
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ source: 'أرشيف جرد المركبات (إكسل)', count: records.length, records }, null, 1),
  'utf8'
);

console.info(`✅ ${records.length} مركبة → ${outPath}`);
for (const r of records) {
  console.info(
    `  ${r.vehicleId} | ${r.inspection.info.brand || '؟'} ${r.inspection.info.model || ''} | ${r.inspection.info.receivedFrom || '—'} | ${r.inspection.overallStatus || 'بلا حكم'} | بنود: ${r.summary.done}/${r.summary.total}`
  );
}
if (problems.length) {
  console.info('\n⚠️ ملاحظات:');
  problems.forEach((p) => console.info('  - ' + p));
}
