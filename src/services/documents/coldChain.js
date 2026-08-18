/**
 * سلسلة التبريد على امتداد الدورة ‹FNB-505› — منطق خالص.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * `CCP1_LIMITS` مبنيّةٌ وتعمل — **عند الاستلام وحده**. وبضاعةٌ سُلّمت باردةً
 * ثمّ بقيت ساعتين على رصيف التجهيز في آب انكسرت سلسلتها ولا أثرَ لذلك في
 * النظام. والخطة تطلبها «على امتداد دورة الإنتاج لا عند الاستلام وحده».
 *
 * ═══ ولماذا نقاطٌ لا حقلُ حرارةٍ واحد ═══
 * الحدّ يختلف بالموضع لا بالصنف وحده: −١٨ في التجميد، و٤ في التبريد،
 * و٦٣ للساخن المحفوظ. ونقطةُ تحكّمٍ بلا حدٍّ خاصٍّ بها تقيس ولا تحكم.
 *
 * ═══ والقياس الغائب ليس خرقًا ═══
 * «لم تُقَس» غير «قِيست فخُرقت»: الأولى نقصُ إجراءٍ يُعلَن، والثانية خرقٌ
 * يفتح استثناءً. ومن ساوى بينهما أغرق الجودة بتنبيهاتٍ لا تدلّ على شيء.
 */
import { CCP1_LIMITS } from './schemas/grn.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

/**
 * أنماط الحفظ وحدودها — **مصدرها `CCP1_LIMITS` القائم** لا أرقامٌ تُكرَّر.
 * `max` سقفٌ لا يُتجاوز؛ و`min` أرضيّةٌ للساخن (يُحفظ فوق ٦٣° لا تحته).
 */
export const TEMP_MODES = Object.freeze({
  chilled: { id: 'chilled', labelAr: 'مبرَّد', max: CCP1_LIMITS.chilled, min: null },
  frozen: { id: 'frozen', labelAr: 'مجمَّد', max: CCP1_LIMITS.frozen, min: null },
  hot: { id: 'hot', labelAr: 'ساخن محفوظ', max: null, min: 63 },
  ambient: { id: 'ambient', labelAr: 'جافّ', max: null, min: null },
});

/**
 * نقاط التحكّم الحرجة على امتداد الدورة ‹FNB-505›.
 * `CCP1` قائمةٌ منذ الاستلام؛ والأربع بعدها امتدادُها بنفس البنية —
 * لا بنيةٌ ثانية، ولا حقلُ حرارةٍ يُخترع لكلّ مستند.
 */
export const CONTROL_POINTS = Object.freeze([
  { id: 'CCP1', labelAr: 'الاستلام', docTypes: ['GRN'], existing: true },
  { id: 'CCP2', labelAr: 'التخزين', docTypes: ['PUTAWAY'], existing: false },
  { id: 'CCP3', labelAr: 'الإنتاج', docTypes: ['MIS', 'PRC'], existing: false },
  { id: 'CCP4', labelAr: 'التعبئة والتجهيز', docTypes: ['PACK'], existing: false },
  { id: 'CCP5', labelAr: 'الشحن', docTypes: ['TRN', 'DN'], existing: false },
]);

/** نقطةٌ بمعرّفها. */
export function controlPoint(id) {
  return CONTROL_POINTS.find((p) => p.id === up(id)) || null;
}

/** نقاط التحكّم التي تسري على نوع مستندٍ ما. */
export function pointsForDoc(docType) {
  const t = up(docType);
  return CONTROL_POINTS.filter((p) => p.docTypes.includes(t));
}

/**
 * حكم قراءةٍ واحدة ‹FNB-505›.
 *
 * @param {{mode:string, celsius:number}} reading
 * @returns {{status:'ok'|'breach'|'unmeasured', problem:string, limit:number|null}}
 */
export function readingVerdict({ mode, celsius } = {}) {
  const spec = TEMP_MODES[str(mode)];
  if (!spec) return { status: 'unmeasured', problem: '', limit: null };
  if (spec.max === null && spec.min === null) return { status: 'ok', problem: '', limit: null };

  // القياس الغائب ليس خرقًا — نقصُ إجراءٍ يُعلَن ولا يفتح استثناء.
  if (!has(celsius)) {
    return { status: 'unmeasured', problem: `لم تُقَس حرارة «${spec.labelAr}» — القياس إجراءٌ ناقص لا خرق.`, limit: spec.max ?? spec.min };
  }

  const t = num(celsius);
  if (spec.max !== null && t > spec.max) {
    return { status: 'breach', problem: `${t}°م تتجاوز حدّ «${spec.labelAr}» ${spec.max}°م`, limit: spec.max };
  }
  if (spec.min !== null && t < spec.min) {
    return { status: 'breach', problem: `${t}°م دون حدّ «${spec.labelAr}» ${spec.min}°م`, limit: spec.min };
  }
  return { status: 'ok', problem: '', limit: spec.max ?? spec.min };
}

/**
 * حكم مستندٍ عند نقطة تحكّم — قراءاتُه بأنماطها.
 *
 * @param {string} docType
 * @param {object[]} readings `{mode, celsius, batch?, sku?}`
 * @returns {{point:string, breaches:object[], unmeasured:object[], ok:boolean}}
 */
export function checkpointVerdict(docType, readings = []) {
  const points = pointsForDoc(docType);
  const point = points[0]?.id || '';
  const breaches = [];
  const unmeasured = [];

  for (const r of Array.isArray(readings) ? readings : []) {
    const v = readingVerdict(r);
    if (v.status === 'breach') breaches.push({ ...r, problem: v.problem, limit: v.limit, point });
    else if (v.status === 'unmeasured' && TEMP_MODES[str(r?.mode)]) unmeasured.push({ ...r, problem: v.problem, point });
  }
  return { point, breaches, unmeasured, ok: breaches.length === 0 };
}

/**
 * استثناءات الخرق — من نوع `qc_reject` القائم بمالكٍ من الجودة.
 * **ولا نوعَ جديد**: خرقُ سلسلةٍ حكمُ جودةٍ على البضاعة لا صنفٌ ثالث من
 * الأعطاب. والقياس الغائب لا يفتح استثناءً — يُعلَن في التحذيرات.
 */
export function coldChainExceptions(docType, readings = [], { docRef = null, location = '' } = {}) {
  const { breaches, point } = checkpointVerdict(docType, readings);
  return breaches.map((b) => ({
    type: 'qc_reject',
    docRef: docRef || undefined,
    sku: up(b.sku),
    qty: num(b.qty),
    location: up(location),
    reason: `خرقُ سلسلة تبريدٍ عند ${controlPoint(point)?.labelAr || point}: ${b.problem}${b.batch ? ` (دفعة ${up(b.batch)})` : ''}`,
  }));
}

/**
 * ★ أيُخصَّص هذا المنتَج لفرعٍ وقد خُرقت سلسلته؟ ‹FNB-505›
 *
 * **لا** — حتّى يقرّر مسؤول الجودة. فبضاعةٌ ذابت ثمّ أُعيد تجميدها تبدو
 * سليمةً على الرفّ ولا تُعرف إلّا من سجلّها. والقرار يُكتب ولا يُفترض.
 *
 * @param {object[]} history قراءات الدفعة عبر النقاط
 * @param {{qcDecision?:string}} [opts] قرارُ الجودة بعد الخرق
 */
export function batchReleaseVerdict(history = [], { qcDecision = '' } = {}) {
  const breaches = (Array.isArray(history) ? history : [])
    .map((r) => ({ r, v: readingVerdict(r) }))
    .filter((x) => x.v.status === 'breach');

  if (!breaches.length) return { ok: true, problem: '', breaches: [] };

  const decision = str(qcDecision).toLowerCase();
  if (decision === 'accepted') return { ok: true, problem: '', breaches: breaches.map((b) => b.r) };
  if (decision === 'rejected') {
    return { ok: false, problem: 'الدفعة مرفوضةٌ بعد خرق سلسلة التبريد — لا تُخصَّص لفرع.', breaches: breaches.map((b) => b.r) };
  }
  return {
    ok: false,
    problem:
      `خُرقت سلسلة التبريد في ${breaches.length} نقطة (${breaches.map((b) => b.v.problem).join(' · ')}) — ` +
      'يلزم قرار جودةٍ مكتوب قبل التخصيص.',
    breaches: breaches.map((b) => b.r),
  };
}
