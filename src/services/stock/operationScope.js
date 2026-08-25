/**
 * نطاق عمليّة الجرد ‹CAP-201› — منطق خالص بلا Firebase.
 *
 * ═══ الفجوة (ج‑٤) ═══
 * `createOperation` كان يفتح جلسةً بلا مستودعٍ ولا منطقة — فالكشف يقول «عُدّ»
 * ولا يقول **أين**. وشجرةُ المواقع مكتملةٌ (٢٠/٢٠) ومهجورةٌ هنا تمامًا.
 *
 * ═══ ★★ والقيد الحاكم: ق-٣ «لا يقطع الفريق عند الجرد» ═══
 * فالنطاق **يُطلب ويُقترح ولا يُلزم**. جلسةٌ بلا نطاق تُفتح وتعمل كاملةً،
 * ولا بوّابةَ ولا رسالةَ تعطيل. وكلُّ ما تناله: **وسمٌ صريح** بأنّها لا تُثبت
 * تغطية — والوسمُ إعلانٌ لا منع.
 *
 * ═══ ولماذا لا يُخترع للنطاق تمثيلٌ ثانٍ ═══
 * النطاق **هو بادئةُ كود موقعٍ قائمة**: المقطع الأوّل مستودعٌ والثاني منطقة
 * (`CODE_SEGMENTS`). فـ«مستودع MAIN ومنطقة A01» هو `MAIN-A01` حرفيًّا، ونحوُه
 * وتطبيعُه وحكمُ «هل هذا الرفّ تحته؟» مبنيّةٌ ومختبَرة في `locationCode.js`.
 * وتمثيلٌ ثانٍ يعني نحوَين لشيءٍ واحدٍ يفترقان أوّلَ إعادة تنظيم.
 *
 * ═══ ومنطقةٌ بلا مستودعٍ لا معنى لها ═══
 * الكود **موضعيّ**: `A01` وحدها تُقرأ مستودعًا اسمه A01 لا منطقة. فتُسقَط
 * ويُعلَن إسقاطها — ولا تُكتب نطاقًا كاذبًا يُقاس عليه اكتمالٌ لم يقع.
 */
import {
  CODE_SEGMENTS,
  SEGMENT_SEPARATOR,
  MAX_SEGMENT_LEN,
  isDescendantOf,
  normalizeLocationCode,
} from '../locations/locationCode.js';
import { buildLocationTree } from '../locations/locationsModel.js';

const str = (v) => String(v ?? '').trim();

/** مقطعٌ واحدٌ مطبَّعٌ بنحو كود الموقع — وما لا يصلح مقطعًا يُردّ فارغًا. */
function segment(raw) {
  const one = normalizeLocationCode(raw).split(SEGMENT_SEPARATOR)[0] || '';
  if (!one || one.length > MAX_SEGMENT_LEN || !/^[A-Z0-9]+$/.test(one)) return '';
  return one;
}

/**
 * يُطبّع نطاقًا مُدخَلًا إلى شكلٍ واحدٍ يُكتب على الرأس.
 *
 * @param {{warehouse?:string, zone?:string}} [input]
 * @returns {{warehouse:string, zone:string, code:string, declared:boolean, notes:string[]}}
 *   `code` بادئةُ الموقع (`''` · `MAIN` · `MAIN-A01`)، و`notes` ما أُسقط ولماذا.
 */
export function normalizeScope(input = {}) {
  const notes = [];
  const warehouse = segment(input?.warehouse);
  let zone = segment(input?.zone);

  if (str(input?.warehouse) && !warehouse) {
    notes.push(`«${str(input.warehouse)}» ليست كود مستودعٍ صالحًا — أُسقطت.`);
  }
  if (str(input?.zone) && !zone) {
    notes.push(`«${str(input.zone)}» ليست كود منطقةٍ صالحًا — أُسقطت.`);
  }
  // ★ الموضعُ هو المعنى: منطقةٌ بلا مستودعٍ تُقرأ مستودعًا، فتُسقط ولا تُكتب.
  if (zone && !warehouse) {
    notes.push(`المنطقة «${zone}» بلا مستودع — والكود موضعيّ، فأُسقطت ولم تُكتب نطاقًا.`);
    zone = '';
  }

  const code = [warehouse, zone].filter(Boolean).join(SEGMENT_SEPARATOR);
  return { warehouse, zone, code, declared: Boolean(code), notes };
}

/**
 * نطاقُ عمليّةٍ مقروءٌ من رأسها — **متسامحٌ مع القديم** (معيار الإتمام ٣).
 * عمليّةٌ فُتحت قبل هذه المهمّة لا تحمل الحقلين، فتُقرأ «بلا نطاق» ولا تُكسر.
 */
export function scopeOf(operation) {
  return normalizeScope({ warehouse: operation?.warehouse, zone: operation?.zone });
}

/**
 * هل هذا الموقع داخل النطاق؟
 *
 * ★ وبلا نطاقٍ **لا يخرج شيء**: الجلسة المفتوحة على المستودع كلّه تقبل كلّ
 * رفّ. فالغيابُ ليس نطاقًا فارغًا يرفض كلّ شيء — وهو الخطأ الذي يحوّل
 * «لا يُلزم» إلى «يمنع كلّ شيء».
 */
export function withinScope(scope, locationCode) {
  const s = scope?.code ? normalizeLocationCode(scope.code) : normalizeScope(scope).code;
  if (!s) return true;
  const code = normalizeLocationCode(locationCode);
  if (!code) return false;
  return code === s || isDescendantOf(code, s);
}

/** نصُّ النطاق كما يُعرض — وبلا نطاقٍ يُقال ذلك صراحةً لا يُترك فارغًا. */
export function scopeLabel(scope) {
  const s = scope?.code !== undefined ? scope : normalizeScope(scope);
  if (!s.declared) return 'بلا نطاق — المستودع كلّه';
  return s.zone ? `المستودع ${s.warehouse} · المنطقة ${s.zone}` : `المستودع ${s.warehouse}`;
}

/**
 * ★★ حكمُ النطاق ‹ق-٣›: **`ok` دائمًا صحيح** — لا يمنع فتحَ جلسةٍ أبدًا.
 * فمن نصّ القرار: «فريقٌ ينتظر إذنًا ليعدّ يتوقّف عن العدّ». وما يُعاد هنا
 * **إعلانٌ يُعرض**: أنّ الكشف بلا نطاق لا يُثبت تغطية، وأنّ ما أُسقط أُسقط.
 */
export function scopeVerdict(scope) {
  const s = scope?.code !== undefined ? scope : normalizeScope(scope);
  const notes = [...(s.notes || [])];
  if (!s.declared) {
    notes.push('جلسةٌ بلا نطاق: تُفتح وتعمل كاملةً — لكنّ كشفها لا يُثبت تغطيةَ مستودعٍ ولا منطقة.');
  }
  return { ok: true, declared: s.declared, notes };
}

/** أسماءُ حقول النطاق على الرأس — مرجعٌ واحدٌ يمنع اختلاف التسمية بين كاتبٍ وقارئ. */
export const SCOPE_FIELDS = Object.freeze([CODE_SEGMENTS[0], CODE_SEGMENTS[1]]);

/**
 * خياراتُ النطاق **من شجرة المواقع القائمة** ‹CAP-202› — لا نصًّا حرًّا.
 *
 * الشجرة مبنيّةٌ ومختبَرةٌ في `buildLocationTree`، وجذورُها هي **المناطق**
 * (`MAIN-A01`) لأنّ كودًا بمقطعٍ واحد ليس موقعًا. فالمستودعات تُشتقّ من
 * المقطع الأوّل لتلك الجذور — ولا يُبنى لها مصدرٌ ثانٍ يفترق عن المواقع.
 *
 * ★ والمؤرشَف يخرج من الاقتراح: لا يُفتح جردٌ على منطقةٍ أُغلقت.
 *
 * @returns {{warehouses:Array<{value,label}>, zones:Array<{value,label}>}}
 *   `zones` مقصورةٌ على المستودع المختار — وبلا اختيارٍ تُعاد فارغة.
 */
export function scopeChoices(locations = [], { warehouse } = {}) {
  const live = (Array.isArray(locations) ? locations : []).filter((l) => l?.status !== 'archived');
  const roots = buildLocationTree(live);
  const wh = segment(warehouse);

  const warehouses = new Map();
  const zones = new Map();
  for (const node of roots) {
    const parts = normalizeLocationCode(node.code).split(SEGMENT_SEPARATOR);
    const w = parts[0];
    const z = parts[1] || '';
    if (!w) continue;
    if (!warehouses.has(w)) warehouses.set(w, { value: w, label: w });
    if (!z || (wh && w !== wh)) continue;
    if (!zones.has(z)) {
      const name = str(node.location?.nameAr);
      zones.set(z, { value: z, label: name ? `${z} — ${name}` : z });
    }
  }
  const sorted = (m) => [...m.values()].sort((a, b) => a.value.localeCompare(b.value));
  return { warehouses: sorted(warehouses), zones: wh ? sorted(zones) : [] };
}
