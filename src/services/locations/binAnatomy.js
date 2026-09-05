/**
 * تشريحُ الخانة — أن يقرأ العاملُ موقعَه بالعربيّة لا برموزٍ صمّاء. منطقٌ خالص.
 *
 * ═══ الفجوة التي يسدّها ═══
 * كودُ الموقع ترتيبٌ من المقاطع، **والترتيب هو المعنى** (`locationCode.js`).
 * فـ`RH-A-L-01-01` صحيحٌ تمامًا للحاسوب وأصمُّ تمامًا للعامل: أيُّ مقطعٍ الممرّ
 * وأيُّها الرفّ؟ و`L` أهي يسارٌ أم مستوًى؟ والبانيةُ كانت تولّد ثمّ **تنسى**
 * المخطّط (`useState` وحده)، فلا يبقى في النظام من يعرف الجواب.
 *
 * والتسميةُ تختلف بين مستودعين بالضرورة: مستودعٌ فيه غرفٌ يُسمّي مقطعًا
 * «الغرفة»، ومستودعٌ بممرّين يسارٍ ويمينٍ يُسمّي المقطع نفسه «الجهة». فالمعنى
 * يُحفظ **على وثيقة المستودع** ويُقرأ منها، لا يُخمَّن من الكود.
 *
 * ═══ ★★ والبادئةُ ليست كودَ المستودع (قرار المالك 2026-09-02) ═══
 * البوّابة سجّلت `WH001` الرحبة و`WH002` طرابلس قبل طباعة الملصقات،
 * والملصقاتُ الـ٣٦٠٠ طُبعت ببادئتَي `RH` و`TR`. فلا الملصقُ يُعاد طبعُه ولا
 * كودُ المستودع يُغيَّر (حركاتٌ قد تشير إليه) — **والربطُ حقلٌ يُقرأ**:
 * `warehouses/{id}.binPrefix`. وهذا الملفّ هو من يترجم بينهما، فيمسح العاملُ
 * `RH-…` وتقول له الشاشة «الرحبة».
 */

import { CODE_SEGMENTS, normalizeLocationCode, parseLocationCode } from './locationCode.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const str = (v) => String(v ?? '').trim();

/**
 * التسميات الافتراضيّة — هي نفسُها المعروضة في بانية المواقع اليوم.
 * مستودعٌ بلا `segmentLabels` محفوظةٍ يُقرأ بها، فلا شاشةَ تعرض مفتاحًا إنجليزيًّا.
 */
export const SEGMENT_LABELS_DEFAULT = Object.freeze({
  warehouse: 'المستودع',
  zone: 'المنطقة / الغرفة',
  rack: 'الممرّ',
  bay: 'الرفّ',
  level: 'المستوى',
  position: 'الصندوق',
});

/**
 * بادئةُ أكواد خانات هذا المستودع.
 *
 * الافتراضُ **كودُ المستودع نفسُه** — فمستودعٌ لم يُطبع له ملصقٌ بعدُ يعمل بلا
 * إعدادٍ إضافيّ، ولا يُفرض حقلٌ جديدٌ على بياناتٍ قائمة.
 */
export function binPrefixOf(warehouse) {
  return up(warehouse?.binPrefix) || up(warehouse?.code) || up(warehouse?.id);
}

/**
 * أعطابُ البادئات عبر المستودعات كلّها — بادئةٌ مكرّرة تعني خانةً بمستودعين.
 *
 * تُقرأ في شاشة الإدارة قبل الحفظ: كودُ الخانة يحمل بادئةً واحدة، فلو حملها
 * مستودعان لَما عُرف صاحبُ الرصيد. وهذا عطبٌ يُكشف يوم الإعداد لا يوم الجرد.
 */
export function prefixConflicts(warehouses) {
  const seen = new Map();
  for (const w of warehouses || []) {
    const p = binPrefixOf(w);
    if (!p) continue;
    seen.set(p, [...(seen.get(p) || []), str(w?.code || w?.id)]);
  }
  return [...seen.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([prefix, owners]) => ({
      prefix,
      owners,
      message: `البادئة «${prefix}» يحملها ${owners.length} مستودعًا (${owners.join(' · ')}) — والخانةُ لا تكون في مستودعين.`,
    }));
}

/**
 * مستودعُ هذه الخانة — يُطابَق أوّلُ مقطعٍ بالبادئة.
 *
 * يُعيد `null` لكودٍ معطوبٍ أو لبادئةٍ لا مستودعَ لها؛ **ولا يُخمَّن**: خانةٌ
 * ببادئةٍ مجهولة ملصقُ فرعٍ آخر أو كودٌ خاطئ، وكلاهما يُقال ولا يُبتلع.
 */
export function warehouseForBin(code, warehouses) {
  const parsed = parseLocationCode(code);
  if (!parsed) return null;
  const prefix = up(parsed.warehouse);
  return (warehouses || []).find((w) => binPrefixOf(w) === prefix) || null;
}

/** تسمياتُ مقاطع هذا المستودع — المحفوظُ يغطّي الافتراضيّ ولا يمحوه. */
export function segmentLabelsOf(warehouse) {
  const saved = warehouse?.segmentLabels || {};
  const out = { ...SEGMENT_LABELS_DEFAULT };
  for (const key of CODE_SEGMENTS) if (str(saved[key])) out[key] = str(saved[key]);
  return out;
}

/**
 * تسميةُ قيمةٍ بعينها — `L` ⟵ «يسار».
 *
 * لأنّ حرفًا واحدًا لا يُقرأ: العاملُ الواقفُ في الممرّ يحتاج «يمين» لا `R`.
 * وما لا تسميةَ له يعود بنفسه ظاهرًا (عرفُ `fieldLexicon`).
 */
export function valueLabelOf(warehouse, key, value) {
  const v = up(value);
  return str(warehouse?.valueLabels?.[key]?.[v]) || v;
}

/**
 * وصفُ الخانة مقطعًا مقطعًا — ما تعرضه الشاشة تحت الكود.
 *
 * يبدأ **بعد** المستودع (اسمُه يُعرض وحده)، ويقتصر على المقاطع المملوءة —
 * فخانةٌ بخمسة مقاطعَ لا تعرض «الصندوق: —».
 *
 * @returns {{key:string, label:string, value:string, text:string}[]}
 */
export function describeBin(code, warehouse) {
  const parsed = parseLocationCode(code);
  if (!parsed) return [];
  const labels = segmentLabelsOf(warehouse);
  return CODE_SEGMENTS.slice(1)
    .filter((key) => parsed[key])
    .map((key) => ({
      key,
      label: labels[key],
      value: parsed[key],
      text: valueLabelOf(warehouse, key, parsed[key]),
    }));
}

/**
 * سطرُ العنوان الذي يقرؤه العامل: «الممرّ A · الجهة يمين · الرفّ 01 · الخانة 01».
 * الأرقام لاتينيّة كما في كلّ واجهات البوّابة.
 */
export function binHeadline(code, warehouse) {
  return describeBin(code, warehouse)
    .map((s) => `${s.label} ${s.text}`)
    .join(' · ');
}

/**
 * كودُ الخانة كما يُبنى لهذا المستودع — بالبادئة لا بكود المستودع.
 *
 * ⚠️ هذه هي الدالّة التي تمنع العطب الذي كان: البانيةُ كانت تولّد من `code`،
 * فتُنتج `WH001-A-L-01-01` — كودًا **لا وجودَ له على أيّ ملصقٍ مطبوع**.
 */
export function binCodeFor(warehouse, segments) {
  const prefix = binPrefixOf(warehouse);
  if (!prefix) return '';
  return normalizeLocationCode([prefix, ...(segments || [])].filter(Boolean).join('-'));
}

/**
 * عطبُ البادئة — نصٌّ عربيٌّ يقول الصواب، أو `''` إن صحّت.
 *
 * البادئةُ **مقطعُ كودٍ** لا اسمٌ حرّ: تصير أوّلَ مقطعٍ في معرّف مستند
 * Firestore وفي مفتاح الرصيد. فحدُّها حدُّ المقطع نفسِه في `locationCode.js`،
 * ومن كتب فيها مسافةً أو رمزًا ولّد ٣٦٠٠ كودٍ معطوبٍ بضغطةٍ واحدة.
 */
export function binPrefixProblem(raw) {
  const p = up(raw);
  if (!p) return 'بادئة الخانات مطلوبة — بها يُبنى كودُ كلّ خانةٍ في هذا المستودع.';
  if (!/^[A-Z0-9]+$/.test(p)) {
    return `البادئة «${p}» تحمل محرفًا غير مسموح — حروفٌ لاتينيّة كبيرة وأرقامٌ فقط (لا مسافات ولا شرطات).`;
  }
  if (p.length > 12) return `البادئة «${p}» أطول من 12 محرفًا.`;
  return '';
}

/**
 * أعطابُ حزمة الترقيم قبل حفظها على المستودع — البادئةُ ثمّ اتّساقُها مع المخطّط.
 *
 * ★ والاتّساقُ هو الحارس: مخطّطٌ `warehouse` فيه `TR` محفوظٌ على مستودعٍ
 * بادئتُه `RH` يولّد أكوادًا لمستودعٍ آخر. وهذا عطبٌ لا يُرى إلّا حين يقف
 * العاملُ أمام رفٍّ ويمسح ملصقًا «مجهولًا».
 */
export function numberingProblems({ binPrefix, scheme } = {}) {
  const problems = [];
  const prefixProblem = binPrefixProblem(binPrefix);
  if (prefixProblem) problems.push(prefixProblem);
  const schemeWarehouse = up(scheme?.warehouse);
  if (schemeWarehouse && !prefixProblem && schemeWarehouse !== up(binPrefix)) {
    problems.push(
      `المخطّط يولّد بـ«${schemeWarehouse}» والبادئة «${up(binPrefix)}» — ` +
        'فيُنتج أكوادًا لمستودعٍ آخر. وحّدهما.'
    );
  }
  return problems;
}
