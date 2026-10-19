/**
 * تصديرُ جرد فينسيا إلى `.xlsx`.
 *
 * ═══ ومقسومٌ قسمين عن قصد ═══
 * `buildVeneciaWorkbook` يبني المصنَّفَ **في الذاكرة** ولا يلمس شيئًا، فهو
 * يُختبر ذهابًا وإيابًا: نُصدّر ثمّ نقرأ ما صدّرناه ونطابقه. و
 * `exportVeneciaAssets` سطرُ التنزيل وحدَه (`XLSX.writeFile` يلمس المتصفّح).
 *
 * والعلّةُ ليست أناقةً: تصديرٌ يُسقط عمودًا **لا يشتكي** — يخرج الملفُّ
 * ويبدو سليمًا ويُرسل، ولا يُكشف إلّا حين يُعاد استيرادُه فيمحو ما أسقطه
 * (وهي بيّنةُ `itemsExportRows` نفسُها: عمودان فارغان يمحوان الباركودات).
 *
 * وXLSX من الحزمة المحلّيّة يبنيها Astro في الحِزمة — لا CDN ولا سكربتٌ
 * عالميّ، فالبوّابةُ تعمل بلا إنترنت.
 */
import * as XLSX from 'xlsx';
import { VENECIA_EXPORT_COLUMNS, veneciaExportRows } from './veneciaModel.js';

/** اسمُ ملفٍّ نظيفٌ بامتدادٍ واحد. */
export function veneciaFileName(name) {
  const base = String(name ?? '').trim() || 'جرد-مخزن-فينسيا';
  const clean = base.replace(/[\\/:*?"<>|]/g, '').trim();
  return clean.toLowerCase().endsWith('.xlsx') ? clean : `${clean}.xlsx`;
}

/** اسمُ ورقةٍ صالح — وExcel يحدّه بواحدٍ وثلاثين محرفًا. */
export function veneciaSheetName(name) {
  return (String(name ?? '').trim() || 'مخزن فينسيا').slice(0, 31);
}

/**
 * يبني مصنَّفَ التصدير في الذاكرة — بورقةٍ واحدةٍ وعشرين عمودًا بترتيب
 * `VENECIA_EXPORT_COLUMNS`، وبصفٍّ لكلّ أصلٍ مُمرَّر.
 *
 * @param {object[]} assets الأصول كما هي في الشاشة (مُصفّاةً أو كلَّها)
 * @param {{ sheetName?: string }} [opts]
 */
export function buildVeneciaWorkbook(assets, opts = {}) {
  const rows = veneciaExportRows(assets);
  const ws = XLSX.utils.json_to_sheet(rows, { header: VENECIA_EXPORT_COLUMNS });
  ws['!cols'] = VENECIA_EXPORT_COLUMNS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, veneciaSheetName(opts.sheetName));
  return wb;
}

/**
 * يُنزّل الجردَ ملفَّ إكسل. تُستدعى من معالِج زرٍّ في الشاشة (تلمس المتصفّح).
 * @returns {string} اسمُ الملفّ المُنزَّل
 */
export function exportVeneciaAssets(assets, opts = {}) {
  const name = veneciaFileName(opts.fileName);
  XLSX.writeFile(buildVeneciaWorkbook(assets, opts), name);
  return name;
}
