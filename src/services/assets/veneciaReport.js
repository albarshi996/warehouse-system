/**
 * نموذجُ **تقرير مخزن فينسيا** — خالصٌ بلا DOM ولا Firestore.
 *
 * ═══ ★★★ مصدرٌ واحدٌ يقرأ منه المخرجان ═══
 * التقريرُ يخرج بصيغتين: إكسل منسَّقٌ وPDF. ولو بنى كلٌّ منهما أرقامَه
 * بنفسه لَافترقا — يُضاف عمودٌ هنا ويُنسى هناك، ويُصلَح مجموعٌ في أحدهما
 * فيبقى الثاني يكذب. والأسوأ أنّ ذلك **لا يشتكي**: ملفّان يخرجان ويبدوان
 * سليمَين ويُرسَلان، ولا يُكشف الفرقُ إلّا حين يقارنهما أحد.
 *
 * فهذا الملفّ يبني **الجسدَ كلَّه مرّةً واحدة** — عناوينَ وصفوفًا ومجاميعَ
 * وملخّصاتٍ — و`veneciaReportExcel` يُلبسه تنسيقَ إكسل، والشاشةُ تُلبسه
 * ورقةً تُطبع PDF. ولا رقمَ يُحسب في أيٍّ منهما.
 *
 * ═══ والمقاطعُ تُبنى من نفس الدوالّ المختبَرة ═══
 * `veneciaSnapshot` و`veneciaExportRows` و`cardsSnapshot` — فلا يُعاد حسابُ
 * ما حُسب، ولا يختلف ملخّصُ التقرير عن أرقام اللوحة التي ينظر إليها المالك.
 */
import {
  VENECIA_EXPORT_COLUMNS,
  assetCategory,
  countVariance,
  isCounted,
  rawQty,
  signedText,
  veneciaExportRows,
  veneciaSnapshot,
} from './veneciaModel.js';
import { CARD_KINDS, cardStateLabel, cardTotals, cardsSnapshot, filterCards } from './veneciaCards.js';

/** أعمدةُ ورقة بطاقات الحركة. */
export const CARD_REPORT_COLUMNS = [
  'الرقم',
  'الاتّجاه',
  'الحالة',
  'التاريخ',
  'الطرف',
  'الجهة',
  'بنود',
  'الوحدات',
  'الأثر',
  'الغرض',
];

/** عنوانُ التقرير الافتراضيّ. */
export const REPORT_TITLE = 'تقرير مخزن فينسيا';

/** صفوفُ ورقة البطاقات — دالّةٌ خالصةٌ تُختبر. */
export function cardReportRows(cards) {
  return (cards ?? []).map((c) => {
    const t = cardTotals(c);
    const kind = CARD_KINDS.find((k) => k.id === c.kind);
    return {
      الرقم: c.number || '—',
      'الاتّجاه': kind ? kind.label : '—',
      الحالة: cardStateLabel(c.state, c.kind),
      التاريخ: c.cardDate || '',
      الطرف: c.party || '',
      الجهة: c.destination || '',
      بنود: t.lines,
      الوحدات: t.units,
      // الأثرُ **صفرٌ لما لم يُثبَّت**: مسودّةٌ لم تُحرّك رصيدًا، وإظهارُ
      // أثرها رقمًا يجعل مجموعَ العمود يَعِد بحركةٍ لم تقع.
      الأثر: c.state === 'posted' && kind ? kind.sign * t.units : 0,
      الغرض: c.purpose || '',
    };
  });
}

/** سطرُ ملخّصٍ واحد. */
const kv = (label, value, note = '') => ({ label, value, note });

/**
 * يبني التقريرَ كاملًا.
 *
 * @param {object[]} assets أصولُ الجرد (كما تصل من السحابة)
 * @param {object[]} cards بطاقاتُ الحركة
 * @param {{ asOf?: string, filters?: Array<{label:string,value:string}>, scope?: string }} [opts]
 *        `asOf` يُمرَّر ولا يُقرأ من الساعة — فالتقريرُ يُختبر.
 */
export function buildVeneciaReport(assets, cards, { asOf = '', filters = [], scope = '' } = {}) {
  const snap = veneciaSnapshot(assets);
  const moves = cardsSnapshot(cards);
  const live = (assets ?? []).filter((a) => !a.archived);

  // وحداتُ كلّ تصنيف — لا عددُ أصوله فقط: مئةُ صنفٍ بوحدةٍ ليست كصنفٍ بمئة.
  const unitsByCategory = new Map(snap.categories.map(([c]) => [c, 0]));
  for (const a of live) {
    const cat = assetCategory(a);
    unitsByCategory.set(cat, (unitsByCategory.get(cat) ?? 0) + rawQty(a.qty));
  }

  const summary = [
    kv('أصولٌ في الجرد', snap.assets, `${snap.units} وحدة`),
    ...snap.perPopulation.map((p) => kv(p.label, p.assets, `${p.units} وحدة`)),
    kv('يحتاج تدخّلًا', snap.needsAttention, 'معطل أو يحتاج صيانة'),
    kv('مكهَّن', snap.archived, 'خارجَ كلّ رقمٍ أعلاه'),
    kv('جُرد', snap.count.counted, `من ${snap.count.total}`),
    kv('لم يُجرَد', snap.count.pending, 'لا عدَّ فعليًّا بعد'),
    kv('فروقٌ ظاهرة', snap.count.variances, `الصافي ${signedText(snap.count.netVariance)}`),
    kv('صُرف بالبطاقات', moves.issued.units, `${moves.issued.cards} بطاقة`),
    kv('أُدخل بالبطاقات', moves.received.units, `${moves.received.cards} بطاقة`),
    kv('صافي الحركة', signedText(moves.net), 'إدخالٌ ناقصَ صرف'),
    kv('مسودّاتٌ معلَّقة', moves.drafts, 'لم تُحرّك رصيدًا'),
  ];

  const rows = veneciaExportRows(assets);
  const totals = {
    الكمية: rows.reduce((s, r) => s + Number(r['الكمية'] || 0), 0),
    'الكمية المعدودة': live.filter(isCounted).reduce((s, a) => s + Number(a.countedQty), 0),
    'فرق الجرد': live.reduce((s, a) => s + (countVariance(a) ?? 0), 0),
  };

  const cardRows = cardReportRows(cards);
  const cardTotalsRow = {
    بنود: cardRows.reduce((s, r) => s + r['بنود'], 0),
    الوحدات: cardRows.reduce((s, r) => s + r['الوحدات'], 0),
    الأثر: cardRows.reduce((s, r) => s + r['الأثر'], 0),
  };

  return {
    title: REPORT_TITLE,
    scope: scope || 'الجرد كاملًا',
    asOf,
    filters,
    summary,
    byCondition: snap.byCondition.map(([c, n]) => ({ label: c, value: n })),
    byCategory: snap.categories.map(([c, n]) => ({
      label: c,
      value: n,
      note: `${unitsByCategory.get(c) ?? 0} وحدة`,
    })),
    byPopulation: snap.perPopulation,
    movement: moves,
    assetsSheet: { name: 'الجرد', columns: VENECIA_EXPORT_COLUMNS, rows, totals },
    cardsSheet: { name: 'بطاقات الحركة', columns: CARD_REPORT_COLUMNS, rows: cardRows, totals: cardTotalsRow },
  };
}

/**
 * الأعمدةُ الرقميّة في كلّ ورقة — يستعملها مُنسّقُ إكسل ليجعلها أرقامًا
 * تُجمَع لا نصوصًا. ومجموعٌ لا يُجمَع في إكسل هو أوّلُ ما يشتكي منه القارئ.
 */
export const NUMERIC_COLUMNS = {
  'الجرد': ['الكمية', 'الكمية المعدودة', 'فرق الجرد'],
  'بطاقات الحركة': ['بنود', 'الوحدات', 'الأثر'],
};

/** تصفيةُ بطاقاتٍ بمدى تاريخٍ — تُعاد تصديرًا ليستعملها بانيّ التقرير. */
export { filterCards };
