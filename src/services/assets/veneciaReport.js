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

/**
 * ═══ ورقةُ المصروف ‹VEN-301 ذيل› ═══
 *
 * ★★★ **سطرٌ لكلّ بندٍ مصروفٍ لا لكلّ بطاقة**: ورقةُ «بطاقات الحركة» تقول
 * «بطاقةٌ لسعيد فيها بندان و١٢ وحدة» — ولا تقول **أيُّ صنفٍ خرج**. والسؤالُ
 * الذي يُسأل في المخزن هو «كم عمودَ إنارةٍ صُرف ولمن»، لا «كم بطاقةً كُتبت».
 *
 * ★★ **والمثبَّتةُ وحدَها تدخل**: المسودّةُ لم تُحرّك رصيدًا، وإدراجُها يجعل
 * الورقةَ تَعِد ببضاعةٍ لم تخرج. والملغاةُ كذلك.
 */
export const ISSUED_REPORT_COLUMNS = [
  'السند',
  'التاريخ',
  'المستلِم',
  'الجهة',
  'رقم الأصل',
  'اسم الأصل',
  'التصنيف',
  'الكمية',
];

/** صفوفُ ورقة المصروف — بندًا بندًا من البطاقات المثبَّتة. */
export function issuedReportRows(cards) {
  const out = [];
  for (const c of cards ?? []) {
    if (c.kind !== 'issue' || c.state !== 'posted') continue;
    for (const l of c.lines ?? []) {
      out.push({
        السند: c.number || '—',
        التاريخ: c.cardDate || '',
        'المستلِم': c.party || '',
        الجهة: c.destination || '',
        'رقم الأصل': l.assetNo || '',
        'اسم الأصل': l.assetName || '',
        التصنيف: l.category || '',
        الكمية: rawQty(l.qty),
      });
    }
  }
  return out;
}

/**
 * ═══ ورقةُ المخرَّد ‹VEN-301 ذيل› ═══
 *
 * التخريدُ في هذا النظام هو **التكهين**: صنفٌ لا يصلح يخرج من الجرد بسببٍ
 * مكتوبٍ ولا يُحذف (`archived` + `archiveReason`)، فرقمُه مطبوعٌ على شيءٍ كان
 * في المخزن ومحوُه يجعل جردًا قديمًا يذكر ما لا وجودَ له.
 *
 * ★★★ **والسببُ عمودٌ أوّلٌ لا حاشية**: ورقةُ تخريدٍ بلا أسبابٍ لا تصلح
 * لمراجعةٍ ولا لجردٍ — والسؤالُ الأوّلُ عن كلّ مخرَّدٍ «لماذا خرج؟».
 */
export const SCRAP_REPORT_COLUMNS = [
  'رقم الأصل',
  'اسم الأصل',
  'المجموعة',
  'التصنيف',
  'الكمية',
  'الحالة',
  'سبب التخريد',
  'تاريخ التخريد',
  'من خرّده',
];

/** يومٌ مقروءٌ من ختمٍ أو نصّ — والختمُ قد يأتي كائنًا من Firestore. */
function stampDay(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = typeof v?.toDate === 'function' ? v.toDate() : v instanceof Date ? v : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** صفوفُ ورقة المخرَّد — المكهَّنُ وحدَه، ومعه سببُه ومن خرّده ومتى. */
export function scrapReportRows(assets) {
  return (assets ?? [])
    .filter((a) => a?.archived)
    .map((a) => ({
      'رقم الأصل': a.id || '',
      'اسم الأصل': a.assetName || '',
      'المجموعة': a.population === 'supported' ? 'أصول المدعوم' : 'بضاعة الصرف',
      التصنيف: assetCategory(a),
      الكمية: rawQty(a.qty),
      الحالة: a.condition || '',
      'سبب التخريد': a.archiveReason || '—',
      'تاريخ التخريد': stampDay(a.archivedAt),
      'من خرّده': a.archivedBy || '',
    }));
}

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

  // المخرَّدُ يُحسب مرّةً واحدةً: الملخّصُ والورقةُ يقرآن منه — فلو حُسب
  // مرّتين لَأمكن أن يفترقا، وهو عينُ ما يحرسه رأسُ هذا الملفّ.
  const scrapRows = scrapReportRows(assets);
  const scrapTotals = { الكمية: scrapRows.reduce((n, r) => n + r['الكمية'], 0) };

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
  // ★ سطرٌ للمخرَّد في الملخّص: الورقةُ تفصّل، والملخّصُ يقول «كم خرج ولا يصلح».
  summary.push(
    kv('مخرَّدٌ (مكهَّن)', scrapRows.length, `${scrapTotals['الكمية']} وحدة — خارجَ كلّ رقمٍ أعلاه`)
  );

  const rows = veneciaExportRows(assets);
  const totals = {
    الكمية: rows.reduce((s, r) => s + Number(r['الكمية'] || 0), 0),
    'الكمية المعدودة': live.filter(isCounted).reduce((s, a) => s + Number(a.countedQty), 0),
    'فرق الجرد': live.reduce((s, a) => s + (countVariance(a) ?? 0), 0),
  };

  const issuedRows = issuedReportRows(cards);
  const issuedTotals = { الكمية: issuedRows.reduce((n, r) => n + r['الكمية'], 0) };
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
    issuedSheet: { name: 'المصروف', columns: ISSUED_REPORT_COLUMNS, rows: issuedRows, totals: issuedTotals },
    scrapSheet: { name: 'المخرَّد', columns: SCRAP_REPORT_COLUMNS, rows: scrapRows, totals: scrapTotals },
  };
}

/**
 * الأعمدةُ الرقميّة في كلّ ورقة — يستعملها مُنسّقُ إكسل ليجعلها أرقامًا
 * تُجمَع لا نصوصًا. ومجموعٌ لا يُجمَع في إكسل هو أوّلُ ما يشتكي منه القارئ.
 */
export const NUMERIC_COLUMNS = {
  'الجرد': ['الكمية', 'الكمية المعدودة', 'فرق الجرد'],
  'بطاقات الحركة': ['بنود', 'الوحدات', 'الأثر'],
  'المصروف': ['الكمية'],
  'المخرَّد': ['الكمية'],
};

/** تصفيةُ بطاقاتٍ بمدى تاريخٍ — تُعاد تصديرًا ليستعملها بانيّ التقرير. */
export { filterCards };
