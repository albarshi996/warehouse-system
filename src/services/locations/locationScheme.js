/**
 * مخطّط ترقيم المستودع — «منطقٌ واحد يتغيّر حسب المستودع» (طلب المالك 2026-08-24).
 *
 * ═══ المشكلة ═══
 * تعريف الرفوف كان **يدويًّا سطرًا سطرًا**: مستودعٌ بعشرة ممرّاتٍ وخمسة رفوفٍ
 * وأربعة مستوياتٍ واثني عشر صندوقًا = ٢٤٠٠ موقعٍ تُكتب بالقلم. فلا تُكتب،
 * فيبقى المخزون بلا مواقع، فلا يعمل التخزين الموجّه أصلًا.
 *
 * ═══ الحلّ ═══
 * تصف **المدى** مرّةً — من A01 إلى A10، من R01 إلى R05… — فيُولَّد الكاملُ
 * دفعةً. والمخطّط يُحفظ **لكلّ مستودع**، فيختلف بينها بلا اختلاف المنطق:
 * مستودعٌ فيه غرفٌ يُفعّل مستوى الغرفة، والرحبةُ بلا غرفٍ فتُعطّله.
 *
 * ═══ ولماذا ستّة مقاطع لا سبعة (قرارٌ يستحقّ التفسير) ═══
 * طلب المالك نمطًا كهذا: `BEN-RHB-PIK-A03-R02-L04-B07` — سبعةُ مقاطع.
 * وكودُ الموقع في هذا النظام **ليس اسمًا للعرض**: هو معرّفُ مستند Firestore
 * وجزءٌ من مفتاح الرصيد. فإدراجُ مقطعٍ سابعٍ **في المقدّمة** يزيح دلالة كلّ
 * مقطعٍ بعده، فيصير `MAIN-A01` القائم مقروءًا «موقعًا ثمّ مستودعًا» — ويُكسر
 * كلّ رصيدٍ ومستندٍ سابق.
 *
 * والمراد يتحقّق بلا كسرة واحدة: **المدينة تُدمج في كود المستودع**
 * (`BENRHB` أو `RHB`)، فيصير النمط ستّة مقاطعٍ تطابق البنية القائمة حرفيًّا:
 *
 *   RHB   -   PIK   -   A03   -   R02   -   L04   -   B07
 *   مستودع   منطقة    ممرّ      رفّ      مستوى    صندوق
 *
 * والتسميات هنا **للعرض وحدها**؛ الترتيب هو المعنى كما في `locationCode.js`.
 */

import { CODE_SEGMENTS, MAX_SEGMENT_LEN, SEGMENT_SEPARATOR, locationCodeProblem, normalizeLocationCode } from './locationCode.js';

/** المستويات القابلة للتهيئة — ما بعد المستودع، بترتيب المعنى. */
export const SCHEME_LEVELS = Object.freeze(
  CODE_SEGMENTS.slice(1).map((key) => ({ key }))
);

/** سقفُ التوليد — حاجزٌ ضدّ مخطّطٍ يُنتج ملايين الأكواد بغلطةِ رقم. */
export const MAX_GENERATED = 5000;

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const int = (v, dflt = 0) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : dflt;
};

/**
 * مستوًى واحد في المخطّط.
 *
 * صورتان لا ثالثة:
 *   · **مدى**: بادئةٌ ورقمٌ من كذا إلى كذا بحشوٍ ثابت (`A01`…`A10`).
 *   · **قائمة**: قيمٌ مكتوبة كما هي (`PIK` · `BLK` · `CLD`).
 * والقائمةُ تتقدّم على المدى حين تُملأ — من كتبها يريدها.
 */
export function shapeLevel(raw, key) {
  const values = (Array.isArray(raw?.values) ? raw.values : str(raw?.values).split(/[,\s]+/))
    .map(up)
    .filter(Boolean);
  return {
    key: str(key || raw?.key),
    label: str(raw?.label),
    enabled: raw?.enabled !== false,
    prefix: up(raw?.prefix),
    from: Math.max(0, int(raw?.from, 1)),
    to: Math.max(0, int(raw?.to, 0)),
    pad: Math.min(4, Math.max(0, int(raw?.pad, 2))),
    values,
  };
}

/** المخطّط كاملًا — مستودعٌ ومستوياتٌ بترتيب `CODE_SEGMENTS`. */
export function shapeScheme(raw) {
  const byKey = new Map((raw?.levels || []).map((l) => [str(l?.key), l]));
  return {
    warehouse: up(raw?.warehouse),
    levels: SCHEME_LEVELS.map((l) => shapeLevel(byKey.get(l.key) || {}, l.key)),
  };
}

/** قيمُ مستوًى واحد — القائمة إن وُجدت، وإلّا المدى. */
export function levelValues(level) {
  const l = shapeLevel(level, level?.key);
  if (!l.enabled) return [];
  if (l.values.length) return l.values;
  if (!(l.to >= l.from) || l.to <= 0) return [];
  const out = [];
  for (let i = l.from; i <= l.to; i++) out.push(`${l.prefix}${String(i).padStart(l.pad, '0')}`);
  return out;
}

/**
 * أعطاب المخطّط — كلّ عطبٍ جملةٌ تقول الصواب.
 *
 * وأهمّها **الفجوة في الوسط**: مستوًى معطَّلٌ يليه مفعَّل يُنتج كودًا يقفز
 * مستوًى، و`formatLocationCode` يرفضه أصلًا لأنّ «الترتيب هو المعنى».
 */
export function schemeProblems(raw) {
  const s = shapeScheme(raw);
  const problems = [];

  if (!s.warehouse) problems.push('المخطّط بلا مستودع — أيَّ مستودعٍ يرقّم؟');
  else if (s.warehouse.length > MAX_SEGMENT_LEN) {
    problems.push(`كود المستودع «${s.warehouse}» أطول من ${MAX_SEGMENT_LEN} محرفًا.`);
  }

  const active = s.levels.filter((l) => l.enabled);
  if (!active.length) problems.push('لا مستوًى مفعَّل — المخطّط يحتاج مستوًى واحدًا على الأقلّ بعد المستودع.');

  // الفجوة: أوّل معطَّلٍ يجب ألّا يليه مفعَّل.
  const firstOff = s.levels.findIndex((l) => !l.enabled);
  if (firstOff >= 0 && s.levels.slice(firstOff).some((l) => l.enabled)) {
    problems.push('مستوًى معطَّلٌ يليه مفعَّل — المستويات تُعطَّل من الآخر لا من الوسط، فالترتيب هو المعنى.');
  }

  for (const l of active) {
    const vals = levelValues(l);
    const name = l.label || l.key;
    if (!vals.length) {
      problems.push(`المستوى «${name}» بلا قيم — اكتب مدًى (من/إلى) أو قائمةَ قيم.`);
      continue;
    }
    for (const v of vals) {
      if (v.length > MAX_SEGMENT_LEN) {
        problems.push(`القيمة «${v}» في «${name}» أطول من ${MAX_SEGMENT_LEN} محرفًا.`);
        break;
      }
      if (!/^[A-Z0-9]+$/.test(v)) {
        problems.push(`القيمة «${v}» في «${name}» تحمل محرفًا غير مسموح — لاتينيّ كبيرٌ وأرقامٌ فقط.`);
        break;
      }
    }
  }

  const total = countScheme(s);
  if (total > MAX_GENERATED) {
    problems.push(`المخطّط يُنتج ${total} موقعًا — الحدّ ${MAX_GENERATED}. ضيّق المدى أو عطّل مستوًى.`);
  }
  return problems;
}

/** كم موقعًا يُنتج هذا المخطّط؟ — يُحسب قبل التوليد لا بعده. */
export function countScheme(raw) {
  const s = shapeScheme(raw);
  if (!s.warehouse) return 0;
  let total = 1;
  for (const l of s.levels) {
    if (!l.enabled) break;
    const n = levelValues(l).length;
    if (!n) return 0;
    total *= n;
  }
  return total === 1 ? 0 : total;
}

/**
 * يولّد الأكواد كاملةً — ويرفض المعطوب بدل أن يمرّره.
 *
 * @returns {{codes:string[], rejected:{code:string, problem:string}[], total:number}}
 */
export function expandScheme(raw, { max = MAX_GENERATED } = {}) {
  const s = shapeScheme(raw);
  if (schemeProblems(s).length) return { codes: [], rejected: [], total: 0 };

  let prefixes = [s.warehouse];
  for (const l of s.levels) {
    if (!l.enabled) break;
    const vals = levelValues(l);
    const next = [];
    for (const p of prefixes) {
      for (const v of vals) {
        next.push(`${p}${SEGMENT_SEPARATOR}${v}`);
        if (next.length > max) break;
      }
    }
    prefixes = next;
  }

  const codes = [];
  const rejected = [];
  for (const code of prefixes.slice(0, max)) {
    const problem = locationCodeProblem(code);
    if (problem) rejected.push({ code, problem });
    else codes.push(normalizeLocationCode(code));
  }
  return { codes, rejected, total: prefixes.length };
}

/** عيّنةٌ للعرض قبل الاعتماد — أوّلُ الأكواد وآخرُها والعدد بينهما. */
export function previewScheme(raw, { sample = 5 } = {}) {
  const { codes, rejected, total } = expandScheme(raw);
  return {
    total,
    generated: codes.length,
    rejected,
    first: codes.slice(0, sample),
    last: codes.length > sample * 2 ? codes.slice(-sample) : [],
  };
}

/**
 * يحوّل الأكواد إلى مدخلات `saveLocationsBulk` — الاسم المختصر يُشتقّ ولا
 * يُكتب، والحالة `active` فالمولَّد صالحٌ للاستعمال فورًا.
 */
export function toLocationInputs(codes, { warehouse = '', kind = 'bin' } = {}) {
  return (codes || []).map((code) => ({
    code: normalizeLocationCode(code),
    warehouse: up(warehouse),
    kind,
    active: true,
  }));
}
