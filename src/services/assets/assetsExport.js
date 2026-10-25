/**
 * تصديرُ جرد الأصول وطباعتُه — **منطقٌ خالصٌ بلا XLSX ولا DOM**.
 *
 * كان هذا كلُّه داخل وسم `script` في `/dashboard/assets-inventory`، أي خارج
 * نطاق `npm test` بالبناء لا بالإهمال. وأخطرُ ما فيه **ترتيبُ الأعمدة**:
 * عمودٌ يزيح عمودًا لا يُسقط شيئًا ولا يشتكي — يُصدَّر ملفٌّ سليمٌ في الظاهر
 * فيه «الماركة» في خانة «السيريال»، ويُستورَد بعد شهرٍ فيُقرأ الجردُ كلُّه
 * خطأً. فيُختبر هنا صفًّا صفًّا.
 *
 * ★★★ **والمصدرُ واحدٌ للمخرجَين**: `assetWorkbookModel` تبني أوراقَ الإكسل
 * و`assetPrintModel` تبني أرقامَ الطباعة، وكلتاهما تعدّان بالدالّة نفسِها
 * (`countBy` · `totalQty`). ولو عدَّ كلُّ مخرجٍ بنفسه لَافترقا — **وذلك لا
 * يشتكي**: يخرج الملفّان سليمَين في الظاهر ويُرسَلان، ولا يُكشف الفرقُ إلّا
 * حين يقارنهما أحد. (وهو درسُ ‹VEN-301› نفسُه.)
 *
 * والأوراقُ **مصفوفاتُ مصفوفات** (`aoa`) — ما يأخذه `XLSX.utils.aoa_to_sheet`
 * حرفيًّا، فتُختبر بلا مكتبةٍ ولا ملفّ.
 */
import { ASSET_CONDITIONS, GOOD_CONDITIONS, BAD_CONDITIONS, assetQuantity } from './assetsModel.js';

/** ترويسةُ الورقة الجامعة — ثلاثةَ عشرَ عمودًا بعمود «الإدارة». */
export const EXPORT_HEADERS_MAIN = [
  'رقم الأصل', 'نوع الأصل', 'اسم الأصل', 'الماركة', 'الموديل/السيريال', 'الكمية',
  'الحالة', 'المسؤول', 'الإدارة', 'القسم', 'الموقع', 'تاريخ الاستلام', 'ملاحظات',
];

/** ترويسةُ ورقة الإدارة — اثنا عشرَ عمودًا بلا «الإدارة» (الورقةُ هي الإدارة). */
export const EXPORT_HEADERS_DEPT = [
  'رقم الأصل', 'نوع الأصل', 'اسم الأصل', 'الماركة', 'السيريال', 'الكمية',
  'الحالة', 'المسؤول', 'القسم', 'الموقع', 'تاريخ الاستلام', 'ملاحظات',
];

/** عرضُ أعمدة الورقة الجامعة — بترتيب `EXPORT_HEADERS_MAIN` نفسِه. */
export const EXPORT_WIDTHS_MAIN = [14, 16, 22, 16, 22, 8, 14, 20, 16, 16, 18, 16, 24];

/** مجموعُ الكمّيّات — والناقصُ يقع على واحدٍ لا على صفرٍ يُخفي أصلًا. */
export const totalQty = (assets) =>
  (assets ?? []).reduce((sum, a) => sum + assetQuantity(a?.qty), 0);

/** عددُ الأصول بحسب حقلٍ ما — والفارغُ لا يُعدّ (إدارةٌ بلا اسمٍ ليست إدارة). */
export function countBy(assets, field) {
  const out = new Map();
  for (const a of assets ?? []) {
    const key = String(a?.[field] ?? '').trim();
    if (key) out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * عددُ كلِّ حالةٍ معتمدة — **وكلُّ الحالات تظهر ولو بصفر**.
 * فحالةٌ تغيب عن الملخّص تُقرأ «لم تُقَس» لا «صفر».
 */
export function conditionCounts(assets) {
  const seen = countBy(assets, 'condition');
  return ASSET_CONDITIONS.map((c) => [c, seen.get(c) ?? 0]);
}

/** صفُّ الورقة الجامعة لأصلٍ واحد — بترتيب `EXPORT_HEADERS_MAIN`. */
export const mainRow = (a) => [
  a.id, a.assetType, a.assetName, a.brand, a.serial, a.qty,
  a.condition, a.responsible, a.department, a.section, a.location, a.receivedDate, a.notes,
];

/** صفُّ ورقة الإدارة — بترتيب `EXPORT_HEADERS_DEPT` (بلا «الإدارة»). */
export const deptRow = (a) => [
  a.id, a.assetType, a.assetName, a.brand, a.serial, a.qty,
  a.condition, a.responsible, a.section, a.location, a.receivedDate, a.notes,
];

/**
 * أوراقُ المصنَّف كلُّها: ملخّصٌ ثمّ جامعةٌ ثمّ ورقةٌ لكلّ إدارة.
 *
 * و`sheetName` يُقصّ إلى واحدٍ وثلاثين حرفًا — **حدُّ إكسل نفسِه**، واسمٌ
 * أطولُ يُسقط الكتابةَ كلَّها لا الورقةَ وحدَها.
 *
 * @param {object[]} assets الأصولُ المعروضة
 * @param {{ exportedOn?: string }} [opts] تاريخُ التصدير كما يُعرَض
 */
export function assetWorkbookModel(assets, { exportedOn = '' } = {}) {
  const list = assets ?? [];
  const summary = [
    ['شركة BHOME — ملخص جرد الأصول'],
    ['تاريخ التصدير:', exportedOn],
    [],
    ['إجمالي الأصول', list.length],
    ['إجمالي الكميات', totalQty(list)],
    [],
    ['الحالة', 'العدد'],
    ...conditionCounts(list),
    [],
    ['الإدارة', 'العدد'],
    ...[...countBy(list, 'department').entries()],
  ];

  const departments = [...countBy(list, 'department').keys()];

  return {
    summary: { name: 'ملخص إحصائي', rows: summary, widths: [30, 16] },
    main: {
      name: 'جرد الأصول',
      rows: [EXPORT_HEADERS_MAIN, ...list.map(mainRow)],
      widths: EXPORT_WIDTHS_MAIN,
    },
    departments: departments.map((dept) => ({
      name: dept.slice(0, 31),
      rows: [EXPORT_HEADERS_DEPT, ...list.filter((a) => a.department === dept).map(deptRow)],
      widths: EXPORT_HEADERS_DEPT.map(() => 18),
    })),
  };
}

/** اسمُ ملفّ التصدير — واليومُ محلّيٌّ لا UTC (ليبيا على +2). */
export function exportFileName(day) {
  return `BHOME_Inventory_${day}.xlsx`;
}

/**
 * أرقامُ ورقة الطباعة وصفوفُها — **من دوالّ العدّ نفسِها** التي تبني الإكسل.
 *
 * و«يحتاج صيانة / معطل» بندٌ واحدٌ في الورقة، فيُجمع من `BAD_CONDITIONS`
 * لا بسردِ الحالتين يدويًّا: حالةٌ سيّئةٌ تُضاف غدًا تدخل العدَّ وحدَها.
 */
export function assetPrintModel(assets) {
  const list = assets ?? [];
  const byCondition = countBy(list, 'condition');
  const sumOf = (names) => names.reduce((n, c) => n + (byCondition.get(c) ?? 0), 0);
  return {
    total: list.length,
    quantity: totalQty(list),
    excellent: byCondition.get('ممتاز') ?? 0,
    good: byCondition.get('جيد') ?? 0,
    bad: sumOf(BAD_CONDITIONS),
    healthy: sumOf(GOOD_CONDITIONS),
    rows: list,
  };
}
