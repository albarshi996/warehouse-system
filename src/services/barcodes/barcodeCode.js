/**
 * نحو الباركود الموحّد ‹LPN-701› — كلّ مسحةٍ تُعرف من صورتها. منطق خالص.
 *
 * ═══ المشكلة التي يحلّه ═══
 * المستودع بعد اليوم فيه **ثمانية أنواعٍ من الباركود** تُمسح بالجهاز نفسه:
 * الطبلية والموقع ومنطقة التجهيز وباب الاستلام وباب التحميل وبوّابة الخروج
 * والمركبة والشحنة والطرد والصنف. والعامل يمسح **في حقلٍ واحد** — لا يختار
 * النوع قبل المسح، لأنّه لو اختار لأخطأ الاختيار قبل أن يخطئ المسح.
 *
 * فلولا مصنّفٌ واحد لَتكرّرت الحزّورة في كلّ شاشة: «هل هذا موقعٌ أم طبلية؟»
 * تُجاب في شاشة الاستلام بطريقة، وفي شاشة التحميل بأخرى — فيقبل بابٌ ما ترفضه
 * بوّابةٌ، ولا يعرف أحدٌ لماذا.
 *
 * ═══ والمصنّف يقرأ النحوَين القائمين ولا ينسخهما ═══
 * `lpnCode.js` نحوُ الطبلية و`locationCode.js` نحوُ الموقع — كلاهما مبنيٌّ
 * ومختبَر. وهذا الملفّ **يستدعيهما**: نسخُ قاعدةٍ منهما هنا يعني قاعدتين
 * تفترقان أوّلَ تعديل، فيقبل المصنّف كودًا يرفضه المُنشئ.
 *
 * ═══ ولماذا الأنواع الجديدة **مواقعُ** لا كياناتٌ موازية ═══
 * منطقة التجهيز وبابُ التحميل وبوّابةُ الخروج كلُّها **عناوينُ ماديّة في
 * المبنى** تُمسح ويُوضع فيها شيء. فهي مواقعُ بنحو الكود نفسه، تتميّز بمقطعٍ
 * **علامةٍ** (`STG` · `DOCK` · `GATE`). ولو صارت كيانًا ثانيًا لاحتاجت سيّدًا
 * ثانيًا وخريطةً ثانيةً وتقريرًا ثانيًا — وافترقت عن المواقع أوّلَ تغييرٍ في
 * أحدهما (القاعدة نفسها في `stagingLoading.js`).
 *
 * ═══ والتصنيف بالعلامة لا بالموضع ═══
 * النصّ الحاكم كتب `BR-RH-W01-DOCK-OUT-01` و`BR-RH-GATE-OUT-01`: الأولى فيها
 * مستودعٌ والثانية بلا مستودع. فلو صنّفنا **بالموضع** لسقطت الثانية. والعلامة
 * تُقرأ أينما وقعت — فيمرّ الشكلان كلاهما كما كتبهما صاحب الطلب حرفيًّا.
 */

import {
  LPN_PREFIX,
  isValidLpnCode,
  normalizeLpnCode,
  parseLpnCode,
} from '../lpn/lpnCode.js';
import { parseNumber } from '../documents/numberFormat.js';
import {
  SEGMENT_SEPARATOR,
  isValidLocationCode,
  locationCodeProblem,
  normalizeLocationCode,
  parseLocationCode,
} from '../locations/locationCode.js';

/**
 * الفاصل — فاصلُ نحو المواقع والطبالي نفسه، يُعاد تصديره من هنا فتقرأه
 * وحدات الباركود من **مصدرٍ واحد** ولا تكتب `'-'` نثرًا في عشرة مواضع.
 */
export { SEGMENT_SEPARATOR };

/**
 * بادئةٌ مرادفة: النصّ الحاكم كتب المثال `PLT-RH-…` وسمّى الشيء نفسه
 * «Pallet ID / LPN». فالهويّة القانونيّة `LPN` — و`PLT` **تُقبل عند المسح**
 * وتُطبَّع إليها، فلا يقف عاملٌ أمام ملصقٍ طُبع بالبادئة الأخرى (تعارض ③ في
 * وثيقة المطابقة).
 */
export const PALLET_ALIAS_PREFIX = 'PLT';

/** بادئة هويّة المركبة — `VEH-RH-TRK-001`. */
export const VEHICLE_PREFIX = 'VEH';

/** بادئة الشحنة والطرد — `SHP-RH-20260827-000125` و`…-01` للطرد. */
export const SHIPMENT_PREFIX = 'SHP';

/**
 * علاماتُ مواقع الخدمة — مقطعٌ كاملٌ لا جزءٌ من مقطع.
 *
 * ⚠️ `STG` لا `STAGING`: الأخيرة **موقعُ نظامٍ محجوز** في
 * [`ledger/locations.js`](../ledger/locations.js) يحمل رصيد ساحة التجهيز
 * المحاسبيّة. واستعمالها علامةً هنا يخلط الرفَّ المادّيَّ بالحساب.
 */
export const SERVICE_MARKERS = Object.freeze({
  STAGING: 'STG',
  DOCK: 'DOCK',
  GATE: 'GATE',
  IN: 'IN',
  OUT: 'OUT',
});

/**
 * الأنواع التي يعرفها النظام. `id` هو المفتاح في كلّ مكان — والنصّ العربيّ
 * للعرض وحده.
 *
 * `scannable: false` لنوعٍ لا يُمسح بل يُشتقّ (لا شيء اليوم — الحقل محجوزٌ
 * لتوسّعٍ لاحقٍ فلا يُغيَّر شكلُ الجدول حين يأتي).
 */
export const BARCODE_KINDS = Object.freeze({
  PALLET: { id: 'PALLET', labelAr: 'طبلية', example: 'LPN-MAIN-20260827-000001' },
  LOCATION: { id: 'LOCATION', labelAr: 'موقع تخزين', example: 'W01-Z01-A01-R01-L03-B05' },
  STAGING: { id: 'STAGING', labelAr: 'منطقة تجهيز', example: 'W01-STG-Z01' },
  DOCK_IN: { id: 'DOCK_IN', labelAr: 'باب استلام', example: 'W01-DOCK-IN-01' },
  DOCK_OUT: { id: 'DOCK_OUT', labelAr: 'باب تحميل', example: 'W01-DOCK-OUT-01' },
  GATE_OUT: { id: 'GATE_OUT', labelAr: 'بوّابة خروج', example: 'GATE-OUT-01' },
  VEHICLE: { id: 'VEHICLE', labelAr: 'مركبة', example: 'VEH-RH-TRK-001' },
  DOCUMENT: { id: 'DOCUMENT', labelAr: 'مستند', example: 'TRIP-2026-0001' },
  SHIPMENT: { id: 'SHIPMENT', labelAr: 'شحنة', example: 'SHP-RH-20260827-000125' },
  PARCEL: { id: 'PARCEL', labelAr: 'طرد', example: 'SHP-RH-20260827-000125-01' },
  ITEM: { id: 'ITEM', labelAr: 'صنف', example: '6224000123456' },
  UNKNOWN: { id: 'UNKNOWN', labelAr: 'غير معروف', example: '' },
});

/** الأنواع التي هي **مواقعُ ماديّة** — تُمسح وجهةً لحركة. */
export const LOCATION_KINDS = Object.freeze(['LOCATION', 'STAGING', 'DOCK_IN', 'DOCK_OUT', 'GATE_OUT']);

/** أنواع الخدمة وحدها — مواقعُ لا تحمل رصيدًا محاسبيًّا. */
export const SERVICE_KINDS = Object.freeze(['STAGING', 'DOCK_IN', 'DOCK_OUT', 'GATE_OUT']);

/** أرقام عربية-هندية إلى غربية — الملصق والجهاز قد يحملان أيًّا منهما. */
function westernDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

/**
 * الصورة القياسيّة لأيّ مسحة: أرقامٌ غربيّة · حروفٌ كبيرة · بلا فراغات ·
 * الفواصلُ المتكرّرة تُطوى · والطرفيّةُ تُقصّ.
 *
 * ★ ويُقصّ **مِفتاح السطر** الذي يرسله جهاز الباركود (`\n` · `\r` · `\t`)
 * قبل كلّ شيء — وهو أكثر ما يُفسد المقارنة في الميدان: الكود صحيحٌ والمقارنة
 * تفشل لأنّ في آخره سطرًا لا يراه أحد.
 */
export function normalizeScan(raw) {
  if (raw === null || raw === undefined) return '';
  return westernDigits(String(raw))
    .replace(/[\r\n\t]+/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, SEGMENT_SEPARATOR)
    .replace(/-{2,}/g, SEGMENT_SEPARATOR)
    .replace(/^-+|-+$/g, '');
}

/** يبدّل بادئة `PLT-` بـ`LPN-` ولا يمسّ ما سواها. */
function resolveAlias(code) {
  if (code.startsWith(`${PALLET_ALIAS_PREFIX}${SEGMENT_SEPARATOR}`)) {
    return `${LPN_PREFIX}${code.slice(PALLET_ALIAS_PREFIX.length)}`;
  }
  return code;
}

/** هل المقطع علامةُ خدمةٍ ما؟ يُقارن مقطعًا كاملًا لا جزءًا منه. */
function hasSegment(segments, marker) {
  return segments.includes(marker);
}

/**
 * نحو هويّة المركبة: `VEH-<فرع>-<نوع>-<تسلسل>`.
 * أربعةُ مقاطعٍ لا أقلّ — والنوع (`TRK` · `VAN` · `PKP`) يُترك حرًّا لأنّ
 * أنواع الأسطول تكبر، وحصرُها هنا يعني تعديلَ كودٍ لكلّ نوعٍ يُشترى.
 */
const VEHICLE_RE = new RegExp(`^${VEHICLE_PREFIX}-[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[A-Z0-9]{1,12}$`);

/** نحو الشحنة: `SHP-<فرع>-<YYYYMMDD>-<تسلسل ستّ خانات>`. */
const SHIPMENT_RE = new RegExp(`^${SHIPMENT_PREFIX}-[A-Z0-9]{1,12}-\\d{8}-\\d{6}$`);

/** نحو الطرد: الشحنةُ نفسها ولاحقةٌ من رقمين فأكثر. */
const PARCEL_RE = new RegExp(`^${SHIPMENT_PREFIX}-[A-Z0-9]{1,12}-\\d{8}-\\d{6}-\\d{2,3}$`);

/** باركود الصنف التجاريّ: أرقامٌ فقط بطولٍ معقول (EAN-8 حتى GTIN-14 وما بينهما). */
const ITEM_RE = /^\d{6,18}$/;

/**
 * ★★ المصنّف — يقول لأيّ مسحةٍ ما هي.
 *
 * الترتيب **مقصود**: البادئةُ الصريحة أوّلًا (لا تحتمل لبسًا)، ثمّ علامةُ
 * الخدمة، ثمّ الرقمُ التجاريّ، ثمّ نحوُ الموقع آخرًا — لأنّه **الأوسع**:
 * `W01-STG-Z01` كودُ موقعٍ صالحٌ أيضًا، ولو سبق لَابتلع مواقع الخدمة كلَّها
 * وضاع الفرق بين رفٍّ وبابٍ عند التحميل.
 *
 * @returns {{kind:string, code:string, parts:object|null, problem:string}}
 *          `code` الصورةُ القانونيّة (بعد المرادف والتطبيع)، و`problem` سببُ
 *          الجهل بها إن كان النوع `UNKNOWN` — نصٌّ يقول الصورَ المقبولة.
 */
export function classifyScan(raw) {
  const normalized = normalizeScan(raw);
  if (!normalized) {
    return { kind: BARCODE_KINDS.UNKNOWN.id, code: '', parts: null, problem: 'لا مسحة — امسح باركودًا أو اكتب كوده.' };
  }

  const code = resolveAlias(normalized);
  const segments = code.split(SEGMENT_SEPARATOR);

  // ① الطبلية — بادئةٌ صريحة، فخطأُ نحوِها يُقال بلسان نحوِها لا بجهلٍ عامّ.
  if (segments[0] === LPN_PREFIX) {
    if (isValidLpnCode(code)) {
      return { kind: BARCODE_KINDS.PALLET.id, code: normalizeLpnCode(code), parts: parseLpnCode(code), problem: '' };
    }
    return {
      kind: BARCODE_KINDS.UNKNOWN.id,
      code,
      parts: null,
      problem: `«${code}» يبدأ ببادئة الطبلية ولا يطابق نحوها — الصورة: ${BARCODE_KINDS.PALLET.example}`,
    };
  }

  // ② المركبة.
  if (segments[0] === VEHICLE_PREFIX) {
    if (VEHICLE_RE.test(code)) {
      return {
        kind: BARCODE_KINDS.VEHICLE.id,
        code,
        parts: { branch: segments[1], vehicleType: segments[2], seq: segments[3] },
        problem: '',
      };
    }
    return {
      kind: BARCODE_KINDS.UNKNOWN.id,
      code,
      parts: null,
      problem: `«${code}» يبدأ ببادئة المركبة ولا يطابق نحوها — الصورة: ${BARCODE_KINDS.VEHICLE.example}`,
    };
  }

  // ③ الشحنة والطرد — الطردُ أوّلًا لأنّه الأطول، ونحوُ الشحنة بادئةٌ له.
  if (segments[0] === SHIPMENT_PREFIX) {
    if (PARCEL_RE.test(code)) {
      return {
        kind: BARCODE_KINDS.PARCEL.id,
        code,
        parts: { branch: segments[1], date: segments[2], seq: segments[3], parcel: Number(segments[4]) },
        problem: '',
      };
    }
    if (SHIPMENT_RE.test(code)) {
      return {
        kind: BARCODE_KINDS.SHIPMENT.id,
        code,
        parts: { branch: segments[1], date: segments[2], seq: segments[3], parcel: null },
        problem: '',
      };
    }
    return {
      kind: BARCODE_KINDS.UNKNOWN.id,
      code,
      parts: null,
      problem: `«${code}» يبدأ ببادئة الشحنة ولا يطابق نحوها — الصورة: ${BARCODE_KINDS.SHIPMENT.example}`,
    };
  }

  // ④ مواقع الخدمة — بالعلامة أينما وقعت، لا بموضعها.
  const service = serviceKindOf(segments);
  if (service) {
    const problem = locationCodeProblem(code);
    if (problem) return { kind: BARCODE_KINDS.UNKNOWN.id, code, parts: null, problem };
    return { kind: service, code: normalizeLocationCode(code), parts: parseLocationCode(code), problem: '' };
  }

  // ⑤ المستند الرسميّ — `TRIP-2026-0001` · `DN-2026-0044`. النحو مقروءٌ من
  // [`numberFormat.parseNumber`](../documents/numberFormat.js) نفسه لا منسوخًا،
  // فما يُطبع على المستند هو ما يُقرأ من الملصق حرفًا بحرف. والنصّ طلبه:
  // «مسح باركود الرحلة أو أمر التحميل».
  const docNumber = parseNumber(code);
  if (docNumber) {
    return { kind: BARCODE_KINDS.DOCUMENT.id, code, parts: docNumber, problem: '' };
  }

  // ⑥ باركود الصنف التجاريّ — أرقامٌ فقط، فلا يلتبس بكودِ موقعٍ (فيه شرطة).
  if (ITEM_RE.test(code)) {
    return { kind: BARCODE_KINDS.ITEM.id, code, parts: null, problem: '' };
  }

  // ⑦ الموقع — الأوسع، فآخرًا.
  if (isValidLocationCode(code)) {
    return { kind: BARCODE_KINDS.LOCATION.id, code: normalizeLocationCode(code), parts: parseLocationCode(code), problem: '' };
  }

  return {
    kind: BARCODE_KINDS.UNKNOWN.id,
    code,
    parts: null,
    problem: `«${code}» لا يطابق أيّ صورةٍ معروفة — الصور المقبولة: ${Object.values(BARCODE_KINDS)
      .filter((k) => k.example)
      .map((k) => `${k.labelAr} (${k.example})`)
      .join(' · ')}`,
  };
}

/**
 * نوعُ الخدمة من مقاطع الكود — أو `''` إن لم يكن فيها علامة.
 *
 * `DOCK` بلا `IN` ولا `OUT` **لا تُصنَّف بابًا**: بابٌ لا يُعرف اتّجاهه يقبل
 * تحميلًا في باب استلام، وهو الخلط الذي منعه النصّ حرفيًّا.
 */
export function serviceKindOf(segments) {
  const segs = Array.isArray(segments) ? segments : normalizeScan(segments).split(SEGMENT_SEPARATOR);
  if (hasSegment(segs, SERVICE_MARKERS.DOCK)) {
    if (hasSegment(segs, SERVICE_MARKERS.IN)) return BARCODE_KINDS.DOCK_IN.id;
    if (hasSegment(segs, SERVICE_MARKERS.OUT)) return BARCODE_KINDS.DOCK_OUT.id;
    return '';
  }
  if (hasSegment(segs, SERVICE_MARKERS.GATE)) return BARCODE_KINDS.GATE_OUT.id;
  if (hasSegment(segs, SERVICE_MARKERS.STAGING)) return BARCODE_KINDS.STAGING.id;
  return '';
}

/** عنوانُ النوع للعرض — من الجدول لا من نصٍّ حرّ. */
export function kindLabel(kind) {
  return BARCODE_KINDS[kind]?.labelAr ?? BARCODE_KINDS.UNKNOWN.labelAr;
}

/** هل هذه المسحة من الأنواع المتوقَّعة هنا؟ حكمٌ برسالةٍ تقول الصواب. */
export function expectKind(raw, expected) {
  const wanted = Array.isArray(expected) ? expected : [expected];
  const seen = classifyScan(raw);
  if (seen.problem) return { ok: false, message: seen.problem, scan: seen };
  if (wanted.includes(seen.kind)) return { ok: true, message: '', scan: seen };
  return {
    ok: false,
    message: `المطلوب ${wanted.map(kindLabel).join(' أو ')} — والممسوح ${kindLabel(seen.kind)} «${seen.code}».`,
    scan: seen,
  };
}

/** هل الكود موقعٌ ماديّ بأيّ صورةٍ من صوره الخمس؟ */
export function isLocationKind(kind) {
  return LOCATION_KINDS.includes(kind);
}

/** هل هو موقعُ خدمةٍ (لا يحمل رصيدًا محاسبيًّا)؟ */
export function isServiceKind(kind) {
  return SERVICE_KINDS.includes(kind);
}
