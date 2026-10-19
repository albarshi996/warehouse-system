/**
 * تقريرُ **أصول إدارة المستودعات وعهدِها** — موديلٌ خالصٌ واحد.
 *
 * ═══ ★★★ ولا بانيَ إكسلٍ ثانيًا ═══
 * `buildReportWorkbook` في `veneciaReportExcel` عامٌّ: يأخذ موديلًا فيه
 * ملخّصٌ وورقتان ويُلبسه تنسيقًا (ترويسةٌ ملوّنةٌ وحدودٌ وتناوبٌ وتجميدٌ
 * ومجاميعُ). فهذا الملفّ يُنتج **ذلك الشكلَ نفسَه** ببياناتٍ أخرى — ولا
 * يُكتب مُنسّقٌ ثانٍ ينحرف عن الأوّل عند أوّل إصلاح.
 *
 * ═══ وورقتان تجيبان السؤالين ═══
 *   «الأصول» — ما تملكه الإدارة، ومعه **نوعُ المعدّة وتفاصيلُها ومن يحمله**.
 *   «العُهد»  — سنداتُ العهدة، ومعها **أمربوطةٌ برقم أصلٍ أم لا**.
 */
import {
  custodyAssetNo,
  custodyIndex,
  describeSpecs,
  equipmentLabel,
  holderOf,
  isOpenCustody,
  linkReport,
  splitByDepartment,
  whSnapshot,
  WH_DEPARTMENT_LABEL,
  WH_DEPARTMENT_VALUES,
} from './whDepartment.js';

/** أعمدةُ ورقة الأصول. */
export const WH_ASSET_COLUMNS = Object.freeze([
  'رقم الأصل',
  'اسم الأصل',
  'نوع المعدّة',
  'التفاصيل',
  'الماركة',
  'السيريال',
  'الكمية',
  'الحالة',
  'الموقع',
  'بيد',
  'سند العهدة',
  'مكهَّن',
  'ملاحظات',
]);

/** أعمدةُ ورقة العُهد. */
export const WH_CUSTODY_COLUMNS = Object.freeze([
  'رقم السند',
  'الموظّف',
  'الوظيفة',
  'نوع العهدة',
  'الوصف',
  'رقم الأصل',
  'مربوطة',
  'الحالة',
  'تاريخ التسليم',
  'القيمة',
]);

const NUMERIC_ASSETS = ['الكمية'];
const NUMERIC_CUSTODY = ['القيمة'];

/** صفوفُ ورقة الأصول — ومعها حاملُها من فهرس العهد. */
export function whAssetRows(assets, index) {
  return (assets ?? []).map((a) => {
    const h = holderOf(a, index);
    return {
      'رقم الأصل': a.id ?? '',
      'اسم الأصل': a.assetName ?? '',
      'نوع المعدّة': a.equipmentKind ? equipmentLabel(a.equipmentKind) : '',
      التفاصيل: describeSpecs(a.equipmentKind, a.specs),
      الماركة: a.brand ?? '',
      السيريال: a.serial ?? '',
      الكمية: Number(a.qty) || 0,
      الحالة: a.condition ?? '',
      الموقع: a.location ?? '',
      بيد: h ? h.employeeName : '',
      'سند العهدة': h ? h.custody.number ?? '' : '',
      'مكهَّن': a.archived ? 'نعم' : '',
      ملاحظات: a.notes ?? '',
    };
  });
}

/** صفوفُ ورقة العُهد — و«مربوطة» تقول صراحةً ما يُعرف أصلُه ممّا لا يُعرف. */
export function whCustodyRows(custodies) {
  return (custodies ?? []).map((c) => ({
    'رقم السند': c.number ?? '',
    الموظّف: c.employeeName ?? '',
    الوظيفة: c.employeeRole ?? '',
    'نوع العهدة': c.itemKind ?? '',
    الوصف: c.itemDesc ?? '',
    'رقم الأصل': custodyAssetNo(c),
    مربوطة: custodyAssetNo(c) ? 'نعم' : 'لا',
    الحالة: isOpenCustody(c) ? 'مفتوحة' : String(c.state ?? ''),
    'تاريخ التسليم': c.issueDate ?? '',
    القيمة: Number(c.value) || 0,
  }));
}

const kv = (label, value, note = '') => ({ label, value, note });

/**
 * يبني التقريرَ كاملًا بشكل `buildReportWorkbook`.
 *
 * @param {object[]} allAssets سجلُّ الأصول كاملًا (يُحصَر هنا بالإدارة)
 * @param {object[]} custodies سنداتُ العهد
 * @param {{ asOf?: string, values?: string[], scope?: string, filters?: Array }} [opts]
 *        `asOf` يُمرَّر ولا يُقرأ من الساعة — فالتقريرُ يُختبر.
 */
export function buildWhReport(allAssets, custodies, { asOf = '', values = WH_DEPARTMENT_VALUES, scope = '', filters = [] } = {}) {
  const split = splitByDepartment(allAssets, values);
  const live = split.inside.filter((a) => !a.archived);
  const index = custodyIndex(custodies);
  const snap = whSnapshot(allAssets, custodies, values);
  const link = linkReport(live, custodies);

  // عهدُ هذه الإدارة: ما رُبط بأصلٍ فيها، وما كان مفتوحًا بلا رقم.
  const known = new Set(live.map((a) => String(a.id ?? '').trim()));
  const mine = (custodies ?? []).filter(
    (c) => known.has(custodyAssetNo(c)) || (!custodyAssetNo(c) && isOpenCustody(c))
  );

  const summary = [
    kv('أصولُ الإدارة', snap.assets, `${snap.archived} مكهَّن`),
    kv('بيد موظّفين', snap.held, 'عهدةٌ مفتوحةٌ بالرقم'),
    kv('حرٌّ بلا حامل', snap.free, 'في عهدة الإدارة'),
    kv('عهدٌ بلا رقمِ أصل', snap.unlinkedCustodies, 'لا يُعرف أيَّ جهازٍ تخصّ'),
    kv('عهدٌ ترقِّم مجهولًا', snap.dangling, 'رقمٌ لا وجودَ له في الجرد'),
    kv('أصولٌ بإدارةٍ مشابهة', snap.nearMiss, 'لم تُطابق فسقطت من المنظار'),
  ];

  const assetRows = whAssetRows(live, index);
  const custodyRows = whCustodyRows(mine);

  return {
    title: `تقرير أصول ${WH_DEPARTMENT_LABEL} وعهدِها`,
    scope: scope || 'أصولُ الإدارة كاملةً',
    asOf,
    filters,
    summary,
    // توزيعُ الأنواع يحلّ محلَّ «الحالات» و«التصنيفات» في الشكل العامّ.
    byCondition: snap.byKind.map(([k, n]) => ({ label: equipmentLabel(k), value: n })),
    byCategory: [
      { label: 'بيد موظّفين', value: snap.held, note: '' },
      { label: 'حرّ', value: snap.free, note: '' },
      { label: 'مكهَّن', value: snap.archived, note: '' },
    ],
    assetsSheet: {
      name: 'الأصول',
      columns: WH_ASSET_COLUMNS,
      rows: assetRows,
      numeric: NUMERIC_ASSETS,
      totals: { الكمية: assetRows.reduce((s, r) => s + r['الكمية'], 0) },
    },
    cardsSheet: {
      name: 'العُهد',
      columns: WH_CUSTODY_COLUMNS,
      rows: custodyRows,
      numeric: NUMERIC_CUSTODY,
      totals: { القيمة: custodyRows.reduce((s, r) => s + r['القيمة'], 0) },
    },
    /** يُعرض في الشاشة لا في الملفّ: الأرقامُ المعلَّقةُ بأعيانها. */
    dangling: link.danglingAssetNos,
  };
}
