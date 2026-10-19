/**
 * تقريرُ فينسيا إكسل **منسَّقًا** — ترويسةٌ ملوّنةٌ وحدودٌ وتناوبُ صفوفٍ
 * ومجاميعُ عريضةٌ وتجميدُ الترويسة واتّجاهُ ورقةٍ من اليمين.
 *
 * ═══ ولماذا لا تكفي حزمةُ `xlsx` التي نستوردها؟ ═══
 * نسخةُ المجتمع من SheetJS **تتجاهل `cell.s` بصمت**: يخرج الملفُّ صحيحَ
 * الأرقام عاريَ التنسيق، ولا رسالةَ ولا خطأ. ولذلك يُحمَّل
 * `xlsx-js-style.bundle.js` المستضافُ ذاتيًّا — بنفس نمط `retail-hub` —
 * **وبنفس احتياطيّه**: إن تعذّر، يعود إلى `xlsx.full.min.js` فيخرج التقريرُ
 * بأرقامه الصحيحة بلا ألوان. فملفٌّ بلا تنسيق أفضلُ من زرٍّ لا يفعل شيئًا.
 *
 * ولا CDN: كلتاهما في `public/lib` (قاعدةُ الأوفلاين ١٠٠٪).
 *
 * ═══ ولا رقمَ يُحسب هنا ═══
 * الجسدُ كلُّه من `buildVeneciaReport` المختبَر — وهذا الملفُّ يُلبسه ثوبًا.
 */
import { NUMERIC_COLUMNS } from './veneciaReport.js';

/** ألوانُ الهويّة — عنابيُّ أودو للترويسة، ورماديٌّ فاتحٌ للتناوب. */
const INK = '1F2430';
const HEADER_BG = '714B67';
const ZEBRA_BG = 'F4F5F7';
const BORDER = { style: 'thin', color: { rgb: 'D9DCE1' } };
const BOX = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

/** يُحمّل مكتبةَ التنسيق المستضافةَ ذاتيًّا، ويعود إلى القياسيّة إن تعذّرت. */
export function loadSheetLib(baseUrl) {
  if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
  const lib = `${String(baseUrl || '').replace(/\/$/, '')}/lib`;
  const inject = (src) =>
    new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve(window.XLSX);
      el.onerror = () => reject(new Error(src));
      document.head.appendChild(el);
    });
  return inject(`${lib}/xlsx-js-style.bundle.js`).catch(() => inject(`${lib}/xlsx.full.min.js`));
}

const baseStyle = (extra = {}) => ({
  font: { name: 'Arial', sz: 10, color: { rgb: INK } },
  alignment: { vertical: 'center', horizontal: 'right', wrapText: false },
  border: BOX,
  ...extra,
});

/** يُنسّق ورقةً كاملة: ترويسةٌ وتناوبٌ ومجاميعُ وتجميدٌ وعرضُ أعمدة. */
function dressSheet(XLSX, ws, { columns, rowCount, numeric = [], hasTotals = false }) {
  if (!ws['!ref']) return;
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ RTL: true });
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: ws['!ref'] };

  const range = XLSX.utils.decode_range(ws['!ref']);
  const numericIdx = new Set(columns.map((c, i) => (numeric.includes(c) ? i : -1)).filter((i) => i >= 0));

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      const isHeader = r === 0;
      const isTotals = hasTotals && r === range.e.r;
      cell.s = baseStyle();
      if (numericIdx.has(c)) {
        cell.s.alignment = { ...cell.s.alignment, horizontal: 'center' };
        if (!isHeader && typeof cell.v === 'number') cell.z = '#,##0';
      }
      if (isHeader) {
        cell.s.font = { ...cell.s.font, bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: HEADER_BG } };
        cell.s.alignment = { ...cell.s.alignment, horizontal: 'center', wrapText: true };
      } else if (isTotals) {
        cell.s.font = { ...cell.s.font, bold: true };
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'EDEFF2' } };
      } else if (r % 2 === 0) {
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: ZEBRA_BG } };
      }
    }
  }

  // عرضُ العمود من أطول محتواه — بحدٍّ أعلى كي لا يتمدّد عمودُ الملاحظات.
  ws['!cols'] = columns.map((h) => ({ wch: Math.min(Math.max(String(h).length + 4, 12), 40) }));
  ws['!rows'] = [{ hpt: 22 }, ...Array.from({ length: rowCount }, () => ({ hpt: 17 }))];
}

/** ورقةُ الملخّص: تسمية · قيمة · ملاحظة. */
function summarySheet(XLSX, report) {
  const head = ['البند', 'القيمة', 'ملاحظة'];
  const meta = [
    ['التقرير', report.title, ''],
    ['النطاق', report.scope, ''],
    ['بتاريخ', report.asOf || '—', ''],
    ...report.filters.map((f) => ['تصفية', f.label, f.value]),
    ['', '', ''],
  ];
  const body = report.summary.map((s) => [s.label, s.value, s.note]);
  const bySection = [
    ['', '', ''],
    ['الحالات', 'العدد', ''],
    ...report.byCondition.map((c) => [c.label, c.value, '']),
    ['', '', ''],
    ['التصنيفات', 'الأصول', 'الوحدات'],
    ...report.byCategory.map((c) => [c.label, c.value, c.note]),
  ];
  const aoa = [head, ...meta, ...body, ...bySection];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  dressSheet(XLSX, ws, { columns: head, rowCount: aoa.length - 1, numeric: ['القيمة'] });
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 26 }];
  return ws;
}

/** ورقةُ جدولٍ من الموديل: عناوينُ ثمّ صفوفٌ ثمّ سطرُ مجاميع. */
function tableSheet(XLSX, { name, columns, rows, totals }) {
  const body = rows.map((r) => columns.map((c) => (r[c] === undefined ? '' : r[c])));
  const totalsRow = totals
    ? columns.map((c, i) => (i === 0 ? `المجموع (${rows.length})` : totals[c] === undefined ? '' : totals[c]))
    : null;
  const aoa = [columns, ...body, ...(totalsRow ? [totalsRow] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  dressSheet(XLSX, ws, {
    columns,
    rowCount: aoa.length - 1,
    numeric: NUMERIC_COLUMNS[name] || [],
    hasTotals: Boolean(totalsRow),
  });
  return ws;
}

/**
 * يبني مصنَّفَ التقرير المنسَّق (في الذاكرة) من موديلٍ جاهز.
 * مفصولٌ عن التنزيل ليُختبر ذهابًا وإيابًا.
 */
export function buildReportWorkbook(XLSX, report) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet(XLSX, report), 'الملخّص');
  XLSX.utils.book_append_sheet(wb, tableSheet(XLSX, report.assetsSheet), report.assetsSheet.name.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, tableSheet(XLSX, report.cardsSheet), report.cardsSheet.name.slice(0, 31));
  return wb;
}

/** اسمُ ملفٍّ نظيفٌ بامتدادٍ واحد. */
export function reportFileName(name) {
  const base = String(name ?? '').trim() || 'تقرير-مخزن-فينسيا';
  const clean = base.replace(/[\\/:*?"<>|]/g, '').trim();
  return clean.toLowerCase().endsWith('.xlsx') ? clean : `${clean}.xlsx`;
}

/**
 * يُنزّل التقريرَ المنسَّق. تُستدعى من معالِج زرٍّ في الشاشة.
 * @returns {Promise<string>} اسمُ الملفّ المُنزَّل
 */
export async function exportVeneciaReportExcel(report, { baseUrl = '/', fileName = '' } = {}) {
  const XLSX = await loadSheetLib(baseUrl);
  if (!XLSX) throw new Error('تعذّر تحميلُ مكتبة إكسل المستضافة.');
  const wb = buildReportWorkbook(XLSX, report);
  const name = reportFileName(fileName);
  XLSX.writeFile(wb, name);
  return name;
}
