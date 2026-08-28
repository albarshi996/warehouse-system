/**
 * مواقع الخدمة ‹LPN-705› — تجهيزٌ وبابٌ وبوّابة. منطق خالص.
 *
 * ═══ الفجوة (ف-١٩) ═══
 * منطقة التحضير كانت **رفًّا كأيّ رفّ**: تقبل رصيدًا محاسبيًّا، وتظهر في
 * اقتراح التخزين، ويُحسب إشغالُها كأنّها مكانُ مخزون. وبابُ التحميل كان
 * سجلًّا في `doors` بلا كودٍ يُمسح. فلم يكن للنظام جوابٌ عن سؤالٍ يقع كلّ يوم:
 * «الطلب الذي في منطقة التجهيز الثالثة — أين هو؟»
 *
 * ═══ ★★ والقرار: موقعُ خدمةٍ **نوعٌ من الموقع** لا كيانٌ موازٍ ═══
 * منطقة التجهيز والباب والبوّابة كلُّها **عناوينُ ماديّة في المبنى** تُمسح
 * ويُوضع فيها شيء. فهي مواقعُ بنحو الكود نفسه، ويُميّزها **مقطعُ علامة**.
 * ولو صارت كيانًا ثانيًا لَاحتاجت سيّدًا ثانيًا وخريطةً ثانيةً وتقريرًا ثانيًا
 * (القرار نفسه في `stagingLoading.stagingAssignVerdict`).
 *
 * ═══ ★★ ونوعُ الخدمة **محسوبٌ من الكود** لا حقلٌ يُملأ ═══
 * لأنّ حقلًا يدويًّا بجانب الكود يفترق عنه أوّل تعديل: بابٌ كودُه
 * `W01-DOCK-IN-01` وحقلُه يقول «تحميل» يقبل شاحنةَ شحنٍ في رصيف تنزيل.
 * فالكود هو المصدر، والنوع يُقرأ منه (القاعدة نفسها في `shortLabelOf`).
 *
 * ═══ والصور كما كتبها نصّ الطلب حرفيًّا ═══
 *   منطقة تجهيز   `W01-STG-Z01`        ← يُعرض `BR-RH-W01-STG-Z01`
 *   باب استلام    `W01-DOCK-IN-01`     ← يُعرض `BR-RH-W01-DOCK-IN-01`
 *   باب تحميل     `W01-DOCK-OUT-01`    ← يُعرض `BR-RH-W01-DOCK-OUT-01`
 *   بوّابة خروج    `GATE-OUT-01`        ← يُعرض `BR-RH-GATE-OUT-01`
 *
 * والبوّابة بلا مستودعٍ عمدًا: هي نقطةُ مغادرة **الموقع كلّه** لا مخزنٍ بعينه —
 * وهكذا كتبها النصّ.
 */

import { BARCODE_KINDS, serviceKindOf } from '../barcodes/barcodeCode.js';
import {
  MAX_SEGMENT_LEN,
  SEGMENT_SEPARATOR,
  locationCodeProblem,
  normalizeLocationCode,
} from './locationCode.js';

/**
 * أنواع الخدمة الأربعة.
 *
 * `doorFlow` يجسر إلى `DOOR_FLOWS` في [`fleet/yardModel`](../fleet/yardModel.js)
 * — فسجلُّ الأبواب القائم لا يُنسخ، ويبقى مصدرَ حالة الباب وإشغاله.
 */
export const SERVICE_TYPES = Object.freeze({
  STAGING: Object.freeze({
    id: 'STAGING',
    kind: BARCODE_KINDS.STAGING.id,
    labelAr: 'منطقة تجهيز',
    marker: ['STG'],
    doorFlow: '',
    indexPrefix: 'Z',
    needsWarehouse: true,
    hint: 'يقف فيها الطلب المحضَّر حتى يُحمَّل — ولا تحمل رصيدًا محاسبيًّا.',
  }),
  DOCK_IN: Object.freeze({
    id: 'DOCK_IN',
    kind: BARCODE_KINDS.DOCK_IN.id,
    labelAr: 'باب استلام',
    marker: ['DOCK', 'IN'],
    doorFlow: 'inbound',
    indexPrefix: '',
    needsWarehouse: true,
    hint: 'الرصيف الذي تُنزَّل عنده الشاحنة — توريدٌ أو تحويلٌ أو مرتجع.',
  }),
  DOCK_OUT: Object.freeze({
    id: 'DOCK_OUT',
    kind: BARCODE_KINDS.DOCK_OUT.id,
    labelAr: 'باب تحميل',
    marker: ['DOCK', 'OUT'],
    doorFlow: 'outbound',
    indexPrefix: '',
    needsWarehouse: true,
    hint: 'الرصيف الذي تُحمَّل عنده الشاحنة — ولا يُعدّ الطلب محمَّلًا إلّا بمسحه هنا.',
  }),
  GATE_OUT: Object.freeze({
    id: 'GATE_OUT',
    kind: BARCODE_KINDS.GATE_OUT.id,
    labelAr: 'بوّابة خروج',
    marker: ['GATE', 'OUT'],
    doorFlow: 'outbound',
    indexPrefix: '',
    needsWarehouse: false,
    hint: 'النقطة التي غادرت عندها السيارة الموقع — غيرُ باب التحميل.',
  }),
});

/** ترتيبُ العرض — من الداخل إلى الخارج، كما تمشي البضاعة. */
export const SERVICE_TYPE_ORDER = Object.freeze(['DOCK_IN', 'STAGING', 'DOCK_OUT', 'GATE_OUT']);

/** أقصى رقمٍ يُولَّد دفعةً — حاجزٌ ضدّ غلطةِ رقمٍ تُنشئ ألف باب. */
export const MAX_SERVICE_INDEX = 99;

const up = (v) => String(v ?? '').trim().toUpperCase();
const pad2 = (n) => String(Math.trunc(Number(n))).padStart(2, '0');

/** النوعُ من مُعرّفه — أو `null`. */
export function serviceType(id) {
  return SERVICE_TYPES[up(id)] ?? null;
}

/**
 * ★★ نوعُ الخدمة **مقروءًا من الكود** — أو `null` لموقعٍ عاديّ.
 * يستدعي مصنّف الباركود نفسه، فلا قاعدتان تفترقان.
 */
export function serviceTypeOf(code) {
  const kind = serviceKindOf(normalizeLocationCode(code).split(SEGMENT_SEPARATOR));
  if (!kind) return null;
  return Object.values(SERVICE_TYPES).find((t) => t.kind === kind) ?? null;
}

/** هل هذا الكود موقعُ خدمة؟ */
export function isServiceLocation(code) {
  return serviceTypeOf(code) !== null;
}

/** تدفّقُ الباب (`inbound`/`outbound`) — يجسر إلى `yardModel.DOOR_FLOWS`. */
export function doorFlowOf(code) {
  return serviceTypeOf(code)?.doorFlow ?? '';
}

/**
 * يبني كود موقع خدمة.
 *
 * @param {{warehouse?:string, type:string, index?:number|string}} parts
 * @returns {string} الكود، أو `''` إن تعذّر بناؤه سليمًا
 */
export function buildServiceCode({ warehouse = '', type, index = 1 } = {}) {
  const t = serviceType(type);
  if (!t) return '';
  const wh = up(warehouse);
  if (t.needsWarehouse && !wh) return '';
  if (wh.length > MAX_SEGMENT_LEN) return '';

  const n = Math.trunc(Number(index));
  if (!Number.isFinite(n) || n < 1 || n > MAX_SERVICE_INDEX) return '';

  const tail = `${t.indexPrefix}${pad2(n)}`;
  const code = [t.needsWarehouse ? wh : wh || '', ...t.marker, tail].filter(Boolean).join(SEGMENT_SEPARATOR);
  return locationCodeProblem(code) ? '' : code;
}

/**
 * سببُ رفض كود موقع خدمة — أو `''`.
 *
 * الرسالة تقول **الصورة الصحيحة** لا كلمة «خطأ»: مديرٌ يُنشئ بابًا مرّةً في
 * السنة لا يحفظ النحو، وصورةٌ في الرسالة تُنهي الموقف.
 */
export function serviceCodeProblem(code, expectedType = '') {
  const normalized = normalizeLocationCode(code);
  if (!normalized) return 'كود موقع الخدمة مطلوب.';

  const base = locationCodeProblem(normalized);
  if (base) return base;

  const found = serviceTypeOf(normalized);
  if (!found) {
    return `«${normalized}» ليس موقع خدمة — الصور: ${SERVICE_TYPE_ORDER.map(
      (id) => `${SERVICE_TYPES[id].labelAr} ${buildServiceCode({ warehouse: 'W01', type: id }) || 'GATE-OUT-01'}`
    ).join(' · ')}`;
  }
  if (expectedType) {
    const want = serviceType(expectedType);
    if (want && found.id !== want.id) {
      return `المطلوب ${want.labelAr} والممسوح ${found.labelAr} «${normalized}».`;
    }
  }
  return '';
}

/**
 * ★★ سببُ منع رصيدٍ محاسبيّ في موقع خدمة — أو `''`.
 *
 * ولماذا يُمنع؟ لأنّ منطقة التجهيز والباب **محطّاتُ عبور**: البضاعة فيهما
 * مسحوبةٌ من الرفّ ولم تخرج بعد، ورصيدُها يعيش في مواقع النظام
 * (`STAGING`/`TRANSIT`) التي بُنيت لهذا. وقيدُها هنا يعني **ازدواجَ رصيد**:
 * الصنف على الرفّ وفي الباب معًا.
 *
 * والطبلية تقف فيهما ولا يُقيَّد رصيد — «الطبلية طبقةُ حاوياتٍ فوق الدفتر،
 * والدفتر لا يعرفها» (الحدّ ح-٢ في الخطة الحاكمة).
 */
export function stockPostingProblem(code) {
  const t = serviceTypeOf(code);
  if (!t) return '';
  return `«${normalizeLocationCode(code)}» ${t.labelAr} — محطّةُ عبورٍ لا تحمل رصيدًا محاسبيًّا. ${t.hint}`;
}

/**
 * يولّد مدًى من مواقع الخدمة — من الأوّل إلى الآخِر.
 *
 * @returns {{codes:string[], problem:string}}
 */
export function buildServiceRange({ warehouse = '', type, from = 1, to = 1 } = {}) {
  const t = serviceType(type);
  if (!t) return { codes: [], problem: `نوعٌ غير معروف «${type ?? ''}».` };

  const a = Math.trunc(Number(from));
  const b = Math.trunc(Number(to));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < a) {
    return { codes: [], problem: 'المدى يبدأ من ١ فأكثر وينتهي عنده أو بعده.' };
  }
  if (b > MAX_SERVICE_INDEX) {
    return { codes: [], problem: `المدى لا يتجاوز ${MAX_SERVICE_INDEX} — رقمٌ أكبر غالبًا غلطةُ طباعة.` };
  }

  const codes = [];
  for (let i = a; i <= b; i += 1) {
    const code = buildServiceCode({ warehouse, type, index: i });
    if (!code) return { codes: [], problem: `تعذّر بناء ${t.labelAr} رقم ${i} — راجع المستودع.` };
    codes.push(code);
  }
  return { codes, problem: '' };
}

/**
 * بطاقةُ عرضٍ لموقع خدمة — كلُّ ما تعرضه الشاشة مشتقٌّ هنا.
 * `null` لموقعٍ ليس خدمةً أصلًا.
 */
export function serviceLocationCard(location) {
  const code = normalizeLocationCode(location?.code ?? location);
  const t = serviceTypeOf(code);
  if (!t) return null;
  return {
    code,
    type: t.id,
    kind: t.kind,
    typeLabel: t.labelAr,
    hint: t.hint,
    doorFlow: t.doorFlow,
    acceptsStock: false,
    active: location?.status ? location.status === 'active' : location?.active !== false,
    nameAr: String(location?.nameAr ?? '').trim(),
    warehouse: up(location?.warehouse) || code.split(SEGMENT_SEPARATOR)[0],
  };
}

/** يفرز قائمة مواقع إلى خدمةٍ وتخزين — قسمةٌ واحدةٌ تُستدعى ولا تتكرّر. */
export function splitServiceLocations(locations) {
  const service = [];
  const storage = [];
  for (const loc of locations ?? []) {
    (isServiceLocation(loc?.code ?? loc) ? service : storage).push(loc);
  }
  return { service, storage };
}
