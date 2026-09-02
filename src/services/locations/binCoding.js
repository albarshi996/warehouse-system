/**
 * تكويدُ المواقع — «الباركودُ يُربط بعنوانه، ولا يُفترض» (طلب المالك 2026-09-02).
 * منطقٌ خالص.
 *
 * ═══ التحوّلُ الذي يصنعه ═══
 * كان النظامُ يقرأ العنوانَ **من الكود نفسِه**: `RH-A-R-01-01` يعني الممرّ A
 * والجهةَ اليمنى… وهذا يعمل ما دام كلُّ ملصقٍ ناطقًا بعنوانه. لكنّ الملصقَ
 * الملصوقَ على الرفّ قد يكون أيَّ باركود — قديمًا أو مطبوعًا من مورّد أو
 * جاهزًا في لفّة. فالنظامُ **لا يفترض**: يسأل الموظّفَ أين هذا الباركود،
 * ويربطه، ثمّ يعرفه إلى الأبد.
 *
 *   باركودُ الموقع  ⟶  عنوانُ التخزين  ⟶  محتوى الموقع
 *
 * ═══ ★★★ والهويّةُ تبقى الكودَ القانونيّ لا الباركود ═══
 * `bin_locations` معرّفُه الكودُ (`RH-A-R-01-01`)، وعليه تُبنى الحركاتُ
 * والأرصدةُ وخطّةُ السحب والخريطة. فلو صارت الهويّةُ باركودًا عشوائيًّا
 * لَانقطع كلُّ ذلك. والباركودُ **حقلٌ على الوثيقة** ومفتاحُ بحثٍ عكسيّ — لا
 * أكثر. ومن بدّل ملصقًا يومًا يربط الباركودَ الجديد بالعنوان نفسِه، ولا
 * تتحرّك حركةٌ واحدة.
 *
 * ═══ ومقترَحٌ لا مفروض ═══
 * ملصقٌ ناطقٌ بعنوانه (ملصقاتُ المالك المطبوعة) **يُملأ به الويزارد مقترَحًا**
 * ويُقال إنّه مقترَح — فيوفّر وقتًا هائلًا في ٣٦٠٠ خانة، ويبقى التأكيدُ بيد
 * الموظّف. والاقتراحُ ليس افتراضًا: يُعرض ويُغيَّر ولا يُعتمد بلا ضغطة.
 */

import { segmentLabelsOf, valueLabelOf } from './binAnatomy.js';
import { CODE_SEGMENTS, normalizeLocationCode, parseLocationCode } from './locationCode.js';
import { levelValues } from './locationScheme.js';
import { numberingOf, resolveLevels, templateById } from './binTemplate.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();

/** مقاطعُ العنوان التي يسألها الويزارد — ما بعد المستودع. */
export const ADDRESS_KEYS = Object.freeze(CODE_SEGMENTS.slice(1));

/**
 * خطواتُ الويزارد لهذا المستودع — كلُّ خطوةٍ سؤالٌ وخياراتُه.
 *
 * تُشتقّ من **مخطّط المستودع نفسِه** (المحفوظ أو قالبه): فلو كان مستودعٌ
 * بثلاثة مستوياتٍ وآخرُ بخمسة، سأل كلًّا بما فيه. ولا تُكتب خياراتٌ بيد.
 *
 * @returns {{key, label, options:{value, text}[]}[]}
 */
export function codingSteps(warehouse, templates = []) {
  const numbering = numberingOf(warehouse);
  let levels = numbering?.scheme?.levels;
  if (!levels) {
    const t = templateById(templates, numbering?.templateId);
    levels = t ? resolveLevels(t, numbering?.params) : null;
  }
  if (!levels) return [];

  const labels = segmentLabelsOf(warehouse);
  const steps = [];
  for (const key of ADDRESS_KEYS) {
    const level = levels.find((l) => l.key === key);
    if (!level || level.enabled === false) break; // المعطَّل يقف بالسلسلة — الترتيب هو المعنى
    const values = levelValues(level);
    if (!values.length) break;
    steps.push({
      key,
      label: labels[key] || key,
      options: values.map((value) => ({ value, text: valueLabelOf(warehouse, key, value) })),
    });
  }
  return steps;
}

/** الكودُ القانونيُّ من البادئة والعنوان — `RH` + `{zone:'A',…}` ⟵ `RH-A-R-01-01`. */
export function codeFromAddress(binPrefix, address = {}, steps = null) {
  const prefix = up(binPrefix);
  if (!prefix) return '';
  const keys = steps ? steps.map((s) => s.key) : ADDRESS_KEYS;
  const parts = [];
  for (const key of keys) {
    const v = up(address?.[key]);
    if (!v) break; // فجوةٌ في الوسط تقف — لا يُقفز مستوًى
    parts.push(v);
  }
  return normalizeLocationCode([prefix, ...parts].join('-'));
}

/** أعنوانٌ مكتملٌ بكلّ خطواته؟ */
export function addressComplete(address = {}, steps = []) {
  return steps.length > 0 && steps.every((s) => up(address?.[s.key]));
}

/**
 * أوّلُ خطوةٍ لم تُجب بعد — عليها يقف الويزارد.
 * و`-1` تعني أنّ العنوان اكتمل.
 */
export function currentStep(address = {}, steps = []) {
  return steps.findIndex((s) => !up(address?.[s.key]));
}

/** وصفُ العنوان كما يقرؤه الموظّف — «الممرّ A · يمين · المستوى 01 · الخانة 01». */
export function addressLabel(address = {}, steps = []) {
  return steps
    .filter((s) => up(address?.[s.key]))
    .map((s) => {
      const opt = s.options.find((o) => o.value === up(address[s.key]));
      return `${s.label} ${opt?.text ?? up(address[s.key])}`;
    })
    .join(' · ');
}

/**
 * عنوانٌ مقترَحٌ من الباركود — إن كان ناطقًا بعنوانه.
 *
 * ★ **مقترَحٌ لا مفروض**: يُعاد ومعه `source: 'barcode'` لتقول الشاشةُ من أين
 * جاء. وباركودٌ أصمُّ يُعيد عنوانًا فارغًا ويبدأ الويزاردُ من أوّله.
 * ولا يُقترح مقطعٌ ليس من خيارات المستودع — فاقتراحٌ لا يُختار عبثٌ يُربك.
 */
export function suggestAddress(barcode, { binPrefix, steps = [] } = {}) {
  const parsed = parseLocationCode(barcode);
  if (!parsed || !steps.length) return { address: {}, source: '' };
  if (up(parsed.warehouse) !== up(binPrefix)) return { address: {}, source: '' };

  const address = {};
  for (const s of steps) {
    const v = up(parsed[s.key]);
    if (!v || !s.options.some((o) => o.value === v)) break;
    address[s.key] = v;
  }
  return { address, source: Object.keys(address).length ? 'barcode' : '' };
}

/** يُطبَّع الباركود للمقارنة — كما يُطبَّع عند الحفظ، فلا يفترق المسحُ عن المخزَّن. */
export function normalizeBinBarcode(raw) {
  return up(raw).replace(/\s+/g, '');
}

/**
 * الموقعُ المرتبطُ بهذا الباركود — و`null` إن لم يُربط بعد.
 *
 * ويُقبل أن يكون الباركودُ هو الكودَ نفسَه (الملصقاتُ الناطقة): فمستودعٌ
 * كُوِّد بملصقاته المطبوعة يعمل بلا ربطٍ يدويٍّ لكلّ خانة.
 */
export function findByBarcode(locations, raw) {
  const b = normalizeBinBarcode(raw);
  if (!b) return null;
  const byBarcode = (locations || []).find((l) => normalizeBinBarcode(l?.barcode) === b);
  if (byBarcode) return byBarcode;
  const code = normalizeLocationCode(raw);
  return (locations || []).find((l) => normalizeLocationCode(l?.code) === code) || null;
}

/**
 * أعطابُ الربط قبل وقوعه — كلٌّ جملةٌ تقول الصواب.
 *
 * ★★ وثلاثةُ تصادماتٍ تُمنع، وكلُّها تقع في المخزن حقيقةً:
 *   · باركودٌ مربوطٌ سلفًا بعنوانٍ آخر — ملصقٌ نُزع ولُصق في مكانٍ ثانٍ.
 *   · وعنوانٌ مربوطٌ سلفًا بباركودٍ آخر — ملصقان على رفٍّ واحد.
 *   · وعنوانٌ لا وجودَ له في سيّد المواقع — لم يُولَّد بعد.
 */
export function bindingProblems({ barcode, code, locations = [] } = {}) {
  const problems = [];
  const b = normalizeBinBarcode(barcode);
  const c = normalizeLocationCode(code);

  if (!b) problems.push('لا باركودَ ليُربط — امسح ملصقَ الموقع.');
  if (!c) problems.push('العنوان غير مكتمل — أكمل خطوات الويزارد.');
  if (!b || !c) return problems;

  const target = (locations || []).find((l) => normalizeLocationCode(l?.code) === c);
  if (!target) {
    problems.push(`العنوان «${c}» غير معرَّفٍ في سيّد المواقع — ولّد مواقعَ هذا المستودع أوّلًا.`);
  }

  const boundElsewhere = (locations || []).find(
    (l) => normalizeBinBarcode(l?.barcode) === b && normalizeLocationCode(l?.code) !== c
  );
  if (boundElsewhere) {
    problems.push(`هذا الباركود مربوطٌ سلفًا بـ«${boundElsewhere.code}» — انزعه منه أوّلًا أو امسح ملصقًا آخر.`);
  }

  const already = normalizeBinBarcode(target?.barcode);
  if (already && already !== b) {
    problems.push(`العنوان «${c}» مربوطٌ سلفًا بباركودٍ آخر (${already}) — رفٌّ واحدٌ بملصقين.`);
  }
  return problems;
}

/** أهو مربوطٌ بهذا الباركود سلفًا؟ فالربطُ ثانيةً بلا أثرٍ ولا رسالةَ عطب. */
export function alreadyBound({ barcode, code, locations = [] } = {}) {
  const target = (locations || []).find((l) => normalizeLocationCode(l?.code) === normalizeLocationCode(code));
  return Boolean(target) && normalizeBinBarcode(target.barcode) === normalizeBinBarcode(barcode);
}

/**
 * العنوانُ التالي في التسلسل — يزيد آخرَ خطوةٍ ويحمل الزيادةَ إلى ما قبلها.
 *
 * ★★ لأنّ الموظّف **يمشي بالتتابع**: خانةٌ خانة، ثمّ المستوى التالي، ثمّ
 * الجهةُ الأخرى، ثمّ الممرّ. فاقتراحُ التالي يوفّر أربعَ ضغطاتٍ في كلّ خانةٍ
 * من ٣٦٠٠ — وهو الفرقُ بين يومٍ وأسبوع.
 *
 * ويُعاد `null` عند آخر خانةٍ في المستودع — فلا يُلتفّ إلى الأوّل صامتًا.
 */
export function nextAddress(address = {}, steps = []) {
  if (!addressComplete(address, steps)) return null;
  const next = { ...address };
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    const idx = s.options.findIndex((o) => o.value === up(next[s.key]));
    if (idx < 0) return null;
    if (idx + 1 < s.options.length) {
      next[s.key] = s.options[idx + 1].value;
      return next;
    }
    next[s.key] = s.options[0].value; // انتهت هذه الخطوة — تُصفَّر وتُزاد التي قبلها
  }
  return null; // آخرُ خانةٍ في المستودع
}

/** كم موقعًا كُوِّد من كم — تقدّمُ التكويد كما تعرضه الشاشة. */
export function codingProgress(locations, binPrefix) {
  const prefix = up(binPrefix);
  const mine = (locations || []).filter(
    (l) => prefix && normalizeLocationCode(l?.code).startsWith(`${prefix}-`)
  );
  const bound = mine.filter((l) => normalizeBinBarcode(l?.barcode)).length;
  return { total: mine.length, bound, remaining: Math.max(0, mine.length - bound) };
}
